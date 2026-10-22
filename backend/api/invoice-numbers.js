/**
 * Invoice Numbers (លេខវិក័យប័ត្រ) — printed invoice numbers handed out to customers and staff.
 *
 * Stored ONLY in the PostgreSQL database on this machine (not Hostinger), so the page works
 * when the app runs on this PC or is opened over the LAN. On Vercel there is no such database.
 *
 * Connection: INVOICE_PG_* env vars, falling back to the PG_* ones in backend/.env.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

try {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {
  /* no .env */
}

const env = (name, fallback) => process.env[`INVOICE_${name}`] || process.env[name] || fallback;

// PREPARED = printed and kept in stock, ISSUED = handed to a customer / staff member
export const INVOICE_STATUSES = ['PREPARED', 'ISSUED', 'CANCELLED'];
const MAX_BATCH = 2000;

let pool = null;
function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      host: env('PG_HOST', 'localhost'),
      port: parseInt(env('PG_PORT', '5432'), 10),
      user: env('PG_USER', 'postgres'),
      password: env('PG_PASSWORD', ''),
      database: env('PG_DATABASE', 'ialsystems_backup'),
      client_encoding: 'UTF8',
      // Starting parallel workers costs more than these small queries save (especially on Windows)
      options: '-c max_parallel_workers_per_gather=0',
      connectionTimeoutMillis: 5000,
      // Keep connections open: opening a new one takes ~100 ms
      idleTimeoutMillis: 10 * 60 * 1000,
      min: 2,
      max: 10,
    });
    pool.on('error', (err) => {
      console.warn('[Invoice Numbers PG] pool error:', err.message);
      pool = null;
    });
  }
  return pool;
}

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = getPool()
      .query(`
        CREATE TABLE IF NOT EXISTS tbl_invoice_numbers (
          id SERIAL PRIMARY KEY,
          tracking VARCHAR(100) NOT NULL UNIQUE,
          customer VARCHAR(255),
          province VARCHAR(255),
          name_prepare VARCHAR(150),
          "date" DATE,
          status VARCHAR(30) NOT NULL DEFAULT 'PREPARED',
          created_by VARCHAR(150),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_by VARCHAR(150),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_invoice_numbers_date ON tbl_invoice_numbers ("date" DESC);
        CREATE INDEX IF NOT EXISTS idx_invoice_numbers_status ON tbl_invoice_numbers (status);
        ALTER TABLE tbl_invoice_numbers ADD COLUMN IF NOT EXISTS issued_date DATE;
        ALTER TABLE tbl_invoice_numbers ADD COLUMN IF NOT EXISTS issued_by VARCHAR(150);
        ALTER TABLE tbl_invoice_numbers ALTER COLUMN status SET DEFAULT 'PREPARED';
        -- Match the list's sort order exactly, so a page is read straight from the index instead of sorting every row
        CREATE INDEX IF NOT EXISTS idx_invoice_numbers_sort ON tbl_invoice_numbers ("date" DESC NULLS LAST, id DESC);
        CREATE INDEX IF NOT EXISTS idx_invoice_numbers_status_sort ON tbl_invoice_numbers (status, "date" DESC NULLS LAST, id DESC);
        UPDATE tbl_invoice_numbers SET status = 'PREPARED' WHERE status = 'UNUSED';
        UPDATE tbl_invoice_numbers SET status = 'ISSUED' WHERE status = 'USED';
      `)
      .then(async () => {
        // Fast "contains" search on large tables. Needs the pg_trgm extension; search still works without it.
        try {
          await getPool().query(`
            CREATE EXTENSION IF NOT EXISTS pg_trgm;
            CREATE INDEX IF NOT EXISTS idx_invoice_numbers_tracking_trgm ON tbl_invoice_numbers USING GIN (tracking gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS idx_invoice_numbers_customer_trgm ON tbl_invoice_numbers USING GIN (customer gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS idx_invoice_numbers_province_trgm ON tbl_invoice_numbers USING GIN (province gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS idx_invoice_numbers_prepare_trgm ON tbl_invoice_numbers USING GIN (name_prepare gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS idx_invoice_numbers_issuedby_trgm ON tbl_invoice_numbers USING GIN (issued_by gin_trgm_ops);
            ANALYZE tbl_invoice_numbers;
          `);
        } catch (err) {
          console.warn('[Invoice Numbers] trigram index skipped:', err.message);
        }
      })
      .catch((err) => {
        tableReady = null; // retry on next request
        throw err;
      });
  }
  return tableReady;
}

const SELECT_COLS = `id, tracking, customer, province, name_prepare AS "namePrepare",
  to_char("date", 'YYYY-MM-DD') AS "date", status,
  to_char(issued_date, 'YYYY-MM-DD') AS "issuedDate", issued_by AS "issuedBy", created_by AS "createdBy",
  created_at AS "createdAt", updated_by AS "updatedBy", updated_at AS "updatedAt"`;

const clean = (v, max = 255) => String(v ?? '').trim().slice(0, max);
const cleanDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const cleanStatus = (v) => (INVOICE_STATUSES.includes(String(v || '').toUpperCase()) ? String(v).toUpperCase() : 'PREPARED');
const userName = (u) => clean(u?.name || u?.email || 'User', 150);
const isAdmin = (u) => String(u?.role || '').toUpperCase() === 'ADMIN';

// The day a row is filtered by: the issue day for issued numbers, otherwise the prepare day
const DAY_EXPR = `CASE WHEN status = 'ISSUED' THEN COALESCE(issued_date, "date") ELSE "date" END`;

/** WHERE clause for search + dates (+ status unless withStatus is false). */
function buildFilter(q, withStatus = true) {
  const where = [];
  const args = [];
  const add = (sql, v) => {
    args.push(v);
    where.push(sql.replace('?', `$${args.length}`));
  };
  const search = clean(q.search, 100);
  if (search) {
    args.push(`%${search}%`);
    const p = `$${args.length}`;
    where.push(`(tracking ILIKE ${p} OR customer ILIKE ${p} OR province ILIKE ${p} OR name_prepare ILIKE ${p} OR issued_by ILIKE ${p})`);
  }
  if (withStatus && q.status && INVOICE_STATUSES.includes(String(q.status).toUpperCase())) add('status = ?', String(q.status).toUpperCase());
  if (cleanDate(q.startDate)) add(`${DAY_EXPR} >= ?`, q.startDate);
  if (cleanDate(q.endDate)) add(`${DAY_EXPR} <= ?`, q.endDate);
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

/** One page of rows, the total for the current filter, and per-status counts (ignoring the status filter). */
async function listInvoices(q) {
  const pageSize = Math.min(Math.max(parseInt(q.pageSize, 10) || 100, 1), 500);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const f = buildFilter(q);
  const fc = buildFilter(q, false);
  const [rowsRes, countRes] = await Promise.all([
    getPool().query(
      `SELECT ${SELECT_COLS} FROM tbl_invoice_numbers ${f.sql}
       ORDER BY tbl_invoice_numbers."date" DESC NULLS LAST, tbl_invoice_numbers.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      f.args
    ),
    getPool().query(`SELECT status, COUNT(*)::int AS n FROM tbl_invoice_numbers ${fc.sql} GROUP BY status`, fc.args),
  ]);
  const counts = { ALL: 0 };
  INVOICE_STATUSES.forEach((s) => (counts[s] = 0));
  countRes.rows.forEach((r) => {
    counts[r.status] = r.n;
    counts.ALL += r.n;
  });
  const st = String(q.status || '').toUpperCase();
  const total = INVOICE_STATUSES.includes(st) ? counts[st] : counts.ALL;
  return { rows: rowsRes.rows, total, counts, page, pageSize };
}

/** Saved rows for the given numbers (used to check scans and imports). */
async function lookupInvoices(body) {
  const trackings = readTrackings(body, 20000);
  const { rows } = await getPool().query(
    `SELECT tracking, status, customer, name_prepare AS "namePrepare", to_char("date", 'YYYY-MM-DD') AS "date"
     FROM tbl_invoice_numbers WHERE tracking = ANY($1::text[])`,
    [trackings]
  );
  return rows;
}

/** Every row matching the filter, for CSV export. */
async function exportInvoices(q) {
  const f = buildFilter(q);
  const { rows } = await getPool().query(
    `SELECT tracking, customer, province, name_prepare AS "namePrepare", to_char("date", 'YYYY-MM-DD') AS "date", status,
       to_char(issued_date, 'YYYY-MM-DD') AS "issuedDate", issued_by AS "issuedBy"
     FROM tbl_invoice_numbers ${f.sql} ORDER BY tbl_invoice_numbers."date" DESC NULLS LAST, tbl_invoice_numbers.id DESC LIMIT 500000`,
    f.args
  );
  return rows;
}

function readTrackings(body, max = MAX_BATCH) {
  const trackings = [...new Set((Array.isArray(body.trackings) ? body.trackings : [body.tracking])
    .map((t) => clean(t, 100).toUpperCase())
    .filter(Boolean))];
  if (trackings.length === 0) throw Object.assign(new Error('សូមបញ្ចូលលេខ TRACKING'), { status: 400 });
  if (trackings.length > max) throw Object.assign(new Error(`អាចបញ្ចូលបានច្រើនបំផុត ${max} លេខក្នុងមួយដង`), { status: 400 });
  return trackings;
}

/** Step 1 — adds printed numbers to stock (PREPARED). Numbers that already exist are skipped and reported. */
async function createInvoices(body, user) {
  const trackings = readTrackings(body);

  const by = userName(user);
  const { rows } = await getPool().query(
    `INSERT INTO tbl_invoice_numbers (tracking, customer, province, name_prepare, "date", status, created_by, updated_by)
     SELECT t, $2, $3, $4, $5, $6, $7, $7 FROM unnest($1::text[]) AS t
     ON CONFLICT (tracking) DO NOTHING
     RETURNING ${SELECT_COLS}`,
    [trackings, clean(body.customer), clean(body.province), clean(body.namePrepare, 150), cleanDate(body.date), cleanStatus(body.status), by]
  );
  const added = new Set(rows.map((r) => r.tracking));
  return { added: rows, duplicates: trackings.filter((t) => !added.has(t)) };
}

/**
 * Step 2 — hands PREPARED numbers to a customer / staff member (ISSUED).
 * Numbers that are missing, already issued or cancelled are skipped and reported with their state.
 */
async function issueInvoices(body, user) {
  const trackings = readTrackings(body);
  const customer = clean(body.customer);
  if (!customer) throw Object.assign(new Error('សូមបញ្ចូលឈ្មោះអ្នកទទួល (CUSTOMER)'), { status: 400 });
  const { rows } = await getPool().query(
    `UPDATE tbl_invoice_numbers SET customer = $2, province = $3, issued_date = $4, issued_by = $5,
       status = 'ISSUED', updated_by = $5, updated_at = NOW()
     WHERE tracking = ANY($1::text[]) AND status = 'PREPARED'
     RETURNING ${SELECT_COLS}`,
    [trackings, customer, clean(body.province), cleanDate(body.issuedDate), userName(user)]
  );
  const done = new Set(rows.map((r) => r.tracking));
  const left = trackings.filter((t) => !done.has(t));
  let skipped = [];
  if (left.length > 0) {
    const { rows: found } = await getPool().query(
      'SELECT tracking, status, customer FROM tbl_invoice_numbers WHERE tracking = ANY($1::text[])',
      [left]
    );
    const byTracking = new Map(found.map((r) => [r.tracking, r]));
    skipped = left.map((t) => {
      const r = byTracking.get(t);
      return { tracking: t, status: r ? r.status : 'NOT_FOUND', customer: r?.customer || null };
    });
  }
  return { issued: rows, skipped };
}

/**
 * Import of old records (from Excel/CSV). Each row keeps its own status and dates.
 * Existing numbers are skipped, or overwritten when body.overwrite is true.
 */
const MAX_IMPORT = 5000;
async function importInvoices(body, user) {
  const list = Array.isArray(body.rows) ? body.rows : [];
  if (list.length === 0) throw Object.assign(new Error('គ្មានទិន្នន័យសម្រាប់នាំចូល'), { status: 400 });
  if (list.length > MAX_IMPORT) throw Object.assign(new Error(`អាចនាំចូលបានច្រើនបំផុត ${MAX_IMPORT} ជួរក្នុងមួយដង`), { status: 400 });
  const seen = new Set();
  const cols = { tracking: [], customer: [], province: [], namePrepare: [], date: [], status: [], issuedDate: [], issuedBy: [] };
  for (const r of list) {
    const tracking = clean(r?.tracking, 100).toUpperCase();
    if (!tracking || seen.has(tracking)) continue;
    seen.add(tracking);
    cols.tracking.push(tracking);
    cols.customer.push(clean(r.customer));
    cols.province.push(clean(r.province));
    cols.namePrepare.push(clean(r.namePrepare, 150));
    cols.date.push(cleanDate(r.date));
    cols.status.push(cleanStatus(r.status));
    cols.issuedDate.push(cleanDate(r.issuedDate));
    cols.issuedBy.push(clean(r.issuedBy, 150) || null);
  }
  const by = userName(user);
  const onConflict = body.overwrite
    ? `ON CONFLICT (tracking) DO UPDATE SET customer = EXCLUDED.customer, province = EXCLUDED.province,
         name_prepare = EXCLUDED.name_prepare, "date" = EXCLUDED."date", status = EXCLUDED.status,
         issued_date = EXCLUDED.issued_date, issued_by = COALESCE(EXCLUDED.issued_by, tbl_invoice_numbers.issued_by),
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`
    : 'ON CONFLICT (tracking) DO NOTHING';
  const { rows } = await getPool().query(
    `INSERT INTO tbl_invoice_numbers (tracking, customer, province, name_prepare, "date", status, issued_date, issued_by, created_by, updated_by)
     SELECT t.tracking, t.customer, t.province, t.name_prepare, t.d, t.status, t.issued_date, t.issued_by, $9, $9
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::date[], $6::text[], $7::date[], $8::text[])
       AS t(tracking, customer, province, name_prepare, d, status, issued_date, issued_by)
     ${onConflict}
     RETURNING (xmax = 0) AS inserted`,
    [cols.tracking, cols.customer, cols.province, cols.namePrepare, cols.date, cols.status, cols.issuedDate, cols.issuedBy, by]
  );
  const inserted = rows.filter((r) => r.inserted).length;
  return { inserted, updated: rows.length - inserted, skipped: cols.tracking.length - rows.length };
}

async function updateInvoice(body, user) {
  const id = parseInt(body.id, 10);
  if (!id) throw Object.assign(new Error('Missing id'), { status: 400 });
  const tracking = clean(body.tracking, 100).toUpperCase();
  if (!tracking) throw Object.assign(new Error('សូមបញ្ចូលលេខ TRACKING'), { status: 400 });
  try {
    const { rows } = await getPool().query(
      `UPDATE tbl_invoice_numbers SET tracking = $2, customer = $3, province = $4, name_prepare = $5, "date" = $6,
         status = $7, issued_date = $9, updated_by = $8, updated_at = NOW()
       WHERE id = $1 RETURNING ${SELECT_COLS}`,
      [id, tracking, clean(body.customer), clean(body.province), clean(body.namePrepare, 150), cleanDate(body.date), cleanStatus(body.status), userName(user), cleanDate(body.issuedDate)]
    );
    if (!rows[0]) throw Object.assign(new Error('រកមិនឃើញទិន្នន័យនេះទេ (ប្រហែលត្រូវបានលុបរួច)'), { status: 404 });
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw Object.assign(new Error(`លេខ ${tracking} មានរួចហើយ`), { status: 409 });
    throw err;
  }
}

async function deleteInvoices(body) {
  const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map((v) => parseInt(v, 10)).filter(Boolean);
  if (ids.length === 0) throw Object.assign(new Error('Missing id'), { status: 400 });
  const { rowCount } = await getPool().query('DELETE FROM tbl_invoice_numbers WHERE id = ANY($1::int[])', [ids]);
  return { deleted: rowCount };
}

export default async function invoiceNumbersHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const body = req.body || {};
  const q = req.query || {};
  const action = q.action || body.action || 'list';

  try {
    await ensureTable();

    if (req.method === 'GET') {
      if (action === 'list') return res.status(200).json({ ok: true, data: await listInvoices(q) });
      if (action === 'export') return res.status(200).json({ ok: true, data: await exportInvoices(q) });
      return res.status(400).json({ ok: false, message: `Unknown action: ${action}` });
    }

    if (req.method === 'POST') {
      if (action === 'create') return res.status(200).json({ ok: true, data: await createInvoices(body, req.user) });
      if (action === 'lookup') return res.status(200).json({ ok: true, data: await lookupInvoices(body) });
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
    const connErr = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '28P01', '3D000'].includes(err.code) || /timeout/i.test(err.message || '');
    if (connErr) {
      return res.status(503).json({
        ok: false,
        code: 'LOCAL_PG_UNAVAILABLE',
        message: `ភ្ជាប់ PostgreSQL លើម៉ាស៊ីននេះមិនបាន (${err.code || err.message})។ សូមពិនិត្យថា PostgreSQL កំពុងដំណើរការ។`,
      });
    }
    if (!err.status) console.error('[Invoice Numbers] error:', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Server error' });
  }
}
