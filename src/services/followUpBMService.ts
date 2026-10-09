import { fetchGoogleSheetDataUniversal, SheetColumnDef, SheetRowData } from '../utils/googleSheetFetcher';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { saveAppConfigToSupabase, subscribeToAppConfigFromSupabase } from './supabaseDbService';

export interface FollowUpBMConfig {
  sheetUrl: string;
  sheetName: string;
  updatedAt?: string;
  updatedBy?: string;
}

const CONFIG_DOC_ID = 'followup_bm';
const LOCAL_STORAGE_KEY_URL = 'accounting_followup_bm_sheet_url';
const LOCAL_STORAGE_KEY_SHEET_NAME = 'accounting_followup_bm_sheet_name';

export const DEFAULT_FOLLOWUP_BM_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1C-CYb14ZM146RiD87yjS_rxGmWk1hib4jkoTDT6O-I8/edit?gid=0#gid=0';
export const DEFAULT_FOLLOWUP_BM_SHEET_NAME = 'Data_BM';

/**
 * Get initial FollowUp BM URL from Vite Environment or LocalStorage
 */
export function getInitialFollowUpBMConfig(): FollowUpBMConfig {
  const envUrl = (import.meta as any).env?.VITE_FOLLOWUP_BM_SHEET_URL || '';
  const envSheetName = (import.meta as any).env?.VITE_FOLLOWUP_BM_SHEET_NAME || '';
  const localUrl = localStorage.getItem(LOCAL_STORAGE_KEY_URL) || '';
  const localSheetName = localStorage.getItem(LOCAL_STORAGE_KEY_SHEET_NAME) || '';

  return {
    sheetUrl: localUrl || envUrl || DEFAULT_FOLLOWUP_BM_SHEET_URL,
    sheetName: localSheetName || envSheetName || DEFAULT_FOLLOWUP_BM_SHEET_NAME
  };
}

/**
 * Save FollowUp BM Configuration to LocalStorage and Supabase
 */
export async function saveFollowUpBMConfig(config: FollowUpBMConfig): Promise<boolean> {
  const trimmedUrl = config.sheetUrl.trim();
  const trimmedSheetName = config.sheetName.trim();

  // 1. Save to LocalStorage immediately
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_URL, trimmedUrl);
    localStorage.setItem(LOCAL_STORAGE_KEY_SHEET_NAME, trimmedSheetName);
  } catch (e) {
    console.warn('Failed to save FollowUp BM config locally:', e);
  }

  // 2. Sync to Supabase so all users see the updated link
  const savedToDb = await saveAppConfigToSupabase(CONFIG_DOC_ID, {
    sheetUrl: trimmedUrl,
    sheetName: trimmedSheetName,
    updatedAt: new Date().toISOString(),
    updatedBy: config.updatedBy || 'admin'
  });

  return savedToDb;
}

/**
 * Subscribe to FollowUp BM Configuration from Supabase Realtime
 */
export function subscribeToFollowUpBMConfig(
  onUpdate: (config: FollowUpBMConfig) => void
): () => void {
  return subscribeToAppConfigFromSupabase(CONFIG_DOC_ID, (data: any) => {
    if (data && data.sheetUrl) {
      localStorage.setItem(LOCAL_STORAGE_KEY_URL, data.sheetUrl.trim());
      if (data.sheetName !== undefined) {
        localStorage.setItem(LOCAL_STORAGE_KEY_SHEET_NAME, data.sheetName.trim());
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

export function getCachedFollowUpBM(): { rows: SheetRowData[]; columns: SheetColumnDef[]; lastSync?: string } {
  try {
    const rawRows = localStorage.getItem('accounting_followup_bm_cached_rows');
    const rawCols = localStorage.getItem('accounting_followup_bm_cached_cols');
    const lastSync = localStorage.getItem('accounting_followup_bm_last_sync') || undefined;
    const rows: SheetRowData[] = rawRows ? JSON.parse(rawRows) : [];
    const columns: SheetColumnDef[] = rawCols ? JSON.parse(rawCols) : [];
    return { rows, columns, lastSync };
  } catch (e) {
    return { rows: [], columns: [] };
  }
}

export async function fetchLiveFollowUpBMData(
  customUrl?: string, 
  customSheetName?: string
): Promise<{ rows: SheetRowData[]; columns: SheetColumnDef[]; success: boolean }> {
  const config = getInitialFollowUpBMConfig();
  const url = (customUrl && customUrl.trim()) || config.sheetUrl;
  const name = (customSheetName && customSheetName.trim()) || config.sheetName;

  if (!url) {
    const cached = getCachedFollowUpBM();
    return { rows: cached.rows, columns: cached.columns, success: cached.rows.length > 0 };
  }

  try {
    const res = await fetchGoogleSheetDataUniversal(url, name);
    if (res.success && res.rows && res.rows.length > 0) {
      localStorage.setItem('accounting_followup_bm_cached_rows', JSON.stringify(res.rows));
      localStorage.setItem('accounting_followup_bm_cached_cols', JSON.stringify(res.columns));
      const nowStr = new Date().toISOString();
      localStorage.setItem('accounting_followup_bm_last_sync', nowStr);
      return { rows: res.rows, columns: res.columns, success: true };
    }
  } catch (e) {
    console.warn('Failed to fetch live FollowUp BM:', e);
  }
  const cached = getCachedFollowUpBM();
  return { rows: cached.rows, columns: cached.columns, success: cached.rows.length > 0 };
}
