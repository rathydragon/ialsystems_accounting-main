/**
 * Full backup: Hostinger MySQL (source of truth) -> Local PostgreSQL.
 *
 * 1. Every Hostinger table is copied, all rows, into the PostgreSQL schema "hostinger"
 *    (same table and column names; every value kept as text exactly as MySQL shows it).
 *    Each table is loaded into a staging table first and swapped in one transaction,
 *    so a failed run never leaves a half-copied table.
 * 2. The older JSON copy (local_offline_backups) and the tbl_* tables built from it
 *    are refreshed from Hostinger too, so the existing views keep working.
 *
 * Used by both the API (/api/backup-postgres POST) and scripts/backup-to-postgres.js.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeSchedule } from './backup-schedule.js';

const { Client, Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
try { dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true }); } catch {}

export const MIRROR_SCHEMA = 'hostinger';
const PAGE_SIZE = 5000;          // rows fetched from MySQL per round trip
const MAX_PG_PARAMS = 30000;     // keep each INSERT well under PostgreSQL's 65535 limit
const BACKUP_LOCK_KEY = 74120931; // advisory lock id: only one backup at a time

export function getPgConfig() {
  return {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DATABASE || 'ialsystems_backup',
    client_encoding: 'UTF8',
  };
}

const qi = (name) => `"${String(name).replace(/"/g, '""')}"`;  // PostgreSQL identifier
const mi = (name) => `\`${String(name).replace(/`/g, '``')}\``; // MySQL identifier
// PostgreSQL text cannot hold NUL characters
const cleanText = (v) => (v === null || v === undefined ? null : String(v).replace(/\u0000/g, ''));

async function ensureDatabase(cfg) {
  const root = new Client({ ...cfg, database: 'postgres', connectionTimeoutMillis: 4000 });
  await root.connect();
  try {
    const r = await root.query('SELECT 1 FROM pg_database WHERE datname = $1', [cfg.database]);
    if (r.rowCount === 0) await root.query(`CREATE DATABASE ${qi(cfg.database)} ENCODING 'UTF8'`);
  } finally {
    await root.end().catch(() => {});
  }
}

async function ensureBaseSchema(pool) {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS ${qi(MIRROR_SCHEMA)};
    CREATE TABLE IF NOT EXISTS hostinger_mirror_status (
      table_name VARCHAR(200) PRIMARY KEY,
      row_count BIGINT NOT NULL,
      source_count BIGINT,
      duration_ms INT,
      status VARCHAR(20) NOT NULL,
      message TEXT,
      synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS local_offline_backups (
      table_name VARCHAR(100) NOT NULL,
      record_id VARCHAR(255) NOT NULL,
      data JSONB NOT NULL,
      record_created_at TIMESTAMPTZ,
      synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (table_name, record_id)
    );
    CREATE TABLE IF NOT EXISTS backup_history_logs (
      id SERIAL PRIMARY KEY,
      table_name VARCHAR(100) NOT NULL,
      records_synced INT NOT NULL,
      status VARCHAR(20) NOT NULL,
      message TEXT,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    -- Older databases named this column collection_name
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'backup_history_logs' AND column_name = 'collection_name')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'backup_history_logs' AND column_name = 'table_name') THEN
        ALTER TABLE backup_history_logs RENAME COLUMN collection_name TO table_name;
      END IF;
    END $$;
  `);
}

async function listMySqlTables(mysqlPool) {
  const [tables] = await mysqlPool.query(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`
  );
  const [cols] = await mysqlPool.query(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_KEY AS k, DATA_TYPE AS dt
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME, ORDINAL_POSITION`
  );
  const byTable = new Map();
  for (const c of cols) {
    if (!byTable.has(c.t)) byTable.set(c.t, []);
    byTable.get(c.t).push(c);
  }
  return tables.map(({ name }) => {
    const columns = byTable.get(name) || [];
    const pk = columns.filter((c) => c.k === 'PRI').map((c) => c.c);
    const intTypes = ['tinyint', 'smallint', 'mediumint', 'int', 'bigint'];
    const keyset = pk.length === 1 && intTypes.includes(String(columns.find((c) => c.c === pk[0])?.dt).toLowerCase());
    return { name, columns: columns.map((c) => c.c), pk, keyset };
  });
}

// Every value comes back as MySQL's own text (dates stay exactly as stored, no timezone shift)
const asText = (field) => field.string();

async function copyTable(mysqlPool, pgPool, table) {
  const { name, columns, pk, keyset } = table;
  const stage = `_stage_${name}`.slice(0, 63);
  const colList = columns.map(qi).join(', ');
  const rowsPerInsert = Math.max(1, Math.floor(MAX_PG_PARAMS / Math.max(columns.length, 1)));

  await pgPool.query(`DROP TABLE IF EXISTS ${qi(MIRROR_SCHEMA)}.${qi(stage)}`);
  await pgPool.query(
    `CREATE TABLE ${qi(MIRROR_SCHEMA)}.${qi(stage)} (${columns.map((c) => `${qi(c)} TEXT`).join(', ')})`
  );

  let copied = 0;
  let lastKey = null;
  let offset = 0;
  const orderBy = pk.length ? ` ORDER BY ${pk.map(mi).join(', ')}` : '';

  for (;;) {
    let sql;
    let values = [];
    if (keyset) {
      sql = `SELECT * FROM ${mi(name)}${lastKey !== null ? ` WHERE ${mi(pk[0])} > ?` : ''} ORDER BY ${mi(pk[0])} LIMIT ${PAGE_SIZE}`;
      if (lastKey !== null) values = [lastKey];
    } else {
      sql = `SELECT * FROM ${mi(name)}${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
    }
    const [rows] = await mysqlPool.query({ sql, values, rowsAsArray: true, typeCast: asText });
    if (!rows.length) break;

    for (let i = 0; i < rows.length; i += rowsPerInsert) {
      const chunk = rows.slice(i, i + rowsPerInsert);
      const params = [];
      const tuples = chunk.map((row) => {
        const ph = row.map((v) => { params.push(cleanText(v)); return `$${params.length}`; });
        return `(${ph.join(', ')})`;
      });
      await pgPool.query(
        `INSERT INTO ${qi(MIRROR_SCHEMA)}.${qi(stage)} (${colList}) VALUES ${tuples.join(', ')}`,
        params
      );
    }

    copied += rows.length;
    if (keyset) lastKey = rows[rows.length - 1][columns.indexOf(pk[0])];
    else offset += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  // Swap the staging copy in. Keep the existing table (and anything built on it) when the
  // columns did not change; otherwise replace it.
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      [MIRROR_SCHEMA, name]
    );
    const sameColumns =
      existing.rows.length === columns.length &&
      existing.rows.every((r, i) => r.column_name === columns[i]);

    if (sameColumns) {
      await client.query(`TRUNCATE ${qi(MIRROR_SCHEMA)}.${qi(name)}`);
      await client.query(
        `INSERT INTO ${qi(MIRROR_SCHEMA)}.${qi(name)} (${colList}) SELECT ${colList} FROM ${qi(MIRROR_SCHEMA)}.${qi(stage)}`
      );
      await client.query(`DROP TABLE ${qi(MIRROR_SCHEMA)}.${qi(stage)}`);
    } else {
      await client.query(`DROP TABLE IF EXISTS ${qi(MIRROR_SCHEMA)}.${qi(name)}`);
      await client.query(`ALTER TABLE ${qi(MIRROR_SCHEMA)}.${qi(stage)} RENAME TO ${qi(name)}`);
      if (pk.length) {
        await client.query(
          `ALTER TABLE ${qi(MIRROR_SCHEMA)}.${qi(name)} ADD PRIMARY KEY (${pk.map(qi).join(', ')})`
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return copied;
}

/** Copy every Hostinger table into PostgreSQL schema "hostinger". */
export async function mirrorHostingerToPostgres(pgPool, mysqlPool, log = () => {}) {
  const tables = await listMySqlTables(mysqlPool);
  const results = [];
  for (const table of tables) {
    const t0 = Date.now();
    try {
      const [[{ n }]] = await mysqlPool.query(`SELECT COUNT(*) AS n FROM ${mi(table.name)}`);
      const copied = await copyTable(mysqlPool, pgPool, table);
      const ms = Date.now() - t0;
      // Rows can be added while a big table is copied, so only flag a copy that came up short
      const status = copied >= Number(n) ? 'SUCCESS' : 'PARTIAL';
      results.push({ table: table.name, rows: copied, source: Number(n), status });
      await pgPool.query(
        `INSERT INTO hostinger_mirror_status (table_name, row_count, source_count, duration_ms, status, message, synced_at)
         VALUES ($1, $2, $3, $4, $5, NULL, NOW())
         ON CONFLICT (table_name) DO UPDATE SET row_count = EXCLUDED.row_count, source_count = EXCLUDED.source_count,
           duration_ms = EXCLUDED.duration_ms, status = EXCLUDED.status, message = NULL, synced_at = NOW()`,
        [table.name, copied, Number(n), ms, status]
      );
      log(`   ✓ ${table.name}: ${copied.toLocaleString()} / ${Number(n).toLocaleString()} rows (${ms} ms)`);
    } catch (err) {
      results.push({ table: table.name, rows: 0, status: 'FAILED', error: err.message });
      await pgPool.query(
        `INSERT INTO hostinger_mirror_status (table_name, row_count, status, message, synced_at)
         VALUES ($1, 0, 'FAILED', $2, NOW())
         ON CONFLICT (table_name) DO UPDATE SET status = 'FAILED', message = EXCLUDED.message, synced_at = NOW()`,
        [table.name, err.message]
      ).catch(() => {});
      await pgPool.query(`DROP TABLE IF EXISTS ${qi(MIRROR_SCHEMA)}.${qi(`_stage_${table.name}`.slice(0, 63))}`).catch(() => {});
      log(`   ✗ ${table.name}: ${err.message}`);
    }
  }
  // Tables removed from Hostinger: drop their status rows (their old copy stays in the schema)
  await pgPool.query(
    `DELETE FROM hostinger_mirror_status WHERE NOT (table_name = ANY($1::text[]))`,
    [tables.map((t) => t.name)]
  );
  return results;
}

/** Refresh the older JSON copy (local_offline_backups) from Hostinger, removing deleted rows. */
async function refreshLegacyJsonCopy(pgPool, mysqlPool, log) {
  const { getAllMasterData } = await import('../api/mysql-master-handlers.js');
  const master = await getAllMasterData(mysqlPool);
  if (!master?.ok || !master.data) throw new Error('Could not read master data from Hostinger');
  const md = master.data;

  const mappings = [
    { name: 'batches', records: md.batches },
    { name: 'medicine_batches', records: md.medicineBatches },
    { name: 'warehouse_scans', records: md.warehouseScans },
    { name: 'distribution_reports', records: md.distributionReports },
    { name: 'user_permissions', records: md.permissions },
    { name: 'bank_slips', records: md.bankSlips },
    { name: 'list_name', records: md.payers },
  ];

  let total = 0;
  for (const { name, records } of mappings) {
    if (!Array.isArray(records)) continue;
    const ids = [];
    const rows = [];
    for (const row of records) {
      const id = row.id ?? row.batchNumber ?? row.email ?? row.barcode;
      if (id === undefined || id === null || id === '') continue; // no stable id: skip, never invent one
      const created = row.createdAt || row.created_at || row.date || null;
      const createdDate = created ? new Date(created) : null;
      ids.push(String(id));
      rows.push([name, String(id), cleanText(JSON.stringify(row)), createdDate && !isNaN(createdDate) ? createdDate : null]);
    }

    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const params = [];
        const tuples = chunk.map((r) => {
          params.push(...r);
          const b = params.length - 4;
          return `($${b + 1}, $${b + 2}, $${b + 3}::jsonb, $${b + 4}, NOW())`;
        });
        await client.query(
          `INSERT INTO local_offline_backups (table_name, record_id, data, record_created_at, synced_at)
           VALUES ${tuples.join(', ')}
           ON CONFLICT (table_name, record_id) DO UPDATE SET data = EXCLUDED.data,
             record_created_at = EXCLUDED.record_created_at, synced_at = NOW()`,
          params
        );
      }
      // Hostinger is the source of truth: rows deleted there are deleted here too
      await client.query(
        `DELETE FROM local_offline_backups WHERE table_name = $1 AND NOT (record_id = ANY($2::text[]))`,
        [name, ids]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    total += rows.length;
  }
  // "permissions" was an old duplicate name for "user_permissions"
  await pgPool.query(`DELETE FROM local_offline_backups WHERE table_name = 'permissions'`);
  log(`   ✓ JSON copy (local_offline_backups): ${total.toLocaleString()} records`);
  return total;
}

/** Remember the last run in backup-schedule.json so every trigger shares one clock. */
function saveRunResult(result, started, error = null) {
  try {
    const lastResult = {
      ok: Boolean(result?.ok),
      at: new Date().toISOString(),
      startedAt: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      tables: result?.tables?.length || 0,
      totalRows: result?.totalRows || 0,
      failedTables: (result?.failed || []).map((t) => ({ table: t.table, error: t.error })),
      partialTables: (result?.tables || []).filter((t) => t.status === 'PARTIAL').map((t) => t.table),
      error: error || result?.legacyError || null,
    };
    // Only a run that finished moves the clock forward; a crashed run is retried next time
    writeSchedule(error ? { lastResult } : { lastResult, lastBackupAt: lastResult.at });
  } catch {}
}

/**
 * Run one full backup. Returns { ok, tables, totalRows, failed, durationMs }.
 * Throws { code: 'BACKUP_RUNNING' } if another backup is already running.
 */
export async function runFullBackup(opts = {}) {
  const started = Date.now();
  try {
    return await runFullBackupInner(opts, started);
  } catch (err) {
    if (err?.code !== 'BACKUP_RUNNING') saveRunResult(null, started, err?.message || String(err));
    throw err;
  }
}

async function runFullBackupInner({ log = () => {} } = {}, started) {
  const cfg = getPgConfig();
  await ensureDatabase(cfg);

  const pgPool = new Pool({ ...cfg, max: 4, connectionTimeoutMillis: 5000 });
  pgPool.on('error', () => {});
  const lockClient = await pgPool.connect();
  try {
    const lock = await lockClient.query('SELECT pg_try_advisory_lock($1) AS ok', [BACKUP_LOCK_KEY]);
    if (!lock.rows[0].ok) {
      const err = new Error('A backup is already running. Please wait for it to finish.');
      err.code = 'BACKUP_RUNNING';
      throw err;
    }
    try {
      await ensureBaseSchema(pgPool);
      const { getMySQLPool } = await import('../api/remote-mysql.js');
      const mysqlPool = getMySQLPool();

      log(`📦 Copying every Hostinger table into PostgreSQL schema "${MIRROR_SCHEMA}"...`);
      const tables = await mirrorHostingerToPostgres(pgPool, mysqlPool, log);

      log('📦 Refreshing the JSON copy and tbl_* tables...');
      let legacyError = null;
      try {
        await refreshLegacyJsonCopy(pgPool, mysqlPool, log);
        const { syncColumnarTables } = await import('../api/backup-postgres.js');
        await syncColumnarTables(pgPool);
      } catch (err) {
        legacyError = err.message;
        log(`   ✗ JSON copy: ${err.message}`);
      }

      const failed = tables.filter((t) => t.status === 'FAILED');
      const totalRows = tables.reduce((s, t) => s + t.rows, 0);
      const ok = failed.length === 0 && !legacyError;
      await pgPool.query(
        `INSERT INTO backup_history_logs (table_name, records_synced, status, message, started_at)
         VALUES ('ALL_TABLES', $1, $2, $3, $4)`,
        [
          totalRows,
          ok ? 'SUCCESS' : 'PARTIAL',
          [failed.length ? `Failed: ${failed.map((t) => t.table).join(', ')}` : null, legacyError].filter(Boolean).join(' | ') || null,
          new Date(started),
        ]
      ).catch((err) => log(`   ✗ Could not write backup history: ${err.message}`));

      const result = { ok, tables, totalRows, failed, legacyError, durationMs: Date.now() - started };
      saveRunResult(result, started);
      return result;
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [BACKUP_LOCK_KEY]).catch(() => {});
    }
  } finally {
    lockClient.release();
    await pgPool.end().catch(() => {});
  }
}
