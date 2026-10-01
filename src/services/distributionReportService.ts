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
 * Check if the user has permission to operate (Edit / Delete) distribution reports.
 * Allowed roles: ADMIN, CS_TEAMS_OPT (Cs Teams(Opt)), and Master Admin
 */
export function canOperateDistributionActions(
  user?: AuthUser | null,
  permissions?: UserPermission[]
): boolean {
  if (!user) return false;

  // 1. Master admin check (email)
  if (isMasterAdmin(user.email)) return true;

  // 2. Direct user role check
  const directRole = normalizeUserRole(user.role);
  if (directRole === 'ADMIN' || directRole === 'CS_TEAMS_OPT') {
    return true;
  }

  // 3. User permission table check (if provided)
  if (permissions && user.email) {
    const cleanEmail = user.email.toLowerCase().trim();
    const perm = permissions.find((p) => p.email.toLowerCase().trim() === cleanEmail);
    if (perm) {
      const permRole = normalizeUserRole(perm.role);
      if (permRole === 'ADMIN' || permRole === 'CS_TEAMS_OPT') {
        return true;
      }
    }
  }

  return false;
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
    try {
      const docRef = doc(db, FIRESTORE_COLLECTION, id);
      await setDoc(docRef, sanitizeForFirestore(fullItem), { merge: true });
    } catch (e) {
      console.warn('Failed to save distribution report to Firestore:', e);
    }
  }

  return fullItem;
}

/**
 * Delete a distribution report
 */
export async function deleteDistributionReport(id: string): Promise<boolean> {
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
      return true;
    } catch (e) {
      console.warn('Failed to delete distribution report from Firestore:', e);
      return false;
    }
  }

  return true;
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
