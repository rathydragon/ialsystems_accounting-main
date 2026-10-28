import { authFetch } from './apiClient';
import { DataReportInfo, WarehouseStep } from './invoiceHandoverService';

/**
 * Shipment Problems (បញ្ហាទំនិញ): staff scan a shipment that arrived with a problem and add photos
 * as proof. Records live in Hostinger MySQL (tbl_shipment_problems); photos are stored in Google
 * Drive (uploaded by the server through the Apps Script web app), one photo per request.
 */

export type ProblemType = 'DAMAGED' | 'MISSING' | 'SHORT' | 'WET' | 'PACKAGING' | 'WRONG_ITEM' | 'WRONG_ADDRESS' | 'REFUSED' | 'NO_CONTACT' | 'ARRIVED_NO_CONTACT' | 'COD_UNPAID' | 'OTHER';
export type ProblemStatus = 'OPEN' | 'RESOLVED';

export const PROBLEM_TYPES: { id: ProblemType; label: string; en: string; tone: string }[] = [
  { id: 'DAMAGED', label: 'ខូចខាត / បែក', en: 'Damaged', tone: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800' },
  { id: 'MISSING', label: 'បាត់ទំនិញ', en: 'Missing', tone: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800' },
  { id: 'SHORT', label: 'ខ្វះចំនួនកញ្ចប់', en: 'Short pieces', tone: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800' },
  { id: 'WET', label: 'ទទឹក / សើម', en: 'Wet', tone: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800' },
  { id: 'PACKAGING', label: 'កញ្ចប់រហែក / ខូច', en: 'Torn packaging', tone: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800' },
  { id: 'WRONG_ITEM', label: 'ទំនិញខុស', en: 'Wrong item', tone: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800' },
  { id: 'WRONG_ADDRESS', label: 'ខុសទីតាំង / អាសយដ្ឋាន', en: 'Wrong address', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800' },
  { id: 'REFUSED', label: 'អ្នកទទួលបដិសេធ', en: 'Refused', tone: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/50 dark:text-fuchsia-300 dark:border-fuchsia-800' },
  { id: 'NO_CONTACT', label: 'ទាក់ទងមិនបាន', en: 'No contact', tone: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-800' },
  { id: 'ARRIVED_NO_CONTACT', label: 'ទៅដល់ទីតាំងទាក់ទងមិនបាន', en: 'Arrived, no contact', tone: 'bg-lime-50 text-lime-800 border-lime-200 dark:bg-lime-950/50 dark:text-lime-300 dark:border-lime-800' },
  { id: 'COD_UNPAID', label: 'ភ្ញៀវមិនទាន់បង់ COD', en: 'COD unpaid', tone: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800' },
  { id: 'OTHER', label: 'ផ្សេងៗ', en: 'Other', tone: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
];

export const problemTypeOf = (id: string) => PROBLEM_TYPES.find((t) => t.id === id) || PROBLEM_TYPES[PROBLEM_TYPES.length - 1];

export interface ProblemPhoto {
  id: number;
  driveFileId: string;
  driveUrl: string;
  createdBy: string | null;
  createdAt: string | null;
}

/** Snapshot of what the system knew about the barcode when it was reported. */
export interface ProblemLinkInfo {
  shipper?: string;
  consignee?: string;
  destination?: string;
  status?: string;
  warehouseType?: string;
  warehouseDate?: string | null;
  warehousePerson?: string | null;
}

export interface ShipmentProblem {
  id: number;
  barcode: string;
  problemType: ProblemType;
  location: string;
  pieces: number | null;
  note: string;
  reportDate: string; // YYYY-MM-DD
  status: ProblemStatus;
  resolveNote: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  linkInfo: ProblemLinkInfo | null;
  operatorEmail: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  photos: ProblemPhoto[];
}

export interface ProblemPage {
  rows: ShipmentProblem[];
  total: number;
  open: number;
  resolved: number;
  page: number;
  pageSize: number;
}

export interface ProblemFilters {
  search?: string;
  status?: ProblemStatus | '';
  type?: ProblemType | '';
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface ProblemLookup {
  barcode: string;
  /** Problems already reported for this barcode (newest first) */
  existing: ShipmentProblem[];
  dataReport: DataReportInfo | null;
  warehouse: WarehouseStep[];
}

export interface ProblemInput {
  id?: number;
  barcode: string;
  problemType: ProblemType;
  location: string;
  pieces: number | null;
  note: string;
  reportDate: string;
}

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

export const fetchProblems = (filters: ProblemFilters) => call<ProblemPage>('shipment_problem_list', { query: filters });

export const lookupProblemBarcode = (barcode: string) => call<ProblemLookup>('shipment_problem_lookup', { query: { barcode } });

export const saveProblem = (problem: ProblemInput) => call<ShipmentProblem>('shipment_problem_save', { body: { problem } });

export const addProblemPhoto = (id: number, imageBase64: string, webAppUrl: string | undefined) =>
  call<ShipmentProblem>('shipment_problem_add_photo', { body: { id, imageBase64, webAppUrl: webAppUrl || '' } });

export const removeProblemPhoto = (photoId: number) => call<ShipmentProblem | null>('shipment_problem_remove_photo', { body: { photoId } });

export const setProblemStatus = (id: number, status: ProblemStatus, resolveNote = '') =>
  call<ShipmentProblem>('shipment_problem_status', { body: { id, status, resolveNote } });

export const deleteProblem = (id: number) => call<{ deleted: number }>('shipment_problem_delete', { body: { id } });

export const driveThumb = (fileId: string, width = 200) => `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
