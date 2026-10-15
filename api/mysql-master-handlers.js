/**
 * 🚀 Hostinger Remote MySQL Master Database Handlers
 * ផ្តល់សេវាកម្ម CRUD ពេញលេញលើ MySQL ធ្វើជា Master Database
 * រួមទាំងយន្តការ Background Sync ទៅកាន់ Google Sheets & Local PostgreSQL
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {}

/**
 * Helper to trigger non-blocking background sync to Google Apps Script Web App
 */
export function triggerBackgroundSyncToGoogle(action, payload, customUrl) {
  const webAppUrl = customUrl || process.env.VITE_GOOGLE_WEBAPP_URL || '';
  if (!webAppUrl || !webAppUrl.trim()) return;

  // Run in background without awaiting
  (async () => {
    try {
      const url = webAppUrl.trim();
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action,
          ...payload,
          timestamp: new Date().toISOString()
        }),
        signal: AbortSignal.timeout(15000)
      }).catch(err => console.warn('[Background Google Sync] POST warning:', err.message));
    } catch (e) {
      console.warn('[Background Google Sync] error:', e.message);
    }
  })();
}

/**
 * 1. GET ALL MASTER DATA (One-shot blazing fast retrieval)
 */
/**
 * A. GET BATCHES
 */
export async function getBatchesFromMySQL(pool) {
  const [[batchesRows], [itemsRows]] = await Promise.all([
    pool.query('SELECT * FROM tbl_batches ORDER BY batch_date DESC, created_at DESC LIMIT 500'),
    pool.query('SELECT * FROM tbl_collection_items ORDER BY id ASC')
  ]);

  const itemsByBatch = {};
  for (const it of itemsRows) {
    if (!itemsByBatch[it.batch_id]) itemsByBatch[it.batch_id] = [];
    itemsByBatch[it.batch_id].push({
      id: String(it.id),
      tracking: it.tracking,
      name: it.customer_name || '',
      paymentMethod: it.payment || 'CASH',
      usd: Number(it.usd || 0),
      khm: Number(it.khm || 0),
      date: it.item_date || '',
      createdAt: it.created_at || ''
    });
  }

  return batchesRows.map(b => ({
    id: b.batch_id,
    batchNumber: b.batch_id,
    date: b.batch_date || '',
    operator: b.operator || '',
    totalItems: Number(b.total_items || 0),
    totalUSD: Number(b.total_usd || 0),
    totalKHR: Number(b.total_khr || 0),
    bankUSD: Number(b.bank_usd || 0),
    bankKHR: Number(b.bank_khr || 0),
    cashUSD: Number(b.cash_usd || 0),
    cashKHR: Number(b.cash_khr || 0),
    reconciliation: b.reconciliation || '',
    notes: b.notes || '',
    createdAt: b.created_at || '',
    items: itemsByBatch[b.batch_id] || []
  }));
}

/**
 * B. GET MEDICINE BATCHES
 */
export async function getMedicineBatchesFromMySQL(pool) {
  const [[medBatchesRows], [medItemsRows]] = await Promise.all([
    pool.query('SELECT * FROM tbl_medicine_batches ORDER BY batch_date DESC, created_at DESC LIMIT 500'),
    pool.query('SELECT * FROM tbl_medicine_items ORDER BY id ASC')
  ]);

  const medItemsByBatch = {};
  for (const it of medItemsRows) {
    if (!medItemsByBatch[it.batch_id]) medItemsByBatch[it.batch_id] = [];
    medItemsByBatch[it.batch_id].push({
      id: String(it.id),
      tracking: it.tracking,
      name: it.customer_name || '',
      paymentMethod: it.payment || 'CASH',
      usd: Number(it.usd || 0),
      khm: Number(it.khm || 0),
      date: it.item_date || '',
      createdAt: it.created_at || ''
    });
  }

  return medBatchesRows.map(b => ({
    id: b.batch_id,
    batchNumber: b.batch_id,
    date: b.batch_date || '',
    operator: b.operator || '',
    totalItems: Number(b.total_items || 0),
    totalUSD: Number(b.total_usd || 0),
    totalKHR: Number(b.total_khr || 0),
    bankUSD: Number(b.bank_usd || 0),
    bankKHR: Number(b.bank_khr || 0),
    cashUSD: Number(b.cash_usd || 0),
    cashKHR: Number(b.cash_khr || 0),
    reconciliation: b.reconciliation || '',
    notes: b.notes || '',
    createdAt: b.created_at || '',
    items: medItemsByBatch[b.batch_id] || []
  }));
}

/**
 * B.1. GET COD BATCHES (tbl_cod_collections Flat Table)
 */
export async function getCodBatchesFromMySQL(pool) {
  try {
    const [rows] = await pool.query('SELECT * FROM tbl_cod_collections ORDER BY id DESC LIMIT 5000');
    const batchesMap = new Map();

    for (const it of rows) {
      const bId = it.batch_id || 'COD-UNKNOWN';
      if (!batchesMap.has(bId)) {
        batchesMap.set(bId, {
          id: bId,
          batchNumber: bId,
          date: it.item_date || (it.created_at ? it.created_at.slice(0, 10) : ''),
          operator: it.operator || '',
          operatorEmail: it.operator_email || '',
          totalItems: 0,
          totalUSD: 0,
          totalKHR: 0,
          bankUSD: 0,
          bankKHR: 0,
          cashUSD: 0,
          cashKHR: 0,
          reconciliation: '✓ គ្រប់ចំនួន (Balanced 100%)',
          notes: it.notes || '',
          createdAt: it.created_at || '',
          items: []
        });
      }

      const b = batchesMap.get(bId);
      const usd = Number(it.usd || 0);
      const khm = Number(it.khm || 0);

      b.totalItems += 1;
      b.totalUSD += usd;
      b.totalKHR += khm;
      b.cashUSD += usd;
      b.cashKHR += khm;

      b.items.push({
        id: String(it.id),
        tracking: it.tracking,
        name: it.customer_name || '',
        paymentMethod: it.payment || 'COD',
        usd: usd,
        khm: khm,
        date: it.item_date || '',
        createdAt: it.created_at || ''
      });
    }

    return Array.from(batchesMap.values());
  } catch (err) {
    console.warn('[MySQL Master] Failed to fetch cod batches:', err.message);
    return [];
  }
}

/**
 * C. GET PAYERS (List Name)
 */
export async function getPayersFromMySQL(pool) {
  const [payersRows] = await pool.query('SELECT * FROM tbl_list_name ORDER BY name ASC');
  return payersRows.map(p => ({
    id: p.id,
    name: p.name,
    phone: p.phone || '',
    category: p.category || '',
    area: p.area || '',
    status: p.status || 'ACTIVE',
    notes: p.notes || '',
    createdAt: p.created_at || '',
    updatedAt: p.updated_at || ''
  }));
}

/**
 * D. GET PERMISSIONS
 */
export async function getPermissionsFromMySQL(pool) {
  const [permsRows] = await pool.query('SELECT * FROM tbl_permissions ORDER BY role ASC, name ASC');
  return permsRows.map(p => {
    let allowedPages = [];
    try {
      allowedPages = p.allowed_pages ? JSON.parse(p.allowed_pages) : [];
    } catch {
      allowedPages = p.allowed_pages ? p.allowed_pages.split(',') : [];
    }
    return {
      id: p.user_id,
      email: p.email,
      name: p.name || '',
      role: p.role || 'USER',
      status: p.status || 'ACTIVE',
      viewOnlyOwn: p.data_scope === 'OWN',
      canCreate: Boolean(p.can_create),
      canEdit: Boolean(p.can_edit),
      canDelete: Boolean(p.can_delete),
      allowedPages: Array.isArray(allowedPages) ? allowedPages : [],
      createdAt: p.created_at || '',
      updatedAt: p.updated_at || '',
      lastLogin: p.last_login || ''
    };
  });
}

/**
 * E. GET BANK SLIPS
 */
export async function getBankSlipsFromMySQL(pool) {
  const [slipsRows] = await pool.query('SELECT * FROM tbl_bank_slips ORDER BY id DESC LIMIT 500');
  return slipsRows.map(s => ({
    id: String(s.id),
    awbn: s.awbn || '',
    batchNumber: s.awbn || '',
    category: s.category || '',
    receiverName: s.receiver_name || '',
    operator: s.operator || '',
    operatorEmail: s.operator_email || '',
    driveImageLink: s.drive_image_link || '',
    driveFileId: s.drive_file_id || '',
    createdAt: s.created_at || ''
  }));
}

/**
 * F. GET WAREHOUSE SCANS
 */
export async function getWarehouseScansFromMySQL(pool) {
  const [[scanInRows], [scanOutRows], [oodRows], [holdRows]] = await Promise.all([
    pool.query('SELECT * FROM tbl_scan_in ORDER BY created_at DESC LIMIT 5000'),
    pool.query('SELECT * FROM tbl_scan_out ORDER BY created_at DESC LIMIT 5000'),
    pool.query('SELECT * FROM tbl_out_of_delivery ORDER BY created_at DESC LIMIT 5000'),
    pool.query('SELECT * FROM tbl_hold_remaining ORDER BY created_at DESC LIMIT 5000')
  ]);

  return [
    ...scanInRows.map(s => ({
      id: s.id,
      scanType: 'SCAN_IN',
      barcode: s.barcode,
      tracking: s.tracking || s.barcode,
      destination: s.destination || '',
      driverName: s.driver_name || '',
      truckNo: s.truck_no || '',
      operatorEmail: s.operator_email || '',
      createdBy: s.created_by || '',
      date: s.scan_date || '',
      createdAt: s.created_at || ''
    })),
    ...scanOutRows.map(s => ({
      id: s.id,
      scanType: 'SCAN_OUT',
      barcode: s.barcode,
      tracking: s.tracking || s.barcode,
      destination: s.destination || '',
      driverName: s.driver_name || '',
      truckNo: s.truck_no || '',
      operatorEmail: s.operator_email || '',
      createdBy: s.created_by || '',
      date: s.scan_date || '',
      createdAt: s.created_at || ''
    })),
    ...oodRows.map(s => ({
      id: s.id,
      scanType: 'OUT_OF_DELIVERY',
      barcode: s.barcode,
      tracking: s.tracking || s.barcode,
      riderName: s.rider_name || '',
      deliveryZone: s.delivery_zone || '',
      codAmount: Number(s.cod_amount || 0),
      currency: s.currency || 'USD',
      operatorEmail: s.operator_email || '',
      createdBy: s.created_by || '',
      date: s.scan_date || '',
      createdAt: s.created_at || '',
      remarks: s.remarks || ''
    })),
    ...holdRows.map(s => ({
      id: s.id,
      scanType: 'HOLD_REMAINING',
      barcode: s.barcode,
      tracking: s.tracking || s.barcode,
      destination: s.destination || '',
      holdReason: s.hold_reason || '',
      shelfLocation: s.shelf_location || '',
      remarks: s.remarks || '',
      operatorEmail: s.operator_email || '',
      createdBy: s.created_by || '',
      date: s.scan_date || '',
      createdAt: s.created_at || ''
    }))
  ];
}

/**
 * G. GET SETTINGS
 */
export async function getSettingsFromMySQL(pool) {
  const [settingsRows] = await pool.query('SELECT setting_key, setting_value FROM tbl_settings');
  const settings = {};
  for (const s of settingsRows) {
    try {
      settings[s.setting_key] = JSON.parse(s.setting_value);
    } catch {
      settings[s.setting_key] = s.setting_value;
    }
  }
  return settings;
}

/**
 * H. GET DISTRIBUTION REPORTS
 */
export async function getDistributionReportsFromMySQL(pool) {
  const [distRows] = await pool.query('SELECT * FROM tbl_distribution_reports ORDER BY created_at DESC, report_date DESC LIMIT 5000');
  return distRows.map(d => ({
    id: String(d.id),
    barcode: d.barcode || '',
    name: d.name || '',
    date: d.report_date || '',
    report_date: d.report_date || '',
    remarks: d.remarks || '',
    operatorEmail: d.operator_email || '',
    createdBy: d.created_by || 'User',
    createdAt: d.created_at || '',
    updatedAt: d.updated_at || ''
  }));
}

/**
 * 1. GET ALL MASTER DATA (One-shot blazing fast retrieval)
 */
export async function getAllMasterData(pool) {
  const startTime = Date.now();

  const [
    batches,
    medicineBatches,
    codBatches,
    payers,
    permissions,
    bankSlips,
    warehouseScans,
    settings,
    distributionReports
  ] = await Promise.all([
    getBatchesFromMySQL(pool),
    getMedicineBatchesFromMySQL(pool),
    getCodBatchesFromMySQL(pool),
    getPayersFromMySQL(pool),
    getPermissionsFromMySQL(pool),
    getBankSlipsFromMySQL(pool),
    getWarehouseScansFromMySQL(pool),
    getSettingsFromMySQL(pool),
    getDistributionReportsFromMySQL(pool)
  ]);

  const durationMs = Date.now() - startTime;
  return {
    ok: true,
    durationMs,
    data: {
      batches,
      medicineBatches,
      codBatches,
      payers,
      permissions,
      bankSlips,
      warehouseScans,
      settings,
      distributionReports
    }
  };
}

/**
 * 2. SAVE BATCH (Regular or Medicine)
 */
export async function saveBatchToMySQL(pool, batch, isMedicine = false, webAppUrl = '') {
  if (!batch) throw new Error('Missing batch data');
  const batchTable = isMedicine ? 'tbl_medicine_batches' : 'tbl_batches';
  const itemsTable = isMedicine ? 'tbl_medicine_items' : 'tbl_collection_items';

  const batchId = (batch.batchNumber || batch.id || '').trim();
  if (!batchId) throw new Error('Missing batch ID or batch number');

  const batchDate = batch.date || batch.batch_date || '';
  const operator = batch.operator || '';
  const totalItems = Number(batch.totalItems || batch.total_items || (batch.items ? batch.items.length : 0)) || 0;
  const totalUsd = Number(batch.totalUSD || batch.total_usd || 0);
  const totalKhr = Number(batch.totalKHR || batch.total_khr || 0);
  const bankUsd = Number(batch.bankUSD || batch.bank_usd || 0);
  const bankKhr = Number(batch.bankKHR || batch.bank_khr || 0);
  const cashUsd = Number(batch.cashUSD || batch.cash_usd || 0);
  const cashKhr = Number(batch.cashKHR || batch.cash_khr || 0);
  const reconciliation = batch.reconciliation || '';
  const notes = batch.notes || '';
  const createdAt = batch.createdAt || batch.created_at || new Date().toISOString();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Upsert Batch Header
    await conn.query(`
      INSERT INTO ${batchTable} (
        batch_id, batch_date, operator, total_items, total_usd, total_khr,
        bank_usd, bank_khr, cash_usd, cash_khr, reconciliation, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        batch_date = VALUES(batch_date),
        operator = VALUES(operator),
        total_items = VALUES(total_items),
        total_usd = VALUES(total_usd),
        total_khr = VALUES(total_khr),
        bank_usd = VALUES(bank_usd),
        bank_khr = VALUES(bank_khr),
        cash_usd = VALUES(cash_usd),
        cash_khr = VALUES(cash_khr),
        reconciliation = VALUES(reconciliation),
        notes = VALUES(notes)
    `, [batchId, batchDate, operator, totalItems, totalUsd, totalKhr, bankUsd, bankKhr, cashUsd, cashKhr, reconciliation, notes, createdAt]);

    // 2. Refresh Collection Items if provided
    if (Array.isArray(batch.items)) {
      await conn.query(`DELETE FROM ${itemsTable} WHERE batch_id = ?`, [batchId]);
      for (const it of batch.items) {
        const tracking = it.tracking || it.barcode || '';
        const cName = it.name || it.customerName || '';
        const pay = it.paymentMethod || it.payment || 'CASH';
        const usd = Number(it.usd || 0);
        const khm = Number(it.khm || it.khr || 0);
        const iDate = it.date || '';
        const iCreatedAt = it.createdAt || it.created_at || createdAt;

        await conn.query(`
          INSERT INTO ${itemsTable} (batch_id, tracking, customer_name, payment, usd, khm, item_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [batchId, tracking, cName, pay, usd, khm, iDate, iCreatedAt]);
      }
    }

    await conn.commit();

    // Background Sync to Google Sheets
    triggerBackgroundSyncToGoogle(
      isMedicine ? 'save_medicine_batch' : 'save_collection_batch',
      { batch, skipTelegram: true },
      webAppUrl
    );

    return { ok: true, batchId, message: '✓ បានរក្សាទុកក្នុង Master MySQL Database រួចរាល់!' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 3. DELETE BATCH
 */
export async function deleteBatchFromMySQL(pool, batchNumber, isMedicine = false, webAppUrl = '') {
  if (!batchNumber) throw new Error('Missing batchNumber');
  const batchTable = isMedicine ? 'tbl_medicine_batches' : 'tbl_batches';
  const itemsTable = isMedicine ? 'tbl_medicine_items' : 'tbl_collection_items';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM ${itemsTable} WHERE batch_id = ?`, [batchNumber]);
    await conn.query(`DELETE FROM ${batchTable} WHERE batch_id = ?`, [batchNumber]);
    await conn.commit();

    // Background Sync to Google Sheets
    triggerBackgroundSyncToGoogle(
      isMedicine ? 'delete_medicine_batch' : 'delete_batch',
      { batchNumber, id: batchNumber },
      webAppUrl
    );

    return { ok: true, message: `✓ បានលុបកញ្ចប់ ${batchNumber} ពី Master MySQL រួចរាល់!` };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 3.1. SAVE COD BATCH (tbl_cod_collections Flat Table)
 */
export async function saveCodBatchToMySQL(pool, batch, webAppUrl = '') {
  if (!batch) throw new Error('Missing batch data');
  const batchId = (batch.batchNumber || batch.id || '').trim();
  if (!batchId) throw new Error('Missing batch ID or batch number');

  const batchDate = batch.date || batch.batch_date || '';
  const operator = batch.operator || '';
  const operatorEmail = batch.operatorEmail || '';
  const notes = batch.notes || '';
  const createdAt = batch.createdAt || batch.created_at || new Date().toISOString();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Remove existing records for this batch_id
    await conn.query('DELETE FROM tbl_cod_collections WHERE batch_id = ?', [batchId]);

    // 2. Insert items
    if (Array.isArray(batch.items) && batch.items.length > 0) {
      for (const it of batch.items) {
        const tracking = (it.tracking || it.barcode || '').trim();
        const cName = (it.name || it.customerName || '').trim();
        const pay = 'COD';
        const usd = Number(it.usd || 0);
        const khm = Number(it.khm || it.khr || 0);
        const iDate = it.date || batchDate || '';
        const iCreatedAt = it.createdAt || it.created_at || createdAt;
        const iNotes = it.notes || notes || '';

        await conn.query(`
          INSERT INTO tbl_cod_collections (
            batch_id, tracking, customer_name, payment, usd, khm, item_date, operator, operator_email, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [batchId, tracking, cName, pay, usd, khm, iDate, operator, operatorEmail, iNotes, iCreatedAt]);
      }
    }

    await conn.commit();

    // 3. Background Sync to Google Sheets
    triggerBackgroundSyncToGoogle(
      'save_cod_batch',
      { batch, skipTelegram: true },
      webAppUrl
    );

    return { ok: true, batchId, message: '✓ បានរក្សាទុកក្នុង Master MySQL Database (tbl_cod_collections) រួចរាល់!' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 3.2. DELETE COD BATCH (tbl_cod_collections)
 */
export async function deleteCodBatchFromMySQL(pool, batchNumber, webAppUrl = '') {
  if (!batchNumber) throw new Error('Missing batchNumber');
  const target = String(batchNumber).trim();
  const conn = await pool.getConnection();
  try {
    const [delRes] = await conn.query('DELETE FROM tbl_cod_collections WHERE batch_id = ?', [target]);
    console.log(`[MySQL Master] Deleted COD batch ${target}: ${delRes?.affectedRows || 0} rows removed`);
    triggerBackgroundSyncToGoogle(
      'delete_cod_batch',
      { batchNumber: target, id: target },
      webAppUrl
    );
    return { ok: true, message: `✓ បានលុបកញ្ចប់ COD ${target} ពី Master MySQL រួចរាល់!`, affectedRows: delRes?.affectedRows || 0 };
  } finally {
    conn.release();
  }
}

/**
 * 3.3. DELETE ALL COD BATCHES (tbl_cod_collections)
 */
export async function deleteAllCodBatchesFromMySQL(pool, webAppUrl = '') {
  const conn = await pool.getConnection();
  try {
    const [delRes] = await conn.query('DELETE FROM tbl_cod_collections');
    console.log(`[MySQL Master] Deleted ALL COD batches: ${delRes?.affectedRows || 0} rows removed`);
    triggerBackgroundSyncToGoogle(
      'delete_all_cod_batches',
      {},
      webAppUrl
    );
    return { ok: true, message: '✓ បានសម្អាតកញ្ចប់ COD ទាំងអស់ពី Master MySQL រួចរាល់!', affectedRows: delRes?.affectedRows || 0 };
  } finally {
    conn.release();
  }
}

/**
 * 3.4. DELETE ALL BATCHES (Regular or Medicine)
 */
export async function deleteAllBatchesFromMySQL(pool, isMedicine = false, webAppUrl = '') {
  const batchTable = isMedicine ? 'tbl_medicine_batches' : 'tbl_batches';
  const itemsTable = isMedicine ? 'tbl_medicine_items' : 'tbl_collection_items';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM ${itemsTable}`);
    const [delRes] = await conn.query(`DELETE FROM ${batchTable}`);
    await conn.commit();
    console.log(`[MySQL Master] Deleted ALL ${isMedicine ? 'medicine' : 'regular'} batches: ${delRes?.affectedRows || 0} batches removed`);
    triggerBackgroundSyncToGoogle(
      isMedicine ? 'delete_all_medicine_batches' : 'delete_all_batches',
      {},
      webAppUrl
    );
    return { ok: true, message: `✓ បានសម្អាតកញ្ចប់ទាំងអស់ពី ${batchTable} រួចរាល់!`, affectedRows: delRes?.affectedRows || 0 };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 4. SAVE PAYER (List Name)
 */
export async function savePayerToMySQL(pool, payer, webAppUrl = '') {
  if (!payer || !payer.id || !payer.name) throw new Error('Invalid payer data');
  const now = new Date().toISOString();

  await pool.query(`
    INSERT INTO tbl_list_name (id, name, phone, category, area, status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name), phone = VALUES(phone), category = VALUES(category),
      area = VALUES(area), status = VALUES(status), notes = VALUES(notes), updated_at = VALUES(updated_at)
  `, [
    payer.id,
    payer.name,
    payer.phone || '',
    payer.category || '',
    payer.area || '',
    payer.status || 'ACTIVE',
    payer.notes || '',
    payer.createdAt || now,
    now
  ]);

  triggerBackgroundSyncToGoogle('save_payer', { payer }, webAppUrl);
  return { ok: true, id: payer.id, message: '✓ បានរក្សាទុក Payer ក្នុង Master MySQL!' };
}

/**
 * 5. DELETE PAYER
 */
export async function deletePayerFromMySQL(pool, id, webAppUrl = '') {
  if (!id) throw new Error('Missing payer ID');
  await pool.query('DELETE FROM tbl_list_name WHERE id = ?', [id]);
  triggerBackgroundSyncToGoogle('delete_payer', { id }, webAppUrl);
  return { ok: true, message: '✓ បានលុប Payer ពី Master MySQL!' };
}

/**
 * 6. SAVE WAREHOUSE SCAN (Batch or Single)
 */
export async function saveWarehouseScanToMySQL(pool, scanOrItems, webAppUrl = '') {
  const items = Array.isArray(scanOrItems) ? scanOrItems : [scanOrItems];
  if (items.length === 0) return { ok: true, count: 0 };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const d of items) {
      const id = d.id || `wh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const barcode = d.barcode || '';
      const tracking = d.tracking || barcode;
      const opEmail = d.operatorEmail || '';
      const createdBy = d.createdBy || 'User';
      const scanDate = d.date || new Date().toISOString().slice(0, 10);
      const createdAt = d.createdAt || new Date().toISOString();
      const scanType = (d.scanType || '').toUpperCase();

      if (scanType === 'SCAN_IN') {
        await conn.query(`
          INSERT INTO tbl_scan_in (id, barcode, tracking, destination, driver_name, truck_no, operator_email, created_by, scan_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            destination = VALUES(destination), driver_name = VALUES(driver_name), truck_no = VALUES(truck_no)
        `, [id, barcode, tracking, d.destination || '', d.driverName || '', d.truckNo || '', opEmail, createdBy, scanDate, createdAt]);
      } else if (scanType === 'SCAN_OUT') {
        await conn.query(`
          INSERT INTO tbl_scan_out (id, barcode, tracking, destination, driver_name, truck_no, operator_email, created_by, scan_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            destination = VALUES(destination), driver_name = VALUES(driver_name), truck_no = VALUES(truck_no)
        `, [id, barcode, tracking, d.destination || '', d.driverName || '', d.truckNo || '', opEmail, createdBy, scanDate, createdAt]);
      } else if (scanType === 'OUT_OF_DELIVERY') {
        await conn.query(`
          INSERT INTO tbl_out_of_delivery (id, barcode, tracking, rider_name, delivery_zone, cod_amount, currency, operator_email, created_by, scan_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            rider_name = VALUES(rider_name), delivery_zone = VALUES(delivery_zone), cod_amount = VALUES(cod_amount)
        `, [id, barcode, tracking, d.riderName || '', d.deliveryZone || '', Number(d.codAmount || 0), d.currency || 'USD', opEmail, createdBy, scanDate, createdAt]);
      } else if (scanType === 'HOLD_REMAINING') {
        await conn.query(`
          INSERT INTO tbl_hold_remaining (id, barcode, tracking, destination, hold_reason, shelf_location, remarks, operator_email, created_by, scan_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            hold_reason = VALUES(hold_reason), shelf_location = VALUES(shelf_location), remarks = VALUES(remarks)
        `, [id, barcode, tracking, d.destination || '', d.holdReason || '', d.shelfLocation || '', d.remarks || '', opEmail, createdBy, scanDate, createdAt]);
      }
    }

    await conn.commit();

    // Background Sync to Google Sheets
    triggerBackgroundSyncToGoogle('save_warehouse_scans', { items }, webAppUrl);

    return { ok: true, count: items.length, message: `✓ បានរក្សាទុក ${items.length} Scans ក្នុង Master MySQL!` };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 7. DELETE WAREHOUSE SCAN
 */
export async function deleteWarehouseScanFromMySQL(pool, id, scanType, barcode, webAppUrl = '') {
  if (!id && !barcode) throw new Error('Missing scan ID or barcode');

  const tables = scanType
    ? [scanType === 'SCAN_IN' ? 'tbl_scan_in' : scanType === 'SCAN_OUT' ? 'tbl_scan_out' : scanType === 'OUT_OF_DELIVERY' ? 'tbl_out_of_delivery' : 'tbl_hold_remaining']
    : ['tbl_scan_in', 'tbl_scan_out', 'tbl_out_of_delivery', 'tbl_hold_remaining'];

  await Promise.all(tables.map(async (t) => {
    if (id && barcode) {
      await pool.query(`DELETE FROM ${t} WHERE id = ? OR barcode = ?`, [id, barcode]);
    } else if (id) {
      await pool.query(`DELETE FROM ${t} WHERE id = ?`, [id]);
    } else if (barcode) {
      await pool.query(`DELETE FROM ${t} WHERE barcode = ?`, [barcode]);
    }
  }));

  triggerBackgroundSyncToGoogle('delete_warehouse_scan', { id, barcode, scanType }, webAppUrl);
  return { ok: true, message: '✓ បានលុប Scan Item ពី Master MySQL!' };
}

/**
 * 7b. DELETE WAREHOUSE SCANS BATCH
 */
export async function deleteWarehouseScansBatchFromMySQL(pool, items, webAppUrl = '') {
  if (!items || !Array.isArray(items) || items.length === 0) return { ok: true, count: 0 };

  const ids = items.map(it => it.id).filter(Boolean);
  const barcodes = items.map(it => it.barcode).filter(Boolean);
  const tables = ['tbl_scan_in', 'tbl_scan_out', 'tbl_out_of_delivery', 'tbl_hold_remaining'];
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    if (ids.length > 0) {
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const placeholders = chunk.map(() => '?').join(',');
        for (const t of tables) {
          await conn.query(`DELETE FROM ${t} WHERE id IN (${placeholders})`, chunk);
        }
      }
    }

    if (barcodes.length > 0) {
      for (let i = 0; i < barcodes.length; i += 500) {
        const chunk = barcodes.slice(i, i + 500);
        const placeholders = chunk.map(() => '?').join(',');
        for (const t of tables) {
          await conn.query(`DELETE FROM ${t} WHERE barcode IN (${placeholders})`, chunk);
        }
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  triggerBackgroundSyncToGoogle('delete_warehouse_scans_batch', { items }, webAppUrl);
  return { ok: true, count: items.length, message: `✓ បានលុប ${items.length} Scans ពី Master MySQL!` };
}

/**
 * 7c. CLEAR ALL WAREHOUSE SCANS
 */
export async function clearAllWarehouseScansFromMySQL(pool, scanType, webAppUrl = '') {
  const tables = scanType
    ? [scanType === 'SCAN_IN' ? 'tbl_scan_in' : scanType === 'SCAN_OUT' ? 'tbl_scan_out' : scanType === 'OUT_OF_DELIVERY' ? 'tbl_out_of_delivery' : 'tbl_hold_remaining']
    : ['tbl_scan_in', 'tbl_scan_out', 'tbl_out_of_delivery', 'tbl_hold_remaining'];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const t of tables) {
      await conn.query(`DELETE FROM ${t}`);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  triggerBackgroundSyncToGoogle('clear_warehouse_scans', { scanType }, webAppUrl);
  return { ok: true, message: '✓ បានសម្អាត Scans ទាំងអស់ពី Master MySQL!' };
}

/**
 * 8. SAVE BANK SLIP
 */
export async function saveBankSlipToMySQL(pool, slip, webAppUrl = '') {
  if (!slip) throw new Error('Missing slip data');
  const id = slip.id || `slip-${Date.now()}`;
  const now = new Date().toISOString();

  await pool.query(`
    INSERT INTO tbl_bank_slips (id, awbn, category, receiver_name, operator, operator_email, drive_image_link, drive_file_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      awbn = VALUES(awbn), category = VALUES(category), receiver_name = VALUES(receiver_name),
      drive_image_link = VALUES(drive_image_link), drive_file_id = VALUES(drive_file_id)
  `, [
    id,
    slip.awbn || slip.batchNumber || '',
    slip.category || '',
    slip.receiverName || '',
    slip.operator || '',
    slip.operatorEmail || '',
    slip.driveImageLink || '',
    slip.driveFileId || '',
    slip.createdAt || now
  ]);

  triggerBackgroundSyncToGoogle('save_bank_slip', { slip }, webAppUrl);
  return { ok: true, id, message: '✓ បានរក្សាទុក Bank Slip ក្នុង Master MySQL!' };
}

/**
 * 9. DELETE BANK SLIP
 */
export async function deleteBankSlipFromMySQL(pool, id, webAppUrl = '') {
  if (!id) throw new Error('Missing slip ID');
  await pool.query('DELETE FROM tbl_bank_slips WHERE id = ?', [id]);
  triggerBackgroundSyncToGoogle('delete_bank_slip', { id }, webAppUrl);
  return { ok: true, message: '✓ បានលុប Bank Slip ពី Master MySQL!' };
}

/**
 * 10. SAVE USER PERMISSION
 */
export async function savePermissionToMySQL(pool, perm, webAppUrl = '') {
  if (!perm || !perm.email) throw new Error('Missing permission data');
  const userId = perm.id || perm.email;
  const now = new Date().toISOString();
  const allowedPages = Array.isArray(perm.allowedPages) ? JSON.stringify(perm.allowedPages) : (perm.allowedPages || '[]');

  await pool.query(`
    INSERT INTO tbl_permissions (
      user_id, email, name, role, status, data_scope,
      can_create, can_edit, can_delete, allowed_pages, created_at, last_login, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name), role = VALUES(role), status = VALUES(status),
      data_scope = VALUES(data_scope), can_create = VALUES(can_create),
      can_edit = VALUES(can_edit), can_delete = VALUES(can_delete),
      allowed_pages = VALUES(allowed_pages), updated_at = VALUES(updated_at)
  `, [
    userId,
    perm.email.toLowerCase().trim(),
    perm.name || '',
    perm.role || 'USER',
    perm.status || 'ACTIVE',
    perm.viewOnlyOwn ? 'OWN' : 'ALL',
    perm.canCreate ? 1 : 0,
    perm.canEdit ? 1 : 0,
    perm.canDelete ? 1 : 0,
    allowedPages,
    perm.createdAt || now,
    perm.lastLogin || '',
    now
  ]);

  triggerBackgroundSyncToGoogle('save_permission', { permission: perm }, webAppUrl);
  return { ok: true, email: perm.email, message: '✓ បានរក្សាទុក Permission ក្នុង Master MySQL!' };
}

/**
 * 10.1 DELETE USER PERMISSION
 */
export async function deletePermissionFromMySQL(pool, email, webAppUrl = '') {
  if (!email) throw new Error('Missing email for permission deletion');
  const cleanEmail = email.toLowerCase().trim();

  await pool.query('DELETE FROM tbl_permissions WHERE LOWER(TRIM(email)) = ? OR user_id = ?', [cleanEmail, cleanEmail]);

  triggerBackgroundSyncToGoogle('delete_permission', { email: cleanEmail }, webAppUrl);
  return { ok: true, email: cleanEmail, message: '✓ បានលុប Permission ពី Master MySQL!' };
}

/**
 * 11. SAVE APP SETTINGS
 */
export async function saveSettingsToMySQL(pool, settings, webAppUrl = '') {
  if (!settings || typeof settings !== 'object') throw new Error('Invalid settings');
  const now = new Date().toISOString();

  const entries = Object.entries(settings);
  for (const [key, val] of entries) {
    const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
    await pool.query(`
      INSERT INTO tbl_settings (setting_key, setting_value, updated_at)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)
    `, [key, valStr, now]);
  }

  triggerBackgroundSyncToGoogle('save_settings', { settings }, webAppUrl);
  return { ok: true, message: '✓ បានរក្សាទុក Settings ក្នុង Master MySQL!' };
}

/**
 * 12. LOG ACTIVITY
 */
export async function logActivityToMySQL(pool, log) {
  if (!log) return;
  const now = new Date().toISOString();
  await pool.query(`
    INSERT INTO tbl_user_logs (
      log_id, timestamp, operator, email, role, action, details,
      batch_number, amount_usd, amount_khr, items_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    log.id || `log-${Date.now()}`,
    log.timestamp || now,
    log.operator || '',
    log.email || log.operatorEmail || '',
    log.role || '',
    log.action || '',
    log.description || log.details || '',
    log.batchNumber || '',
    Number(log.amountUSD || 0),
    Number(log.amountKHR || 0),
    Number(log.itemsCount || 0),
    now
  ]).catch(err => console.warn('Activity log error:', err.message));
}

/**
 * 13. SAVE DISTRIBUTION REPORT (Single or Batch Real-Time CRUD)
 */
export async function saveDistributionReportToMySQL(pool, reportOrReports, webAppUrl = '') {
  if (!reportOrReports) throw new Error('No distribution report provided');
  const items = Array.isArray(reportOrReports) ? reportOrReports : [reportOrReports];
  if (items.length === 0) return { ok: true, count: 0 };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const now = new Date().toISOString();

    for (const d of items) {
      const id = String(d.id || `dist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
      const barcode = (d.barcode || '').trim();
      const name = (d.name || '').trim();
      const reportDate = (d.report_date || d.date || now.slice(0, 10)).trim();
      const remarks = (d.remarks || '').trim();
      const operatorEmail = (d.operatorEmail || d.operator_email || '').trim();
      const createdBy = (d.createdBy || d.created_by || 'User').trim();
      const createdAt = d.createdAt || d.created_at || now;
      const updatedAt = d.updatedAt || d.updated_at || now;

      await conn.query(`
        INSERT INTO tbl_distribution_reports (
          id, barcode, name, report_date, remarks, operator_email, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          barcode = VALUES(barcode),
          name = VALUES(name),
          report_date = VALUES(report_date),
          remarks = VALUES(remarks),
          operator_email = VALUES(operator_email),
          created_by = VALUES(created_by),
          updated_at = VALUES(updated_at)
      `, [id, barcode, name, reportDate, remarks, operatorEmail, createdBy, createdAt, updatedAt]);
    }

    await conn.commit();

    // Trigger non-blocking background sync to Google Sheets
    triggerBackgroundSyncToGoogle('save_distribution_report', { reports: items }, webAppUrl);

    return {
      ok: true,
      count: items.length,
      message: `✓ បានរក្សាទុក ${items.length} របាយការណ៍ចែកចាយក្នុង Master MySQL ជោគជ័យ!`
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 14. DELETE DISTRIBUTION REPORT (Single or Batch Real-Time CRUD)
 */
export async function deleteDistributionReportFromMySQL(pool, idOrIds, barcode = '', webAppUrl = '') {
  if (!idOrIds) throw new Error('No ID provided for deletion');
  const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
  if (ids.length === 0) return { ok: true, count: 0 };

  const placeholders = ids.map(() => '?').join(',');
  await pool.query(`DELETE FROM tbl_distribution_reports WHERE id IN (${placeholders})`, ids);

  // Background Sync to Google Sheets
  triggerBackgroundSyncToGoogle('delete_distribution_report', { ids, barcode }, webAppUrl);

  return {
    ok: true,
    deletedCount: ids.length,
    message: `✓ បានលុប ${ids.length} របាយការណ៍ចែកចាយពី Master MySQL ជោគជ័យ!`
  };
}
