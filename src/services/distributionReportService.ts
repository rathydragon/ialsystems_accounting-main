import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs, writeBatch } from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from '../firebase';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { AuthUser, UserPermission, normalizeUserRole, OperatorDistributionSummary, AppSettings } from '../types';
import { isMasterAdmin } from './userPermissionService';
import { sendDailyDistributionSummaryAlert } from './telegramService';

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

  // Allow recording entries even if barcode exists (e.g. multiple dispatches/dates/recipients)
  // Each entry maintains its own unique ID in LocalStorage and Firestore


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

  // 2. Sync to Firebase Firestore in background (non-blocking so Save is instant)
  const db = getDb();
  if (db && isFirebaseConfigured()) {
    const sanitized = sanitizeForFirestore(fullItem);
    Promise.allSettled([
      setDoc(doc(db, FIRESTORE_COLLECTION, id), sanitized, { merge: true }),
      setDoc(doc(db, 'batches', '_system_data', FIRESTORE_COLLECTION, id), sanitized, { merge: true })
    ]).catch((e: any) => {
      console.warn('Background sync to Firestore notice:', e?.message || e);
    });
  }

  // 3. Sync to Google Sheets in background (optional/async)
  syncDistributionReportToGoogleSheets(fullItem, (data as any)?.webAppUrl).catch(() => {});

  return fullItem;
}

/**
 * Delete a distribution report
 */
export async function deleteDistributionReport(id: string, barcode?: string, webAppUrl?: string): Promise<boolean> {
  // 1. Remove from LocalStorage immediately
  try {
    const existing = getInitialDistributionReports();
    const filtered = existing.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.warn('Failed to remove distribution report from localStorage:', e);
  }

  // 2. Delete from Firestore in background (non-blocking)
  const db = getDb();
  if (db && isFirebaseConfigured()) {
    Promise.allSettled([
      deleteDoc(doc(db, FIRESTORE_COLLECTION, id)),
      deleteDoc(doc(db, 'batches', '_system_data', FIRESTORE_COLLECTION, id))
    ]).catch((e) => {
      console.warn('Background delete from Firestore notice:', e);
    });
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
  return 'https://script.google.com/macros/s/AKfycbwEUAy4mhfl7UM6YgCexJW56mgFU-DyVWPft2MHkcXC1DUgcKzZWqnZUCmzEQvBV_a22Q/exec';
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

let isSyncingLocalDistReports = false;

/**
 * Automatically sync any missing local reports to Firestore using writeBatch (fast & non-blocking)
 */
export async function syncLocalDistributionReportsToFirestore(specificItems?: DistributionReportItem[]): Promise<number> {
  const db = getDb();
  if (!db || !isFirebaseConfigured() || isSyncingLocalDistReports) return 0;

  const targetItems = specificItems || getInitialDistributionReports();
  if (targetItems.length === 0) return 0;

  isSyncingLocalDistReports = true;
  try {
    const batch = writeBatch(db);
    let count = 0;
    for (const item of targetItems) {
      if (!item.id || !item.barcode) continue;
      const sanitized = sanitizeForFirestore(item);
      batch.set(doc(db, FIRESTORE_COLLECTION, item.id), sanitized, { merge: true });
      batch.set(doc(db, 'batches', '_system_data', FIRESTORE_COLLECTION, item.id), sanitized, { merge: true });
      count++;
      if (count >= 200) break; // Firestore batch write limit safety
    }
    if (count > 0) {
      await batch.commit();
    }
    return count;
  } catch (err) {
    console.warn('Failed to batch sync distribution reports to Firestore:', err);
    return 0;
  } finally {
    isSyncingLocalDistReports = false;
  }
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

        // 🛡️ REINFORCED TWO-WAY MERGE: Check if local storage has any items not yet in Firestore
        // This ensures local items created offline or pending sync are NEVER wiped out by incoming snapshots!
        const localItems = getInitialDistributionReports();
        const firestoreIdSet = new Set(items.map((it) => it.id));
        const unsyncedItems = localItems.filter((loc) => loc.id && !firestoreIdSet.has(loc.id));

        const finalMerged = [...items];
        if (unsyncedItems.length > 0) {
          finalMerged.push(...unsyncedItems);
          // Auto push ONLY missing items up to Firestore in background using fast atomic batch
          setTimeout(() => {
            syncLocalDistributionReportsToFirestore(unsyncedItems).catch(() => {});
          }, 500);
        }

        // Sort descending by date or createdAt
        finalMerged.sort((a, b) => {
          const dateDiff = (b.date || '').localeCompare(a.date || '');
          if (dateDiff !== 0) return dateDiff;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

        // Cache latest merged list to LocalStorage
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(finalMerged));
        } catch {}

        onUpdate(finalMerged);
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

/**
 * Force bidirectional sync between LocalStorage and Firestore
 */
export async function forceSyncDistributionReports(): Promise<{ success: boolean; pushed: number; total: number }> {
  try {
    const pushed = await syncLocalDistributionReportsToFirestore();
    const db = getDb();
    if (db && isFirebaseConfigured()) {
      const colRef = collection(db, FIRESTORE_COLLECTION);
      const snap = await getDocs(colRef);
      const cloudItems: DistributionReportItem[] = [];
      snap.forEach((d) => {
        if (d.exists()) cloudItems.push(d.data() as DistributionReportItem);
      });

      const localItems = getInitialDistributionReports();
      const cloudIds = new Set(cloudItems.map((c) => c.id));
      const localUnsynced = localItems.filter((l) => l.id && !cloudIds.has(l.id));
      const all = [...cloudItems, ...localUnsynced];

      all.sort((a, b) => {
        const dateDiff = (b.date || '').localeCompare(a.date || '');
        if (dateDiff !== 0) return dateDiff;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      } catch {}

      return { success: true, pushed, total: all.length };
    }
    const current = getInitialDistributionReports();
    return { success: true, pushed, total: current.length };
  } catch (err) {
    console.warn('Force sync distribution reports error:', err);
    return { success: false, pushed: 0, total: 0 };
  }
}

/**
 * Get current date string formatted as YYYY-MM-DD in Asia/Phnom_Penh timezone
 */
export function getTodayDateStringPhnomPenh(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Phnom_Penh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Group and count distribution transactions by Operator Email (EMAIL អ្នកធ្វើប្រតិបត្តិការ)
 */
export function getOperatorDistributionStats(
  items: DistributionReportItem[],
  targetDate?: string
): {
  summaries: OperatorDistributionSummary[];
  totalToday: number;
  totalAll: number;
} {
  const dateToMatch = targetDate || getTodayDateStringPhnomPenh();
  const map = new Map<string, {
    operatorEmail: string;
    operatorName: string;
    todayCount: number;
    totalCount: number;
    lastActiveAt?: string;
    barcodes: string[];
  }>();

  let totalToday = 0;
  let totalAll = 0;

  for (const item of items) {
    totalAll++;
    const emailRaw = (item.operatorEmail || (item.createdBy?.includes('@') ? item.createdBy : '')).trim().toLowerCase();
    const key = emailRaw || (item.createdBy?.trim() || 'Unknown');
    const isToday = (item.date && item.date.slice(0, 10) === dateToMatch) ||
                    (item.createdAt && item.createdAt.slice(0, 10) === dateToMatch);

    if (isToday) {
      totalToday++;
    }

    let existing = map.get(key);
    if (!existing) {
      let displayName = item.createdBy?.trim() || '';
      if (!displayName || displayName.includes('@')) {
        if (emailRaw === 'ialexpress2023@gmail.com') displayName = 'IAL Accounting';
        else if (emailRaw === 'rathykim34@gmail.com') displayName = 'KEUN RATHY';
        else if (emailRaw) displayName = emailRaw.split('@')[0];
        else displayName = 'Unknown Operator';
      }

      existing = {
        operatorEmail: emailRaw,
        operatorName: displayName,
        todayCount: 0,
        totalCount: 0,
        lastActiveAt: item.createdAt || item.date,
        barcodes: []
      };
      map.set(key, existing);
    }

    existing.totalCount++;
    if (isToday) {
      existing.todayCount++;
      if (item.barcode) existing.barcodes.push(item.barcode);
    }

    if (item.createdAt && (!existing.lastActiveAt || item.createdAt > existing.lastActiveAt)) {
      existing.lastActiveAt = item.createdAt;
    }
  }

  // Convert map to array and calculate percentage
  const summaries: OperatorDistributionSummary[] = Array.from(map.values()).map(entry => ({
    operatorEmail: entry.operatorEmail,
    operatorName: entry.operatorName,
    todayCount: entry.todayCount,
    totalCount: entry.totalCount,
    percentage: totalToday > 0 ? Number(((entry.todayCount / totalToday) * 100).toFixed(1)) : 0,
    lastActiveAt: entry.lastActiveAt,
    barcodes: entry.barcodes
  }));

  // Sort descending by todayCount, then totalCount
  summaries.sort((a, b) => {
    if (b.todayCount !== a.todayCount) return b.todayCount - a.todayCount;
    return b.totalCount - a.totalCount;
  });

  return { summaries, totalToday, totalAll };
}

export const STORAGE_KEY_DAILY_SUMMARY_SENT = 'accounting_distribution_summary_sent_date';

/**
 * Trigger manual daily summary to Telegram bot (e.g. from UI button)
 */
export async function triggerManualDistributionSummary(
  items: DistributionReportItem[],
  customSettings?: AppSettings,
  targetDate?: string
): Promise<{ success: boolean; message: string; count: number }> {
  const dateStr = targetDate || getTodayDateStringPhnomPenh();
  const { summaries, totalToday } = getOperatorDistributionStats(items, dateStr);

  const res = await sendDailyDistributionSummaryAlert(summaries, totalToday, customSettings, dateStr);
  if (res.success) {
    try {
      localStorage.setItem(STORAGE_KEY_DAILY_SUMMARY_SENT, dateStr);
    } catch {}
    return {
      success: true,
      message: `🎉 បានផ្ញើសរុបប្រតិបត្តិការប្រចាំថ្ងៃ (${totalToday} កញ្ចប់ / ${summaries.length} អ្នកធ្វើប្រតិបត្តិការ) ទៅកាន់ Telegram ដោយជោគជ័យ!`,
      count: totalToday
    };
  }

  return {
    success: false,
    message: res.message || 'កំហុសក្នុងការផ្ញើទៅកាន់ Telegram Bot',
    count: totalToday
  };
}

/**
 * Check and auto-send 6:00 PM (18:00 ICT) Daily Summary to Telegram Bot
 * Runs automatically every minute if app is open
 */
export async function checkAndAutoSendDaily6PMSummary(
  items: DistributionReportItem[],
  customSettings?: AppSettings
): Promise<{ triggered: boolean; message?: string }> {
  if (customSettings?.telegramDailySummaryEnabled === false) {
    return { triggered: false, message: 'Auto 6 PM Telegram summary is disabled in settings' };
  }

  const todayStr = getTodayDateStringPhnomPenh();
  let lastSentDate = '';
  try {
    lastSentDate = localStorage.getItem(STORAGE_KEY_DAILY_SUMMARY_SENT) || '';
  } catch {}

  if (lastSentDate === todayStr) {
    return { triggered: false, message: `Summary already sent for today (${todayStr})` };
  }

  // Check current hour in Phnom Penh timezone
  let currentHour = 0;
  let currentMinute = 0;
  try {
    const timeParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Phnom_Penh',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(new Date()).split(':');
    currentHour = parseInt(timeParts[0], 10) || 0;
    currentMinute = parseInt(timeParts[1], 10) || 0;
  } catch {
    const d = new Date();
    currentHour = d.getHours();
    currentMinute = d.getMinutes();
  }

  // Default target time: 18:00 (6:00 PM)
  const targetTimeStr = customSettings?.telegramDailySummaryTime || '18:00';
  const [targetHour, targetMin] = targetTimeStr.split(':').map(n => parseInt(n, 10) || 0);

  const isTimeOrLater = currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMin);

  if (!isTimeOrLater) {
    return { triggered: false, message: `Waiting for ${targetTimeStr} (current time is ${currentHour}:${String(currentMinute).padStart(2, '0')})` };
  }

  // Auto trigger send!
  const { summaries, totalToday } = getOperatorDistributionStats(items, todayStr);
  const res = await sendDailyDistributionSummaryAlert(summaries, totalToday, customSettings, todayStr);

  if (res.success) {
    try {
      localStorage.setItem(STORAGE_KEY_DAILY_SUMMARY_SENT, todayStr);
    } catch {}
    return {
      triggered: true,
      message: `✓ ស្វ័យប្រវត្ត៖ បានផ្ញើសរុបប្រតិបត្តិការម៉ោង ៦ ល្ងាច សម្រាប់ថ្ងៃ ${todayStr} (${totalToday} កញ្ចប់, ${summaries.length} អ្នកធ្វើប្រតិបត្តិការ) ទៅ Telegram រួចរាល់!`
    };
  } else {
    return { triggered: false, message: res.message || 'Telegram API Error' };
  }
}
