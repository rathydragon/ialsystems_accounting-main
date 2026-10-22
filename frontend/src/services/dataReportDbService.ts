import { authFetch } from './apiClient';
import { SheetColumnDef, SheetRowData } from '../utils/googleSheetFetcher';

/**
 * Data Report (DB): the same data as the Data Report page, read from Hostinger MySQL
 * (tbl_data_report) instead of Google Sheets. The server copies the sheet into MySQL;
 * see backend/api/data-report-db.js.
 */

const ENDPOINT = '/api/remote-mysql';
const CHUNK_SIZE = 5000; // keeps each response well under Vercel's 4.5 MB limit
const PARALLEL_CHUNKS = 3;

export interface DataReportDbSyncInfo {
  at: string;
  sheetRows: number;
  written: number;
  /** New rows inserted / existing rows updated in that run */
  inserted?: number;
  updated?: number;
  /** Rows no longer in the sheet, marked removed_at (kept in MySQL, hidden on the page) */
  removed?: number;
  remaining: number;
  partial: boolean;
  totalMs?: number;
}

export interface DataReportDbResult {
  success: boolean;
  columns: SheetColumnDef[];
  rows: SheetRowData[];
  version: number;
  lastSync: DataReportDbSyncInfo | null;
  error?: string;
}

export interface DataReportDbSyncResult {
  ok: boolean;
  skipped?: 'recent' | 'running';
  partial?: boolean;
  written?: number;
  inserted?: number;
  updated?: number;
  removed?: number;
  version?: number;
  message?: string;
}

async function call<T>(params: Record<string, string | number>, body?: Record<string, any>): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = body
    ? await authFetch(`${ENDPOINT}?${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, ...body })
      })
    : await authFetch(`${ENDPOINT}?${qs}`);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON error page
  }
  if (!res.ok || !json || json.ok === false) {
    throw new Error(json?.message || `HTTP ${res.status}`);
  }
  return json as T;
}

// In-memory cache: switching tabs and coming back renders instantly
let memoryCache: DataReportDbResult | null = null;

export function getCachedDataReportDb(): { rows: SheetRowData[]; columns: SheetColumnDef[]; version: number } {
  return memoryCache
    ? { rows: memoryCache.rows, columns: memoryCache.columns, version: memoryCache.version }
    : { rows: [], columns: [], version: 0 };
}

/** Same numeric-column detection the Google Sheets loader uses, so cells render the same. */
function detectColumnTypes(columns: SheetColumnDef[], rows: SheetRowData[]): SheetColumnDef[] {
  const sample = rows.slice(0, 100);
  return columns.map((col) => {
    let nonNull = 0;
    for (const row of sample) {
      const val = row[col.id];
      if (val === undefined || val === null || String(val).trim() === '') continue;
      nonNull++;
      if (isNaN(Number(String(val).replace(/,/g, '').replace(/\$/g, '').trim()))) return col;
    }
    return nonNull > 0 ? { ...col, type: 'number' } : col;
  });
}

async function loadOnce(): Promise<DataReportDbResult & { consistent: boolean }> {
  const meta = await call<{
    version: number;
    total: number;
    columns: string[];
    order: string[];
    lastSync: DataReportDbSyncInfo | null;
  }>({ action: 'data_report_db_meta' });

  const offsets: number[] = [];
  for (let o = 0; o < meta.total; o += CHUNK_SIZE) offsets.push(o);

  const chunks: { version: number; rows: string[][] }[] = new Array(offsets.length);
  let next = 0;
  const worker = async () => {
    while (next < offsets.length) {
      const i = next++;
      chunks[i] = await call({ action: 'data_report_db_rows', offset: offsets[i], limit: CHUNK_SIZE });
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_CHUNKS, offsets.length) }, worker));

  const consistent = chunks.every((c) => c.version === meta.version);

  const columns: SheetColumnDef[] = meta.columns.map((label, idx) => ({
    id: `col_${idx}`,
    label: label || `ជួរឈរ ${idx + 1}`,
    type: 'string'
  }));

  const byKey = new Map<string, SheetRowData>();
  for (const chunk of chunks) {
    for (const arr of chunk.rows) {
      const key = String(arr[0]);
      const row: SheetRowData = { _id: `row_${key}` };
      columns.forEach((col, c) => {
        const v = arr[c + 1];
        row[col.id] = v === undefined || v === null ? '' : v;
      });
      byKey.set(key, row);
    }
  }

  // Sheet order (newest on top); rows missing from the order list go last
  const rows: SheetRowData[] = [];
  for (const key of meta.order) {
    const row = byKey.get(key);
    if (row) {
      rows.push(row);
      byKey.delete(key);
    }
  }
  for (const row of byKey.values()) rows.push(row);

  return {
    success: true,
    columns: detectColumnTypes(columns, rows),
    rows,
    version: meta.version,
    lastSync: meta.lastSync,
    consistent
  };
}

/** Load every row from MySQL (in parallel chunks). Retries once if a sync landed mid-load. */
export async function fetchDataReportFromDb(): Promise<DataReportDbResult> {
  try {
    let result = await loadOnce();
    if (!result.consistent) result = await loadOnce();
    const { consistent: _ignored, ...clean } = result;
    memoryCache = clean;
    return clean;
  } catch (err: any) {
    return {
      success: false,
      columns: [],
      rows: [],
      version: 0,
      lastSync: null,
      error: err?.message || 'មិនអាចទាញយកទិន្នន័យពី MySQL បានឡើយ'
    };
  }
}

/** Cheap poll: the data version only changes when the sync writes something. */
export async function getDataReportDbVersion(): Promise<{ version: number; lastSync: DataReportDbSyncInfo | null }> {
  return call({ action: 'data_report_db_version' });
}

/**
 * Ask the server to copy the latest sheet into MySQL. The server skips it when a sync ran in
 * the last 2 minutes or one is running now (force only works for admins). A first import that
 * does not finish in one call is continued by calling again.
 */
export async function syncDataReportDb(force = false, maxRounds = 6): Promise<DataReportDbSyncResult> {
  let last: DataReportDbSyncResult = { ok: true };
  for (let round = 0; round < maxRounds; round++) {
    last = await call<DataReportDbSyncResult>({ action: 'data_report_db_sync' }, { force: force || round > 0 });
    if (!last.partial) break;
  }
  return last;
}
