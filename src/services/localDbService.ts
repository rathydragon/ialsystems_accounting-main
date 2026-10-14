import { WarehouseScanItem, DistributionReportItem, BankSlipRecord, Payer } from '../types';
import {
  savePayerToMaster,
  deletePayerFromMaster,
  saveBankSlipToMaster,
  deleteBankSlipFromMaster,
  logActivityToMaster,
  saveDistributionReportToMaster,
  deleteDistributionReportFromMaster
} from './mysqlMasterService';

/**
 * ----------------------------------------------------
 * LOCAL DATA LAYER & CACHE SERVICE
 * Fast in-memory state + LocalStorage persistence + Realtime event subscribers
 * ----------------------------------------------------
 */

// ====================================================
// 1. WAREHOUSE SCANS
// ====================================================
const WAREHOUSE_STORAGE_KEY = 'ial_warehouse_scans_data_v1';

let warehouseScansCache: WarehouseScanItem[] = (() => {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(WAREHOUSE_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
})();

const warehouseScansSubscribers = new Set<(items: WarehouseScanItem[]) => void>();

function persistWarehouseCache() {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(WAREHOUSE_STORAGE_KEY, JSON.stringify(warehouseScansCache));
    }
  } catch (e) {
    console.warn('Failed to persist warehouse scans to localStorage:', e);
  }
}

function notifyWarehouseScansSubscribers() {
  const snapshot = [...warehouseScansCache];
  warehouseScansSubscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (err) {
      console.warn('Error in warehouse scans subscriber callback:', err);
    }
  });
}

export type WarehouseRealtimeStatus = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR';

export function getWarehouseRealtimeStatus(): WarehouseRealtimeStatus {
  return 'CONNECTED';
}

export function subscribeToWarehouseRealtimeStatus(
  cb: (status: WarehouseRealtimeStatus) => void
): () => void {
  cb('CONNECTED');
  return () => {};
}

export function mapDbRowToScan(r: any): WarehouseScanItem {
  return {
    id: r.id,
    operationCode: r.operation_code || undefined,
    batchId: r.batch_id || undefined,
    scanType: r.scan_type || 'SCAN_IN',
    barcode: r.barcode,
    tracking: r.tracking || r.barcode,
    shipper: r.shipper || undefined,
    consignee: r.consignee || undefined,
    payment: r.payment || undefined,
    customerName: r.customer_name || r.consignee || undefined,
    customerPhone: r.customer_phone || undefined,
    destination: r.destination || undefined,
    driverName: r.driver_name || undefined,
    truckNo: r.truck_no || undefined,
    codAmount: r.cod_amount !== null && r.cod_amount !== undefined ? Number(r.cod_amount) : undefined,
    currency: r.currency || 'USD',
    location: r.location || undefined,
    riderName: r.rider_name || undefined,
    riderPhone: r.rider_phone || undefined,
    deliveryZone: r.delivery_zone || undefined,
    outReason: r.out_reason || undefined,
    holdReason: r.hold_reason || undefined,
    shelfLocation: r.shelf_location || undefined,
    remarks: r.remarks || undefined,
    date: r.date,
    operatorEmail: r.operator_email || '',
    createdBy: r.created_by || 'User',
    createdAt: r.created_at || new Date().toISOString(),
    updatedAt: r.updated_at || undefined
  };
}

export function getCachedWarehouseScansLive(): WarehouseScanItem[] {
  return warehouseScansCache;
}

export function updateLocalWarehouseScansCache(items: WarehouseScanItem | WarehouseScanItem[]) {
  const list = Array.isArray(items) ? items : [items];
  if (list.length === 0) return;

  const map = new Map(warehouseScansCache.map((s) => [s.id, s]));
  for (const it of list) {
    map.set(it.id, it);
  }
  warehouseScansCache = Array.from(map.values()).sort((a, b) =>
    (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '')
  );
  persistWarehouseCache();
  notifyWarehouseScansSubscribers();
}

export async function fetchWarehouseScans(): Promise<WarehouseScanItem[]> {
  return [...warehouseScansCache];
}

export async function saveWarehouseScan(item: WarehouseScanItem): Promise<boolean> {
  updateLocalWarehouseScansCache(item);
  return true;
}

export async function saveWarehouseScanBatch(items: WarehouseScanItem[]): Promise<boolean> {
  updateLocalWarehouseScansCache(items);
  return true;
}

export async function deleteWarehouseScan(id: string): Promise<boolean> {
  warehouseScansCache = warehouseScansCache.filter((s) => s.id !== id);
  persistWarehouseCache();
  notifyWarehouseScansSubscribers();
  return true;
}

export async function deleteWarehouseScanBatch(ids: string[]): Promise<boolean> {
  const set = new Set(ids);
  warehouseScansCache = warehouseScansCache.filter((s) => !set.has(s.id));
  persistWarehouseCache();
  notifyWarehouseScansSubscribers();
  return true;
}

export async function clearAllWarehouseScans(): Promise<boolean> {
  warehouseScansCache = [];
  persistWarehouseCache();
  notifyWarehouseScansSubscribers();
  return true;
}

export function subscribeToWarehouseScans(
  onUpdate: (items: WarehouseScanItem[]) => void
): () => void {
  warehouseScansSubscribers.add(onUpdate);
  onUpdate([...warehouseScansCache]);
  return () => {
    warehouseScansSubscribers.delete(onUpdate);
  };
}

// ====================================================
// 2. DISTRIBUTION REPORTS
// ====================================================
const DISTRIBUTION_STORAGE_KEY = 'ial_distribution_reports_data_v1';

let distributionReportsCache: DistributionReportItem[] = (() => {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(DISTRIBUTION_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
})();

const distributionReportsSubscribers = new Set<(items: DistributionReportItem[]) => void>();

function persistDistributionCache() {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISTRIBUTION_STORAGE_KEY, JSON.stringify(distributionReportsCache));
    }
  } catch (e) {
    console.warn('Failed to persist distribution reports:', e);
  }
}

function notifyDistributionReportsSubscribers() {
  const snapshot = [...distributionReportsCache];
  distributionReportsSubscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (err) {
      console.warn('Distribution reports subscriber error:', err);
    }
  });
}

export async function fetchDistributionReports(): Promise<DistributionReportItem[]> {
  return [...distributionReportsCache];
}

export async function saveDistributionReport(item: DistributionReportItem): Promise<boolean> {
  const idx = distributionReportsCache.findIndex((d) => d.id === item.id);
  if (idx >= 0) {
    distributionReportsCache[idx] = item;
  } else {
    distributionReportsCache.unshift(item);
  }
  persistDistributionCache();
  notifyDistributionReportsSubscribers();
  saveDistributionReportToMaster(item).catch(() => {});
  return true;
}

export async function saveDistributionReportBatch(items: DistributionReportItem[]): Promise<boolean> {
  const map = new Map(distributionReportsCache.map((d) => [d.id, d]));
  for (const it of items) {
    map.set(it.id, it);
  }
  distributionReportsCache = Array.from(map.values()).sort((a, b) =>
    (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '')
  );
  persistDistributionCache();
  notifyDistributionReportsSubscribers();
  saveDistributionReportToMaster(items).catch(() => {});
  return true;
}

export async function deleteDistributionReport(id: string): Promise<boolean> {
  distributionReportsCache = distributionReportsCache.filter((d) => d.id !== id);
  persistDistributionCache();
  notifyDistributionReportsSubscribers();
  deleteDistributionReportFromMaster(id).catch(() => {});
  return true;
}

export async function deleteDistributionReportBatch(ids: string[]): Promise<boolean> {
  const set = new Set(ids);
  distributionReportsCache = distributionReportsCache.filter((d) => !set.has(d.id));
  persistDistributionCache();
  notifyDistributionReportsSubscribers();
  deleteDistributionReportFromMaster(ids).catch(() => {});
  return true;
}

export function subscribeToDistributionReports(
  onUpdate: (items: DistributionReportItem[]) => void
): () => void {
  distributionReportsSubscribers.add(onUpdate);
  onUpdate([...distributionReportsCache]);
  return () => {
    distributionReportsSubscribers.delete(onUpdate);
  };
}

// ====================================================
// 3. BATCHES (Batches & Medicine Batches)
// ====================================================
const BATCH_STORAGE_KEY_PREFIX = 'ial_batches_';
const batchSubscribers = new Map<string, Set<(batches: any[]) => void>>();

function getLocalBatches(tableName: string): any[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`${BATCH_STORAGE_KEY_PREFIX}${tableName}`) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveLocalBatches(tableName: string, batches: any[]): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`${BATCH_STORAGE_KEY_PREFIX}${tableName}`, JSON.stringify(batches));
    }
  } catch (err) {
    console.warn(`Failed to save batches for ${tableName}:`, err);
  }
}

function notifyBatchSubscribers(tableName: string): void {
  const subs = batchSubscribers.get(tableName);
  if (!subs || subs.size === 0) return;
  const list = getLocalBatches(tableName).filter((b: any) => !b.isDeleted);
  subs.forEach((cb) => {
    try {
      cb(list);
    } catch (e) {
      console.warn(`Batch subscriber error for ${tableName}:`, e);
    }
  });
}

export async function fetchBatches(
  tableName: 'batches' | 'medicine_batches' = 'batches',
  includeDeleted: boolean = false
): Promise<any[]> {
  const local = getLocalBatches(tableName);
  return includeDeleted ? local : local.filter((b: any) => !b.isDeleted);
}

export async function saveBatch(
  batch: any,
  tableName: 'batches' | 'medicine_batches' = 'batches'
): Promise<boolean> {
  if (!batch) return false;
  const id = (batch.id || batch.batchNumber || `batch-${Date.now()}`).trim();
  const current = getLocalBatches(tableName);
  const formatted = {
    ...batch,
    id: id,
    batchNumber: batch.batchNumber || id,
    updatedAt: new Date().toISOString()
  };
  const idx = current.findIndex((b) => b.id === id || b.batchNumber === id);
  if (idx >= 0) {
    current[idx] = formatted;
  } else {
    current.unshift(formatted);
  }
  saveLocalBatches(tableName, current);
  notifyBatchSubscribers(tableName);
  return true;
}

export async function deleteBatch(
  id: string,
  tableNameOrDeletedBy: 'batches' | 'medicine_batches' | string = 'batches',
  softDelete: boolean = true,
  deletedBy?: string
): Promise<boolean> {
  const tableName = (tableNameOrDeletedBy === 'medicine_batches' || tableNameOrDeletedBy === 'batches')
    ? tableNameOrDeletedBy
    : 'batches';
  const effectiveDeletedBy = (tableNameOrDeletedBy !== 'medicine_batches' && tableNameOrDeletedBy !== 'batches')
    ? tableNameOrDeletedBy
    : (deletedBy || 'User');

  const current = getLocalBatches(tableName);
  let updated: any[];
  if (softDelete) {
    updated = current.map((b) =>
      (b.id === id || b.batchNumber === id)
        ? { ...b, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: effectiveDeletedBy }
        : b
    );
  } else {
    updated = current.filter((b) => b.id !== id && b.batchNumber !== id);
  }
  saveLocalBatches(tableName, updated);
  notifyBatchSubscribers(tableName);
  return true;
}

export async function restoreBatch(
  id: string,
  tableName: 'batches' | 'medicine_batches' = 'batches'
): Promise<boolean> {
  const current = getLocalBatches(tableName);
  const updated = current.map((b) =>
    (b.id === id || b.batchNumber === id)
      ? { ...b, isDeleted: false, deletedAt: null, deletedBy: null, updatedAt: new Date().toISOString() }
      : b
  );
  saveLocalBatches(tableName, updated);
  notifyBatchSubscribers(tableName);
  return true;
}

export async function deleteAllBatches(
  tableName: 'batches' | 'medicine_batches' = 'batches'
): Promise<boolean> {
  saveLocalBatches(tableName, []);
  notifyBatchSubscribers(tableName);
  return true;
}

export function subscribeToBatches(
  onUpdate: (batches: any[]) => void,
  tableName: 'batches' | 'medicine_batches' = 'batches',
  _isCollection?: boolean
): () => void {
  if (!batchSubscribers.has(tableName)) {
    batchSubscribers.set(tableName, new Set());
  }
  const subs = batchSubscribers.get(tableName)!;
  subs.add(onUpdate);
  onUpdate(getLocalBatches(tableName).filter((b: any) => !b.isDeleted));

  return () => {
    subs.delete(onUpdate);
  };
}

export function subscribeToDeletedBatches(
  onUpdate: (batches: any[]) => void,
  tableName: 'batches' | 'medicine_batches' = 'batches'
): () => void {
  onUpdate(getLocalBatches(tableName).filter((b: any) => b.isDeleted === true));
  return () => {};
}

// ====================================================
// 4. APP CONFIG
// ====================================================
export async function fetchAppConfig(id: string): Promise<any | null> {
  try {
    const res = await fetch(`/api/app-config?id=${encodeURIComponent(id)}&t=${Date.now()}`);
    if (res.ok) {
      const json = await res.json();
      if (json && json.status === 'success' && json.data) {
        return json.data;
      }
    }
  } catch {}

  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`ial_app_config_${id}`) : null;
    if (raw) return JSON.parse(raw);
  } catch {}

  return null;
}

export async function saveAppConfig(id: string, data: any): Promise<boolean> {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`ial_app_config_${id}`, JSON.stringify(data));
    }
  } catch {}

  try {
    const res = await fetch('/api/app-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, data })
    });
    return res.ok;
  } catch {
    return true; // LocalStorage save succeeded
  }
}

export function subscribeToAppConfig(id: string, onUpdate: (data: any) => void): () => void {
  fetchAppConfig(id).then((val) => {
    if (val) onUpdate(val);
  });
  return () => {};
}

// ====================================================
// 5. ACTIVITY LOGS
// ====================================================
const ACTIVITY_LOGS_STORAGE_KEY = 'accounting_user_activity_logs_v1';

export async function saveActivityLog(log: any): Promise<boolean> {
  if (!log) return true;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(ACTIVITY_LOGS_STORAGE_KEY) : null;
    let list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
    list = [log, ...list].slice(0, 300);
    localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
  logActivityToMaster(log);
  return true;
}

export async function fetchActivityLogs(): Promise<any[]> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(ACTIVITY_LOGS_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

export function subscribeToActivityLogs(onUpdate: (logs: any[]) => void): () => void {
  fetchActivityLogs().then((items) => {
    if (items.length > 0) onUpdate(items);
  });
  return () => {};
}

// ====================================================
// 6. BANK SLIPS
// ====================================================
const BANK_SLIPS_STORAGE_KEY = 'accounting_bank_slips_v1';

export async function fetchBankSlips(): Promise<BankSlipRecord[]> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(BANK_SLIPS_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export async function saveBankSlip(slip: BankSlipRecord): Promise<boolean> {
  if (!slip?.id) return false;
  try {
    const list = await fetchBankSlips();
    const idx = list.findIndex((s) => s.id === slip.id);
    if (idx >= 0) {
      list[idx] = slip;
    } else {
      list.unshift(slip);
    }
    localStorage.setItem(BANK_SLIPS_STORAGE_KEY, JSON.stringify(list));
    // Real-time Master Database write (Hostinger Remote MySQL)
    saveBankSlipToMaster(slip).catch(err => {
      console.warn('[localDbService] Master MySQL bank slip save warning:', err);
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteBankSlip(id: string): Promise<boolean> {
  try {
    const list = await fetchBankSlips();
    const filtered = list.filter((s) => s.id !== id);
    localStorage.setItem(BANK_SLIPS_STORAGE_KEY, JSON.stringify(filtered));
    // Real-time Master Database delete (Hostinger Remote MySQL)
    deleteBankSlipFromMaster(id).catch(err => {
      console.warn('[localDbService] Master MySQL bank slip delete warning:', err);
    });
    return true;
  } catch {
    return false;
  }
}

export function subscribeToBankSlips(onUpdate: (slips: BankSlipRecord[]) => void): () => void {
  fetchBankSlips().then((items) => {
    if (items.length > 0) onUpdate(items);
  });
  return () => {};
}

// ====================================================
// 7. LIST NAME / PAYERS
// ====================================================
const PAYERS_STORAGE_KEY = 'accounting_payers_v1';

export async function fetchListNames(): Promise<Payer[]> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(PAYERS_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return [];
}

export async function saveListName(payer: Payer): Promise<boolean> {
  if (!payer?.id) return false;
  try {
    const list = await fetchListNames();
    const idx = list.findIndex((p) => p.id === payer.id);
    if (idx >= 0) {
      list[idx] = payer;
    } else {
      list.push(payer);
    }
    localStorage.setItem(PAYERS_STORAGE_KEY, JSON.stringify(list));
    // Real-time Master Database write (Hostinger Remote MySQL)
    savePayerToMaster(payer).catch(err => {
      console.warn('[localDbService] Master MySQL payer save warning:', err);
    });
    return true;
  } catch {
    return false;
  }
}

export async function saveListNameBatch(payers: Payer[]): Promise<boolean> {
  if (!Array.isArray(payers) || payers.length === 0) return false;
  try {
    localStorage.setItem(PAYERS_STORAGE_KEY, JSON.stringify(payers));
    // Batch upsert to Master MySQL
    Promise.allSettled(payers.map(p => savePayerToMaster(p))).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function deleteListName(id: string): Promise<boolean> {
  try {
    const list = await fetchListNames();
    const filtered = list.filter((p) => p.id !== id);
    localStorage.setItem(PAYERS_STORAGE_KEY, JSON.stringify(filtered));
    // Real-time Master Database delete (Hostinger Remote MySQL)
    deletePayerFromMaster(id).catch(err => {
      console.warn('[localDbService] Master MySQL payer delete warning:', err);
    });
    return true;
  } catch {
    return false;
  }
}

export function subscribeToListNames(onUpdate: (items: Payer[]) => void): () => void {
  fetchListNames().then((items) => {
    if (items.length > 0) onUpdate(items);
  });
  return () => {};
}

