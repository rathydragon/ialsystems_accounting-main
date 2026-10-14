import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { formatToStandardDateTime } from '../utils/dateFormatter';
import { AuthUser, UserPermission, normalizeUserRole, OperatorDistributionSummary, AppSettings } from '../types';
import { isMasterAdmin } from './userPermissionService';
import { sendDailyDistributionSummaryAlert, normalizeDailySummaryTime } from './telegramService';
import {
  saveDistributionReport as saveDbDistributionReport,
  saveDistributionReportBatch,
  deleteDistributionReport as deleteDbDistributionReport,
  deleteDistributionReportBatch,
  subscribeToDistributionReports as subscribeDbDistributionReports,
  fetchDistributionReports as fetchDbDistributionReports,
  saveAppConfig,
  fetchAppConfig
} from './localDbService';
import {
  saveDistributionReportToMaster,
  deleteDistributionReportFromMaster
} from './mysqlMasterService';

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
 * Get initial distribution reports from LocalStorage
 */
export function getInitialDistributionReports(): DistributionReportItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => ({
          ...item,
          date: item.date ? formatToStandardDateTime(item.date).slice(0, 10) : ''
        }));
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

  const cleanDate = data.date ? formatToStandardDateTime(data.date).slice(0, 10) : now.slice(0, 10);

  const fullItem: DistributionReportItem = {
    id,
    barcode: cleanBarcode,
    name: (data.name || '').trim(),
    date: cleanDate,
    remarks: (data.remarks || '').trim(),
    createdAt: data.createdAt ? formatToStandardDateTime(data.createdAt) : now,
    createdBy: data.createdBy || 'User',
    operatorEmail: operatorEmail || '',
    updatedAt: now
  };

  const existing = getInitialDistributionReports();

  // Allow recording entries even if barcode exists (e.g. multiple dispatches/dates/recipients)
  // Each entry maintains its own unique ID in LocalStorage and Database


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

  // 2. Sync to local database in background (non-blocking & instant real-time)
  saveDbDistributionReport(fullItem).catch((e: any) => {
    console.warn('Background sync to database notice:', e?.message || e);
  });

  // 3. Sync to Google Sheets in background (optional/async)
  syncDistributionReportToGoogleSheets(fullItem, (data as any)?.webAppUrl).catch(() => {});

  // 4. Sync to Hostinger Remote MySQL Master Database (Real-time Instant CRUD)
  saveDistributionReportToMaster(fullItem).catch((e: any) => {
    console.warn('MySQL Master real-time save notice:', e);
  });

  // 5. Sync to local PostgreSQL server endpoint in background
  if (typeof fetch === 'function') {
    fetch('/api/distribution-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: fullItem })
    }).catch(() => {});
  }

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

  // 2. Delete from local database in background
  deleteDbDistributionReport(id).catch((e) => {
    console.warn('Background delete from database notice:', e);
  });

  // 3. Delete from Google Sheets in background
  deleteDistributionReportFromGoogleSheets(id, barcode, webAppUrl).catch(() => {});

  // 4. Delete from Hostinger Remote MySQL Master Database (Real-time Instant CRUD)
  deleteDistributionReportFromMaster(id, barcode).catch((e: any) => {
    console.warn('MySQL Master real-time delete notice:', e);
  });

  // 5. Delete from local PostgreSQL server endpoint in background
  if (typeof fetch === 'function') {
    fetch('/api/distribution-reports', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    }).catch(() => {});
  }

  return true;
}

export const OLD_DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxJfGBTd2iGI3cf2xaIs19p1Oha6QxbS5Rquu0NH7ZAbzrTMUdimG_LE3DynlEU6pQReA/exec';
export const PREV_DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzLT1Yymc5zMv4lwldSQ0ft_LxcSbfdenvMzzQICKRb1gHGLGQFeCPis2tj3lwb3gPEXg/exec';
export const PREV_V3_DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxpbFtdZgdXUUWU6DJiU5uxiQSEat4t6wSVOy3xKsuBM13giEm1j54MmjsOjowJ6jc5cA/exec';
export const CURRENT_DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw2LXj5geGy_GNMQ-YhvHeQTcsoGHMS3dcoxvTCX6dZesG1FHtYNLku9jMG3HtYiH138Q/exec';

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
        parsed.webAppUrl.trim() !== OLD_DEFAULT_WEBAPP_URL &&
        parsed.webAppUrl.trim() !== PREV_DEFAULT_WEBAPP_URL &&
        parsed.webAppUrl.trim() !== PREV_V3_DEFAULT_WEBAPP_URL
      ) {
        return parsed.webAppUrl.trim();
      }
    }
  } catch (_) {}
  const envUrl = (import.meta as any).env?.VITE_GOOGLE_WEBAPP_URL;
  if (
    envUrl &&
    typeof envUrl === 'string' &&
    envUrl.trim() !== OLD_DEFAULT_WEBAPP_URL &&
    envUrl.trim() !== PREV_DEFAULT_WEBAPP_URL &&
    envUrl.trim() !== PREV_V3_DEFAULT_WEBAPP_URL
  ) {
    return envUrl.trim();
  }
  return CURRENT_DEFAULT_WEBAPP_URL;
}

/**
 * Sync a single distribution report to Google Sheets
 */
export async function syncDistributionReportToGoogleSheets(
  report: DistributionReportItem,
  webAppUrl?: string
): Promise<boolean> {
  const cleanUrl = webAppUrl?.trim();
  const targetUrl = (cleanUrl && cleanUrl !== OLD_DEFAULT_WEBAPP_URL) ? cleanUrl : getStoredWebAppUrl();
  if (!targetUrl) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'save_distribution_report',
        report
      }),
      signal: controller.signal
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { status: 'error', message: text };
    }
    return data?.status === 'success';
  } catch (err) {
    console.warn('Google Sheets syncDistributionReport error:', err);
    return false;
  } finally {
    clearTimeout(timeoutId);
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
  const cleanUrl = webAppUrl?.trim();
  const targetUrl = (cleanUrl && cleanUrl !== OLD_DEFAULT_WEBAPP_URL) ? cleanUrl : getStoredWebAppUrl();
  if (!targetUrl) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'delete_distribution_report',
        id,
        barcode
      }),
      signal: controller.signal
    });
    return true;
  } catch (err) {
    console.warn('Google Sheets deleteDistributionReport error:', err);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Bulk sync all distribution reports to Google Sheets
 */
export async function syncAllDistributionReportsToGoogleSheets(
  reports?: DistributionReportItem[],
  webAppUrl?: string
): Promise<{ success: boolean; count: number; error?: string; needsNewDeploy?: boolean }> {
  const cleanUrl = webAppUrl?.trim();
  const targetUrl = (cleanUrl && cleanUrl !== OLD_DEFAULT_WEBAPP_URL) ? cleanUrl : getStoredWebAppUrl();
  if (!targetUrl) {
    return { success: false, count: 0, error: 'មិនទាន់ភ្ជាប់ Google Sheets Web App URL ទេ (សូមពិនិត្យមើលក្នុង Settings)' };
  }

  const items = reports && reports.length > 0 ? reports : getInitialDistributionReports();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'sync_distribution_reports',
        reports: items
      }),
      signal: controller.signal
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { status: 'error', message: text };
    }
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
    if (err?.name === 'AbortError') {
      return { success: false, count: 0, error: 'សំណើរទៅកាន់ Google Sheets ចំណាយពេលយូរពេក (Timeout 35s)' };
    }
    return { success: false, count: 0, error: err?.message || 'Network error' };
  } finally {
    clearTimeout(timeoutId);
  }
}

let isSyncingLocalDistReports = false;

/**
 * Automatically sync any missing local reports to database (fast & non-blocking)
 */
export async function syncLocalDistributionReports(specificItems?: DistributionReportItem[]): Promise<number> {
  const targetItems = specificItems || getInitialDistributionReports();
  if (targetItems.length === 0) return 0;

  try {
    const success = await saveDistributionReportBatch(targetItems);
    return success ? targetItems.length : 0;
  } catch (err) {
    console.warn('Failed to batch sync distribution reports to database:', err);
    return 0;
  }
}

// Alias for backwards compatibility
export const syncLocalDistributionReportsToFirestore = syncLocalDistributionReports;

/**
 * Subscribe to real-time distribution reports updates from database
 */
export function subscribeToDistributionReports(
  onUpdate: (items: DistributionReportItem[]) => void
): () => void {
  return subscribeDbDistributionReports((items) => {
    // Two-way merge with local storage
    const localItems = getInitialDistributionReports();
    const cloudIdSet = new Set(items.map((it) => it.id));
    const unsyncedItems = localItems.filter((loc) => loc.id && !cloudIdSet.has(loc.id));

    const finalMerged = [...items];
    if (unsyncedItems.length > 0) {
      finalMerged.push(...unsyncedItems);
      setTimeout(() => {
        saveDistributionReportBatch(unsyncedItems).catch(() => {});
      }, 500);
    }

    finalMerged.sort((a, b) => {
      const dateDiff = (b.date || '').localeCompare(a.date || '');
      if (dateDiff !== 0) return dateDiff;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(finalMerged));
    } catch {}

    onUpdate(finalMerged);
  });
}

/**
 * Fetch all distribution reports from server (PostgreSQL primary, Google Sheets secondary fallback)
 */
export async function fetchDistributionReportsFromServer(
  webAppUrl?: string
): Promise<{ success: boolean; count: number; items: DistributionReportItem[]; source: string }> {
  let fetchedItems: DistributionReportItem[] = [];
  let source = 'empty';

  // 1. Try Hostinger Remote MySQL Master endpoint (/api/remote-mysql?action=get_distribution_reports)
  try {
    const res = await fetch('/api/remote-mysql?action=get_distribution_reports&t=' + Date.now());
    if (res.ok) {
      const json = await res.json();
      if (json && json.ok && Array.isArray(json.data) && json.data.length > 0) {
        fetchedItems = json.data;
        source = 'hostinger_mysql_master';
      }
    }
  } catch (e) {
    console.debug('Failed to fetch from /api/remote-mysql:', e);
  }

  // 2. Try local server endpoint (/api/distribution-reports)
  if (fetchedItems.length === 0) {
    try {
      const res = await fetch('/api/distribution-reports', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
          fetchedItems = json.data;
          source = json.source || 'local_postgresql';
        }
      }
    } catch (e) {
      console.debug('Failed to fetch from /api/distribution-reports:', e);
    }
  }

  // 2. If server API returned 0 or failed, try Google Apps Script webAppUrl
  if (fetchedItems.length === 0) {
    try {
      const cleanUrl = webAppUrl?.trim();
      const targetUrl = (cleanUrl && cleanUrl !== OLD_DEFAULT_WEBAPP_URL) ? cleanUrl : getStoredWebAppUrl();
      if (targetUrl) {
        const fetchUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}action=get_distribution_reports`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(fetchUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const json = await res.json();
          if (json && json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
            fetchedItems = json.data;
            source = 'google_sheets';
          }
        }
      }
    } catch (e) {
      console.debug('Failed to fetch distribution reports from Google Sheets:', e);
    }
  }

  // Merge with existing local storage items
  const localItems = getInitialDistributionReports();
  const remoteMap = new Map<string, DistributionReportItem>();
  for (const it of fetchedItems) {
    if (it && it.id) remoteMap.set(it.id, it);
  }
  for (const loc of localItems) {
    if (loc && loc.id && !remoteMap.has(loc.id)) {
      remoteMap.set(loc.id, loc);
    }
  }

  const finalItems = Array.from(remoteMap.values());
  finalItems.sort((a, b) => {
    const dateDiff = (b.date || '').localeCompare(a.date || '');
    if (dateDiff !== 0) return dateDiff;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  if (finalItems.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(finalItems));
    } catch {}
  }

  return {
    success: finalItems.length > 0,
    count: finalItems.length,
    items: finalItems,
    source
  };
}

/**
 * Force bidirectional sync between LocalStorage, Server API, and Google Sheets
 */
export async function forceSyncDistributionReports(webAppUrl?: string): Promise<{ success: boolean; pushed: number; total: number }> {
  try {
    const serverResult = await fetchDistributionReportsFromServer(webAppUrl);
    const pushed = await syncLocalDistributionReports();

    return { success: serverResult.success, pushed, total: serverResult.count };
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
 * Extract YYYY-MM-DD in Asia/Phnom_Penh timezone strictly from createdAt (preferred) or date (fallback)
 */
export function getItemCreatedDatePhnomPenh(createdAt?: string, fallbackDate?: string): string {
  if (createdAt && typeof createdAt === 'string' && createdAt.trim()) {
    const raw = createdAt.trim();
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Phnom_Penh',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(d);
      }
    } catch {}
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  // Only fallback to date if createdAt is truly absent or empty
  if (fallbackDate && typeof fallbackDate === 'string' && fallbackDate.trim()) {
    const raw = fallbackDate.trim();
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Phnom_Penh',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(d);
      }
    } catch {}
  }

  return '';
}

/**
 * Group and count distribution transactions by Operator Email (EMAIL អ្នកធ្វើប្រតិបត្តិការ)
 * Strictly counted by Created At (ពេលវេលាកត់ត្រា) in Asia/Phnom_Penh timezone
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
    
    // ⭐️ STRICT: Count transaction by Created At (Asia/Phnom_Penh timezone)
    const recordCreatedDate = getItemCreatedDatePhnomPenh(item.createdAt, item.date);
    const isToday = recordCreatedDate === dateToMatch;

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

// In-memory mutex to prevent concurrent runs within the same browser runtime
let isCheckingOrSendingDailySummary = false;

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

    // Cloud record sync so auto-trigger across all devices/browsers knows today is already sent
    const payload = {
      lastSentDate: dateStr,
      lastSentAt: new Date().toISOString(),
      totalToday,
      operatorsCount: summaries.length,
      status: 'MANUAL_SENT'
    };
    saveAppConfig('system_state_daily_summary', payload).catch(() => {});

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
 * Check and auto-send Daily Summary to Telegram Bot
 * Runs periodically while app is open for Admin
 * Protected against duplicate sends across tabs, multiple devices, and reload re-renders
 */
export async function checkAndAutoSendDaily6PMSummary(
  items: DistributionReportItem[],
  customSettings?: AppSettings
): Promise<{ triggered: boolean; message?: string }> {
  if (customSettings?.telegramDailySummaryEnabled === false) {
    return { triggered: false, message: 'Auto Daily Telegram summary is disabled in settings' };
  }

  if (isCheckingOrSendingDailySummary) {
    return { triggered: false, message: 'Daily summary check/send currently in progress' };
  }

  const todayStr = getTodayDateStringPhnomPenh();

  // 1. Fast local check
  let lastSentDate = '';
  try {
    lastSentDate = localStorage.getItem(STORAGE_KEY_DAILY_SUMMARY_SENT) || '';
  } catch {}

  if (lastSentDate === todayStr) {
    return { triggered: false, message: `Summary already sent for today (${todayStr}) locally` };
  }

  // 2. Normalize scheduled time (Strictly ensures valid 24h 'HH:mm' e.g. '18:00', preventing early morning triggers)
  const targetTimeStr = normalizeDailySummaryTime(customSettings?.telegramDailySummaryTime || '18:00');
  const [targetHour, targetMin] = targetTimeStr.split(':').map(n => parseInt(n, 10));

  // Check current time in Phnom Penh timezone (ICT, UTC+7)
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

  const isTimeOrLater = currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMin);

  if (!isTimeOrLater) {
    return {
      triggered: false,
      message: `Waiting for ${targetTimeStr} (current time is ${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')})`
    };
  }

  // 3. Do not auto-send if reports list is not loaded yet
  if (!items || items.length === 0) {
    return { triggered: false, message: 'Distribution items not loaded yet' };
  }

  // 4. Cloud Distributed Check: verify no other user/browser/tab sent it today
  try {
    const cloudState = await fetchAppConfig('system_state_daily_summary');
    if (cloudState?.lastSentDate === todayStr) {
      try { localStorage.setItem(STORAGE_KEY_DAILY_SUMMARY_SENT, todayStr); } catch {}
      return { triggered: false, message: `Summary already sent for today (${todayStr}) recorded in cloud` };
    }
  } catch (_) {}

  // 5. Acquire mutex lock and set preemptive flag
  isCheckingOrSendingDailySummary = true;
  try {
    try {
      localStorage.setItem(STORAGE_KEY_DAILY_SUMMARY_SENT, todayStr);
    } catch {}

    const { summaries, totalToday } = getOperatorDistributionStats(items, todayStr);
    const res = await sendDailyDistributionSummaryAlert(summaries, totalToday, customSettings, todayStr);

    if (res.success) {
      // Sync state to local database
      const payload = {
        lastSentDate: todayStr,
        lastSentAt: new Date().toISOString(),
        targetTime: targetTimeStr,
        totalToday: totalToday,
        operatorsCount: summaries.length,
        status: 'SENT'
      };
      saveAppConfig('system_state_daily_summary', payload).catch(() => {});

      return {
        triggered: true,
        message: `✓ ស្វ័យប្រវត្ត៖ បានផ្ញើសរុបប្រតិបត្តិការម៉ោង ${targetTimeStr} សម្រាប់ថ្ងៃ ${todayStr} (${totalToday} កញ្ចប់, ${summaries.length} អ្នកធ្វើប្រតិបត្តិការ) ទៅ Telegram រួចរាល់!`
      };
    } else {
      // Release local storage flag on failure so it can retry later
      try {
        localStorage.removeItem(STORAGE_KEY_DAILY_SUMMARY_SENT);
      } catch {}
      return { triggered: false, message: res.message || 'Telegram API Error' };
    }
  } catch (err: any) {
    try {
      localStorage.removeItem(STORAGE_KEY_DAILY_SUMMARY_SENT);
    } catch {}
    return { triggered: false, message: err?.message || 'Error executing daily summary' };
  } finally {
    isCheckingOrSendingDailySummary = false;
  }
}
