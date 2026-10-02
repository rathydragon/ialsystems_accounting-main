import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from '../firebase';
import { WarehouseScanItem, WarehouseScanType, AuthUser, UserPermission } from '../types';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { getCachedDataReport } from './dataReportService';

const STORAGE_KEY = 'ial_warehouse_scans_data_v1';
const FIRESTORE_COLLECTION = 'warehouse_scans';

/**
 * Clean object so Firestore doesn't reject undefined values
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === undefined || obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned;
  }
  return obj;
}

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
  return 'https://script.google.com/macros/s/AKfycbzplbm6_w-eXnr4WaUf06q49iwtA9zK3xBXlrG_SW316b4jjsoHay7w1DG_KZYz4aS_8Q/exec';
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
export function lookupTrackingFromDataReport(barcode: string): {
  customerName?: string;
  customerPhone?: string;
  destination?: string;
  codAmount?: number;
  currency?: 'USD' | 'KHR';
} | null {
  const cleanCode = sanitizeTrackingCode(barcode).toUpperCase();
  if (!cleanCode) return null;

  try {
    const { rows } = getCachedDataReport();
    if (!rows || rows.length === 0) return null;

    for (const row of rows) {
      let isMatch = false;
      for (const [key, val] of Object.entries(row)) {
        if (key === '_id') continue;
        const valStr = String(val || '').trim().toUpperCase();
        if (valStr && sanitizeTrackingCode(valStr).toUpperCase() === cleanCode) {
          isMatch = true;
          break;
        }
      }

      if (isMatch) {
        let customerName = '';
        let customerPhone = '';
        let destination = '';
        let codAmount: number | undefined;
        let currency: 'USD' | 'KHR' = 'USD';

        for (const [key, val] of Object.entries(row)) {
          if (key === '_id') continue;
          const kLower = key.toLowerCase();
          const vStr = String(val || '').trim();
          if (!vStr) continue;

          // Match customer/receiver name
          if (!customerName && (kLower.includes('receiver') || kLower.includes('consignee') || kLower.includes('customer') || kLower.includes('name') || kLower.includes('ឈ្មោះ'))) {
            customerName = vStr;
          }
          // Match phone
          if (!customerPhone && (kLower.includes('phone') || kLower.includes('tel') || kLower.includes('contact') || kLower.includes('ទូរស័ព្ទ'))) {
            customerPhone = vStr;
          }
          // Match destination / province / address
          if (!destination && (kLower.includes('province') || kLower.includes('address') || kLower.includes('destination') || kLower.includes('location') || kLower.includes('ខេត្ត') || kLower.includes('ទីតាំង'))) {
            destination = vStr;
          }
          // Match COD amount
          if (codAmount === undefined && (kLower.includes('cod') || kLower.includes('amount') || kLower.includes('total') || kLower.includes('តម្លៃ') || kLower.includes('ប្រាក់'))) {
            const cleanNum = parseFloat(vStr.replace(/[$,]/g, ''));
            if (!isNaN(cleanNum)) {
              codAmount = cleanNum;
              if (vStr.includes('៛') || vStr.toUpperCase().includes('KHR') || cleanNum > 1000) {
                currency = 'KHR';
              }
            }
          }
        }

        return { customerName, customerPhone, destination, codAmount, currency };
      }
    }
  } catch (e) {
    console.debug('Error matching tracking barcode in data report cache:', e);
  }

  return null;
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
    scanType: data.scanType,
    barcode: cleanBarcode,
    tracking: data.tracking || cleanBarcode,
    customerName: (data.customerName || '').trim(),
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

  // 2. Sync to Firebase Firestore in real-time
  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      const sanitized = sanitizeForFirestore(fullItem);
      await setDoc(doc(db, FIRESTORE_COLLECTION, id), sanitized, { merge: true });
    } catch (firestoreErr) {
      console.warn('Firestore warehouse scan sync error:', firestoreErr);
    }
  }

  // 3. Asynchronously sync to Google Sheets
  syncWarehouseScanToGoogleSheets(fullItem).catch(() => {});

  return fullItem;
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

  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      await deleteDoc(doc(db, FIRESTORE_COLLECTION, id));
    } catch (firestoreErr) {
      console.warn('Firestore delete error:', firestoreErr);
    }
  }

  deleteWarehouseScanFromGoogleSheets(id, barcode, scanType).catch(() => {});
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

/**
 * Automatically sync any local warehouse scans that are missing in Firestore
 */
export async function syncLocalWarehouseScansToFirestore(): Promise<number> {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) return 0;

  const localItems = getInitialWarehouseScans();
  if (localItems.length === 0) return 0;

  let syncedCount = 0;
  for (const item of localItems) {
    if (!item.id || !item.barcode) continue;
    try {
      const sanitized = sanitizeForFirestore(item);
      await setDoc(doc(db, FIRESTORE_COLLECTION, item.id), sanitized, { merge: true });
      syncedCount++;
    } catch (err) {
      console.warn('Failed to sync warehouse scan to Firestore:', item.id, err);
    }
  }

  return syncedCount;
}

/**
 * Subscribe to real-time warehouse scans updates from Firestore
 */
export function subscribeToWarehouseScans(
  onUpdate: (items: WarehouseScanItem[]) => void
): () => void {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    return () => {};
  }

  try {
    const colRef = collection(db, FIRESTORE_COLLECTION);
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const items: WarehouseScanItem[] = [];
        snapshot.forEach((docSnap) => {
          if (docSnap.exists()) {
            items.push(docSnap.data() as WarehouseScanItem);
          }
        });

        // Sort descending by date or createdAt
        items.sort((a, b) => {
          const dateDiff = (b.date || '').localeCompare(a.date || '');
          if (dateDiff !== 0) return dateDiff;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

        // Cache latest to LocalStorage
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch {}

        onUpdate(items);
      },
      (err) => {
        console.debug('Warehouse scans subscription notice:', err?.message || err);
      }
    );

    return unsubscribe;
  } catch (e) {
    console.debug('Failed to subscribe to warehouse scans:', e);
    return () => {};
  }
}
