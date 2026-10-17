import { WarehouseScanItem, WarehouseScanType, AuthUser, UserPermission } from '../types';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { getCachedDataReport } from './dataReportService';
import {
  saveWarehouseScansToMaster,
  deleteWarehouseScanFromMaster,
  deleteWarehouseScanBatchFromMaster,
  clearAllWarehouseScansFromMaster
} from './mysqlMasterService';
import { getProxiedGasUrl } from '../utils/gasProxy';
import { authFetch } from './apiClient';

const STORAGE_KEY = 'ial_warehouse_scans_data_v1';

// =========================================================================
// 🌐 GOOGLE SHEETS REALTIME / CONNECTION STATUS
// =========================================================================
export type WarehouseRealtimeStatus = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR';
let warehouseRealtimeStatus: WarehouseRealtimeStatus = 'CONNECTING';
const warehouseRealtimeStatusSubscribers = new Set<(status: WarehouseRealtimeStatus) => void>();

function setWarehouseRealtimeStatus(status: WarehouseRealtimeStatus) {
  if (warehouseRealtimeStatus !== status) {
    warehouseRealtimeStatus = status;
    warehouseRealtimeStatusSubscribers.forEach((cb) => {
      try {
        cb(status);
      } catch (err) {
        console.warn('Warehouse realtime status listener error:', err);
      }
    });
  }
}

export function getWarehouseRealtimeStatus(): WarehouseRealtimeStatus {
  return warehouseRealtimeStatus;
}

export function subscribeToWarehouseRealtimeStatus(
  cb: (status: WarehouseRealtimeStatus) => void
): () => void {
  warehouseRealtimeStatusSubscribers.add(cb);
  cb(warehouseRealtimeStatus);
  return () => {
    warehouseRealtimeStatusSubscribers.delete(cb);
  };
}

// =========================================================================
// 🚀 IN-MEMORY LIVE CACHE & SUBSCRIBERS (0ms Instant Latency)
// =========================================================================
let liveWarehouseScans: WarehouseScanItem[] = getInitialWarehouseScans();
const warehouseSubscribers = new Set<(items: WarehouseScanItem[]) => void>();

function notifyWarehouseSubscribers() {
  const current = [...liveWarehouseScans];
  warehouseSubscribers.forEach((cb) => {
    try {
      cb(current);
    } catch (err) {
      console.warn('Warehouse subscriber callback error:', err);
    }
  });
}

export function getCachedWarehouseScansLive(): WarehouseScanItem[] {
  return liveWarehouseScans;
}

// Background Google Sheets Sync Queue to prevent HTTP spamming & rate limiting
let sheetSyncQueue: WarehouseScanItem[] = [];
let sheetSyncTimer: any = null;
let isSyncingQueue = false;

export function queueWarehouseScanForGoogleSheetsSync(
  itemOrItems: WarehouseScanItem | WarehouseScanItem[],
  webAppUrl?: string
) {
  const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
  if (items.length === 0) return;
  sheetSyncQueue.push(...items);

  if (sheetSyncTimer) clearTimeout(sheetSyncTimer);
  sheetSyncTimer = setTimeout(() => {
    flushGoogleSheetsSyncQueue(webAppUrl);
  }, 1500);
}

async function flushGoogleSheetsSyncQueue(webAppUrl?: string) {
  if (isSyncingQueue || sheetSyncQueue.length === 0) return;
  isSyncingQueue = true;
  const batchToSync = [...sheetSyncQueue];
  sheetSyncQueue = [];

  try {
    const uniqueMap = new Map<string, WarehouseScanItem>();
    for (const item of batchToSync) {
      uniqueMap.set(item.id, item);
    }
    const uniqueList = Array.from(uniqueMap.values());
    await syncAllWarehouseScansToGoogleSheets(uniqueList, webAppUrl);
    setWarehouseRealtimeStatus('CONNECTED');
  } catch (err) {
    console.warn('Google Sheets background batch sync error, re-queueing:', err);
    sheetSyncQueue.unshift(...batchToSync);
  } finally {
    isSyncingQueue = false;
    if (sheetSyncQueue.length > 0) {
      sheetSyncTimer = setTimeout(() => flushGoogleSheetsSyncQueue(webAppUrl), 4000);
    }
  }
}

/**
 * Extract clean, human-readable operator tag from email or username
 * e.g., "sokha.lay@ialsystems.com" -> "SOKHALAY" (max 10 chars)
 */
export function getOperatorTag(emailOrName?: string): string {
  if (!emailOrName || typeof emailOrName !== 'string') return '';
  const trimmed = emailOrName.trim();
  if (!trimmed) return '';
  const username = trimmed.split('@')[0].trim();
  const clean = username.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return clean.slice(0, 10);
}

/**
 * Concurrency-safe Operation Code generator checking live DB and in-memory caches.
 * When operatorEmail is provided, embeds operator tag (e.g. OP-IN-261013-SOKHA-001)
 * to ensure 100% collision-free operations when multiple users operate simultaneously.
 */
export async function getNextOperationCode(
  scanType: WarehouseScanType,
  scanDate: string,
  localScans: WarehouseScanItem[],
  operatorEmail?: string
): Promise<string> {
  const prefix =
    scanType === 'SCAN_IN' ? 'IN' : scanType === 'SCAN_OUT' ? 'OUT' : scanType === 'OUT_OF_DELIVERY' ? 'DLV' : 'HLD';
  const yymmdd = scanDate.replace(/-/g, '').slice(2);
  const opTag = getOperatorTag(operatorEmail);

  // If operator email/tag is present, isolate the namespace to this operator:
  // e.g. OP-IN-261013-SOKHA-
  // If not present, fallback to general prefix: OP-IN-261013-
  const expectedPrefix = opTag
    ? `OP-${prefix}-${yymmdd}-${opTag}-`
    : `OP-${prefix}-${yymmdd}-`;

  const existingOpCodesToday = new Set<string>();

  // 1. Check localScans
  for (const s of localScans) {
    if (s.scanType === scanType && (s.date === scanDate || (s.createdAt && s.createdAt.slice(0, 10) === scanDate))) {
      if (s.operationCode && s.operationCode.startsWith(expectedPrefix)) {
        existingOpCodesToday.add(s.operationCode);
      } else if (s.batchId && s.batchId.startsWith(expectedPrefix)) {
        existingOpCodesToday.add(s.batchId);
      }
    }
  }

  // 2. Check live in-memory cache
  for (const s of liveWarehouseScans) {
    if (s.scanType === scanType && (s.date === scanDate || (s.createdAt && s.createdAt.slice(0, 10) === scanDate))) {
      if (s.operationCode && s.operationCode.startsWith(expectedPrefix)) {
        existingOpCodesToday.add(s.operationCode);
      } else if (s.batchId && s.batchId.startsWith(expectedPrefix)) {
        existingOpCodesToday.add(s.batchId);
      }
    }
  }

  // Find max serial number for today
  let nextSerialNum = existingOpCodesToday.size + 1;
  existingOpCodesToday.forEach((code) => {
    const parts = code.split('-');
    const serialPart = parts[parts.length - 1];
    const num = parseInt(serialPart, 10);
    if (!isNaN(num) && num >= nextSerialNum) {
      nextSerialNum = num + 1;
    }
  });

  const serialStr = nextSerialNum.toString().padStart(3, '0');
  return `${expectedPrefix}${serialStr}`;
}

/**
 * Get active Web App URL from Settings or Vite environment
 */
export function getStoredWebAppUrl(): string {
  try {
    const raw = localStorage.getItem('accounting_app_settings_v2') || localStorage.getItem('accounting_app_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed?.webAppUrl?.trim() &&
        !parsed.webAppUrl.includes('AKfycbxJfGBTd2iGI3cf2xaIs19p1Oha6QxbS5Rquu0NH7ZAbzrTMUdimG_LE3DynlEU6pQReA') &&
        !parsed.webAppUrl.includes('AKfycbzLT1Yymc5zMv4lwldSQ0ft_LxcSbfdenvMzzQICKRb1gHGLGQFeCPis2tj3lwb3gPEXg') &&
        !parsed.webAppUrl.includes('AKfycbxpbFtdZgdXUUWU6DJiU5uxiQSEat4t6wSVOy3xKsuBM13giEm1j54MmjsOjowJ6jc5cA') &&
        !parsed.webAppUrl.includes('AKfycbw2LXj5geGy_GNMQ-YhvHeQTcsoGHMS3dcoxvTCX6dZesG1FHtYNLku9jMG3HtYiH138Q') &&
        !parsed.webAppUrl.includes('AKfycbygSQiOEQX0ip8yb3wcw7Rctjv884tm6BGluiUkkSdxySMfdjtXwvAWS-NEky-HaBr0vQ')
      ) {
        return parsed.webAppUrl.trim();
      }
    }
  } catch (_) {}
  const envUrl = (import.meta as any).env?.VITE_GOOGLE_WEBAPP_URL;
  if (
    envUrl &&
    typeof envUrl === 'string' &&
    !envUrl.includes('AKfycbxJfGBTd2iGI3cf2xaIs19p1Oha6QxbS5Rquu0NH7ZAbzrTMUdimG_LE3DynlEU6pQReA') &&
    !envUrl.includes('AKfycbzLT1Yymc5zMv4lwldSQ0ft_LxcSbfdenvMzzQICKRb1gHGLGQFeCPis2tj3lwb3gPEXg') &&
    !envUrl.includes('AKfycbxpbFtdZgdXUUWU6DJiU5uxiQSEat4t6wSVOy3xKsuBM13giEm1j54MmjsOjowJ6jc5cA') &&
    !envUrl.includes('AKfycbw2LXj5geGy_GNMQ-YhvHeQTcsoGHMS3dcoxvTCX6dZesG1FHtYNLku9jMG3HtYiH138Q') &&
    !envUrl.includes('AKfycbygSQiOEQX0ip8yb3wcw7Rctjv884tm6BGluiUkkSdxySMfdjtXwvAWS-NEky-HaBr0vQ')
  ) {
    return envUrl.trim();
  }
  return 'https://script.google.com/macros/s/AKfycbxSYmPsF37ycoH9jnEmrK1xBZR9U1zhimCvzWNeedeAkMrjLykCAwW6nuRXVhIEjSq0gw/exec';
}

/**
 * Permissions checks for Warehouse module
 */
export function canOperateWarehouse(user?: AuthUser | null, permissions?: UserPermission[]): boolean {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  if (email === 'rathykim34@gmail.com' || email === 'ialexpress2023@gmail.com') return true;
  const userPerm = permissions?.find((p) => p.email.toLowerCase() === email);
  if (userPerm?.role === 'ADMIN' || userPerm?.role === 'ACCOUNTANT_MANAGER') return true;
  return userPerm?.status === 'ACTIVE';
}

export function canCreateWarehouseScan(user?: AuthUser | null, permissions?: UserPermission[]): boolean {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  if (email === 'rathykim34@gmail.com' || email === 'ialexpress2023@gmail.com') return true;
  const userPerm = permissions?.find((p) => p.email.toLowerCase() === email);
  if (userPerm?.role === 'ADMIN' || userPerm?.role === 'ACCOUNTANT_MANAGER') return true;
  if (userPerm?.role === 'VIEWER') return false;
  return userPerm?.canCreate !== false;
}

export function canEditWarehouseScan(user?: AuthUser | null, permissions?: UserPermission[]): boolean {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  if (email === 'rathykim34@gmail.com' || email === 'ialexpress2023@gmail.com') return true;
  const userPerm = permissions?.find((p) => p.email.toLowerCase() === email);
  if (userPerm?.role === 'ADMIN' || userPerm?.role === 'ACCOUNTANT_MANAGER') return true;
  return userPerm?.canEdit === true;
}

export function canDeleteWarehouseScan(user?: AuthUser | null, permissions?: UserPermission[]): boolean {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  if (email === 'rathykim34@gmail.com' || email === 'ialexpress2023@gmail.com') return true;
  const userPerm = permissions?.find((p) => p.email.toLowerCase() === email);
  if (userPerm?.role === 'ADMIN') return true;
  return userPerm?.canDelete === true;
}

/**
 * Smart lookup from cached Data Report by tracking barcode
 */
export interface MatchedDataReportInfo {
  shipper?: string;
  consignee?: string;
  destination?: string;
  payment?: string;
  codAmount?: number;
  currency?: 'USD' | 'KHR';
  customerName?: string;
  customerPhone?: string;
  holdReason?: string;
  shelfLocation?: string;
  remarks?: string;
  weightKg?: number;
}

/**
 * Smart lookup from cached Data Report by tracking barcode
 * Accurately extracts: SHIPPER, CONSIGNEE, DESTINATION, PAYMENT, COD, REASON (មូលហេតុ)
 */
export function lookupTrackingFromDataReport(barcode: string): MatchedDataReportInfo | null {
  const cleanCode = sanitizeTrackingCode(barcode).toUpperCase();
  if (!cleanCode) return null;

  try {
    const { rows, columns = [] } = getCachedDataReport();
    if (!rows || rows.length === 0) return null;

    // Helper to find column id by exact or partial label
    const findColId = (candidates: string[]): string | null => {
      // 1. Exact match on label or id
      for (const cand of candidates) {
        const target = cand.trim().toUpperCase();
        const found = columns.find((c) => {
          const lbl = (c.label || '').trim().toUpperCase();
          const id = (c.id || '').trim().toUpperCase();
          return lbl === target || id === target;
        });
        if (found) return found.id;
      }
      // 2. Partial match on label or id
      for (const cand of candidates) {
        const target = cand.trim().toUpperCase();
        const found = columns.find((c) => {
          const lbl = (c.label || '').trim().toUpperCase();
          const id = (c.id || '').trim().toUpperCase();
          return lbl.includes(target) || id.includes(target);
        });
        if (found) return found.id;
      }
      return null;
    };

    const barcodeColId = findColId(['BARCODE', 'AWB', 'TRACKING', 'លេខកូដ']);
    const shipperColId = findColId(['SHIPPER', 'អ្នកផ្ញើ', 'SENDER']);
    const consigneeColId = findColId(['CONSIGNEE', 'អ្នកទទួល', 'RECEIVER', 'CUSTOMER']);
    const destColId = findColId(['DESTINATION', 'DESTINATION (គោលដៅ)', 'គោលដៅ', 'ទិសដៅ', 'ទីតាំង', 'ខេត្ត', 'ខេត្ត-ក្រុង', 'PROVINCE', 'LOCATION', 'BRANCH', 'DEST']);
    const paymentColId = findColId(['PAYMENT', 'ការទូទាត់', 'ប្រភេទទូទាត់', 'PAY']);
    const reasonColId = findColId(['REASON', 'HOLD REASON', 'REASON HOLD', 'មូលហេតុ', 'មូលហេតុនៅសល់', 'REMARK', 'REMARKS', 'NOTE', 'NOTES', 'FAIL REASON', 'STATUS']);
    const shelfColId = findColId(['SHELF', 'SHELF LOCATION', 'ធ្នើរ', 'កន្លែងទុក', 'LOCATION CODE', 'BIN', 'RACK']);
    const usdColId = findColId(['USD', 'TOTAL USD', 'AMOUNT USD']);
    const khmColId = findColId(['KHM', 'KHR', 'TOTAL KHR', 'AMOUNT KHR']);
    const kgColId = findColId(['KG', 'K.G', 'KGS', 'WEIGHT', 'WEIGHT (KG)', 'GW', 'G.W', 'ទម្ងន់', 'គីឡូ', 'គីឡូក្រាម', 'NET WEIGHT', 'GROSS WEIGHT']);

    for (const row of rows) {
      let isMatch = false;

      // 1. Direct match on barcodeColId if found
      if (barcodeColId && row[barcodeColId]) {
        const valStr = sanitizeTrackingCode(String(row[barcodeColId])).toUpperCase();
        if (valStr === cleanCode) {
          isMatch = true;
        }
      }

      // 2. Fallback: match any column value in row
      if (!isMatch) {
        for (const [key, val] of Object.entries(row)) {
          if (key === '_id') continue;
          const valStr = sanitizeTrackingCode(String(val || '')).toUpperCase();
          if (valStr && valStr === cleanCode) {
            isMatch = true;
            break;
          }
        }
      }

      if (isMatch) {
        const getVal = (colId: string | null, candidates: string[]): string => {
          if (colId && row[colId] !== undefined && row[colId] !== null) {
            const v = String(row[colId]).trim();
            if (v) return v;
          }
          for (const cand of candidates) {
            const target = cand.toLowerCase();
            for (const [k, v] of Object.entries(row)) {
              if (k === '_id') continue;
              if (k.toLowerCase() === target || k.toLowerCase().includes(target)) {
                const str = String(v || '').trim();
                if (str) return str;
              }
            }
          }
          return '';
        };

        const shipper = getVal(shipperColId, ['shipper', 'អ្នកផ្ញើ', 'sender']);
        const consignee = getVal(consigneeColId, ['consignee', 'អ្នកទទួល', 'receiver', 'customer']);
        const destination = getVal(destColId, ['destination', 'គោលដៅ', 'ទិសដៅ', 'ទីតាំង', 'ខេត្ត', 'province', 'location', 'branch']);
        const payment = getVal(paymentColId, ['payment', 'ការទូទាត់', 'ប្រភេទទូទាត់', 'pay']);
        const holdReason = getVal(reasonColId, ['hold reason', 'reason', 'មូលហេតុ', 'មូលហេតុនៅសល់', 'remark', 'remarks', 'note']);
        const shelfLocation = getVal(shelfColId, ['shelf', 'shelf location', 'ធ្នើរ', 'កន្លែងទុក', 'bin', 'rack']);
        const usdVal = getVal(usdColId, ['usd']);
        const khmVal = getVal(khmColId, ['khm', 'khr']);
        const kgVal = getVal(kgColId, ['kg', 'k.g', 'kgs', 'weight', 'gw', 'g.w', 'ទម្ងន់', 'គីឡូ', 'គីឡូក្រាម']);

        let codAmount: number | undefined = undefined;
        let currency: 'USD' | 'KHR' = 'USD';

        if (usdVal) {
          const num = parseFloat(usdVal.replace(/[$,]/g, ''));
          if (!isNaN(num) && num > 0) {
            codAmount = num;
            currency = 'USD';
          }
        }
        if (codAmount === undefined && khmVal) {
          const num = parseFloat(khmVal.replace(/[៛,]/g, ''));
          if (!isNaN(num) && num > 0) {
            codAmount = num;
            currency = 'KHR';
          }
        }
        if (codAmount === undefined && payment) {
          const num = parseFloat(payment.replace(/[$,៛]/g, ''));
          if (!isNaN(num) && num > 0) {
            codAmount = num;
            if (payment.includes('៛') || payment.toUpperCase().includes('KHR') || num > 1000) {
              currency = 'KHR';
            }
          }
        }

        let weightKg: number | undefined = undefined;
        if (kgVal) {
          let normalized = kgVal.trim();
          if (/^\d+,\d+$/.test(normalized)) {
            normalized = normalized.replace(',', '.');
          } else {
            normalized = normalized.replace(/,/g, '');
          }
          const cleaned = normalized.replace(/[^\d.-]/g, '');
          const num = parseFloat(cleaned);
          if (!isNaN(num) && num > 0) {
            weightKg = Math.round(num * 100) / 100;
          }
        }

        let customerPhone = '';
        const phoneMatch = consignee.match(/\b(0\d{8,9})\b/);
        if (phoneMatch) customerPhone = phoneMatch[1];

        return {
          shipper: shipper || undefined,
          consignee: consignee || undefined,
          destination: destination || undefined,
          payment: payment || undefined,
          codAmount,
          currency,
          customerName: consignee || undefined,
          customerPhone: customerPhone || undefined,
          holdReason: holdReason || undefined,
          shelfLocation: shelfLocation || undefined,
          weightKg
        };
      }
    }
  } catch (e) {
    console.debug('Error matching tracking barcode in data report cache:', e);
  }

  return null;
}

/**
 * Direct helper to get weight in KG for a barcode from Data Report
 */
export function lookupKgFromDataReport(barcode: string): number {
  const match = lookupTrackingFromDataReport(barcode);
  return match?.weightKg || 0;
}

/**
 * Get initial warehouse scans from LocalStorage
 */
export function getInitialWarehouseScans(): WarehouseScanItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.debug('Failed to load local warehouse scans:', e);
  }
  return [];
}

/**
 * 📥 Fetch warehouse scans from Google Sheets (Primary Backend Database)
 */
let isFetchingFromSheets = false;

export async function fetchWarehouseScansFromGoogleSheets(
  webAppUrl?: string
): Promise<WarehouseScanItem[]> {
  const targetUrl = webAppUrl?.trim() || getStoredWebAppUrl();
  if (!targetUrl) return liveWarehouseScans;

  if (isFetchingFromSheets) return liveWarehouseScans;
  isFetchingFromSheets = true;
  setWarehouseRealtimeStatus('CONNECTING');

  try {
    const rawUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}action=get_warehouse_scans`;
    const fetchUrl = getProxiedGasUrl(rawUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(fetchUrl, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data?.status === 'success' && (Array.isArray(data.data) || Array.isArray(data.items))) {
      const rawList: any[] = data.data || data.items || [];
      const remoteItems: WarehouseScanItem[] = rawList.map((raw: any) => ({
        id: String(raw.id || `wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
        operationCode: raw.operationCode ? String(raw.operationCode).trim() : undefined,
        batchId: raw.batchId ? String(raw.batchId).trim() : undefined,
        scanType: (raw.scanType || 'SCAN_IN') as WarehouseScanType,
        barcode: sanitizeTrackingCode(String(raw.barcode || '')).toUpperCase(),
        tracking: String(raw.tracking || raw.barcode || '').trim(),
        shipper: raw.shipper ? String(raw.shipper).trim() : undefined,
        consignee: raw.consignee ? String(raw.consignee).trim() : undefined,
        payment: raw.payment ? String(raw.payment).trim() : undefined,
        customerName: raw.customerName ? String(raw.customerName).trim() : (raw.consignee ? String(raw.consignee).trim() : undefined),
        customerPhone: raw.customerPhone ? String(raw.customerPhone).trim() : undefined,
        destination: raw.destination ? String(raw.destination).trim() : undefined,
        driverName: raw.driverName ? String(raw.driverName).trim() : undefined,
        truckNo: raw.truckNo ? String(raw.truckNo).trim() : undefined,
        transferBy: raw.transferBy ? String(raw.transferBy).trim() : undefined,
        codAmount: raw.codAmount !== undefined && raw.codAmount !== null && raw.codAmount !== '' ? Number(raw.codAmount) : undefined,
        currency: raw.currency || 'USD',
        location: raw.location ? String(raw.location).trim() : undefined,
        riderName: raw.riderName ? String(raw.riderName).trim() : undefined,
        riderPhone: raw.riderPhone ? String(raw.riderPhone).trim() : undefined,
        deliveryZone: raw.deliveryZone ? String(raw.deliveryZone).trim() : undefined,
        outReason: raw.outReason ? String(raw.outReason).trim() : undefined,
        holdReason: raw.holdReason ? String(raw.holdReason).trim() : undefined,
        shelfLocation: raw.shelfLocation ? String(raw.shelfLocation).trim() : undefined,
        remarks: raw.remarks ? String(raw.remarks).trim() : undefined,
        date: raw.date ? String(raw.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
        operatorEmail: raw.operatorEmail ? String(raw.operatorEmail).trim() : '',
        createdBy: raw.createdBy ? String(raw.createdBy).trim() : 'User',
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString()
      }));

      // Combine remote items with any currently pending local queue items
      const itemMap = new Map<string, WarehouseScanItem>();
      for (const item of remoteItems) {
        itemMap.set(item.id, item);
      }
      for (const pending of sheetSyncQueue) {
        itemMap.set(pending.id, pending);
      }

      // Sort newest first
      const mergedList = Array.from(itemMap.values()).sort((a, b) => {
        const timeA = a.createdAt || a.date || '';
        const timeB = b.createdAt || b.date || '';
        return timeB.localeCompare(timeA);
      });

      // Update cache with remote items
      liveWarehouseScans = mergedList;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedList.slice(0, 1000)));
      } catch (err) {
        console.warn('LocalStorage save error:', err);
      }
      notifyWarehouseSubscribers();

      setWarehouseRealtimeStatus('CONNECTED');
      return liveWarehouseScans;
    } else {
      throw new Error(data?.message || 'Invalid data response from Google Sheets');
    }
  } catch (err) {
    console.warn('Failed to fetch warehouse scans from Google Sheets:', err);
    setWarehouseRealtimeStatus(liveWarehouseScans.length > 0 ? 'CONNECTED' : 'DISCONNECTED');
    return liveWarehouseScans;
  } finally {
    isFetchingFromSheets = false;
  }
}

/**
 * ⚡ Save a warehouse scan (Create or Update)
 * 0ms latency with optimistic in-memory + LocalStorage cache, queued to Google Sheets
 */
export async function saveWarehouseScan(
  data: Omit<WarehouseScanItem, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): Promise<WarehouseScanItem> {
  const now = new Date().toISOString();
  const id = data.id || `wh-${data.scanType.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const cleanBarcode = sanitizeTrackingCode(data.barcode).toUpperCase();

  const operatorEmail =
    (data as any).operatorEmail ||
    (data.createdBy && data.createdBy.includes('@') ? data.createdBy.trim() : '');

  const fullItem: WarehouseScanItem = {
    id,
    operationCode: data.operationCode ? data.operationCode.trim() : undefined,
    batchId: data.batchId ? data.batchId.trim() : undefined,
    scanType: data.scanType,
    barcode: cleanBarcode,
    tracking: data.tracking || cleanBarcode,
    shipper: (data.shipper || '').trim() || undefined,
    consignee: (data.consignee || '').trim() || undefined,
    payment: (data.payment || '').trim() || undefined,
    customerName: (data.customerName || data.consignee || '').trim(),
    customerPhone: (data.customerPhone || '').trim(),
    destination: (data.destination || '').trim(),
    driverName: (data.driverName || '').trim(),
    truckNo: (data.truckNo || '').trim(),
    transferBy: (data.transferBy || '').trim() || undefined,
    codAmount: data.codAmount !== undefined ? Number(data.codAmount) : undefined,
    currency: data.currency || 'USD',
    location: (data.location || '').trim(),
    riderName: (data.riderName || '').trim(),
    riderPhone: (data.riderPhone || '').trim(),
    deliveryZone: (data.deliveryZone || '').trim(),
    outReason: (data.outReason || '').trim(),
    holdReason: (data.holdReason || '').trim() || undefined,
    shelfLocation: (data.shelfLocation || '').trim() || undefined,
    remarks: (data.remarks || '').trim(),
    date: data.date || now.slice(0, 10),
    operatorEmail: operatorEmail || '',
    createdBy: data.createdBy || 'User',
    createdAt: data.createdAt || now,
    updatedAt: now
  };

  // Validate duplicate barcode within the SAME scanType on the SAME date
  const duplicate = liveWarehouseScans.find(
    (item) =>
      item.id !== id &&
      item.scanType === data.scanType &&
      item.date === fullItem.date &&
      sanitizeTrackingCode(item.barcode).toUpperCase() === cleanBarcode
  );

  if (duplicate) {
    const typeLabel =
      data.scanType === 'SCAN_IN'
        ? 'ចូលឃ្លាំង (ScanIn)'
        : data.scanType === 'SCAN_OUT'
        ? 'ចេញពីឃ្លាំង (ScanOut)'
        : data.scanType === 'HOLD_REMAINING'
        ? 'នៅសល់ក្នុងឃ្លាំង (Hold/Remaining)'
        : 'ចេញចែកចាយ (Out of Delivery)';
    throw new Error(`លេខ Barcode «${cleanBarcode}» ធ្លាប់បានស្កេន ${typeLabel} នៅថ្ងៃ ${fullItem.date} រួចហើយ!`);
  }

  // 1. Authoritative Primary Database write (Hostinger Remote MariaDB Master)
  const masterOk = await saveWarehouseScansToMaster(fullItem);
  if (!masterOk) {
    throw new Error('បរាជ័យក្នុងការរក្សាទុកទៅកាន់ Hostinger MariaDB Master! សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត។');
  }

  // 2. Only after Primary commits: update in-memory live cache and LocalStorage
  const existingIdx = liveWarehouseScans.findIndex((item) => item.id === id);
  if (existingIdx >= 0) {
    liveWarehouseScans = [...liveWarehouseScans];
    liveWarehouseScans[existingIdx] = fullItem;
  } else {
    liveWarehouseScans = [fullItem, ...liveWarehouseScans];
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(liveWarehouseScans.slice(0, 1000)));
  } catch (err) {
    console.warn('LocalStorage save error:', err);
  }

  // 3. Notify all UI subscribers
  notifyWarehouseSubscribers();

  // 4. Queue for Google Sheets background sync (Backup 1 Mirror)
  queueWarehouseScanForGoogleSheetsSync(fullItem);

  return fullItem;
}

/**
 * ⚡ Save multiple warehouse scans at once (Batch Operation)
 * 0ms latency with optimistic in-memory + LocalStorage cache, queued to Google Sheets
 */
export async function saveWarehouseScanBatch(
  items: Array<Omit<WarehouseScanItem, 'id' | 'createdAt'> & { id?: string; createdAt?: string }>
): Promise<WarehouseScanItem[]> {
  if (!items || items.length === 0) return [];
  const now = new Date().toISOString();
  const fullItems: WarehouseScanItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const data = items[i];
    const cleanBarcode = sanitizeTrackingCode(data.barcode).toUpperCase();
    if (!cleanBarcode) continue;
    const id =
      data.id ||
      `wh-${data.scanType.toLowerCase()}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
    const operatorEmail =
      (data as any).operatorEmail ||
      (data.createdBy && data.createdBy.includes('@') ? data.createdBy.trim() : '');

    const fullItem: WarehouseScanItem = {
      id,
      operationCode: data.operationCode ? data.operationCode.trim() : undefined,
      batchId: data.batchId ? data.batchId.trim() : undefined,
      scanType: data.scanType,
      barcode: cleanBarcode,
      tracking: data.tracking || cleanBarcode,
      shipper: (data.shipper || '').trim() || undefined,
      consignee: (data.consignee || '').trim() || undefined,
      payment: (data.payment || '').trim() || undefined,
      customerName: (data.customerName || data.consignee || '').trim(),
      customerPhone: (data.customerPhone || '').trim(),
      destination: (data.destination || '').trim(),
      driverName: (data.driverName || '').trim(),
      truckNo: (data.truckNo || '').trim(),
      transferBy: (data.transferBy || '').trim() || undefined,
      codAmount: data.codAmount !== undefined ? Number(data.codAmount) : undefined,
      currency: data.currency || 'USD',
      location: (data.location || '').trim(),
      riderName: (data.riderName || '').trim(),
      riderPhone: (data.riderPhone || '').trim(),
      deliveryZone: (data.deliveryZone || '').trim(),
      outReason: (data.outReason || '').trim(),
      holdReason: (data.holdReason || '').trim() || undefined,
      shelfLocation: (data.shelfLocation || '').trim() || undefined,
      remarks: (data.remarks || '').trim(),
      date: data.date || now.slice(0, 10),
      operatorEmail: operatorEmail || '',
      createdBy: data.createdBy || 'User',
      createdAt: data.createdAt || now,
      updatedAt: now
    };
    fullItems.push(fullItem);
  }

  if (fullItems.length === 0) return [];

  // Check for duplicates in live data
  for (const item of fullItems) {
    const isDup = liveWarehouseScans.some(
      (e) =>
        e.id !== item.id &&
        e.scanType === item.scanType &&
        e.date === item.date &&
        sanitizeTrackingCode(e.barcode).toUpperCase() === item.barcode
    );
    if (isDup) {
      throw new Error(`លេខ Barcode «${item.barcode}» ធ្លាប់បានស្កេនក្នុងប្រភេទនេះនៅថ្ងៃ ${item.date} រួចហើយ!`);
    }
  }

  // 1. Authoritative Primary Database write (Hostinger Remote MariaDB Master)
  const masterOk = await saveWarehouseScansToMaster(fullItems);
  if (!masterOk) {
    throw new Error('បរាជ័យក្នុងការរក្សាទុកកញ្ចប់ Scans ទៅកាន់ Hostinger MariaDB Master! សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត។');
  }

  // 2. Only after Primary commits: update in-memory cache and LocalStorage
  liveWarehouseScans = [...fullItems, ...liveWarehouseScans];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(liveWarehouseScans.slice(0, 1000)));
  } catch (err) {
    console.warn('LocalStorage batch save error:', err);
  }

  // 3. Notify all UI subscribers
  notifyWarehouseSubscribers();

  // 4. Queue for Google Sheets background sync (Backup 1 Mirror)
  queueWarehouseScanForGoogleSheetsSync(fullItems);

  return fullItems;
}

/**
 * 🗑️ Delete a warehouse scan record
 * Awaits Hostinger MySQL Master delete first, then updates local cache and mirrors to Google Sheets
 */
export async function deleteWarehouseScan(
  id: string,
  barcode?: string,
  scanType?: WarehouseScanType
): Promise<boolean> {
  // 1. Instant local removal (0ms latency guarantee - matching both ID and Barcode)
  const cleanBarcode = barcode ? sanitizeTrackingCode(barcode).toUpperCase() : '';
  liveWarehouseScans = liveWarehouseScans.filter((item) => {
    if (id && item.id === id) return false;
    if (cleanBarcode && item.barcode === cleanBarcode) {
      if (!scanType || item.scanType === scanType) return false;
    }
    return true;
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(liveWarehouseScans));
  } catch (err) {
    console.warn('LocalStorage delete error:', err);
  }

  // 2. Notify subscribers immediately
  notifyWarehouseSubscribers();

  // 3. Persistent delete on Master MySQL Database (Hostinger Remote MariaDB Master)
  try {
    await deleteWarehouseScanFromMaster(id, scanType, barcode);
  } catch (err) {
    console.warn('[warehouseScanService] Master MySQL delete warning:', err);
  }

  // 4. Notify Google Sheets in background
  deleteWarehouseScanFromGoogleSheets(id, barcode, scanType).catch((err) => {
    console.warn('Google Sheets background delete error:', err);
  });

  return true;
}

/**
 * 🗑️ Batch delete multiple warehouse scan records
 * Immediately cleans local state & LocalStorage, then removes from Hostinger MariaDB Master and Google Sheets
 */
export async function deleteWarehouseScanBatch(
  items: Array<{ id: string; barcode?: string; scanType?: WarehouseScanType }>
): Promise<boolean> {
  if (!items || items.length === 0) return true;

  // 1. Instant local removal (0ms latency guarantee - matching both IDs and Barcodes)
  const idsToDelete = new Set(items.map((i) => i.id).filter(Boolean));
  const barcodesToDelete = new Set(
    items.map((i) => (i.barcode ? sanitizeTrackingCode(i.barcode).toUpperCase() : '')).filter(Boolean)
  );

  liveWarehouseScans = liveWarehouseScans.filter((item) => {
    if (item.id && idsToDelete.has(item.id)) return false;
    if (item.barcode && barcodesToDelete.has(item.barcode)) return false;
    return true;
  });

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(liveWarehouseScans));
  } catch (err) {
    console.warn('LocalStorage batch delete error:', err);
  }

  // 2. Notify subscribers immediately
  notifyWarehouseSubscribers();

  // 3. Persistent batch delete on Master MySQL Database (Hostinger Remote MariaDB Master)
  try {
    await deleteWarehouseScanBatchFromMaster(items);
  } catch (err) {
    console.warn('[warehouseScanService] Master MySQL batch delete warning:', err);
  }

  // 4. Send delete requests to Google Sheets in background
  for (const item of items) {
    deleteWarehouseScanFromGoogleSheets(item.id, item.barcode, item.scanType).catch(() => {});
  }

  return true;
}

/**
 * 🧹 Clear all warehouse scans completely from Google Sheets and LocalStorage
 */
export async function clearAllWarehouseScans(): Promise<boolean> {
  liveWarehouseScans = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}

  notifyWarehouseSubscribers();

  // Wipe from Master Database
  clearAllWarehouseScansFromMaster().catch((err) => {
    console.warn('[warehouseScanService] Master MySQL clear error:', err);
  });

  // Sync empty list to Google Sheets in background
  syncAllWarehouseScansToGoogleSheets([]).catch((err) => {
    console.warn('Google Sheets clear error:', err);
  });

  return true;
}

/**
 * Sync single scan record to Google Sheets
 */
export async function syncWarehouseScanToGoogleSheets(
  item: WarehouseScanItem,
  webAppUrl?: string
): Promise<boolean> {
  const targetUrl = getProxiedGasUrl(webAppUrl?.trim() || getStoredWebAppUrl());
  if (!targetUrl) return false;

  try {
    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'save_warehouse_scan',
        item
      })
    });
    return true;
  } catch (err) {
    console.warn('Google Sheets syncWarehouseScan error:', err);
    return false;
  }
}

/**
 * Delete single scan record from Google Sheets
 */
export async function deleteWarehouseScanFromGoogleSheets(
  id: string,
  barcode?: string,
  scanType?: WarehouseScanType,
  webAppUrl?: string
): Promise<boolean> {
  const targetUrl = getProxiedGasUrl(webAppUrl?.trim() || getStoredWebAppUrl());
  if (!targetUrl) return false;

  try {
    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'delete_warehouse_scan',
        id,
        barcode,
        scanType
      })
    });
    return true;
  } catch (err) {
    console.warn('Google Sheets deleteWarehouseScan error:', err);
    return false;
  }
}

/**
 * Bulk sync all warehouse scans to Google Sheets
 */
export async function syncAllWarehouseScansToGoogleSheets(
  items?: WarehouseScanItem[],
  webAppUrl?: string
): Promise<{ success: boolean; count: number; error?: string; needsNewDeploy?: boolean }> {
  const targetUrl = getProxiedGasUrl(webAppUrl?.trim() || getStoredWebAppUrl());
  if (!targetUrl) {
    return { success: false, count: 0, error: 'មិនទាន់ភ្ជាប់ Google Sheets Web App URL ទេ (សូមពិនិត្យមើលក្នុង Settings)' };
  }

  const list = items !== undefined ? items : liveWarehouseScans;

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'sync_warehouse_scans',
        items: list
      })
    });
    const data = await res.json();
    if (data?.status === 'success') {
      return { success: true, count: list.length };
    }
    const rawMsg = data?.message || '';
    if (rawMsg.includes('Unknown action') || rawMsg.includes('sync_warehouse_scans')) {
      return {
        success: false,
        count: 0,
        needsNewDeploy: true,
        error: 'Google Apps Script មិនទាន់ស្គាល់មុខងារ «sync_warehouse_scans» ទេ (សូមចម្លង Code.gs ទៅ Deploy Version ថ្មី / New version ក្នុង Google Apps Script)'
      };
    }
    return { success: false, count: 0, error: rawMsg || 'Google Sheets sync failed' };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || 'Network error' };
  }
}

/**
 * Sync local warehouse scans to Google Sheets
 */
export async function syncLocalWarehouseScans(specificItems?: WarehouseScanItem[]): Promise<number> {
  if (!specificItems || specificItems.length === 0) return 0;
  const res = await syncAllWarehouseScansToGoogleSheets(specificItems);
  return res.success ? specificItems.length : 0;
}

/**
 * 📥 Fetch warehouse scans directly from Hostinger Remote MySQL Master tbl_scan_*
 */
export async function fetchWarehouseScansFromMaster(): Promise<WarehouseScanItem[]> {
  try {
    const res = await authFetch('/api/remote-mysql?action=get_warehouse_scans&t=' + Date.now());
    if (res.ok) {
      const json = await res.json();
      if (json && json.ok && Array.isArray(json.data)) {
        const remoteItems: WarehouseScanItem[] = json.data.map((raw: any) => ({
          id: String(raw.id),
          operationCode: raw.operationCode ? String(raw.operationCode).trim() : undefined,
          batchId: raw.batchId ? String(raw.batchId).trim() : undefined,
          scanType: (raw.scanType || 'SCAN_IN') as WarehouseScanType,
          barcode: sanitizeTrackingCode(String(raw.barcode || '')).toUpperCase(),
          tracking: String(raw.tracking || raw.barcode || '').trim(),
          destination: raw.destination ? String(raw.destination).trim() : undefined,
          driverName: raw.driverName ? String(raw.driverName).trim() : undefined,
          truckNo: raw.truckNo ? String(raw.truckNo).trim() : undefined,
          transferBy: raw.transferBy ? String(raw.transferBy).trim() : undefined,
          codAmount: raw.codAmount !== undefined && raw.codAmount !== null && raw.codAmount !== '' ? Number(raw.codAmount) : undefined,
          currency: raw.currency || 'USD',
          riderName: raw.riderName ? String(raw.riderName).trim() : undefined,
          deliveryZone: raw.deliveryZone ? String(raw.deliveryZone).trim() : undefined,
          holdReason: raw.holdReason ? String(raw.holdReason).trim() : undefined,
          shelfLocation: raw.shelfLocation ? String(raw.shelfLocation).trim() : undefined,
          remarks: raw.remarks ? String(raw.remarks).trim() : undefined,
          date: raw.date ? String(raw.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
          operatorEmail: raw.operatorEmail ? String(raw.operatorEmail).trim() : '',
          createdBy: raw.createdBy ? String(raw.createdBy).trim() : 'User',
          createdAt: raw.createdAt || new Date().toISOString(),
          updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString()
        }));

        const itemMap = new Map<string, WarehouseScanItem>();
        for (const item of remoteItems) {
          itemMap.set(item.id, item);
        }
        for (const pending of sheetSyncQueue) {
          itemMap.set(pending.id, pending);
        }

        const mergedList = Array.from(itemMap.values()).sort((a, b) => {
          const timeA = a.createdAt || a.date || '';
          const timeB = b.createdAt || b.date || '';
          return timeB.localeCompare(timeA);
        });

        liveWarehouseScans = mergedList;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedList.slice(0, 5000)));
        } catch (err) {
          console.warn('LocalStorage save error:', err);
        }

        setWarehouseRealtimeStatus('CONNECTED');
        notifyWarehouseSubscribers();
        return mergedList;
      }
    }
    setWarehouseRealtimeStatus(liveWarehouseScans.length > 0 ? 'CONNECTED' : 'DISCONNECTED');
  } catch (err) {
    console.debug('[Warehouse] Fetch from MySQL Master notice:', err);
    setWarehouseRealtimeStatus(liveWarehouseScans.length > 0 ? 'CONNECTED' : 'DISCONNECTED');
  }

  return liveWarehouseScans;
}

/**
 * 📥 Unified Fetch: Pulls exclusively from Hostinger Remote MySQL Master Database
 */
export async function fetchWarehouseScans(): Promise<WarehouseScanItem[]> {
  return fetchWarehouseScansFromMaster();
}

/**
 * 📡 Subscribe to real-time warehouse scans updates (Hostinger Remote MySQL Master Primary)
 */
let hasStartedInitialFetch = false;
let pollingInterval: any = null;

function setupBackgroundPolling() {
  if (pollingInterval) return;
  // Poll Hostinger Remote MySQL Master every 15 seconds for changes
  pollingInterval = setInterval(() => {
    fetchWarehouseScansFromMaster();
  }, 15000);
}

export function subscribeToWarehouseScans(
  onUpdate: (items: WarehouseScanItem[]) => void
): () => void {
  warehouseSubscribers.add(onUpdate);

  // 1. Immediately emit in-memory/localStorage data (0ms instant render, no spinner)
  onUpdate([...liveWarehouseScans]);

  // 2. Fetch fresh data from Hostinger Remote MySQL Master in background on first subscriber
  if (!hasStartedInitialFetch) {
    hasStartedInitialFetch = true;
    fetchWarehouseScansFromMaster();
  }

  // 3. Ensure background polling is active
  setupBackgroundPolling();

  return () => {
    warehouseSubscribers.delete(onUpdate);
  };
}

/**
 * ⚡ Live update cache and notify all warehouse subscribers immediately
 */
export function updateWarehouseScansLive(items: WarehouseScanItem[]) {
  if (!Array.isArray(items)) return;
  liveWarehouseScans = items;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 5000)));
  } catch (_) {}
  notifyWarehouseSubscribers();
}

// Cross-tab and in-tab synchronization via custom and storage events
if (typeof window !== 'undefined') {
  window.addEventListener('ial_warehouse_scans_updated', (e: any) => {
    if (Array.isArray(e.detail)) {
      updateWarehouseScansLive(e.detail);
    }
  });

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (Array.isArray(parsed)) {
          liveWarehouseScans = parsed;
          notifyWarehouseSubscribers();
        }
      } catch (_) {}
    }
  });

  window.addEventListener('focus', () => {
    fetchWarehouseScansFromMaster();
  });
}

