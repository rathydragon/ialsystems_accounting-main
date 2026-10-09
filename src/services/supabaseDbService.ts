import { getSupabaseClient, isSupabaseRealtimeConfigured } from '../supabase';
import { WarehouseScanItem, DistributionReportItem, BankSlipRecord } from '../types';

/**
 * ----------------------------------------------------
 * 1. WAREHOUSE SCANS (Supabase Primary Database)
 * ----------------------------------------------------
 */

export async function fetchWarehouseScansFromSupabase(): Promise<WarehouseScanItem[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('warehouse_scans')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) {
      console.warn('Supabase fetch warehouse_scans error:', error);
      return [];
    }

    return data.map((r: any): WarehouseScanItem => ({
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
    }));
  } catch (err) {
    console.warn('Supabase fetch warehouse_scans exception:', err);
    return [];
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
  const client = getSupabaseClient();
  if (!client || items.length === 0) return false;

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
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from('warehouse_scans').delete().eq('id', id);
    if (error) {
      console.warn('Supabase deleteWarehouseScan error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase deleteWarehouseScan exception:', err);
    return false;
  }
}

export async function deleteWarehouseScanBatchFromSupabase(ids: string[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || ids.length === 0) return false;

  try {
    const { error } = await client.from('warehouse_scans').delete().in('id', ids);
    if (error) {
      console.warn('Supabase deleteWarehouseScanBatch error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase deleteWarehouseScanBatch exception:', err);
    return false;
  }
}

export function subscribeToWarehouseScansFromSupabase(
  onUpdate: (items: WarehouseScanItem[]) => void
): () => void {
  const client = getSupabaseClient();
  if (!client) {
    return () => {};
  }

  // Initial fetch
  fetchWarehouseScansFromSupabase().then((items) => {
    if (items.length > 0) onUpdate(items);
  });

  // Realtime subscription via PostgreSQL change feeds
  const channelName = `realtime_warehouse_scans_${Date.now()}`;
  const channel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'warehouse_scans' },
      async () => {
        const fresh = await fetchWarehouseScansFromSupabase();
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
 * 2. DISTRIBUTION REPORTS (Supabase Primary Database)
 * ----------------------------------------------------
 */

export async function fetchDistributionReportsFromSupabase(): Promise<DistributionReportItem[]> {
  const client = getSupabaseClient();
  if (!client) return [];

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
  if (!client) return false;

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
  if (!client || items.length === 0) return false;

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
  if (!client) return false;

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
  if (!client || ids.length === 0) return false;

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
 * 3. BATCHES & MEDICINE BATCHES (Supabase Primary Database)
 * ----------------------------------------------------
 */

export async function fetchBatchesFromSupabase(
  tableName: 'batches' | 'medicine_batches' = 'batches',
  includeDeleted: boolean = false,
  fetchLimit: number = 300
): Promise<any[]> {
  const client = getSupabaseClient();
  if (!client) return [];

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
      return [];
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
  const client = getSupabaseClient();
  if (!client || !batch) return false;

  const id = (batch.id || batch.batchNumber || `batch-${Date.now()}`).trim();

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
  const client = getSupabaseClient();
  if (!client) return false;

  const safeId = idOrBatchNumber.trim();

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
  const client = getSupabaseClient();
  if (!client) return false;

  const safeId = idOrBatchNumber.trim();

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
  const client = getSupabaseClient();
  if (!client) return false;

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
  const client = getSupabaseClient();
  if (!client) {
    return () => {};
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
    client.removeChannel(channel);
  };
}

export function subscribeToDeletedBatchesFromSupabase(
  onUpdate: (batches: any[]) => void,
  tableName: 'batches' | 'medicine_batches' = 'batches'
): () => void {
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
  if (!client) return () => {};

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
 * 5. ACTIVITY LOGS (Supabase Primary Database)
 * ----------------------------------------------------
 */

export async function saveActivityLogToSupabase(log: any): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !log) return false;

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
  if (!client) return [];

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
  if (!client) return () => {};

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
