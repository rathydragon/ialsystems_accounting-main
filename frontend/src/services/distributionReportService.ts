import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { formatToStandardDateTime, formatDistributionDate, formatToIsoDateOnly } from '../utils/dateFormatter';
import { AuthUser, UserPermission, normalizeUserRole, OperatorDistributionSummary, AppSettings } from '../types';
import { isMasterAdmin } from './userPermissionService';
import { sendDailyDistributionSummaryAlert, normalizeDailySummaryTime } from './telegramService';
import {
  saveDistributionReport as saveDbDistributionReport,
  deleteDistributionReport as deleteDbDistributionReport,
  replaceDistributionReportsCache,
  subscribeToDistributionReports as subscribeDbDistributionReports
} from './localDbService';
import {
  saveDistributionReportToMaster,
  deleteDistributionReportFromMaster,
  dailySummaryLock
} from './mysqlMasterService';
import { authFetch } from './apiClient';
import { saveListCache } from '../utils/safeStorage';

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
  /** Proof photo in Google Drive (required for Delivery users) */
  photoFileId?: string;
  photoUrl?: string;
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

  const allowedRoles = ['ADMIN', 'OWNER', 'GENERAL_MANAGER', 'MANAGER', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS_OPT'];
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

  const allowedRoles = ['ADMIN', 'OWNER', 'GENERAL_MANAGER', 'MANAGER', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS_OPT'];
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
          date: item.date ? formatDistributionDate(item.date) : ''
        }));
      }
    }
  } catch (e) {
    console.debug('Failed to load local distribution reports:', e);
  }
  return [];
}

/**
 * IDs deleted in this tab during the last few minutes. A server list fetched before the delete
 * committed (e.g. the 4s master poll) must not flash the deleted row back onto the screen.
 */
const RECENTLY_DELETED_TTL_MS = 5 * 60 * 1000;
const recentlyDeletedIds = new Map<string, number>();

function markRecentlyDeleted(id: string) {
  recentlyDeletedIds.set(id, Date.now());
}

function withoutRecentlyDeleted(items: DistributionReportItem[]): DistributionReportItem[] {
  if (recentlyDeletedIds.size === 0) return items;
  const now = Date.now();
  for (const [id, at] of recentlyDeletedIds) {
    if (now - at > RECENTLY_DELETED_TTL_MS) recentlyDeletedIds.delete(id);
  }
  return items.filter((it) => !recentlyDeletedIds.has(it.id));
}

/**
 * Replace every local copy (LocalStorage + in-memory cache) with the authoritative list from
 * Hostinger MySQL. Local caches are read-only mirrors and are never pushed back to the server.
 */
let lastServerApplyAt = 0;

/** When the list was last replaced from Hostinger (0 = not yet in this tab). */
export function getLastServerDistributionSyncAt(): number {
  return lastServerApplyAt;
}

export function applyServerDistributionReports(items: DistributionReportItem[]): DistributionReportItem[] {
  lastServerApplyAt = Date.now();
  const finalItems = withoutRecentlyDeleted(
    items.map((item) => ({
      ...item,
      date: item.date ? formatDistributionDate(item.date) : ''
    }))
  ).sort((a, b) => {
    const timeB = b.createdAt || formatToIsoDateOnly(b.date) || '';
    const timeA = a.createdAt || formatToIsoDateOnly(a.date) || '';
    return timeB.localeCompare(timeA);
  });

  // Quota-safe: trims to the newest items that fit instead of failing (Hostinger stays the source of truth)
  saveListCache(STORAGE_KEY, finalItems, 20000);
  replaceDistributionReportsCache(finalItems);
  return finalItems;
}

/**
 * Uploads a proof photo to Google Drive (through the server); returns the Drive file id and link.
 */
export async function uploadDistributionPhoto(
  imageBase64: string,
  barcode: string,
  webAppUrl?: string
): Promise<{ fileId: string; fileUrl: string }> {
  const res = await authFetch('/api/remote-mysql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upload_distribution_photo', imageBase64, barcode, webAppUrl: webAppUrl || '' })
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !json?.ok || !json?.data?.fileId) {
    if (res.status === 413) throw new Error('រូបភាពធំពេក សូមថតម្តងទៀត');
    throw new Error(json?.message || `Upload រូបភាពបរាជ័យ (HTTP ${res.status})`);
  }
  return json.data;
}

export const distributionPhotoThumb = (fileId: string, width = 200) => `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;

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

  const cleanDate = data.date ? formatDistributionDate(data.date) : formatDistributionDate(now);

  const fullItem: DistributionReportItem = {
    id,
    barcode: cleanBarcode,
    name: (data.name || '').trim(),
    date: cleanDate,
    remarks: (data.remarks || '').trim(),
    createdAt: data.createdAt ? formatToStandardDateTime(data.createdAt) : now,
    createdBy: data.createdBy || 'User',
    operatorEmail: operatorEmail || '',
    updatedAt: now,
    ...(data.photoFileId ? { photoFileId: data.photoFileId, photoUrl: data.photoUrl || '' } : {})
  };

  const existing = getInitialDistributionReports();

  // Allow recording entries even if barcode exists (e.g. multiple dispatches/dates/recipients)
  // Each entry maintains its own unique ID in LocalStorage and Database


  // 1. Authoritative Primary Database write (Hostinger Remote MariaDB Master tbl_distribution_reports)
  const masterOk = await saveDistributionReportToMaster(fullItem);
  if (!masterOk) {
    throw new Error('បរាជ័យក្នុងការរក្សាទុកទៅកាន់ Hostinger MariaDB Master (tbl_distribution_reports)! សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត។');
  }

  // 2. Only after Primary commits: update LocalStorage
  try {
    const index = existing.findIndex((item) => item.id === id);
    let updatedList: DistributionReportItem[];

    if (index >= 0) {
      updatedList = [...existing];
      updatedList[index] = fullItem;
    } else {
      updatedList = [fullItem, ...existing];
    }
    saveListCache(STORAGE_KEY, updatedList, 20000);
  } catch (e) {
    console.warn('Failed to save distribution report to localStorage:', e);
  }

  // 3. Update the in-memory cache only (the Hostinger write above is the single DB write —
  //    extra background upserts could land after a quick delete and resurrect the row)
  saveDbDistributionReport(fullItem).catch(() => {});

  // 4. Backup mirror to Google Sheets
  syncDistributionReportToGoogleSheets(fullItem, (data as any)?.webAppUrl).catch(() => {});

  return fullItem;
}

/**
 * Delete a distribution report (Awaits Hostinger MariaDB Master first, then syncs local cache)
 */
export async function deleteDistributionReport(id: string, barcode?: string, webAppUrl?: string): Promise<boolean> {
  // 1. Authoritative Primary Database delete (Hostinger Remote MariaDB Master tbl_distribution_reports)
  const masterOk = await deleteDistributionReportFromMaster(id, barcode);
  if (!masterOk) {
    throw new Error('បរាជ័យក្នុងការលុបពី Hostinger MariaDB Master (tbl_distribution_reports)! សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត។');
  }

  // 2. Only after Primary confirms: remove from LocalStorage
  markRecentlyDeleted(id);
  try {
    const existing = getInitialDistributionReports();
    const filtered = existing.filter((item) => item.id !== id);
    saveListCache(STORAGE_KEY, filtered, 20000);
  } catch (e) {
    console.warn('Failed to remove distribution report from localStorage:', e);
  }

  // 3. Remove from the in-memory cache (Hostinger delete above already recorded a tombstone)
  deleteDbDistributionReport(id).catch(() => {});

  // 4. Delete from Google Sheets in background
  deleteDistributionReportFromGoogleSheets(id, barcode, webAppUrl).catch(() => {});

  return true;
}

export const OLD_DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxJfGBTd2iGI3cf2xaIs19p1Oha6QxbS5Rquu0NH7ZAbzrTMUdimG_LE3DynlEU6pQReA/exec';
export const PREV_DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzLT1Yymc5zMv4lwldSQ0ft_LxcSbfdenvMzzQICKRb1gHGLGQFeCPis2tj3lwb3gPEXg/exec';
export const PREV_V3_DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxpbFtdZgdXUUWU6DJiU5uxiQSEat4t6wSVOy3xKsuBM13giEm1j54MmjsOjowJ6jc5cA/exec';
export const PREV_V4_DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw2LXj5geGy_GNMQ-YhvHeQTcsoGHMS3dcoxvTCX6dZesG1FHtYNLku9jMG3HtYiH138Q/exec';
export const PREV_V5_DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbygSQiOEQX0ip8yb3wcw7Rctjv884tm6BGluiUkkSdxySMfdjtXwvAWS-NEky-HaBr0vQ/exec';
export const PREV_V6_DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxSYmPsF37ycoH9jnEmrK1xBZR9U1zhimCvzWNeedeAkMrjLykCAwW6nuRXVhIEjSq0gw/exec';
export const PREV_V7_DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbz9GbgPEUiOY0i82VO2WahnXW89K5yO1g7hZlNiYIeD2zKXyEwimkUTBNDAflo0bKrXYA/exec';
export const PREV_V8_DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbws4AAj2sTC2rDPRk4gBKsEsHUX80Qf1BJ1kf7Lyhgo_MbtoJAvmDmjBBCQlgu41PJFIQ/exec';
export const CURRENT_DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxWDKd5u7G82MttghlrfJrfxcEjQ73CyEJzN9zlZiRv_gekhAoxK7JMjo-0yj-Y7XY4SA/exec';

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
        parsed.webAppUrl.trim() !== PREV_V3_DEFAULT_WEBAPP_URL &&
        parsed.webAppUrl.trim() !== PREV_V4_DEFAULT_WEBAPP_URL &&
        parsed.webAppUrl.trim() !== PREV_V5_DEFAULT_WEBAPP_URL &&
        parsed.webAppUrl.trim() !== PREV_V6_DEFAULT_WEBAPP_URL &&
        parsed.webAppUrl.trim() !== PREV_V7_DEFAULT_WEBAPP_URL &&
        parsed.webAppUrl.trim() !== PREV_V8_DEFAULT_WEBAPP_URL
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
    envUrl.trim() !== PREV_V3_DEFAULT_WEBAPP_URL &&
    envUrl.trim() !== PREV_V4_DEFAULT_WEBAPP_URL &&
    envUrl.trim() !== PREV_V5_DEFAULT_WEBAPP_URL &&
    envUrl.trim() !== PREV_V6_DEFAULT_WEBAPP_URL &&
    envUrl.trim() !== PREV_V7_DEFAULT_WEBAPP_URL &&
    envUrl.trim() !== PREV_V8_DEFAULT_WEBAPP_URL
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

  // `reports` is ignored on purpose: the Apps Script wipes and rewrites the whole tab, and a
  // browser's list can be partial ("view only own" users) or stale. The server reads every row
  // from MySQL and sends the complete list instead.
  void reports;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 100000);

  try {
    const res = await authFetch('/api/remote-mysql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync_distribution_sheet', webAppUrl: targetUrl }),
      signal: controller.signal
    });
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = { success: false, error: `HTTP ${res.status}` };
    }
    if (data?.success) {
      return { success: true, count: Number(data.count) || 0 };
    }
    if (data?.needsNewDeploy) {
      return {
        success: false,
        count: 0,
        needsNewDeploy: true,
        error: 'Google Apps Script មិនទាន់ស្គាល់មុខងារ «sync_distribution_reports» ទេ (សូមចម្លង Code.gs ទៅ Deploy Version ថ្មី / New version ក្នុង Google Apps Script)'
      };
    }
    return { success: false, count: 0, error: data?.error || data?.message || 'Google Sheets sync failed' };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { success: false, count: 0, error: 'សំណើរទៅកាន់ Google Sheets ចំណាយពេលយូរពេក (Timeout)' };
    }
    return { success: false, count: 0, error: err?.message || 'Network error' };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 🛠️ ជួសជុល និង format ជួរឈរ Date (D) ក្នុង Google Sheets Tab «Distribution_Reports» ឱ្យទៅជា Date Format (dd-mmm-yyyy) 100%
 */
export async function fixGoogleSheetsDistributionDateFormat(webAppUrl?: string): Promise<{ success: boolean; count?: number; message?: string }> {
  const targetUrl = (webAppUrl && webAppUrl !== OLD_DEFAULT_WEBAPP_URL) ? webAppUrl : getStoredWebAppUrl();
  if (!targetUrl) {
    return { success: false, message: 'មិនទាន់ភ្ជាប់ Google Sheets Web App URL ទេ' };
  }

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'fix_distribution_date_format'
      })
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { status: 'error', message: text };
    }
    if (data?.status === 'success') {
      return { success: true, count: data.count, message: data.message };
    }
    return { success: false, message: data?.message || 'Failed to fix date format' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error' };
  }
}

/**
 * Subscribe to distribution report cache updates (local cache mirrors Hostinger MySQL only).
 * Local items are never pushed back to the server here — doing so resurrected deleted reports.
 */
export function subscribeToDistributionReports(
  onUpdate: (items: DistributionReportItem[]) => void
): () => void {
  return subscribeDbDistributionReports((items) => {
    onUpdate(withoutRecentlyDeleted(items));
  });
}

/**
 * Fetch all distribution reports from Hostinger MySQL Master (single source of truth).
 * PostgreSQL / Google Sheets are mirrors only and are never used to load data, because they
 * can lag behind a delete and bring the row back.
 */
export async function fetchDistributionReportsFromServer(
  _webAppUrl?: string
): Promise<{ success: boolean; count: number; items: DistributionReportItem[]; source: string; error?: string }> {
  let error = '';
  try {
    const res = await authFetch('/api/remote-mysql?action=get_distribution_reports&t=' + Date.now());
    const json = await res.json().catch(() => null);
    if (res.ok && json && json.ok && Array.isArray(json.data)) {
      const items = applyServerDistributionReports(json.data);
      return { success: true, count: items.length, items, source: 'hostinger_mysql_master' };
    }
    // Keep the real reason so the user sees e.g. an expired login instead of "cannot connect"
    error = res.status === 401 || res.status === 403
      ? `HTTP ${res.status}: Session ផុតកំណត់ ឬគ្មានសិទ្ធិ (សូម Logout ហើយ Login ម្ដងទៀត)`
      : `HTTP ${res.status}: ${json?.message || json?.error || res.statusText || 'Server error'}`;
  } catch (e: any) {
    error = e?.message || String(e);
    console.debug('Failed to fetch from /api/remote-mysql:', e);
  }

  // Offline: show the last known server copy, read-only
  const cached = getInitialDistributionReports();
  return { success: false, count: cached.length, items: cached, source: 'offline_cache', error };
}

/**
 * Reload distribution reports from Hostinger MySQL Master
 */
export async function forceSyncDistributionReports(webAppUrl?: string): Promise<{ success: boolean; pushed: number; total: number }> {
  const serverResult = await fetchDistributionReportsFromServer(webAppUrl);
  return { success: serverResult.success, pushed: 0, total: serverResult.count };
}

// Cambodia is UTC+7 all year (no daylight saving), so its date is the UTC date of time + 7h.
// Plain arithmetic: a new Intl.DateTimeFormat per call ran for every report on every render
// and froze the Distribution Report page for 2-4 seconds.
const PHNOM_PENH_OFFSET_MS = 7 * 60 * 60 * 1000;
const phnomPenhDate = (ms: number): string => new Date(ms + PHNOM_PENH_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Get current date string formatted as YYYY-MM-DD in Asia/Phnom_Penh timezone
 */
export function getTodayDateStringPhnomPenh(): string {
  return phnomPenhDate(Date.now());
}

// createdAt -> YYYY-MM-DD, so each report's date is worked out once
const createdDateCache = new Map<string, string>();

/**
 * Extract YYYY-MM-DD in Asia/Phnom_Penh timezone strictly from createdAt (preferred) or date (fallback)
 */
export function getItemCreatedDatePhnomPenh(createdAt?: string, fallbackDate?: string): string {
  if (createdAt && typeof createdAt === 'string' && createdAt.trim()) {
    const cached = createdDateCache.get(createdAt);
    if (cached !== undefined) return cached;
    const raw = createdAt.trim();
    const t = new Date(raw).getTime();
    const match = isNaN(t) ? raw.match(/^(\d{4}-\d{2}-\d{2})/) : null;
    const out = !isNaN(t) ? phnomPenhDate(t) : match ? match[1] : '';
    if (out) {
      if (createdDateCache.size > 50000) createdDateCache.clear();
      createdDateCache.set(createdAt, out);
      return out;
    }
  }

  // Only fallback to date if createdAt is truly absent or empty
  if (fallbackDate && typeof fallbackDate === 'string' && fallbackDate.trim()) {
    const isoDate = formatToIsoDateOnly(fallbackDate.trim());
    if (isoDate) return isoDate;
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

    // Record in MySQL so the auto-trigger on every device/browser knows today is already sent
    dailySummaryLock('mark', dateStr).catch(() => {});

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

  isCheckingOrSendingDailySummary = true;
  try {
    // 4. Atomic claim in Hostinger MySQL: only the first device/browser of the day may send
    const lock = await dailySummaryLock('claim', todayStr);
    if (!lock) {
      // Server unreachable: do not risk a duplicate, retry on the next tick
      return { triggered: false, message: 'Could not reach server to claim daily summary lock' };
    }
    if (!lock.claimed) {
      try { localStorage.setItem(STORAGE_KEY_DAILY_SUMMARY_SENT, todayStr); } catch {}
      return { triggered: false, message: `Summary already sent for today (${todayStr}) by another device` };
    }

    try {
      localStorage.setItem(STORAGE_KEY_DAILY_SUMMARY_SENT, todayStr);
    } catch {}

    const { summaries, totalToday } = getOperatorDistributionStats(items, todayStr);
    const res = await sendDailyDistributionSummaryAlert(summaries, totalToday, customSettings, todayStr);

    if (res.success) {
      return {
        triggered: true,
        message: `✓ ស្វ័យប្រវត្ត៖ បានផ្ញើសរុបប្រតិបត្តិការម៉ោង ${targetTimeStr} សម្រាប់ថ្ងៃ ${todayStr} (${totalToday} កញ្ចប់, ${summaries.length} អ្នកធ្វើប្រតិបត្តិការ) ទៅ Telegram រួចរាល់!`
      };
    } else {
      // Release local + MySQL lock on failure so it can retry later
      try {
        localStorage.removeItem(STORAGE_KEY_DAILY_SUMMARY_SENT);
      } catch {}
      await dailySummaryLock('release', todayStr);
      return { triggered: false, message: res.message || 'Telegram API Error' };
    }
  } catch (err: any) {
    try {
      localStorage.removeItem(STORAGE_KEY_DAILY_SUMMARY_SENT);
    } catch {}
    await dailySummaryLock('release', todayStr);
    return { triggered: false, message: err?.message || 'Error executing daily summary' };
  } finally {
    isCheckingOrSendingDailySummary = false;
  }
}
