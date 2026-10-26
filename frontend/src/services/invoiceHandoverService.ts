import { authFetch } from './apiClient';
import { InvoiceLookup, lookupInvoiceNumbers } from './invoiceNumberService';

/**
 * Invoice Handover (ប្រគល់វិក័យប័ត្រ): a staff member hands over an invoice, the operator scans its
 * barcode and takes one photo. Records live in Hostinger MySQL (tbl_invoice_handovers); the photo
 * is stored in Google Drive (uploaded by the server through the Apps Script web app).
 */

export type HandoverCurrency = 'USD' | 'KHR';

/** Snapshot of what the system knew about the barcode when it was saved. */
export interface HandoverLinkInfo {
  shipper?: string;
  consignee?: string;
  destination?: string;
  status?: string;
  /** Latest warehouse step, e.g. OUT_OF_DELIVERY */
  warehouseType?: string;
  warehouseDate?: string | null;
  warehousePerson?: string | null;
  /** Invoice Numbers page */
  prepCode?: string | null;
  invoiceStatus?: string;
  invoiceCustomer?: string | null;
}

export interface InvoiceHandover {
  id: number;
  barcode: string;
  staffName: string;
  handoverDate: string; // YYYY-MM-DD
  amount: number | null;
  currency: HandoverCurrency;
  note: string;
  driveFileId: string | null;
  driveUrl: string | null;
  linkSource: string | null;
  linkInfo: HandoverLinkInfo | null;
  /** Batch code (OP-INV-261026-RATHYKIM34-001); null on records saved before batches */
  operationCode: string | null;
  operatorEmail: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface HandoverPage {
  rows: InvoiceHandover[];
  total: number;
  totalUsd: number;
  totalKhr: number;
  staffCount: number;
  page: number;
  pageSize: number;
}

export interface HandoverFilters {
  search?: string;
  staff?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface WarehouseStep {
  type: string;
  date: string | null;
  createdAt: string | null;
  person: string | null;
  destination: string | null;
  operationCode: string | null;
  createdBy: string | null;
}

export interface DataReportInfo {
  shipper: string;
  consignee: string;
  destination: string;
  status: string;
  codUsd: string;
  codKhr: string;
}

export interface BarcodeLookup {
  barcode: string;
  /** Already handed over (hidden = saved by someone else and this user only sees their own rows) */
  existing: (Partial<InvoiceHandover> & { hidden?: boolean }) | null;
  dataReport: DataReportInfo | null;
  warehouse: WarehouseStep[];
  /** From the Invoice Numbers page (office PC database); null when not found or not reachable */
  invoice: InvoiceLookup | null;
}

export const WAREHOUSE_STEP_LABEL: Record<string, string> = {
  SCAN_IN: 'ScanIn (ចូលឃ្លាំង)',
  SCAN_OUT: 'ScanOut (ចេញពីឃ្លាំង)',
  OUT_OF_DELIVERY: 'Out of Delivery (Rider)',
  HOLD_REMAINING: 'នៅសល់ក្នុងឃ្លាំង (Hold)',
  ARRIVED_HUB: 'Arrived Hub',
  RETURN_SHIPMENTS: 'បង្វិលត្រឡប់ (Return)',
  CUSTOMER_PICKUP: 'ទទួលពីអតិថិជន',
};

const ENDPOINT = '/api/remote-mysql';

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
  if (!res.ok || !json?.ok) {
    if (res.status === 413) throw new Error('រូបភាពធំពេក សូមថតម្តងទៀត');
    throw new Error(json?.message || `Request failed (HTTP ${res.status})`);
  }
  return json.data as T;
}

export const fetchHandovers = (filters: HandoverFilters) => call<HandoverPage>('invoice_handover_list', { query: filters });

/** Hostinger (handover / Data Report / Warehouse) and the Invoice Numbers database, in parallel. */
export async function lookupHandoverBarcode(barcode: string): Promise<BarcodeLookup> {
  const [main, invoice] = await Promise.all([
    call<Omit<BarcodeLookup, 'invoice'>>('invoice_handover_lookup', { query: { barcode } }),
    // Only reachable on the office PC / LAN; elsewhere (or when slow) just skip it
    Promise.race([
      lookupInvoiceNumbers([barcode.trim().toUpperCase()]).then((m) => m.get(barcode.trim().toUpperCase()) || null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]).catch(() => null),
  ]);
  return { ...main, invoice };
}

/** One-line summary saved with the record, so the list shows it without new lookups. */
export function buildLinkInfo(l: BarcodeLookup): { linkSource: string | null; linkInfo: HandoverLinkInfo | null } {
  const info: HandoverLinkInfo = {};
  const sources: string[] = [];
  if (l.dataReport) {
    sources.push('DATA_REPORT');
    Object.assign(info, {
      shipper: l.dataReport.shipper || undefined,
      consignee: l.dataReport.consignee || undefined,
      destination: l.dataReport.destination || undefined,
      status: l.dataReport.status || undefined,
    });
  }
  const step = l.warehouse[0];
  if (step) {
    sources.push('WAREHOUSE');
    Object.assign(info, { warehouseType: step.type, warehouseDate: step.date, warehousePerson: step.person });
    if (!info.destination && step.destination) info.destination = step.destination;
  }
  if (l.invoice) {
    sources.push('INVOICE');
    Object.assign(info, { prepCode: l.invoice.prepCode || null, invoiceStatus: l.invoice.status, invoiceCustomer: l.invoice.customer });
  }
  return sources.length ? { linkSource: sources.join(',').slice(0, 30), linkInfo: info } : { linkSource: null, linkInfo: null };
}

export interface HandoverInput {
  id?: number;
  barcode: string;
  staffName: string;
  handoverDate: string;
  amount: number | null;
  currency: HandoverCurrency;
  note: string;
  linkSource?: string | null;
  linkInfo?: HandoverLinkInfo | null;
  /** New records: the batch this scan belongs to (the server makes one when missing) */
  operationCode?: string | null;
}

/** A fresh batch code for this operator and date. */
export const fetchNextOperationCode = (date: string) =>
  call<{ code: string }>('invoice_handover_next_code', { query: { date } }).then((r) => r.code);

/** New record: the photo is optional. Edit: pass a new image only to replace the photo. */
export interface HandoverBatchResult {
  /** The new batch's Operation Code; null when nothing was saved */
  operationCode: string | null;
  saved: InvoiceHandover[];
  duplicates: { barcode: string; message: string }[];
  failed: { barcode: string; message: string }[];
}

/** "រក្សាទុកសរុប": the whole batch in one request (photos are sent afterwards, one per save). */
export const saveHandoverBatch = (items: HandoverInput[]) => call<HandoverBatchResult>('invoice_handover_save_batch', { body: { items } });

/** autoLink: the server looks the barcode up (Data Report / Warehouse / Prep Code) while saving. */
export const saveHandover = (handover: HandoverInput, imageBase64: string | null, webAppUrl: string | undefined, autoLink = false) =>
  call<InvoiceHandover>('invoice_handover_save', {
    body: { handover, imageBase64: imageBase64 || '', webAppUrl: webAppUrl || '', autoLink },
  });

export const deleteHandover = (id: number) => call<{ deleted: number }>('invoice_handover_delete', { body: { id } });

export const driveThumb = (fileId: string, width = 200) => `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
export const driveView = (h: Pick<InvoiceHandover, 'driveFileId' | 'driveUrl'>) =>
  h.driveUrl || (h.driveFileId ? `https://drive.google.com/file/d/${h.driveFileId}/view` : '');
