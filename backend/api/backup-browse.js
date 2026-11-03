/**
 * Read-only viewer for the local PostgreSQL backup (schema "hostinger").
 * Used by GET /api/backup-postgres?browse=tables and ?browse=rows.
 * Never writes anything, and never sends data back to Hostinger.
 */
import pg from 'pg';
import { getPgConfig, MIRROR_SCHEMA } from '../scripts/hostinger-mirror.js';

const { Pool } = pg;

let pool = null;
function getPool() {
  if (!pool) {
    pool = new Pool({ ...getPgConfig(), max: 3, connectionTimeoutMillis: 3000 });
    pool.on('error', () => {});
  }
  return pool;
}

const qi = (name) => `"${String(name).replace(/"/g, '""')}"`;

// Columns whose values are hidden in the viewer (passwords, tokens, keys).
const SECRET_COLUMN = /pass(word)?|secret|token|api_?key|private_?key/i;
// Key/value tables (e.g. tbl_settings): hide the value when the key names a secret.
const SECRET_KEY = /pass|secret|token|api_?key|private|pin$/i;
const MAX_PAGE_SIZE = 500;

async function listTables(db) {
  const { rows } = await db.query(
    `SELECT c.relname AS name, GREATEST(c.reltuples, 0)::bigint AS estimate,
            COALESCE(s.n_live_tup, 0)::bigint AS live
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname NOT LIKE '\\_stage\\_%'
      ORDER BY c.relname`,
    [MIRROR_SCHEMA]
  );
  const tables = rows.map((r) => ({ name: r.name, rowCount: Number(r.live) || Number(r.estimate) || 0 }));

  let lastBackup = null;
  try {
    const { rows: logRows } = await db.query(
      `SELECT status, message, records_synced, finished_at
         FROM backup_history_logs ORDER BY finished_at DESC NULLS LAST, id DESC LIMIT 1`
    );
    if (logRows[0]) {
      lastBackup = {
        status: logRows[0].status,
        message: logRows[0].message,
        records: Number(logRows[0].records_synced) || 0,
        finishedAt: logRows[0].finished_at,
      };
    }
  } catch {}

  return { tables, lastBackup };
}

async function getColumns(db, table) {
  const { rows } = await db.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [MIRROR_SCHEMA, table]
  );
  return rows.map((r) => r.column_name);
}

async function getRows(db, query) {
  const table = String(query.table || '');
  const columns = await getColumns(db, table);
  if (!columns.length) {
    const err = new Error(`រកមិនឃើញ table "${table}" ក្នុង backup ទេ`);
    err.statusCode = 404;
    throw err;
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.pageSize, 10) || 50));
  const search = String(query.search || '').trim();
  const sortCol = columns.includes(query.sort) ? query.sort : null;
  const sortDir = String(query.dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const from = `${qi(MIRROR_SCHEMA)}.${qi(table)} t`;
  const params = [];
  let where = '';
  if (search) {
    // Search across every column (all backup columns are stored as text).
    params.push(`%${search.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
    where = `WHERE t::text ILIKE $1`;
  }
  const order = sortCol ? `ORDER BY t.${qi(sortCol)} ${sortDir} NULLS LAST` : '';

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*)::bigint AS n FROM ${from} ${where}`, params),
    db.query(
      `SELECT * FROM ${from} ${where} ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params
    ),
  ]);

  const hidden = columns.filter((c) => SECRET_COLUMN.test(c));
  const keyCol = columns.find((c) => /_key$/.test(c) && columns.includes(c.replace(/_key$/, '_value')));
  const valueCol = keyCol && keyCol.replace(/_key$/, '_value');
  const mask = (row, c) => { if (row[c] != null && row[c] !== '') row[c] = '••••••'; };
  for (const row of rows) {
    for (const c of hidden) mask(row, c);
    if (keyCol && SECRET_KEY.test(String(row[keyCol] || ''))) mask(row, valueCol);
  }

  return {
    table,
    columns,
    hiddenColumns: hidden,
    rows,
    total: Number(countRows[0]?.n) || 0,
    page,
    pageSize,
  };
}

export async function handleBrowse(query) {
  if (process.env.VERCEL) {
    return {
      status: 200,
      body: {
        ok: false,
        isCloud: true,
        message: 'Backup Data អាចមើលបានតែលើម៉ាស៊ីន Local (ដែលមាន PostgreSQL) ប៉ុណ្ណោះ មិនមែនលើ Vercel ទេ។',
      },
    };
  }
  try {
    const db = getPool();
    if (query.browse === 'tables') {
      return { status: 200, body: { ok: true, ...(await listTables(db)) } };
    }
    if (query.browse === 'rows') {
      return { status: 200, body: { ok: true, ...(await getRows(db, query)) } };
    }
    return { status: 400, body: { ok: false, message: 'browse ត្រូវតែជា tables ឬ rows' } };
  } catch (err) {
    return {
      status: err.statusCode || 200,
      body: { ok: false, message: err.statusCode ? err.message : 'Local PostgreSQL error: ' + (err?.message || err) },
    };
  }
}
