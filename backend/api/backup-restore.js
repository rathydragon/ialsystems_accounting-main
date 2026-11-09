/**
 * Restore from the local PostgreSQL backup (schema "hostinger") back to Hostinger MySQL.
 *
 * Insert-only: a row is restored only when its primary key is missing from Hostinger.
 * Rows that exist in Hostinger are never updated or deleted, so newer data is never overwritten.
 * Rows with a deletion tombstone (tbl_deleted_records) are skipped, so deleted rows stay deleted.
 *
 * Used by POST /api/backup-postgres?action=get_restore_preview and ?action=restore_backup (Admin only).
 */
import crypto from 'crypto';
import pg from 'pg';
import { getPgConfig, MIRROR_SCHEMA } from '../scripts/hostinger-mirror.js';

const { Pool } = pg;

const PAGE_SIZE = 5000;
const SAMPLE_LIMIT = 20;
export const MAX_RESTORE_ROWS = 1000; // most rows one restore can insert (repeat for more)
const INSERT_CHUNK = 200;

const qi = (name) => `"${String(name).replace(/"/g, '""')}"`;
const mi = (name) => `\`${String(name).replace(/`/g, '``')}\``;
const cleanText = (v) => (v === null || v === undefined ? null : String(v).replace(/\u0000/g, ''));
const asText = (field) => field.string();
const SECRET_COLUMN = /pass(word)?|secret|token|api_?key|private_?key/i;

let pgPool = null;
function getPgPool() {
  if (!pgPool) {
    pgPool = new Pool({ ...getPgConfig(), max: 2, connectionTimeoutMillis: 3000 });
    pgPool.on('error', () => {});
  }
  return pgPool;
}

let restoreRunning = false;

function fail(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/** Key for a row: primary key values joined (composite keys supported). */
export function rowKey(row, pkIdx) {
  return pkIdx.map((i) => (row[i] === null || row[i] === undefined ? '\u0000' : String(row[i]))).join('\u0001');
}

export function rowHash(row) {
  const s = row.map((v) => (v === null || v === undefined ? '\u0000N' : cleanText(v))).join('\u0001');
  return crypto.createHash('md5').update(s).digest('hex');
}

/**
 * Sort backup rows into: missing from Hostinger (restorable), tombstoned (deleted on purpose),
 * and different (exists in both with other values — shown only, never changed).
 */
export function classifyRows({ backupRows, liveHashes, pkIdx, tombstones, tombstoneIdx }) {
  const missing = [];
  const tombstoned = [];
  const different = [];
  let same = 0;
  for (const row of backupRows) {
    const key = rowKey(row, pkIdx);
    const live = liveHashes.get(key);
    if (live === undefined) {
      const dead = tombstones.size > 0 && tombstoneIdx.some((i) => row[i] != null && tombstones.has(String(row[i])));
      (dead ? tombstoned : missing).push({ key, row });
    } else if (live === rowHash(row)) {
      same++;
    } else {
      different.push({ key, row });
    }
  }
  return { missing, tombstoned, different, same };
}

async function getMySqlTable(mysqlPool, table) {
  const [cols] = await mysqlPool.query(
    `SELECT COLUMN_NAME AS c, COLUMN_KEY AS k, EXTRA AS x FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [table]
  );
  if (!cols.length) throw fail(`Table "${table}" មិនមាននៅក្នុង Hostinger ទេ`, 404);
  const pk = cols.filter((c) => c.k === 'PRI').map((c) => c.c);
  // Generated columns are computed by MySQL and cannot be inserted
  const writable = cols.filter((c) => !/GENERATED/i.test(String(c.x || ''))).map((c) => c.c);
  return { pk, writable };
}

async function getBackupColumns(db, table) {
  const { rows } = await db.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [MIRROR_SCHEMA, table]
  );
  return rows.map((r) => r.column_name);
}

async function loadTombstones(mysqlPool, table) {
  try {
    const [rows] = await mysqlPool.query(
      'SELECT record_id FROM tbl_deleted_records WHERE table_name = ?',
      [table]
    );
    return new Set(rows.map((r) => String(r.record_id)));
  } catch {
    return new Set(); // table not created yet
  }
}

/** Hash of every Hostinger row (common columns only), keyed by primary key. */
async function loadLiveHashes(mysqlPool, table, columns, pk) {
  const pkIdx = pk.map((c) => columns.indexOf(c));
  const colList = columns.map(mi).join(', ');
  const order = pk.map(mi).join(', ');
  const hashes = new Map();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const [rows] = await mysqlPool.query({
      sql: `SELECT ${colList} FROM ${mi(table)} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      rowsAsArray: true,
      typeCast: asText,
    });
    for (const row of rows) hashes.set(rowKey(row, pkIdx), rowHash(row));
    if (rows.length < PAGE_SIZE) break;
  }
  return hashes;
}

async function analyse(table) {
  table = String(table || '').trim();
  if (!table) throw fail('សូមជ្រើស table');
  const { getMySQLPool } = await import('./remote-mysql.js');
  const mysqlPool = getMySQLPool();
  const db = getPgPool();

  const backupCols = await getBackupColumns(db, table);
  if (!backupCols.length) throw fail(`រកមិនឃើញ table "${table}" ក្នុង backup ទេ`, 404);

  const { pk, writable } = await getMySqlTable(mysqlPool, table);
  if (!pk.length) {
    throw fail(`Table "${table}" គ្មាន Primary Key ទេ ដូច្នេះមិនអាចដឹងច្បាស់ថាជួរណាបាត់។ Restore មិនអនុញ្ញាតទេ។`);
  }
  const missingPk = pk.filter((c) => !backupCols.includes(c));
  if (missingPk.length) throw fail(`Backup មិនមាន column Primary Key (${missingPk.join(', ')}) ទេ`);

  // Restore only columns that exist on both sides (in Hostinger's order)
  const columns = writable.filter((c) => backupCols.includes(c));
  for (const c of pk) if (!columns.includes(c)) columns.push(c);
  const pkIdx = pk.map((c) => columns.indexOf(c));
  const tombstoneIdx = [...new Set([...pk, 'id', 'row_key', 'record_id'])]
    .map((c) => columns.indexOf(c))
    .filter((i) => i >= 0);

  const [liveHashes, tombstones, backup] = await Promise.all([
    loadLiveHashes(mysqlPool, table, columns, pk),
    loadTombstones(mysqlPool, table),
    db.query({
      text: `SELECT ${columns.map(qi).join(', ')} FROM ${qi(MIRROR_SCHEMA)}.${qi(table)} ORDER BY ${pk.map(qi).join(', ')}`,
      rowMode: 'array',
    }),
  ]);

  const result = classifyRows({ backupRows: backup.rows, liveHashes, pkIdx, tombstones, tombstoneIdx });
  return {
    table,
    columns,
    pk,
    pkIdx,
    skippedColumns: backupCols.filter((c) => !columns.includes(c)),
    backupCount: backup.rows.length,
    liveCount: liveHashes.size,
    liveHashes,
    ...result,
  };
}

function toObject(columns, row) {
  const o = {};
  columns.forEach((c, i) => { o[c] = SECRET_COLUMN.test(c) && row[i] ? '••••••' : row[i]; });
  return o;
}

async function lastBackupAt() {
  try {
    const { rows } = await getPgPool().query(
      'SELECT finished_at FROM backup_history_logs ORDER BY finished_at DESC NULLS LAST, id DESC LIMIT 1'
    );
    return rows[0]?.finished_at || null;
  } catch {
    return null;
  }
}

export async function previewRestore(table) {
  const a = await analyse(table);
  const shown = a.missing.slice(0, MAX_RESTORE_ROWS);
  return {
    table: a.table,
    columns: a.columns,
    pk: a.pk,
    skippedColumns: a.skippedColumns,
    backupCount: a.backupCount,
    liveCount: a.liveCount,
    backupAt: await lastBackupAt(),
    counts: {
      missing: a.missing.length,
      same: a.same,
      different: a.different.length,
      tombstoned: a.tombstoned.length,
    },
    maxPerRun: MAX_RESTORE_ROWS,
    missing: shown.map((m) => ({ key: m.key, row: toObject(a.columns, m.row) })),
    different: a.different.slice(0, SAMPLE_LIMIT).map((d) => ({ key: d.key, row: toObject(a.columns, d.row) })),
    tombstoned: a.tombstoned.slice(0, SAMPLE_LIMIT).map((t) => ({ key: t.key, row: toObject(a.columns, t.row) })),
  };
}

async function ensureRestoreLog(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS backup_restore_logs (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL,
      restored_by TEXT,
      requested INT,
      inserted INT,
      skipped INT,
      status TEXT,
      message TEXT,
      restored_keys JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
}

/**
 * Insert the chosen missing rows into Hostinger. `keys` must come from the preview;
 * any key that is no longer missing (or is tombstoned) is skipped.
 */
export async function runRestore({ table, keys, confirm, user }) {
  table = String(table || '').trim();
  if (!table || confirm !== table) throw fail('សូមវាយឈ្មោះ table ឱ្យត្រូវ ដើម្បីបញ្ជាក់ការ Restore');
  if (!Array.isArray(keys) || !keys.length) throw fail('សូមជ្រើសជួរយ៉ាងហោចណាស់មួយ');
  if (keys.length > MAX_RESTORE_ROWS) throw fail(`Restore បានច្រើនបំផុត ${MAX_RESTORE_ROWS} ជួរក្នុងមួយដង`);
  if (restoreRunning) throw fail('កំពុងមាន Restore មួយទៀតកំពុងដំណើរការ។ សូមរង់ចាំបន្តិច។', 409);

  restoreRunning = true;
  const db = getPgPool();
  const by = String(user?.email || user?.name || user?.username || 'unknown');
  try {
    // Check again right now, so rows added to Hostinger since the preview are never touched
    const a = await analyse(table);
    const wanted = new Set(keys.map(String));
    const rows = a.missing.filter((m) => wanted.has(m.key));
    if (!rows.length) {
      return { table, requested: keys.length, inserted: 0, skipped: keys.length, message: 'គ្មានជួរណាត្រូវ Restore ទេ (ជួរទាំងនោះមាននៅក្នុង Hostinger រួចហើយ)' };
    }

    const { getMySQLPool } = await import('./remote-mysql.js');
    const conn = await getMySQLPool().getConnection();
    let inserted = 0;
    const insertedKeys = [];
    try {
      await conn.beginTransaction();
      const colList = a.columns.map(mi).join(', ');
      const ph = `(${a.columns.map(() => '?').join(', ')})`;
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK);
        // INSERT IGNORE: if a row with the same key appeared meanwhile, MySQL keeps it as is
        const [res] = await conn.query(
          `INSERT IGNORE INTO ${mi(table)} (${colList}) VALUES ${chunk.map(() => ph).join(', ')}`,
          chunk.flatMap((m) => m.row.map(cleanText))
        );
        inserted += Number(res.affectedRows) || 0;
        insertedKeys.push(...chunk.map((m) => m.key));
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw fail('Restore បរាជ័យ (មិនបានបញ្ចូលអ្វីទាំងអស់)៖ ' + err.message, 500);
    } finally {
      conn.release();
    }

    const skipped = keys.length - inserted;
    await ensureRestoreLog(db)
      .then(() => db.query(
        `INSERT INTO backup_restore_logs (table_name, restored_by, requested, inserted, skipped, status, restored_keys)
         VALUES ($1, $2, $3, $4, $5, 'SUCCESS', $6)`,
        [table, by, keys.length, inserted, skipped, JSON.stringify(insertedKeys)]
      ))
      .catch((err) => console.warn('[restore] Could not write restore log:', err.message));

    return {
      table,
      requested: keys.length,
      inserted,
      skipped,
      message: `✓ បាន Restore ${inserted.toLocaleString()} ជួរ ទៅ Hostinger (${table})` +
        (skipped ? ` · រំលង ${skipped.toLocaleString()} ជួរ (មានរួចហើយ)` : ''),
    };
  } catch (err) {
    await ensureRestoreLog(db)
      .then(() => db.query(
        `INSERT INTO backup_restore_logs (table_name, restored_by, requested, inserted, skipped, status, message)
         VALUES ($1, $2, $3, 0, 0, 'FAILED', $4)`,
        [table, by, keys.length, err.message]
      ))
      .catch(() => {});
    throw err;
  } finally {
    restoreRunning = false;
  }
}

/** Shared entry point for the API handler. */
export async function handleRestore(action, body, user) {
  try {
    if (action === 'get_restore_preview') {
      return { status: 200, body: { ok: true, ...(await previewRestore(body?.table)) } };
    }
    if (action === 'restore_backup') {
      return { status: 200, body: { ok: true, ...(await runRestore({ ...body, user })) } };
    }
    return { status: 400, body: { ok: false, message: 'Unknown restore action' } };
  } catch (err) {
    const status = err.statusCode || 500;
    const msg = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timeout/i.test(String(err.message)) && !err.statusCode
      ? 'មិនអាចភ្ជាប់ទៅ Hostinger ឬ PostgreSQL បានទេ៖ ' + err.message
      : err.message;
    return { status, body: { ok: false, message: msg } };
  }
}
