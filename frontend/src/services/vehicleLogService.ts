import { authFetch } from './apiClient';

/**
 * Vehicle History Log (កំណត់ត្រាលម្អិត) for the Meterial_Office page: problems, repairs,
 * maintenance, speeding and documents per vehicle. Records live in Hostinger MySQL
 * (tbl_vehicle_logs); photos / PDF files are stored in Google Drive, one file per request.
 */

export type VehicleLogType = 'PROBLEM' | 'REPAIR' | 'MAINTENANCE' | 'SPEEDING' | 'DOCUMENT' | 'OTHER';
export type VehicleLogStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE';

export const LOG_TYPES: { id: VehicleLogType; label: string; short: string; en: string; tone: string }[] = [
  { id: 'PROBLEM', label: 'បញ្ហា / ខូច', short: 'បញ្ហា / ខូច', en: 'Problem', tone: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800' },
  { id: 'REPAIR', label: 'ជួសជុល', short: 'ជួសជុល', en: 'Repair', tone: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800' },
  { id: 'MAINTENANCE', label: 'ថែទាំ (ប្តូរប្រេង...)', short: 'ថែទាំ', en: 'Maintenance', tone: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800' },
  { id: 'SPEEDING', label: 'បើកបរលើសល្បឿនកំណត់', short: 'លើសល្បឿន', en: 'Speeding', tone: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/50 dark:text-fuchsia-300 dark:border-fuchsia-800' },
  { id: 'DOCUMENT', label: 'ឯកសារ', short: 'ឯកសារ', en: 'Document', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800' },
  { id: 'OTHER', label: 'ផ្សេងៗ', short: 'ផ្សេងៗ', en: 'Other', tone: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
];

const STATUS_TONE: Record<VehicleLogStatus, string> = {
  OPEN: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  DONE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
};
export const STATUS_IDS: VehicleLogStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE'];

/** Optional form fields; each record type shows only the ones that fit it. */
export type LogField = 'cost' | 'shop' | 'odometer' | 'driver' | 'speed' | 'location';

interface TypeConfig {
  fields: LogField[];
  /** Status names for this type (the stored value stays OPEN / IN_PROGRESS / DONE). */
  statuses: Record<VehicleLogStatus, string>;
  /** Field labels that differ from the default. */
  labels?: Partial<Record<LogField, string>>;
  titlePlaceholder: string;
  descPlaceholder: string;
}

export const TYPE_CONFIG: Record<VehicleLogType, TypeConfig> = {
  PROBLEM: {
    fields: ['odometer', 'driver', 'location'],
    statuses: { OPEN: 'រង់ចាំដោះស្រាយ', IN_PROGRESS: 'កំពុងដោះស្រាយ', DONE: 'បានដោះស្រាយ' },
    labels: { location: 'ទីតាំងដែលខូច' },
    titlePlaceholder: 'ឧ. ហ្វ្រាំងខូច / ម៉ាស៊ីនឡើងកម្តៅ',
    descPlaceholder: 'រៀបរាប់ពីបញ្ហា ពេលវេលា និងរបៀបដែលវាកើតឡើង...',
  },
  REPAIR: {
    fields: ['cost', 'shop', 'odometer', 'driver'],
    statuses: { OPEN: 'រង់ចាំជួសជុល', IN_PROGRESS: 'កំពុងជួសជុល', DONE: 'ជួសជុលរួច' },
    labels: { cost: 'ថ្លៃជួសជុល ($)' },
    titlePlaceholder: 'ឧ. ប្តូរអាគុយ / ជួសជុលហ្វ្រាំង',
    descPlaceholder: 'គ្រឿងបន្លាស់ដែលបានប្តូរ និងការងារដែលបានធ្វើ...',
  },
  MAINTENANCE: {
    fields: ['cost', 'shop', 'odometer'],
    statuses: { OPEN: 'ដល់ពេលថែទាំ', IN_PROGRESS: 'កំពុងថែទាំ', DONE: 'ថែទាំរួច' },
    labels: { cost: 'ថ្លៃថែទាំ ($)' },
    titlePlaceholder: 'ឧ. ប្តូរប្រេងម៉ាស៊ីន / ប្តូរកង់',
    descPlaceholder: 'ប្រភេទប្រេង គ្រឿងបន្លាស់ ឬ Km ថែទាំលើកក្រោយ...',
  },
  SPEEDING: {
    fields: ['driver', 'speed', 'location', 'cost'],
    statuses: { OPEN: 'រង់ចាំពិនិត្យ', IN_PROGRESS: 'បានព្រមានអ្នកបើកបរ', DONE: 'បានដោះស្រាយ' },
    labels: { cost: 'ប្រាក់ពិន័យ ($)', location: 'ទីតាំង / ផ្លូវ' },
    titlePlaceholder: 'ឧ. បើកលើសល្បឿននៅផ្លូវជាតិលេខ 4',
    descPlaceholder: 'ពេលវេលា និងប្រភពព័ត៌មាន (GPS, ប៉ូលិស...)',
  },
  DOCUMENT: {
    fields: ['cost', 'shop'],
    statuses: { OPEN: 'ត្រូវរៀបចំ', IN_PROGRESS: 'កំពុងដំណើរការ', DONE: 'រួចរាល់' },
    labels: { cost: 'ថ្លៃសេវា ($)', shop: 'ស្ថាប័ន / ក្រុមហ៊ុន' },
    titlePlaceholder: 'ឧ. កាតគ្រីឡាន / ធានារាប់រង / ត្រួតពិនិត្យបច្ចេកទេស',
    descPlaceholder: 'លេខឯកសារ ថ្ងៃផុតកំណត់...',
  },
  OTHER: {
    fields: ['cost', 'shop', 'odometer', 'driver', 'location'],
    statuses: { OPEN: 'រង់ចាំ', IN_PROGRESS: 'កំពុងដំណើរការ', DONE: 'រួចរាល់' },
    titlePlaceholder: 'ចំណងជើង',
    descPlaceholder: 'ព័ត៌មានលម្អិត...',
  },
};

export const FIELD_LABELS: Record<LogField, string> = {
  cost: 'ថ្លៃចំណាយ ($)',
  shop: 'ហាង / យានដ្ឋាន',
  odometer: 'Km (Odometer)',
  driver: 'អ្នកបើកបរ',
  speed: 'ល្បឿន',
  location: 'ទីតាំង',
};

export const logTypeOf = (id: string) => LOG_TYPES.find((t) => t.id === id) || LOG_TYPES[LOG_TYPES.length - 1];
export const typeConfigOf = (type: string) => TYPE_CONFIG[logTypeOf(type).id];
export const fieldLabel = (type: string, f: LogField) => typeConfigOf(type).labels?.[f] || FIELD_LABELS[f];
export const logStatusOf = (status: string, type: string) => {
  const id = (STATUS_IDS.includes(status as VehicleLogStatus) ? status : 'OPEN') as VehicleLogStatus;
  return { id, label: typeConfigOf(type).statuses[id], tone: STATUS_TONE[id] };
};

export interface VehicleLogFile {
  id: number;
  driveFileId: string;
  driveUrl: string;
  fileName: string;
  mimeType: string;
  createdBy: string | null;
  createdAt: string | null;
}

export interface VehicleLog {
  id: number;
  vehicleId: number;
  modelNo: string;
  logType: VehicleLogType;
  logDate: string; // YYYY-MM-DD
  title: string;
  description: string;
  status: VehicleLogStatus;
  cost: number | null;
  shop: string;
  odometer: number | null;
  driver: string;
  speedKmh: number | null;
  speedLimitKmh: number | null;
  location: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  files: VehicleLogFile[];
}

export interface VehicleLogInput {
  id?: number;
  vehicleId: number;
  logType: VehicleLogType;
  logDate: string;
  title: string;
  description: string;
  status: VehicleLogStatus;
  cost: string;
  shop: string;
  odometer: string;
  driver: string;
  speedKmh: string;
  speedLimitKmh: string;
  location: string;
}

export interface VehicleLogSummary {
  vehicleId: number;
  total: number;
  open: number;
  lastDate: string | null;
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
    if (res.status === 413) throw new Error('ឯកសារធំពេក (អតិបរមា 3MB)');
    throw new Error(json?.message || `Request failed (HTTP ${res.status})`);
  }
  return json.data as T;
}

export const fetchVehicleLogs = (vehicleId: number) => call<VehicleLog[]>('vehicle_log_list', { query: { vehicleId } });

export const fetchVehicleLogSummary = () => call<VehicleLogSummary[]>('vehicle_log_summary');

export const saveVehicleLog = (log: VehicleLogInput) => call<VehicleLog>('vehicle_log_save', { body: { log } });

export const addVehicleLogFile = (id: number, fileBase64: string, fileName: string, webAppUrl: string | undefined) =>
  call<VehicleLog>('vehicle_log_add_file', { body: { id, fileBase64, fileName, webAppUrl: webAppUrl || '' } });

export const removeVehicleLogFile = (fileId: number) => call<VehicleLog | null>('vehicle_log_remove_file', { body: { fileId } });

export const deleteVehicleLog = (id: number) => call<{ deleted: number }>('vehicle_log_delete', { body: { id } });

export const driveThumb = (fileId: string, width = 200) => `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;

/** Largest PDF accepted (raw bytes) — base64 must stay under the server's request limit. */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('មិនអាចអានឯកសារបាន'));
    r.readAsDataURL(file);
  });
