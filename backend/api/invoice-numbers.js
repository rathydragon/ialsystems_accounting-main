/**
 * Invoice Numbers (លេខវិក័យប័ត្រ) — printed invoice numbers handed out to customers and staff.
 *
 * Stored in Hostinger MySQL (MariaDB), table tbl_invoice_numbers, so the page works from any host.
 * Times are written from Node (not NOW()): the server clock is UTC while the pool reads +07:00.
 */
import { executeQuery, getMySQLPool } from './remote-mysql.js';
import { cleanBarcode, lookupDataReportBarcodes } from './data-report-db.js';

// PREPARED = printed and kept in stock, ISSUED = handed to a customer / staff member
export const INVOICE_STATUSES = ['PREPARED', 'ISSUED', 'CANCELLED'];
const MAX_BATCH = 2000;
const IN_CHUNK = 2000;

const T = 'tbl_invoice_numbers';
const META = 'tbl_invoice_numbers_meta';

/** Runs a query on a connection (inside a transaction) or on the pool. Returns rows / result header. */
async function run(sql, params = [], conn = null) {
  if (conn) {
    const [rows] = await conn.query(sql, params);
    return rows;
  }
  return (await executeQuery(sql, params)).rows;
}

/** Runs fn(conn) in a transaction. */
async function inTransaction(fn) {
  const conn = await getMySQLPool().getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

const chunks = (list, size = IN_CHUNK) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await run(`
        CREATE TABLE IF NOT EXISTS \`${T}\` (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tracking VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
          customer VARCHAR(255) NULL,
          company VARCHAR(255) NULL,
          province VARCHAR(255) NULL,
          name_prepare VARCHAR(150) NULL,
          prep_code VARCHAR(100) NULL,
          \`date\` DATE NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'PREPARED',
          issued_date DATE NULL,
          issued_at DATETIME(3) NULL,
          issued_by VARCHAR(150) NULL,
          created_by VARCHAR(150) NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_by VARCHAR(150) NULL,
          updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          UNIQUE KEY uq_invoice_numbers_tracking (tracking),
          KEY idx_invoice_numbers_sort (\`date\`, id),
          KEY idx_invoice_numbers_status_sort (status, \`date\`, id),
          KEY idx_invoice_numbers_prep_code (prep_code, status),
          KEY idx_invoice_numbers_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      // Change counter for live updates: every write bumps it
      await run(`CREATE TABLE IF NOT EXISTS \`${META}\` (id INT PRIMARY KEY, version BIGINT NOT NULL DEFAULT 0) ENGINE=InnoDB`);
      await run(`INSERT IGNORE INTO \`${META}\` (id, version) VALUES (1, 0)`);
    })().catch((err) => {
      tableReady = null; // retry on next request
      throw err;
    });
  }
  return tableReady;
}

const bumpVersion = (conn = null) => run(`UPDATE \`${META}\` SET version = version + 1 WHERE id = 1`, [], conn);

const SELECT_COLS = `id, tracking, customer, company, province, name_prepare AS namePrepare, prep_code AS prepCode,
  DATE_FORMAT(\`date\`, '%Y-%m-%d') AS \`date\`, status,
  DATE_FORMAT(issued_date, '%Y-%m-%d') AS issuedDate, issued_at AS issuedAt, issued_by AS issuedBy, created_by AS createdBy,
  created_at AS createdAt, updated_by AS updatedBy, updated_at AS updatedAt`;
const LOOKUP_COLS = `tracking, status, customer, name_prepare AS namePrepare, prep_code AS prepCode, DATE_FORMAT(\`date\`, '%Y-%m-%d') AS \`date\``;
const ORDER = 'ORDER BY `date` DESC, id DESC'; // NULL dates sort last with DESC

const clean = (v, max = 255) => String(v ?? '').trim().slice(0, max);
const cleanDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const cleanStatus = (v) => (INVOICE_STATUSES.includes(String(v || '').toUpperCase()) ? String(v).toUpperCase() : 'PREPARED');
const cleanCode = (v) => clean(v, 100).toUpperCase() || null;
const NO_CODE = '__NONE__';
const userName = (u) => clean(u?.name || u?.email || 'User', 150);
const isAdmin = (u) => String(u?.role || '').toUpperCase() === 'ADMIN';
const httpError = (message, status) => Object.assign(new Error(message), { status });

// The day a row is filtered by: the issue day for issued numbers, otherwise the prepare day
const DAY_EXPR = "CASE WHEN status = 'ISSUED' THEN COALESCE(issued_date, `date`) ELSE `date` END";

/** WHERE clause for search + dates (+ status unless withStatus is false). */
function buildFilter(q, withStatus = true) {
  const where = [];
  const args = [];
  const search = clean(q.search, 100);
  if (search) {
    // tracking is compared exactly (binary) and always saved in upper case
    const cols = ['tracking', 'customer', 'company', 'province', 'name_prepare', 'issued_by', 'prep_code'];
    where.push(`(${cols.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    cols.forEach((c) => args.push(c === 'tracking' ? like.toUpperCase() : like));
  }
  if (withStatus && q.status && INVOICE_STATUSES.includes(String(q.status).toUpperCase())) {
    where.push('status = ?');
    args.push(String(q.status).toUpperCase());
  }
  // One prep-code group ('__NONE__' = numbers saved without a code)
  if (q.prepCode === NO_CODE) where.push(`(prep_code IS NULL OR prep_code = '')`);
  else if (q.prepCode) {
    where.push('prep_code = ?');
    args.push(cleanCode(q.prepCode));
  }
  if (cleanDate(q.startDate)) {
    where.push(`${DAY_EXPR} >= ?`);
    args.push(q.startDate);
  }
  if (cleanDate(q.endDate)) {
    where.push(`${DAY_EXPR} <= ?`);
    args.push(q.endDate);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

/** Per-status totals for the search/date filter, ignoring the status filter. */
async function countByStatus(q) {
  const fc = buildFilter(q, false);
  const rows = await run(`SELECT status, COUNT(*) AS n FROM \`${T}\` ${fc.sql} GROUP BY status`, fc.args);
  const counts = { ALL: 0 };
  INVOICE_STATUSES.forEach((s) => (counts[s] = 0));
  rows.forEach((r) => {
    counts[r.status] = Number(r.n);
    counts.ALL += Number(r.n);
  });
  return counts;
}

/** One page of rows, the total for the current filter, and per-status counts (ignoring the status filter). */
async function listInvoices(q) {
  const pageSize = Math.min(Math.max(parseInt(q.pageSize, 10) || 100, 1), 500);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const f = buildFilter(q);
  const [rows, counts] = await Promise.all([
    run(`SELECT ${SELECT_COLS} FROM \`${T}\` ${f.sql} ${ORDER} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, f.args),
    countByStatus(q),
  ]);
  const st = String(q.status || '').toUpperCase();
  // With a prep-code filter the per-status counts don't apply, so count this filter's rows
  let total = INVOICE_STATUSES.includes(st) ? counts[st] : counts.ALL;
  if (q.prepCode) {
    const r = await run(`SELECT COUNT(*) AS n FROM \`${T}\` ${f.sql}`, f.args);
    total = Number(r[0].n);
  }
  return { rows, total, counts, page, pageSize };
}

// True when the column has more than spaces / zero-width characters (some old rows hold only those)
const notBlank = (col) => `REGEXP_REPLACE(COALESCE(${col}, ''), '[[:space:]​‌‍﻿]', '') <> ''`;
const SEP = '\u001F';
/** Up to 3 distinct values of col where cond holds (list), split from GROUP_CONCAT. */
const firstThree = (col, cond) => `GROUP_CONCAT(DISTINCT CASE WHEN ${cond} THEN ${col} END ORDER BY ${col} SEPARATOR '${SEP}')`;
const splitList = (v) => (v ? String(v).split(SEP).slice(0, 3) : []);

/**
 * One page of prep-code groups (newest first; numbers without a code come last as one group),
 * plus the per-status counts for the filter pills.
 */
async function listGroups(q) {
  const pageSize = Math.min(Math.max(parseInt(q.pageSize, 10) || 50, 1), 500);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const f = buildFilter({ ...q, prepCode: '' });
  const issued = "status = 'ISSUED'";
  const [groupRows, counts] = await Promise.all([
    run(
      `SELECT NULLIF(prep_code, '') AS code, COUNT(*) AS count,
         COUNT(CASE WHEN status = 'PREPARED' THEN 1 END) AS prepared,
         COUNT(CASE WHEN status = 'ISSUED' THEN 1 END) AS issued,
         COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) AS cancelled,
         MIN(tracking) AS firstTracking, MAX(tracking) AS lastTracking,
         DATE_FORMAT(MAX(\`date\`), '%Y-%m-%d') AS \`date\`,
         DATE_FORMAT(MAX(issued_date), '%Y-%m-%d') AS issuedDate,
         MAX(issued_at) AS issuedAt,
         ${firstThree('issued_by', `${issued} AND ${notBlank('issued_by')}`)} AS issuers,
         COUNT(DISTINCT CASE WHEN ${issued} AND ${notBlank('issued_by')} THEN issued_by END) AS issuerCount,
         ${firstThree('name_prepare', notBlank('name_prepare'))} AS preparers,
         ${firstThree('customer', `${issued} AND ${notBlank('customer')}`)} AS customers,
         COUNT(DISTINCT CASE WHEN ${issued} AND customer <> '' THEN customer END) AS customerCount,
         ${firstThree('company', `${issued} AND ${notBlank('company')}`)} AS companies,
         COUNT(DISTINCT CASE WHEN ${issued} AND ${notBlank('company')} THEN company END) AS companyCount,
         DATE_FORMAT(MAX(created_at), '%Y-%m-%d %H:%i') AS createdAt,
         COUNT(*) OVER() AS totalGroups
       FROM \`${T}\` ${f.sql}
       GROUP BY code
       ORDER BY (code IS NULL), MAX(created_at) DESC, MAX(id) DESC
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      f.args
    ),
    countByStatus(q),
  ]);
  const total = Number(groupRows[0]?.totalGroups ?? 0);
  const num = ['count', 'prepared', 'issued', 'cancelled', 'issuerCount', 'customerCount', 'companyCount'];
  const groups = groupRows.map(({ totalGroups, ...g }) => {
    num.forEach((k) => (g[k] = Number(g[k] || 0)));
    return { ...g, preparers: splitList(g.preparers), issuers: splitList(g.issuers), customers: splitList(g.customers), companies: splitList(g.companies) };
  });
  return { groups, total, counts, page, pageSize };
}

/** One number's saved row for other modules (Invoice Handover save), or null when missing or slow. */
export async function findInvoiceNumber(tracking, timeoutMs = 4000) {
  const code = clean(tracking, 100).toUpperCase();
  if (!code) return null;
  const query = (async () => {
    await ensureTable();
    const rows = await run(`SELECT ${LOOKUP_COLS} FROM \`${T}\` WHERE tracking = ? LIMIT 1`, [code]);
    return rows[0] || null;
  })();
  query.catch(() => undefined);
  return Promise.race([query, new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))]).catch(() => null);
}

/** Saved rows for the given numbers (used to check scans and imports). */
async function lookupInvoices(body) {
  const trackings = readTrackings(body, 20000);
  const out = [];
  for (const part of chunks(trackings)) {
    out.push(...(await run(`SELECT ${LOOKUP_COLS} FROM \`${T}\` WHERE tracking IN (?)`, [part])));
  }
  return out;
}

/** Every number saved under a prep code (any status), so the page can queue the whole batch for issuing. */
async function lookupPrepCode(body) {
  const code = cleanCode(body.prepCode);
  if (!code) throw httpError('សូមបញ្ចូលកូដរៀបចំ', 400);
  return run(`SELECT ${LOOKUP_COLS} FROM \`${T}\` WHERE prep_code = ? ORDER BY tracking LIMIT ${MAX_BATCH + 1}`, [code]);
}

/**
 * Prep codes not used yet, newest first — suggestions for step 2.
 * A code counts as used once any of its numbers has been issued, so it drops off the list.
 */
async function listPrepCodes() {
  const rows = await run(
    `SELECT prep_code AS code, COUNT(CASE WHEN status = 'PREPARED' THEN 1 END) AS count,
       MAX(name_prepare) AS namePrepare, DATE_FORMAT(MAX(\`date\`), '%Y-%m-%d') AS \`date\`
     FROM \`${T}\` WHERE prep_code IS NOT NULL AND prep_code <> ''
     GROUP BY prep_code
     HAVING COUNT(CASE WHEN status = 'PREPARED' THEN 1 END) > 0 AND COUNT(CASE WHEN status = 'ISSUED' THEN 1 END) = 0
     ORDER BY MAX(\`date\`) DESC, MAX(id) DESC LIMIT 500`
  );
  return rows.map((r) => ({ ...r, count: Number(r.count) }));
}

/** Every row matching the filter, for CSV export. */
async function exportInvoices(q) {
  const f = buildFilter(q);
  return run(
    `SELECT tracking, customer, company, province, name_prepare AS namePrepare, prep_code AS prepCode, DATE_FORMAT(\`date\`, '%Y-%m-%d') AS \`date\`, status,
       DATE_FORMAT(issued_date, '%Y-%m-%d') AS issuedDate, issued_by AS issuedBy
     FROM \`${T}\` ${f.sql} ${ORDER} LIMIT 500000`,
    f.args
  );
}

function readTrackings(body, max = MAX_BATCH) {
  const trackings = [...new Set((Array.isArray(body.trackings) ? body.trackings : [body.tracking])
    .map((t) => clean(t, 100).toUpperCase())
    .filter(Boolean))];
  if (trackings.length === 0) throw httpError('សូមបញ្ចូលលេខ TRACKING', 400);
  if (trackings.length > max) throw httpError(`អាចបញ្ចូលបានច្រើនបំផុត ${max} លេខក្នុងមួយដង`, 400);
  return trackings;
}

/** Step 1 — adds printed numbers to stock (PREPARED). Numbers that already exist are skipped and reported. */
async function createInvoices(body, user) {
  const trackings = readTrackings(body);
  const by = userName(user);
  const now = new Date();
  let prepCode = cleanCode(body.prepCode);

  return inTransaction(async (conn) => {
    // Pick the next IAL_BILL code under a lock, so two PCs saving at once never share a code
    let locked = false;
    if (body.autoPrepCode) {
      const r = await run("SELECT GET_LOCK('tbl_invoice_numbers.prep_code', 15) AS ok", [], conn);
      locked = Number(r[0]?.ok) === 1;
      if (!locked) throw httpError('កំពុងរក្សាទុកពីកុំព្យូទ័រផ្សេង — សូមព្យាយាមម្ដងទៀត', 409);
    }
    try {
      if (body.autoPrepCode) prepCode = await nextPrepCode(conn);
      const existing = new Set((await run(`SELECT tracking FROM \`${T}\` WHERE tracking IN (?)`, [trackings], conn)).map((r) => r.tracking.toUpperCase()));
      const fresh = trackings.filter((t) => !existing.has(t));
      let added = [];
      if (fresh.length) {
        const values = fresh.map((t) => [t, clean(body.customer), clean(body.province), clean(body.namePrepare, 150), cleanDate(body.date), cleanStatus(body.status), by, now, by, now, prepCode]);
        await run(
          `INSERT IGNORE INTO \`${T}\` (tracking, customer, province, name_prepare, \`date\`, status, created_by, created_at, updated_by, updated_at, prep_code) VALUES ?`,
          [values],
          conn
        );
        added = await run(`SELECT ${SELECT_COLS} FROM \`${T}\` WHERE tracking IN (?) AND created_at = ? ORDER BY id`, [fresh, now], conn);
        if (added.length) await bumpVersion(conn);
      }
      const addedSet = new Set(added.map((r) => r.tracking));
      return { added, duplicates: trackings.filter((t) => !addedSet.has(t)), prepCode: added.length ? prepCode : null };
    } finally {
      if (locked) await run("SELECT RELEASE_LOCK('tbl_invoice_numbers.prep_code')", [], conn).catch(() => {});
    }
  });
}

/** Auto prep codes: IAL_BILL000001, IAL_BILL000002, ... (one more than the highest saved). */
const AUTO_CODE_PREFIX = 'IAL_BILL';
async function nextPrepCode(conn = null) {
  const rows = await run(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(prep_code, ${AUTO_CODE_PREFIX.length + 1}) AS UNSIGNED)), 0) AS n
     FROM \`${T}\` WHERE prep_code REGEXP '^${AUTO_CODE_PREFIX}[0-9]+$'`,
    [],
    conn
  );
  return AUTO_CODE_PREFIX + String(Number(rows[0].n) + 1).padStart(6, '0');
}

/**
 * Step 2 — hands PREPARED numbers to a customer / staff member (ISSUED).
 * Numbers that are missing, already issued or cancelled are skipped and reported with their state.
 */
async function issueInvoices(body, user) {
  const trackings = readTrackings(body);
  const customer = clean(body.customer);
  if (!customer) throw httpError('សូមបញ្ចូលឈ្មោះអ្នកទទួល (CUSTOMER)', 400);
  const by = userName(user);
  const now = new Date();

  const issued = await inTransaction(async (conn) => {
    const ids = (await run(`SELECT id FROM \`${T}\` WHERE tracking IN (?) AND status = 'PREPARED' FOR UPDATE`, [trackings], conn)).map((r) => r.id);
    if (!ids.length) return [];
    await run(
      `UPDATE \`${T}\` SET customer = ?, province = ?, issued_date = ?, issued_by = ?, company = ?, status = 'ISSUED',
         issued_at = ?, updated_by = ?, updated_at = ? WHERE id IN (?)`,
      [customer, clean(body.province), cleanDate(body.issuedDate), by, clean(body.company) || null, now, by, now, ids],
      conn
    );
    await bumpVersion(conn);
    return run(`SELECT ${SELECT_COLS} FROM \`${T}\` WHERE id IN (?) ORDER BY id`, [ids], conn);
  });

  const done = new Set(issued.map((r) => r.tracking));
  const left = trackings.filter((t) => !done.has(t));
  let skipped = [];
  if (left.length > 0) {
    const found = await run(`SELECT tracking, status, customer FROM \`${T}\` WHERE tracking IN (?)`, [left]);
    const byTracking = new Map(found.map((r) => [r.tracking.toUpperCase(), r]));
    skipped = left.map((t) => {
      const r = byTracking.get(t);
      return { tracking: t, status: r ? r.status : 'NOT_FOUND', customer: r?.customer || null };
    });
  }
  return { issued, skipped };
}

/**
 * Import of old records (from Excel/CSV). Each row keeps its own status and dates.
 * Existing numbers are skipped, or overwritten when body.overwrite is true.
 */
const MAX_IMPORT = 5000;
async function importInvoices(body, user) {
  const list = Array.isArray(body.rows) ? body.rows : [];
  if (list.length === 0) throw httpError('គ្មានទិន្នន័យសម្រាប់នាំចូល', 400);
  if (list.length > MAX_IMPORT) throw httpError(`អាចនាំចូលបានច្រើនបំផុត ${MAX_IMPORT} ជួរក្នុងមួយដង`, 400);
  const by = userName(user);
  const now = new Date();
  const seen = new Set();
  const values = [];
  for (const r of list) {
    const tracking = clean(r?.tracking, 100).toUpperCase();
    if (!tracking || seen.has(tracking)) continue;
    seen.add(tracking);
    values.push([tracking, clean(r.customer), clean(r.province), clean(r.namePrepare, 150), cleanDate(r.date), cleanStatus(r.status),
      cleanDate(r.issuedDate), clean(r.issuedBy, 150) || null, by, now, by, now]);
  }
  const trackings = values.map((v) => v[0]);

  return inTransaction(async (conn) => {
    let existing = 0;
    for (const part of chunks(trackings)) {
      existing += Number((await run(`SELECT COUNT(*) AS n FROM \`${T}\` WHERE tracking IN (?)`, [part], conn))[0].n);
    }
    const cols = `(tracking, customer, province, name_prepare, \`date\`, status, issued_date, issued_by, created_by, created_at, updated_by, updated_at)`;
    let inserted = 0;
    for (const part of chunks(values, 1000)) {
      const res = body.overwrite
        ? await run(
            `INSERT INTO \`${T}\` ${cols} VALUES ?
             ON DUPLICATE KEY UPDATE customer = VALUES(customer), province = VALUES(province), name_prepare = VALUES(name_prepare),
               \`date\` = VALUES(\`date\`), status = VALUES(status), issued_date = VALUES(issued_date),
               issued_by = COALESCE(VALUES(issued_by), issued_by), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)`,
            [part],
            conn
          )
        : await run(`INSERT IGNORE INTO \`${T}\` ${cols} VALUES ?`, [part], conn);
      if (!body.overwrite) inserted += res.affectedRows;
    }
    if (body.overwrite) {
      inserted = trackings.length - existing;
      await bumpVersion(conn);
      return { inserted, updated: existing, skipped: 0 };
    }
    if (inserted) await bumpVersion(conn);
    return { inserted, updated: 0, skipped: trackings.length - inserted };
  });
}

async function updateInvoice(body, user) {
  const id = parseInt(body.id, 10);
  if (!id) throw httpError('Missing id', 400);
  const tracking = clean(body.tracking, 100).toUpperCase();
  if (!tracking) throw httpError('សូមបញ្ចូលលេខ TRACKING', 400);
  const status = cleanStatus(body.status);
  const now = new Date();
  try {
    return await inTransaction(async (conn) => {
      const res = await run(
        `UPDATE \`${T}\` SET tracking = ?, customer = ?, province = ?, name_prepare = ?, \`date\` = ?,
           status = ?, issued_date = ?, company = ?, prep_code = ?,
           issued_at = CASE WHEN ? = 'ISSUED' THEN COALESCE(issued_at, ?) ELSE NULL END,
           updated_by = ?, updated_at = ?
         WHERE id = ?`,
        [tracking, clean(body.customer), clean(body.province), clean(body.namePrepare, 150), cleanDate(body.date),
          status, cleanDate(body.issuedDate), clean(body.company) || null, cleanCode(body.prepCode),
          status, now, userName(user), now, id],
        conn
      );
      if (!res.affectedRows) throw httpError('រកមិនឃើញទិន្នន័យនេះទេ (ប្រហែលត្រូវបានលុបរួច)', 404);
      await bumpVersion(conn);
      return (await run(`SELECT ${SELECT_COLS} FROM \`${T}\` WHERE id = ?`, [id], conn))[0];
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw httpError(`លេខ ${tracking} មានរួចហើយ`, 409);
    throw err;
  }
}

async function deleteInvoices(body) {
  // Whole batch by prep code (the "no code" group can't be deleted this way)
  if (body.prepCode !== undefined) {
    const code = cleanCode(body.prepCode);
    if (!code) throw httpError('Missing prep code', 400);
    const res = await run(`DELETE FROM \`${T}\` WHERE prep_code = ?`, [code]);
    if (res.affectedRows) await bumpVersion();
    return { deleted: res.affectedRows };
  }
  const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map((v) => parseInt(v, 10)).filter(Boolean);
  if (ids.length === 0) throw httpError('Missing id', 400);
  let deleted = 0;
  for (const part of chunks(ids)) deleted += (await run(`DELETE FROM \`${T}\` WHERE id IN (?)`, [part])).affectedRows;
  if (deleted) await bumpVersion();
  return { deleted };
}

/**
 * Which of these numbers already appear in Data Report (tbl_data_report on Hostinger, live).
 * Returns { used: [tracking, ...], backupAt: null } (backupAt is kept for the page; the data is live).
 */
const MAX_USAGE_CHECK = 5000;
const USAGE_CHUNK = 1000; // lookupDataReportBarcodes reads at most 1000 codes per call
async function checkUsage(body) {
  const list = Array.isArray(body.trackings) ? body.trackings : [];
  const byCode = new Map();
  for (const t of list.slice(0, MAX_USAGE_CHECK)) {
    const code = cleanBarcode(t);
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(String(t));
  }
  const usedCodes = new Set();
  for (const part of chunks([...byCode.keys()], USAGE_CHUNK)) {
    const res = await lookupDataReportBarcodes(part);
    for (const row of res.rows || []) usedCodes.add(row[0]);
  }
  const used = [];
  for (const code of usedCodes) used.push(...(byCode.get(code) || []));
  return { used, backupAt: null };
}

const CONN_ERRORS = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR', 'ER_CON_COUNT_ERROR'];

export default async function invoiceNumbersHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const body = req.body || {};
  const q = req.query || {};
  const action = q.action || body.action || 'list';

  try {
    await ensureTable();

    if (req.method === 'GET') {
      if (action === 'version') {
        const rows = await run(`SELECT version FROM \`${META}\` WHERE id = 1`);
        return res.status(200).json({ ok: true, data: { version: String(rows[0]?.version ?? 0) } });
      }
      if (action === 'list') return res.status(200).json({ ok: true, data: await listInvoices(q) });
      if (action === 'groups') return res.status(200).json({ ok: true, data: await listGroups(q) });
      if (action === 'nextPrepCode') return res.status(200).json({ ok: true, data: { code: await nextPrepCode() } });
      if (action === 'prepCodes') return res.status(200).json({ ok: true, data: await listPrepCodes() });
      if (action === 'export') return res.status(200).json({ ok: true, data: await exportInvoices(q) });
      return res.status(400).json({ ok: false, message: `Unknown action: ${action}` });
    }

    if (req.method === 'POST') {
      if (action === 'create') return res.status(200).json({ ok: true, data: await createInvoices(body, req.user) });
      if (action === 'lookup') return res.status(200).json({ ok: true, data: await lookupInvoices(body) });
      if (action === 'usage') return res.status(200).json({ ok: true, data: await checkUsage(body) });
      if (action === 'lookupPrepCode') return res.status(200).json({ ok: true, data: await lookupPrepCode(body) });
      if (action === 'import') return res.status(200).json({ ok: true, data: await importInvoices(body, req.user) });
      if (action === 'issue') return res.status(200).json({ ok: true, data: await issueInvoices(body, req.user) });
      if (action === 'update') return res.status(200).json({ ok: true, data: await updateInvoice(body, req.user) });
      if (action === 'delete') {
        if (!isAdmin(req.user)) return res.status(403).json({ ok: false, message: 'មានតែ Admin ទេដែលអាចលុបបាន' });
        return res.status(200).json({ ok: true, data: await deleteInvoices(body) });
      }
      return res.status(400).json({ ok: false, message: `Unknown action: ${action}` });
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  } catch (err) {
    if (CONN_ERRORS.includes(err.code) || /timeout/i.test(err.message || '')) {
      return res.status(503).json({
        ok: false,
        code: 'DB_UNAVAILABLE',
        message: `ភ្ជាប់ Hostinger MySQL មិនបាន (${err.code || err.message})។ សូមព្យាយាមម្ដងទៀតបន្តិចទៀត។`,
      });
    }
    if (!err.status) console.error('[Invoice Numbers] error:', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Server error' });
  }
}
