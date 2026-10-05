import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from '../firebase';
import { fetchGoogleSheetDataUniversal, SheetColumnDef, SheetRowData, FetchSheetResult } from '../utils/googleSheetFetcher';

export interface DataReportConfig {
  sheetUrl: string;
  sheetName?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const CONFIG_DOC_PATH = 'app_config';
const CONFIG_DOC_ID = 'data_report';
const LOCAL_STORAGE_KEY_URL = 'accounting_data_report_sheet_url';
const LOCAL_STORAGE_KEY_SHEET_NAME = 'accounting_data_report_sheet_name';
const LOCAL_STORAGE_KEY_CACHE = 'accounting_data_report_cached_rows';
const LOCAL_STORAGE_KEY_COLS_CACHE = 'accounting_data_report_cached_cols';

/**
 * Get initial Data Report configuration from Vite environment, LocalStorage, or fallback
 */
export function getInitialDataReportConfig(): DataReportConfig {
  const envUrl = (import.meta as any).env?.VITE_DATA_REPORT_SHEET_URL || '';
  const envSheetName = (import.meta as any).env?.VITE_DATA_REPORT_SHEET_NAME || '';
  const localUrl = localStorage.getItem(LOCAL_STORAGE_KEY_URL) || '';
  const localSheetName = localStorage.getItem(LOCAL_STORAGE_KEY_SHEET_NAME) || '';

  return {
    sheetUrl: localUrl || envUrl || '',
    sheetName: localSheetName || envSheetName || ''
  };
}

/**
 * Save Data Report configuration to LocalStorage and Firebase Firestore
 */
export async function saveDataReportConfig(config: DataReportConfig): Promise<boolean> {
  const trimmedUrl = (config.sheetUrl || '').trim();
  const trimmedSheetName = (config.sheetName || '').trim();

  // 1. Save to LocalStorage immediately
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_URL, trimmedUrl);
    localStorage.setItem(LOCAL_STORAGE_KEY_SHEET_NAME, trimmedSheetName);
  } catch (e) {
    console.warn('Failed to save Data Report config locally:', e);
  }

  // 2. Sync to Firebase Firestore so all users on Vercel see the updated link!
  const db = getDb();
  if (db && isFirebaseConfigured()) {
    try {
      const configRef = doc(db, CONFIG_DOC_PATH, CONFIG_DOC_ID);
      await setDoc(configRef, {
        sheetUrl: trimmedUrl,
        sheetName: trimmedSheetName,
        updatedAt: new Date().toISOString(),
        updatedBy: config.updatedBy || 'admin'
      }, { merge: true });
      return true;
    } catch (e) {
      console.warn('Failed to sync Data Report config to Firestore:', e);
    }
  }

  return true;
}

/**
 * Subscribe to Data Report configuration updates from Firestore
 */
export function subscribeToDataReportConfig(
  onUpdate: (config: DataReportConfig) => void
): () => void {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    return () => {};
  }

  try {
    const configRef = doc(db, CONFIG_DOC_PATH, CONFIG_DOC_ID);
    const unsubscribe = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as DataReportConfig;
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
      console.debug('Data Report Firestore subscription info:', err?.message || err);
    });

    return unsubscribe;
  } catch (e) {
    console.debug('Failed to subscribe to Data Report config:', e);
    return () => {};
  }
}

/**
 * Cache fetched rows and columns to LocalStorage
 */
export function cacheDataReportLocally(rows: SheetRowData[], columns: SheetColumnDef[]): void {
  try {
    // Only cache reasonable size to prevent quota exceeded errors
    const sample = rows.slice(0, 1500);
    localStorage.setItem(LOCAL_STORAGE_KEY_CACHE, JSON.stringify(sample));
    localStorage.setItem(LOCAL_STORAGE_KEY_COLS_CACHE, JSON.stringify(columns));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('accounting_data_report_updated'));
    }
  } catch (e) {
    console.debug('Could not cache Data Report rows:', e);
  }
}

/**
 * Retrieve cached rows and columns from LocalStorage
 */
export function getCachedDataReport(): { rows: SheetRowData[]; columns: SheetColumnDef[] } {
  try {
    const cachedRows = localStorage.getItem(LOCAL_STORAGE_KEY_CACHE);
    const cachedCols = localStorage.getItem(LOCAL_STORAGE_KEY_COLS_CACHE);
    if (cachedRows && cachedCols) {
      return {
        rows: JSON.parse(cachedRows),
        columns: JSON.parse(cachedCols)
      };
    }
  } catch (e) {
    console.debug('Failed to parse cached Data Report:', e);
  }
  return { rows: [], columns: [] };
}

/**
 * Extract all distinct destination values from the DESTINATION column of Data Report
 */
export function getDataReportDestinations(): string[] {
  try {
    const { rows = [], columns = [] } = getCachedDataReport();
    if (!rows || rows.length === 0) return [];

    const candidateLabels = [
      'DESTINATION',
      'DESTINATION (គោលដៅ)',
      'គោលដៅ',
      'ទិសដៅ',
      'ទីតាំង',
      'ខេត្ត',
      'ខេត្ត-ក្រុង',
      'PROVINCE',
      'LOCATION',
      'BRANCH',
      'DEST'
    ];

    let destColId: string | null = null;

    // 1. Exact match on label or id
    for (const cand of candidateLabels) {
      const target = cand.trim().toUpperCase();
      const found = columns.find((c) => {
        const lbl = (c.label || '').trim().toUpperCase();
        const id = (c.id || '').trim().toUpperCase();
        return lbl === target || id === target;
      });
      if (found) {
        destColId = found.id;
        break;
      }
    }

    // 2. Partial match if exact match not found
    if (!destColId) {
      for (const cand of candidateLabels) {
        const target = cand.trim().toUpperCase();
        const found = columns.find((c) => {
          const lbl = (c.label || '').trim().toUpperCase();
          const id = (c.id || '').trim().toUpperCase();
          return lbl.includes(target) || id.includes(target);
        });
        if (found) {
          destColId = found.id;
          break;
        }
      }
    }

    const destinationsSet = new Set<string>();

    for (const row of rows) {
      let val = '';
      if (destColId && row[destColId] !== undefined && row[destColId] !== null) {
        val = String(row[destColId]).trim();
      }

      // Fallback: check row properties directly
      if (!val) {
        for (const cand of candidateLabels) {
          const target = cand.toLowerCase();
          for (const [k, v] of Object.entries(row)) {
            if (k === '_id') continue;
            if (k.toLowerCase() === target || k.toLowerCase().includes(target)) {
              const str = String(v || '').trim();
              if (str) {
                val = str;
                break;
              }
            }
          }
          if (val) break;
        }
      }

      // Clean & filter valid values
      if (
        val &&
        val !== '-' &&
        val !== '—' &&
        val !== 'N/A' &&
        val !== '#N/A' &&
        val !== 'null' &&
        val !== 'undefined'
      ) {
        destinationsSet.add(val);
      }
    }

    return Array.from(destinationsSet);
  } catch (err) {
    console.warn('Error extracting destinations from Data Report:', err);
    return [];
  }
}

/**
 * Fetch live data from Google Sheets for Data Report
 */
export async function fetchLiveDataReport(
  sheetUrlInput: string,
  sheetNameInput?: string
): Promise<FetchSheetResult> {
  const effectiveUrl = (sheetUrlInput || '').trim() || localStorage.getItem(LOCAL_STORAGE_KEY_URL) || '';
  const effectiveSheetName = (sheetNameInput || '').trim() || localStorage.getItem(LOCAL_STORAGE_KEY_SHEET_NAME) || undefined;

  if (!effectiveUrl) {
    return {
      success: false,
      columns: [],
      rows: [],
      spreadsheetId: '',
      fetchedVia: 'GVIZ_JSON',
      error: 'សូមបញ្ចូល Link Google Sheets'
    };
  }

  const result = await fetchGoogleSheetDataUniversal(effectiveUrl, effectiveSheetName);

  if (result.success && result.rows.length > 0) {
    cacheDataReportLocally(result.rows, result.columns);
  }

  return result;
}
