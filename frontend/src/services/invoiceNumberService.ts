import { authFetch } from './apiClient';

/**
 * Printed invoice numbers (លេខវិក័យប័ត្រ), stored in the PostgreSQL database on the office PC
 * via /api/invoice-numbers. Not saved to Hostinger.
 */

/** PREPARED = printed and kept in stock; ISSUED = handed to a customer / staff member. */
export type InvoiceStatus = 'PREPARED' | 'ISSUED' | 'CANCELLED';

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; pill: string; solid: string }> = {
  PREPARED: {
    label: 'រៀបចំទុក',
    pill: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    solid: 'bg-amber-600',
  },
  ISSUED: {
    label: 'បានបើកឲ្យ',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    solid: 'bg-emerald-600',
  },
  CANCELLED: {
    label: 'បោះបង់',
    pill: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    solid: 'bg-rose-600',
  },
};

export interface InvoiceNumber {
  id: number;
  tracking: string;
  customer: string | null;
  /** Company / shop name of the receiver (optional) */
  company?: string | null;
  province: string | null;
  namePrepare: string | null;
  /** Batch code typed when the numbers were prepared */
  prepCode?: string | null;
  date: string | null; // YYYY-MM-DD, day it was prepared
  status: InvoiceStatus;
  issuedDate?: string | null;
  /** Exact issue time (ISO timestamp); empty for old / imported rows */
  issuedAt?: string | null;
  issuedBy?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedBy?: string | null;
  updatedAt?: string;
}

export interface InvoiceFields {
  customer: string;
  company?: string;
  province: string;
  namePrepare: string;
  prepCode?: string;
  date: string;
  status: InvoiceStatus;
  issuedDate?: string;
}

export interface InvoiceFilters {
  search?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface InvoicePage {
  rows: InvoiceNumber[];
  /** Rows matching the filter (all pages) */
  total: number;
  /** Per-status totals for the search/date filter, ignoring the status filter */
  counts: Record<'ALL' | InvoiceStatus, number>;
  page: number;
  pageSize: number;
}

/** What the server already has for a scanned number. */
export interface InvoiceLookup {
  tracking: string;
  status: InvoiceStatus;
  customer: string | null;
  namePrepare: string | null;
  prepCode?: string | null;
  date: string | null;
}

/** A prep code that still has numbers in stock. */
export interface PrepCodeSummary {
  code: string;
  count: number;
  namePrepare: string | null;
  date: string | null;
}

/** Thrown when the PostgreSQL on the office PC can't be reached (e.g. the app was opened from Vercel). */
export class LocalDbUnavailableError extends Error {}

const ENDPOINT = '/api/invoice-numbers';
const UNAVAILABLE_MSG =
  'ទំព័រនេះប្រើបានតែលើកុំព្យូទ័រការិយាល័យ ឬក្នុង LAN ប៉ុណ្ណោះ (ទិន្នន័យនៅក្នុង PostgreSQL លើម៉ាស៊ីននោះ)។';

async function request<T>(method: 'GET' | 'POST', params: Record<string, any>): Promise<T> {
  let res: Response;
  try {
    if (method === 'GET') {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
      });
      res = await authFetch(`${ENDPOINT}?${qs.toString()}`);
    } else {
      res = await authFetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    }
  } catch {
    throw new LocalDbUnavailableError(UNAVAILABLE_MSG);
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON (e.g. Vercel 404 page)
  }
  // Our own Express server answers unknown routes with this JSON: the backend is running old code
  if (res.status === 404 && json?.message === 'API endpoint not found') {
    throw new LocalDbUnavailableError(
      'Backend មិនទាន់ស្គាល់ទំព័រនេះទេ — សូម Restart កម្មវិធី (បិទ npm run dev ហើយបើកឡើងវិញ) រួចចុច «ព្យាយាមម្ដងទៀត»។'
    );
  }
  if (res.status === 404 || json?.code === 'LOCAL_PG_UNAVAILABLE') {
    throw new LocalDbUnavailableError(json?.code ? json.message : UNAVAILABLE_MSG);
  }
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || `Request failed (HTTP ${res.status})`);
  }
  return json.data as T;
}

/** Value of `prepCode` that selects the numbers saved without a code. */
export const NO_PREP_CODE = '__NONE__';

export const fetchInvoiceNumbers = (filters: InvoiceFilters & { page: number; pageSize: number; prepCode?: string }) =>
  request<InvoicePage>('GET', { action: 'list', ...filters });

/** One prep code's numbers, summarised (code null = numbers saved without a code). */
export interface InvoiceGroup {
  code: string | null;
  count: number;
  prepared: number;
  issued: number;
  cancelled: number;
  firstTracking: string;
  lastTracking: string;
  date: string | null;
  issuedDate: string | null;
  /** Latest issue time in the group (ISO timestamp) */
  issuedAt?: string | null;
  /** Up to 3 users who issued numbers in the group; issuerCount is the full number */
  issuers?: string[];
  issuerCount?: number;
  preparers: string[];
  /** Up to 3 receivers; customerCount is the full number */
  customers: string[];
  customerCount: number;
  /** Up to 3 companies / shops; companyCount is the full number */
  companies?: string[];
  companyCount?: number;
  createdAt: string | null;
}

export interface InvoiceGroupPage {
  groups: InvoiceGroup[];
  /** Groups matching the filter (all pages) */
  total: number;
  counts: Record<'ALL' | InvoiceStatus, number>;
  page: number;
  pageSize: number;
}

/** Change counter: goes up whenever any number is added, issued, edited or deleted (cheap to poll). */
export const fetchInvoiceVersion = () => request<{ version: string }>('GET', { action: 'version' });

export const fetchInvoiceGroups = (filters: InvoiceFilters & { page: number; pageSize: number }) =>
  request<InvoiceGroupPage>('GET', { action: 'groups', ...filters });

/** Every row matching the filter (for CSV). */
export const exportInvoiceNumbers = (filters: InvoiceFilters) =>
  request<Omit<InvoiceNumber, 'id'>[]>('GET', { action: 'export', ...filters });

/** Saved rows for these numbers; numbers not in the list don't exist yet. */
export async function lookupInvoiceNumbers(trackings: string[]): Promise<Map<string, InvoiceLookup>> {
  const out = new Map<string, InvoiceLookup>();
  const CHUNK = 20000;
  for (let i = 0; i < trackings.length; i += CHUNK) {
    const rows = await request<InvoiceLookup[]>('POST', { action: 'lookup', trackings: trackings.slice(i, i + CHUNK) });
    rows.forEach((r) => out.set(r.tracking, r));
  }
  return out;
}

/**
 * Which of these numbers already appear in Data Report (local copy from the Hostinger backup).
 * backupAt = when that copy was made (ISO), null when there is no copy yet.
 */
export async function checkInvoiceUsage(trackings: string[]): Promise<{ used: Set<string>; backupAt: string | null }> {
  const used = new Set<string>();
  let backupAt: string | null = null;
  const CHUNK = 5000;
  for (let i = 0; i < trackings.length; i += CHUNK) {
    const r = await request<{ used: string[]; backupAt: string | null }>('POST', { action: 'usage', trackings: trackings.slice(i, i + CHUNK) });
    (r.used || []).forEach((t) => used.add(t));
    backupAt = r.backupAt || backupAt;
  }
  return { used, backupAt };
}

/** Every number saved under this prep code (any status). */
export const lookupPrepCode = (prepCode: string) =>
  request<InvoiceLookup[]>('POST', { action: 'lookupPrepCode', prepCode });

/** Prep codes that still have PREPARED numbers, newest first. */
export const fetchPrepCodes = () => request<PrepCodeSummary[]>('GET', { action: 'prepCodes' });

/** Step 1: add printed numbers to stock (PREPARED). */
export const fetchNextPrepCode = () => request<{ code: string }>('GET', { action: 'nextPrepCode' }).then((r) => r.code);

/**
 * Step 1: add printed numbers to stock (PREPARED).
 * With autoPrepCode the server picks the next IAL_BILL code itself and returns it.
 */
export const createInvoiceNumbers = (
  trackings: string[],
  fields: { namePrepare: string; date: string; prepCode: string; autoPrepCode?: boolean }
) =>
  request<{ added: InvoiceNumber[]; duplicates: string[]; prepCode: string | null }>('POST', { action: 'create', trackings, ...fields });

export interface IssueSkip {
  tracking: string;
  status: InvoiceStatus | 'NOT_FOUND';
  customer: string | null;
}

/** Step 2: hand PREPARED numbers to a customer / staff member (ISSUED). */
export const issueInvoiceNumbers = (
  trackings: string[],
  fields: { customer: string; company: string; province: string; issuedDate: string }
) => request<{ issued: InvoiceNumber[]; skipped: IssueSkip[] }>('POST', { action: 'issue', trackings, ...fields });

/** Old records from Excel/CSV. Existing numbers are skipped unless overwrite is true. */
export const importInvoiceNumbers = (
  rows: {
    tracking: string;
    customer: string;
    province: string;
    namePrepare: string;
    date: string;
    status: InvoiceStatus;
    issuedDate: string;
    issuedBy: string;
  }[],
  overwrite: boolean
) => request<{ inserted: number; updated: number; skipped: number }>('POST', { action: 'import', rows, overwrite });

export const updateInvoiceNumber = (id: number, tracking: string, fields: InvoiceFields) =>
  request<InvoiceNumber>('POST', { action: 'update', id, tracking, ...fields });

export const deleteInvoiceNumbers = (ids: number[]) =>
  request<{ deleted: number }>('POST', { action: 'delete', ids });

/** Deletes every number with this prep code (admin only). */
export const deleteInvoicePrepCode = (prepCode: string) =>
  request<{ deleted: number }>('POST', { action: 'delete', prepCode });

/**
 * Expands the textarea into tracking numbers: one per line (or comma), and ranges like
 * "INV0001-INV0050" or "INV0001 - 0050" (same prefix, keeps the zero padding).
 */
export function parseTrackingInput(text: string): { trackings: string[]; error?: string } {
  const out: string[] = [];
  const parts = text.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^([A-Za-z\-_/]*?)(\d+)\s*(?:-|–|~|ដល់|to)\s*([A-Za-z\-_/]*?)(\d+)$/i);
    if (m && (!m[3] || m[3].toUpperCase() === m[1].toUpperCase())) {
      const prefix = m[1].toUpperCase();
      const start = parseInt(m[2], 10);
      const end = parseInt(m[4], 10);
      const width = m[2].length;
      if (end < start) return { trackings: [], error: `ជួរ «${part}» មិនត្រឹមត្រូវ (លេខចុងតូចជាងលេខដើម)` };
      if (end - start + 1 > 2000) return { trackings: [], error: `ជួរ «${part}» ធំពេក (ច្រើនបំផុត 2000 លេខ)` };
      for (let n = start; n <= end; n++) out.push(prefix + String(n).padStart(width, '0'));
    } else {
      out.push(part.toUpperCase());
    }
  }
  return { trackings: [...new Set(out)] };
}
