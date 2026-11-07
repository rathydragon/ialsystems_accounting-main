/**
 * Offline store: a live local copy of Data Report in PostgreSQL, so the team on the LAN keeps
 * working when this office loses its internet connection.
 *
 *   Hostinger MySQL (source of truth)  ──every 2 min, new / changed rows only──▶  local PostgreSQL
 *
 * - Data Report (tbl_data_report + meta) and Distribution Reports (tbl_distribution_reports) are
 *   copied into the PostgreSQL schema "offline". Only rows whose synced_at moved are fetched.
 * - When Hostinger can't be reached, Data Report reads are served from this copy.
 * - Distribution report saves / deletes made while offline go into offline.outbox (and the local
 *   copy, so they show at once). When Hostinger is back, the outbox is replayed in order, then the
 *   copy is refreshed. Hostinger stays the source of truth: the local copy is replaced by it.
 *
 * Only runs on the office server (server.js). On Vercel, or when PostgreSQL is missing, every
 * function here is a no-op and the app works online-only as before.
 */
import pg from 'pg';
import { getMySQLPool } from './remote-mysql.js';

const S = 'offline';
const CHECK_INTERVAL_MS = 30 * 1000; // connection check + outbox replay
const SYNC_INTERVAL_MS = 2 * 60 * 1000; // copy new / changed rows
const PING_TIMEOUT_MS = 6000;
const PAGE = 2000;
const OVERLAP_MS = 5000; // re-read a few seconds back: MySQL TIMESTAMP has 1 s precision
const MAX_ATTEMPTS = 5;

const NETWORK_CODES = new Set([
  'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH',
  'EPIPE', 'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_SEQUENCE_TIMEOUT', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR', 'OFFLINE_PING_TIMEOUT',
]);

const status = {
  enabled: !process.env.VERCEL && process.env.OFFLINE_STORE !== 'off',
  ready: false, // local schema exists and holds at least one Data Report sync
  online: true,
  lastCheckAt: null,
  lastOnlineAt: null,
  lastSyncAt: null,
  lastError: null,
  syncing: false,
};

let pgPool = null;
function local() {
  if (!pgPool) {
    pgPool = new pg.Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432', 10),
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || '',
      database: process.env.PG_DATABASE || 'ialsystems_backup',
      max: 5,
      connectionTimeoutMillis: 5000,
    });
    pgPool.on('error', (err) => console.warn('[Offline] PostgreSQL pool error:', err.message));
  }
  return pgPool;
}

export function isNetworkError(err) {
  if (!err) return false;
  if (NETWORK_CODES.has(err.code)) return true;
  return /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo|connect timeout/i.test(String(err.message || ''));
}

/** Serve from the local copy right away (Hostinger known to be down and a copy exists). */
export const isOffline = () => status.enabled && status.ready && !status.online;
/** A Hostinger call just failed with this error: may we fall back to the local copy? */
export const canFallBack = (err) => status.enabled && status.ready && isNetworkError(err);

export function markOffline(err) {
  if (!status.enabled) return;
  if (status.online) console.warn('[Offline] Hostinger unreachable — serving the local copy.', err?.message || '');
  status.online = false;
  status.lastError = err?.message || status.lastError;
}

// ---------------------------------------------------------------------------
// Schema / state
// ---------------------------------------------------------------------------

let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = local()
      .query(`
        CREATE SCHEMA IF NOT EXISTS ${S};
        CREATE TABLE IF NOT EXISTS ${S}.data_report (
          id BIGINT PRIMARY KEY,
          row_key TEXT NOT NULL,
          barcode_key TEXT,
          removed BOOLEAN NOT NULL DEFAULT false,
          dup_hidden SMALLINT NOT NULL DEFAULT 0,
          synced_at TIMESTAMPTZ,
          data JSONB NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_offline_dr_barcode ON ${S}.data_report (barcode_key);
        CREATE INDEX IF NOT EXISTS idx_offline_dr_visible ON ${S}.data_report (dup_hidden, id);
        CREATE TABLE IF NOT EXISTS ${S}.data_report_meta (meta_key TEXT PRIMARY KEY, meta_value TEXT);
        CREATE TABLE IF NOT EXISTS ${S}.distribution_reports (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          synced_at TIMESTAMPTZ
        );
        ALTER TABLE ${S}.distribution_reports ADD COLUMN IF NOT EXISTS created_sort TIMESTAMPTZ;
        CREATE TABLE IF NOT EXISTS ${S}.outbox (
          id BIGSERIAL PRIMARY KEY,
          action TEXT NOT NULL,
          payload JSONB NOT NULL,
          user_email TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING',
          attempts INT NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          done_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS ${S}.state (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT now());
      `)
      .then(async () => {
        const { rows } = await local().query(`SELECT value FROM ${S}.state WHERE key = 'dr_watermark'`);
        status.ready = rows.length > 0;
        const last = await getState('last_sync_at');
        if (last) status.lastSyncAt = last;
      })
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}

async function getState(key) {
  const { rows } = await local().query(`SELECT value FROM ${S}.state WHERE key = $1`, [key]);
  return rows[0]?.value ?? null;
}
async function setState(key, value, client = local()) {
  await client.query(
    `INSERT INTO ${S}.state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value == null ? null : String(value)]
  );
}

// ---------------------------------------------------------------------------
// Hostinger → local copy (new / changed rows only)
// ---------------------------------------------------------------------------

async function mysql(sql, params = []) {
  const [rows] = await getMySQLPool().query(sql, params);
  return rows;
}

async function ping() {
  let timer;
  try {
    await Promise.race([
      getMySQLPool().query('SELECT 1'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('Hostinger ping timeout'), { code: 'OFFLINE_PING_TIMEOUT' })), PING_TIMEOUT_MS);
      }),
    ]);
    return true;
  } finally {
    clearTimeout(timer);
  }
}

const DR_RESERVED = new Set([
  'id', 'row_key', 'barcode_key', 'row_hash', 'created_at', 'synced_at', 'removed_at', 'dup_hidden', 'dist_applied', 'dist_orig'
]);
const toDate = (v) => (v instanceof Date ? v : v ? new Date(v) : null);

/** Rows of `table` changed since the stored watermark, in pages, handed to `save`. Returns rows copied. */
async function copyChanged(table, wmKey, idCol, save) {
  const wm = await getState(wmKey);
  let since = wm ? new Date(new Date(wm).getTime() - OVERLAP_MS) : new Date(0);
  let lastId = null;
  let copied = 0;
  let newest = wm ? new Date(wm) : null;
  for (;;) {
    const rows = lastId === null
      ? await mysql(`SELECT * FROM \`${table}\` WHERE synced_at >= ? ORDER BY synced_at, \`${idCol}\` LIMIT ?`, [since, PAGE])
      : await mysql(
          `SELECT * FROM \`${table}\` WHERE synced_at > ? OR (synced_at = ? AND \`${idCol}\` > ?) ORDER BY synced_at, \`${idCol}\` LIMIT ?`,
          [since, since, lastId, PAGE]
        );
    if (!rows.length) break;
    await save(rows);
    copied += rows.length;
    const tail = rows[rows.length - 1];
    since = toDate(tail.synced_at) || since;
    lastId = tail[idCol];
    if (!newest || since > newest) newest = since;
    if (rows.length < PAGE) break;
  }
  if (newest) await setState(wmKey, newest.toISOString());
  return copied;
}

async function syncDataReport() {
  // The meta version moves on every change (rows, duplicates, columns); skip when it hasn't
  const metaRows = await mysql('SELECT meta_key, meta_value FROM `tbl_data_report_meta`');
  const version = metaRows.find((m) => m.meta_key === 'version')?.meta_value ?? '';
  if (status.ready && version === (await getState('dr_version'))) return 0;

  const copied = await copyChanged('tbl_data_report', 'dr_watermark', 'id', async (rows) => {
    const ids = [], keys = [], barcodes = [], removed = [], hidden = [], synced = [], data = [];
    for (const r of rows) {
      const d = {};
      for (const [k, v] of Object.entries(r)) if (!DR_RESERVED.has(k)) d[k] = v == null ? '' : String(v);
      ids.push(r.id);
      keys.push(r.row_key);
      barcodes.push(r.barcode_key);
      removed.push(r.removed_at != null);
      hidden.push(Number(r.dup_hidden) || 0);
      synced.push(toDate(r.synced_at));
      data.push(JSON.stringify(d));
    }
    await local().query(
      `INSERT INTO ${S}.data_report (id, row_key, barcode_key, removed, dup_hidden, synced_at, data)
       SELECT * FROM unnest($1::bigint[], $2::text[], $3::text[], $4::boolean[], $5::smallint[], $6::timestamptz[], $7::jsonb[])
       ON CONFLICT (id) DO UPDATE SET row_key = EXCLUDED.row_key, barcode_key = EXCLUDED.barcode_key, removed = EXCLUDED.removed,
         dup_hidden = EXCLUDED.dup_hidden, synced_at = EXCLUDED.synced_at, data = EXCLUDED.data`,
      [ids, keys, barcodes, removed, hidden, synced, data]
    );
  });

  // Hiding duplicate copies doesn't touch synced_at, so refresh that flag (and drop deleted ids) in one pass
  const flags = await mysql('SELECT id, dup_hidden FROM `tbl_data_report`');
  const client = await local().connect();
  try {
    await client.query('BEGIN');
    const ids = flags.map((f) => f.id);
    await client.query(
      `UPDATE ${S}.data_report d SET dup_hidden = v.h
       FROM unnest($1::bigint[], $2::smallint[]) AS v(id, h) WHERE d.id = v.id AND d.dup_hidden <> v.h`,
      [ids, flags.map((f) => Number(f.dup_hidden) || 0)]
    );
    await client.query(`DELETE FROM ${S}.data_report WHERE NOT (id = ANY($1::bigint[]))`, [ids]);
    await client.query(`DELETE FROM ${S}.data_report_meta`);
    if (metaRows.length) {
      await client.query(`INSERT INTO ${S}.data_report_meta (meta_key, meta_value) SELECT * FROM unnest($1::text[], $2::text[])`, [
        metaRows.map((m) => m.meta_key),
        metaRows.map((m) => (m.meta_value == null ? null : String(m.meta_value))),
      ]);
    }
    await setState('dr_version', version, client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  status.ready = true;
  return copied;
}

/** createdAt as a real time for sorting: ISO, or "YYYY-MM-DD HH:mm:ss" in Cambodia time (UTC+7). */
function sortTime(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v || '').trim();
  if (!s) return null;
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(s);
  const d = new Date(local ? `${local[1]}T${local[2]}+07:00` : s);
  return isNaN(d.getTime()) ? null : d;
}

const distFromRow = (d) => ({
  id: String(d.id),
  barcode: d.barcode || '',
  name: d.name || '',
  date: d.report_date || '',
  report_date: d.report_date || '',
  remarks: d.remarks || '',
  operatorEmail: d.operator_email || '',
  createdBy: d.created_by || 'User',
  createdAt: d.created_at || '',
  updatedAt: d.updated_at || '',
  photoFileId: d.photo_file_id || '',
  photoUrl: d.photo_url || '',
  status: d.status || 'Delivered',
});

async function syncDistribution() {
  const [fp] = await mysql('SELECT COUNT(*) AS n, MAX(synced_at) AS m FROM `tbl_distribution_reports`');
  const fingerprint = `${fp?.n || 0}.${toDate(fp?.m)?.getTime() || 0}`;
  if (fingerprint === (await getState('dist_fingerprint'))) return 0;

  const copied = await copyChanged('tbl_distribution_reports', 'dist_watermark', 'id', async (rows) => {
    await local().query(
      `INSERT INTO ${S}.distribution_reports (id, data, synced_at, created_sort)
       SELECT * FROM unnest($1::text[], $2::jsonb[], $3::timestamptz[], $4::timestamptz[])
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, synced_at = EXCLUDED.synced_at, created_sort = EXCLUDED.created_sort`,
      [
        rows.map((r) => String(r.id)),
        rows.map((r) => JSON.stringify(distFromRow(r))),
        rows.map((r) => toDate(r.synced_at)),
        rows.map((r) => sortTime(r.created_at)),
      ]
    );
  });
  const ids = (await mysql('SELECT id FROM `tbl_distribution_reports`')).map((r) => String(r.id));
  await local().query(`DELETE FROM ${S}.distribution_reports WHERE NOT (id = ANY($1::text[]))`, [ids]);
  await setState('dist_fingerprint', fingerprint);
  return copied;
}

// ---------------------------------------------------------------------------
// Offline writes: outbox
// ---------------------------------------------------------------------------

/**
 * Keep a distribution report save / delete made while Hostinger is down.
 * payload: { reports } for save, { ids, barcode } for delete; plus webAppUrl.
 */
export async function queueDistributionWrite(action, payload, user) {
  await ensureSchema();
  const client = await local().connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO ${S}.outbox (action, payload, user_email) VALUES ($1, $2, $3)`, [
      action,
      JSON.stringify(payload),
      user?.email || null,
    ]);
    if (action === 'save_distribution_report') {
      for (const d of payload.reports) {
        const item = {
          ...distFromRow({}),
          ...d,
          id: String(d.id),
          createdAt: d.createdAt || d.created_at || new Date().toISOString(),
          date: d.report_date || d.date || '',
          report_date: d.report_date || d.date || '',
        };
        // Keep a stored photo when the edit has none (same rule as Hostinger)
        await client.query(
          `INSERT INTO ${S}.distribution_reports (id, data, synced_at, created_sort) VALUES ($1, $2, NULL, $3)
           ON CONFLICT (id) DO UPDATE SET data = ${S}.distribution_reports.data || (EXCLUDED.data - (
             CASE WHEN COALESCE(EXCLUDED.data->>'photoFileId', '') = '' THEN ARRAY['photoFileId', 'photoUrl'] ELSE ARRAY[]::text[] END))`,
          [item.id, JSON.stringify(item), sortTime(item.createdAt)]
        );
      }
    } else {
      await client.query(`DELETE FROM ${S}.distribution_reports WHERE id = ANY($1::text[])`, [payload.ids]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Replay queued writes to Hostinger in order. Stops at the first network error (still offline). */
async function flushOutbox() {
  const { rows } = await local().query(`SELECT * FROM ${S}.outbox WHERE status = 'PENDING' ORDER BY id`);
  if (!rows.length) return 0;
  const handlers = await import('./mysql-master-handlers.js');
  let done = 0;
  for (const job of rows) {
    const p = job.payload || {};
    try {
      if (job.action === 'save_distribution_report') {
        await handlers.saveDistributionReportToMySQL(getMySQLPool(), p.reports, p.webAppUrl || '');
      } else if (job.action === 'delete_distribution_report') {
        await handlers.deleteDistributionReportFromMySQL(getMySQLPool(), p.ids, p.barcode || '', p.webAppUrl || '');
      }
      await local().query(`UPDATE ${S}.outbox SET status = 'DONE', done_at = now(), attempts = attempts + 1 WHERE id = $1`, [job.id]);
      done++;
    } catch (err) {
      if (isNetworkError(err)) {
        markOffline(err);
        break;
      }
      const failed = job.attempts + 1 >= MAX_ATTEMPTS;
      await local().query(
        `UPDATE ${S}.outbox SET attempts = attempts + 1, last_error = $2, status = $3 WHERE id = $1`,
        [job.id, String(err?.message || err).slice(0, 1000), failed ? 'FAILED' : 'PENDING']
      );
      console.error(`[Offline] Outbox #${job.id} (${job.action}) failed:`, err?.message);
      if (!failed) break; // keep order: retry this one next round
    }
  }
  if (done) console.log(`[Offline] ✓ Sent ${done} offline change(s) to Hostinger`);
  return done;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

let lastDataSyncAt = 0;
async function tick() {
  if (status.syncing) return;
  status.syncing = true;
  try {
    await ensureSchema();
    status.lastCheckAt = new Date().toISOString();
    try {
      await ping();
    } catch (err) {
      markOffline(err);
      return;
    }
    const wasOffline = !status.online;
    status.online = true;
    status.lastOnlineAt = new Date().toISOString();
    if (wasOffline) console.log('[Offline] Hostinger reachable again — sending offline changes.');

    await flushOutbox();
    if (!status.online) return;

    if (wasOffline || !status.ready || Date.now() - lastDataSyncAt >= SYNC_INTERVAL_MS) {
      const started = Date.now();
      const dr = await syncDataReport();
      const dist = await syncDistribution();
      lastDataSyncAt = Date.now();
      status.lastSyncAt = new Date().toISOString();
      status.lastError = null;
      await setState('last_sync_at', status.lastSyncAt);
      if (dr || dist) console.log(`[Offline] Local copy updated: Data Report ${dr} row(s), Distribution ${dist} row(s) in ${Date.now() - started} ms`);
    }
  } catch (err) {
    if (isNetworkError(err)) markOffline(err);
    else {
      status.lastError = err?.message || String(err);
      console.error('[Offline] Sync error:', status.lastError);
    }
  } finally {
    status.syncing = false;
  }
}

/** One check + replay + sync now (scripts / tests). */
export async function runOfflineSyncOnce({ force = false } = {}) {
  if (force) lastDataSyncAt = 0;
  await tick();
  return getOfflineStatus();
}

let timer = null;
export function startOfflineSync() {
  if (!status.enabled || timer) return;
  ensureSchema()
    .then(() => {
      console.log('[Offline] ✓ Local Data Report copy enabled (PostgreSQL schema "offline")');
      tick();
      timer = setInterval(tick, CHECK_INTERVAL_MS);
    })
    .catch((err) => {
      status.enabled = false;
      console.warn('[Offline] PostgreSQL not available — offline mode disabled:', err.message);
    });
}
export function stopOfflineSync() {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function getOfflineStatus() {
  const base = { ...status };
  if (!status.enabled) return base;
  try {
    await ensureSchema();
    const { rows } = await local().query(
      `SELECT (SELECT COUNT(*) FROM ${S}.outbox WHERE status = 'PENDING') AS pending,
              (SELECT COUNT(*) FROM ${S}.outbox WHERE status = 'FAILED') AS failed,
              (SELECT COUNT(*) FROM ${S}.data_report WHERE dup_hidden = 0) AS rows`
    );
    return { ...base, pending: Number(rows[0].pending), failed: Number(rows[0].failed), dataReportRows: Number(rows[0].rows) };
  } catch (err) {
    return { ...base, lastError: err.message };
  }
}

// ---------------------------------------------------------------------------
// Local reads (same shapes as data-report-db.js / get_distribution_reports)
// ---------------------------------------------------------------------------

const parseJson = (t, fb) => {
  try {
    return t ? JSON.parse(t) : fb;
  } catch {
    return fb;
  }
};
async function localMeta(keys) {
  const { rows } = await local().query(`SELECT meta_key, meta_value FROM ${S}.data_report_meta WHERE meta_key = ANY($1)`, [keys]);
  const out = {};
  for (const r of rows) out[r.meta_key] = r.meta_value;
  return out;
}
const versionOf = (meta) => parseInt(meta.version || '0', 10) || 0;
const suffixOf = (key) => {
  const m = /#(\d+)$/.exec(String(key));
  return m ? parseInt(m[1], 10) : 1;
};
const findCol = (columns, header) => {
  const want = header.toUpperCase();
  return columns.find((c) => c.label.trim().toUpperCase() === want) || columns.find((c) => c.label.trim().toUpperCase().includes(want));
};
const OFFLINE_FLAG = () => ({ offline: true, offlineSince: status.lastOnlineAt, lastLocalSync: status.lastSyncAt });

export async function localDataReport(action, { offset, limit, barcodes } = {}) {
  await ensureSchema();
  const q = (sql, p) => local().query(sql, p).then((r) => r.rows);

  if (action === 'data_report_db_meta') {
    const meta = await localMeta(['columns', 'row_order', 'version', 'last_sync']);
    const [c] = await q(
      `SELECT COUNT(*) FILTER (WHERE dup_hidden = 0) AS visible, COUNT(*) FILTER (WHERE removed) AS removed FROM ${S}.data_report`
    );
    return {
      ok: true,
      ...OFFLINE_FLAG(),
      version: versionOf(meta),
      total: Number(c.visible),
      removedTotal: Number(c.removed),
      columns: parseJson(meta.columns, []).map((x) => x.label),
      order: meta.row_order ? meta.row_order.split('\n') : [],
      lastSync: parseJson(meta.last_sync, null),
    };
  }
  if (action === 'data_report_db_version' || action === 'data_report_db_sync') {
    const meta = await localMeta(['version', 'last_sync']);
    return { ok: true, ...OFFLINE_FLAG(), version: versionOf(meta), lastSync: parseJson(meta.last_sync, null), skipped: action === 'data_report_db_sync' ? 'offline' : undefined };
  }

  const meta = await localMeta(['columns', 'version']);
  const columns = parseJson(meta.columns, []);

  if (action === 'data_report_db_rows') {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 5000, 1), 5000);
    const off = Math.max(parseInt(offset, 10) || 0, 0);
    if (!columns.length) return { ok: true, ...OFFLINE_FLAG(), version: versionOf(meta), rows: [] };
    const rows = await q(`SELECT row_key, data FROM ${S}.data_report WHERE dup_hidden = 0 ORDER BY id LIMIT $1 OFFSET $2`, [lim, off]);
    return { ok: true, ...OFFLINE_FLAG(), version: versionOf(meta), rows: rows.map((r) => [r.row_key, ...columns.map((c) => r.data[c.db] ?? '')]) };
  }
  if (action === 'data_report_db_lookup') {
    const codes = [...new Set((Array.isArray(barcodes) ? barcodes : []).map((b) => String(b || '').trim().toUpperCase()).filter(Boolean))].slice(0, 1000);
    if (!codes.length || !columns.length) return { ok: true, ...OFFLINE_FLAG(), columns: columns.map((c) => c.label), rows: [] };
    const rows = await q(`SELECT barcode_key, row_key, removed, data FROM ${S}.data_report WHERE barcode_key = ANY($1) AND dup_hidden = 0`, [codes]);
    rows.sort((a, b) => (a.barcode_key === b.barcode_key ? Number(a.removed) - Number(b.removed) || suffixOf(b.row_key) - suffixOf(a.row_key) : 0));
    return { ok: true, ...OFFLINE_FLAG(), columns: columns.map((c) => c.label), rows: rows.map((r) => [r.barcode_key, ...columns.map((c) => r.data[c.db] ?? '')]) };
  }
  if (action === 'data_report_db_destinations' || action === 'data_report_db_status_counts') {
    const col = findCol(columns, action === 'data_report_db_destinations' ? 'DESTINATION' : 'STATUS');
    const rows = col ? await q(`SELECT TRIM(data->>$1) AS v, COUNT(*) AS n FROM ${S}.data_report WHERE dup_hidden = 0 GROUP BY 1`, [col.db]) : [];
    const skip = new Set(['', '-', '—', 'N/A', '#N/A', 'NULL', 'UNDEFINED']);
    if (action === 'data_report_db_destinations') {
      // MySQL's DISTINCT ignores case and zero-width spaces (utf8mb4_unicode_ci): keep one spelling per name
      const byName = new Map();
      for (const r of rows) {
        if (!r.v || skip.has(r.v.toUpperCase())) continue;
        const k = r.v.replace(/[​-‍﻿]/g, '').toLowerCase();
        const cur = byName.get(k);
        if (!cur || Number(r.n) > cur.n) byName.set(k, { v: r.v, n: Number(r.n) });
      }
      return { ok: true, ...OFFLINE_FLAG(), destinations: [...byName.values()].map((x) => x.v).sort() };
    }
    let total = 0;
    const counts = [];
    for (const r of rows) {
      const n = Number(r.n) || 0;
      total += n;
      const v = r.v == null ? '' : String(r.v);
      if (!skip.has(v.toUpperCase())) counts.push({ value: v, count: n });
    }
    counts.sort((a, b) => b.count - a.count);
    return { ok: true, ...OFFLINE_FLAG(), total, counts };
  }
  return null; // not served offline
}

/** Distribution reports from the local copy, with the same user scope as Hostinger. */
export async function localDistributionReports(scopeIds) {
  await ensureSchema();
  const { rows } = await local().query(
    `SELECT data FROM ${S}.distribution_reports ORDER BY created_sort DESC NULLS LAST, data->>'report_date' DESC LIMIT 20000`
  );
  let list = rows.map((r) => r.data);
  if (scopeIds) {
    const allowed = new Set(scopeIds);
    list = list.filter((d) => allowed.has(d.operatorEmail) || allowed.has(d.createdBy));
  }
  return list;
}

/** Does a distribution report with this id exist in the local copy? (Delivery photo rule) */
export async function localDistributionIds(ids) {
  await ensureSchema();
  const { rows } = await local().query(`SELECT id FROM ${S}.distribution_reports WHERE id = ANY($1::text[])`, [ids]);
  return new Set(rows.map((r) => r.id));
}
