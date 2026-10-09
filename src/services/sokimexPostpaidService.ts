import { fetchGoogleSheetDataUniversal, SheetColumnDef, SheetRowData } from '../utils/googleSheetFetcher';
import { saveAppConfigToSupabase, subscribeToAppConfigFromSupabase } from './supabaseDbService';

export interface SokimexPostpaidConfig {
  sheetUrl: string;
  sheetName: string;
  updatedAt?: string;
  updatedBy?: string;
}

const CONFIG_DOC_ID = 'sokimex_postpaid';
export const LOCAL_STORAGE_KEY_SOKIMEX_URL = 'accounting_sokimex_sheet_url';
export const LOCAL_STORAGE_KEY_SOKIMEX_SHEET_NAME = 'accounting_sokimex_sheet_name';
export const LOCAL_STORAGE_KEY_SOKIMEX_CACHED_ROWS = 'accounting_sokimex_cached_rows';
export const LOCAL_STORAGE_KEY_SOKIMEX_CACHED_COLS = 'accounting_sokimex_cached_cols';
export const LOCAL_STORAGE_KEY_SOKIMEX_LAST_SYNC = 'accounting_sokimex_last_sync';

export const DEFAULT_SOKIMEX_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1OQFwNcbajxsKLu6-y-Bi7tQaXQIn08lPfAog8LnwmXE/edit?gid=1104637417#gid=1104637417';
export const DEFAULT_SOKIMEX_SHEET_NAME = 'Data_Sokimic';

/**
 * Get initial Sokimex Postpaid Sheet config from Vite Environment or LocalStorage
 */
export function getInitialSokimexConfig(): SokimexPostpaidConfig {
  const envUrl = (import.meta as any).env?.VITE_SOKIMEX_SHEET_URL || '';
  const envSheetName = (import.meta as any).env?.VITE_SOKIMEX_SHEET_NAME || '';
  const localUrl = localStorage.getItem(LOCAL_STORAGE_KEY_SOKIMEX_URL) || '';
  const localSheetName = localStorage.getItem(LOCAL_STORAGE_KEY_SOKIMEX_SHEET_NAME) || '';

  return {
    sheetUrl: localUrl || envUrl || DEFAULT_SOKIMEX_SHEET_URL,
    sheetName: localSheetName || envSheetName || DEFAULT_SOKIMEX_SHEET_NAME
  };
}

/**
 * Save Sokimex Postpaid Configuration to LocalStorage and Supabase
 */
export async function saveSokimexConfig(config: SokimexPostpaidConfig): Promise<boolean> {
  const trimmedUrl = config.sheetUrl.trim();
  const trimmedSheetName = config.sheetName.trim();

  // 1. Save to LocalStorage immediately
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_URL, trimmedUrl);
    localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_SHEET_NAME, trimmedSheetName);
  } catch (e) {
    console.warn('Failed to save Sokimex config locally:', e);
  }

  // 2. Sync to Supabase so all users/devices receive the updated link
  const savedToDb = await saveAppConfigToSupabase(CONFIG_DOC_ID, {
    sheetUrl: trimmedUrl,
    sheetName: trimmedSheetName,
    updatedAt: new Date().toISOString(),
    updatedBy: config.updatedBy || 'admin'
  });

  return savedToDb;
}

/**
 * Subscribe to Sokimex Configuration changes in Supabase Realtime
 */
export function subscribeToSokimexConfig(
  onUpdate: (config: SokimexPostpaidConfig) => void
): () => void {
  return subscribeToAppConfigFromSupabase(CONFIG_DOC_ID, (data: any) => {
    if (data && data.sheetUrl) {
      localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_URL, data.sheetUrl.trim());
      if (data.sheetName !== undefined) {
        localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_SHEET_NAME, data.sheetName.trim());
      }
      onUpdate({
        sheetUrl: data.sheetUrl,
        sheetName: data.sheetName || '',
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
      });
    }
  });
}

/**
 * Retrieve cached Sokimex Postpaid rows & columns
 */
export function getCachedSokimexData(): { rows: SheetRowData[]; columns: SheetColumnDef[]; lastSync?: string } {
  try {
    const rawRows = localStorage.getItem(LOCAL_STORAGE_KEY_SOKIMEX_CACHED_ROWS);
    const rawCols = localStorage.getItem(LOCAL_STORAGE_KEY_SOKIMEX_CACHED_COLS);
    const lastSync = localStorage.getItem(LOCAL_STORAGE_KEY_SOKIMEX_LAST_SYNC) || undefined;
    const rows: SheetRowData[] = rawRows ? JSON.parse(rawRows) : [];
    const columns: SheetColumnDef[] = rawCols ? JSON.parse(rawCols) : [];
    return { rows, columns, lastSync };
  } catch (e) {
    return { rows: [], columns: [] };
  }
}

/**
 * Fetch live data from Google Sheets for Sokimex Postpaid
 */
export async function fetchLiveSokimexData(
  customUrl?: string, 
  customSheetName?: string
): Promise<{ rows: SheetRowData[]; columns: SheetColumnDef[]; success: boolean; error?: string }> {
  const config = getInitialSokimexConfig();
  const url = (customUrl && customUrl.trim()) || config.sheetUrl;
  const name = (customSheetName && customSheetName.trim()) || config.sheetName;

  if (!url) {
    const cached = getCachedSokimexData();
    return { rows: cached.rows, columns: cached.columns, success: false, error: 'No Google Sheet URL configured' };
  }

  try {
    const res = await fetchGoogleSheetDataUniversal(url, name);
    if (res.success && res.rows) {
      localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_CACHED_ROWS, JSON.stringify(res.rows));
      localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_CACHED_COLS, JSON.stringify(res.columns));
      const nowStr = new Date().toISOString();
      localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_LAST_SYNC, nowStr);
      return { rows: res.rows, columns: res.columns, success: true };
    }
    return { rows: [], columns: [], success: false, error: res.error };
  } catch (e: any) {
    console.warn('Failed to fetch live Sokimex data:', e);
    const cached = getCachedSokimexData();
    return { rows: cached.rows, columns: cached.columns, success: false, error: e?.message };
  }
}
