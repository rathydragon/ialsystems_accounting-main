import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from '../firebase';
import { fetchGoogleSheetDataUniversal, SheetColumnDef, SheetRowData } from '../utils/googleSheetFetcher';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';

export interface DataBMConfig {
  sheetUrl: string;
  sheetName: string;
  updatedAt?: string;
  updatedBy?: string;
}

const CONFIG_DOC_PATH = 'app_config';
const CONFIG_DOC_ID = 'data_bm';
const LOCAL_STORAGE_KEY_URL = 'accounting_data_bm_sheet_url';
const LOCAL_STORAGE_KEY_SHEET_NAME = 'accounting_data_bm_sheet_name';

/**
 * Get initial Data BM URL from Vite Environment or LocalStorage
 */
export function getInitialDataBMConfig(): DataBMConfig {
  const envUrl = (import.meta as any).env?.VITE_DATA_BM_SHEET_URL || '';
  const envSheetName = (import.meta as any).env?.VITE_DATA_BM_SHEET_NAME || '';
  const localUrl = localStorage.getItem(LOCAL_STORAGE_KEY_URL) || '';
  const localSheetName = localStorage.getItem(LOCAL_STORAGE_KEY_SHEET_NAME) || '';

  return {
    sheetUrl: localUrl || envUrl || '',
    sheetName: localSheetName || envSheetName || ''
  };
}

/**
 * Save Data BM Configuration to LocalStorage and Firestore (for Vercel & multi-device sync)
 */
export async function saveDataBMConfig(config: DataBMConfig): Promise<boolean> {
  // 1. Save to LocalStorage immediately
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_URL, config.sheetUrl.trim());
    localStorage.setItem(LOCAL_STORAGE_KEY_SHEET_NAME, config.sheetName.trim());
  } catch (e) {
    console.warn('Failed to save Data BM config locally:', e);
  }

  // 2. Sync to Firebase Firestore so all users on Vercel see the updated link!
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
      console.warn('Failed to sync Data BM config to Firestore:', e);
    }
  }

  return true;
}

/**
 * Subscribe to Data BM Configuration from Firestore
 */
export function subscribeToDataBMConfig(
  onUpdate: (config: DataBMConfig) => void
): () => void {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    return () => {};
  }

  try {
    const configRef = doc(db, CONFIG_DOC_PATH, CONFIG_DOC_ID);
    const unsubscribe = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as DataBMConfig;
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
      }
    }, (err) => {
      // Graceful fallback to LocalStorage/Defaults if Firestore rules restrict unauthenticated reads
      console.debug('Data BM Firestore subscription info:', err?.message || err);
    });

    return unsubscribe;
  } catch (e) {
    console.warn('Failed to subscribe to Data BM Firestore:', e);
    return () => {};
  }
}

export interface MatchedBMRecord {
  awbn: string;
  usd: number;
  khm: number;
  handleBy: string;
  receiver: string;
  deliveryDate: string;
  dest: string;
  rawRow: SheetRowData;
}

export function parseAmount(val: any): number {
  if (val === undefined || val === null) return 0;
  const str = String(val)
    .replace(/,/g, '')
    .replace(/\$/g, '')
    .replace(/៛/g, '')
    .replace(/KHR/gi, '')
    .replace(/USD/gi, '')
    .trim();
  const num = Number(str);
  return isNaN(num) ? 0 : num;
}

export function getCachedDataBM(): { rows: SheetRowData[]; columns: SheetColumnDef[]; lastSync?: string } {
  try {
    const rawRows = localStorage.getItem('accounting_data_bm_cached_rows');
    const rawCols = localStorage.getItem('accounting_data_bm_cached_cols');
    const lastSync = localStorage.getItem('accounting_data_bm_last_sync') || undefined;
    const rows: SheetRowData[] = rawRows ? JSON.parse(rawRows) : [];
    const columns: SheetColumnDef[] = rawCols ? JSON.parse(rawCols) : [];
    return { rows, columns, lastSync };
  } catch (e) {
    return { rows: [], columns: [] };
  }
}

export async function fetchLiveBMData(
  customUrl?: string, 
  customSheetName?: string
): Promise<{ rows: SheetRowData[]; columns: SheetColumnDef[]; success: boolean }> {
  const config = getInitialDataBMConfig();
  const url = (customUrl && customUrl.trim()) || config.sheetUrl || 'https://docs.google.com/spreadsheets/d/1C-CYb14ZM146RiD87yjS_rxGmWk1hiB4jkoTDT6O-I8/edit#gid=764804833';
  const name = (customSheetName && customSheetName.trim()) || config.sheetName || 'Sort_pending';

  try {
    const res = await fetchGoogleSheetDataUniversal(url, name);
    if (res.success && res.rows && res.rows.length > 0) {
      localStorage.setItem('accounting_data_bm_cached_rows', JSON.stringify(res.rows));
      localStorage.setItem('accounting_data_bm_cached_cols', JSON.stringify(res.columns));
      const nowStr = new Date().toISOString();
      localStorage.setItem('accounting_data_bm_last_sync', nowStr);
      return { rows: res.rows, columns: res.columns, success: true };
    }
  } catch (e) {
    console.warn('Failed to fetch live Data_BM:', e);
  }
  const cached = getCachedDataBM();
  return { rows: cached.rows, columns: cached.columns, success: cached.rows.length > 0 };
}

export function matchBMRecord(
  rawCode: string,
  rows: SheetRowData[],
  columns: SheetColumnDef[]
): MatchedBMRecord | null {
  const cleanCode = sanitizeTrackingCode(rawCode).toLowerCase().trim();
  if (!cleanCode || !rows || rows.length === 0) return null;

  // Detect relevant columns dynamically
  const awbnCol = columns.find(c => {
    const l = c.label.toLowerCase().trim();
    return l.includes('awb') || l.includes('tracking') || l.includes('code');
  }) || columns[1] || columns[0];

  const usdCol = columns.find(c => {
    const l = (c.id + ' ' + c.label).toLowerCase();
    return l.includes('usd') || l.includes('$');
  });

  const khmCol = columns.find(c => {
    const l = (c.id + ' ' + c.label).toLowerCase();
    return l.includes('khm') || l.includes('khr') || l.includes('riel') || l.includes('៛');
  });

  const handleByCol = columns.find(c => {
    const l = c.label.toLowerCase().trim();
    return l.includes('handle') || l.includes('handler') || l.includes('rider');
  });

  const receiverCol = columns.find(c => {
    const l = c.label.toLowerCase().trim();
    return l.includes('rec') || l.includes('cust') || l.includes('client') || l.includes('name');
  });

  const dateCol = columns.find(c => {
    const l = c.label.toLowerCase().trim();
    return (l.includes('delivery') && l.includes('date')) || l.includes('delivery') || l.includes('date');
  });

  const destCol = columns.find(c => {
    const l = c.label.toLowerCase().trim();
    return l.includes('dest');
  });

  // Try matching on awbnCol first
  let foundRow = rows.find(r => {
    if (awbnCol && r[awbnCol.id] !== undefined && r[awbnCol.id] !== null) {
      return sanitizeTrackingCode(String(r[awbnCol.id])).toLowerCase().trim() === cleanCode;
    }
    return false;
  });

  // Fallback: search all columns
  if (!foundRow) {
    foundRow = rows.find(r => {
      return Object.entries(r).some(([k, v]) => {
        if (k.startsWith('_')) return false;
        if (v === undefined || v === null) return false;
        return sanitizeTrackingCode(String(v)).toLowerCase().trim() === cleanCode;
      });
    });
  }

  if (!foundRow) return null;

  const rawUsd = usdCol ? foundRow[usdCol.id] : undefined;
  const rawKhm = khmCol ? foundRow[khmCol.id] : undefined;
  const rawHandleBy = handleByCol ? foundRow[handleByCol.id] : undefined;
  const rawReceiver = receiverCol ? foundRow[receiverCol.id] : undefined;
  const rawDate = dateCol ? foundRow[dateCol.id] : undefined;
  const rawDest = destCol ? foundRow[destCol.id] : undefined;

  return {
    awbn: (awbnCol && foundRow[awbnCol.id]) ? String(foundRow[awbnCol.id]).trim() : rawCode,
    usd: parseAmount(rawUsd),
    khm: parseAmount(rawKhm),
    handleBy: rawHandleBy ? String(rawHandleBy).trim() : '',
    receiver: rawReceiver ? String(rawReceiver).trim() : '',
    deliveryDate: rawDate ? String(rawDate).trim() : '',
    dest: rawDest ? String(rawDest).trim() : '',
    rawRow: foundRow
  };
}
