import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLatestBackupStatus } from '../scripts/get-backup-status.js';
import { runFullBackup } from '../scripts/hostinger-mirror.js';
import { readSchedule, isDue, nextRunAt } from '../scripts/backup-schedule.js';
import { exportInvoiceNumbers, isInvoiceExportDue, getInvoiceExportStatus } from '../scripts/invoice-export.js';


// Load local .env if available
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {}

// Local PostgreSQL Target Config
const targetLocalDbName = process.env.PG_DATABASE || 'ialsystems_backup';
const pgLocalConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  client_encoding: 'UTF8',
};

export async function syncColumnarTables(pool) {
  const syncSql = `
    -- 1. (Old Firestore data in firestore_backups is kept as history only; it is not merged
    --    back in, because that brought deleted rows back.)

    -- 2. Populate tbl_distribution_reports
    CREATE TABLE IF NOT EXISTS tbl_distribution_reports (
      id VARCHAR(255) PRIMARY KEY,
      barcode TEXT,
      recipient_or_driver_name TEXT,
      report_date TEXT,
      remarks TEXT,
      operator_email TEXT,
      created_by TEXT,
      created_at TEXT,
      synced_at TIMESTAMPTZ
    );
    TRUNCATE TABLE tbl_distribution_reports;
    INSERT INTO tbl_distribution_reports (
      id, barcode, recipient_or_driver_name, report_date, remarks, operator_email, created_by, created_at, synced_at
    )
    SELECT 
      record_id AS id,
      COALESCE(data->>'barcode', data->'raw_data'->>'barcode') AS barcode,
      COALESCE(data->>'name', data->>'recipient_or_driver_name', data->'raw_data'->>'name') AS recipient_or_driver_name,
      COALESCE(data->>'date', data->'raw_data'->>'date') AS report_date,
      COALESCE(data->>'remarks', data->'raw_data'->>'remarks') AS remarks,
      COALESCE(data->>'operator_email', data->>'operatorEmail', data->'raw_data'->>'operatorEmail') AS operator_email,
      COALESCE(data->>'created_by', data->>'createdBy', data->'raw_data'->>'createdBy') AS created_by,
      COALESCE(data->>'created_at', data->>'createdAt', data->'raw_data'->>'createdAt') AS created_at,
      synced_at
    FROM local_offline_backups
    WHERE table_name = 'distribution_reports';

    -- 3. Populate tbl_warehouse_scans
    CREATE TABLE IF NOT EXISTS tbl_warehouse_scans (
      id VARCHAR(255) PRIMARY KEY,
      scan_type TEXT,
      barcode TEXT,
      tracking TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      destination TEXT,
      driver_name TEXT,
      truck_no TEXT,
      cod_amount NUMERIC,
      currency TEXT,
      shelf_location TEXT,
      rider_name TEXT,
      rider_phone TEXT,
      delivery_zone TEXT,
      out_reason TEXT,
      hold_reason TEXT,
      remarks TEXT,
      scan_date TEXT,
      operator_email TEXT,
      created_by TEXT,
      created_at TEXT,
      synced_at TIMESTAMPTZ
    );
    TRUNCATE TABLE tbl_warehouse_scans;
    INSERT INTO tbl_warehouse_scans (
      id, scan_type, barcode, tracking, customer_name, customer_phone, destination, driver_name, truck_no,
      cod_amount, currency, shelf_location, rider_name, rider_phone, delivery_zone, out_reason, hold_reason, remarks,
      scan_date, operator_email, created_by, created_at, synced_at
    )
    SELECT 
      record_id AS id,
      COALESCE(data->>'scan_type', data->>'scanType', data->'raw_data'->>'scanType') AS scan_type,
      COALESCE(data->>'barcode', data->'raw_data'->>'barcode') AS barcode,
      COALESCE(data->>'tracking', data->'raw_data'->>'tracking') AS tracking,
      COALESCE(data->>'customer_name', data->>'customerName', data->'raw_data'->>'customerName') AS customer_name,
      COALESCE(data->>'customer_phone', data->>'customerPhone', data->'raw_data'->>'customerPhone') AS customer_phone,
      COALESCE(data->>'destination', data->'raw_data'->>'destination') AS destination,
      COALESCE(data->>'driver_name', data->>'driverName', data->'raw_data'->>'driverName') AS driver_name,
      COALESCE(data->>'truck_no', data->>'truckNo', data->'raw_data'->>'truckNo') AS truck_no,
      (COALESCE(data->>'cod_amount', data->>'codAmount', data->'raw_data'->>'codAmount'))::NUMERIC AS cod_amount,
      COALESCE(data->>'currency', data->'raw_data'->>'currency') AS currency,
      COALESCE(data->>'shelf_location', data->>'location', data->'raw_data'->>'location') AS shelf_location,
      COALESCE(data->>'rider_name', data->>'riderName', data->'raw_data'->>'riderName') AS rider_name,
      COALESCE(data->>'rider_phone', data->>'riderPhone', data->'raw_data'->>'riderPhone') AS rider_phone,
      COALESCE(data->>'delivery_zone', data->>'deliveryZone', data->'raw_data'->>'deliveryZone') AS delivery_zone,
      COALESCE(data->>'out_reason', data->>'outReason', data->'raw_data'->>'outReason') AS out_reason,
      COALESCE(data->>'hold_reason', data->>'holdReason', data->'raw_data'->>'holdReason') AS hold_reason,
      COALESCE(data->>'remarks', data->'raw_data'->>'remarks') AS remarks,
      COALESCE(data->>'date', data->'raw_data'->>'date') AS scan_date,
      COALESCE(data->>'operator_email', data->>'operatorEmail', data->'raw_data'->>'operatorEmail') AS operator_email,
      COALESCE(data->>'created_by', data->>'createdBy', data->'raw_data'->>'createdBy') AS created_by,
      COALESCE(data->>'created_at', data->>'createdAt', data->'raw_data'->>'createdAt') AS created_at,
      synced_at
    FROM local_offline_backups
    WHERE table_name = 'warehouse_scans';

    -- 4. Populate tbl_batches
    CREATE TABLE IF NOT EXISTS tbl_batches (
      id VARCHAR(255) PRIMARY KEY,
      batch_number TEXT,
      total_items INT,
      total_usd NUMERIC,
      total_khr NUMERIC,
      cash_usd NUMERIC,
      cash_khr NUMERIC,
      bank_usd NUMERIC,
      bank_khr NUMERIC,
      operator TEXT,
      operator_email TEXT,
      notes TEXT,
      created_at TEXT,
      synced_at TIMESTAMPTZ
    );
    TRUNCATE TABLE tbl_batches;
    INSERT INTO tbl_batches (
      id, batch_number, total_items, total_usd, total_khr, cash_usd, cash_khr, bank_usd, bank_khr,
      operator, operator_email, notes, created_at, synced_at
    )
    SELECT 
      record_id AS id,
      COALESCE(data->>'batch_number', data->>'batchNumber', data->'raw_data'->>'batchNumber') AS batch_number,
      COALESCE((data->>'total_items')::INT, (data->>'totalItems')::INT, (data->'raw_data'->>'totalItems')::INT) AS total_items,
      COALESCE((data->>'total_usd')::NUMERIC, (data->>'totalUSD')::NUMERIC, (data->'raw_data'->>'totalUSD')::NUMERIC) AS total_usd,
      COALESCE((data->>'total_khr')::NUMERIC, (data->>'totalKHR')::NUMERIC, (data->'raw_data'->>'totalKHR')::NUMERIC) AS total_khr,
      COALESCE((data->>'cash_usd')::NUMERIC, (data->>'cashUSD')::NUMERIC, (data->'raw_data'->>'cashUSD')::NUMERIC) AS cash_usd,
      COALESCE((data->>'cash_khr')::NUMERIC, (data->>'cashKHR')::NUMERIC, (data->'raw_data'->>'cashKHR')::NUMERIC) AS cash_khr,
      COALESCE((data->>'bank_usd')::NUMERIC, (data->>'bankUSD')::NUMERIC, (data->'raw_data'->>'bankUSD')::NUMERIC) AS bank_usd,
      COALESCE((data->>'bank_khr')::NUMERIC, (data->>'bankKHR')::NUMERIC, (data->'raw_data'->>'bankKHR')::NUMERIC) AS bank_khr,
      COALESCE(data->>'operator', data->'raw_data'->>'operator') AS operator,
      COALESCE(data->>'operator_email', data->>'operatorEmail', data->'raw_data'->>'operatorEmail') AS operator_email,
      COALESCE(data->>'notes', data->'raw_data'->>'notes') AS notes,
      COALESCE(data->>'created_at', data->>'createdAt', data->'raw_data'->>'createdAt') AS created_at,
      synced_at
    FROM local_offline_backups
    WHERE table_name IN ('batches', 'medicine_batches');

    -- 5. Populate tbl_user_permissions
    CREATE TABLE IF NOT EXISTS tbl_user_permissions (
      id VARCHAR(255) PRIMARY KEY,
      email TEXT,
      full_name TEXT,
      role TEXT,
      status TEXT,
      can_create BOOLEAN,
      can_edit BOOLEAN,
      can_delete BOOLEAN,
      view_only_own BOOLEAN,
      created_at TEXT,
      synced_at TIMESTAMPTZ
    );
    TRUNCATE TABLE tbl_user_permissions;
    INSERT INTO tbl_user_permissions (
      id, email, full_name, role, status, can_create, can_edit, can_delete, view_only_own, created_at, synced_at
    )
    SELECT DISTINCT ON (COALESCE(data->>'email', data->'raw_data'->>'email', record_id))
      record_id AS id,
      COALESCE(data->>'email', data->'raw_data'->>'email') AS email,
      COALESCE(data->>'name', data->>'full_name', data->'raw_data'->>'name') AS full_name,
      COALESCE(data->>'role', data->'raw_data'->>'role') AS role,
      COALESCE(data->>'status', data->'raw_data'->>'status') AS status,
      COALESCE((data->>'can_create')::BOOLEAN, (data->>'canCreate')::BOOLEAN, (data->'raw_data'->>'canCreate')::BOOLEAN) AS can_create,
      COALESCE((data->>'can_edit')::BOOLEAN, (data->>'canEdit')::BOOLEAN, (data->'raw_data'->>'canEdit')::BOOLEAN) AS can_edit,
      COALESCE((data->>'can_delete')::BOOLEAN, (data->>'canDelete')::BOOLEAN, (data->'raw_data'->>'canDelete')::BOOLEAN) AS can_delete,
      COALESCE((data->>'view_only_own')::BOOLEAN, (data->>'viewOnlyOwn')::BOOLEAN, (data->'raw_data'->>'viewOnlyOwn')::BOOLEAN) AS view_only_own,
      COALESCE(data->>'created_at', data->>'createdAt', data->'raw_data'->>'createdAt') AS created_at,
      synced_at
    FROM local_offline_backups
    WHERE table_name IN ('user_permissions', 'permissions');

    -- 6. Populate tbl_activity_logs
    CREATE TABLE IF NOT EXISTS tbl_activity_logs (
      id VARCHAR(255) PRIMARY KEY,
      action_type TEXT,
      operator_name TEXT,
      operator_email TEXT,
      title TEXT,
      description TEXT,
      action_timestamp TEXT,
      synced_at TIMESTAMPTZ
    );
    TRUNCATE TABLE tbl_activity_logs;
    INSERT INTO tbl_activity_logs (
      id, action_type, operator_name, operator_email, title, description, action_timestamp, synced_at
    )
    SELECT 
      record_id AS id,
      COALESCE(data->>'action', data->>'action_type', data->'raw_data'->>'action') AS action_type,
      COALESCE(data->>'operator', data->>'operator_name', data->'raw_data'->>'operator') AS operator_name,
      COALESCE(data->>'operator_email', data->>'operatorEmail', data->'raw_data'->>'operatorEmail') AS operator_email,
      COALESCE(data->>'title', data->'raw_data'->>'title') AS title,
      COALESCE(data->>'description', data->'raw_data'->>'description') AS description,
      COALESCE(data->>'timestamp', data->>'action_timestamp', data->>'createdAt', data->>'created_at', data->'raw_data'->>'timestamp') AS action_timestamp,
      synced_at
    FROM local_offline_backups
    WHERE table_name = 'activity_logs';

    -- 7. Populate tbl_list_name (List Name / Payers)
    CREATE TABLE IF NOT EXISTS tbl_list_name (
      id VARCHAR(255) PRIMARY KEY,
      name TEXT,
      phone TEXT,
      category TEXT,
      area TEXT,
      status TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT,
      synced_at TIMESTAMPTZ
    );
    TRUNCATE TABLE tbl_list_name;
    INSERT INTO tbl_list_name (
      id, name, phone, category, area, status, notes, created_at, updated_at, synced_at
    )
    SELECT 
      record_id AS id,
      COALESCE(data->>'name', data->'raw_data'->>'name') AS name,
      COALESCE(data->>'phone', data->'raw_data'->>'phone') AS phone,
      COALESCE(data->>'category', data->'raw_data'->>'category') AS category,
      COALESCE(data->>'area', data->'raw_data'->>'area') AS area,
      COALESCE(data->>'status', data->'raw_data'->>'status') AS status,
      COALESCE(data->>'notes', data->'raw_data'->>'notes') AS notes,
      COALESCE(data->>'created_at', data->>'createdAt', data->'raw_data'->>'createdAt') AS created_at,
      COALESCE(data->>'updated_at', data->>'updatedAt', data->'raw_data'->>'updatedAt') AS updated_at,
      synced_at
    FROM local_offline_backups
    WHERE table_name IN ('list_name', 'payers');
  `;

  await pool.query(syncSql);
}

function sendJson(res, statusCode, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

// Windows Task Scheduler info (Windows only, cached for a minute)
const WIN_TASK_NAME = 'IALSystems_Postgres_Hourly_Backup';
let winTaskCache = { at: 0, value: null };
async function getWindowsTaskInfo() {
  if (process.platform !== 'win32') return null;
  if (Date.now() - winTaskCache.at < 60000) return winTaskCache.value;
  const { execFile } = await import('child_process');
  const ps = `$t = Get-ScheduledTask -TaskName '${WIN_TASK_NAME}' -ErrorAction SilentlyContinue; ` +
    `if (-not $t) { 'null' } else { $i = $t | Get-ScheduledTaskInfo; ` +
    `[pscustomobject]@{ state = [string]$t.State; lastRun = $i.LastRunTime.ToString('o'); lastResult = $i.LastTaskResult; ` +
    `nextRun = $(if ($i.NextRunTime) { $i.NextRunTime.ToString('o') } else { $null }); ` +
    `interval = [string]$t.Triggers[0].Repetition.Interval } | ConvertTo-Json -Compress }`;
  const value = await new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 8000, windowsHide: true }, (err, out) => {
      if (err) return resolve({ error: err.message });
      try {
        const v = JSON.parse(String(out).trim() || 'null');
        resolve(v ? { name: WIN_TASK_NAME, ...v } : { name: WIN_TASK_NAME, missing: true });
      } catch { resolve({ error: 'Could not read task info' }); }
    });
  });
  winTaskCache = { at: Date.now(), value };
  return value;
}

// Live row counts in Hostinger vs. the copy in PostgreSQL
async function compareWithHostinger(collections) {
  const { getMySQLPool } = await import('./remote-mysql.js');
  const pool = getMySQLPool();
  const names = collections.map((c) => c.name);
  const out = [];
  for (let i = 0; i < names.length; i += 5) {
    const part = await Promise.all(names.slice(i, i + 5).map(async (name) => {
      const backup = collections.find((c) => c.name === name)?.count ?? 0;
      try {
        const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM \`${name.replace(/`/g, '``')}\``);
        return { table: name, backup, hostinger: Number(n), diff: Number(n) - backup };
      } catch (err) {
        return { table: name, backup, hostinger: null, diff: null, error: err.message };
      }
    }));
    out.push(...part);
  }
  return out;
}

function buildProblems(status, winTask) {
  const problems = [];
  if (status.pgError) problems.push({ level: 'error', text: `មិនអាចភ្ជាប់ Local PostgreSQL បាន៖ ${status.pgError}` });
  const lr = status.lastResult;
  if (lr && !lr.ok) {
    if (lr.error) problems.push({ level: 'error', text: `Backup ចុងក្រោយមានកំហុស៖ ${lr.error}` });
    for (const t of lr.failedTables || []) problems.push({ level: 'error', text: `តារាង ${t.table} Backup មិនបាន៖ ${t.error || ''}` });
  }
  for (const t of lr?.partialTables || []) problems.push({ level: 'warn', text: `តារាង ${t} ចម្លងបានមិនគ្រប់` });
  const sc = status.scheduleConfig || {};
  if (sc.enabled !== false && status.nextRunAt) {
    const lateMin = (Date.now() - new Date(status.nextRunAt).getTime()) / 60000;
    if (lateMin > 30) problems.push({ level: 'warn', text: `Backup ហួសពេលកំណត់ ${Math.round(lateMin)} នាទី (ម៉ាស៊ីន ឬ Task Scheduler ប្រហែលជាបានបិទ)` });
  }
  if (winTask?.missing) problems.push({ level: 'warn', text: 'រកមិនឃើញ Windows Task Scheduler។ Auto-Backup ដំណើរការតែពេលបើកកម្មវិធីប៉ុណ្ណោះ (ដំណើរការ backend/scripts/setup-scheduled-backup.bat ជា Administrator)' });
  else if (winTask && !winTask.error) {
    if (winTask.state === 'Disabled') problems.push({ level: 'warn', text: 'Windows Task Scheduler ត្រូវបានបិទ (Disabled)' });
    if (winTask.lastResult && ![0, 267009, 267011].includes(Number(winTask.lastResult))) {
      problems.push({ level: 'warn', text: `Windows Task Scheduler ដំណើរការលើកចុងក្រោយមានកំហុស (code ${winTask.lastResult})` });
    }
  }
  if (sc.enabled === false) problems.push({ level: 'info', text: 'Auto-Backup ត្រូវបានផ្អាក' });

  // Invoice numbers export (local-only table -> OneDrive)
  const inv = status.invoiceExport;
  if (inv) {
    const lastOkAt = inv.last?.ok ? new Date(inv.last.at).getTime() : (inv.latest ? new Date(inv.latest.at).getTime() : 0);
    const err = inv.last?.lastError;
    if (err && new Date(err.at).getTime() > lastOkAt) {
      problems.push({ level: 'error', text: `Export លេខវិក្កយបត្រ ទៅ OneDrive បរាជ័យ៖ ${err.error}` });
    } else if (!lastOkAt) {
      problems.push({ level: 'warn', text: 'មិនទាន់មាន Export លេខវិក្កយបត្រ ទៅ OneDrive ទេ' });
    } else if (Date.now() - lastOkAt > 36 * 3600000) {
      problems.push({ level: 'warn', text: `Export លេខវិក្កយបត្រ ចុងក្រោយហួស ${Math.round((Date.now() - lastOkAt) / 3600000)} ម៉ោងហើយ` });
    }
  }
  return problems;
}

export default async function handler(req, res) {
  const query = req.query || Object.fromEntries(new URL(req.url || '/', 'http://x').searchParams);

  // GET: health check and latest backup status (?compare=1 also counts Hostinger rows live)
  if (req.method === 'GET') {
    try {
      const status = await getLatestBackupStatus();
      status.invoiceExport = getInvoiceExportStatus();
      const winTask = await getWindowsTaskInfo().catch(() => null);
      let compare = null;
      if (query.compare === '1' && Array.isArray(status.collections) && status.collections.length) {
        compare = await compareWithHostinger(status.collections).catch((err) => ({ error: err.message }));
      }
      return sendJson(res, 200, {
        ok: true,
        connected: status.destinations.includes('Local PostgreSQL'),
        database: `${pgLocalConfig.host}:${pgLocalConfig.port}/${targetLocalDbName}`,
        totalBackedUpRecords: status.totalRecords,
        lastBackup: status,
        windowsTask: winTask,
        problems: buildProblems(status, winTask),
        invoiceExport: status.invoiceExport,
        compare,
        message: 'Local PostgreSQL Offline Backup connected successfully.'
      });
    } catch (err) {
      return sendJson(res, 200, {
        ok: false,
        connected: false,
        message: 'Local PostgreSQL error: ' + (err?.message || err)
      });
    }
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
  }

  // Local PostgreSQL only exists on the local machine; skip on Vercel
  if (process.env.VERCEL) {
    return sendJson(res, 200, {
      ok: true,
      skipped: true,
      isCloud: true,
      message: 'Local PostgreSQL គឺសម្រាប់ម៉ាស៊ីនក្នុងស្រុក (Localhost) ប៉ុណ្ណោះ។ លើ Vercel Cloud ត្រូវបានរំលងដោយស្វ័យប្រវត្តិ។'
    });
  }

  // ?action=invoice-export: export invoice numbers to OneDrive now
  if (query.action === 'invoice-export') {
    const result = await exportInvoiceNumbers();
    return sendJson(res, result.ok ? 200 : 500, {
      ok: result.ok,
      invoiceExport: getInvoiceExportStatus(),
      message: result.ok
        ? `✓ បាន Export លេខវិក្កយបត្រ ${Number(result.rows).toLocaleString()} ជួរ ទៅ OneDrive (${(result.sizeBytes / 1048576).toFixed(1)} MB)`
        : `Export បរាជ័យ៖ ${result.error}`
    });
  }

  // Invoice numbers -> OneDrive once a day, whichever trigger comes first (about a second)
  if (isInvoiceExportDue()) await exportInvoiceNumbers().catch(() => {});

  // ?ifDue=1 (the app's background timer): only run when the saved schedule says it is time,
  // so the browser and Windows Task Scheduler never back up twice for the same slot.
  if (query.ifDue === '1') {
    const sched = readSchedule();
    if (!isDue(sched)) {
      const next = nextRunAt(sched);
      return sendJson(res, 200, { ok: true, skipped: true, notDue: true, nextRunAt: next ? next.toISOString() : null });
    }
  }

  // The backup always reads straight from Hostinger MySQL (the source of truth).
  // Anything the browser sends in the body is ignored.
  try {
    const result = await runFullBackup();
    const status = await getLatestBackupStatus();
    const failedNames = result.failed.map((t) => t.table);
    const message = result.ok
      ? `✓ បាន Backup ពី Hostinger ចូល Local PostgreSQL ជោគជ័យ! (${result.tables.length} តារាង, សរុប ${result.totalRows.toLocaleString()} ជួរ)`
      : `⚠️ Backup បានខ្លះ៖ ${result.tables.length - failedNames.length}/${result.tables.length} តារាងជោគជ័យ` +
        (failedNames.length ? ` (បរាជ័យ៖ ${failedNames.join(', ')})` : '') +
        (result.legacyError ? ` | JSON copy: ${result.legacyError}` : '');
    return sendJson(res, 200, {
      ok: result.ok,
      status: result.ok ? 'success' : 'partial',
      records: status.totalRecords,
      destinations: status.destinations,
      tables: result.tables,
      durationMs: result.durationMs,
      lastBackup: status,
      message
    });
  } catch (err) {
    console.warn('Offline Backup Notice:', err?.message || err);
    if (err?.code === 'BACKUP_RUNNING') {
      return sendJson(res, 409, { ok: false, message: 'កំពុងមាន Backup មួយទៀតកំពុងដំណើរការ។ សូមរង់ចាំបន្តិច។' });
    }
    if (err?.code === 'ECONNREFUSED' || String(err?.message || '').includes('timeout')) {
      return sendJson(res, 200, {
        ok: true,
        skipped: true,
        message: 'Local PostgreSQL មិនអាចតភ្ជាប់បាន (រំលងដោយស្វ័យប្រវត្តិ)'
      });
    }
    return sendJson(res, 500, {
      ok: false,
      message: 'កំហុសកំឡុងពេល Offline Backup: ' + (err?.message || err)
    });
  }
}
