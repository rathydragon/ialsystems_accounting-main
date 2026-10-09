import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client, Pool } = pg;

// Load local .env if available
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {}

// 1. Supabase Client Config (Primary Cloud Source)
const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://tinrrnfxrbwzrqcyvdlo.supabase.co';
const supabaseKey =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Local PostgreSQL Target (Offline Backup)
const targetLocalDbName = process.env.PG_DATABASE || 'ialsystems_backup';
const pgLocalConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'Admin@#1992',
  client_encoding: 'UTF8',
};

const COLLECTIONS_TO_BACKUP = [
  { name: 'batches', label: 'ទទួលប្រាក់ទូទៅ (General Batches)' },
  { name: 'medicine_batches', label: 'ទទួលលុយថ្នាំពេទ្យ (Medicine Batches - Data_BM)' },
  { name: 'user_permissions', label: 'សិទ្ធិអ្នកប្រើប្រាស់ (User Permissions)' },
  { name: 'activity_logs', label: 'កំណត់ត្រាសកម្មភាព (Activity Logs)' },
  { name: 'app_config', label: 'ការកំណត់ប្រព័ន្ធ (App Configuration)' },
  { name: 'bank_slips', label: 'បង្កាន់ដៃធនាគារ (Bank Slips)' },
  { name: 'distribution_reports', label: 'របាយការណ៍ចែកចាយ (Distribution Alert Reports)' },
  { name: 'warehouse_scans', label: 'ប្រតិបត្តិការឃ្លាំង (Warehouse Scans)' }
];

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

export default async function handler(req, res) {
  // Allow GET to check health and latest backup status, POST to run backup
  if (req.method === 'GET') {
    let pool = null;
    try {
      pool = new Pool({
        ...pgLocalConfig,
        database: targetLocalDbName,
        connectionTimeoutMillis: 3000,
      });

      await pool.query('SELECT 1');
      const logRes = await pool.query(`
        SELECT table_name, records_synced, status, finished_at 
        FROM backup_history_logs 
        ORDER BY finished_at DESC 
        LIMIT 5;
      `).catch(() => ({ rows: [] }));

      const totalRes = await pool.query(`
        SELECT COUNT(*) as total_backups FROM local_offline_backups;
      `).catch(() => ({ rows: [{ total_backups: 0 }] }));

      return res.status(200).json({
        ok: true,
        connected: true,
        database: `${pgLocalConfig.host}:${pgLocalConfig.port}/${targetLocalDbName}`,
        totalBackedUpRecords: parseInt(totalRes.rows[0]?.total_backups || '0', 10),
        recentLogs: logRes.rows,
        message: 'Local PostgreSQL Offline Backup connected successfully.'
      });
    } catch (err) {
      return res.status(200).json({
        ok: false,
        connected: false,
        message: 'Local PostgreSQL not running or unreachable: ' + (err?.message || err)
      });
    } finally {
      if (pool) await pool.end().catch(() => {});
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
  }

  let localPool = null;

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

    localPool = new Pool({
      ...pgLocalConfig,
      database: targetLocalDbName,
      connectionTimeoutMillis: 3000,
      max: 5,
    });
    await localPool.query('SELECT 1');
    await initSchema(localPool);

    let totalDocsCount = 0;
    const upsertQuery = `
      INSERT INTO local_offline_backups (table_name, record_id, data, record_created_at, synced_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (table_name, record_id) 
      DO UPDATE SET 
        data = EXCLUDED.data,
        record_created_at = EXCLUDED.record_created_at,
        synced_at = NOW();
    `;

    // Process tables from Supabase Cloud (Primary) -> Local PostgreSQL (Offline Backup)
    for (const item of COLLECTIONS_TO_BACKUP) {
      try {
        const { data: rows, error } = await supabase
          .from(item.name)
          .select('*')
          .limit(5000);

        if (error || !rows || rows.length === 0) continue;

        totalDocsCount += rows.length;
        const now = new Date();

        // Run batch upserts concurrently in chunks of 25
        const chunkSize = 25;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          await Promise.all(
            chunk.map(async (row) => {
              const docId = row.id || row.key || row.barcode || row.email || String(Math.random());
              const createdAt = row.created_at || row.createdAt || null;
              const params = [
                item.name,
                String(docId),
                JSON.stringify(row),
                createdAt ? new Date(createdAt) : null
              ];

              await localPool.query(upsertQuery, params).catch(() => {});
            })
          );
        }

        // Log history
        await localPool
          .query(
            `INSERT INTO backup_history_logs (table_name, records_synced, status, started_at)
             VALUES ($1, $2, 'SUCCESS', $3)`,
            [item.name, rows.length, now]
          )
          .catch(() => {});
      } catch (collErr) {
        console.warn(`Error backing up ${item.name}:`, collErr.message);
      }
    }

    return res.status(200).json({
      ok: true,
      status: 'success',
      records: totalDocsCount,
      destination: `Local PostgreSQL (${pgLocalConfig.host}:${pgLocalConfig.port}/${targetLocalDbName})`,
      message: `✓ បាន Backup ពី Supabase Cloud ចូល Local PostgreSQL ជោគជ័យ! (សរុប ${totalDocsCount} Records)`
    });
  } catch (globalErr) {
    return res.status(500).json({
      ok: false,
      message: 'កំហុសកំឡុងពេល Offline Backup: ' + (globalErr?.message || globalErr)
    });
  } finally {
    if (localPool) await localPool.end().catch(() => {});
  }
}
