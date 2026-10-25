import { authFetch } from './apiClient';

/**
 * Small Google Sheets copied into Hostinger MySQL (backend/api/data-report-db.js):
 *   data_bm → tbl_data_bm (sheet «Sort_pending», Payment Collection medicine payments)
 *
 * load() asks the server to copy the latest sheet into MySQL (the server skips it when it ran in
 * the last 2 minutes), then reads the whole table, only when its version changed.
 */

export type SheetDataset = 'data_bm';

export interface SheetDbData {
  /** Header names, in sheet order */
  columns: string[];
  /** Cell values (displayed text), in sheet order, newest rows first like the sheet */
  rows: string[][];
  version: number;
}

const ENDPOINT = '/api/remote-mysql';
const cache = new Map<SheetDataset, SheetDbData>();

async function call<T>(action: string, dataset: SheetDataset, body?: Record<string, any>): Promise<T> {
  const url = `${ENDPOINT}?action=${action}&dataset=${dataset}`;
  const res = body
    ? await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, dataset, ...body })
      })
    : await authFetch(url);
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json || json.ok === false) throw new Error(json?.message || `HTTP ${res.status}`);
  return json as T;
}

/** Copy the latest sheet into MySQL (continues a first import that did not finish in one call). */
export async function syncSheetDb(dataset: SheetDataset, force = false): Promise<{ version?: number }> {
  let last: { version?: number; partial?: boolean } = {};
  for (let round = 0; round < 4; round++) {
    last = await call('sheet_db_sync', dataset, { force: force || round > 0 });
    if (!last.partial) break;
  }
  return last;
}

/** Read the whole table from MySQL. */
export async function fetchSheetDb(dataset: SheetDataset): Promise<SheetDbData> {
  const json = await call<SheetDbData>('sheet_db_all', dataset);
  const data = { columns: json.columns || [], rows: json.rows || [], version: json.version || 0 };
  cache.set(dataset, data);
  return data;
}

/** Last data read in this session (null before the first read). */
export function getCachedSheetDb(dataset: SheetDataset): SheetDbData | null {
  return cache.get(dataset) || null;
}

/**
 * Sync, then read. Returns null when nothing changed since the last read in this session.
 * A failed sync (e.g. Google unreachable) still serves what MySQL already has.
 */
export async function loadSheetDb(dataset: SheetDataset, force = false): Promise<SheetDbData | null> {
  const known = cache.get(dataset);
  let version: number | undefined;
  try {
    version = (await syncSheetDb(dataset, force)).version;
  } catch (err) {
    console.warn(`Sync ${dataset} → MySQL failed; reading what MySQL has:`, err);
  }
  if (known && version !== undefined && version === known.version) return null;
  return fetchSheetDb(dataset);
}
