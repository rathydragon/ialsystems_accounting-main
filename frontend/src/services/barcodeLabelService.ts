// Barcode labels — stored only in this browser (IndexedDB). Nothing goes to the server.

export interface BarcodeLabel {
  id: string;
  barcode: string;
  date: string;          // YYYY-MM-DD
  companyName: string;
  active: boolean;       // Verify active: only active labels can be printed / pass verify
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  printCount: number;
  lastPrintedAt?: string;
}

const DB_NAME = 'ial_barcode_labels';
const DB_VERSION = 1;
const STORE = 'labels';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Browser នេះមិនគាំទ្រ Local database (IndexedDB)'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('barcode', 'barcode', { unique: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('បើក Local database មិនបាន'));
    };
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    let result: T;
    req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || req.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  }));
}

export const normalizeBarcode = (s: string) => s.replace(/[​-‍﻿\u0000-\u001F\u007F-\u009F]/g, '').trim().toUpperCase();

export async function listLabels(): Promise<BarcodeLabel[]> {
  const rows = await run<BarcodeLabel[]>('readonly', s => s.getAll() as IDBRequest<BarcodeLabel[]>);
  return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function findByBarcode(barcode: string): Promise<BarcodeLabel | undefined> {
  const code = normalizeBarcode(barcode);
  if (!code) return undefined;
  return run<BarcodeLabel | undefined>('readonly', s => s.index('barcode').get(code) as IDBRequest<BarcodeLabel | undefined>);
}

const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Create or update. Throws if the barcode already belongs to another label. */
export async function saveLabel(
  input: { id?: string; barcode: string; date: string; companyName: string; active: boolean },
  createdBy?: string,
): Promise<BarcodeLabel> {
  const barcode = normalizeBarcode(input.barcode);
  if (!barcode) throw new Error('សូមបញ្ចូល Barcode');
  const dup = await findByBarcode(barcode);
  if (dup && dup.id !== input.id) throw new Error(`Barcode ${barcode} មានរួចហើយ`);

  const now = new Date().toISOString();
  const existing = input.id ? await run<BarcodeLabel | undefined>('readonly', s => s.get(input.id!) as IDBRequest<BarcodeLabel | undefined>) : undefined;
  const row: BarcodeLabel = {
    printCount: 0,
    createdAt: now,
    createdBy,
    ...existing,
    id: existing?.id || newId(),
    barcode,
    date: input.date,
    companyName: input.companyName.trim(),
    active: input.active,
    updatedAt: now,
  };
  await run('readwrite', s => s.put(row));
  return row;
}

export async function setLabelActive(id: string, active: boolean): Promise<void> {
  const row = await run<BarcodeLabel | undefined>('readonly', s => s.get(id) as IDBRequest<BarcodeLabel | undefined>);
  if (!row) return;
  await run('readwrite', s => s.put({ ...row, active, updatedAt: new Date().toISOString() }));
}

export async function markPrinted(ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  for (const id of ids) {
    const row = await run<BarcodeLabel | undefined>('readonly', s => s.get(id) as IDBRequest<BarcodeLabel | undefined>);
    if (row) await run('readwrite', s => s.put({ ...row, printCount: (row.printCount || 0) + 1, lastPrintedAt: now }));
  }
}

export async function deleteLabels(ids: string[]): Promise<void> {
  for (const id of ids) await run('readwrite', s => s.delete(id));
}

/** Next `count` barcodes = prefix + running number after the highest one already used. */
export async function nextBarcodes(prefix: string, count = 1, digits = 8): Promise<string[]> {
  const p = normalizeBarcode(prefix);
  const rows = await listLabels();
  let max = 0;
  for (const r of rows) {
    if (!r.barcode.startsWith(p)) continue;
    const tail = r.barcode.slice(p.length);
    if (/^\d+$/.test(tail)) max = Math.max(max, Number(tail));
  }
  return Array.from({ length: count }, (_, i) => `${p}${String(max + 1 + i).padStart(digits, '0')}`);
}

export async function nextBarcode(prefix: string, digits = 8): Promise<string> {
  return (await nextBarcodes(prefix, 1, digits))[0];
}
