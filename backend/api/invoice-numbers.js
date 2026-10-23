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
        -- Exact moment a number was issued (issued_date keeps only the day).
        -- First run: fill it from updated_at for rows last touched on their issue day.
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'tbl_invoice_numbers' AND column_name = 'issued_at') THEN
            ALTER TABLE tbl_invoice_numbers ADD COLUMN issued_at TIMESTAMPTZ;
            UPDATE tbl_invoice_numbers SET issued_at = updated_at
              WHERE status = 'ISSUED' AND issued_date IS NOT NULL AND updated_at::date = issued_date;
          END IF;
        END $$;
        -- Company / shop the receiver belongs to (optional)
        ALTER TABLE tbl_invoice_numbers ADD COLUMN IF NOT EXISTS company VARCHAR(255);
        -- Batch code given when numbers are prepared, so the whole batch can be issued in one go
        ALTER TABLE tbl_invoice_numbers ADD COLUMN IF NOT EXISTS prep_code VARCHAR(100);
        CREATE INDEX IF NOT EXISTS idx_invoice_numbers_prep_code ON tbl_invoice_numbers (prep_code, status);
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
            CREATE INDEX IF NOT EXISTS idx_invoice_numbers_company_trgm ON tbl_invoice_numbers USING GIN (company gin_trgm_ops);
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

const SELECT_COLS = `id, tracking, customer, company, province, name_prepare AS "namePrepare", prep_code AS "prepCode",
  to_char("date", 'YYYY-MM-DD') AS "date", status,
  to_char(issued_date, 'YYYY-MM-DD') AS "issuedDate", issued_at AS "issuedAt", issued_by AS "issuedBy", created_by AS "createdBy",
  created_at AS "createdAt", updated_by AS "updatedBy", updated_at AS "updatedAt"`;

const clean = (v, max = 255) => String(v ?? '').trim().slice(0, max);
const cleanDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const cleanStatus = (v) => (INVOICE_STATUSES.includes(String(v || '').toUpperCase()) ? String(v).toUpperCase() : 'PREPARED');
const cleanCode = (v) => clean(v, 100).toUpperCase() || null;
const NO_CODE = '__NONE__';
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
    where.push(`(tracking ILIKE ${p} OR customer ILIKE ${p} OR company ILIKE ${p} OR province ILIKE ${p} OR name_prepare ILIKE ${p} OR issued_by ILIKE ${p} OR prep_code ILIKE ${p})`);
  }
  if (withStatus && q.status && INVOICE_STATUSES.includes(String(q.status).toUpperCase())) add('status = ?', String(q.status).toUpperCase());
  // One prep-code group ('__NONE__' = numbers saved without a code)
  if (q.prepCode === NO_CODE) where.push(`(prep_code IS NULL OR prep_code = '')`);
  else if (q.prepCode) add('prep_code = ?', cleanCode(q.prepCode));
  if (cleanDate(q.startDate)) add(`${DAY_EXPR} >= ?`, q.startDate);
  if (cleanDate(q.endDate)) add(`${DAY_EXPR} <= ?`, q.endDate);
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

/** Per-status totals for the search/date filter, ignoring the status filter. */
async function countByStatus(q) {
  const fc = buildFilter(q, false);
  const { rows } = await getPool().query(`SELECT status, COUNT(*)::int AS n FROM tbl_invoice_numbers ${fc.sql} GROUP BY status`, fc.args);
  const counts = { ALL: 0 };
  INVOICE_STATUSES.forEach((s) => (counts[s] = 0));
  rows.forEach((r) => {
    counts[r.status] = r.n;
    counts.ALL += r.n;
  });
  return counts;
}

/** One page of rows, the total for the current filter, and per-status counts (ignoring the status filter). */
async function listInvoices(q) {
  const pageSize = Math.min(Math.max(parseInt(q.pageSize, 10) || 100, 1), 500);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const f = buildFilter(q);
  const [rowsRes, counts] = await Promise.all([
    getPool().query(
      `SELECT ${SELECT_COLS} FROM tbl_invoice_numbers ${f.sql}
       ORDER BY tbl_invoice_numbers."date" DESC NULLS LAST, tbl_invoice_numbers.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      f.args
    ),
    countByStatus(q),
  ]);
  const st = String(q.status || '').toUpperCase();
  // With a prep-code filter the per-status counts don't apply, so count this filter's rows
  let total = INVOICE_STATUSES.includes(st) ? counts[st] : counts.ALL;
  if (q.prepCode) {
    const { rows } = await getPool().query(`SELECT COUNT(*)::int AS n FROM tbl_invoice_numbers ${f.sql}`, f.args);
    total = rows[0].n;
  }
  return { rows: rowsRes.rows, total, counts, page, pageSize };
}

/**
 * One page of prep-code groups (newest first; numbers without a code come last as one group),
 * plus the per-status counts for the filter pills.
 */
// True when the column has more than spaces / zero-width characters (some old rows hold only those)
const notBlank = (col) => `regexp_replace(${col}, '[\\s\\u200B-\\u200D\\uFEFF]', '', 'g') <> ''`;
async function listGroups(q) {
  const pageSize = Math.min(Math.max(parseInt(q.pageSize, 10) || 50, 1), 500);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const f = buildFilter({ ...q, prepCode: '' });
  const [groupsRes, counts] = await Promise.all([
    getPool().query(
      `SELECT NULLIF(prep_code, '') AS code, COUNT(*)::int AS count,
         COUNT(*) FILTER (WHERE status = 'PREPARED')::int AS prepared,
         COUNT(*) FILTER (WHERE status = 'ISSUED')::int AS issued,
         COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
         MIN(tracking) AS "firstTracking", MAX(tracking) AS "lastTracking",
         to_char(MAX("date"), 'YYYY-MM-DD') AS "date",
         to_char(MAX(issued_date), 'YYYY-MM-DD') AS "issuedDate",
         MAX(issued_at) AS "issuedAt",
         (array_agg(DISTINCT name_prepare) FILTER (WHERE ${notBlank('name_prepare')}))[1:3] AS preparers,
         (array_agg(DISTINCT customer) FILTER (WHERE status = 'ISSUED' AND ${notBlank('customer')}))[1:3] AS customers,
         COUNT(DISTINCT customer) FILTER (WHERE status = 'ISSUED' AND customer <> '')::int AS "customerCount",
         (array_agg(DISTINCT company) FILTER (WHERE status = 'ISSUED' AND ${notBlank('company')}))[1:3] AS companies,
         COUNT(DISTINCT company) FILTER (WHERE status = 'ISSUED' AND ${notBlank('company')})::int AS "companyCount",
         to_char(MAX(created_at), 'YYYY-MM-DD HH24:MI') AS "createdAt",
         COUNT(*) OVER()::int AS "totalGroups"
       FROM tbl_invoice_numbers ${f.sql}
       GROUP BY NULLIF(prep_code, '')
       ORDER BY (NULLIF(prep_code, '') IS NULL), MAX(created_at) DESC, MAX(id) DESC
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      f.args
    ),
    countByStatus(q),
  ]);
  const total = groupsRes.rows[0]?.totalGroups ?? 0;
  const groups = groupsRes.rows.map(({ totalGroups, ...g }) => ({ ...g, preparers: g.preparers || [], customers: g.customers || [], companies: g.companies || [] }));
  return { groups, total, counts, page, pageSize };
}

/** Saved rows for the given numbers (used to check scans and imports). */
async function lookupInvoices(body) {
  const trackings = readTrackings(body, 20000);
  const { rows } = await getPool().query(
    `SELECT ${LOOKUP_COLS} FROM tbl_invoice_numbers WHERE tracking = ANY($1::text[])`,
    [trackings]
  );
  return rows;
}

const LOOKUP_COLS = `tracking, status, customer, name_prepare AS "namePrepare", prep_code AS "prepCode", to_char("date", 'YYYY-MM-DD') AS "date"`;

/** Every number saved under a prep code (any status), so the page can queue the whole batch for issuing. */
async function lookupPrepCode(body) {
  const code = cleanCode(body.prepCode);
  if (!code) throw Object.assign(new Error('សូមបញ្ចូលកូដរៀបចំ'), { status: 400 });
  const { rows } = await getPool().query(
    `SELECT ${LOOKUP_COLS} FROM tbl_invoice_numbers WHERE prep_code = $1 ORDER BY tracking LIMIT ${MAX_BATCH + 1}`,
    [code]
  );
  return rows;
}

/**
 * Prep codes not used yet, newest first — suggestions for step 2.
 * A code counts as used once any of its numbers has been issued, so it drops off the list.
 */
async function listPrepCodes() {
  const { rows } = await getPool().query(
    `SELECT prep_code AS code, COUNT(*) FILTER (WHERE status = 'PREPARED')::int AS count,
       MAX(name_prepare) AS "namePrepare", to_char(MAX("date"), 'YYYY-MM-DD') AS "date"
     FROM tbl_invoice_numbers WHERE prep_code IS NOT NULL AND prep_code <> ''
     GROUP BY prep_code
     HAVING COUNT(*) FILTER (WHERE status = 'PREPARED') > 0 AND COUNT(*) FILTER (WHERE status = 'ISSUED') = 0
     ORDER BY MAX("date") DESC NULLS LAST, MAX(id) DESC LIMIT 500`
  );
  return rows;
}

/** Every row matching the filter, for CSV export. */
async function exportInvoices(q) {
  const f = buildFilter(q);
  const { rows } = await getPool().query(
    `SELECT tracking, customer, company, province, name_prepare AS "namePrepare", prep_code AS "prepCode", to_char("date", 'YYYY-MM-DD') AS "date", status,
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
  const insertSql = `INSERT INTO tbl_invoice_numbers (tracking, customer, province, name_prepare, "date", status, created_by, updated_by, prep_code)
     SELECT t, $2, $3, $4, $5, $6, $7, $7, $8 FROM unnest($1::text[]) AS t
     ON CONFLICT (tracking) DO NOTHING
     RETURNING ${SELECT_COLS}`;
  const args = (code) => [trackings, clean(body.customer), clean(body.province), clean(body.namePrepare, 150), cleanDate(body.date), cleanStatus(body.status), by, code];

  let rows;
  let prepCode = cleanCode(body.prepCode);
  if (body.autoPrepCode) {
    // Pick the next IAL_BILL code and insert under a lock, so two PCs saving at once never share a code
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('tbl_invoice_numbers.prep_code'))");
      prepCode = await nextPrepCode(client);
      ({ rows } = await client.query(insertSql, args(prepCode)));
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } else {
    ({ rows } = await getPool().query(insertSql, args(prepCode)));
  }
  const added = new Set(rows.map((r) => r.tracking));
  return { added: rows, duplicates: trackings.filter((t) => !added.has(t)), prepCode: rows.length ? prepCode : null };
}

/** Auto prep codes: IAL_BILL000001, IAL_BILL000002, ... (one more than the highest saved). */
const AUTO_CODE_PREFIX = 'IAL_BILL';
async function nextPrepCode(db = getPool()) {
  const { rows } = await db.query(
    `SELECT COALESCE(MAX(SUBSTRING(prep_code FROM ${AUTO_CODE_PREFIX.length + 1})::bigint), 0) AS n
     FROM tbl_invoice_numbers WHERE prep_code ~ '^${AUTO_CODE_PREFIX}[0-9]+$'`
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
  if (!customer) throw Object.assign(new Error('សូមបញ្ចូលឈ្មោះអ្នកទទួល (CUSTOMER)'), { status: 400 });
  const { rows } = await getPool().query(
    `UPDATE tbl_invoice_numbers SET customer = $2, province = $3, issued_date = $4, issued_by = $5,
       company = $6, status = 'ISSUED', issued_at = NOW(), updated_by = $5, updated_at = NOW()
     WHERE tracking = ANY($1::text[]) AND status = 'PREPARED'
     RETURNING ${SELECT_COLS}`,
    [trackings, customer, clean(body.province), cleanDate(body.issuedDate), userName(user), clean(body.company) || null]
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
         status = $7, issued_date = $9, company = $10, prep_code = $11,
         issued_at = CASE WHEN $7::varchar = 'ISSUED' THEN COALESCE(issued_at, NOW()) ELSE NULL END,
         updated_by = $8, updated_at = NOW()
       WHERE id = $1 RETURNING ${SELECT_COLS}`,
      [id, tracking, clean(body.customer), clean(body.province), clean(body.namePrepare, 150), cleanDate(body.date), cleanStatus(body.status), userName(user), cleanDate(body.issuedDate), clean(body.company) || null, cleanCode(body.prepCode)]
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
      if (action === 'groups') return res.status(200).json({ ok: true, data: await listGroups(q) });
      if (action === 'nextPrepCode') return res.status(200).json({ ok: true, data: { code: await nextPrepCode() } });
      if (action === 'prepCodes') return res.status(200).json({ ok: true, data: await listPrepCodes() });
      if (action === 'export') return res.status(200).json({ ok: true, data: await exportInvoices(q) });
      return res.status(400).json({ ok: false, message: `Unknown action: ${action}` });
    }

    if (req.method === 'POST') {
      if (action === 'create') return res.status(200).json({ ok: true, data: await createInvoices(body, req.user) });
      if (action === 'lookup') return res.status(200).json({ ok: true, data: await lookupInvoices(body) });
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
