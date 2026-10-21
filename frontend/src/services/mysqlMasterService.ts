/**
 * 🚀 MySQL Master Database Client Service
 * ភ្ជាប់ទៅកាន់ Hostinger Remote MySQL ធ្វើជា Master Database
 * គ្រប់គ្រង Add, Edit, Delete លើ Cloud MySQL ដោយផ្ទាល់
 */

import { CollectionBatch, WarehouseScanItem, BankSlipRecord, Payer, UserPermission } from '../types';
import { DistributionReportItem } from './distributionReportService';
import { authFetch } from './apiClient';

const API_BASE = '/api/remote-mysql';

function getWebAppUrl(): string {
  try {
    const raw = localStorage.getItem('accounting_app_settings_v2') || localStorage.getItem('accounting_app_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.webAppUrl?.trim()) return parsed.webAppUrl.trim();
    }
  } catch {}
  return (import.meta as any).env?.VITE_GOOGLE_WEBAPP_URL || '';
}

/**
 * Small fingerprint that changes whenever any master data changes. Returns null on error,
 * so callers fall back to a full sync.
 */
export async function fetchMasterDataVersion(): Promise<string | null> {
  try {
    const res = await authFetch(`${API_BASE}?action=master_version&t=${Date.now()}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.ok && typeof json.version === 'string' ? json.version : null;
  } catch {
    return null;
  }
}

/**
 * ទាញយកទិន្នន័យ Master ទាំងអស់ក្នុងពេលតែមួយ (One-shot Fast Sync)
 */
export async function fetchAllMasterData(): Promise<{
  ok: boolean;
  batches: CollectionBatch[];
  medicineBatches: CollectionBatch[];
  codBatches: CollectionBatch[];
  payers: Payer[];
  permissions: UserPermission[];
  bankSlips: BankSlipRecord[];
  warehouseScans: WarehouseScanItem[];
  settings: Record<string, any>;
  distributionReports: DistributionReportItem[];
  durationMs?: number;
} | null> {
  try {
    const res = await authFetch(`${API_BASE}?action=get_all_master_data&t=${Date.now()}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.ok && json.data) {
      return {
        ok: true,
        batches: json.data.batches || [],
        medicineBatches: json.data.medicineBatches || [],
        codBatches: json.data.codBatches || [],
        payers: json.data.payers || [],
        permissions: json.data.permissions || [],
        bankSlips: json.data.bankSlips || [],
        warehouseScans: json.data.warehouseScans || [],
        settings: json.data.settings || {},
        distributionReports: json.data.distributionReports || [],
        durationMs: json.durationMs
      };
    }
  } catch (err) {
    console.warn('[MySQL Master] Fetch all master data error:', err);
  }
  return null;
}

/**
 * រក្សាទុកកញ្ចប់ Collection Batch ឬ Medicine Batch ចូល MySQL
 */
export async function saveBatchToMaster(
  batch: CollectionBatch,
  isMedicine: boolean = false
): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: isMedicine ? 'save_medicine_batch' : 'save_batch',
        batch,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Save batch error:', err);
    return false;
  }
}

/**
 * រក្សាទុកកញ្ចប់ COD Batch ចូល Hostinger Primary (tbl_cod_collections)
 */
export async function saveCodBatchToMaster(batch: CollectionBatch): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_cod_batch',
        batch,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Save COD batch error:', err);
    return false;
  }
}

/**
 * លុបកញ្ចប់ Batch ពី MySQL
 */
export async function deleteBatchFromMaster(
  batchNumber: string,
  isMedicine: boolean = false
): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: isMedicine ? 'delete_medicine_batch' : 'delete_batch',
        batchNumber,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Delete batch error:', err);
    return false;
  }
}

/**
 * លុបកញ្ចប់ COD Batch ពី Hostinger Primary (tbl_cod_collections)
 */
export async function deleteCodBatchFromMaster(batchNumber: string): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_cod_batch',
        batchNumber,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Delete COD batch error:', err);
    return false;
  }
}

/**
 * លុបកញ្ចប់ទាំងអស់ពី Hostinger Primary (Batches or Medicine)
 */
export async function deleteAllBatchesFromMaster(isMedicine: boolean = false): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: isMedicine ? 'delete_all_medicine_batches' : 'delete_all_batches',
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Delete all batches error:', err);
    return false;
  }
}

/**
 * លុបកញ្ចប់ COD ទាំងអស់ពី Hostinger Primary (tbl_cod_collections)
 */
export async function deleteAllCodBatchesFromMaster(): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_all_cod_batches',
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Delete all COD batches error:', err);
    return false;
  }
}

/**
 * រក្សាទុក Payer (List Name) ចូល MySQL
 */
export async function savePayerToMaster(payer: Payer): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_payer',
        payer,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Save payer error:', err);
    return false;
  }
}

/**
 * លុប Payer ពី MySQL
 */
export async function deletePayerFromMaster(id: string): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_payer',
        id,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Delete payer error:', err);
    return false;
  }
}

/**
 * រក្សាទុក Warehouse Scan Items ចូល MySQL
 */
export async function saveWarehouseScansToMaster(
  items: WarehouseScanItem | WarehouseScanItem[]
): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_warehouse_scans',
        items: Array.isArray(items) ? items : [items],
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Save warehouse scans error:', err);
    return false;
  }
}

/**
 * លុប Warehouse Scan Item ពី MySQL
 */
export async function deleteWarehouseScanFromMaster(
  id?: string,
  scanType?: string,
  barcode?: string
): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_warehouse_scan',
        id,
        scanType,
        barcode,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Delete warehouse scan error:', err);
    return false;
  }
}

/**
 * លុប Warehouse Scan Items ជាក្រុម (Batch) ពី MySQL
 */
export async function deleteWarehouseScanBatchFromMaster(
  items: Array<{ id: string; barcode?: string; scanType?: string }>
): Promise<boolean> {
  if (!items || items.length === 0) return true;
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_warehouse_scans_batch',
        items,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Batch delete warehouse scans error:', err);
    return false;
  }
}

/**
 * សម្អាត Warehouse Scans ទាំងអស់ពី MySQL
 */
export async function clearAllWarehouseScansFromMaster(scanType?: string): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'clear_all_warehouse_scans',
        scanType,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Clear all warehouse scans error:', err);
    return false;
  }
}

/**
 * រក្សាទុក Bank Slip ចូល MySQL
 */
export async function saveBankSlipToMaster(slip: BankSlipRecord): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_bank_slip',
        slip,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Save bank slip error:', err);
    return false;
  }
}

/**
 * លុប Bank Slip ពី MySQL
 */
export async function deleteBankSlipFromMaster(id: string): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_bank_slip',
        id,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Delete bank slip error:', err);
    return false;
  }
}

/**
 * រក្សាទុក User Permission ចូល MySQL
 */
export async function savePermissionToMaster(perm: UserPermission): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_permission',
        permission: perm,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Save permission error:', err);
    return false;
  }
}

/**
 * លុប User Permission ពី MySQL Master
 */
export async function deletePermissionFromMaster(email: string): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_permission',
        email,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Delete permission error:', err);
    return false;
  }
}

/**
 * រក្សាទុក Settings ចូល MySQL
 */
export async function saveSettingsToMaster(settings: Record<string, any>): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_settings',
        settings,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Save settings error:', err);
    return false;
  }
}

/**
 * Daily Telegram summary lock in MySQL (one sender per day across all devices)
 * Returns null when the server could not be reached.
 */
export async function dailySummaryLock(
  op: 'claim' | 'mark' | 'release',
  date: string
): Promise<{ ok: boolean; claimed?: boolean } | null> {
  try {
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'daily_summary_lock', op, date })
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json && json.ok ? json : null;
  } catch (err) {
    console.warn('[MySQL Master] Daily summary lock error:', err);
    return null;
  }
}

/**
 * កត់ត្រាសកម្មភាព Audit Log ចូល MySQL
 */
export async function logActivityToMaster(log: any): Promise<void> {
  try {
    authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'log_activity',
        log
      })
    }).catch(() => {});
  } catch (_) {}
}

/**
 * Read the User Logs of every user from MySQL (newest first). Admin only; null on failure.
 */
export async function fetchUserLogsFromMaster(limit = 2000): Promise<any[] | null> {
  try {
    const res = await authFetch(`${API_BASE}?action=get_user_logs&limit=${limit}&t=${Date.now()}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.ok && Array.isArray(json.data) ? json.data : null;
  } catch {
    return null;
  }
}

/**
 * រក្សាទុក Distribution Report ចូល MySQL Master (Real-time CRUD)
 */
export async function saveDistributionReportToMaster(
  report: DistributionReportItem | DistributionReportItem[]
): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_distribution_report',
        reports: Array.isArray(report) ? report : [report],
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Save distribution report error:', err);
    return false;
  }
}

/**
 * លុប Distribution Report ពី MySQL Master (Real-time CRUD)
 */
export async function deleteDistributionReportFromMaster(
  idOrIds: string | string[],
  barcode?: string
): Promise<boolean> {
  try {
    const webAppUrl = getWebAppUrl();
    const res = await authFetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_distribution_report',
        ids: Array.isArray(idOrIds) ? idOrIds : [idOrIds],
        barcode,
        webAppUrl
      })
    });
    const json = await res.json();
    return Boolean(json && json.ok);
  } catch (err) {
    console.warn('[MySQL Master] Delete distribution report error:', err);
    return false;
  }
}
