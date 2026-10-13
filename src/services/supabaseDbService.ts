import { getSupabaseClient, isSupabaseRealtimeConfigured } from '../supabase';
import { WarehouseScanItem, DistributionReportItem, BankSlipRecord } from '../types';

/**
 * ----------------------------------------------------
 * 1. WAREHOUSE SCANS (Supabase Primary Database)
 * ----------------------------------------------------
 */

// In-memory cache & subscription registry to avoid refetch storms
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
let warehouseRealtimeChannel: any = null;
let isInitialWarehouseScansLoaded = false;
let isFetchingWarehouseScans = false;
let lastFullFetchTimestamp = 0;

export type WarehouseRealtimeStatus = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR';
let warehouseRealtimeStatus: WarehouseRealtimeStatus = 'CONNECTING';
const warehouseRealtimeStatusSubscribers = new Set<(status: WarehouseRealtimeStatus) => void>();

function setWarehouseRealtimeStatus(status: WarehouseRealtimeStatus) {
  if (warehouseRealtimeStatus !== status) {
    warehouseRealtimeStatus = status;
    warehouseRealtimeStatusSubscribers.forEach((cb) => {
      try {
        cb(status);
      } catch (err) {
        console.warn('Realtime status subscriber error:', err);
      }
    });
  }
}

export function getWarehouseRealtimeStatus(): WarehouseRealtimeStatus {
  return warehouseRealtimeStatus;
}

export function subscribeToWarehouseRealtimeStatus(
  cb: (status: WarehouseRealtimeStatus) => void
): () => void {
  warehouseRealtimeStatusSubscribers.add(cb);
  cb(warehouseRealtimeStatus);
  return () => {
    warehouseRealtimeStatusSubscribers.delete(cb);
  };
}

export function mapSupabaseRowToScan(r: any): WarehouseScanItem {
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
  notifyWarehouseScansSubscribers();
}

export async function fetchWarehouseScansFromSupabase(): Promise<WarehouseScanItem[]> {
  const client = getSupabaseClient();
  if (!client) return warehouseScansCache;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const { data, error } = await client
      .from('warehouse_scans')
      .select('id, operation_code, batch_id, scan_type, barcode, tracking, shipper, consignee, payment, customer_name, customer_phone, destination, driver_name, truck_no, cod_amount, currency, location, rider_name, rider_phone, delivery_zone, out_reason, hold_reason, shelf_location, remarks, date, operator_email, created_by, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(3000)
      .abortSignal(controller.signal);

    clearTimeout(timer);

    if (error || !Array.isArray(data)) {
      console.warn('Supabase fetch warehouse_scans error (preserving cache):', error);
      return warehouseScansCache;
    }

    const items = data.map(mapSupabaseRowToScan);
    warehouseScansCache = items;
    return items;
  } catch (err: any) {
    clearTimeout(timer);
    console.warn('Supabase fetch warehouse_scans exception (preserving cache):', err?.message || err);
    return warehouseScansCache;
  }
}

function mapScanToSupabaseRow(item: WarehouseScanItem): any {
  return {
    id: item.id,
    operation_code: item.operationCode || null,
    batch_id: item.batchId || null,
    scan_type: item.scanType,
    barcode: item.barcode,
    tracking: item.tracking || item.barcode,
    shipper: item.shipper || null,
    consignee: item.consignee || null,
    payment: item.payment || null,
    customer_name: item.customerName || item.consignee || null,
    customer_phone: item.customerPhone || null,
    destination: item.destination || null,
    driver_name: item.driverName || null,
    truck_no: item.truckNo || null,
    cod_amount: item.codAmount !== undefined && item.codAmount !== null ? Number(item.codAmount) : null,
    currency: item.currency || 'USD',
    location: item.location || null,
    rider_name: item.riderName || null,
    rider_phone: item.riderPhone || null,
    delivery_zone: item.deliveryZone || null,
    out_reason: item.outReason || null,
    hold_reason: item.holdReason || null,
    shelf_location: item.shelfLocation || null,
    remarks: item.remarks || null,
    date: item.date,
    operator_email: item.operatorEmail || null,
    created_by: item.createdBy || 'User',
    created_at: item.createdAt,
    updated_at: new Date().toISOString(),
    raw_data: item
  };
}

export async function saveWarehouseScanToSupabase(item: WarehouseScanItem): Promise<boolean> {
  // Optimistically update memory cache immediately
  updateLocalWarehouseScansCache(item);

  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const row = mapScanToSupabaseRow(item);
    const { error } = await client.from('warehouse_scans').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase saveWarehouseScan error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase saveWarehouseScan exception:', err);
    return false;
  }
}

export async function saveWarehouseScanBatchToSupabase(items: WarehouseScanItem[]): Promise<boolean> {
  if (!items || items.length === 0) return true;
  // Optimistically update memory cache immediately
  updateLocalWarehouseScansCache(items);

  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const rows = items.map(mapScanToSupabaseRow);
    const { error } = await client.from('warehouse_scans').upsert(rows, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase saveWarehouseScanBatch error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase saveWarehouseScanBatch exception:', err);
    return false;
  }
}

export async function deleteWarehouseScanFromSupabase(id: string): Promise<boolean> {
  // Optimistically remove from cache immediately
  warehouseScansCache = warehouseScansCache.filter((s) => s.id !== id);
  notifyWarehouseScansSubscribers();

  const client = getSupabaseClient();
  if (!client) return true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const { error } = await client.from('warehouse_scans').delete().eq('id', id).abortSignal(controller.signal);
    clearTimeout(timer);
    if (error) {
      console.warn('Supabase deleteWarehouseScan error:', error);
      return false;
    }
    return true;
  } catch (err) {
    clearTimeout(timer);
    console.warn('Supabase deleteWarehouseScan exception:', err);
    return false;
  }
}

export async function deleteWarehouseScanBatchFromSupabase(ids: string[]): Promise<boolean> {
  if (!ids || ids.length === 0) return true;
  const idSet = new Set(ids);
  warehouseScansCache = warehouseScansCache.filter((s) => !idSet.has(s.id));
  notifyWarehouseScansSubscribers();

  const client = getSupabaseClient();
  if (!client) return true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const { error } = await client.from('warehouse_scans').delete().in('id', ids).abortSignal(controller.signal);
    clearTimeout(timer);
    if (error) {
      console.warn('Supabase deleteWarehouseScanBatch error:', error);
      return false;
    }
    return true;
  } catch (err) {
    clearTimeout(timer);
    console.warn('Supabase deleteWarehouseScanBatch exception:', err);
    return false;
  }
}

export async function clearAllWarehouseScansFromSupabase(): Promise<boolean> {
  warehouseScansCache = [];
  notifyWarehouseScansSubscribers();

  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from('warehouse_scans').delete().neq('id', '');
    if (error) {
      console.warn('Supabase clearAllWarehouseScans error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase clearAllWarehouseScans exception:', err);
    return false;
  }
}

function handleWarehouseRealtimePayload(payload: any) {
  const { eventType, new: newRow, old: oldRow } = payload;
  let hasChange = false;

  if (eventType === 'INSERT' && newRow) {
    const newItem = mapSupabaseRowToScan(newRow);
    const existingIdx = warehouseScansCache.findIndex((s) => s.id === newItem.id);
    if (existingIdx >= 0) {
      warehouseScansCache[existingIdx] = newItem;
    } else {
      warehouseScansCache = [newItem, ...warehouseScansCache];
    }
    hasChange = true;
  } else if (eventType === 'UPDATE' && newRow) {
    const updatedItem = mapSupabaseRowToScan(newRow);
    const existingIdx = warehouseScansCache.findIndex((s) => s.id === updatedItem.id);
    if (existingIdx >= 0) {
      warehouseScansCache[existingIdx] = updatedItem;
    } else {
      warehouseScansCache = [updatedItem, ...warehouseScansCache];
    }
    hasChange = true;
  } else if (eventType === 'DELETE' && oldRow && oldRow.id) {
    const beforeCount = warehouseScansCache.length;
    warehouseScansCache = warehouseScansCache.filter((s) => s.id !== oldRow.id);
    if (warehouseScansCache.length !== beforeCount) {
      hasChange = true;
    }
  } else {
    // Debounce full fetch for unexpected bulk events (at most once every 5s)
    const now = Date.now();
    if (now - lastFullFetchTimestamp > 5000) {
      lastFullFetchTimestamp = now;
      fetchWarehouseScansFromSupabase().then((items) => {
        warehouseScansCache = items;
        notifyWarehouseScansSubscribers();
      });
    }
    return;
  }

  if (hasChange) {
    notifyWarehouseScansSubscribers();
  }
}

export function subscribeToWarehouseScansFromSupabase(
  onUpdate: (items: WarehouseScanItem[]) => void
): () => void {
  // Register subscriber
  warehouseScansSubscribers.add(onUpdate);

  // If we already have items in memory, serve immediately (0ms latency!)
  if (warehouseScansCache.length > 0) {
    try {
      onUpdate([...warehouseScansCache]);
    } catch (err) {
      console.warn('Initial cache subscriber update error:', err);
    }
  }

  const client = getSupabaseClient();
  if (!client) {
    return () => {
      warehouseScansSubscribers.delete(onUpdate);
    };
  }

  // Initial fetch if not done yet
  if (!isInitialWarehouseScansLoaded && !isFetchingWarehouseScans) {
    isFetchingWarehouseScans = true;
    fetchWarehouseScansFromSupabase().then((items) => {
      isFetchingWarehouseScans = false;
      isInitialWarehouseScansLoaded = true;
      lastFullFetchTimestamp = Date.now();
      if (items && items.length > 0) {
        warehouseScansCache = items;
      }
      notifyWarehouseScansSubscribers();
    });
  }

  // Establish shared Realtime channel if not active
  if (!warehouseRealtimeChannel) {
    const channelName = 'realtime_warehouse_scans_shared';
    setWarehouseRealtimeStatus('CONNECTING');
    warehouseRealtimeChannel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'warehouse_scans' },
        (payload: any) => {
          handleWarehouseRealtimePayload(payload);
        }
      )
      .subscribe((status: string, err?: any) => {
        if (status === 'SUBSCRIBED') {
          setWarehouseRealtimeStatus('CONNECTED');
          // Fresh sync to avoid gaps during subscription handshake
          fetchWarehouseScansFromSupabase().then((items) => {
            warehouseScansCache = items;
            notifyWarehouseScansSubscribers();
          });
        } else if (status === 'CHANNEL_ERROR') {
          setWarehouseRealtimeStatus('ERROR');
          console.warn('Supabase Realtime warehouse_scans channel error:', err);
          // Auto fallback fetch
          fetchWarehouseScansFromSupabase().then((items) => {
            warehouseScansCache = items;
            notifyWarehouseScansSubscribers();
          });
        } else if (status === 'TIMED_OUT' || status === 'CLOSED') {
          setWarehouseRealtimeStatus('DISCONNECTED');
        }
      });
  }

  // Cross-tab & network reconnection safety
  if (typeof window !== 'undefined' && !(window as any).__wh_realtime_listeners_registered) {
    (window as any).__wh_realtime_listeners_registered = true;
    window.addEventListener('focus', () => {
      fetchWarehouseScansFromSupabase().then((items) => {
        warehouseScansCache = items;
        notifyWarehouseScansSubscribers();
      });
    });
    window.addEventListener('online', () => {
      setWarehouseRealtimeStatus('CONNECTING');
      fetchWarehouseScansFromSupabase().then((items) => {
        warehouseScansCache = items;
        notifyWarehouseScansSubscribers();
      });
    });
  }

  return () => {
    warehouseScansSubscribers.delete(onUpdate);
    if (warehouseScansSubscribers.size === 0 && warehouseRealtimeChannel) {
      // Keep channel alive briefly to prevent teardown/reconnect flapping on page navigation
      setTimeout(() => {
        if (warehouseScansSubscribers.size === 0 && warehouseRealtimeChannel) {
          try {
            client.removeChannel(warehouseRealtimeChannel);
          } catch (_) {}
          warehouseRealtimeChannel = null;
          setWarehouseRealtimeStatus('DISCONNECTED');
        }
      }, 5000);
    }
  };
}

/**
 * ----------------------------------------------------
 * 2. DISTRIBUTION REPORTS (Supabase Primary Database)
 * ----------------------------------------------------
 */

export async function fetchDistributionReportsFromSupabase(): Promise<DistributionReportItem[]> {
  const client = getSupabaseClient();
  if (!client) {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('accounting_distribution_reports_v1') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  }

  try {
    const { data, error } = await client
      .from('distribution_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) {
      console.warn('Supabase fetch distribution_reports error:', error);
      return [];
    }

    return data.map((r: any): DistributionReportItem => ({
      id: r.id,
      barcode: r.barcode,
      name: r.name || '',
      date: r.date || '',
      remarks: r.remarks || '',
      createdBy: r.created_by || undefined,
      operatorEmail: r.operator_email || undefined,
      createdAt: r.created_at || new Date().toISOString(),
      updatedAt: r.updated_at || undefined
    }));
  } catch (err) {
    console.warn('Supabase fetch distribution_reports exception:', err);
    return [];
  }
}

function mapDistReportToSupabaseRow(item: DistributionReportItem): any {
  return {
    id: item.id,
    barcode: item.barcode,
    name: item.name,
    remarks: item.remarks,
    date: item.date,
    operator_email: item.operatorEmail || null,
    created_by: item.createdBy || 'User',
    created_at: item.createdAt,
    updated_at: item.updatedAt || new Date().toISOString()
  };
}

export async function saveDistributionReportToSupabase(item: DistributionReportItem): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('accounting_distribution_reports_v1') : null;
      const list: DistributionReportItem[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex(r => r.id === item.id);
      if (idx >= 0) list[idx] = item;
      else list.unshift(item);
      localStorage.setItem('accounting_distribution_reports_v1', JSON.stringify(list));
    } catch (_) {}
    return true;
  }

  try {
    const row = mapDistReportToSupabaseRow(item);
    const { error } = await client.from('distribution_reports').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase saveDistributionReport error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase saveDistributionReport exception:', err);
    return false;
  }
}

export async function saveDistributionReportBatchToSupabase(items: DistributionReportItem[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || items.length === 0) {
    if (items.length > 0) {
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('accounting_distribution_reports_v1') : null;
        const list: DistributionReportItem[] = raw ? JSON.parse(raw) : [];
        const map = new Map(list.map(i => [i.id, i]));
        for (const it of items) map.set(it.id, it);
        localStorage.setItem('accounting_distribution_reports_v1', JSON.stringify(Array.from(map.values())));
      } catch (_) {}
    }
    return true;
  }

  try {
    const rows = items.map(mapDistReportToSupabaseRow);
    const { error } = await client.from('distribution_reports').upsert(rows, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase saveDistributionReportBatch error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase saveDistributionReportBatch exception:', err);
    return false;
  }
}

export async function deleteDistributionReportFromSupabase(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('accounting_distribution_reports_v1') : null;
      if (raw) {
        const list: DistributionReportItem[] = JSON.parse(raw);
        const filtered = list.filter(r => r.id !== id);
        localStorage.setItem('accounting_distribution_reports_v1', JSON.stringify(filtered));
      }
    } catch (_) {}
    return true;
  }

  try {
    const { error } = await client.from('distribution_reports').delete().eq('id', id);
    if (error) {
      console.warn('Supabase deleteDistributionReport error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase deleteDistributionReport exception:', err);
    return false;
  }
}

export async function deleteDistributionReportBatchFromSupabase(ids: string[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || ids.length === 0) {
    if (ids.length > 0) {
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('accounting_distribution_reports_v1') : null;
        if (raw) {
          const idSet = new Set(ids);
          const list: DistributionReportItem[] = JSON.parse(raw);
          const filtered = list.filter(r => !idSet.has(r.id));
          localStorage.setItem('accounting_distribution_reports_v1', JSON.stringify(filtered));
        }
      } catch (_) {}
    }
    return true;
  }

  try {
    const { error } = await client.from('distribution_reports').delete().in('id', ids);
    if (error) {
      console.warn('Supabase deleteDistributionReportBatch error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase deleteDistributionReportBatch exception:', err);
    return false;
  }
}

export function subscribeToDistributionReportsFromSupabase(
  onUpdate: (items: DistributionReportItem[]) => void
): () => void {
  const client = getSupabaseClient();
  if (!client) {
    fetchDistributionReportsFromSupabase().then((items) => {
      if (items.length > 0) onUpdate(items);
    });
    return () => {};
  }

  // Initial fetch
  fetchDistributionReportsFromSupabase().then((items) => {
    if (items.length > 0) onUpdate(items);
  });

  const channelName = `realtime_distribution_reports_${Date.now()}`;
  const channel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'distribution_reports' },
      async () => {
        const fresh = await fetchDistributionReportsFromSupabase();
        onUpdate(fresh);
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

/**
 * ----------------------------------------------------
 * 3. BATCHES & MEDICINE BATCHES (Local Cache & Google Sheets Backend)
 * ----------------------------------------------------
 */

function getLocalBatches(tableName: string): any[] {
  try {
    const key = tableName === 'medicine_batches' ? 'accounting_medicine_batches_v2' : 'accounting_batches_v2';
    const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

function saveLocalBatches(tableName: string, list: any[]): void {
  try {
    const key = tableName === 'medicine_batches' ? 'accounting_medicine_batches_v2' : 'accounting_batches_v2';
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(list));
    }
  } catch (_) {}
}

const batchSubscribers = new Map<string, Set<(batches: any[]) => void>>();
function notifyBatchSubscribers(tableName: string) {
  const subs = batchSubscribers.get(tableName);
  if (!subs) return;
  const list = getLocalBatches(tableName).filter((b) => !b.isDeleted);
  subs.forEach((cb) => {
    try {
      cb(list);
    } catch (_) {}
  });
}

export async function fetchBatchesFromSupabase(
  tableName: 'batches' | 'medicine_batches' = 'batches',
  includeDeleted: boolean = false,
  fetchLimit: number = 300
): Promise<any[]> {
  const client = getSupabaseClient();
  if (!client) {
    const local = getLocalBatches(tableName);
    return includeDeleted ? local : local.filter((b: any) => !b.isDeleted);
  }

  try {
    let query = client
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(fetchLimit);

    if (!includeDeleted) {
      query = query.or('is_deleted.is.null,is_deleted.eq.false');
    }

    const { data, error } = await query;

    if (error || !Array.isArray(data)) {
      console.warn(`Supabase fetch ${tableName} error:`, error);
      const local = getLocalBatches(tableName);
      return includeDeleted ? local : local.filter((b: any) => !b.isDeleted);
    }

    return data.map((r: any) => {
      if (r.raw_data && typeof r.raw_data === 'object') {
        return {
          ...r.raw_data,
          id: r.id,
          batchNumber: r.batch_number || r.id,
          createdAt: r.created_at,
          items: r.items || r.raw_data.items || [],
          isDeleted: r.is_deleted === true || r.raw_data.isDeleted === true,
          deletedAt: r.deleted_at || r.raw_data.deletedAt,
          deletedBy: r.deleted_by || r.raw_data.deletedBy
        };
      }
      return {
        id: r.id,
        batchNumber: r.batch_number || r.id,
        operator: r.operator,
        operatorEmail: r.operator_email,
        date: r.date,
        totalItems: r.total_items,
        cashKHR: Number(r.cash_khr || 0),
        cashUSD: Number(r.cash_usd || 0),
        bankKHR: Number(r.bank_khr || 0),
        bankUSD: Number(r.bank_usd || 0),
        totalKHR: Number(r.total_khr || 0),
        totalUSD: Number(r.total_usd || 0),
        status: r.status,
        createdAt: r.created_at,
        items: r.items || [],
        isDeleted: r.is_deleted === true,
        deletedAt: r.deleted_at || undefined,
        deletedBy: r.deleted_by || undefined
      };
    });
  } catch (err) {
    console.warn(`Supabase fetch ${tableName} exception:`, err);
    return [];
  }
}

export async function saveBatchToSupabase(
  batch: any,
  tableName: 'batches' | 'medicine_batches' = 'batches'
): Promise<boolean> {
  if (!batch) return false;
  const id = (batch.id || batch.batchNumber || `batch-${Date.now()}`).trim();

  // Optimistically save to local cache
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

  const client = getSupabaseClient();
  if (!client) return true;

  try {
    const row = {
      id: id,
      batch_number: batch.batchNumber || id,
      operator: batch.operator || null,
      operator_email: batch.operatorEmail || null,
      date: batch.date || new Date().toISOString().slice(0, 10),
      total_items: batch.totalItems || (Array.isArray(batch.items) ? batch.items.length : 0),
      cash_khr: Number(batch.cashKHR || 0),
      cash_usd: Number(batch.cashUSD || 0),
      bank_khr: Number(batch.bankKHR || 0),
      bank_usd: Number(batch.bankUSD || 0),
      total_khr: Number(batch.totalKHR || 0),
      total_usd: Number(batch.totalUSD || 0),
      status: batch.status || 'COMPLETED',
      created_at: batch.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: batch.items || [],
      raw_data: batch,
      is_deleted: batch.isDeleted === true,
      deleted_at: batch.deletedAt || null,
      deleted_by: batch.deletedBy || null
    };

    const { error } = await client.from(tableName).upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn(`Supabase saveBatch to ${tableName} error:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`Supabase saveBatch to ${tableName} exception:`, err);
    return false;
  }
}

export async function deleteBatchFromSupabase(
  idOrBatchNumber: string,
  tableName: 'batches' | 'medicine_batches' = 'batches',
  softDelete: boolean = true,
  deletedBy?: string
): Promise<boolean> {
  const safeId = idOrBatchNumber.trim();

  // Optimistically update local cache
  const current = getLocalBatches(tableName);
  let updated: any[];
  if (softDelete) {
    updated = current.map((b) =>
      b.id === safeId || b.batchNumber === safeId
        ? { ...b, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: deletedBy || 'User' }
        : b
    );
  } else {
    updated = current.filter((b) => b.id !== safeId && b.batchNumber !== safeId);
  }
  saveLocalBatches(tableName, updated);
  notifyBatchSubscribers(tableName);

  const client = getSupabaseClient();
  if (!client) return true;

  try {
    if (softDelete) {
      // Mark as deleted for Recycle Bin
      const { error } = await client
        .from(tableName)
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: deletedBy || 'User',
          updated_at: new Date().toISOString()
        })
        .or(`id.eq.${safeId},batch_number.eq.${safeId}`);

      if (error) {
        console.warn(`Supabase soft-delete ${tableName} error:`, error);
        return false;
      }
      return true;
    } else {
      // Permanent Delete
      const { error } = await client
        .from(tableName)
        .delete()
        .or(`id.eq.${safeId},batch_number.eq.${safeId}`);

      if (error) {
        console.warn(`Supabase hard-delete ${tableName} error:`, error);
        return false;
      }
      return true;
    }
  } catch (err) {
    console.warn(`Supabase deleteBatch from ${tableName} exception:`, err);
    return false;
  }
}

export async function restoreBatchFromSupabase(
  idOrBatchNumber: string,
  tableName: 'batches' | 'medicine_batches' = 'batches'
): Promise<boolean> {
  const safeId = idOrBatchNumber.trim();

  // Optimistically update local cache
  const current = getLocalBatches(tableName);
  const updated = current.map((b) =>
    b.id === safeId || b.batchNumber === safeId
      ? { ...b, isDeleted: false, deletedAt: null, deletedBy: null }
      : b
  );
  saveLocalBatches(tableName, updated);
  notifyBatchSubscribers(tableName);

  const client = getSupabaseClient();
  if (!client) return true;

  try {
    const { error } = await client
      .from(tableName)
      .update({
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
        updated_at: new Date().toISOString()
      })
      .or(`id.eq.${safeId},batch_number.eq.${safeId}`);

    return !error;
  } catch {
    return false;
  }
}

export async function deleteAllBatchesFromSupabase(
  tableName: 'batches' | 'medicine_batches' = 'batches'
): Promise<boolean> {
  saveLocalBatches(tableName, []);
  notifyBatchSubscribers(tableName);

  const client = getSupabaseClient();
  if (!client) return true;

  try {
    const { error } = await client.from(tableName).delete().neq('id', '');
    return !error;
  } catch {
    return false;
  }
}

export function subscribeToBatchesFromSupabase(
  onUpdate: (batches: any[]) => void,
  tableName: 'batches' | 'medicine_batches' = 'batches',
  filterDeleted: boolean = true
): () => void {
  if (!batchSubscribers.has(tableName)) {
    batchSubscribers.set(tableName, new Set());
  }
  batchSubscribers.get(tableName)!.add(onUpdate);

  // Immediately emit local cached data (0ms instant render)
  const local = getLocalBatches(tableName);
  onUpdate(filterDeleted ? local.filter((b: any) => !b.isDeleted) : local);

  const client = getSupabaseClient();
  if (!client) {
    return () => {
      batchSubscribers.get(tableName)?.delete(onUpdate);
    };
  }

  // Initial fetch
  fetchBatchesFromSupabase(tableName, !filterDeleted).then((items) => {
    if (items.length > 0) onUpdate(items);
  });

  const channelName = `realtime_${tableName}_${Date.now()}`;
  const channel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tableName },
      async () => {
        const fresh = await fetchBatchesFromSupabase(tableName, !filterDeleted);
        onUpdate(fresh);
      }
    )
    .subscribe();

  return () => {
    batchSubscribers.get(tableName)?.delete(onUpdate);
    client.removeChannel(channel);
  };
}

export function subscribeToDeletedBatchesFromSupabase(
  onUpdate: (batches: any[]) => void,
  tableName: 'batches' | 'medicine_batches' = 'batches'
): () => void {
  const local = getLocalBatches(tableName);
  onUpdate(local.filter((b: any) => b.isDeleted));

  const client = getSupabaseClient();
  if (!client) return () => {};

  const loadDeleted = async () => {
    try {
      const { data } = await client
        .from(tableName)
        .select('*')
        .eq('is_deleted', true)
        .order('deleted_at', { ascending: false });

      if (Array.isArray(data)) {
        onUpdate(data.map((r: any) => ({
          ...(r.raw_data || {}),
          id: r.id,
          batchNumber: r.batch_number || r.id,
          isDeleted: true,
          deletedAt: r.deleted_at,
          deletedBy: r.deleted_by
        })));
      }
    } catch (_) {}
  };

  loadDeleted();

  const channelName = `realtime_deleted_${tableName}_${Date.now()}`;
  const channel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tableName },
      () => {
        loadDeleted();
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

/**
 * ----------------------------------------------------
 * 4. APP CONFIG (Sheet URLs & Configurations)
 * ----------------------------------------------------
 */

export async function fetchAppConfigFromSupabase(id: string): Promise<any | null> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('app_config')
        .select('data')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) return data.data;
    } catch (err) {
      console.warn(`Supabase fetchAppConfig error for ${id}:`, err);
    }
  }

  // Fallback to /api/app-config endpoint
  try {
    const res = await fetch(`/api/app-config?id=${encodeURIComponent(id)}&t=${Date.now()}`);
    if (res.ok) {
      const json = await res.json();
      if (json && json.status === 'success' && json.data) {
        return json.data;
      }
    }
  } catch {}

  return null;
}

export async function saveAppConfigToSupabase(id: string, data: any): Promise<boolean> {
  const client = getSupabaseClient();
  let saved = false;

  if (client) {
    try {
      const { error } = await client
        .from('app_config')
        .upsert({ id, data, updated_at: new Date().toISOString() }, { onConflict: 'id' });

      if (!error) saved = true;
    } catch (err) {
      console.warn(`Supabase saveAppConfig error for ${id}:`, err);
    }
  }

  // Backup fallback: post to /api/app-config
  if (!saved) {
    try {
      const res = await fetch('/api/app-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, data })
      });
      if (res.ok) saved = true;
    } catch (err) {
      console.warn(`Backend /api/app-config fallback error for ${id}:`, err);
    }
  }

  return saved;
}

export function subscribeToAppConfigFromSupabase(id: string, onUpdate: (data: any) => void): () => void {
  const client = getSupabaseClient();
  if (!client) {
    fetchAppConfigFromSupabase(id).then((val) => {
      if (val) onUpdate(val);
    });
    return () => {};
  }

  fetchAppConfigFromSupabase(id).then((val) => {
    if (val) onUpdate(val);
  });

  const channelName = `realtime_app_config_${id}_${Date.now()}`;
  const channel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_config', filter: `id=eq.${id}` },
      (payload) => {
        if (payload.new && (payload.new as any).data) {
          onUpdate((payload.new as any).data);
        }
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

/**
 * ----------------------------------------------------
 * 5. ACTIVITY LOGS (Local Storage & Google Sheets Fallback)
 * ----------------------------------------------------
 */

export async function saveActivityLogToSupabase(log: any): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !log) {
    if (log) {
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('accounting_user_activity_logs_v1') : null;
        let list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) list = [];
        list = [log, ...list].slice(0, 300);
        localStorage.setItem('accounting_user_activity_logs_v1', JSON.stringify(list));
      } catch (_) {}
    }
    return true;
  }

  try {
    const row = {
      id: log.id || `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action: log.action || null,
      operator: log.operator || null,
      operator_email: log.operatorEmail || null,
      title: log.title || null,
      description: log.description || null,
      batch_number: log.batchNumber || null,
      target_user_email: log.targetUserEmail || null,
      timestamp: log.timestamp || new Date().toISOString(),
      raw_data: log
    };

    const { error } = await client.from('activity_logs').upsert(row, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchActivityLogsFromSupabase(): Promise<any[]> {
  const client = getSupabaseClient();
  if (!client) {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('accounting_user_activity_logs_v1') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  }

  try {
    const { data, error } = await client
      .from('activity_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(300);

    if (error || !Array.isArray(data)) return [];
    return data.map((r: any) => r.raw_data || {
      id: r.id,
      action: r.action,
      operator: r.operator,
      operatorEmail: r.operator_email,
      title: r.title,
      description: r.description,
      batchNumber: r.batch_number,
      targetUserEmail: r.target_user_email,
      timestamp: r.timestamp
    });
  } catch {
    return [];
  }
}

export function subscribeToActivityLogsFromSupabase(
  onUpdate: (logs: any[]) => void
): () => void {
  const client = getSupabaseClient();
  if (!client) {
    fetchActivityLogsFromSupabase().then((items) => {
      if (items.length > 0) onUpdate(items);
    });
    return () => {};
  }

  fetchActivityLogsFromSupabase().then((items) => {
    if (items.length > 0) onUpdate(items);
  });

  const channelName = `realtime_activity_logs_${Date.now()}`;
  const channel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'activity_logs' },
      async () => {
        const fresh = await fetchActivityLogsFromSupabase();
        onUpdate(fresh);
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

/**
 * ----------------------------------------------------
 * 6. BANK SLIPS (Supabase Primary Database)
 * ----------------------------------------------------
 */

export async function fetchBankSlipsFromSupabase(): Promise<BankSlipRecord[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('bank_slips')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) {
      console.warn('Supabase fetch bank_slips error:', error);
      return [];
    }

    return data.map((r: any): BankSlipRecord => {
      if (r.raw_data && typeof r.raw_data === 'object') {
        return {
          ...r.raw_data,
          id: r.id,
          awbn: r.awbn || r.raw_data.awbn || '',
          createdAt: r.created_at || r.raw_data.createdAt
        };
      }
      return {
        id: r.id,
        awbn: r.awbn || '',
        category: r.category === 'Borey' ? 'Borey' : 'Buymed',
        amount: r.amount !== null && r.amount !== undefined ? Number(r.amount) : undefined,
        currency: r.currency || 'USD',
        bankName: r.bank_name || '',
        receiverName: r.receiver_name || '',
        imageUrl: r.image_url || '',
        driveFileId: r.drive_file_id || '',
        driveViewUrl: r.drive_view_url || '',
        imageName: r.image_name || '',
        note: r.note || '',
        operator: r.operator || 'Unknown',
        operatorEmail: r.operator_email || '',
        createdAt: r.created_at || new Date().toISOString()
      };
    });
  } catch (err) {
    console.warn('Supabase fetch bank_slips exception:', err);
    return [];
  }
}

export async function saveBankSlipToSupabase(slip: BankSlipRecord): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !slip?.id) return false;

  try {
    const row = {
      id: slip.id,
      awbn: slip.awbn || null,
      category: slip.category || 'Buymed',
      amount: slip.amount !== undefined && slip.amount !== null ? Number(slip.amount) : null,
      currency: slip.currency || 'USD',
      bank_name: slip.bankName || null,
      receiver_name: slip.receiverName || null,
      image_url: slip.imageUrl || null,
      drive_file_id: slip.driveFileId || null,
      drive_view_url: slip.driveViewUrl || null,
      image_name: slip.imageName || null,
      note: slip.note || null,
      operator: slip.operator || null,
      operator_email: slip.operatorEmail || null,
      created_at: slip.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      raw_data: slip
    };

    const { error } = await client.from('bank_slips').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase saveBankSlip error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase saveBankSlip exception:', err);
    return false;
  }
}

export async function deleteBankSlipFromSupabase(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from('bank_slips').delete().eq('id', id);
    if (error) {
      console.warn('Supabase deleteBankSlip error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase deleteBankSlip exception:', err);
    return false;
  }
}

export function subscribeToBankSlipsFromSupabase(
  onUpdate: (slips: BankSlipRecord[]) => void
): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  fetchBankSlipsFromSupabase().then((items) => {
    if (items.length > 0) onUpdate(items);
  });

  const channelName = `realtime_bank_slips_${Date.now()}`;
  const channel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bank_slips' },
      async () => {
        const fresh = await fetchBankSlipsFromSupabase();
        onUpdate(fresh);
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
