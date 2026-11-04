import { authFetch } from './apiClient';

/**
 * Issue Invoice (ចេញវិក័យប័ត្រ): one row per tracking with unit price, customer name and a note.
 * Stored in Hostinger MySQL (tbl_issue_invoices) through /api/remote-mysql actions.
 */

export interface IssueInvoice {
  id: number;
  tracking: string;
  unitPrice: number | null;
  customerName: string;
  note: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface IssueInvoicePage {
  rows: IssueInvoice[];
  total: number;
  totalAmount: number;
  page: number;
  pageSize: number;
}

export interface IssueInvoiceInput {
  id?: number;
  tracking: string;
  unitPrice: number | null;
  customerName: string;
  note: string;
}

export type ImportMode = 'skip' | 'overwrite';

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  invalid: string[];
}

const ENDPOINT = '/api/remote-mysql';
/** Rows sent per upload request, so each request stays small. */
export const IMPORT_CHUNK = 500;

async function call<T>(action: string, init?: { body?: any; query?: Record<string, any> }): Promise<T> {
  const qs = new URLSearchParams({ action });
  Object.entries(init?.query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const res = await authFetch(
    `${ENDPOINT}?${qs.toString()}`,
    init?.body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...init.body }) }
      : undefined
  );
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !json?.ok) throw new Error(json?.message || `Request failed (HTTP ${res.status})`);
  return json.data as T;
}

export const fetchIssueInvoices = (filters: { search?: string; page?: number; pageSize?: number }) =>
  call<IssueInvoicePage>('issue_invoice_list', { query: filters });

export const saveIssueInvoice = (invoice: IssueInvoiceInput) => call<IssueInvoice>('issue_invoice_save', { body: { invoice } });

export const deleteIssueInvoices = (ids: number[]) => call<{ deleted: number }>('issue_invoice_delete', { body: { ids } });

/** Uploads rows in chunks; onProgress gets how many rows were sent so far. */
export async function importIssueInvoices(
  rows: Omit<IssueInvoiceInput, 'id'>[],
  mode: ImportMode,
  onProgress?: (done: number) => void
): Promise<ImportResult> {
  const total: ImportResult = { inserted: 0, updated: 0, skipped: 0, invalid: [] };
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
    const part = rows.slice(i, i + IMPORT_CHUNK);
    const r = await call<ImportResult>('issue_invoice_import', { body: { rows: part, mode } });
    total.inserted += r.inserted;
    total.updated += r.updated;
    total.skipped += r.skipped;
    total.invalid.push(...r.invalid);
    onProgress?.(Math.min(i + part.length, rows.length));
  }
  return total;
}
