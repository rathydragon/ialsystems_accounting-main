/**
 * Google Sheets → Hostinger MySQL copies ("sheet mirrors").
 *
 * Staff type data into Google Sheets; this module copies each sheet into its own MySQL table so
 * the app reads from the database instead of from Google Sheets:
 *
 *   data_report     → tbl_data_report      (sheet «DATA»: Data Report / Warehouse / Distribution)
 *   data_bm         → tbl_data_bm          (sheet «Sort_pending»: Payment Collection, medicine payments)
 *
 * Served as actions on /api/remote-mysql (api/ is already at the Vercel Hobby limit of 12 functions):
 *   data_report_db_meta / _version / _rows / _sync / _lookup / _destinations   (Data Report)
 *   sheet_db_all / sheet_db_sync   with ?dataset=data_bm                       (small sheets)
 *
 * A row that disappears from the sheet gets `removed_at` set; if it comes back, `removed_at` is
 * cleared. `created_at` is when the row was first inserted, `synced_at` when it last changed.
 *   - keepRemoved datasets (tbl_data_report) are the permanent store: rows that left the sheet
 *     are never deleted and pages still show them, so old rows can be cleared from the sheet.
 *   - other datasets hide those rows and delete them PURGE_REMOVED_DAYS later.
 *
 * Google Apps Script in the sheet (docs/gas/data-report-sync.gs) calls the data_report_db_hook
 * action when the sheet changes, so the table stays fresh even when nobody has the app open.
 *
 * Keeping the sync light:
 *   - each row stores a hash of its values, so a run only writes new / changed rows
 *   - writes go in batches of 500 on one connection (the pool has 5)
 *   - GET_LOCK stops two runs (two users, two Vercel instances) from running at once
 *   - runs are throttled (MIN_SYNC_INTERVAL_MS) unless an admin forces one
 *   - a run stops writing after WRITE_BUDGET_MS and the next run continues where it stopped,
 *     so the first import of ~34k rows never hits the function time limit
 *   - row order (newest rows are added at the top of the sheet) is kept as one list in the meta
 *     table, so inserting a row does not renumber 34k rows
 */
import crypto from 'crypto';
import { executeQuery, getMySQLPool } from './remote-mysql.js';

/**
 * Each dataset: its tables, where its sheet is (env var → tbl_settings → default),
 * and which header holds the barcode.
 */
const DATASETS = {
  data_report: {
    name: 'data_report',
    table: 'tbl_data_report',
    meta: 'tbl_data_report_meta',
    lock: 'ial_data_report_sync',
    env: { id: 'DATA_REPORT_SHEET_ID', name: 'DATA_REPORT_SHEET_NAME' },
    settings: { url: 'dataReportSheetUrl', name: 'dataReportSheetName' },
    defaults: { id: '1yiKxEP7LnvIK2UjhrpnnI4YI4tMbMOFe8hF4dmSSKn8', name: 'DATA' },
    keyLabels: ['BARCODE'],
    keepRemoved: true
  },
  data_bm: {
    name: 'data_bm',
    table: 'tbl_data_bm',
    meta: 'tbl_data_bm_meta',
    lock: 'ial_data_bm_sync',
    env: { id: 'DATA_BM_SHEET_ID', name: 'DATA_BM_SHEET_NAME' },
    settings: { url: 'dataBmSheetUrl', name: 'dataBmSheetName' },
    defaults: { id: '1C-CYb14ZM146RiD87yjS_rxGmWk1hiB4jkoTDT6O-I8', name: 'Sort_pending' },
    keyLabels: ['AWBN', 'AWB', 'BARCODE', 'TRACKING']
  }
};
const DR = DATASETS.data_report;
/** Datasets served whole in one response (small sheets) through sheet_db_* actions. */
const SMALL_DATASETS = new Set(['data_bm']);
const MAX_ALL_ROWS = 20000;

const MIN_SYNC_INTERVAL_MS = 2 * 60 * 1000;
/** Sheet webhook (Apps Script): the script already waits between calls, this only stops a flood. */
const HOOK_MIN_INTERVAL_MS = 10 * 1000;
const WRITE_BUDGET_MS = 20 * 1000;
const UPSERT_BATCH = 500;
const REMOVE_BATCH = 1000;
/** Rows that left the sheet are kept this long (in case they come back), then deleted. */
const PURGE_REMOVED_DAYS = 30;
const PURGE_BATCH = 5000;
const MAX_CHUNK = 5000;
const MAX_LOOKUP = 1000;

/** Columns the module owns; sheet columns can never take these names. */
const RESERVED = new Set(['id', 'row_key', 'barcode_key', 'row_hash', 'created_at', 'synced_at', 'removed_at']);

const shortName = (ds) => ds.table.replace(/^tbl_/, '');

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** MySQL has no ADD COLUMN IF NOT EXISTS; a duplicate-column error means it is already there. */
async function addColumnIfMissing(ds, column, definition) {
  try {
    await executeQuery(`ALTER TABLE \`${ds.table}\` ADD COLUMN \`${column}\` ${definition}`);
  } catch (err) {
    if (err?.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

const tablesReady = new Map();
function ensureTables(ds) {
  if (!tablesReady.has(ds.name)) {
    const ix = shortName(ds);
    const p = executeQuery(`
      CREATE TABLE IF NOT EXISTS \`${ds.table}\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`row_key\` VARCHAR(191) NOT NULL,
        \`barcode_key\` VARCHAR(191) NULL DEFAULT NULL,
        \`row_hash\` CHAR(40) NOT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`synced_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`removed_at\` TIMESTAMP NULL DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_${ix}_row_key\` (\`row_key\`),
        INDEX \`idx_${ix}_barcode\` (\`barcode_key\`),
        INDEX \`idx_${ix}_removed\` (\`removed_at\`),
        INDEX \`idx_${ix}_created\` (\`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
      // Tables created before created_at / removed_at / barcode_key existed
      .then(() => addColumnIfMissing(ds, 'created_at', `TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER \`row_hash\`, ADD INDEX \`idx_${ix}_created\` (\`created_at\`)`))
      .then(() => addColumnIfMissing(ds, 'removed_at', `TIMESTAMP NULL DEFAULT NULL AFTER \`synced_at\`, ADD INDEX \`idx_${ix}_removed\` (\`removed_at\`)`))
      // barcode_key = the barcode without the "#2" suffix, so pages can look rows up by barcode
      .then(() => addColumnIfMissing(ds, 'barcode_key', `VARCHAR(191) NULL DEFAULT NULL AFTER \`row_key\`, ADD INDEX \`idx_${ix}_barcode\` (\`barcode_key\`)`))
      .then(() =>
        executeQuery(`UPDATE \`${ds.table}\` SET barcode_key = SUBSTRING_INDEX(row_key, '#', 1) WHERE barcode_key IS NULL`)
      )
      .then(() =>
        executeQuery(`
          CREATE TABLE IF NOT EXISTS \`${ds.meta}\` (
            \`meta_key\` VARCHAR(64) NOT NULL,
            \`meta_value\` MEDIUMTEXT,
            \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (\`meta_key\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `)
      )
      .catch((err) => {
        tablesReady.delete(ds.name); // retry on next request
        throw err;
      });
    tablesReady.set(ds.name, p);
  }
  return tablesReady.get(ds.name);
}

async function getMeta(ds, keys) {
  const { rows } = await executeQuery(`SELECT meta_key, meta_value FROM \`${ds.meta}\` WHERE meta_key IN (?)`, [keys]);
  const out = {};
  for (const r of rows) out[r.meta_key] = r.meta_value;
  return out;
}

async function setMeta(ds, conn, entries) {
  const list = Object.entries(entries);
  if (!list.length) return;
  await conn.query(
    `INSERT INTO \`${ds.meta}\` (meta_key, meta_value) VALUES ${list.map(() => '(?, ?)').join(',')}
     ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
    list.flatMap(([k, v]) => [k, v])
  );
}

function parseJson(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

const versionOf = (meta) => parseInt(meta.version || '0', 10) || 0;

// ---------------------------------------------------------------------------
// Google Sheet → rows
// ---------------------------------------------------------------------------

/** RFC 4180 CSV parser (same rules as the frontend's parseCSV). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let val = '';
  let inQuotes = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          val += '"';
          i++;
        } else inQuotes = false;
      } else val += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(val);
      val = '';
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(val);
      rows.push(row);
      row = [];
      val = '';
    } else val += c;
  }
  if (val || row.length) {
    row.push(val);
    rows.push(row);
  }
  return rows;
}

/** "PICK UP" → pick_up, "RE-DEST" → re_dest; unique, safe as a MySQL column name. */
export function toDbColumnNames(labels) {
  const used = new Set(RESERVED);
  return labels.map((label, idx) => {
    let base = String(label || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 56);
    if (!base) base = `col_${idx + 1}`;
    if (/^[0-9]/.test(base)) base = `c_${base}`;
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
    used.add(name);
    return name;
  });
}

/** Same clean-up the app applies to scanned barcodes (invisible characters, quotes), upper-cased. */
export function cleanBarcode(raw) {
  return String(raw ?? '')
    .replace(/[​-‍﻿\u0000-\u001F\u007F-\u009F]/g, '')
    .trim()
    .replace(/^["'([{<]+|["')\]}>]+$/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Header + rows → what goes into the table (records stay in sheet order, top to bottom).
 * row_key is the barcode (first header found in keyLabels). The same barcode can be on several
 * rows (different parcels), so duplicates get "#2", "#3"… counted from the BOTTOM of the sheet:
 * new rows are added at the top, so older rows keep the key they already have.
 * Fully empty rows are skipped, like the pages do.
 */
export function buildRecords(table, keyLabels = ['BARCODE']) {
  const header = table[0] || [];
  const labels = header.map((h, idx) => (h && h.trim()) || `ជួរឈរ ${idx + 1}`);
  const dbNames = toDbColumnNames(labels);
  const upper = labels.map((l) => l.trim().toUpperCase());
  let barcodeIdx = -1;
  for (const k of keyLabels) {
    barcodeIdx = upper.indexOf(k);
    if (barcodeIdx >= 0) break;
  }

  const records = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r] || [];
    const values = labels.map((_, c) => (cells[c] !== undefined && cells[c] !== null ? String(cells[c]).trim() : ''));
    if (!values.some((v) => v !== '')) continue;
    const hash = crypto.createHash('sha1').update(JSON.stringify(values)).digest('hex');
    records.push({ rowKey: '', barcodeKey: '', hash, values });
  }

  const seen = new Map();
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i];
    const base = (barcodeIdx >= 0 ? cleanBarcode(rec.values[barcodeIdx]) : '') || 'NO_BARCODE';
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    rec.barcodeKey = base.slice(0, 191);
    rec.rowKey = (n === 1 ? base : `${base}#${n}`).slice(0, 191);
  }
  return { columns: labels.map((label, i) => ({ label, db: dbNames[i] })), records };
}

const suffixOf = (key) => {
  const m = /#(\d+)$/.exec(String(key));
  return m ? parseInt(m[1], 10) : 1;
};

/**
 * For keepRemoved datasets: give each sheet row the key it already has in MySQL, so a row is never
 * written over another row's data. buildRecords numbers duplicate barcodes by position, and that
 * shifts when an old duplicate is deleted from the sheet. Here a row keeps its key when its values
 * match a stored row; an edited row keeps its position key while that stored row is still in the
 * sheet; anything else gets a new number above every number used before. Rows that left the
 * sheet are only matched by identical values, so their stored data is never replaced.
 * @param {Array<{rowKey:string, barcodeKey:string, hash:string}>} records changed in place
 * @param {Array<{row_key:string, barcode_key?:string, row_hash:string, is_removed:any}>} existingRows
 */
export function assignStableKeys(records, existingRows) {
  const stored = new Map();
  for (const r of existingRows) {
    const base = r.barcode_key || String(r.row_key).split('#')[0];
    if (!stored.has(base)) stored.set(base, []);
    stored.get(base).push(r);
  }
  const groups = new Map();
  for (const rec of records) {
    if (!groups.has(rec.barcodeKey)) groups.set(rec.barcodeKey, []);
    groups.get(rec.barcodeKey).push(rec);
  }

  for (const [base, recs] of groups) {
    const ex = stored.get(base);
    if (!ex) continue; // new barcode: nothing stored to clash with
    // one row, one stored row with the same key, still in the sheet or unchanged: keep it
    if (
      recs.length === 1 &&
      ex.length === 1 &&
      ex[0].row_key === recs[0].rowKey &&
      (!Number(ex[0].is_removed) || ex[0].row_hash === recs[0].hash)
    ) {
      continue;
    }

    const exByKey = new Map(ex.map((e) => [e.row_key, e]));
    const used = new Set();
    const assigned = new Array(recs.length).fill(null);
    const take = (i, key) => {
      assigned[i] = key;
      used.add(key);
    };

    // 1. same key, same values
    recs.forEach((rec, i) => {
      const e = exByKey.get(rec.rowKey);
      if (e && e.row_hash === rec.hash) take(i, rec.rowKey);
    });
    // 2. same values under another key (an older duplicate was deleted, so numbers shifted)
    const byHash = new Map();
    for (const e of ex) {
      if (used.has(e.row_key)) continue;
      if (!byHash.has(e.row_hash)) byHash.set(e.row_hash, []);
      byHash.get(e.row_hash).push(e.row_key);
    }
    recs.forEach((rec, i) => {
      if (assigned[i]) return;
      const list = byHash.get(rec.hash);
      while (list && list.length) {
        const key = list.shift();
        if (!used.has(key)) {
          take(i, key);
          break;
        }
      }
    });
    // 3. an edited row keeps its position key, only while that stored row is still in the sheet
    recs.forEach((rec, i) => {
      if (assigned[i]) return;
      const e = exByKey.get(rec.rowKey);
      if (e && !used.has(e.row_key) && !Number(e.is_removed)) take(i, rec.rowKey);
    });
    // 4. new rows: numbers above every number used so far, oldest (bottom) first
    let max = Math.max(...ex.map((e) => suffixOf(e.row_key)));
    for (let i = recs.length - 1; i >= 0; i--) {
      if (assigned[i]) continue;
      max += 1;
      take(i, `${base}#${max}`.slice(0, 191));
    }
    recs.forEach((rec, i) => {
      rec.rowKey = assigned[i];
    });
  }
  return records;
}

/** Spreadsheet id from a full Google Sheets link or a raw id. */
export function spreadsheetIdFrom(input) {
  const s = String(input || '').trim();
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(s);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(s) ? s : '';
}

/** Where the sheet is: env var, else the link saved in the app settings (tbl_settings), else default. */
async function sheetSource(ds) {
  const envId = spreadsheetIdFrom(process.env[ds.env.id]);
  const envName = String(process.env[ds.env.name] || '').trim();
  let setId = '';
  let setName = '';
  try {
    const keys = [ds.settings.url, ds.settings.name].filter(Boolean);
    const { rows } = await executeQuery('SELECT setting_key, setting_value FROM tbl_settings WHERE setting_key IN (?)', [keys]);
    for (const r of rows) {
      if (r.setting_key === ds.settings.url) setId = spreadsheetIdFrom(r.setting_value);
      if (r.setting_key === ds.settings.name) setName = String(r.setting_value || '').trim();
    }
  } catch {
    // no settings table → defaults
  }
  return { id: envId || setId || ds.defaults.id, name: envName || setName || ds.defaults.name };
}

/** Same Google endpoint the pages read (gviz, displayed values), as CSV. */
async function fetchSheetTable(ds) {
  const { id, name } = await sheetSource(ds);
  const url =
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq` +
    `?tqx=out:csv&headers=1&sheet=${encodeURIComponent(name)}&t=${Date.now()}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    const text = await res.text();
    if (!res.ok) throw new Error(`Google Sheets HTTP ${res.status}`);
    if (/^\s*</.test(text)) {
      throw new Error('Google Sheets មិនអនុញ្ញាតឲ្យអាន (សូម Share: Anyone with the link can view)');
    }
    return parseCsv(text);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

async function ensureDataColumns(ds, conn, columns) {
  const [existing] = await conn.query(`SHOW COLUMNS FROM \`${ds.table}\``);
  const have = new Set(existing.map((c) => c.Field));
  const missing = columns.filter((c) => !have.has(c.db));
  if (missing.length) {
    await conn.query(`ALTER TABLE \`${ds.table}\` ${missing.map((c) => `ADD COLUMN \`${c.db}\` TEXT NULL`).join(', ')}`);
  }
  return missing.map((c) => c.label);
}

/**
 * Pull a sheet and bring its MySQL table in line with it (insert new rows, update changed rows,
 * mark rows that left the sheet as removed).
 * @param {object} ds dataset from DATASETS
 * @param {{ force?: boolean, budgetMs?: number }} opts
 */
async function syncSheet(ds, { force = false, budgetMs = WRITE_BUDGET_MS, minIntervalMs = MIN_SYNC_INTERVAL_MS } = {}) {
  const started = Date.now();
  await ensureTables(ds);

  // Skipped runs still return the data version, so pages can reload rows another user's sync wrote.
  const skip = async (reason) => {
    const meta = await getMeta(ds, ['version', 'last_sync']);
    return { ok: true, skipped: reason, version: versionOf(meta), lastSync: parseJson(meta.last_sync, null) };
  };

  if (!force) {
    const meta = await getMeta(ds, ['last_sync']);
    const last = parseJson(meta.last_sync, null);
    if (last?.at && !last.partial && Date.now() - new Date(last.at).getTime() < minIntervalMs) {
      return skip('recent');
    }
  }

  const conn = await getMySQLPool().getConnection();
  let locked = false;
  try {
    const [[lockRow]] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [ds.lock]);
    locked = lockRow?.got === 1;
    if (!locked) return skip('running');

    const table = await fetchSheetTable(ds);
    const fetchedMs = Date.now() - started;
    const { columns, records } = buildRecords(table, ds.keyLabels);
    if (!columns.length) throw new Error('Google Sheet គ្មាន Header');

    const addedColumns = await ensureDataColumns(ds, conn, columns);

    const [existingRows] = await conn.query(
      `SELECT row_key, barcode_key, row_hash, (removed_at IS NOT NULL) AS is_removed FROM \`${ds.table}\``
    );
    const existing = new Map(existingRows.map((r) => [r.row_key, r]));
    const activeCount = existingRows.filter((r) => !Number(r.is_removed)).length;
    if (ds.keepRemoved) assignStableKeys(records, existingRows);

    // A sheet that suddenly has far fewer rows is more likely a bad read than a real mass delete.
    // keepRemoved datasets lose nothing when rows leave the sheet, so only an empty read stops
    // them (staff may clear many old rows from the sheet at once).
    const tooFew = ds.keepRemoved ? records.length === 0 : records.length < activeCount * 0.5;
    if (activeCount > 100 && tooFew) {
      throw new Error(
        `ទិន្នន័យពី Sheet មានតែ ${records.length} ជួរ (MySQL មាន ${activeCount}) — បានបញ្ឈប់ដើម្បីការពារទិន្នន័យ`
      );
    }

    // New rows, changed rows, and rows that were removed from the sheet but came back
    const changed = records.filter((r) => {
      const ex = existing.get(r.rowKey);
      return !ex || ex.row_hash !== r.hash || Number(ex.is_removed);
    });
    const sheetKeys = new Set(records.map((r) => r.rowKey));
    // Rows no longer in the sheet are only marked (removed_at), never deleted
    const removed = existingRows.filter((r) => !Number(r.is_removed) && !sheetKeys.has(r.row_key)).map((r) => r.row_key);

    const meta = await getMeta(ds, ['order_hash', 'columns', 'version', ...(ds.keepRemoved ? ['row_order'] : [])]);
    let version = versionOf(meta);
    const bump = async (extra = {}) => {
      version += 1;
      await setMeta(ds, conn, { version: String(version), ...extra });
    };

    // Column list and row order first, so readers see the new layout as soon as rows land.
    const columnsJson = JSON.stringify(columns);
    const orderKeys = records.map((r) => r.rowKey);
    if (ds.keepRemoved) {
      // Rows that left the sheet stay listed after the sheet rows, in the order they had before
      const prevIndex = new Map((meta.row_order ? meta.row_order.split('\n') : []).map((k, i) => [k, i]));
      const pos = (k) => (prevIndex.has(k) ? prevIndex.get(k) : Number.MAX_SAFE_INTEGER);
      const gone = existingRows.map((r) => r.row_key).filter((k) => !sheetKeys.has(k));
      gone.sort((a, b) => pos(a) - pos(b));
      orderKeys.push(...gone);
    }
    const orderText = orderKeys.join('\n');
    const orderHash = crypto.createHash('sha1').update(orderText).digest('hex');
    const layoutChanged = meta.columns !== columnsJson || meta.order_hash !== orderHash;
    if (layoutChanged) {
      await setMeta(ds, conn, { columns: columnsJson, row_order: orderText, order_hash: orderHash });
    }

    // Upsert changed rows within the time budget.
    const colList = ['row_key', 'barcode_key', 'row_hash', ...columns.map((c) => c.db)];
    const colSql = colList.map((c) => `\`${c}\``).join(', ');
    const updateSql = [...colList.slice(1).map((c) => `\`${c}\` = VALUES(\`${c}\`)`), '`removed_at` = NULL'].join(', ');
    const rowPlaceholders = `(${colList.map(() => '?').join(', ')})`;
    let written = 0;
    for (let i = 0; i < changed.length; i += UPSERT_BATCH) {
      if (Date.now() - started > budgetMs) break;
      const batch = changed.slice(i, i + UPSERT_BATCH);
      await conn.query(
        `INSERT INTO \`${ds.table}\` (${colSql}) VALUES ${batch.map(() => rowPlaceholders).join(', ')}
         ON DUPLICATE KEY UPDATE ${updateSql}`,
        batch.flatMap((r) => [r.rowKey, r.barcodeKey, r.hash, ...r.values])
      );
      written += batch.length;
      await bump(); // readers pick up progress even if the function is stopped mid-run
    }

    let removedCount = 0;
    for (let i = 0; i < removed.length; i += REMOVE_BATCH) {
      if (Date.now() - started > budgetMs) break;
      const batch = removed.slice(i, i + REMOVE_BATCH);
      await conn.query(
        `UPDATE \`${ds.table}\` SET removed_at = CURRENT_TIMESTAMP WHERE row_key IN (?) AND removed_at IS NULL`,
        [batch]
      );
      removedCount += batch.length;
    }

    // Delete rows that left the sheet more than PURGE_REMOVED_DAYS ago. Pages never read them,
    // so this needs no version bump. Done in limited batches to keep each DELETE short.
    let purged = 0;
    while (!ds.keepRemoved && Date.now() - started <= budgetMs) {
      const [res] = await conn.query(
        `DELETE FROM \`${ds.table}\` WHERE removed_at IS NOT NULL AND removed_at < NOW() - INTERVAL ? DAY LIMIT ?`,
        [PURGE_REMOVED_DAYS, PURGE_BATCH]
      );
      purged += res.affectedRows || 0;
      if ((res.affectedRows || 0) < PURGE_BATCH) break;
    }

    const partial = written < changed.length || removedCount < removed.length;
    const insertedWritten = changed.slice(0, written).filter((r) => !existing.has(r.rowKey)).length;
    const lastSync = {
      at: new Date().toISOString(),
      sheetRows: records.length,
      written,
      inserted: insertedWritten,
      updated: written - insertedWritten,
      removed: removedCount,
      purged,
      remaining: changed.length - written + (removed.length - removedCount),
      addedColumns,
      partial,
      fetchMs: fetchedMs,
      totalMs: Date.now() - started
    };
    if (written === 0 && (removedCount > 0 || layoutChanged)) await bump({ last_sync: JSON.stringify(lastSync) });
    else await setMeta(ds, conn, { last_sync: JSON.stringify(lastSync) });

    return { ok: true, ...lastSync, version };
  } finally {
    if (locked) {
      try {
        await conn.query('SELECT RELEASE_LOCK(?)', [ds.lock]);
      } catch {}
    }
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

async function readMeta(ds) {
  await ensureTables(ds);
  const meta = await getMeta(ds, ['columns', 'row_order', 'version', 'last_sync']);
  const { rows } = await executeQuery(
    `SELECT SUM(removed_at IS NULL) AS active, SUM(removed_at IS NOT NULL) AS removed FROM \`${ds.table}\``
  );
  const active = Number(rows[0]?.active || 0);
  return {
    ok: true,
    version: versionOf(meta),
    // keepRemoved: rows that left the sheet are still served
    total: ds.keepRemoved ? active + Number(rows[0]?.removed || 0) : active,
    removedTotal: Number(rows[0]?.removed || 0),
    columns: parseJson(meta.columns, []).map((c) => c.label),
    order: meta.row_order ? meta.row_order.split('\n') : [],
    lastSync: parseJson(meta.last_sync, null)
  };
}

async function readVersion(ds) {
  await ensureTables(ds);
  const meta = await getMeta(ds, ['version', 'last_sync']);
  return { ok: true, version: versionOf(meta), lastSync: parseJson(meta.last_sync, null) };
}

/** Rows pages see: every row for keepRemoved datasets, otherwise only rows still in the sheet. */
const visibleWhere = (ds) => (ds.keepRemoved ? '1=1' : '`removed_at` IS NULL');

/** One chunk of visible rows as arrays [row_key, ...values] in the meta column order. */
async function readRows(ds, { offset = 0, limit = MAX_CHUNK } = {}) {
  await ensureTables(ds);
  const meta = await getMeta(ds, ['columns', 'version']);
  const columns = parseJson(meta.columns, []);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || MAX_CHUNK, 1), MAX_CHUNK);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  if (!columns.length) return { ok: true, version: versionOf(meta), rows: [] };

  const { rows } = await executeQuery(
    `SELECT \`row_key\`, ${columns.map((c) => `\`${c.db}\``).join(', ')}
     FROM \`${ds.table}\` WHERE ${visibleWhere(ds)} ORDER BY \`id\` LIMIT ? OFFSET ?`,
    [safeLimit, safeOffset]
  );
  return { ok: true, version: versionOf(meta), rows: rows.map((r) => [r.row_key, ...columns.map((c) => r[c.db] ?? '')]) };
}

/**
 * A whole small sheet in one response, in sheet order:
 * { columns: [labels], rows: [[...values]], version, lastSync }.
 */
async function readAll(ds) {
  await ensureTables(ds);
  const meta = await getMeta(ds, ['columns', 'row_order', 'version', 'last_sync']);
  const columns = parseJson(meta.columns, []);
  const base = { ok: true, version: versionOf(meta), lastSync: parseJson(meta.last_sync, null) };
  if (!columns.length) return { ...base, columns: [], rows: [] };

  const { rows } = await executeQuery(
    `SELECT \`row_key\`, ${columns.map((c) => `\`${c.db}\``).join(', ')}
     FROM \`${ds.table}\` WHERE ${visibleWhere(ds)} ORDER BY \`id\` LIMIT ?`,
    [MAX_ALL_ROWS]
  );
  const byKey = new Map(rows.map((r) => [r.row_key, r]));
  const ordered = [];
  for (const key of meta.row_order ? meta.row_order.split('\n') : []) {
    const r = byKey.get(key);
    if (r) {
      ordered.push(r);
      byKey.delete(key);
    }
  }
  ordered.push(...byKey.values());
  return {
    ...base,
    columns: columns.map((c) => c.label),
    rows: ordered.map((r) => columns.map((c) => r[c.db] ?? ''))
  };
}

/**
 * Rows for a list of barcodes (indexed lookup). Every row with that barcode is returned:
 * rows still in the sheet first, then newest first (the highest "#n" is the row added last).
 */
async function lookupBarcodes(ds, barcodes) {
  await ensureTables(ds);
  const codes = [...new Set((Array.isArray(barcodes) ? barcodes : []).map(cleanBarcode).filter(Boolean))].slice(0, MAX_LOOKUP);
  const meta = await getMeta(ds, ['columns']);
  const columns = parseJson(meta.columns, []);
  if (!codes.length || !columns.length) return { ok: true, columns: columns.map((c) => c.label), rows: [] };

  const { rows } = await executeQuery(
    `SELECT \`barcode_key\`, \`row_key\`, (\`removed_at\` IS NOT NULL) AS is_removed, ${columns.map((c) => `\`${c.db}\``).join(', ')}
     FROM \`${ds.table}\` WHERE \`barcode_key\` IN (?) AND ${visibleWhere(ds)}`,
    [codes]
  );
  rows.sort((a, b) =>
    a.barcode_key === b.barcode_key
      ? Number(a.is_removed) - Number(b.is_removed) || suffixOf(b.row_key) - suffixOf(a.row_key)
      : 0
  );
  return {
    ok: true,
    columns: columns.map((c) => c.label),
    rows: rows.map((r) => [r.barcode_key, ...columns.map((c) => r[c.db] ?? '')])
  };
}

/** Distinct values of one column (by header name) among visible rows. */
async function distinctValues(ds, headerName) {
  await ensureTables(ds);
  const meta = await getMeta(ds, ['columns']);
  const columns = parseJson(meta.columns, []);
  const want = headerName.toUpperCase();
  const col =
    columns.find((c) => c.label.trim().toUpperCase() === want) ||
    columns.find((c) => c.label.trim().toUpperCase().includes(want));
  if (!col) return [];
  const { rows } = await executeQuery(
    `SELECT DISTINCT TRIM(\`${col.db}\`) AS d FROM \`${ds.table}\`
     WHERE ${visibleWhere(ds)} AND \`${col.db}\` IS NOT NULL AND TRIM(\`${col.db}\`) <> ''`
  );
  const skip = new Set(['-', '—', 'N/A', '#N/A', 'NULL', 'UNDEFINED']);
  return rows.map((r) => r.d).filter((d) => d && !skip.has(String(d).toUpperCase())).sort();
}

// ---------------------------------------------------------------------------
// Data Report exports (names kept for existing callers and tests)
// ---------------------------------------------------------------------------

export const ensureDataReportTables = () => ensureTables(DR);
export const syncDataReportFromSheet = (opts) => syncSheet(DR, opts);
export const getDataReportMeta = () => readMeta(DR);
export const getDataReportVersion = () => readVersion(DR);
export const getDataReportRows = (opts) => readRows(DR, opts);
export const lookupDataReportBarcodes = (barcodes) => lookupBarcodes(DR, barcodes);
export async function getDataReportDestinationList() {
  return { ok: true, destinations: await distinctValues(DR, 'DESTINATION') };
}

// Other datasets (used by tests / scripts)
export const syncSheetDataset = (name, opts) => syncSheet(DATASETS[name], opts);
export const readSheetDataset = (name) => readAll(DATASETS[name]);

// ---------------------------------------------------------------------------
// Action router (called from remote-mysql.js)
// ---------------------------------------------------------------------------

export const DATA_REPORT_DB_ACTIONS = [
  'data_report_db_meta',
  'data_report_db_version',
  'data_report_db_rows',
  'data_report_db_sync',
  'data_report_db_lookup',
  'data_report_db_destinations'
];
export const SHEET_DB_ACTIONS = ['sheet_db_all', 'sheet_db_sync'];

const isAdmin = (req) => String(req.user?.role || '').toUpperCase() === 'ADMIN';

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
}

/**
 * Sheet webhook, called without a user login by Google Apps Script in the DATA sheet
 * (docs/gas/data-report-sync.gs): POST /api/remote-mysql?action=data_report_db_hook with header
 * "X-Sync-Key: <SHEET_SYNC_SECRET>". Disabled until SHEET_SYNC_SECRET is set.
 */
export const DATA_REPORT_HOOK_ACTION = 'data_report_db_hook';
export async function handleDataReportHook(req, url) {
  const secret = String(process.env.SHEET_SYNC_SECRET || '').trim();
  if (secret.length < 24) return [503, { ok: false, message: 'SHEET_SYNC_SECRET is not set' }];
  const given = req.headers?.['x-sync-key'] || url.searchParams.get('key');
  if (!safeEqual(given, secret)) return [401, { ok: false, message: 'Unauthorized' }];
  if (req.method !== 'POST') return [405, { ok: false, message: 'Method not allowed' }];
  try {
    return [200, await syncSheet(DR, { minIntervalMs: HOOK_MIN_INTERVAL_MS })];
  } catch (err) {
    console.error('[Sheet DB hook]', err?.message);
    return [500, { ok: false, message: err?.message || 'Sheet DB error' }];
  }
}

export async function handleDataReportDbAction(req, action, url) {
  try {
    if (action === 'data_report_db_meta') return [200, await readMeta(DR)];
    if (action === 'data_report_db_version') return [200, await readVersion(DR)];
    if (action === 'data_report_db_rows') {
      return [200, await readRows(DR, { offset: url.searchParams.get('offset'), limit: url.searchParams.get('limit') })];
    }
    if (action === 'data_report_db_lookup') {
      if (req.method !== 'POST') return [405, { ok: false, message: 'Method not allowed' }];
      return [200, await lookupBarcodes(DR, req.body?.barcodes)];
    }
    if (action === 'data_report_db_destinations') return [200, await getDataReportDestinationList()];
    if (action === 'data_report_db_sync') {
      if (req.method !== 'POST') return [405, { ok: false, message: 'Method not allowed' }];
      return [200, await syncSheet(DR, { force: Boolean(req.body?.force) && isAdmin(req) })];
    }

    // Small sheets (Payment Collection): ?dataset=data_bm
    if (SHEET_DB_ACTIONS.includes(action)) {
      const name = url.searchParams.get('dataset') || req.body?.dataset;
      if (!SMALL_DATASETS.has(name)) return [400, { ok: false, message: 'Unknown dataset' }];
      const ds = DATASETS[name];
      if (action === 'sheet_db_all') return [200, await readAll(ds)];
      if (req.method !== 'POST') return [405, { ok: false, message: 'Method not allowed' }];
      return [200, await syncSheet(ds, { force: Boolean(req.body?.force) && isAdmin(req) })];
    }
    return [400, { ok: false, message: 'Unknown action' }];
  } catch (err) {
    console.error('[Sheet DB]', action, err?.message);
    return [500, { ok: false, message: err?.message || 'Sheet DB error' }];
  }
}
