import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import dns from 'dns';
import { AsyncLocalStorage } from 'async_hooks';
import * as masterHandlers from './mysql-master-handlers.js';
import { authenticateRequest } from './auth-middleware.js';

// Configure Google & Cloudflare DNS servers for Node resolver
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {}

// Cache for resolved DNS addresses (Hostinger fallback)
const dnsCache = new Map([
  ['srv1366.hstgr.io', ['153.92.15.20']]
]);

// Resolve hostname via DNS-over-HTTPS (DoH) when local ISP UDP DNS port 53 is blocked/timing out
async function resolveViaDoH(hostname) {
  if (dnsCache.has(hostname)) {
    return dnsCache.get(hostname);
  }
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(3000)
    });
    const json = await res.json();
    if (json && json.Answer && json.Answer.length > 0) {
      const aRecords = json.Answer.filter(a => a.type === 1).map(a => a.data);
      if (aRecords.length > 0) {
        dnsCache.set(hostname, aRecords);
        return aRecords;
      }
    }
  } catch (e) {
    try {
      const gRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`, {
        signal: AbortSignal.timeout(3000)
      });
      const gJson = await gRes.json();
      if (gJson && gJson.Answer && gJson.Answer.length > 0) {
        const aRecords = gJson.Answer.filter(a => a.type === 1).map(a => a.data);
        if (aRecords.length > 0) {
          dnsCache.set(hostname, aRecords);
          return aRecords;
        }
      }
    } catch {}
  }
  return null;
}

// Custom DNS lookup that resolves script.googleusercontent.com even when local ISP DNS fails
export function customGoogleLookup(hostname, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'object' ? options : {};

  // 1. Check in-memory DNS cache
  if (dnsCache.has(hostname)) {
    const addrs = dnsCache.get(hostname);
    if (opts.all) {
      return cb(null, addrs.map(a => ({ address: a, family: 4 })));
    }
    return cb(null, addrs[0], 4);
  }

  // 2. Try standard DNS lookup
  dns.lookup(hostname, opts, async (err, address, family) => {
    if (!err && address) {
      return cb(null, address, family);
    }
    // 3. Fallback to DNS-over-HTTPS
    const dohAddrs = await resolveViaDoH(hostname);
    if (dohAddrs && dohAddrs.length > 0) {
      if (opts.all) {
        return cb(null, dohAddrs.map(a => ({ address: a, family: 4 })));
      }
      return cb(null, dohAddrs[0], 4);
    }
    return cb(err || new Error(`Could not resolve hostname: ${hostname}`));
  });
}

// Robust fetch helper for Google Apps Script that works natively on Vercel and falls back to DoH on local ISP DNS issues
export async function fetchGoogleScript(targetUrl, { method = 'GET', headers = {}, body = null, timeout = 35000 } = {}) {
  // Strategy 1: Standard native fetch (optimal for Vercel, Cloud, and normal environments)
  try {
    const fetchHeaders = { ...headers };
    if (body && !fetchHeaders['Content-Type']) {
      fetchHeaders['Content-Type'] = 'text/plain;charset=utf-8';
    }
    const res = await fetch(targetUrl, {
      method,
      headers: fetchHeaders,
      body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout)
    });
    return res;
  } catch (nativeErr) {
    // Only if native fetch throws a DNS resolution error (e.g., local ISP DNS failure), fallback to Strategy 2
    console.warn('[fetchGoogleScript] Native fetch failed, attempting DoH fallback:', nativeErr.message);
  }

  // Strategy 2: DoH Fallback for local ISP DNS failure
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${targetUrl}`));
    }

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method,
      headers: { ...headers },
      lookup: customGoogleLookup,
      timeout
    };

    if (body) {
      if (!reqOptions.headers['Content-Type']) {
        reqOptions.headers['Content-Type'] = 'text/plain;charset=utf-8';
      }
      reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(reqOptions, (res) => {
      // Follow 301 / 302 / 307 / 308 redirects (Google Apps Script redirects to script.googleusercontent.com)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = new URL(res.headers.location, targetUrl).toString();
        const isPreservePost = (res.statusCode === 307 || res.statusCode === 308) && method === 'POST';
        const nextMethod = isPreservePost ? 'POST' : 'GET';
        const nextBody = isPreservePost ? body : null;
        return resolve(fetchGoogleScript(nextUrl, { method: nextMethod, headers, body: nextBody, timeout }));
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          url: targetUrl,
          text: async () => data,
          json: async () => {
            try { return JSON.parse(data); } catch { return { raw: data }; }
          }
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeout}ms`));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// Load .env if running directly or via Vite/Node
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {}

let pool = null;

/** Timing for the current request: DB wall time, query count, and whether the pool was created cold. */
const requestTiming = new AsyncLocalStorage();

/**
 * ទទួលយក MySQL Connection Pool (Singleton on globalThis)
 */
export function getMySQLPool() {
  if (!globalThis.__ial_mysql_pool) {
    let host = process.env.REMOTE_DB_HOST || 'srv1366.hstgr.io';
    // Fallback to static Hostinger server IP if host is srv1366.hstgr.io to prevent ISP DNS resolution timeout
    if (host === 'srv1366.hstgr.io') {
      host = '153.92.15.20';
    }
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
      ssl: process.env.REMOTE_DB_SSL === 'false' ? undefined : {
        rejectUnauthorized: process.env.REMOTE_DB_SSL_STRICT === 'true'
      },
    });

    // Per-request DB timing for the Server-Timing header (see handler below)
    const timedPool = globalThis.__ial_mysql_pool;
    const rawQuery = timedPool.query.bind(timedPool);
    timedPool.query = (...args) => {
      const st = requestTiming.getStore();
      if (!st) return rawQuery(...args);
      const t0 = performance.now();
      st.queries += 1;
      if (st.dbStart === null) st.dbStart = t0;
      return rawQuery(...args).finally(() => { st.dbEnd = Math.max(st.dbEnd, performance.now()); });
    };
    const st = requestTiming.getStore();
    if (st) st.coldPool = true;

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
 * 🔍 ទាញយក Max ID ពិតប្រាកដដែលមាននៅក្នុង Google Sheet (ialsystems_backup_pod)
 */
export async function getGoogleSheetMaxId({ spreadsheetId, sheetName, webAppUrl } = {}) {
  const ssId = spreadsheetId || process.env.VITE_POD_BACKUP_SHEET_ID || '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ';
  const tabName = sheetName || process.env.VITE_POD_BACKUP_SHEET_NAME || 'ialsystems_backup_pod';

  // Strategy 1: Google Visualization API (Direct, ultra fast, no Apps Script quotas)
  try {
    const url = `https://docs.google.com/spreadsheets/d/${ssId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}&tq=${encodeURIComponent('select max(A)')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
      if (match && match[1]) {
        const json = JSON.parse(match[1]);
        const val = json.table?.rows?.[0]?.c?.[0]?.v;
        if (val !== undefined && val !== null && !isNaN(val)) {
          return {
            ok: true,
            sheet_max_id: Math.round(Number(val)),
            spreadsheet_id: ssId,
            sheet_name: tabName,
            source: 'gviz'
          };
        }
      }
    }
  } catch (err) {
    // Strategy 1 failed, fall back to Strategy 2
  }

  // Strategy 2: Web App get_max_id or get_stats
  const targetUrl = webAppUrl || process.env.VITE_POD_BACKUP_WEBAPP_URL || '';
  if (targetUrl) {
    try {
      const pingUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}action=get_max_id&sheetName=${encodeURIComponent(tabName)}&spreadsheetId=${encodeURIComponent(ssId)}`;
      const res = await fetchGoogleScript(pingUrl, { timeout: 15000 });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.max_id !== undefined && !isNaN(data.max_id)) {
          return {
            ok: true,
            sheet_max_id: Math.round(Number(data.max_id)),
            spreadsheet_id: ssId,
            sheet_name: tabName,
            source: 'webapp'
          };
        }
      }
    } catch (err) {
      // ignore
    }
  }

  return {
    ok: false,
    sheet_max_id: 0,
    spreadsheet_id: ssId,
    sheet_name: tabName,
    message: 'Could not determine sheet max ID'
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

  const targetSheetId = process.env.VITE_POD_BACKUP_SHEET_ID || '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ';
  const targetSheetTab = process.env.VITE_POD_BACKUP_SHEET_NAME || 'ialsystems_backup_pod';

  const [{ rows: countRows }, { rows: totalRows }, sheetMaxRes] = await Promise.all([
    executeQuery(countSql),
    executeQuery(totalAllSql),
    getGoogleSheetMaxId({ spreadsheetId: targetSheetId, sheetName: targetSheetTab }).catch(() => ({ ok: false, sheet_max_id: 0 }))
  ]);

  const stats = countRows[0] || {};
  const totalAll = totalRows[0]?.total_all_delivered || 0;
  const maxDeliveredId = totalRows[0]?.max_delivered_id || 0;
  const sheetMaxId = sheetMaxRes?.ok && sheetMaxRes?.sheet_max_id ? sheetMaxRes.sheet_max_id : 0;

  return {
    ok: true,
    total_2_months: parseInt(stats.total_2_months || '0', 10),
    total_all_delivered: parseInt(totalAll || '0', 10),
    max_delivered_id: parseInt(maxDeliveredId || '0', 10),
    sheet_max_id: parseInt(sheetMaxId || '0', 10),
    earliest_delivery: stats.earliest_delivery,
    latest_delivery: stats.latest_delivery,
    target_sheet_id: targetSheetId,
    target_sheet_tab: targetSheetTab,
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
  
  // 🛡️ STRICT DEDUPLICATION: ដក Tracking Number ណាដែលជាន់គ្នាក្នុងកញ្ចប់ចេញ ទុកតែទិន្នន័យចុងក្រោយ
  const seenTrk = new Set();
  const dedupedRows = [];
  for (const r of rows) {
    const trk = r.tracking_number ? String(r.tracking_number).trim().toUpperCase() : '';
    if (!trk) continue;
    if (seenTrk.has(trk)) continue;
    seenTrk.add(trk);
    dedupedRows.push(r);
  }
  const maxId = rows.length > 0 ? Math.max(...rows.map(r => Number(r.id) || 0)) : safeSinceId;

  return {
    ok: true,
    count: dedupedRows.length,
    raw_count: rows.length,
    since_id: safeSinceId,
    max_id: maxId,
    records: dedupedRows
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

  // 🛡️ STRICT DEDUPLICATION: ដក Tracking Number ណាដែលជាន់គ្នាក្នុង Batch ចេញ
  const seenTrk = new Set();
  const dedupedRows = [];
  for (const r of rows) {
    const trk = r.tracking_number ? String(r.tracking_number).trim().toUpperCase() : '';
    if (!trk) continue;
    if (seenTrk.has(trk)) continue;
    seenTrk.add(trk);
    dedupedRows.push(r);
  }

  return {
    ok: true,
    count: dedupedRows.length,
    offset: safeOffset,
    limit: safeLimit,
    records: dedupedRows
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

  // 🛡️ STRICT DEDUPLICATION: ដក Tracking Number ណាដែលជាន់គ្នា ឬទទេចេញ មុននឹងបញ្ជូនទៅ Google Sheets
  const seenTrk = new Set();
  const uniqueRows = [];
  for (const r of rows || []) {
    const trk = r.tracking_number ? String(r.tracking_number).trim().toUpperCase() : '';
    if (!trk) continue;
    if (seenTrk.has(trk)) continue;
    seenTrk.add(trk);
    uniqueRows.push(r);
  }

  const payload = {
    action: 'sync_pod_backup',
    spreadsheetId: spreadsheetId || process.env.VITE_POD_BACKUP_SHEET_ID || '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ',
    sheetName: sheetName || process.env.VITE_POD_BACKUP_SHEET_NAME || 'ialsystems_backup_pod',
    mode,
    isFirstBatch,
    rows: uniqueRows
  };

  try {
    const res = await fetchGoogleScript(targetUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      timeout: 60000
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
/**
 * Adds a Server-Timing header (DevTools → Network → Timing) that splits the server time into
 * db (first query start → last query end), app (everything else: auth, processing, JSON) and total.
 */
export default async function handler(req, res) {
  const t0 = performance.now();
  const st = { queries: 0, dbStart: null, dbEnd: 0, coldPool: false };
  const end = res.end;
  res.end = function (...args) {
    if (!res.headersSent) {
      const total = performance.now() - t0;
      const db = st.dbStart === null ? 0 : st.dbEnd - st.dbStart;
      res.setHeader('Server-Timing', [
        `db;dur=${db.toFixed(1)};desc="${st.queries} queries${st.coldPool ? ', new pool' : ''}"`,
        `app;dur=${Math.max(0, total - db).toFixed(1)};desc="auth+processing+JSON"`,
        `total;dur=${total.toFixed(1)}`,
      ].join(', '));
    }
    return end.apply(this, args);
  };
  return requestTiming.run(st, () => remoteMySqlHandler(req, res));
}

/** email → { at, scope }: current data scope ('ALL' | 'OWN') from tbl_permissions, cached for 30 s. */
const scopeCache = new Map();
const SCOPE_CACHE_MS = 30 * 1000;

/**
 * Sets viewOnlyOwn on the token's user from the data scope saved in tbl_permissions.
 * Users without a row (e.g. master admins from the environment) keep what their token says,
 * and a database error never blocks the request.
 */
export async function applyCurrentPermissions(user) {
  const email = String(user?.email || '').toLowerCase().trim();
  if (!email) return;
  let entry = scopeCache.get(email);
  if (!entry || Date.now() - entry.at > SCOPE_CACHE_MS) {
    try {
      const { rows } = await executeQuery(
        'SELECT data_scope FROM tbl_permissions WHERE LOWER(TRIM(email)) = ? LIMIT 1',
        [email]
      );
      entry = { at: Date.now(), scope: rows[0]?.data_scope ? String(rows[0].data_scope).toUpperCase() : null };
      scopeCache.set(email, entry);
    } catch (err) {
      console.warn('[Permissions] could not read current data scope, using the token:', err?.code || err?.message);
      return;
    }
  }
  if (entry.scope === 'OWN' || entry.scope === 'ALL') user.viewOnlyOwn = entry.scope === 'OWN';
}

async function remoteMySqlHandler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  const rawUrl = req.originalUrl || req.url || '/';
  const url = new URL(rawUrl, 'http://localhost');
  const action = url.searchParams.get('action') || (req.body && req.body.action) || 'test';

  // Google Apps Script in the Data Report sheet: no login, guarded by SHEET_SYNC_SECRET
  if (action === 'data_report_db_hook') {
    const { handleDataReportHook } = await import('./data-report-db.js');
    const [status, payload] = await handleDataReportHook(req, url);
    res.statusCode = status;
    res.end(JSON.stringify(payload));
    return;
  }

  if (!req.user && action !== 'test') {
    authenticateRequest(req, res);
    if (!req.user) return;
  }

  // The login token keeps the role / data scope from login time (valid 12 h). Use the current
  // values saved in tbl_permissions, so an admin's change applies without logging in again.
  if (req.user) await applyCurrentPermissions(req.user);

  // Customer Details page (tbl_customers)
  if (['get_customers', 'get_customer_options', 'get_sale_users', 'save_customer', 'import_customers', 'delete_customer', 'delete_customers'].includes(action)) {
    const { handleCustomerAction } = await import('./customers.js');
    const [status, payload] = await handleCustomerAction(req, action);
    res.statusCode = status;
    res.end(JSON.stringify(payload));
    return;
  }

  // Meterial_Office page (tbl_meterial_office): vehicles / fuel cards CRUD
  if (action.startsWith('meterial_office_')) {
    const { handleMeterialOfficeAction } = await import('./meterial-office.js');
    const [status, payload] = await handleMeterialOfficeAction(req, action);
    res.statusCode = status;
    res.end(JSON.stringify(payload));
    return;
  }

  // Internal Regulations page (tbl_internal_regulations): everyone reads, ADMIN edits
  if (action.startsWith('regulations_')) {
    const { handleRegulationsAction } = await import('./regulations.js');
    const [status, payload] = await handleRegulationsAction(req, action);
    res.statusCode = status;
    res.end(JSON.stringify(payload));
    return;
  }

  // Invoice Handover page (tbl_invoice_handovers, photos in Google Drive)
  if (action.startsWith('invoice_handover_')) {
    const { handleInvoiceHandoverAction } = await import('./invoice-handovers.js');
    const [status, payload] = await handleInvoiceHandoverAction(req, action, url);
    res.statusCode = status;
    res.end(JSON.stringify(payload));
    return;
  }

  // Rider run results (Out of Delivery): read-only lookup of POD + Hold / Return scans
  if (action === 'get_delivery_outcomes') {
    try {
      const { getDeliveryOutcomes } = await import('./delivery-outcomes.js');
      const data = await getDeliveryOutcomes(req.body || {});
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, data }));
    } catch (e) {
      res.statusCode = e.status || 500;
      res.end(JSON.stringify({ ok: false, message: e.message }));
    }
    return;
  }

  // Google Sheets copied into MySQL: Data Report (tbl_data_report) and the Payment Collection
  // sheet Sort_pending (tbl_data_bm)
  if (action.startsWith('data_report_db_') || action.startsWith('sheet_db_')) {
    const { handleDataReportDbAction } = await import('./data-report-db.js');
    const [status, payload] = await handleDataReportDbAction(req, action, url);
    res.statusCode = status;
    res.end(JSON.stringify(payload));
    return;
  }

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
        const sectionsParam = (url.searchParams.get('sections') || '').trim();
        const sections = sectionsParam ? sectionsParam.split(',').map((s) => s.trim()).filter(Boolean) : null;
        const result = await getAllMasterData(pool, req.user, sections);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (action === 'master_version') {
        const { version, sections } = await masterHandlers.getMasterDataVersion(getMySQLPool());
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, version, sections }));
        return;
      }

      if (action === 'get_batches') {
        const pool = getMySQLPool();
        const { getBatchesFromMySQL } = await import('./mysql-master-handlers.js');
        const data = await getBatchesFromMySQL(pool, 300, req.user);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_medicine_batches') {
        const pool = getMySQLPool();
        const { getMedicineBatchesFromMySQL } = await import('./mysql-master-handlers.js');
        const data = await getMedicineBatchesFromMySQL(pool, 300, req.user);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_cod_batches') {
        const pool = getMySQLPool();
        const data = await masterHandlers.getCodBatchesFromMySQL(pool, req.user);
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
        const data = await getPermissionsFromMySQL(pool, req.user);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_bank_slips') {
        const pool = getMySQLPool();
        const { getBankSlipsFromMySQL } = await import('./mysql-master-handlers.js');
        const data = await getBankSlipsFromMySQL(pool, req.user);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_distribution_reports') {
        const pool = getMySQLPool();
        const { getDistributionReportsFromMySQL } = await import('./mysql-master-handlers.js');
        const data = await getDistributionReportsFromMySQL(pool, req.user);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_warehouse_scans') {
        const pool = getMySQLPool();
        const { getWarehouseScansFromMySQL } = await import('./mysql-master-handlers.js');
        const data = await getWarehouseScansFromMySQL(pool, req.user);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      if (action === 'get_user_logs') {
        // Audit trail of every user's actions: Admin only
        if ((req.user?.role || '').toUpperCase() !== 'ADMIN') {
          res.statusCode = 403;
          res.end(JSON.stringify({ ok: false, message: 'Forbidden: Admin privilege required' }));
          return;
        }
        const limit = parseInt(url.searchParams.get('limit') || '2000', 10);
        const data = await masterHandlers.getUserLogsFromMySQL(getMySQLPool(), limit);
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

      if (action === 'get_sheet_max_id') {
        const spreadsheetId = url.searchParams.get('spreadsheetId') || process.env.VITE_POD_BACKUP_SHEET_ID || '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ';
        const sheetName = url.searchParams.get('sheetName') || process.env.VITE_POD_BACKUP_SHEET_NAME || 'ialsystems_backup_pod';
        const webAppUrl = url.searchParams.get('webAppUrl') || process.env.VITE_POD_BACKUP_WEBAPP_URL || '';
        const result = await getGoogleSheetMaxId({ spreadsheetId, sheetName, webAppUrl });
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
          const pingRes = await fetchGoogleScript(pingUrl, { timeout: 20000 });
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

      // Admin-only operations protection
      const adminOnlyActions = [
        'delete_all_batches',
        'delete_all_medicine_batches',
        'delete_all_cod_batches',
        'clear_all_warehouse_scans',
        'save_permission',
        'delete_permission',
        'save_settings'
      ];

      if (adminOnlyActions.includes(postAction)) {
        const role = (req.user?.role || '').toUpperCase();
        if (role !== 'ADMIN') {
          res.statusCode = 403;
          res.end(JSON.stringify({ ok: false, message: 'Forbidden: Admin privilege required' }));
          return;
        }
      }

      if (postAction === 'save_batch' || postAction === 'save_medicine_batch') {
        const isMedicine = postAction === 'save_medicine_batch';
        const batch = body.batch;
        const batchId = (batch?.batchNumber || batch?.id || '').trim();

        if (req.user && req.user.role !== 'ADMIN') {
          if (req.user.canCreate === false && req.user.canEdit === false) {
            res.statusCode = 403;
            res.end(JSON.stringify({ ok: false, message: 'Forbidden: You do not have permission to save batches' }));
            return;
          }
          if (req.user.viewOnlyOwn && batchId) {
            const table = isMedicine ? 'tbl_medicine_batches' : 'tbl_batches';
            try {
              const [existing] = await pool.query(`SELECT operator FROM ${table} WHERE batch_id = ?`, [batchId]);
              if (existing && existing.length > 0) {
                const op = existing[0].operator;
                const allowedIds = [req.user.name, req.user.email].filter(Boolean);
                if (op && !allowedIds.includes(op)) {
                  res.statusCode = 403;
                  res.end(JSON.stringify({ ok: false, message: 'Forbidden: Cannot edit batches belonging to other operators' }));
                  return;
                }
              }
            } catch (err) {
              console.warn('[remote-mysql] Ownership check warning:', err.message);
            }
          }
          if (batch && !batch.operator && (req.user.name || req.user.email)) {
            batch.operator = req.user.name || req.user.email;
          }
        }

        const result = await masterHandlers.saveBatchToMySQL(pool, body.batch, isMedicine, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_batch' || postAction === 'delete_medicine_batch') {
        const isMedicine = postAction === 'delete_medicine_batch';
        const batchNumber = body.batchNumber || body.id;

        if (req.user && req.user.role !== 'ADMIN') {
          if (req.user.canDelete === false) {
            res.statusCode = 403;
            res.end(JSON.stringify({ ok: false, message: 'Forbidden: You do not have permission to delete batches' }));
            return;
          }
          if (req.user.viewOnlyOwn && batchNumber) {
            const table = isMedicine ? 'tbl_medicine_batches' : 'tbl_batches';
            try {
              const [existing] = await pool.query(`SELECT operator FROM ${table} WHERE batch_id = ?`, [batchNumber]);
              if (existing && existing.length > 0) {
                const op = existing[0].operator;
                const allowedIds = [req.user.name, req.user.email].filter(Boolean);
                if (op && !allowedIds.includes(op)) {
                  res.statusCode = 403;
                  res.end(JSON.stringify({ ok: false, message: 'Forbidden: Cannot delete batches belonging to other operators' }));
                  return;
                }
              }
            } catch (err) {
              console.warn('[remote-mysql] Ownership check warning:', err.message);
            }
          }
        }

        const result = await masterHandlers.deleteBatchFromMySQL(pool, batchNumber, isMedicine, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'save_cod_batch') {
        const batch = body.batch;
        const batchId = (batch?.batchNumber || batch?.id || '').trim();

        if (req.user && req.user.role !== 'ADMIN') {
          if (req.user.canCreate === false && req.user.canEdit === false) {
            res.statusCode = 403;
            res.end(JSON.stringify({ ok: false, message: 'Forbidden: You do not have permission to save batches' }));
            return;
          }
          if (req.user.viewOnlyOwn && batchId) {
            try {
              const [existing] = await pool.query('SELECT operator, operator_email FROM tbl_cod_collections WHERE batch_id = ? LIMIT 1', [batchId]);
              if (existing && existing.length > 0) {
                const allowedIds = [req.user.name, req.user.email].filter(Boolean);
                const isOwner = allowedIds.includes(existing[0].operator) || allowedIds.includes(existing[0].operator_email);
                if (!isOwner) {
                  res.statusCode = 403;
                  res.end(JSON.stringify({ ok: false, message: 'Forbidden: Cannot edit batches belonging to other operators' }));
                  return;
                }
              }
            } catch (err) {
              console.warn('[remote-mysql] Ownership check warning:', err.message);
            }
          }
          if (batch) {
            if (!batch.operator && req.user.name) batch.operator = req.user.name;
            if (!batch.operatorEmail && req.user.email) batch.operatorEmail = req.user.email;
          }
        }

        const result = await masterHandlers.saveCodBatchToMySQL(pool, body.batch, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'delete_cod_batch') {
        const batchNumber = body.batchNumber || body.id;

        if (req.user && req.user.role !== 'ADMIN') {
          if (req.user.canDelete === false) {
            res.statusCode = 403;
            res.end(JSON.stringify({ ok: false, message: 'Forbidden: You do not have permission to delete batches' }));
            return;
          }
          if (req.user.viewOnlyOwn && batchNumber) {
            try {
              const [existing] = await pool.query('SELECT operator, operator_email FROM tbl_cod_collections WHERE batch_id = ? LIMIT 1', [batchNumber]);
              if (existing && existing.length > 0) {
                const allowedIds = [req.user.name, req.user.email].filter(Boolean);
                const isOwner = allowedIds.includes(existing[0].operator) || allowedIds.includes(existing[0].operator_email);
                if (!isOwner) {
                  res.statusCode = 403;
                  res.end(JSON.stringify({ ok: false, message: 'Forbidden: Cannot delete batches belonging to other operators' }));
                  return;
                }
              }
            } catch (err) {
              console.warn('[remote-mysql] Ownership check warning:', err.message);
            }
          }
        }

        const result = await masterHandlers.deleteCodBatchFromMySQL(pool, batchNumber, body.webAppUrl);
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
        const result = await masterHandlers.saveWarehouseScanToMySQL(pool, body.items || body.scan, body.webAppUrl, {
          canApproveReturns: !req.user || (req.user.role || '').toUpperCase() === 'ADMIN'
        });
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

      // Rebuild the «Distribution_Reports» sheet from every MySQL row (see syncDistributionReportsToSheet)
      if (postAction === 'sync_distribution_sheet') {
        const result = await masterHandlers.syncDistributionReportsToSheet(pool, body.webAppUrl);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }

      if (postAction === 'daily_summary_lock') {
        const result = await masterHandlers.dailySummaryLockInMySQL(pool, body.op, body.date);
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

      if (postAction === 'deduplicate_pod_sheet') {
        const targetUrl = body.webAppUrl || process.env.VITE_POD_BACKUP_WEBAPP_URL || process.env.VITE_GOOGLE_WEBAPP_URL || '';
        if (!targetUrl) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, message: 'Missing Google Apps Script Web App URL' }));
          return;
        }
        try {
          const resGAS = await fetchGoogleScript(targetUrl.trim(), {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'deduplicate_pod_sheet',
              spreadsheetId: body.spreadsheetId || process.env.VITE_POD_BACKUP_SHEET_ID || '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ',
              sheetName: body.sheetName || process.env.VITE_POD_BACKUP_SHEET_NAME || 'ialsystems_backup_pod'
            }),
            timeout: 45000
          });
          const resJson = await resGAS.json();
          res.statusCode = resGAS.ok ? 200 : 400;
          res.end(JSON.stringify(resJson));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, message: e.message }));
        }
        return;
      }

      if (postAction === 'auto_sync_new_pod') {
        let sinceId = parseInt(body.sinceId || '0', 10);
        const spreadsheetId = body.spreadsheetId || process.env.VITE_POD_BACKUP_SHEET_ID || '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ';
        const sheetName = body.sheetName || process.env.VITE_POD_BACKUP_SHEET_NAME || 'ialsystems_backup_pod';
        const webAppUrl = body.webAppUrl || process.env.VITE_POD_BACKUP_WEBAPP_URL || '';

        // បើសិនជា sinceId មិនទាន់មាន ឬ <= 0 ត្រូវទាញយក Max ID ពិតប្រាកដពី Google Sheet (ialsystems_backup_pod) ជាមុនសិន
        if (!sinceId || sinceId <= 0) {
          const sheetMaxRes = await getGoogleSheetMaxId({ spreadsheetId, sheetName, webAppUrl });
          if (sheetMaxRes.ok && sheetMaxRes.sheet_max_id > 0) {
            sinceId = sheetMaxRes.sheet_max_id;
          }
        }

        const limit = Math.min(Math.max(1, parseInt(body.limit || '300', 10)), 1000);
        const chunkSize = Math.min(Math.max(20, parseInt(body.chunkSize || '100', 10)), 300);

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

        // បែងចែកជាកញ្ចប់តូចៗ (Chunks ឧ. ១០០ ជួរក្នុងមួយ Batch) ដើម្បីបញ្ជូនទៅ Google Sheets យ៉ាងលឿន ស្រាល និងមិនគាំង Sheet
        const records = newRecordsRes.records;
        let totalSuccessfullySynced = 0;
        let highestSyncedId = sinceId;
        const chunks = [];
        for (let i = 0; i < records.length; i += chunkSize) {
          chunks.push(records.slice(i, i + chunkSize));
        }

        for (let c = 0; c < chunks.length; c++) {
          const chunk = chunks[c];
          const syncResult = await syncPodBatchToGoogleSheets({
            webAppUrl,
            rows: chunk,
            mode: 'append',
            isFirstBatch: false,
            spreadsheetId,
            sheetName
          });

          if (!syncResult.ok) {
            if (totalSuccessfullySynced > 0) {
              res.statusCode = 200;
              res.end(JSON.stringify({
                ok: true,
                partial: true,
                synced_count: totalSuccessfullySynced,
                previous_id: sinceId,
                new_max_id: highestSyncedId,
                message: `✓ បានបន្ថែមទិន្នន័យ Delivered ថ្មី ${totalSuccessfullySynced} ជួរ (តែបានផ្អាកត្រឹម ID #${highestSyncedId}: ${syncResult.message})`
              }));
              return;
            }

            res.statusCode = 400;
            res.end(JSON.stringify({
              ok: false,
              message: `មិនអាចបញ្ជូនទៅ Google Sheets: ${syncResult.message || 'Unknown error'}`,
              details: syncResult
            }));
            return;
          }

          totalSuccessfullySynced += chunk.length;
          const chunkMax = Math.max(...chunk.map(r => Number(r.id) || 0));
          if (chunkMax > highestSyncedId) highestSyncedId = chunkMax;
        }

        res.statusCode = 200;
        res.end(JSON.stringify({
          ok: true,
          synced_count: totalSuccessfullySynced,
          previous_id: sinceId,
          new_max_id: highestSyncedId,
          chunks: chunks.length,
          message: `✓ បាន Sync កញ្ចប់ Delivered ថ្មីចំនួន ${totalSuccessfullySynced} (${chunks.length} កញ្ចប់តូច) ទៅ Google Sheets! (ID #${sinceId + 1} - #${highestSyncedId})`
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
