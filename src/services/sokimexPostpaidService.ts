import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from '../firebase';
import { fetchGoogleSheetDataUniversal, SheetColumnDef, SheetRowData } from '../utils/googleSheetFetcher';

export interface SokimexPostpaidConfig {
  sheetUrl: string;
  sheetName: string;
  updatedAt?: string;
  updatedBy?: string;
}

const CONFIG_DOC_PATH = 'app_config';
const CONFIG_DOC_ID = 'sokimex_postpaid';
export const LOCAL_STORAGE_KEY_SOKIMEX_URL = 'accounting_sokimex_sheet_url';
export const LOCAL_STORAGE_KEY_SOKIMEX_SHEET_NAME = 'accounting_sokimex_sheet_name';
export const LOCAL_STORAGE_KEY_SOKIMEX_CACHED_ROWS = 'accounting_sokimex_cached_rows';
export const LOCAL_STORAGE_KEY_SOKIMEX_CACHED_COLS = 'accounting_sokimex_cached_cols';
export const LOCAL_STORAGE_KEY_SOKIMEX_LAST_SYNC = 'accounting_sokimex_last_sync';

/**
 * Get initial Sokimex Postpaid Sheet config from Vite Environment or LocalStorage
 */
export function getInitialSokimexConfig(): SokimexPostpaidConfig {
  const envUrl = (import.meta as any).env?.VITE_SOKIMEX_SHEET_URL || '';
  const envSheetName = (import.meta as any).env?.VITE_SOKIMEX_SHEET_NAME || '';
  const localUrl = localStorage.getItem(LOCAL_STORAGE_KEY_SOKIMEX_URL) || '';
  const localSheetName = localStorage.getItem(LOCAL_STORAGE_KEY_SOKIMEX_SHEET_NAME) || '';

  return {
    sheetUrl: localUrl || envUrl || '',
    sheetName: localSheetName || envSheetName || ''
  };
}

/**
 * Save Sokimex Postpaid Configuration to LocalStorage and Firestore (for multi-device sync)
 */
export async function saveSokimexConfig(config: SokimexPostpaidConfig): Promise<boolean> {
  // 1. Save to LocalStorage immediately
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_URL, config.sheetUrl.trim());
    localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_SHEET_NAME, config.sheetName.trim());
  } catch (e) {
    console.warn('Failed to save Sokimex config locally:', e);
  }

  // 2. Sync to Firebase Firestore so all users/devices receive the updated link
  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      const configRef = doc(db, CONFIG_DOC_PATH, CONFIG_DOC_ID);
      await setDoc(configRef, {
        sheetUrl: config.sheetUrl.trim(),
        sheetName: config.sheetName.trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: config.updatedBy || 'admin'
      }, { merge: true });
      return true;
    } catch (e) {
      console.warn('Failed to sync Sokimex config to Firestore:', e);
    }
  }

  return true;
}

/**
 * Subscribe to Sokimex Configuration changes in Firestore
 */
export function subscribeToSokimexConfig(
  onUpdate: (config: SokimexPostpaidConfig) => void
): () => void {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    return () => {};
  }

  try {
    const configRef = doc(db, CONFIG_DOC_PATH, CONFIG_DOC_ID);
    const unsubscribe = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as SokimexPostpaidConfig;
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
      }
    }, (err) => {
      console.debug('Sokimex Firestore subscription note:', err?.message || err);
    });

    return unsubscribe;
  } catch (e) {
    console.warn('Could not subscribe to Sokimex config:', e);
    return () => {};
  }
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
