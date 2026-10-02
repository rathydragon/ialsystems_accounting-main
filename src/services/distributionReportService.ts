import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs } from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from '../firebase';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { AuthUser, UserPermission, normalizeUserRole } from '../types';
import { isMasterAdmin } from './userPermissionService';

export interface DistributionReportItem {
  id: string;
  barcode: string;
  name: string;
  date: string;
  remarks: string;
  createdAt: string;
  createdBy?: string;
  operatorEmail?: string;
  updatedAt?: string;
}

const STORAGE_KEY = 'accounting_distribution_reports_v1';
const FIRESTORE_COLLECTION = 'distribution_reports';

/**
 * Check if the user has permission to create new distribution reports.
 */
export function canCreateDistributionReport(
  user?: AuthUser | null,
  permissions?: UserPermission[]
): boolean {
  if (!user) return false;
  if (isMasterAdmin(user.email)) return true;

  if (permissions && user.email) {
    const cleanEmail = user.email.toLowerCase().trim();
    const perm = permissions.find((p) => p.email.toLowerCase().trim() === cleanEmail);
    if (perm) {
      if (perm.status === 'SUSPENDED') return false;
      if (perm.canCreate !== undefined) return Boolean(perm.canCreate);
    }
  }

  const role = normalizeUserRole(user.role);
  return role !== 'VIEWER';
}

/**
 * Check if the user has permission to edit distribution reports.
 */
export function canEditDistributionReport(
  user?: AuthUser | null,
  permissions?: UserPermission[]
): boolean {
  if (!user) return false;
  if (isMasterAdmin(user.email)) return true;

  if (permissions && user.email) {
    const cleanEmail = user.email.toLowerCase().trim();
    const perm = permissions.find((p) => p.email.toLowerCase().trim() === cleanEmail);
    if (perm) {
      if (perm.status === 'SUSPENDED') return false;
      if (perm.canEdit !== undefined) return Boolean(perm.canEdit);
    }
  }

  const allowedRoles = ['ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS_OPT'];
  const directRole = normalizeUserRole(user.role);
  return allowedRoles.includes(directRole);
}

/**
 * Check if the user has permission to delete distribution reports.
 */
export function canDeleteDistributionReport(
  user?: AuthUser | null,
  permissions?: UserPermission[]
): boolean {
  if (!user) return false;
  if (isMasterAdmin(user.email)) return true;

  if (permissions && user.email) {
    const cleanEmail = user.email.toLowerCase().trim();
    const perm = permissions.find((p) => p.email.toLowerCase().trim() === cleanEmail);
    if (perm) {
      if (perm.status === 'SUSPENDED') return false;
      if (perm.canDelete !== undefined) return Boolean(perm.canDelete);
    }
  }

  const allowedRoles = ['ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS_OPT'];
  const directRole = normalizeUserRole(user.role);
  return allowedRoles.includes(directRole);
}

/**
 * Check if the user has permission to operate (Edit / Delete) distribution reports.
 */
export function canOperateDistributionActions(
  user?: AuthUser | null,
  permissions?: UserPermission[]
): boolean {
  return canEditDistributionReport(user, permissions) || canDeleteDistributionReport(user, permissions);
}

/**
 * Clean object so Firestore doesn't error on undefined values
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
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
 * Get initial distribution reports from LocalStorage
 */
export function getInitialDistributionReports(): DistributionReportItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.debug('Failed to load local distribution reports:', e);
  }
  return [];
}

/**
 * Save a distribution report (create or update)
 */
export async function saveDistributionReport(
  data: Omit<DistributionReportItem, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): Promise<DistributionReportItem> {
  const now = new Date().toISOString();
  const id = data.id || `dist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const cleanBarcode = sanitizeTrackingCode(data.barcode).toUpperCase();

  const operatorEmail =
    (data as any).operatorEmail ||
    (data.createdBy && data.createdBy.includes('@') ? data.createdBy.trim() : '');

  const fullItem: DistributionReportItem = {
    id,
    barcode: cleanBarcode,
    name: (data.name || '').trim(),
    date: data.date || now.slice(0, 10),
    remarks: (data.remarks || '').trim(),
    createdAt: data.createdAt || now,
    createdBy: data.createdBy || 'User',
    operatorEmail: operatorEmail || '',
    updatedAt: now
  };

  const existing = getInitialDistributionReports();

  // Validate duplicate barcode
  if (data.id) {
    // If editing existing item, only check if barcode was changed to another existing record's barcode
    const currentItem = existing.find((item) => item.id === data.id);
    const originalBarcode = currentItem ? sanitizeTrackingCode(currentItem.barcode).toUpperCase() : '';
    if (cleanBarcode !== originalBarcode) {
      const duplicate = existing.find(
        (item) => item.id !== data.id && sanitizeTrackingCode(item.barcode).toUpperCase() === cleanBarcode
      );
      if (duplicate) {
        throw new Error(`លេខ Barcode «${cleanBarcode}» នេះធ្លាប់បានកត់ត្រារួចហើយ មិនអាចបញ្ចូលជាន់គ្នាបានទេ!`);
      }
    }
  } else {
    // If creating a brand new record
    const duplicate = existing.find(
      (item) => sanitizeTrackingCode(item.barcode).toUpperCase() === cleanBarcode
    );
    if (duplicate) {
      throw new Error(`លេខ Barcode «${cleanBarcode}» នេះធ្លាប់បានកត់ត្រារួចហើយ មិនអាចបញ្ចូលជាន់គ្នាបានទេ!`);
    }
  }

  // 1. Save to LocalStorage immediately
  try {
    const index = existing.findIndex((item) => item.id === id);
    let updatedList: DistributionReportItem[];

    if (index >= 0) {
      updatedList = [...existing];
      updatedList[index] = fullItem;
    } else {
      updatedList = [fullItem, ...existing];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
  } catch (e) {
    console.warn('Failed to save distribution report to localStorage:', e);
  }

  // 2. Sync to Firebase Firestore
  const db = getDb();
  if (db && isFirebaseConfigured()) {
    const sanitized = sanitizeForFirestore(fullItem);
    try {
      const docRef = doc(db, FIRESTORE_COLLECTION, id);
      await setDoc(docRef, sanitized, { merge: true });
    } catch (e: any) {
      console.warn('Failed to save distribution report to root Firestore:', e?.message || e);
    }

    try {
      const subDocRef = doc(db, 'batches', '_system_data', FIRESTORE_COLLECTION, id);
      await setDoc(subDocRef, sanitized, { merge: true });
    } catch (e: any) {
      console.warn('Failed to save distribution report to subcollection Firestore:', e?.message || e);
    }
  }

  // 3. Sync to Google Sheets in background (optional/async)
  syncDistributionReportToGoogleSheets(fullItem, (data as any)?.webAppUrl).catch(() => {});

  return fullItem;
}

/**
 * Delete a distribution report
 */
export async function deleteDistributionReport(id: string, barcode?: string, webAppUrl?: string): Promise<boolean> {
  // 1. Remove from LocalStorage
  try {
    const existing = getInitialDistributionReports();
    const filtered = existing.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.warn('Failed to remove distribution report from localStorage:', e);
  }

  // 2. Delete from Firestore
  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      const docRef = doc(db, FIRESTORE_COLLECTION, id);
      await deleteDoc(docRef);
    } catch (e) {
      console.warn('Failed to delete distribution report from root Firestore:', e);
    }

    try {
      const subDocRef = doc(db, 'batches', '_system_data', FIRESTORE_COLLECTION, id);
      await deleteDoc(subDocRef);
    } catch (e) {
      console.warn('Failed to delete distribution report from subcollection Firestore:', e);
    }
  }

  // 3. Delete from Google Sheets in background
  deleteDistributionReportFromGoogleSheets(id, barcode, webAppUrl).catch(() => {});

  return true;
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
 * Sync a single distribution report to Google Sheets
 */
export async function syncDistributionReportToGoogleSheets(
  report: DistributionReportItem,
  webAppUrl?: string
): Promise<boolean> {
  const targetUrl = webAppUrl?.trim() || getStoredWebAppUrl();
  if (!targetUrl) return false;

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'save_distribution_report',
        report
      })
    });
    const data = await res.json();
    return data?.status === 'success';
  } catch (err) {
    console.warn('Google Sheets syncDistributionReport error:', err);
    return false;
  }
}

/**
 * Delete a distribution report from Google Sheets
 */
export async function deleteDistributionReportFromGoogleSheets(
  id: string,
  barcode?: string,
  webAppUrl?: string
): Promise<boolean> {
  const targetUrl = webAppUrl?.trim() || getStoredWebAppUrl();
  if (!targetUrl) return false;

  try {
    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'delete_distribution_report',
        id,
        barcode
      })
    });
    return true;
  } catch (err) {
    console.warn('Google Sheets deleteDistributionReport error:', err);
    return false;
  }
}

/**
 * Bulk sync all distribution reports to Google Sheets
 */
export async function syncAllDistributionReportsToGoogleSheets(
  reports?: DistributionReportItem[],
  webAppUrl?: string
): Promise<{ success: boolean; count: number; error?: string; needsNewDeploy?: boolean }> {
  const targetUrl = webAppUrl?.trim() || getStoredWebAppUrl();
  if (!targetUrl) {
    return { success: false, count: 0, error: 'មិនទាន់ភ្ជាប់ Google Sheets Web App URL ទេ (សូមពិនិត្យមើលក្នុង Settings)' };
  }

  const items = reports && reports.length > 0 ? reports : getInitialDistributionReports();

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'sync_distribution_reports',
        reports: items
      })
    });
    const data = await res.json();
    if (data?.status === 'success') {
      return { success: true, count: items.length };
    }
    const rawMsg = data?.message || '';
    if (rawMsg.includes('Unknown action') || rawMsg.includes('sync_distribution_reports')) {
      return {
        success: false,
        count: 0,
        needsNewDeploy: true,
        error: 'Google Apps Script មិនទាន់ស្គាល់មុខងារ «sync_distribution_reports» ទេ (សូមចម្លង Code.gs ទៅ Deploy Version ថ្មី / New version ក្នុង Google Apps Script)'
      };
    }
    return { success: false, count: 0, error: rawMsg || 'Google Sheets sync failed' };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || 'Network error' };
  }
}

/**
 * Automatically sync any local reports that are missing in Firestore
 */
export async function syncLocalDistributionReportsToFirestore(): Promise<number> {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) return 0;

  const localItems = getInitialDistributionReports();
  if (localItems.length === 0) return 0;

  let syncedCount = 0;
  for (const item of localItems) {
    if (!item.id || !item.barcode) continue;
    try {
      const sanitized = sanitizeForFirestore(item);
      // 1. Root collection
      await setDoc(doc(db, FIRESTORE_COLLECTION, item.id), sanitized, { merge: true });
      // 2. Fallback subcollection
      try {
        await setDoc(doc(db, 'batches', '_system_data', FIRESTORE_COLLECTION, item.id), sanitized, { merge: true });
      } catch {}
      syncedCount++;
    } catch (err) {
      console.warn('Failed to sync distribution report to Firestore:', item.id, err);
    }
  }

  return syncedCount;
}

/**
 * Subscribe to real-time distribution reports updates from Firestore
 */
export function subscribeToDistributionReports(
  onUpdate: (items: DistributionReportItem[]) => void
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
        const items: DistributionReportItem[] = [];
        snapshot.forEach((docSnap) => {
          if (docSnap.exists()) {
            items.push(docSnap.data() as DistributionReportItem);
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
        console.debug('Distribution reports subscription notice:', err?.message || err);
      }
    );

    return unsubscribe;
  } catch (e) {
    console.debug('Failed to subscribe to distribution reports:', e);
    return () => {};
  }
}
