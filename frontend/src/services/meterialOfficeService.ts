import { SheetColumnDef, SheetRowData, FetchSheetResult } from '../utils/googleSheetFetcher';
import { saveAppConfig, subscribeToAppConfig } from './localDbService';
import { saveDisposableCache } from '../utils/safeStorage';
import { authFetch } from './apiClient';

export interface MeterialOfficeConfig {
  sheetUrl: string;
  sheetName?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const CONFIG_DOC_ID = 'meterial_office';
const LOCAL_STORAGE_KEY_URL = 'accounting_meterial_office_sheet_url';
const LOCAL_STORAGE_KEY_SHEET_NAME = 'accounting_meterial_office_sheet_name';
const LOCAL_STORAGE_KEY_CACHE = 'accounting_meterial_office_cached_rows';
const LOCAL_STORAGE_KEY_COLS_CACHE = 'accounting_meterial_office_cached_cols';

export const DEFAULT_METERIAL_OFFICE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1gOjRT40t9RVIIym0Y-Pv_jz0VSkt--icUDrtti-Ljd8/edit?gid=0#gid=0';
export const DEFAULT_METERIAL_OFFICE_SHEET_NAME = 'Truck_Tuk Tuk';

/**
 * Get initial Meterial_Office configuration from Vite environment, LocalStorage, or fallback
 */
export function getInitialMeterialOfficeConfig(): MeterialOfficeConfig {
  const envUrl = (import.meta as any).env?.VITE_METERIAL_OFFICE_SHEET_URL || '';
  const envSheetName = (import.meta as any).env?.VITE_METERIAL_OFFICE_SHEET_NAME || '';
  const localUrl = localStorage.getItem(LOCAL_STORAGE_KEY_URL) || '';
  const localSheetName = localStorage.getItem(LOCAL_STORAGE_KEY_SHEET_NAME) || '';

  return {
    sheetUrl: localUrl || envUrl || DEFAULT_METERIAL_OFFICE_SHEET_URL,
    sheetName: localSheetName || envSheetName || DEFAULT_METERIAL_OFFICE_SHEET_NAME
  };
}

/**
 * Save Meterial_Office configuration to LocalStorage and Local Database
 */
export async function saveMeterialOfficeConfig(config: MeterialOfficeConfig): Promise<boolean> {
  const trimmedUrl = (config.sheetUrl || '').trim();
  const trimmedSheetName = (config.sheetName || '').trim();

  // 1. Save to LocalStorage immediately
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_URL, trimmedUrl);
    localStorage.setItem(LOCAL_STORAGE_KEY_SHEET_NAME, trimmedSheetName);
  } catch (e) {
    console.warn('Failed to save Meterial_Office config locally:', e);
  }

  // 2. Sync to Database so all users on Vercel/multi-devices see the updated link!
  const savedToDb = await saveAppConfig(CONFIG_DOC_ID, {
    sheetUrl: trimmedUrl,
    sheetName: trimmedSheetName,
    updatedAt: new Date().toISOString(),
    updatedBy: config.updatedBy || 'admin'
  });

  return savedToDb;
}

/**
 * Subscribe to Meterial_Office configuration updates
 */
export function subscribeToMeterialOfficeConfig(
  onUpdate: (config: MeterialOfficeConfig) => void
): () => void {
  return subscribeToAppConfig(CONFIG_DOC_ID, (data: any) => {
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

/**
 * Cache fetched rows and columns to LocalStorage
 */
export function cacheMeterialOfficeLocally(rows: SheetRowData[], columns: SheetColumnDef[]): void {
  try {
    // Cache reasonable size to prevent localStorage quota exceeded
    const sample = rows.slice(0, 1500);
    saveDisposableCache(LOCAL_STORAGE_KEY_CACHE, JSON.stringify(sample));
    localStorage.setItem(LOCAL_STORAGE_KEY_COLS_CACHE, JSON.stringify(columns));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('meterial_office_data_updated'));
    }
  } catch (e) {
    console.debug('Could not cache Meterial_Office rows:', e);
  }
}

/**
 * Retrieve cached rows and columns from LocalStorage
 */
export function getCachedMeterialOffice(): { rows: SheetRowData[]; columns: SheetColumnDef[] } {
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
    console.debug('Failed to parse cached Meterial_Office:', e);
  }
  return { rows: [], columns: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hostinger MySQL (tbl_meterial_office) — the source of truth for this page.
// ─────────────────────────────────────────────────────────────────────────────

/** DB column key + the header label shown on the page (labels match the old sheet). */
export const MO_FIELDS: { key: string; label: string; type: SheetColumnDef['type'] }[] = [
  { key: 'name_handle', label: 'Name Handle', type: 'string' },
  { key: 'model_no', label: 'Model No.', type: 'string' },
  { key: 'size_type', label: 'Type', type: 'string' },
  { key: 'card_id', label: 'Card ID', type: 'string' },
  { key: 'details', label: 'Details', type: 'string' },
  { key: 'station', label: 'Station', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'vehicle_type', label: 'Type', type: 'string' },
  { key: 'check_date', label: 'check date', type: 'string' },
  { key: 'check_expire', label: 'Check Expire', type: 'string' },
  { key: 'monthly_limit', label: 'Monthly Limit', type: 'string' },
  { key: 'net_amount_limit', label: 'Net Amount Limit', type: 'string' },
  { key: 'notes', label: 'Notes', type: 'string' },
  { key: 'serial_gps', label: 'Serial_Gps', type: 'string' },
  { key: 'link_sokimic', label: 'Link_Sokimic', type: 'string' }
];

export const MO_COLUMNS: SheetColumnDef[] = MO_FIELDS.map((f) => ({ id: f.key, label: f.label, type: f.type }));

export type MeterialOfficeRecord = { id?: number } & Record<string, string | number | undefined>;

const MO_ENDPOINT = '/api/remote-mysql';

async function moRequest<T = any>(method: 'GET' | 'POST', params: Record<string, unknown>): Promise<T> {
  const res =
    method === 'GET'
      ? await authFetch(`${MO_ENDPOINT}?${new URLSearchParams(params as Record<string, string>).toString()}`)
      : await authFetch(MO_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON error page
  }
  if (!res.ok || !json?.ok) throw new Error(json?.message || `Request failed (HTTP ${res.status})`);
  return json as T;
}

/** DB rows → page rows (`_id` = DB id as string, one key per MO_FIELDS column). */
function toSheetRows(list: any[]): SheetRowData[] {
  return (list || []).map((r) => {
    const row: SheetRowData = { _id: String(r.id), id: Number(r.id) };
    for (const f of MO_FIELDS) row[f.key] = r[f.key] ?? '';
    return row;
  });
}

function cacheAndReturn(list: any[]): SheetRowData[] {
  const rows = toSheetRows(list);
  // Keep the last cache while the table is still empty (before the first import), so the
  // Warehouse page's plate / driver lists don't go blank.
  if (rows.length) cacheMeterialOfficeLocally(rows, MO_COLUMNS);
  return rows;
}

export async function listMeterialOfficeRows(): Promise<SheetRowData[]> {
  const json = await moRequest<{ data: any[] }>('GET', { action: 'meterial_office_list' });
  return cacheAndReturn(json.data);
}

/** Creates (no id) or updates a row. Returns the full, fresh list. */
export async function saveMeterialOfficeRow(row: MeterialOfficeRecord): Promise<SheetRowData[]> {
  const json = await moRequest<{ data: any[] }>('POST', { action: 'meterial_office_save', row });
  return cacheAndReturn(json.data);
}

export async function deleteMeterialOfficeRows(ids: number[]): Promise<SheetRowData[]> {
  const json = await moRequest<{ data: any[] }>('POST', { action: 'meterial_office_delete', ids });
  return cacheAndReturn(json.data);
}

/**
 * Load Meterial_Office rows from Hostinger MySQL (the only data source for this page).
 */
export async function fetchLiveMeterialOffice(
  _sheetUrlInput?: string,
  _sheetNameInput?: string
): Promise<FetchSheetResult> {
  try {
    const rows = await listMeterialOfficeRows();
    return { success: true, columns: MO_COLUMNS, rows, spreadsheetId: '', fetchedVia: 'GVIZ_JSON' };
  } catch (e: any) {
    return {
      success: false,
      columns: [],
      rows: [],
      spreadsheetId: '',
      fetchedVia: 'GVIZ_JSON',
      error: e?.message || 'មិនអាចទាញទិន្នន័យពី Database បានឡើយ'
    };
  }
}

/**
 * Extract distinct Model No. values from Sheet rows and columns.
 * Matches column headers like 'Model No.', 'Model No', 'Model', etc.
 */
export function extractModelNoFromMeterialOffice(
  rows: SheetRowData[],
  columns: SheetColumnDef[]
): string[] {
  if (!rows || rows.length === 0) return [];

  const cleanLabel = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Try exact matches like "modelno", "modelnumber", "modelnum"
  let targetCol = columns?.find((c) => {
    const cl = cleanLabel(c.label);
    return cl === 'modelno' || cl === 'modelnumber' || cl === 'modelnum';
  });

  // 2. If not found, try "model"
  if (!targetCol) {
    targetCol = columns?.find((c) => cleanLabel(c.label) === 'model');
  }

  // 3. Substring match "model" or Khmer "ម៉ូឌែល"
  if (!targetCol) {
    targetCol = columns?.find((c) => {
      const l = (c.label || '').toLowerCase();
      return l.includes('model') || l.includes('ម៉ូឌែល');
    });
  }

  const colId = targetCol ? targetCol.id : null;
  const modelSet = new Set<string>();

  for (const r of rows) {
    let rawVal: any = undefined;

    if (colId && r[colId] !== undefined) {
      rawVal = r[colId];
    } else {
      for (const [k, v] of Object.entries(r)) {
        if (k.startsWith('_')) continue;
        const cl = cleanLabel(k);
        if (cl.includes('model') || k.includes('ម៉ូឌែល')) {
          rawVal = v;
          break;
        }
      }
    }

    if (rawVal !== undefined && rawVal !== null) {
      const valStr = String(rawVal).trim();
      if (
        valStr &&
        valStr !== '-' &&
        valStr !== '--' &&
        valStr !== 'N/A' &&
        valStr !== 'null' &&
        valStr !== 'undefined'
      ) {
        modelSet.add(valStr);
      }
    }
  }

  return Array.from(modelSet).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/**
 * Get Model No list from cached Material Office rows
 */
export function getCachedModelNoList(): string[] {
  const { rows, columns } = getCachedMeterialOffice();
  return extractModelNoFromMeterialOffice(rows, columns);
}

/**
 * Fetch or get Model No list, loading from Hostinger if not cached or forced
 */
export async function getOrFetchModelNoList(
  sheetUrlInput?: string,
  sheetNameInput?: string,
  forceRefresh: boolean = false
): Promise<string[]> {
  const cachedList = getCachedModelNoList();
  if (cachedList.length > 0 && !forceRefresh) {
    return cachedList;
  }

  try {
    const res = await fetchLiveMeterialOffice();
    if (res.success && res.rows.length > 0) {
      return extractModelNoFromMeterialOffice(res.rows, res.columns);
    }
  } catch (e) {
    console.debug('Failed to fetch live Meterial_Office for Model No:', e);
  }

  return cachedList;
}

/**
 * Extract distinct Driver / Name Handle values from Sheet rows and columns.
 * Matches column headers like 'Name Handle', 'Name_Handle', 'Handle', etc.
 */
export function extractNameHandleFromMeterialOffice(
  rows: SheetRowData[],
  columns: SheetColumnDef[]
): string[] {
  if (!rows || rows.length === 0) return [];

  const cleanLabel = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Try exact matches like "namehandle", "namehandles", "handlename"
  let targetCol = columns?.find((c) => {
    const cl = cleanLabel(c.label);
    return cl === 'namehandle' || cl === 'namehandles' || cl === 'handlename';
  });

  // 2. Try contains "handle"
  if (!targetCol) {
    targetCol = columns?.find((c) => {
      const l = (c.label || '').toLowerCase();
      return l.includes('handle');
    });
  }

  // 3. Try "driver" or "drivername"
  if (!targetCol) {
    targetCol = columns?.find((c) => {
      const cl = cleanLabel(c.label);
      return cl === 'driver' || cl === 'drivername' || cl === 'drivers';
    });
  }

  // 4. Try Khmer names "អ្នកកាន់" or "អ្នកបើកបរ" or "តៃកុង"
  if (!targetCol) {
    targetCol = columns?.find((c) => {
      const l = (c.label || '');
      return l.includes('អ្នកកាន់') || l.includes('អ្នកបើកបរ') || l.includes('តៃកុង');
    });
  }

  const colId = targetCol ? targetCol.id : null;
  const nameSet = new Set<string>();

  for (const r of rows) {
    let rawVal: any = undefined;

    if (colId && r[colId] !== undefined) {
      rawVal = r[colId];
    } else {
      for (const [k, v] of Object.entries(r)) {
        if (k.startsWith('_')) continue;
        const cl = cleanLabel(k);
        if (
          cl.includes('namehandle') ||
          cl.includes('handle') ||
          cl.includes('driver') ||
          k.includes('អ្នកកាន់') ||
          k.includes('អ្នកបើកបរ')
        ) {
          rawVal = v;
          break;
        }
      }
    }

    if (rawVal !== undefined && rawVal !== null) {
      const valStr = String(rawVal).trim();
      if (
        valStr &&
        valStr !== '-' &&
        valStr !== '--' &&
        valStr !== 'N/A' &&
        valStr !== 'null' &&
        valStr !== 'undefined'
      ) {
        nameSet.add(valStr);
      }
    }
  }

  return Array.from(nameSet).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/**
 * Get Name Handle list from cached Material Office rows
 */
export function getCachedNameHandleList(): string[] {
  const { rows, columns } = getCachedMeterialOffice();
  return extractNameHandleFromMeterialOffice(rows, columns);
}

/**
 * Fetch or get Name Handle list, loading from Hostinger if not cached or forced
 */
export async function getOrFetchNameHandleList(
  sheetUrlInput?: string,
  sheetNameInput?: string,
  forceRefresh: boolean = false
): Promise<string[]> {
  const cachedList = getCachedNameHandleList();
  if (cachedList.length > 0 && !forceRefresh) {
    return cachedList;
  }

  try {
    const res = await fetchLiveMeterialOffice();
    if (res.success && res.rows.length > 0) {
      return extractNameHandleFromMeterialOffice(res.rows, res.columns);
    }
  } catch (e) {
    console.debug('Failed to fetch live Meterial_Office for Name Handle:', e);
  }

  return cachedList;
}

/**
 * Extract driver (Name Handle) to truck (Model No.) mapping from Meterial_Office rows.
 * Matches column headers like 'Name Handle' -> 'Model No.'
 */
export function extractDriverTruckMapFromMeterialOffice(
  rows: SheetRowData[],
  columns: SheetColumnDef[]
): Record<string, string[]> {
  if (!rows || rows.length === 0) return {};

  const cleanLabel = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Find Model No. column
  let modelCol = columns?.find((c) => {
    const cl = cleanLabel(c.label);
    return cl === 'modelno' || cl === 'modelnumber' || cl === 'modelnum';
  });
  if (!modelCol) {
    modelCol = columns?.find((c) => cleanLabel(c.label) === 'model');
  }
  if (!modelCol) {
    modelCol = columns?.find((c) => {
      const l = (c.label || '').toLowerCase();
      return l.includes('model') || l.includes('ម៉ូឌែល');
    });
  }
  const modelColId = modelCol ? modelCol.id : null;

  // 2. Find Name Handle column
  let handleCol = columns?.find((c) => {
    const cl = cleanLabel(c.label);
    return cl === 'namehandle' || cl === 'namehandles' || cl === 'handlename';
  });
  if (!handleCol) {
    handleCol = columns?.find((c) => {
      const l = (c.label || '').toLowerCase();
      return l.includes('handle');
    });
  }
  if (!handleCol) {
    handleCol = columns?.find((c) => {
      const cl = cleanLabel(c.label);
      return cl === 'driver' || cl === 'drivername' || cl === 'drivers';
    });
  }
  if (!handleCol) {
    handleCol = columns?.find((c) => {
      const l = (c.label || '');
      return l.includes('អ្នកកាន់') || l.includes('អ្នកបើកបរ') || l.includes('តៃកុង');
    });
  }
  const handleColId = handleCol ? handleCol.id : null;

  const mapping: Record<string, string[]> = {};

  const isValidValue = (v: any): boolean => {
    if (v === undefined || v === null) return false;
    const str = String(v).trim();
    return (
      str !== '' &&
      str !== '-' &&
      str !== '--' &&
      str !== 'N/A' &&
      str !== 'null' &&
      str !== 'undefined'
    );
  };

  for (const r of rows) {
    // Extract Model No
    let modelVal: any = undefined;
    if (modelColId && r[modelColId] !== undefined) {
      modelVal = r[modelColId];
    } else {
      for (const [k, v] of Object.entries(r)) {
        if (k.startsWith('_')) continue;
        const cl = cleanLabel(k);
        if (cl.includes('model') || k.includes('ម៉ូឌែល')) {
          modelVal = v;
          break;
        }
      }
    }

    // Extract Name Handle
    let handleVal: any = undefined;
    if (handleColId && r[handleColId] !== undefined) {
      handleVal = r[handleColId];
    } else {
      for (const [k, v] of Object.entries(r)) {
        if (k.startsWith('_')) continue;
        const cl = cleanLabel(k);
        if (
          cl.includes('namehandle') ||
          cl.includes('handle') ||
          cl.includes('driver') ||
          k.includes('អ្នកកាន់') ||
          k.includes('អ្នកបើកបរ')
        ) {
          handleVal = v;
          break;
        }
      }
    }

    if (isValidValue(handleVal) && isValidValue(modelVal)) {
      const hStr = String(handleVal).trim();
      const mStr = String(modelVal).trim();

      if (!mapping[hStr]) {
        mapping[hStr] = [];
      }
      if (!mapping[hStr].includes(mStr)) {
        mapping[hStr].push(mStr);
      }
    }
  }

  return mapping;
}

/**
 * Get cached Driver-to-Truck map from Meterial_Office
 */
export function getCachedDriverTruckMap(): Record<string, string[]> {
  const { rows, columns } = getCachedMeterialOffice();
  return extractDriverTruckMapFromMeterialOffice(rows, columns);
}

/**
 * Look up matching truck Model Nos for a given driver / Name Handle (flexible matching)
 */
export function lookupTrucksByDriver(
  driver: string,
  map: Record<string, string[]>
): string[] {
  if (!driver || !driver.trim() || !map) return [];
  const cleanStr = (s: string) => s.trim().toLowerCase();
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const inputClean = cleanStr(driver);
  const inputNorm = normalize(driver);

  // 1. Direct exact match
  if (map[driver] && map[driver].length > 0) {
    return map[driver];
  }

  // 2. Case-insensitive exact match
  for (const [key, trucks] of Object.entries(map)) {
    if (cleanStr(key) === inputClean) {
      return trucks;
    }
  }

  // 3. Normalized match (ignores spaces, periods, hyphens like "MR. HING" vs "MR.HING")
  if (inputNorm) {
    for (const [key, trucks] of Object.entries(map)) {
      if (normalize(key) === inputNorm) {
        return trucks;
      }
    }
  }

  // 4. Substring / partial match if length > 3
  if (inputNorm.length > 3) {
    for (const [key, trucks] of Object.entries(map)) {
      const keyNorm = normalize(key);
      if (keyNorm && (keyNorm.includes(inputNorm) || inputNorm.includes(keyNorm))) {
        return trucks;
      }
    }
  }

  return [];
}

