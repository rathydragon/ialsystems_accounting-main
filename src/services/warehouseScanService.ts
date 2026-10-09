import { WarehouseScanItem, WarehouseScanType, AuthUser, UserPermission } from '../types';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { getCachedDataReport } from './dataReportService';
import {
  saveWarehouseScanToSupabase,
  saveWarehouseScanBatchToSupabase,
  deleteWarehouseScanFromSupabase,
  deleteWarehouseScanBatchFromSupabase,
  subscribeToWarehouseScansFromSupabase
} from './supabaseDbService';
import { getSupabaseClient } from '../supabase';

const STORAGE_KEY = 'ial_warehouse_scans_data_v1';



/**
 * Get active Web App URL from Settings or Vite environment
 */
export function getStoredWebAppUrl(): string {
  try {
    const raw = localStorage.getItem('accounting_app_settings_v2') || localStorage.getItem('accounting_app_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.webAppUrl?.trim()) return parsed.webAppUrl.trim();
    }
  } catch (_) {}
  const envUrl = (import.meta as any).env?.VITE_GOOGLE_WEBAPP_URL;
  if (envUrl && typeof envUrl === 'string') return envUrl.trim();
  return 'https://script.google.com/macros/s/AKfycbwEUAy4mhfl7UM6YgCexJW56mgFU-DyVWPft2MHkcXC1DUgcKzZWqnZUCmzEQvBV_a22Q/exec';
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
        // Extract values using discovered col ids or fallback to row keys
        const getVal = (colId: string | null, candidates: string[]): string => {
          if (colId && row[colId] !== undefined && row[colId] !== null) {
            const v = String(row[colId]).trim();
            if (v) return v;
          }
          // Direct row key lookup
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
 * Save a warehouse scan (create or update)
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

  const existing = getInitialWarehouseScans();

  // Validate duplicate barcode within the SAME scanType on the SAME date
  const duplicate = existing.find(
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

  // 1. Save to LocalStorage immediately
  try {
    const index = existing.findIndex((item) => item.id === id);
    let updatedList: WarehouseScanItem[];

    if (index >= 0) {
      updatedList = [...existing];
      updatedList[index] = fullItem;
    } else {
      updatedList = [fullItem, ...existing];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
  } catch (err) {
    console.warn('LocalStorage save error:', err);
  }

  // 2. Sync to Cloud Supabase in real-time (background non-blocking for instant scanning)
  saveWarehouseScanToSupabase(fullItem).catch((supabaseErr) => {
    console.warn('Supabase warehouse scan sync error:', supabaseErr);
  });

  // 3. Asynchronously sync to Google Sheets
  syncWarehouseScanToGoogleSheets(fullItem).catch(() => {});

  return fullItem;
}

/**
 * Save multiple warehouse scans at once (Batch Operation)
 */
export async function saveWarehouseScanBatch(
  items: Array<Omit<WarehouseScanItem, 'id' | 'createdAt'> & { id?: string; createdAt?: string }>
): Promise<WarehouseScanItem[]> {
  if (!items || items.length === 0) return [];
  const now = new Date().toISOString();
  const existing = getInitialWarehouseScans();
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

  // 1. Save to LocalStorage immediately
  try {
    const updatedList = [...fullItems, ...existing];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
  } catch (err) {
    console.warn('LocalStorage batch save error:', err);
  }

  // 2. Sync to Cloud Supabase in real-time (background non-blocking for instant scanning & saving)
  saveWarehouseScanBatchToSupabase(fullItems).catch((err) => {
    console.warn('Supabase warehouse scan batch sync error:', err);
  });

  // 3. Asynchronously sync to Google Sheets (non-blocking)
  syncAllWarehouseScansToGoogleSheets(fullItems).catch(() => {});

  return fullItems;
}

/**
 * Delete a warehouse scan record
 */
export async function deleteWarehouseScan(id: string, barcode?: string, scanType?: WarehouseScanType): Promise<boolean> {
  const existing = getInitialWarehouseScans();
  const updatedList = existing.filter((item) => item.id !== id);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
  } catch (err) {
    console.warn('LocalStorage delete error:', err);
  }

  // Delete from Supabase in background
  deleteWarehouseScanFromSupabase(id).catch((err) => {
    console.warn('Supabase delete error:', err);
  });

  deleteWarehouseScanFromGoogleSheets(id, barcode, scanType).catch(() => {});
  return true;
}

/**
 * Batch delete multiple warehouse scan records (Atomically prevents race conditions)
 */
export async function deleteWarehouseScanBatch(
  items: Array<{ id: string; barcode?: string; scanType?: WarehouseScanType }>
): Promise<boolean> {
  if (!items || items.length === 0) return true;
  const idsToDelete = Array.from(new Set(items.map((i) => i.id)));

  // 1. Atomically update LocalStorage once
  const existing = getInitialWarehouseScans();
  const updatedList = existing.filter((item) => !idsToDelete.includes(item.id));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
  } catch (err) {
    console.warn('LocalStorage batch delete error:', err);
  }

  // 2. Batch delete from Supabase in background (non-blocking)
  deleteWarehouseScanBatchFromSupabase(idsToDelete).catch((err) => {
    console.warn('Supabase batch delete error:', err);
  });

  // 3. Notify Google Sheets
  for (const item of items) {
    deleteWarehouseScanFromGoogleSheets(item.id, item.barcode, item.scanType).catch(() => {});
  }
  return true;
}

/**
 * Clear all warehouse scans completely from both Supabase and LocalStorage
 */
export async function clearAllWarehouseScans(): Promise<boolean> {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}

  const client = getSupabaseClient();
  if (client) {
    try {
      const { error } = await client.from('warehouse_scans').delete().neq('id', '');
      if (error) {
        console.error('Failed to clear all warehouse scans from Supabase:', error);
        return false;
      }
    } catch (err) {
      console.error('Failed to clear all warehouse scans from Supabase:', err);
      return false;
    }
  }
  return true;
}

/**
 * Sync single scan record to Google Sheets
 */
export async function syncWarehouseScanToGoogleSheets(
  item: WarehouseScanItem,
  webAppUrl?: string
): Promise<boolean> {
  const targetUrl = webAppUrl?.trim() || getStoredWebAppUrl();
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
  const targetUrl = webAppUrl?.trim() || getStoredWebAppUrl();
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
  const targetUrl = webAppUrl?.trim() || getStoredWebAppUrl();
  if (!targetUrl) {
    return { success: false, count: 0, error: 'មិនទាន់ភ្ជាប់ Google Sheets Web App URL ទេ (សូមពិនិត្យមើលក្នុង Settings)' };
  }

  const list = items && items.length > 0 ? items : getInitialWarehouseScans();

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

let isSyncingLocalWarehouse = false;

/**
 * Automatically sync offline-pending warehouse scans to Supabase
 * Notice: Only syncs explicitly provided items to avoid reviving deleted records from old cache.
 */
export async function syncLocalWarehouseScansToSupabase(specificItems?: WarehouseScanItem[]): Promise<number> {
  if (!specificItems || specificItems.length === 0 || isSyncingLocalWarehouse) return 0;
  isSyncingLocalWarehouse = true;
  try {
    const success = await saveWarehouseScanBatchToSupabase(specificItems);
    return success ? specificItems.length : 0;
  } catch (err) {
    console.warn('Failed to batch sync warehouse scans to Supabase:', err);
    return 0;
  } finally {
    isSyncingLocalWarehouse = false;
  }
}

// Alias for backwards compatibility
export const syncLocalWarehouseScansToFirestore = syncLocalWarehouseScansToSupabase;

/**
 * Subscribe to real-time warehouse scans updates from Supabase Primary Database
 */
export function subscribeToWarehouseScans(
  onUpdate: (items: WarehouseScanItem[]) => void
): () => void {
  return subscribeToWarehouseScansFromSupabase((items) => {
    // Cache latest to LocalStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}

    onUpdate(items);
  });
}
