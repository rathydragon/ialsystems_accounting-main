/**
 * Supabase Cloud to Local PostgreSQL Offline Backup Script
 * ប្រព័ន្ធ Backup ទិន្នន័យពី Supabase Cloud (Primary) ចូល Local PostgreSQL (Offline Backup)
 */

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client, Pool } = pg;

// ១. Supabase Client Configuration (Primary Cloud Source)
const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  'https://tinrrnfxrbwzrqcyvdlo.supabase.co';
const supabaseKey =
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

const supabase = createClient(supabaseUrl, supabaseKey);

// ២. Local PostgreSQL Configuration (Offline Backup Target)
const targetLocalDbName = process.env.PG_DATABASE || 'ialsystems_backup';
const pgLocalConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'Admin@#1992',
  client_encoding: 'UTF8',
};

// ៣. បញ្ជីតារាងដែលត្រូវ Backup
const TABLES_TO_BACKUP = [
  { name: 'batches', label: 'ទទួលប្រាក់ទូទៅ (General Batches)' },
  { name: 'medicine_batches', label: 'ទទួលលុយថ្នាំពេទ្យ (Medicine Batches - Data_BM)' },
  { name: 'user_permissions', label: 'សិទ្ធិអ្នកប្រើប្រាស់ (User Permissions)' },
  { name: 'activity_logs', label: 'កំណត់ត្រាសកម្មភាព (Activity Logs)' },
  { name: 'app_config', label: 'ការកំណត់ប្រព័ន្ធ (App Configuration)' },
  { name: 'bank_slips', label: 'បង្កាន់ដៃធនាគារ (Bank Slips)' },
  { name: 'distribution_reports', label: 'របាយការណ៍ចែកចាយ (Distribution Alert Reports)' },
  { name: 'warehouse_scans', label: 'ប្រតិបត្តិការឃ្លាំង (Warehouse Scans)' }
];

/**
 * ពិនិត្យ និងបង្កើត Database នៅលើ Local PostgreSQL ប្រសិនបើមិនទាន់មាន
 */
async function ensureLocalDatabaseExists() {
  const rootClient = new Client({
    ...pgLocalConfig,
    database: 'postgres',
    connectionTimeoutMillis: 4000,
  });

  try {
    await rootClient.connect();
    const res = await rootClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetLocalDbName]
    );

    if (res.rowCount === 0) {
      console.log(`🔨 [Local PG] កំពុងបង្កើត Database: "${targetLocalDbName}"...`);
      await rootClient.query(`CREATE DATABASE "${targetLocalDbName}" ENCODING 'UTF8'`);
      console.log(`✓ [Local PG] បានបង្កើត Database "${targetLocalDbName}" ដោយជោគជ័យ!`);
    }
  } finally {
    await rootClient.end().catch(() => {});
  }
}

/**
 * បង្កើត Table local_offline_backups និង backup_history_logs លើ Local PostgreSQL
 */
async function initSchema(pool) {
  const createTableQuery = `
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

  await pool.query(createTableQuery);
}

/**
 * ទាញទិន្នន័យពី Supabase Cloud រួច Upsert ចូល Local PostgreSQL
 */
async function backupTable(localPool, tableName, label) {
  const startedAt = new Date();
  console.log(`\n⏳ កំពុងទាញទិន្នន័យពី Supabase: [${tableName}] (${label})...`);

  try {
    const { data: rows, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(5000);

    if (error) {
      console.warn(`  ⚠️ កំហុសពេលទាញយក ${tableName}:`, error.message);
      return 0;
    }

    if (!rows || rows.length === 0) {
      console.log(`  ℹ️ គ្មានទិន្នន័យក្នុង ${tableName} ទេ`);
      return 0;
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

    let count = 0;
    for (const row of rows) {
      const recordId = row.id || row.key || row.barcode || row.email || String(Math.random());
      const createdAt = row.created_at || row.createdAt || null;
      const queryParams = [
        tableName,
        String(recordId),
        JSON.stringify(row),
        createdAt ? new Date(createdAt) : null
      ];

      try {
        await localPool.query(upsertQuery, queryParams);
        count++;
      } catch (err) {}
    }

    // Log history
    await localPool
      .query(
        `INSERT INTO backup_history_logs (table_name, records_synced, status, started_at)
         VALUES ($1, $2, 'SUCCESS', $3)`,
        [tableName, count, startedAt]
      )
      .catch(() => {});

    console.log(`  ✓ បាន Backup ${count}/${rows.length} Records ចូល Local PostgreSQL`);
    return count;
  } catch (error) {
    console.error(`  ❌ កំហុសពេលទាញយក ${tableName}:`, error.message);
    return 0;
  }
}

/**
 * មុខងារចម្បងសម្រាប់ដំណើរការ Offline Backup
 */
async function runBackup() {
  console.log('====================================================');
  console.log('🚀 ចាប់ផ្តើម Offline Backup: Supabase Cloud -> Local PostgreSQL');
  console.log(`📅 កាលបរិច្ឆេទ: ${new Date().toLocaleString('km-KH')}`);
  console.log(`🎯 Source (Primary): ${supabaseUrl}`);
  console.log(`💾 Target (Offline Backup): ${pgLocalConfig.host}:${pgLocalConfig.port}/${targetLocalDbName}`);
  console.log('====================================================');

  let localPool = null;

  try {
    await ensureLocalDatabaseExists();
    localPool = new Pool({
      ...pgLocalConfig,
      database: targetLocalDbName,
    });
    await localPool.query('SELECT 1');
    await localPool.query("SET client_encoding TO 'UTF8'");
    console.log(`🐘 [Local PostgreSQL] បានភ្ជាប់ជោគជ័យ -> ${pgLocalConfig.host}:${pgLocalConfig.port}/${targetLocalDbName}`);
    await initSchema(localPool);
  } catch (err) {
    console.error(`❌ [Local PostgreSQL] មិនអាចភ្ជាប់បានទេ: ${err.message}`);
    console.error('👉 សូមប្រាកដថា PostgreSQL Service កំពុងដំណើរការលើកុំព្យូទ័ររបស់អ្នក (Port 5432)។');
    process.exit(1);
  }

  let grandTotal = 0;
  for (const item of TABLES_TO_BACKUP) {
    const backedUp = await backupTable(localPool, item.name, item.label);
    grandTotal += backedUp;
  }

  console.log('\n====================================================');
  console.log('🎉 ដំណើរការ Offline Backup បានបញ្ចប់ជាស្ថាពរ!');
  console.log(`📊 សរុបទិន្នន័យដែលបាន Backup: ${grandTotal} Records`);
  console.log('====================================================');

  await localPool.end().catch(() => {});
  process.exit(0);
}

runBackup().catch((err) => {
  console.error('💥 កំហុសធ្ងន់ធ្ងរ:', err);
  process.exit(1);
});
