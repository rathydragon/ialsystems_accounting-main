import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLatestBackupStatus } from '../scripts/get-backup-status.js';

const { Client, Pool } = pg;

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

let pgPoolSingleton = null;
let schemaInitialized = false;

function getPostgresPool() {
  if (!pgPoolSingleton) {
    pgPoolSingleton = new Pool({
      ...pgLocalConfig,
      database: targetLocalDbName,
      connectionTimeoutMillis: 5000,
      max: 10,
      idleTimeoutMillis: 30000,
    });
    pgPoolSingleton.on('error', (err) => {
      console.warn('[Postgres Pool Warning]:', err.message);
      pgPoolSingleton = null;
    });
  }
  return pgPoolSingleton;
}

async function initSchema(pool) {
  const query = `
    CREATE TABLE IF NOT EXISTS local_offline_backups (
      table_name VARCHAR(100) NOT NULL,
      record_id VARCHAR(255) NOT NULL,
      data JSONB NOT NULL,
      record_created_at TIMESTAMPTZ,
      synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (table_name, record_id)
    );
    CREATE INDEX IF NOT EXISTS idx_local_backups_table ON local_offline_backups(table_name);
    CREATE INDEX IF NOT EXISTS idx_local_backups_synced ON local_offline_backups(synced_at DESC);
    CREATE INDEX IF NOT EXISTS idx_local_backups_data_gin ON local_offline_backups USING GIN (data);

    CREATE TABLE IF NOT EXISTS backup_history_logs (
      id SERIAL PRIMARY KEY,
      table_name VARCHAR(100) NOT NULL,
      records_synced INT NOT NULL,
      status VARCHAR(20) NOT NULL,
      message TEXT,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await pool.query(query);
}

export async function syncColumnarTables(pool) {
  const syncSql = `
    -- 1. Merge between local_offline_backups and firestore_backups
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'firestore_backups') THEN
        INSERT INTO local_offline_backups (table_name, record_id, data, record_created_at, synced_at)
        SELECT collection_name, doc_id, data, firestore_created_at, synced_at
        FROM firestore_backups
        ON CONFLICT (table_name, record_id) DO UPDATE SET
          data = EXCLUDED.data,
          synced_at = EXCLUDED.synced_at;
      END IF;
    END $$;

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

export default async function handler(req, res) {
  // Allow GET to check health and latest backup status
  if (req.method === 'GET') {
    try {
      const status = await getLatestBackupStatus();
      return sendJson(res, 200, {
        ok: true,
        connected: status.destinations.includes('Local PostgreSQL'),
        database: `${pgLocalConfig.host}:${pgLocalConfig.port}/${targetLocalDbName}`,
        totalBackedUpRecords: status.totalRecords,
        lastBackup: status,
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

  let localPool = null;

  // On Vercel or cloud environments where local PostgreSQL does not exist
  if (process.env.VERCEL || (!process.env.PG_HOST && pgLocalConfig.host === 'localhost')) {
    try {
      const probeClient = new Client({
        ...pgLocalConfig,
        database: 'postgres',
        connectionTimeoutMillis: 1000,
      });
      await probeClient.connect();
      await probeClient.end();
    } catch (e) {
      return sendJson(res, 200, {
        ok: true,
        skipped: true,
        isCloud: Boolean(process.env.VERCEL),
        message: 'Local PostgreSQL គឺសម្រាប់ម៉ាស៊ីនក្នុងស្រុក (Localhost) ប៉ុណ្ណោះ។ លើ Vercel Cloud ត្រូវបានរំលងដោយស្វ័យប្រវត្តិ។'
      });
    }
  }

  try {
    // 1. Connect to Local PostgreSQL Target
    const rootClient = new Client({
      ...pgLocalConfig,
      database: 'postgres',
      connectionTimeoutMillis: 3000,
    });
    await rootClient.connect();
    const checkDb = await rootClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetLocalDbName]
    );
    if (checkDb.rows.length === 0) {
      await rootClient.query(`CREATE DATABASE "${targetLocalDbName}"`);
    }
    await rootClient.end();

    localPool = getPostgresPool();
    if (!schemaInitialized) {
      await initSchema(localPool);
      schemaInitialized = true;
    }

    const upsertQuery = `
      INSERT INTO local_offline_backups (table_name, record_id, data, record_created_at, synced_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (table_name, record_id) 
      DO UPDATE SET 
        data = EXCLUDED.data,
        record_created_at = EXCLUDED.record_created_at,
        synced_at = NOW();
    `;

    // Process incoming payload tables if passed from client
    const body = req.body || {};
    const tableMappings = [
      { name: 'batches', records: body.batches },
      { name: 'medicine_batches', records: body.medicineBatches },
      { name: 'warehouse_scans', records: body.warehouseScans },
      { name: 'distribution_reports', records: body.distributionReports },
      { name: 'user_permissions', records: body.userPermissions || body.permissions },
      { name: 'activity_logs', records: body.activityLogs },
      { name: 'bank_slips', records: body.bankSlips },
      { name: 'app_config', records: body.appConfig ? [body.appConfig] : null }
    ];

    let newlyUpserted = 0;
    for (const item of tableMappings) {
      if (!Array.isArray(item.records) || item.records.length === 0) continue;
      const rows = item.records;
      const chunkSize = 25;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (row) => {
            const docId = row.id || row.key || row.barcode || row.batchNumber || row.email || String(Math.random());
            const createdAt = row.created_at || row.createdAt || row.date || null;
            const params = [
              item.name,
              String(docId),
              JSON.stringify(row),
              createdAt ? new Date(createdAt) : null
            ];
            await localPool.query(upsertQuery, params).catch(() => {});
            newlyUpserted++;
          })
        );
      }

      await localPool.query(
        `INSERT INTO backup_history_logs (table_name, records_synced, status, started_at)
         VALUES ($1, $2, 'SUCCESS', NOW())`,
        [item.name, rows.length]
      ).catch(() => {});
    }

    // 2. Synchronize all 5 columnar tables (tbl_distribution_reports, tbl_warehouse_scans, tbl_batches, tbl_user_permissions, tbl_activity_logs)
    await syncColumnarTables(localPool);

    // 3. Retrieve final status
    const status = await getLatestBackupStatus();

    return sendJson(res, 200, {
      ok: true,
      status: 'success',
      records: status.totalRecords,
      destinations: status.destinations,
      lastBackup: status,
      message: `✓ បាន Backup ជោគជ័យចូល ${status.destinations.join(' & ')}! (សរុប ${status.totalRecords} ឯកសារ)`
    });
  } catch (globalErr) {
    console.warn('Offline Backup Notice:', globalErr?.message || globalErr);
    if (globalErr?.code === 'ECONNREFUSED' || globalErr?.message?.includes('timeout') || process.env.VERCEL) {
      return sendJson(res, 200, {
        ok: true,
        skipped: true,
        isCloud: Boolean(process.env.VERCEL),
        message: 'Local PostgreSQL មិនអាចតភ្ជាប់បាន (រំលងដោយស្វ័យប្រវត្តិ)'
      });
    }
    return sendJson(res, 500, {
      ok: false,
      message: 'កំហុសកំឡុងពេល Offline Backup: ' + (globalErr?.message || globalErr)
    });
  } finally {
    if (localPool) await localPool.end().catch(() => {});
  }
}
