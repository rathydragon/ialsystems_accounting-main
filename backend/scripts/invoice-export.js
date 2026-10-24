/**
 * Daily export of tbl_invoice_numbers (stored ONLY in local PostgreSQL, not Hostinger)
 * into a OneDrive folder, so OneDrive keeps a copy in the cloud.
 *
 * - Uses pg_dump custom format (compressed, exact: restore with pg_restore).
 * - Written to a temp file first, then moved in, so OneDrive never uploads half a file.
 * - Keeps the newest KEEP_DAYS days of files.
 *
 * Restore: see README_RESTORE.txt written next to the files.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { getPgConfig } from './hostinger-mirror.js';
import { readSchedule, writeSchedule } from './backup-schedule.js';

export const INVOICE_TABLE = 'tbl_invoice_numbers';
const KEEP_DAYS = 14;
const FILE_PREFIX = 'invoice_numbers_';

export function getExportDir() {
  if (process.env.INVOICE_EXPORT_DIR) return process.env.INVOICE_EXPORT_DIR;
  const oneDrive = process.env.OneDrive || process.env.OneDriveConsumer || path.join(os.homedir(), 'OneDrive');
  return path.join(oneDrive, 'IAL_Backups', 'invoice_numbers');
}

function findPgDump() {
  if (process.env.PG_DUMP_PATH && fs.existsSync(process.env.PG_DUMP_PATH)) return process.env.PG_DUMP_PATH;
  if (process.platform === 'win32') {
    const base = 'C:\\Program Files\\PostgreSQL';
    try {
      const versions = fs.readdirSync(base).filter((v) => /^\d+/.test(v)).sort((a, b) => parseFloat(b) - parseFloat(a));
      for (const v of versions) {
        const exe = path.join(base, v, 'bin', 'pg_dump.exe');
        if (fs.existsSync(exe)) return exe;
      }
    } catch {}
  }
  return 'pg_dump';
}

const README = `IAL Systems - Backup លេខវិក្កយបត្រ (tbl_invoice_numbers)
=========================================================
File ទាំងនេះបង្កើតដោយស្វ័យប្រវត្តិ ១ ដងក្នុង ១ ថ្ងៃ (រក្សាទុក ${KEEP_DAYS} ថ្ងៃចុងក្រោយ)។
តារាងនេះមាននៅ Local PostgreSQL តែប៉ុណ្ណោះ (មិនមាននៅ Hostinger) ដូច្នេះ File ទាំងនេះជាច្បាប់ចម្លងតែមួយគត់។

របៀប Restore (ដាក់ទិន្នន័យត្រឡប់មកវិញ) — បើក Command Prompt:

  cd "C:\\Program Files\\PostgreSQL\\18\\bin"
  psql -h localhost -U postgres -d ialsystems_backup -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"
  pg_restore -h localhost -U postgres -d ialsystems_backup --clean --if-exists --no-owner "<ឈ្មោះ file>.dump"

ចំណាំ៖ --clean ជំនួសតារាង tbl_invoice_numbers បច្ចុប្បន្នទាំងស្រុងដោយទិន្នន័យក្នុង file។
បើចង់សាកមើលមុន សូម Restore ចូល Database ថ្មីមួយ (ឧ. -d ial_restore_test) ជាមុនសិន។
`;

const localDateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Export files, newest first. */
export function listExportFiles() {
  const dir = getExportDir();
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.startsWith(FILE_PREFIX) && f.endsWith('.dump'))
      .map((f) => {
        const st = fs.statSync(path.join(dir, f));
        return { file: f, path: path.join(dir, f), sizeBytes: st.size, at: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.at < b.at ? 1 : -1));
  } catch {
    return [];
  }
}

/** Due when no export has been made today. */
export function isInvoiceExportDue(now = new Date()) {
  const today = localDateKey(now);
  return !listExportFiles().some((f) => f.file.startsWith(`${FILE_PREFIX}${today}`));
}

function removeOldFiles() {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 3600000;
  let removed = 0;
  for (const f of listExportFiles()) {
    if (new Date(f.at).getTime() < cutoff) {
      try { fs.unlinkSync(f.path); removed++; } catch {}
    }
  }
  return removed;
}

export async function exportInvoiceNumbers({ log = () => {} } = {}) {
  const started = Date.now();
  const cfg = getPgConfig();
  const dir = getExportDir();
  const now = new Date();
  const stamp = `${localDateKey(now)}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const fileName = `${FILE_PREFIX}${stamp}.dump`;
  const finalPath = path.join(dir, fileName);
  const tempPath = path.join(os.tmpdir(), `${fileName}.${process.pid}.partial`);

  try {
    fs.mkdirSync(dir, { recursive: true });
    // BOM + CRLF so Notepad shows the Khmer text correctly
    try { fs.writeFileSync(path.join(dir, 'README_RESTORE.txt'), '﻿' + README.replace(/\n/g, '\r\n'), 'utf8'); } catch {}

    // Row count first (same moment as the dump, close enough for the report)
    const pg = (await import('pg')).default;
    const client = new pg.Client({ ...cfg, connectionTimeoutMillis: 5000 });
    await client.connect();
    let rows = 0;
    try {
      rows = Number((await client.query(`SELECT COUNT(*) AS n FROM ${INVOICE_TABLE}`)).rows[0].n);
    } finally {
      await client.end().catch(() => {});
    }

    await new Promise((resolve, reject) => {
      execFile(
        findPgDump(),
        ['-h', cfg.host, '-p', String(cfg.port), '-U', cfg.user, '-d', cfg.database,
          '-t', INVOICE_TABLE, '-Fc', '-Z', '6', '--no-owner', '--no-privileges', '-f', tempPath],
        { env: { ...process.env, PGPASSWORD: cfg.password }, timeout: 10 * 60000, windowsHide: true },
        (err, _out, stderr) => (err ? reject(new Error(String(stderr || err.message).trim())) : resolve())
      );
    });

    try {
      fs.renameSync(tempPath, finalPath);
    } catch {
      fs.copyFileSync(tempPath, finalPath); // temp folder on another drive
      fs.unlinkSync(tempPath);
    }

    const removed = removeOldFiles();
    const sizeBytes = fs.statSync(finalPath).size;
    const result = {
      ok: true, at: new Date().toISOString(), file: fileName, dir, sizeBytes, rows,
      durationMs: Date.now() - started, removedOld: removed, error: null,
    };
    writeSchedule({ invoiceExport: result });
    log(`   ✓ ${INVOICE_TABLE}: ${rows.toLocaleString()} rows -> ${finalPath} (${(sizeBytes / 1048576).toFixed(1)} MB, ${result.durationMs} ms)`);
    return result;
  } catch (err) {
    try { fs.unlinkSync(tempPath); } catch {}
    const result = { ok: false, at: new Date().toISOString(), dir, durationMs: Date.now() - started, error: err.message };
    writeSchedule({ invoiceExport: { ...(readSchedule().invoiceExport || {}), lastError: result } });
    log(`   ✗ ${INVOICE_TABLE} export: ${err.message}`);
    return result;
  }
}

/** Summary for the Settings "Backup report". */
export function getInvoiceExportStatus() {
  const files = listExportFiles();
  const meta = readSchedule().invoiceExport || null;
  return {
    dir: getExportDir(),
    keepDays: KEEP_DAYS,
    fileCount: files.length,
    totalBytes: files.reduce((s, f) => s + f.sizeBytes, 0),
    latest: files[0] || null,
    last: meta,
    dueToday: isInvoiceExportDue(),
  };
}
