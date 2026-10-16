import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as masterHandlers from './mysql-master-handlers.js';

// Load .env if running directly or via Vite/Node
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {}

let pool = null;

/**
 * ទទួលយក MySQL Connection Pool (Singleton on globalThis)
 */
export function getMySQLPool() {
  if (!globalThis.__ial_mysql_pool) {
    const host = process.env.REMOTE_DB_HOST || 'srv1366.hstgr.io';
    const port = parseInt(process.env.REMOTE_DB_PORT || '3306', 10);
    const user = process.env.REMOTE_DB_USER || '';
    const password = process.env.REMOTE_DB_PASSWORD || '';
    const database = process.env.REMOTE_DB_NAME || 'u112951411_iale_api';

    globalThis.__ial_mysql_pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 15000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      timezone: '+07:00', // 🇰🇭 Cambodia Local Timezone (Asia/Phnom_Penh, UTC+7)
      charset: 'utf8mb4',
    });

    globalThis.__ial_mysql_pool.on('error', (err) => {
      console.warn('[MySQL Pool Warning]:', err?.code || err?.message);
      if (['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'].includes(err?.code)) {
        globalThis.__ial_mysql_pool = null;
      }
    });
  }
  return globalThis.__ial_mysql_pool;
}

/**
 * សាកល្បងតេស្ត Connection ទៅកាន់ Remote Database
 */
export async function testMySQLConnection() {
  const startTime = Date.now();
  try {
    const currentPool = getMySQLPool();
    const connection = await currentPool.getConnection();
    
    await connection.query("SET time_zone = '+07:00'");
    // Test basic query with Cambodia Timezone
    const [rows] = await connection.query('SELECT 1 + 1 AS result, DATABASE() AS current_db, VERSION() AS mysql_version, @@time_zone AS time_zone, NOW() AS db_time');
    
    // Get list of tables
    const [tables] = await connection.query('SHOW TABLES');
    
    connection.release();
    
    const durationMs = Date.now() - startTime;
    return {
      ok: true,
      durationMs,
      details: rows[0],
      tables: tables.map(t => Object.values(t)[0]),
      message: '✓ ភ្ជាប់ទៅកាន់ Remote MySQL Database ជោគជ័យ!'
    };
  } catch (error) {
    let hint = '';
    if (error.code === 'ETIMEDOUT') {
      hint = '⚠️ Connection Timed Out: Hostinger កំពុងបិទ Remote IP។ សូមចូលទៅ Hostinger hPanel -> Remote MySQL រួច Add IP របស់អ្នក ឬដាក់ % (Any Host)។';
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      hint = '⚠️ Access Denied: Username ឬ Password មិនត្រឹមត្រូវ សូមពិនិត្យមើលក្នុង .env ឡើងវិញ។';
    } else if (error.code === 'ENOTFOUND') {
      hint = '⚠️ Host Not Found: រកមិនឃើញ Host IP ឬ Host Name នេះទេ សូមពិនិត្យ REMOTE_DB_HOST។';
    }

    return {
      ok: false,
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage || error.message,
      hint,
      message: `❌ ការភ្ជាប់បរាជ័យ: ${error.message}`
    };
  }
}

/**
 * Execute a query with parameters (with automatic reconnection fallback)
 */
export async function executeQuery(sql, params = []) {
  try {
    const currentPool = getMySQLPool();
    const [rows, fields] = await currentPool.query(sql, params);
    return { rows, fields };
  } catch (err) {
    if (['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'].includes(err.code)) {
      console.warn('[MySQL Reconnect] Connection lost, retrying query with fresh pool...');
      globalThis.__ial_mysql_pool = null;
      const retryPool = getMySQLPool();
      const [rows, fields] = await retryPool.query(sql, params);
      return { rows, fields };
    }
    throw err;
  }
}

/**
 * ទទួលស្ថិតិ Database & Table Counts
 */
export async function getDatabaseStats() {
  const testRes = await testMySQLConnection();
  if (!testRes.ok) return testRes;

  const tables = testRes.tables || [];
  const stats = {};
  
  // Get row counts for key tables in parallel
  const targetTables = ['booking', 'shipment_detail', 'bill', 'manifest', 'users', 'location', 'status'];
  await Promise.all(targetTables.map(async (t) => {
    if (tables.includes(t)) {
      try {
        const { rows } = await executeQuery(`SELECT COUNT(id) as count FROM \`${t}\``);
        stats[t] = rows[0]?.count || 0;
      } catch {
        stats[t] = 0;
      }
    }
  }));

  return {
    ok: true,
    durationMs: testRes.durationMs,
    version: testRes.details?.mysql_version,
    database: testRes.details?.current_db,
    totalTables: tables.length,
    tables,
    tableCounts: stats
  };
}

/**
 * ទាញយកទិន្នន័យ Bookings ដោយមាន Pagination & Filter (Parallel Query)
 */
export async function getBookings({ page = 1, limit = 50, search = '', status = '' }) {
  const offset = (Math.max(1, page) - 1) * limit;
  let whereClauses = [];
  let params = [];

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    whereClauses.push('(pickup_address LIKE ? OR destination_address LIKE ? OR booking_contact LIKE ? OR receive_contact LIKE ? OR description LIKE ? OR acc_no LIKE ?)');
    params.push(s, s, s, s, s, s);
  }

  if (status && status.trim() && status !== 'ALL') {
    whereClauses.push('booking_status = ?');
    params.push(status.trim());
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Run Count & Data queries in parallel
  const countSql = `SELECT COUNT(id) as total FROM booking ${whereSql}`;
  const dataSql = `SELECT * FROM booking ${whereSql} ORDER BY id DESC LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`;

  const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
    executeQuery(countSql, params),
    executeQuery(dataSql, params)
  ]);

  const total = countRows[0]?.total || 0;

  return {
    ok: true,
    total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(total / limit),
    records: dataRows
  };
}

/**
 * Helper ដើម្បីបង្កើត WHERE clause សម្រាប់ Shipments ជាមួយនឹង Index Optimization
 */
export function buildShipmentWhere({ search = '', status = 'Delivered', issueBy = '', startDate = '', endDate = '' }) {
  let whereClauses = [];
  let params = [];

  // 1. Status: default to Delivered, or user filter (if 'ALL' -> no status filter)
  const targetStatus = status !== undefined && status !== null ? status.trim() : 'Delivered';
  if (targetStatus && targetStatus !== 'ALL') {
    whereClauses.push('status = ?');
    params.push(targetStatus);
  }

  // 2. High-Performance Search Optimization (Uses idx_shipment_tracking & idx_shipment_status)
  if (search && search.trim()) {
    const rawSearch = search.trim();
    const isIdSearch = /^#?\d{1,7}$/.test(rawSearch);
    const isAlphanumericCode = /^[A-Za-z0-9_-]{5,}$/.test(rawSearch);

    if (isIdSearch) {
      // Direct numeric ID or exact tracking lookup (super fast B-Tree seek)
      const cleanId = parseInt(rawSearch.replace('#', ''), 10);
      whereClauses.push('(id = ? OR tracking_number = ?)');
      params.push(cleanId, rawSearch);
    } else if (isAlphanumericCode) {
      // Directly leverages idx_shipment_tracking index with exact & prefix seek
      whereClauses.push('(tracking_number = ? OR tracking_number LIKE ? OR sign_by LIKE ?)');
      params.push(rawSearch, `${rawSearch}%`, `%${rawSearch}%`);
    } else {
      const s = `%${rawSearch}%`;
      whereClauses.push('(tracking_number LIKE ? OR sign_by LIKE ? OR issue_by LIKE ? OR delivery_by LIKE ?)');
      params.push(s, s, s, s);
    }
  }

  // 3. Issue By (ចេញដោយ) - uses idx_shipment_issue_by
  if (issueBy && issueBy.trim() && issueBy !== 'ALL') {
    whereClauses.push('issue_by = ?');
    params.push(issueBy.trim());
  }

  // 4. Delivery Date range (ថ្ងៃប្រគល់) - Streamlined Parsing (DD-MM-YYYY is 99% of dataset)
  const dExpr = `COALESCE(
    STR_TO_DATE(TRIM(delivery_on), '%d-%m-%Y %H:%i:%s'),
    STR_TO_DATE(TRIM(delivery_on), '%d-%m-%Y'),
    STR_TO_DATE(TRIM(delivery_on), '%Y-%m-%d'),
    STR_TO_DATE(TRIM(delivery_on), '%c/%e/%Y %r'),
    STR_TO_DATE(TRIM(delivery_on), '%c/%e/%Y')
  )`;

  if (startDate && startDate.trim()) {
    whereClauses.push(`${dExpr} >= ?`);
    params.push(`${startDate.trim()} 00:00:00`);
  }

  if (endDate && endDate.trim()) {
    whereClauses.push(`${dExpr} <= ?`);
    params.push(`${endDate.trim()} 23:59:59`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  return { whereSql, params };
}

/**
 * ទាញយកទិន្នន័យ Shipments ដោយមាន Pagination & Filter
 */
export async function getShipments({ page = 1, limit = 50, search = '', status = 'Delivered', issueBy = '', startDate = '', endDate = '' }) {
  const parsedLimit = parseInt(limit, 10) || 50;
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const offset = (parsedPage - 1) * parsedLimit;
  const { whereSql, params } = buildShipmentWhere({ search, status, issueBy, startDate, endDate });

  const dataSql = `SELECT id, tracking_number, sign_by, delivery_on, issue_by, status, destination, shipper, cnee FROM shipment_detail ${whereSql} ORDER BY id DESC LIMIT ${parsedLimit} OFFSET ${offset}`;

  // Execute Data query first
  const { rows: dataRows } = await executeQuery(dataSql, params);

  // Ultra-Fast Count Optimization:
  // If on Page 1 and returned records are less than limit, total is precisely dataRows.length.
  // Avoids running an expensive full-table COUNT(*) query!
  let total = 0;
  if (parsedPage === 1 && dataRows.length < parsedLimit && !offset) {
    total = dataRows.length;
  } else {
    const countSql = `SELECT COUNT(id) as total FROM shipment_detail ${whereSql}`;
    const { rows: countRows } = await executeQuery(countSql, params);
    total = countRows[0]?.total || 0;
  }

  return {
    ok: true,
    total,
    page: parsedPage,
    limit: parsedLimit,
    totalPages: Math.ceil(total / parsedLimit) || 1,
    records: dataRows
  };
}

/**
 * Export ទិន្នន័យ Shipments ទាំងអស់តាម Filter (រហូតដល់ limit កំណត់)
 */
export async function exportShipments({ search = '', status = 'Delivered', issueBy = '', startDate = '', endDate = '', limit = 50000 }) {
  const { whereSql, params } = buildShipmentWhere({ search, status, issueBy, startDate, endDate });
  const dataSql = `SELECT id, tracking_number, sign_by, delivery_on, issue_by, status FROM shipment_detail ${whereSql} ORDER BY id DESC LIMIT ${parseInt(limit, 10)}`;
  const { rows } = await executeQuery(dataSql, params);

  return {
    ok: true,
    total: rows.length,
    records: rows
  };
}

/**
 * ទាញបញ្ជី Unique Issue By (ចេញដោយ) ដែលមាន Status = Delivered
 */
export async function getIssueByList() {
  const sql = `
    SELECT issue_by, COUNT(*) as count 
    FROM shipment_detail 
    WHERE status = 'Delivered' AND issue_by IS NOT NULL AND TRIM(issue_by) != '' 
    GROUP BY issue_by 
    ORDER BY count DESC
  `;
  const { rows } = await executeQuery(sql);

  return {
    ok: true,
    list: rows
  };
}

/**
 * 📊 ទាញយកស្ថិតិ POD Delivered (រយៈពេល ២ ខែចុងក្រោយ) សម្រាប់ Sync ទៅ Google Sheets
 */
export async function getPodSyncStats() {
  const dExpr = `COALESCE(
    STR_TO_DATE(TRIM(delivery_on), '%d-%m-%Y %H:%i:%s'),
    STR_TO_DATE(TRIM(delivery_on), '%d-%m-%Y'),
    STR_TO_DATE(TRIM(delivery_on), '%c/%e/%Y %r'),
    STR_TO_DATE(TRIM(delivery_on), '%c/%e/%Y %h:%i:%s %p'),
    STR_TO_DATE(TRIM(delivery_on), '%c/%e/%Y'),
    STR_TO_DATE(TRIM(delivery_on), '%Y-%m-%d')
  )`;

  const countSql = `
    SELECT 
      COUNT(*) AS total_2_months,
      MIN(${dExpr}) AS earliest_delivery,
      MAX(${dExpr}) AS latest_delivery
    FROM shipment_detail
    WHERE status = 'Delivered'
      AND ${dExpr} >= DATE_SUB(CURDATE(), INTERVAL 2 MONTH)
  `;

  const totalAllSql = `
    SELECT 
      COUNT(*) AS total_all_delivered,
      MAX(id) AS max_delivered_id
    FROM shipment_detail
    WHERE status = 'Delivered'
  `;

  const [{ rows: countRows }, { rows: totalRows }] = await Promise.all([
    executeQuery(countSql),
    executeQuery(totalAllSql)
  ]);

  const stats = countRows[0] || {};
  const totalAll = totalRows[0]?.total_all_delivered || 0;
  const maxDeliveredId = totalRows[0]?.max_delivered_id || 0;

  return {
    ok: true,
    total_2_months: parseInt(stats.total_2_months || '0', 10),
    total_all_delivered: parseInt(totalAll || '0', 10),
    max_delivered_id: parseInt(maxDeliveredId || '0', 10),
    earliest_delivery: stats.earliest_delivery,
    latest_delivery: stats.latest_delivery,
    target_sheet_id: process.env.VITE_POD_BACKUP_SHEET_ID || '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ',
    target_sheet_tab: process.env.VITE_POD_BACKUP_SHEET_NAME || 'ialsystems_backup_pod',
    target_sheet_url: process.env.VITE_POD_BACKUP_SHEET_URL || 'https://docs.google.com/spreadsheets/d/1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ/edit?gid=0#gid=0',
  };
}

/**
 * ⚡ ទាញយកទិន្នន័យ POD Delivered ថ្មីៗតែប៉ុណ្ណោះ (Incremental by ID)
 */
export async function getPodNewDeliveredRecords({ sinceId = 0, limit = 500 } = {}) {
  const safeSinceId = Math.max(0, parseInt(sinceId, 10) || 0);
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 500), 2000);

  const sql = `
    SELECT 
      id,
      tracking_number,
      sign_by,
      delivery_on,
      issue_by,
      delivery_by,
      shipped_on,
      status,
      cod,
      remark
    FROM shipment_detail
    WHERE status = 'Delivered'
      AND id > ?
    ORDER BY id ASC
    LIMIT ?
  `;

  const { rows } = await executeQuery(sql, [safeSinceId, safeLimit]);
  const maxId = rows.length > 0 ? Math.max(...rows.map(r => Number(r.id) || 0)) : safeSinceId;

  return {
    ok: true,
    count: rows.length,
    since_id: safeSinceId,
    max_id: maxId,
    records: rows
  };
}

/**
 * 📦 ទាញយកទិន្នន័យ POD Delivered (រយៈពេល ២ ខែចុងក្រោយ) ជា Batch (Offset & Limit)
 */
export async function getPodSyncBatch({ offset = 0, limit = 2000, months = 2 }) {
  const dExpr = `COALESCE(
    STR_TO_DATE(TRIM(delivery_on), '%d-%m-%Y %H:%i:%s'),
    STR_TO_DATE(TRIM(delivery_on), '%d-%m-%Y'),
    STR_TO_DATE(TRIM(delivery_on), '%c/%e/%Y %r'),
    STR_TO_DATE(TRIM(delivery_on), '%c/%e/%Y %h:%i:%s %p'),
    STR_TO_DATE(TRIM(delivery_on), '%c/%e/%Y'),
    STR_TO_DATE(TRIM(delivery_on), '%Y-%m-%d')
  )`;

  const intervalMonths = parseInt(months, 10) || 2;
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 2000), 10000);
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const sql = `
    SELECT 
      id,
      tracking_number,
      sign_by,
      delivery_on,
      issue_by,
      delivery_by,
      shipped_on,
      status,
      cod,
      remark
    FROM shipment_detail
    WHERE status = 'Delivered'
      AND ${dExpr} >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;

  const { rows } = await executeQuery(sql, [intervalMonths, safeLimit, safeOffset]);

  return {
    ok: true,
    count: rows.length,
    offset: safeOffset,
    limit: safeLimit,
    records: rows
  };
}

/**
 * 🚀 បញ្ជូន Batch ទៅកាន់ Google Apps Script Web App
 */
export async function syncPodBatchToGoogleSheets({ webAppUrl, rows, mode = 'append', isFirstBatch = false, spreadsheetId, sheetName }) {
  const targetUrl = webAppUrl || process.env.VITE_POD_BACKUP_WEBAPP_URL || process.env.VITE_GOOGLE_WEBAPP_URL || '';
  if (!targetUrl || !targetUrl.trim()) {
    return { ok: false, message: 'ពុំទាន់បានកំណត់ Web App URL ទេ (Missing Google Web App URL)' };
  }

  const payload = {
    action: 'sync_pod_backup',
    spreadsheetId: spreadsheetId || process.env.VITE_POD_BACKUP_SHEET_ID || '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ',
    sheetName: sheetName || process.env.VITE_POD_BACKUP_SHEET_NAME || 'ialsystems_backup_pod',
    mode,
    isFirstBatch,
    rows
  };

  try {
    const res = await fetch(targetUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000) // 60s timeout
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (res.status === 401 || res.status === 403 || (typeof text === 'string' && text.includes('accounts.google.com'))) {
      return {
        ok: false,
        status: res.status,
        isAuthRequired: true,
        message: '⚠️ Google Apps Script កំពុងទាមទារសិទ្ធិ Login (401 Unauthorized)៖ សូមចូលទៅ Apps Script ➔ Deploy ➔ Manage deployments ➔ Edit ➔ ជ្រើសរើស "Who has access" = "Anyone (អ្នកណាក៏បាន)" រួច Deploy ម្តងទៀត។',
        data: json
      };
    }

    return {
      ok: res.ok,
      status: res.status,
      data: json
    };
  } catch (err) {
    return {
      ok: false,
      message: err.message
    };
  }
}

/**
 * ទាញយកទិន្នន័យពី Table ណាមួយដែលមានក្នុង Database (គាំទ្រ Search & Sorting)
 */
export async function getTableData(tableName, { limit = 50, offset = 0, search = '' }) {
  const testRes = await testMySQLConnection();
  if (!testRes.ok) return testRes;

  const validTables = testRes.tables || [];
  if (!validTables.includes(tableName)) {
    return { ok: false, message: `រកមិនឃើញ Table ឈ្មោះ "${tableName}" ទេ` };
  }

  // Columns
  const { rows: columns } = await executeQuery(`DESCRIBE \`${tableName}\``);
  const colNames = columns.map(c => c.Field);
  const textCols = columns
    .filter(c => /char|text|varchar|enum|date|string/i.test(c.Type))
    .map(c => c.Field);

  let whereSql = '';
  let params = [];
  if (search && search.trim() && textCols.length > 0) {
    const s = `%${search.trim()}%`;
    const clauses = textCols.map(col => `\`${col}\` LIKE ?`);
    whereSql = `WHERE (${clauses.join(' OR ')})`;
    params = textCols.map(() => s);
  }

  // Smart Order By: Prefer created_at DESC, id DESC, or primary key DESC
  let orderCol = null;
  const priKey = columns.find(c => c.Key === 'PRI')?.Field;
  if (colNames.includes('created_at')) orderCol = 'created_at';
  else if (colNames.includes('updated_at')) orderCol = 'updated_at';
  else if (colNames.includes('id')) orderCol = 'id';
  else if (priKey) orderCol = priKey;

  const orderSql = orderCol ? `ORDER BY \`${orderCol}\` DESC` : '';

  // Run Count and Data queries in parallel
  const countSql = `SELECT COUNT(*) as total FROM \`${tableName}\` ${whereSql}`;
  const dataSql = `SELECT * FROM \`${tableName}\` ${whereSql} ${orderSql} LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`;

  const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
    executeQuery(countSql, params),
    executeQuery(dataSql, params)
  ]);

  const total = countRows[0]?.total || 0;

  return {
    ok: true,
    table: tableName,
    total,
    columns: columns.map(c => ({ name: c.Field, type: c.Type, key: c.Key })),
    records: dataRows
  };
}

/**
 * API Handler សម្រាប់ Vite / Serverless / Express
 */
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  const rawUrl = req.originalUrl || req.url || '/';
  const url = new URL(rawUrl, 'http://localhost');
  const action = url.searchParams.get('action') || (req.body && req.body.action) || 'test';

  if (req.method === 'GET') {
    try {
      if (action === 'test') {
        const result = await testMySQLConnection();
        res.statusCode = result.ok ? 200 : 500;
        res.end(JSON.stringify(result, null, 2));
        return;
      }

      if (action === 'stats') {
        const stats = await getDatabaseStats();
        res.statusCode = stats.ok ? 200 : 500;
        res.end(JSON.stringify(stats, null, 2));
        return;
      }

      // --- 🚀 MASTER DATABASE ACTIONS (GET) - High Performance Targeted Queries ---
      if (action === 'get_all_master_data') {
        const pool = getMySQLPool();
        const { getAllMasterData } = await import('./mysql-master-handlers.js');
        const result = await getAllMasterData(pool);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (action === 'get_batches') {
        const pool = getMySQLPool();
        const { getBatchesFromMySQL } = await import('./mysql-master-handlers.js');
        const data = await getBatchesFromMySQL(pool);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_medicine_batches') {
        const pool = getMySQLPool();
        const { getMedicineBatchesFromMySQL } = await import('./mysql-master-handlers.js');
        const data = await getMedicineBatchesFromMySQL(pool);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_cod_batches') {
        const pool = getMySQLPool();
        const data = await masterHandlers.getCodBatchesFromMySQL(pool);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_payers' || action === 'get_list_names') {
        const pool = getMySQLPool();
        const { getPayersFromMySQL } = await import('./mysql-master-handlers.js');
        const data = await getPayersFromMySQL(pool);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_permissions') {
        const pool = getMySQLPool();
        const { getPermissionsFromMySQL } = await import('./mysql-master-handlers.js');
        const data = await getPermissionsFromMySQL(pool);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_bank_slips') {
        const pool = getMySQLPool();
        const { getBankSlipsFromMySQL } = await import('./mysql-master-handlers.js');
        const data = await getBankSlipsFromMySQL(pool);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_distribution_reports') {
        const pool = getMySQLPool();
        const { getDistributionReportsFromMySQL } = await import('./mysql-master-handlers.js');
        const data = await getDistributionReportsFromMySQL(pool);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_warehouse_scans') {
        const pool = getMySQLPool();
        const { getWarehouseScansFromMySQL } = await import('./mysql-master-handlers.js');
        const data = await getWarehouseScansFromMySQL(pool);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_settings') {
        const pool = getMySQLPool();
        const { getSettingsFromMySQL } = await import('./mysql-master-handlers.js');
        const data = await getSettingsFromMySQL(pool);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'bookings') {
        const page = parseInt(url.searchParams.get('page') || '1', 10);
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const search = url.searchParams.get('search') || '';
        const status = url.searchParams.get('status') || '';
        const result = await getBookings({ page, limit, search, status });
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (action === 'shipments') {
        const page = parseInt(url.searchParams.get('page') || '1', 10);
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const search = url.searchParams.get('search') || '';
        const status = url.searchParams.get('status') || 'Delivered';
        const issueBy = url.searchParams.get('issueBy') || url.searchParams.get('issue_by') || '';
        const startDate = url.searchParams.get('startDate') || url.searchParams.get('start_date') || '';
        const endDate = url.searchParams.get('endDate') || url.searchParams.get('end_date') || '';
        const result = await getShipments({ page, limit, search, status, issueBy, startDate, endDate });
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (action === 'export_shipments') {
        const search = url.searchParams.get('search') || '';
        const status = url.searchParams.get('status') || 'Delivered';
        const issueBy = url.searchParams.get('issueBy') || url.searchParams.get('issue_by') || '';
        const startDate = url.searchParams.get('startDate') || url.searchParams.get('start_date') || '';
        const endDate = url.searchParams.get('endDate') || url.searchParams.get('end_date') || '';
        const limit = parseInt(url.searchParams.get('limit') || '50000', 10);
        const result = await exportShipments({ search, status, issueBy, startDate, endDate, limit });
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (action === 'issue_by_list') {
        const result = await getIssueByList();
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (action === 'table_data') {
        const table = url.searchParams.get('table') || 'booking';
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const search = url.searchParams.get('search') || '';
        const result = await getTableData(table, { limit, offset, search });
        res.statusCode = result.ok ? 200 : 400;
        res.end(JSON.stringify(result));
        return;
      }

      if (action === 'pod_sync_stats') {
        const result = await getPodSyncStats();
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (action === 'pod_sync_batch') {
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const limit = parseInt(url.searchParams.get('limit') || '2000', 10);
        const months = parseInt(url.searchParams.get('months') || '2', 10);
        const result = await getPodSyncBatch({ offset, limit, months });
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (action === 'pod_sync_new_records') {
        const sinceId = parseInt(url.searchParams.get('since_id') || '0', 10);
        const limit = parseInt(url.searchParams.get('limit') || '500', 10);
        const result = await getPodNewDeliveredRecords({ sinceId, limit });
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (action === 'test_pod_webapp') {
        const targetUrl = url.searchParams.get('url') || process.env.VITE_POD_BACKUP_WEBAPP_URL || '';
        if (!targetUrl) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, message: 'ពុំទាន់បានបញ្ចូល Web App URL ទេ' }));
          return;
        }
        try {
          const pingUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}action=ping`;
          const pingRes = await fetch(pingUrl, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
          const finalUrl = pingRes.url || '';
          const text = await pingRes.text();

          if (finalUrl.includes('accounts.google.com')) {
            res.statusCode = 200;
            res.end(JSON.stringify({
              ok: false,
              isAuthRequired: true,
              message: '⚠️ Google កំពុងទាមទារឱ្យ Login៖ សូមចូលទៅ Apps Script ➔ Deploy ➔ Manage deployments ➔ Edit ➔ កែប្រែ "Who has access" ទៅជា "Anyone (អ្នកណាក៏បាន)" រួចចុច Deploy ម្តងទៀត។'
            }));
            return;
          }

          let json;
          try { json = JSON.parse(text); } catch {}
          if (json && (json.ok || json.status === 'online')) {
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, message: '✓ ភ្ជាប់ទៅកាន់ Google Web App ជោគជ័យ!', data: json }));
            return;
          }

          res.statusCode = 200;
          res.end(JSON.stringify({ ok: false, message: `ការឆ្លើយតបមិនត្រឹមត្រូវ: ${text.slice(0, 100)}` }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, message: `កំហុសតភ្ជាប់: ${err.message}` }));
        }
        return;
      }

      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, message: `Unknown action: ${action}` }));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, message: e.message }));
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const pool = getMySQLPool();

      // Check Master Database Operations
      const postAction = body.action || url.searchParams.get('action');

      if (postAction === 'save_batch') {
        const result = await masterHandlers.saveBatchToMySQL(pool, body.batch, false, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_batch') {
        const result = await masterHandlers.deleteBatchFromMySQL(pool, body.batchNumber || body.id, false, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'save_medicine_batch') {
        const result = await masterHandlers.saveBatchToMySQL(pool, body.batch, true, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_medicine_batch') {
        const result = await masterHandlers.deleteBatchFromMySQL(pool, body.batchNumber || body.id, true, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'save_cod_batch') {
        const result = await masterHandlers.saveCodBatchToMySQL(pool, body.batch, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_cod_batch') {
        const result = await masterHandlers.deleteCodBatchFromMySQL(pool, body.batchNumber || body.id, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_all_batches') {
        const result = await masterHandlers.deleteAllBatchesFromMySQL(pool, false, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_all_medicine_batches') {
        const result = await masterHandlers.deleteAllBatchesFromMySQL(pool, true, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_all_cod_batches') {
        const result = await masterHandlers.deleteAllCodBatchesFromMySQL(pool, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'save_payer' || postAction === 'save_list_name') {
        const result = await masterHandlers.savePayerToMySQL(pool, body.payer, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_payer') {
        const result = await masterHandlers.deletePayerFromMySQL(pool, body.id, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'save_warehouse_scans' || postAction === 'save_warehouse_scan') {
        const result = await masterHandlers.saveWarehouseScanToMySQL(pool, body.items || body.scan, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_warehouse_scan') {
        const result = await masterHandlers.deleteWarehouseScanFromMySQL(pool, body.id, body.scanType, body.barcode, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_warehouse_scans_batch' || postAction === 'delete_warehouse_scan_batch') {
        const result = await masterHandlers.deleteWarehouseScansBatchFromMySQL(pool, body.items || body.scans, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'clear_all_warehouse_scans') {
        const result = await masterHandlers.clearAllWarehouseScansFromMySQL(pool, body.scanType, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'save_bank_slip') {
        const result = await masterHandlers.saveBankSlipToMySQL(pool, body.slip, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_bank_slip') {
        const result = await masterHandlers.deleteBankSlipFromMySQL(pool, body.id, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'save_permission') {
        const result = await masterHandlers.savePermissionToMySQL(pool, body.permission, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_permission') {
        const result = await masterHandlers.deletePermissionFromMySQL(pool, body.email || body.userId || body.id, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'save_settings') {
        const result = await masterHandlers.saveSettingsToMySQL(pool, body.settings, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'save_distribution_report' || postAction === 'save_distribution_reports') {
        const result = await masterHandlers.saveDistributionReportToMySQL(pool, body.reports || body.report || body.item || body.items, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_distribution_report' || postAction === 'delete_distribution_reports') {
        const result = await masterHandlers.deleteDistributionReportFromMySQL(pool, body.ids || body.id, body.barcode, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'log_activity') {
        await masterHandlers.logActivityToMySQL(pool, body.log);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (postAction === 'sync_pod_batch') {
        const result = await syncPodBatchToGoogleSheets({
          webAppUrl: body.webAppUrl,
          rows: body.rows || [],
          mode: body.mode || 'append',
          isFirstBatch: body.isFirstBatch || false,
          spreadsheetId: body.spreadsheetId,
          sheetName: body.sheetName
        });
        res.statusCode = result.ok ? 200 : 400;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'auto_sync_new_pod') {
        const sinceId = parseInt(body.sinceId || '0', 10);
        const limit = parseInt(body.limit || '500', 10);
        const newRecordsRes = await getPodNewDeliveredRecords({ sinceId, limit });

        if (!newRecordsRes.ok) {
          res.statusCode = 500;
          res.end(JSON.stringify(newRecordsRes));
          return;
        }

        if (newRecordsRes.count === 0) {
          res.statusCode = 200;
          res.end(JSON.stringify({
            ok: true,
            synced_count: 0,
            since_id: sinceId,
            max_id: sinceId,
            message: 'ពុំមានទិន្នន័យ Delivered ថ្មីទេ (Up to date)'
          }));
          return;
        }

        const syncResult = await syncPodBatchToGoogleSheets({
          webAppUrl: body.webAppUrl,
          rows: newRecordsRes.records,
          mode: 'append',
          isFirstBatch: false,
          spreadsheetId: body.spreadsheetId,
          sheetName: body.sheetName
        });

        if (!syncResult.ok) {
          res.statusCode = 400;
          res.end(JSON.stringify({
            ok: false,
            message: `មិនអាចបញ្ជូនទៅ Google Sheets: ${syncResult.message || 'Unknown error'}`,
            details: syncResult
          }));
          return;
        }

        res.statusCode = 200;
        res.end(JSON.stringify({
          ok: true,
          synced_count: newRecordsRes.count,
          previous_id: sinceId,
          new_max_id: newRecordsRes.max_id,
          message: `✓ បាន Auto-Sync កញ្ចប់ Delivered ថ្មីចំនួន ${newRecordsRes.count} ទៅ Google Sheets! (ID #${sinceId + 1} - #${newRecordsRes.max_id})`
        }));
        return;
      }

      // Direct arbitrary SQL execution is permanently disabled for security
      const { sql } = body;
      if (sql) {
        res.statusCode = 403;
        res.end(JSON.stringify({
          ok: false,
          code: 'FORBIDDEN_RAW_SQL',
          message: '⛔ ការបញ្ជូនពាក្យបញ្ជា Raw SQL ត្រូវបានបិទជាស្ថាពរដើម្បីការពារសុវត្ថិភាពទិន្នន័យ (Raw SQL Execution Disabled for Security).'
        }));
        return;
      }

      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, message: `Unknown POST action or missing SQL` }));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, message: e.message }));
    }
    return;
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ ok: false, message: 'Method Not Allowed' }));
}
