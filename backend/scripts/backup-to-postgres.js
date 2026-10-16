/**
 * Local PostgreSQL Offline Backup & Table Synchronization Script
 * ប្រព័ន្ធ Backup & Synchronization ទិន្នន័យចូល Local PostgreSQL
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { syncColumnarTables } from '../api/backup-postgres.js';
import { getLatestBackupStatus } from './get-backup-status.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client, Pool } = pg;

// Local PostgreSQL Configuration
const targetLocalDbName = process.env.PG_DATABASE || 'ialsystems_backup';
const pgLocalConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  client_encoding: 'UTF8',
};

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

async function runBackup() {
  console.log('====================================================');
  console.log('🚀 ចាប់ផ្តើម Offline Backup & Synchronization ចូល Local PostgreSQL');
  console.log(`📅 កាលបរិច្ឆេទ: ${new Date().toLocaleString('km-KH')}`);
  console.log(`💾 Target: ${pgLocalConfig.host}:${pgLocalConfig.port}/${targetLocalDbName}`);
  console.log('====================================================');

  let localPool = null;

  try {
    await ensureLocalDatabaseExists();
    localPool = new Pool({
      ...pgLocalConfig,
      database: targetLocalDbName,
    });
    await localPool.query('SELECT 1');
    console.log(`🐘 [Local PostgreSQL] បានភ្ជាប់ជោគជ័យ -> ${pgLocalConfig.host}:${pgLocalConfig.port}/${targetLocalDbName}`);

    // Replicate from Master Hostinger MySQL Database into Local PostgreSQL
    try {
      console.log('🌐 [Master MySQL] កំពុងទាញយកទិន្នន័យពី Hostinger Remote MySQL Master...');
      const { getMySQLPool } = await import('../api/remote-mysql.js');
      const { getAllMasterData } = await import('../api/mysql-master-handlers.js');
      const mySqlPool = getMySQLPool();
      const masterResult = await getAllMasterData(mySqlPool);

      if (masterResult && masterResult.ok && masterResult.data) {
        const md = masterResult.data;
        const upsertQuery = `
          INSERT INTO local_offline_backups (table_name, record_id, data, record_created_at, synced_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (table_name, record_id) 
          DO UPDATE SET 
            data = EXCLUDED.data,
            record_created_at = EXCLUDED.record_created_at,
            synced_at = NOW();
        `;

        const mappings = [
          { name: 'batches', records: md.batches },
          { name: 'medicine_batches', records: md.medicineBatches },
          { name: 'warehouse_scans', records: md.warehouseScans },
          { name: 'user_permissions', records: md.permissions },
          { name: 'bank_slips', records: md.bankSlips },
          { name: 'list_name', records: md.payers }
        ];

        let count = 0;
        for (const item of mappings) {
          if (!Array.isArray(item.records) || item.records.length === 0) continue;
          for (const row of item.records) {
            const docId = row.id || row.batchNumber || row.email || row.barcode || String(Math.random());
            const createdAt = row.createdAt || row.created_at || row.date || null;
            await localPool.query(upsertQuery, [
              item.name,
              String(docId),
              JSON.stringify(row),
              createdAt ? new Date(createdAt) : null
            ]).catch(() => {});
            count++;
          }
        }
        console.log(`✓ [Master MySQL] បាន Replicate ទិន្នន័យ ${count} ឯកសារ ចូល Local PostgreSQL!`);
      }
    } catch (mysqlErr) {
      console.warn('⚠️ [Master MySQL Replicate Warning]:', mysqlErr.message);
    }

    // Synchronize columnar tables and merge backups
    console.log('⏳ កំពុងធ្វើសមកាលកម្មតារាង Columnar (tbl_*) ទាំងអស់...');
    await syncColumnarTables(localPool);

    // Get final status
    const status = await getLatestBackupStatus();

    // Log history
    await localPool.query(
      `INSERT INTO backup_history_logs (table_name, records_synced, status, started_at)
       VALUES ('ALL_TABLES', $1, 'SUCCESS', NOW())`,
      [status.totalRecords]
    ).catch(() => {});

    console.log('\n====================================================');
    console.log('🎉 ដំណើរការ Offline Backup & Sync បានបញ្ចប់ជាស្ថាពរ!');
    console.log(`📊 សរុបទិន្នន័យដែលមានក្នុង Database: ${status.totalRecords} Records`);
    if (status.collections && status.collections.length > 0) {
      console.log('📋 បញ្ជីទិន្នន័យតាមតារាង:');
      status.collections.forEach(c => {
        console.log(`   - ${c.name}: ${c.count} records`);
      });
    }
    console.log('====================================================');

    await localPool.end().catch(() => {});
    process.exit(0);
  } catch (err) {
    console.error('❌ [Local PostgreSQL] កំហុស:', err.message);
    if (localPool) await localPool.end().catch(() => {});
    process.exit(1);
  }
}

runBackup().catch((err) => {
  console.error('💥 កំហុសធ្ងន់ធ្ងរ:', err);
  process.exit(1);
});
