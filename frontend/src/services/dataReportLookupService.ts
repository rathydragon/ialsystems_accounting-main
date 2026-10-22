import { authFetch } from './apiClient';
import { SheetColumnDef, SheetRowData } from '../utils/googleSheetFetcher';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';

/**
 * Data Report rows for other pages (Warehouse, Distribution Report), read from Hostinger MySQL
 * (tbl_data_report) one barcode at a time instead of from the Google Sheet copy in the browser.
 *
 * Lookups stay synchronous for the existing code: getDataReportLookupData() returns the rows
 * fetched so far, and prefetchDataReportBarcodes() asks MySQL for the ones not fetched yet.
 * When new rows arrive the window event 'accounting_data_report_updated' fires so pages re-render.
 */

const ENDPOINT = '/api/remote-mysql';
const BATCH = 500; // barcodes per request (server accepts up to 1000)
const REFRESH_AFTER_MS = 5 * 60 * 1000; // re-check a barcode after 5 minutes (status / COD can change)
const DESTINATIONS_KEY = 'accounting_data_report_db_destinations';

let columns: SheetColumnDef[] = [];
const labelToId = new Map<string, string>();
const rowsByCode = new Map<string, SheetRowData[]>(); // newest row first
const checkedAt = new Map<string, number>(); // barcode -> last time MySQL was asked (found or not)
const inFlight = new Map<string, Promise<void>>();
let rowsSnapshot: SheetRowData[] = [];

const norm = (code: string) => sanitizeTrackingCode(code || '').toUpperCase();

function columnId(label: string): string {
  let id = labelToId.get(label);
  if (!id) {
    id = `col_${labelToId.size}`;
    labelToId.set(label, id);
    columns = [...columns, { id, label, type: 'string' }];
  }
  return id;
}

function rebuildSnapshot() {
  const all: SheetRowData[] = [];
  for (const list of rowsByCode.values()) all.push(...list);
  rowsSnapshot = all; // new array → lookup indexes keyed on the rows array rebuild
}

/** Rows and columns fetched so far, in the same shape as the Google Sheet copy. */
export function getDataReportLookupData(): { rows: SheetRowData[]; columns: SheetColumnDef[] } {
  return { rows: rowsSnapshot, columns };
}

/** The newest Data Report row for a barcode, keyed by column name (SHIPPER, CONSIGNEE…). */
export function getDataReportRowByLabel(barcode: string): Record<string, string> | null {
  const row = rowsByCode.get(norm(barcode))?.[0];
  if (!row) return null;
  const out: Record<string, string> = {};
  for (const col of columns) out[col.label] = String(row[col.id] ?? '');
  return out;
}

async function fetchBatch(codes: string[]): Promise<void> {
  const res = await authFetch(`${ENDPOINT}?action=data_report_db_lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'data_report_db_lookup', barcodes: codes })
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.message || `HTTP ${res.status}`);

  const ids: string[] = (json.columns as string[]).map((label) => columnId(label || ''));
  const found = new Map<string, SheetRowData[]>();
  (json.rows as any[][]).forEach((arr, i) => {
    const code = String(arr[0]);
    const row: SheetRowData = { _id: `dbrow_${code}_${i}` };
    ids.forEach((id, c) => (row[id] = arr[c + 1] ?? ''));
    const list = found.get(code) || [];
    list.push(row);
    found.set(code, list);
  });

  const now = Date.now();
  for (const code of codes) {
    checkedAt.set(code, now);
    const list = found.get(code);
    if (list) rowsByCode.set(code, list);
    else rowsByCode.delete(code); // no longer in the report
  }
}

/**
 * Make sure these barcodes have been looked up in MySQL. Already-checked barcodes (found or not)
 * are skipped for 5 minutes. Resolves to true when any row was added or changed.
 */
export async function prefetchDataReportBarcodes(barcodes: string[]): Promise<boolean> {
  const now = Date.now();
  const wanted = [...new Set(barcodes.map(norm).filter((c) => c.length >= 4))];
  const waits: Promise<void>[] = [];
  const toFetch: string[] = [];
  for (const code of wanted) {
    const pending = inFlight.get(code);
    if (pending) waits.push(pending);
    else if (now - (checkedAt.get(code) || 0) > REFRESH_AFTER_MS) toFetch.push(code);
  }
  if (!toFetch.length) {
    await Promise.all(waits);
    return false;
  }

  const before = toFetch.map((c) => JSON.stringify(rowsByCode.get(c) || null));
  for (let i = 0; i < toFetch.length; i += BATCH) {
    const chunk = toFetch.slice(i, i + BATCH);
    const p = fetchBatch(chunk).finally(() => chunk.forEach((c) => inFlight.delete(c)));
    chunk.forEach((c) => inFlight.set(c, p));
    waits.push(p);
  }
  try {
    await Promise.all(waits);
  } catch (err) {
    console.warn('Data Report (MySQL) lookup failed:', err);
  }

  const changed = toFetch.some((c, i) => JSON.stringify(rowsByCode.get(c) || null) !== before[i]);
  if (changed) {
    rebuildSnapshot();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('accounting_data_report_updated'));
  }
  return changed;
}

/** Destinations list kept from the last fetch (small, so it is saved for the next visit). */
export function getCachedDataReportDbDestinations(): string[] {
  try {
    const saved = localStorage.getItem(DESTINATIONS_KEY);
    const list = saved ? JSON.parse(saved) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Distinct DESTINATION values from MySQL. */
export async function fetchDataReportDbDestinations(): Promise<string[]> {
  const res = await authFetch(`${ENDPOINT}?action=data_report_db_destinations`);
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.message || `HTTP ${res.status}`);
  const list: string[] = Array.isArray(json.destinations) ? json.destinations : [];
  try {
    localStorage.setItem(DESTINATIONS_KEY, JSON.stringify(list));
  } catch {
    /* small list; ignore if storage is full */
  }
  return list;
}
