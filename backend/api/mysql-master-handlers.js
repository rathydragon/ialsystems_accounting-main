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
 * Full mirror of tbl_distribution_reports → Google Sheets tab «Distribution_Reports».
 *
 * The Apps Script action clears the tab and rewrites it with whatever list it receives, so the
 * list must be complete. It used to come from each browser, which broke the sheet: users with
 * "view only own" hold only their own rows, and several browsers overwrote each other with stale
 * snapshots. The server now always reads every row from MySQL (the source of truth).
 *
 * One sync at a time per server instance; a request that arrives mid-sync schedules exactly one
 * follow-up run, so the last write always reflects the latest data.
 */
let distSheetSync = null; // { running: Promise, again: boolean, webAppUrl }
export async function syncDistributionReportsToSheet(pool, customUrl) {
  const webAppUrl = (customUrl || process.env.VITE_GOOGLE_WEBAPP_URL || '').trim();
  if (!webAppUrl) return { success: false, count: 0, error: 'មិនទាន់ភ្ជាប់ Google Sheets Web App URL ទេ' };

  if (distSheetSync) {
    distSheetSync.again = true;
    distSheetSync.webAppUrl = webAppUrl;
    return distSheetSync.running;
  }

  const run = async (url) => {
    const reports = await getDistributionReportsFromMySQL(pool, null); // all rows, never user-scoped
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      // source: 'server' — Code.gs only accepts this full rewrite from the backend
      body: JSON.stringify({ action: 'sync_distribution_reports', source: 'server', reports }),
      signal: AbortSignal.timeout(90000),
    });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = { status: 'error', message: text.slice(0, 200) }; }
    if (data?.status === 'success') return { success: true, count: reports.length };
    const msg = data?.message || 'Google Sheets sync failed';
    return {
      success: false,
      count: 0,
      error: msg,
      needsNewDeploy: msg.includes('Unknown action') || msg.includes('sync_distribution_reports'),
    };
  };

  const state = { again: false, webAppUrl, running: null };
  distSheetSync = state;
  state.running = (async () => {
    try {
      let result = await run(state.webAppUrl);
      while (state.again) {
        state.again = false;
        result = await run(state.webAppUrl);
      }
      return result;
    } catch (err) {
      return { success: false, count: 0, error: err?.name === 'TimeoutError' ? 'Google Sheets timeout (90s)' : (err?.message || String(err)) };
    } finally {
      distSheetSync = null;
    }
  })();
  return state.running;
}

/**
 * 🪦 Deletion tombstones (tbl_deleted_records)
 * Every hard delete records the ID here so that stale clients (old localStorage caches, old
 * browser bundles, delayed background upserts) cannot silently re-insert a deleted row.
 * IDs are generated client-side and never reused, so a tombstoned ID is never a legitimate new record.
 */
let deletedRecordsTableReady = null;
export function ensureDeletedRecordsTable(pool) {
  if (!deletedRecordsTableReady) {
    deletedRecordsTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS \`tbl_deleted_records\` (
        \`table_name\` VARCHAR(64) NOT NULL,
        \`record_id\` VARCHAR(191) NOT NULL,
        \`deleted_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`table_name\`, \`record_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((err) => {
      deletedRecordsTableReady = null; // retry on next request
      throw err;
    });
  }
  return deletedRecordsTableReady;
}

export async function recordDeletedIds(pool, tableName, ids, db = pool) {
  const list = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (list.length === 0) return;
  await ensureDeletedRecordsTable(pool);
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    await db.query(
      `INSERT IGNORE INTO tbl_deleted_records (table_name, record_id) VALUES ${chunk.map(() => '(?, ?)').join(',')}`,
      chunk.flatMap((id) => [tableName, id])
    );
  }
}

export async function getDeletedIdSet(pool, tableName, ids, db = pool) {
  const list = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const deleted = new Set();
  if (list.length === 0) return deleted;
  await ensureDeletedRecordsTable(pool);
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    const [rows] = await db.query(
      `SELECT record_id FROM tbl_deleted_records WHERE table_name = ? AND record_id IN (${chunk.map(() => '?').join(',')})`,
      [tableName, ...chunk]
    );
    for (const r of rows || []) deleted.add(String(r.record_id));
  }
  return deleted;
}

/**
 * 1. GET ALL MASTER DATA (One-shot blazing fast retrieval)
 */
/**
 * A. GET BATCHES (Optimized with Bounded Child Query)
 */
export async function getBatchesFromMySQL(pool, limit = 300, userScope = null) {
  const isRestricted = Boolean(userScope && userScope.role !== 'ADMIN' && userScope.viewOnlyOwn);
  let sql = 'SELECT * FROM tbl_batches';
  const params = [];

  if (isRestricted) {
    const identifiers = [userScope.name, userScope.email].filter(Boolean);
    if (identifiers.length > 0) {
      sql += ' WHERE operator IN (?)';
      params.push(identifiers);
    } else {
      sql += ' WHERE 1=0';
    }
  }

  sql += ' ORDER BY batch_date DESC, created_at DESC LIMIT ?';
  params.push(limit);

  const [batchesRows] = await pool.query(sql, params);

  if (!batchesRows || batchesRows.length === 0) return [];

  // Query ONLY items belonging to the selected batches (uses idx_items_batch index)
  const batchIds = batchesRows.map(b => b.batch_id).filter(Boolean);
  let itemsRows = [];
  if (batchIds.length > 0) {
    const [rows] = await pool.query(
      'SELECT * FROM tbl_collection_items WHERE batch_id IN (?) ORDER BY id ASC',
      [batchIds]
    );
    itemsRows = rows;
  }

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
 * B. GET MEDICINE BATCHES (Optimized with Bounded Child Query)
 */
export async function getMedicineBatchesFromMySQL(pool, limit = 300, userScope = null) {
  const isRestricted = Boolean(userScope && userScope.role !== 'ADMIN' && userScope.viewOnlyOwn);
  let sql = 'SELECT * FROM tbl_medicine_batches';
  const params = [];

  if (isRestricted) {
    const identifiers = [userScope.name, userScope.email].filter(Boolean);
    if (identifiers.length > 0) {
      sql += ' WHERE operator IN (?)';
      params.push(identifiers);
    } else {
      sql += ' WHERE 1=0';
    }
  }

  sql += ' ORDER BY batch_date DESC, created_at DESC LIMIT ?';
  params.push(limit);

  const [medBatchesRows] = await pool.query(sql, params);

  if (!medBatchesRows || medBatchesRows.length === 0) return [];

  // Query ONLY items belonging to the selected medicine batches (uses idx_med_items_batch index)
  const medBatchIds = medBatchesRows.map(b => b.batch_id).filter(Boolean);
  let medItemsRows = [];
  if (medBatchIds.length > 0) {
    const [rows] = await pool.query(
      'SELECT * FROM tbl_medicine_items WHERE batch_id IN (?) ORDER BY id ASC',
      [medBatchIds]
    );
    medItemsRows = rows;
  }

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
export async function getCodBatchesFromMySQL(pool, userScope = null) {
  try {
    const isRestricted = Boolean(userScope && userScope.role !== 'ADMIN' && userScope.viewOnlyOwn);
    let sql = 'SELECT * FROM tbl_cod_collections';
    const params = [];

    if (isRestricted) {
      const identifiers = [userScope.email, userScope.name].filter(Boolean);
      if (identifiers.length > 0) {
        sql += ' WHERE (operator_email IN (?) OR operator IN (?))';
        params.push(identifiers, identifiers);
      } else {
        sql += ' WHERE 1=0';
      }
    }

    sql += ' ORDER BY id DESC LIMIT 5000';
    const [rows] = await pool.query(sql, params);
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
 * Lazily add allowed_locations (ទីតាំង/ខេត្តដែល User មើលបាន) to tbl_permissions (once per process).
 */
let permissionColumnsReady = null;
export function ensurePermissionColumns(pool) {
  if (!permissionColumnsReady) {
    permissionColumnsReady = (async () => {
      const [rows] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_permissions' AND COLUMN_NAME = 'allowed_locations'`
      );
      if (rows.length === 0) {
        await pool.query('ALTER TABLE tbl_permissions ADD COLUMN `allowed_locations` TEXT DEFAULT NULL');
      }
    })().catch((err) => {
      permissionColumnsReady = null; // retry on next request
      throw err;
    });
  }
  return permissionColumnsReady;
}

function parseJsonList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value).split(',').map((v) => v.trim()).filter(Boolean);
  }
}

/**
 * Loose Destination ↔ location match (same rule as frontend isLocationMatch):
 * 'ខេត្តសៀមរាប (Siem Reap)', 'Siem Reap' and 'ខេត្តសៀមរាប' all count as the same place.
 */
function isLocationMatch(destination, location) {
  const norm = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const d = norm(destination);
  const l = norm(location);
  if (!d || !l) return false;
  if (d === l) return true;
  const parts = (v) => {
    const m = v.match(/^(.*?)\s*\((.*)\)\s*$/);
    return (m ? [m[1], m[2]] : [v]).map((x) => x.trim()).filter((x) => x.length >= 3);
  };
  const dParts = parts(d);
  return parts(l).some((lp) => dParts.some((dp) => dp === lp || dp.includes(lp) || lp.includes(dp)));
}

/**
 * D. GET PERMISSIONS
 */
export async function getPermissionsFromMySQL(pool, userScope = null) {
  await ensurePermissionColumns(pool);
  const isNonAdmin = Boolean(userScope && (userScope.role || '').toUpperCase() !== 'ADMIN');
  let sql = 'SELECT * FROM tbl_permissions';
  const params = [];

  if (isNonAdmin) {
    const identifiers = [userScope.email, userScope.userId || userScope.id].filter(Boolean);
    if (identifiers.length > 0) {
      sql += ' WHERE email IN (?) OR user_id IN (?)';
      params.push(identifiers, identifiers);
    } else {
      sql += ' WHERE 1=0';
    }
  }

  sql += ' ORDER BY role ASC, name ASC';
  const [permsRows] = await pool.query(sql, params);
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
      allowedLocations: parseJsonList(p.allowed_locations),
      createdAt: p.created_at || '',
      updatedAt: p.updated_at || '',
      lastLogin: p.last_login || ''
    };
  });
}

/**
 * E. GET BANK SLIPS
 */
export async function getBankSlipsFromMySQL(pool, userScope = null) {
  const isRestricted = Boolean(userScope && userScope.role !== 'ADMIN' && userScope.viewOnlyOwn);
  let sql = 'SELECT * FROM tbl_bank_slips';
  const params = [];

  if (isRestricted) {
    const identifiers = [userScope.email, userScope.name].filter(Boolean);
    if (identifiers.length > 0) {
      sql += ' WHERE (operator_email IN (?) OR operator IN (?))';
      params.push(identifiers, identifiers);
    } else {
      sql += ' WHERE 1=0';
    }
  }

  sql += ' ORDER BY id DESC LIMIT 500';
  const [slipsRows] = await pool.query(sql, params);
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

const WAREHOUSE_TABLE_BY_TYPE = {
  SCAN_IN: 'tbl_scan_in',
  SCAN_OUT: 'tbl_scan_out',
  OUT_OF_DELIVERY: 'tbl_out_of_delivery',
  HOLD_REMAINING: 'tbl_hold_remaining',
  ARRIVED_HUB: 'tbl_arrived_hub',
  RETURN_SHIPMENTS: 'tbl_return_shipments',
  CUSTOMER_PICKUP: 'tbl_customer_pickup'
};
const WAREHOUSE_TABLES = Object.values(WAREHOUSE_TABLE_BY_TYPE);

/**
 * Lazily create tbl_arrived_hub and add operation_code / batch_id to the scan tables (once per process).
 * Checks information_schema first so it works on both MariaDB and MySQL.
 */
let warehouseColumnsReady = null;
export function ensureWarehouseScanColumns(pool) {
  if (!warehouseColumnsReady) {
    warehouseColumnsReady = (async () => {
      // Arrived Hub: receiving at another hub, verified against a ScanOut operation (source_operation_code)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS \`tbl_arrived_hub\` (
          \`id\` VARCHAR(100) NOT NULL,
          \`barcode\` VARCHAR(100) NOT NULL,
          \`tracking\` VARCHAR(100) DEFAULT NULL,
          \`origin\` VARCHAR(255) DEFAULT NULL,
          \`destination\` VARCHAR(255) DEFAULT NULL,
          \`driver_name\` VARCHAR(150) DEFAULT NULL,
          \`truck_no\` VARCHAR(100) DEFAULT NULL,
          \`source_operation_code\` VARCHAR(100) DEFAULT NULL,
          \`arrival_status\` VARCHAR(30) DEFAULT NULL,
          \`remarks\` TEXT DEFAULT NULL,
          \`operator_email\` VARCHAR(150) DEFAULT NULL,
          \`created_by\` VARCHAR(150) DEFAULT NULL,
          \`scan_date\` VARCHAR(50) DEFAULT NULL,
          \`created_at\` VARCHAR(50) DEFAULT NULL,
          \`operation_code\` VARCHAR(100) DEFAULT NULL,
          \`batch_id\` VARCHAR(100) DEFAULT NULL,
          \`synced_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_arrived_hub_barcode\` (\`barcode\`),
          INDEX \`idx_arrived_hub_date\` (\`scan_date\`),
          INDEX \`idx_arrived_hub_source_op\` (\`source_operation_code\`),
          INDEX \`idx_tbl_arrived_hub_opcode\` (\`operation_code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      // Return Shipments: parcels scanned to be sent back to the shipper (same shape as Hold)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS \`tbl_return_shipments\` (
          \`id\` VARCHAR(100) NOT NULL,
          \`barcode\` VARCHAR(100) NOT NULL,
          \`tracking\` VARCHAR(100) DEFAULT NULL,
          \`destination\` VARCHAR(255) DEFAULT NULL,
          \`return_reason\` VARCHAR(255) DEFAULT NULL,
          \`send_to_customer\` VARCHAR(255) DEFAULT NULL,
          \`return_status\` VARCHAR(30) DEFAULT NULL,
          \`approved_by\` VARCHAR(150) DEFAULT NULL,
          \`approved_at\` VARCHAR(50) DEFAULT NULL,
          \`remarks\` TEXT DEFAULT NULL,
          \`operator_email\` VARCHAR(150) DEFAULT NULL,
          \`created_by\` VARCHAR(150) DEFAULT NULL,
          \`scan_date\` VARCHAR(50) DEFAULT NULL,
          \`created_at\` VARCHAR(50) DEFAULT NULL,
          \`operation_code\` VARCHAR(100) DEFAULT NULL,
          \`batch_id\` VARCHAR(100) DEFAULT NULL,
          \`synced_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_return_shipments_barcode\` (\`barcode\`),
          INDEX \`idx_return_shipments_date\` (\`scan_date\`),
          INDEX \`idx_tbl_return_shipments_opcode\` (\`operation_code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      // Customer Pickup: parcels received straight from the customer (truck + weight + pieces)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS \`tbl_customer_pickup\` (
          \`id\` VARCHAR(100) NOT NULL,
          \`barcode\` VARCHAR(100) NOT NULL,
          \`tracking\` VARCHAR(100) DEFAULT NULL,
          \`company_name\` VARCHAR(255) DEFAULT NULL,
          \`driver_name\` VARCHAR(150) DEFAULT NULL,
          \`truck_no\` VARCHAR(100) DEFAULT NULL,
          \`kgs\` DECIMAL(12,3) DEFAULT NULL,
          \`pcs\` INT DEFAULT NULL,
          \`remarks\` TEXT DEFAULT NULL,
          \`operator_email\` VARCHAR(150) DEFAULT NULL,
          \`created_by\` VARCHAR(150) DEFAULT NULL,
          \`scan_date\` VARCHAR(50) DEFAULT NULL,
          \`created_at\` VARCHAR(50) DEFAULT NULL,
          \`operation_code\` VARCHAR(100) DEFAULT NULL,
          \`batch_id\` VARCHAR(100) DEFAULT NULL,
          \`synced_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_customer_pickup_barcode\` (\`barcode\`),
          INDEX \`idx_customer_pickup_date\` (\`scan_date\`),
          INDEX \`idx_tbl_customer_pickup_opcode\` (\`operation_code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      const [rows] = await pool.query(
        `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?) AND COLUMN_NAME IN ('operation_code', 'batch_id', 'origin', 'send_to_customer', 'return_status', 'approved_by', 'approved_at', 'remarks', 'driver_name', 'company_name', 'kgs', 'pcs')`,
        [WAREHOUSE_TABLES]
      );
      const existing = new Set(rows.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`));
      for (const t of WAREHOUSE_TABLES) {
        const adds = [];
        if (!existing.has(`${t}.operation_code`)) {
          adds.push('ADD COLUMN `operation_code` VARCHAR(100) DEFAULT NULL', `ADD INDEX \`idx_${t}_opcode\` (\`operation_code\`)`);
        }
        if (!existing.has(`${t}.batch_id`)) adds.push('ADD COLUMN `batch_id` VARCHAR(100) DEFAULT NULL');
        // Origin (ប្រភព) is captured on ScanIn / ScanOut / Arrived Hub only
        if ((t === 'tbl_scan_in' || t === 'tbl_scan_out' || t === 'tbl_arrived_hub') && !existing.has(`${t}.origin`)) {
          adds.push('ADD COLUMN `origin` VARCHAR(255) DEFAULT NULL');
        }
        // Return: company the parcel goes back to (from Customers, or typed)
        if (t === 'tbl_return_shipments' && !existing.has(`${t}.send_to_customer`)) {
          adds.push('ADD COLUMN `send_to_customer` VARCHAR(255) DEFAULT NULL AFTER `return_reason`');
        }
        // Return: approval status (NULL / REQUEST_RETURN = waiting, APPROVED = confirmed)
        if (t === 'tbl_return_shipments') {
          if (!existing.has(`${t}.return_status`)) adds.push('ADD COLUMN `return_status` VARCHAR(30) DEFAULT NULL');
          if (!existing.has(`${t}.approved_by`)) adds.push('ADD COLUMN `approved_by` VARCHAR(150) DEFAULT NULL');
          if (!existing.has(`${t}.approved_at`)) adds.push('ADD COLUMN `approved_at` VARCHAR(50) DEFAULT NULL');
        }
        // Out of Delivery: note (ចំណាំ) per parcel
        if (t === 'tbl_out_of_delivery' && !existing.has(`${t}.remarks`)) {
          adds.push('ADD COLUMN `remarks` TEXT DEFAULT NULL');
        }
        // Customer Pickup: Driver added after the table first shipped
        if (t === 'tbl_customer_pickup' && !existing.has(`${t}.driver_name`)) {
          adds.push('ADD COLUMN `driver_name` VARCHAR(150) DEFAULT NULL AFTER `tracking`');
        }
        // Customer Pickup: company the parcels are collected from
        if (t === 'tbl_customer_pickup' && !existing.has(`${t}.company_name`)) {
          adds.push('ADD COLUMN `company_name` VARCHAR(255) DEFAULT NULL AFTER `tracking`');
        }
        // ScanOut: weight and piece count per parcel
        if (t === 'tbl_scan_out') {
          if (!existing.has(`${t}.kgs`)) adds.push('ADD COLUMN `kgs` DECIMAL(12,3) DEFAULT NULL');
          if (!existing.has(`${t}.pcs`)) adds.push('ADD COLUMN `pcs` INT DEFAULT NULL');
        }
        if (adds.length > 0) await pool.query(`ALTER TABLE ${t} ${adds.join(', ')}`);
      }
    })().catch((err) => {
      warehouseColumnsReady = null; // retry on next request
      throw err;
    });
  }
  return warehouseColumnsReady;
}

/**
 * F. GET WAREHOUSE SCANS
 */
export async function getWarehouseScansFromMySQL(pool, userScope = null) {
  await ensureWarehouseScanColumns(pool);
  const isRestricted = Boolean(userScope && userScope.role !== 'ADMIN' && userScope.viewOnlyOwn);
  const identifiers = isRestricted ? [userScope.email, userScope.name].filter(Boolean) : [];

  let scanInSql = 'SELECT * FROM tbl_scan_in';
  let scanOutSql = 'SELECT * FROM tbl_scan_out';
  let oodSql = 'SELECT * FROM tbl_out_of_delivery';
  let holdSql = 'SELECT * FROM tbl_hold_remaining';
  let arrivedSql = 'SELECT * FROM tbl_arrived_hub';
  let returnSql = 'SELECT * FROM tbl_return_shipments';
  let pickupSql = 'SELECT * FROM tbl_customer_pickup';
  let params = [];

  if (isRestricted) {
    if (identifiers.length > 0) {
      const whereClause = ' WHERE (operator_email IN (?) OR created_by IN (?))';
      scanInSql += whereClause;
      scanOutSql += whereClause;
      oodSql += whereClause;
      holdSql += whereClause;
      arrivedSql += whereClause;
      returnSql += whereClause;
      pickupSql += whereClause;
      params = [identifiers, identifiers];
    } else {
      const whereClause = ' WHERE 1=0';
      scanInSql += whereClause;
      scanOutSql += whereClause;
      oodSql += whereClause;
      holdSql += whereClause;
      arrivedSql += whereClause;
      returnSql += whereClause;
      pickupSql += whereClause;
    }
  }

  scanInSql += ' ORDER BY created_at DESC LIMIT 5000';
  scanOutSql += ' ORDER BY created_at DESC LIMIT 5000';
  oodSql += ' ORDER BY created_at DESC LIMIT 5000';
  holdSql += ' ORDER BY created_at DESC LIMIT 5000';
  arrivedSql += ' ORDER BY created_at DESC LIMIT 5000';
  returnSql += ' ORDER BY created_at DESC LIMIT 5000';
  pickupSql += ' ORDER BY created_at DESC LIMIT 5000';

  const [[scanInRows], [scanOutRows], [oodRows], [holdRows], [arrivedRows], [returnRows], [pickupRows]] = await Promise.all([
    pool.query(scanInSql, params),
    pool.query(scanOutSql, params),
    pool.query(oodSql, params),
    pool.query(holdSql, params),
    pool.query(arrivedSql, params),
    pool.query(returnSql, params),
    pool.query(pickupSql, params)
  ]);

  // Own-records users still need the ScanOut operations sent to their Arrived Hub locations
  // (created by other operators) plus every receipt already scanned against them.
  if (isRestricted && userScope.email) {
    await ensurePermissionColumns(pool);
    const [permRows] = await pool.query(
      'SELECT allowed_locations FROM tbl_permissions WHERE LOWER(TRIM(email)) = ? LIMIT 1',
      [String(userScope.email).toLowerCase().trim()]
    );
    const locations = parseJsonList(permRows[0]?.allowed_locations);
    if (locations.length > 0) {
      const [allOutRows] = await pool.query('SELECT * FROM tbl_scan_out ORDER BY created_at DESC LIMIT 5000');
      const locationOutRows = allOutRows.filter((r) => locations.some((l) => isLocationMatch(r.destination, l)));
      const codes = Array.from(new Set(locationOutRows.map((r) => r.operation_code || r.batch_id).filter(Boolean)));
      const [locationArrivedRows] = codes.length > 0
        ? await pool.query('SELECT * FROM tbl_arrived_hub WHERE source_operation_code IN (?)', [codes])
        : [[]];
      const mergeById = (base, extra) => {
        const seen = new Set(base.map((r) => r.id));
        for (const r of extra) if (!seen.has(r.id)) { seen.add(r.id); base.push(r); }
      };
      mergeById(scanOutRows, locationOutRows);
      mergeById(arrivedRows, locationArrivedRows);
    }
  }

  return [
    ...scanInRows.map(s => ({
      id: s.id,
      scanType: 'SCAN_IN',
      operationCode: s.operation_code || undefined,
      batchId: s.batch_id || undefined,
      barcode: s.barcode,
      tracking: s.tracking || s.barcode,
      origin: s.origin || '',
      destination: s.destination || '',
      driverName: s.driver_name || '',
      truckNo: s.truck_no || '',
      transferBy: s.transfer_by || '',
      operatorEmail: s.operator_email || '',
      createdBy: s.created_by || '',
      date: s.scan_date || '',
      createdAt: s.created_at || ''
    })),
    ...scanOutRows.map(s => ({
      id: s.id,
      scanType: 'SCAN_OUT',
      operationCode: s.operation_code || undefined,
      batchId: s.batch_id || undefined,
      barcode: s.barcode,
      tracking: s.tracking || s.barcode,
      origin: s.origin || '',
      destination: s.destination || '',
      driverName: s.driver_name || '',
      truckNo: s.truck_no || '',
      kgs: s.kgs === null || s.kgs === undefined ? undefined : Number(s.kgs),
      pcs: s.pcs === null || s.pcs === undefined ? undefined : Number(s.pcs),
      operatorEmail: s.operator_email || '',
      createdBy: s.created_by || '',
      date: s.scan_date || '',
      createdAt: s.created_at || ''
    })),
    ...oodRows.map(s => ({
      id: s.id,
      scanType: 'OUT_OF_DELIVERY',
      operationCode: s.operation_code || undefined,
      batchId: s.batch_id || undefined,
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
      operationCode: s.operation_code || undefined,
      batchId: s.batch_id || undefined,
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
    })),
    ...arrivedRows.map(s => ({
      id: s.id,
      scanType: 'ARRIVED_HUB',
      operationCode: s.operation_code || undefined,
      batchId: s.batch_id || undefined,
      barcode: s.barcode,
      tracking: s.tracking || s.barcode,
      origin: s.origin || '',
      destination: s.destination || '',
      driverName: s.driver_name || '',
      truckNo: s.truck_no || '',
      sourceOperationCode: s.source_operation_code || undefined,
      arrivalStatus: s.arrival_status || undefined,
      remarks: s.remarks || '',
      operatorEmail: s.operator_email || '',
      createdBy: s.created_by || '',
      date: s.scan_date || '',
      createdAt: s.created_at || ''
    })),
    ...returnRows.map(s => ({
      id: s.id,
      scanType: 'RETURN_SHIPMENTS',
      operationCode: s.operation_code || undefined,
      batchId: s.batch_id || undefined,
      barcode: s.barcode,
      tracking: s.tracking || s.barcode,
      destination: s.destination || '',
      // The app keeps the reason in holdReason for both Hold and Return
      holdReason: s.return_reason || '',
      sendToCustomer: s.send_to_customer || '',
      returnStatus: s.return_status === 'APPROVED' ? 'APPROVED' : 'REQUEST_RETURN',
      approvedBy: s.approved_by || undefined,
      approvedAt: s.approved_at || undefined,
      remarks: s.remarks || '',
      operatorEmail: s.operator_email || '',
      createdBy: s.created_by || '',
      date: s.scan_date || '',
      createdAt: s.created_at || ''
    })),
    ...pickupRows.map(s => ({
      id: s.id,
      scanType: 'CUSTOMER_PICKUP',
      operationCode: s.operation_code || undefined,
      batchId: s.batch_id || undefined,
      barcode: s.barcode,
      tracking: s.tracking || s.barcode,
      // Same field the app uses for Return's company, so both share the company picker
      sendToCustomer: s.company_name || '',
      driverName: s.driver_name || '',
      truckNo: s.truck_no || '',
      kgs: s.kgs === null || s.kgs === undefined ? undefined : Number(s.kgs),
      pcs: s.pcs === null || s.pcs === undefined ? undefined : Number(s.pcs),
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
      const parsed = JSON.parse(s.setting_value);
      if (typeof parsed === 'number' && s.setting_key !== 'exchangeRate' && !s.setting_key.includes('Interval')) {
        // Keep IDs, tokens, PINs, phone numbers, etc. as strings
        settings[s.setting_key] = String(s.setting_value);
      } else {
        settings[s.setting_key] = parsed;
      }
    } catch {
      settings[s.setting_key] = s.setting_value;
    }
  }
  return settings;
}

/**
 * H. GET DISTRIBUTION REPORTS
 */
export async function getDistributionReportsFromMySQL(pool, userScope = null) {
  const isRestricted = Boolean(userScope && userScope.role !== 'ADMIN' && userScope.viewOnlyOwn);
  let sql = 'SELECT * FROM tbl_distribution_reports';
  const params = [];

  if (isRestricted) {
    const identifiers = [userScope.email, userScope.name].filter(Boolean);
    if (identifiers.length > 0) {
      sql += ' WHERE (operator_email IN (?) OR created_by IN (?))';
      params.push(identifiers, identifiers);
    } else {
      sql += ' WHERE 1=0';
    }
  }

  sql += ' ORDER BY created_at DESC, report_date DESC LIMIT 5000';
  const [distRows] = await pool.query(sql, params);
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

// Each section of get_all_master_data and the tables it reads. Every table has synced_at
// (ON UPDATE CURRENT_TIMESTAMP). Warehouse scans also depend on tbl_permissions
// (allowed_locations widens what own-records users see).
export const MASTER_SECTION_TABLES = {
  batches: ['tbl_batches', 'tbl_collection_items'],
  medicineBatches: ['tbl_medicine_batches', 'tbl_medicine_items'],
  codBatches: ['tbl_cod_collections'],
  payers: ['tbl_list_name'],
  permissions: ['tbl_permissions'],
  bankSlips: ['tbl_bank_slips'],
  warehouseScans: [...WAREHOUSE_TABLES, 'tbl_permissions'],
  settings: ['tbl_settings'],
  distributionReports: ['tbl_distribution_reports']
};
export const MASTER_SECTIONS = Object.keys(MASTER_SECTION_TABLES);

const MASTER_VERSION_TABLES = Array.from(new Set(Object.values(MASTER_SECTION_TABLES).flat()));

/**
 * Cheap fingerprint of all master data: row count (catches deletes) + latest synced_at
 * (catches inserts and edits) per table, in one round trip. The client polls this and
 * downloads only the sections whose fingerprint changed.
 * Returns { version: string, sections: { [section]: string } }.
 */
export async function getMasterDataVersion(pool) {
  await ensureWarehouseScanColumns(pool); // tbl_arrived_hub is created lazily; once per instance
  const cols = MASTER_VERSION_TABLES.map((t, i) =>
    `(SELECT CONCAT(COUNT(*), '.', COALESCE(UNIX_TIMESTAMP(MAX(synced_at)), 0)) FROM \`${t}\`) AS v${i}`
  ).join(',\n');
  const [rows] = await pool.query(`SELECT ${cols}`);
  const row = rows[0] || {};
  const byTable = {};
  MASTER_VERSION_TABLES.forEach((t, i) => { byTable[t] = String(row[`v${i}`] ?? ''); });
  const sections = {};
  for (const [name, tables] of Object.entries(MASTER_SECTION_TABLES)) {
    sections[name] = tables.map((t) => byTable[t]).join(':');
  }
  return { version: MASTER_VERSION_TABLES.map((t) => byTable[t]).join(':'), sections };
}

const MASTER_SECTION_LOADERS = {
  batches: (pool, scope) => getBatchesFromMySQL(pool, 300, scope),
  medicineBatches: (pool, scope) => getMedicineBatchesFromMySQL(pool, 300, scope),
  codBatches: (pool, scope) => getCodBatchesFromMySQL(pool, scope),
  payers: (pool) => getPayersFromMySQL(pool),
  permissions: (pool, scope) => getPermissionsFromMySQL(pool, scope),
  bankSlips: (pool, scope) => getBankSlipsFromMySQL(pool, scope),
  warehouseScans: (pool, scope) => getWarehouseScansFromMySQL(pool, scope),
  settings: (pool) => getSettingsFromMySQL(pool),
  distributionReports: (pool, scope) => getDistributionReportsFromMySQL(pool, scope)
};

/**
 * 1. GET ALL MASTER DATA (One-shot retrieval)
 * `sections` (optional array) limits the download to those sections; the others are left
 * out of `data`, so the client keeps what it has. Unknown names are ignored.
 */
export async function getAllMasterData(pool, userScope = null, sections = null) {
  const startTime = Date.now();
  const wanted = Array.isArray(sections) && sections.length > 0
    ? MASTER_SECTIONS.filter((s) => sections.includes(s))
    : MASTER_SECTIONS;

  const results = await Promise.all(wanted.map((s) => MASTER_SECTION_LOADERS[s](pool, userScope)));
  const data = {};
  wanted.forEach((s, i) => { data[s] = results[i]; });

  return { ok: true, durationMs: Date.now() - startTime, sections: wanted, data };
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
export async function saveWarehouseScanToMySQL(pool, scanOrItems, webAppUrl = '', { canApproveReturns = true } = {}) {
  let items = Array.isArray(scanOrItems) ? scanOrItems : [scanOrItems];
  // Only Admin may approve a Return: for anyone else drop the approval so the saved status stays as it is
  if (!canApproveReturns) {
    items = items.map((d) => (d && d.returnStatus === 'APPROVED' ? { ...d, returnStatus: undefined, approvedBy: undefined, approvedAt: undefined } : d));
  }
  if (items.length === 0) return { ok: true, count: 0 };

  await ensureWarehouseScanColumns(pool);
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
      const operationCode = d.operationCode || null;
      const batchId = d.batchId || null;
      // Keep existing codes when an update omits them (e.g. editing a single field)
      const keepCodes = 'operation_code = COALESCE(VALUES(operation_code), operation_code), batch_id = COALESCE(VALUES(batch_id), batch_id)';

      if (scanType === 'SCAN_IN') {
        await conn.query(`
          INSERT INTO tbl_scan_in (id, barcode, tracking, origin, destination, driver_name, truck_no, transfer_by, operator_email, created_by, scan_date, created_at, operation_code, batch_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            origin = VALUES(origin), destination = VALUES(destination), driver_name = VALUES(driver_name), truck_no = VALUES(truck_no), transfer_by = VALUES(transfer_by), ${keepCodes}
        `, [id, barcode, tracking, d.origin || '', d.destination || '', d.driverName || '', d.truckNo || '', d.transferBy || '', opEmail, createdBy, scanDate, createdAt, operationCode, batchId]);
      } else if (scanType === 'SCAN_OUT') {
        const kgs = d.kgs === '' || d.kgs === null || d.kgs === undefined || !Number.isFinite(Number(d.kgs)) ? null : Number(d.kgs);
        const pcs = d.pcs === '' || d.pcs === null || d.pcs === undefined || !Number.isFinite(Number(d.pcs)) ? null : Math.round(Number(d.pcs));
        await conn.query(`
          INSERT INTO tbl_scan_out (id, barcode, tracking, origin, destination, driver_name, truck_no, kgs, pcs, operator_email, created_by, scan_date, created_at, operation_code, batch_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            origin = VALUES(origin), destination = VALUES(destination), driver_name = VALUES(driver_name), truck_no = VALUES(truck_no),
            kgs = COALESCE(VALUES(kgs), kgs), pcs = COALESCE(VALUES(pcs), pcs), ${keepCodes}
        `, [id, barcode, tracking, d.origin || '', d.destination || '', d.driverName || '', d.truckNo || '', kgs, pcs, opEmail, createdBy, scanDate, createdAt, operationCode, batchId]);
      } else if (scanType === 'OUT_OF_DELIVERY') {
        await conn.query(`
          INSERT INTO tbl_out_of_delivery (id, barcode, tracking, rider_name, delivery_zone, cod_amount, currency, remarks, operator_email, created_by, scan_date, created_at, operation_code, batch_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            rider_name = VALUES(rider_name), delivery_zone = VALUES(delivery_zone), cod_amount = VALUES(cod_amount), remarks = VALUES(remarks), ${keepCodes}
        `, [id, barcode, tracking, d.riderName || '', d.deliveryZone || '', Number(d.codAmount || 0), d.currency || 'USD', d.remarks || '', opEmail, createdBy, scanDate, createdAt, operationCode, batchId]);
      } else if (scanType === 'HOLD_REMAINING') {
        await conn.query(`
          INSERT INTO tbl_hold_remaining (id, barcode, tracking, destination, hold_reason, shelf_location, remarks, operator_email, created_by, scan_date, created_at, operation_code, batch_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            hold_reason = VALUES(hold_reason), shelf_location = VALUES(shelf_location), remarks = VALUES(remarks), ${keepCodes}
        `, [id, barcode, tracking, d.destination || '', d.holdReason || '', d.shelfLocation || '', d.remarks || '', opEmail, createdBy, scanDate, createdAt, operationCode, batchId]);
      } else if (scanType === 'RETURN_SHIPMENTS') {
        await conn.query(`
          INSERT INTO tbl_return_shipments (id, barcode, tracking, destination, return_reason, send_to_customer, return_status, approved_by, approved_at, remarks, operator_email, created_by, scan_date, created_at, operation_code, batch_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            destination = VALUES(destination), return_reason = VALUES(return_reason), send_to_customer = VALUES(send_to_customer), remarks = VALUES(remarks),
            return_status = COALESCE(VALUES(return_status), return_status), approved_by = COALESCE(VALUES(approved_by), approved_by), approved_at = COALESCE(VALUES(approved_at), approved_at),
            ${keepCodes}
        `, [id, barcode, tracking, d.destination || '', d.holdReason || d.returnReason || '', (d.sendToCustomer || '').trim() || null,
          // New Return scans start as "Request Return"; an update without a status keeps the saved one
          d.returnStatus === 'APPROVED' ? 'APPROVED' : d.returnStatus === 'REQUEST_RETURN' ? 'REQUEST_RETURN' : null,
          d.returnStatus === 'APPROVED' ? (d.approvedBy || null) : null,
          d.returnStatus === 'APPROVED' ? (d.approvedAt || new Date().toISOString()) : null,
          d.remarks || '', opEmail, createdBy, scanDate, createdAt, operationCode, batchId]);
      } else if (scanType === 'CUSTOMER_PICKUP') {
        const kgs = d.kgs === '' || d.kgs === null || d.kgs === undefined || !Number.isFinite(Number(d.kgs)) ? null : Number(d.kgs);
        const pcs = d.pcs === '' || d.pcs === null || d.pcs === undefined || !Number.isFinite(Number(d.pcs)) ? null : Math.round(Number(d.pcs));
        await conn.query(`
          INSERT INTO tbl_customer_pickup (id, barcode, tracking, company_name, driver_name, truck_no, kgs, pcs, remarks, operator_email, created_by, scan_date, created_at, operation_code, batch_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            barcode = VALUES(barcode), company_name = VALUES(company_name), driver_name = VALUES(driver_name), truck_no = VALUES(truck_no), kgs = VALUES(kgs), pcs = VALUES(pcs), remarks = VALUES(remarks), ${keepCodes}
        `, [id, barcode, tracking, (d.sendToCustomer || '').trim() || null, d.driverName || '', d.truckNo || '', kgs, pcs, d.remarks || '', opEmail, createdBy, scanDate, createdAt, operationCode, batchId]);
      } else if (scanType === 'ARRIVED_HUB') {
        await conn.query(`
          INSERT INTO tbl_arrived_hub (id, barcode, tracking, origin, destination, driver_name, truck_no, source_operation_code, arrival_status, remarks, operator_email, created_by, scan_date, created_at, operation_code, batch_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            origin = VALUES(origin), destination = VALUES(destination), driver_name = VALUES(driver_name), truck_no = VALUES(truck_no),
            source_operation_code = VALUES(source_operation_code), arrival_status = VALUES(arrival_status), remarks = VALUES(remarks), ${keepCodes}
        `, [id, barcode, tracking, d.origin || '', d.destination || '', d.driverName || '', d.truckNo || '', d.sourceOperationCode || null, d.arrivalStatus || null, d.remarks || '', opEmail, createdBy, scanDate, createdAt, operationCode, batchId]);
      }
    }

    await conn.commit();

    // Background Sync to Google Sheets. The Sheets script has no Return or Customer Pickup sheet
    // (it would file them under Out of Delivery), so those scans stay in Hostinger only.
    const HOSTINGER_ONLY_TYPES = new Set(['RETURN_SHIPMENTS', 'CUSTOMER_PICKUP']);
    const sheetItems = items.filter((it) => !HOSTINGER_ONLY_TYPES.has(String(it.scanType || '').toUpperCase()));
    if (sheetItems.length > 0) triggerBackgroundSyncToGoogle('save_warehouse_scans', { items: sheetItems }, webAppUrl);

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

  const table = WAREHOUSE_TABLE_BY_TYPE[String(scanType || '').toUpperCase()];

  // Delete by ID (unique per record). Barcode is only a fallback when no ID is given, and then
  // only inside the record's own scanType table — a barcode legitimately appears in ScanIn,
  // ScanOut, Rider and Hold (and on several dates), so matching it elsewhere deletes other users' work.
  if (id) {
    const tables = table ? [table] : WAREHOUSE_TABLES;
    await Promise.all(tables.map((t) => pool.query(`DELETE FROM ${t} WHERE id = ?`, [id])));
  } else {
    if (!table) throw new Error('Deleting by barcode requires scanType');
    await pool.query(`DELETE FROM ${table} WHERE barcode = ?`, [barcode]);
  }

  triggerBackgroundSyncToGoogle('delete_warehouse_scan', { id, barcode, scanType }, webAppUrl);
  return { ok: true, message: '✓ បានលុប Scan Item ពី Master MySQL!' };
}

/**
 * 7b. DELETE WAREHOUSE SCANS BATCH
 */
export async function deleteWarehouseScansBatchFromMySQL(pool, items, webAppUrl = '') {
  if (!items || !Array.isArray(items) || items.length === 0) return { ok: true, count: 0 };

  // Group deletes per table. IDs go to their scanType's table (all tables if scanType unknown —
  // IDs are unique so that is still safe). Barcode-only items are deleted solely within their
  // own scanType table; never across tables, never matching other records by barcode when an ID exists.
  const idsByTable = new Map();
  const barcodesByTable = new Map();
  const push = (map, key, val) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(val);
  };
  for (const it of items) {
    const table = WAREHOUSE_TABLE_BY_TYPE[String(it.scanType || '').toUpperCase()];
    if (it.id) {
      for (const t of table ? [table] : WAREHOUSE_TABLES) push(idsByTable, t, it.id);
    } else if (it.barcode && table) {
      push(barcodesByTable, table, it.barcode);
    }
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    for (const [column, byTable] of [['id', idsByTable], ['barcode', barcodesByTable]]) {
      for (const [t, values] of byTable) {
        for (let i = 0; i < values.length; i += 500) {
          const chunk = values.slice(i, i + 500);
          const placeholders = chunk.map(() => '?').join(',');
          await conn.query(`DELETE FROM ${t} WHERE ${column} IN (${placeholders})`, chunk);
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
  const tables = scanType ? [WAREHOUSE_TABLE_BY_TYPE[String(scanType).toUpperCase()]].filter(Boolean) : WAREHOUSE_TABLES;
  if (tables.length === 0) throw new Error(`Unknown scanType: ${scanType}`);

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
  const allowedLocations = Array.isArray(perm.allowedLocations) ? JSON.stringify(perm.allowedLocations) : '[]';
  await ensurePermissionColumns(pool);

  await pool.query(`
    INSERT INTO tbl_permissions (
      user_id, email, name, role, status, data_scope,
      can_create, can_edit, can_delete, allowed_pages, allowed_locations, created_at, last_login, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name), role = VALUES(role), status = VALUES(status),
      data_scope = VALUES(data_scope), can_create = VALUES(can_create),
      can_edit = VALUES(can_edit), can_delete = VALUES(can_delete),
      allowed_pages = VALUES(allowed_pages), allowed_locations = VALUES(allowed_locations), updated_at = VALUES(updated_at)
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
    allowedLocations,
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
 * 11b. DAILY SUMMARY SEND LOCK
 * Atomic per-day claim so only ONE browser/device sends the daily Telegram summary.
 * op: 'claim'   -> { claimed: true } only for the first caller of the day
 *     'mark'    -> unconditionally record the date (manual send)
 *     'release' -> undo a claim when the Telegram send failed, so another device can retry
 *     'status'  -> { lastSentDate }
 */
let systemLocksTableReady = false;
export async function ensureSystemLocksTable(pool) {
  if (systemLocksTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`tbl_system_locks\` (
      \`lock_key\` VARCHAR(100) NOT NULL PRIMARY KEY,
      \`lock_value\` VARCHAR(255) NOT NULL DEFAULT '',
      \`updated_at\` DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  systemLocksTableReady = true;
}

export async function dailySummaryLockInMySQL(pool, op, date, lockKey = 'daily_distribution_summary') {
  const cleanDate = String(date || '').trim();
  if (op !== 'status' && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) throw new Error('Invalid date');
  await ensureSystemLocksTable(pool);

  if (op === 'status') {
    const [rows] = await pool.query('SELECT lock_value FROM tbl_system_locks WHERE lock_key = ? LIMIT 1', [lockKey]);
    return { ok: true, lastSentDate: rows[0]?.lock_value || '' };
  }

  await pool.query('INSERT IGNORE INTO tbl_system_locks (lock_key, lock_value, updated_at) VALUES (?, \'\', NOW())', [lockKey]);

  if (op === 'claim') {
    // Row-level atomic: only one concurrent UPDATE can flip the value to today's date
    const [result] = await pool.query(
      'UPDATE tbl_system_locks SET lock_value = ?, updated_at = NOW() WHERE lock_key = ? AND lock_value <> ?',
      [cleanDate, lockKey, cleanDate]
    );
    return { ok: true, claimed: result.affectedRows === 1 };
  }

  if (op === 'mark') {
    await pool.query('UPDATE tbl_system_locks SET lock_value = ?, updated_at = NOW() WHERE lock_key = ?', [cleanDate, lockKey]);
    return { ok: true };
  }

  if (op === 'release') {
    await pool.query(
      'UPDATE tbl_system_locks SET lock_value = \'\', updated_at = NOW() WHERE lock_key = ? AND lock_value = ?',
      [lockKey, cleanDate]
    );
    return { ok: true };
  }

  throw new Error('Invalid op');
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
    log.operator || log.userName || '',
    log.email || log.operatorEmail || log.userEmail || '',
    log.role || log.userRole || '',
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
 * 12b. READ USER LOGS (newest first, every user)
 */
export async function getUserLogsFromMySQL(pool, limit = 2000) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 2000, 1), 10000);
  try {
    const [rows] = await pool.query(
      `SELECT log_id, timestamp, operator, email, role, action, details, batch_number,
              amount_usd, amount_khr, items_count
         FROM tbl_user_logs ORDER BY id DESC LIMIT ?`,
      [n]
    );
    return rows.map((r) => ({
      id: r.log_id || `log-${r.timestamp}`,
      timestamp: r.timestamp || '',
      operator: r.operator || '',
      operatorEmail: r.email || '',
      userRole: r.role || '',
      action: r.action || '',
      description: r.details || '',
      details: r.details || '',
      batchNumber: r.batch_number || undefined,
      amountUSD: Number(r.amount_usd) || undefined,
      amountKHR: Number(r.amount_khr) || undefined,
      itemsCount: Number(r.items_count) || undefined
    }));
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

/**
 * 13. SAVE DISTRIBUTION REPORT (Single or Batch Real-Time CRUD)
 */
const DISTRIBUTION_TABLE = 'tbl_distribution_reports';

export async function saveDistributionReportToMySQL(pool, reportOrReports, webAppUrl = '') {
  if (!reportOrReports) throw new Error('No distribution report provided');
  const incoming = (Array.isArray(reportOrReports) ? reportOrReports : [reportOrReports]).filter(Boolean);
  if (incoming.length === 0) return { ok: true, count: 0 };

  // Never resurrect a deleted report: drop any ID that already has a deletion tombstone
  const deletedIds = await getDeletedIdSet(pool, DISTRIBUTION_TABLE, incoming.map((d) => d.id));
  const items = incoming.filter((d) => !d.id || !deletedIds.has(String(d.id).trim()));
  const skipped = incoming.length - items.length;
  if (skipped > 0) {
    console.warn(`[MySQL Master] Ignored ${skipped} distribution report(s) that were already deleted (tombstoned).`);
  }
  if (items.length === 0) return { ok: true, count: 0, skippedDeleted: skipped };

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
      skippedDeleted: skipped,
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
  const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).map((id) => String(id || '').trim()).filter(Boolean);
  if (ids.length === 0) return { ok: true, count: 0 };

  // Tombstone + delete in one transaction so a concurrent stale upsert can never slip in between
  await ensureDeletedRecordsTable(pool);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await recordDeletedIds(pool, DISTRIBUTION_TABLE, ids, conn);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await conn.query(`DELETE FROM tbl_distribution_reports WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }

  // Background Sync to Google Sheets
  triggerBackgroundSyncToGoogle('delete_distribution_report', { ids, barcode }, webAppUrl);

  return {
    ok: true,
    deletedCount: ids.length,
    message: `✓ បានលុប ${ids.length} របាយការណ៍ចែកចាយពី Master MySQL ជោគជ័យ!`
  };
}
