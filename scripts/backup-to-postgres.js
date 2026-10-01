/**
 * Firebase Firestore to Local PostgreSQL Backup Script
 * ប្រព័ន្ធ Backup ទិន្នន័យពី Firebase Firestore ចូល PostgreSQL នៅលើ Local
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client, Pool } = pg;

// ១. Firebase Configuration (ទាញយកពី .env ដោយស្វ័យប្រវត្តិ)
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyBNXqK2paVb4pvMfxhCXTD6Xj5kna7ZY6I',
  authDomain: `${process.env.VITE_FIREBASE_PROJECT_ID || 'ialexpress'}.firebaseapp.com`,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'ialexpress',
  storageBucket: `${process.env.VITE_FIREBASE_PROJECT_ID || 'ialexpress'}.appspot.com`,
  appId: process.env.VITE_FIREBASE_APP_ID || '1:494989224946:web:590a34eace464d1a82d96b',
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

// ២. PostgreSQL Connection Settings (កែសម្រួលតាមការកំណត់ PostgreSQL របស់អ្នក)
const targetDbName = process.env.PG_DATABASE || 'ialsystems_backup';
const pgBaseConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
};

// ៣. បញ្ជី Collections សំខាន់ៗក្នុងប្រព័ន្ធគណនេយ្យ IAL Systems
const COLLECTIONS_TO_BACKUP = [
  { name: 'batches', label: 'ទទួលប្រាក់ទូទៅ (General Batches)' },
  { name: 'medicine_batches', label: 'ទទួលលុយថ្នាំពេទ្យ (Medicine Batches - Data_BM)' },
  { name: 'permissions', label: 'សិទ្ធិអ្នកប្រើប្រាស់ (User Permissions)' },
  { name: 'activity_logs', label: 'កំណត់ត្រាសកម្មភាព (Activity Logs)' },
  { name: 'app_config', label: 'ការកំណត់ប្រព័ន្ធ (App Configuration)' },
  { name: 'bank_slips', label: 'បង្កាន់ដៃធនាគារ (Bank Slips)' },
  { name: 'distribution_reports', label: 'របាយការណ៍ចែកចាយ (Distribution Alert Reports)' },
];

/**
 * ពិនិត្យ និងបង្កើត Database ស្វ័យប្រវត្តិ ប្រសិនបើមិនទាន់មាន
 */
async function ensureDatabaseExists() {
  const adminClient = new Client({
    ...pgBaseConfig,
    database: 'postgres', // Connect to default postgres DB first
  });

  try {
    await adminClient.connect();
    const res = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetDbName]
    );

    if (res.rowCount === 0) {
      console.log(`📦 Database "${targetDbName}" មិនទាន់មានទេ -> កំពុងបង្កើតដោយស្វ័យប្រវត្តិ...`);
      await adminClient.query(`CREATE DATABASE "${targetDbName}"`);
      console.log(`✓ បានបង្កើត Database "${targetDbName}" ជោគជ័យ!`);
    }
  } finally {
    await adminClient.end().catch(() => {});
  }
}

/**
 * បង្កើត Table និង Index ក្នុង PostgreSQL ប្រសិនបើមិនទាន់មាន
 */
async function initPostgresSchema(pool) {
  const query = `
    -- តារាងមេសម្រាប់រក្សាទុកគ្រប់ Document ពី Firestore ជាទម្រង់ JSONB
    CREATE TABLE IF NOT EXISTS firestore_backups (
      collection_name VARCHAR(100) NOT NULL,
      doc_id VARCHAR(255) NOT NULL,
      data JSONB NOT NULL,
      firestore_created_at TIMESTAMPTZ,
      synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (collection_name, doc_id)
    );

    -- Index ដើម្បីងាយស្រួល Query តាម Collection និង Document ID
    CREATE INDEX IF NOT EXISTS idx_firestore_backups_coll ON firestore_backups(collection_name);
    CREATE INDEX IF NOT EXISTS idx_firestore_backups_synced ON firestore_backups(synced_at DESC);
    CREATE INDEX IF NOT EXISTS idx_firestore_backups_data_gin ON firestore_backups USING GIN (data);

    -- តារាងកត់ត្រាប្រវត្តិការធ្វើ Backup (Backup History Log)
    CREATE TABLE IF NOT EXISTS backup_history_logs (
      id SERIAL PRIMARY KEY,
      collection_name VARCHAR(100) NOT NULL,
      records_synced INT NOT NULL,
      status VARCHAR(20) NOT NULL,
      message TEXT,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- View ងាយស្រួលមើល និង Query លើតារាង Batches
    DROP VIEW IF EXISTS view_batches_summary CASCADE;
    CREATE VIEW view_batches_summary AS
    SELECT 
      doc_id,
      data->>'id' AS batch_id,
      data->>'operator' AS operator,
      (data->>'totalItems')::INT AS total_items,
      (data->>'cashKHR')::NUMERIC AS cash_khr,
      (data->>'cashUSD')::NUMERIC AS cash_usd,
      (data->>'bankKHR')::NUMERIC AS bank_khr,
      (data->>'bankUSD')::NUMERIC AS bank_usd,
      (data->>'totalKHR')::NUMERIC AS total_khr,
      (data->>'totalUSD')::NUMERIC AS total_usd,
      data->>'createdAt' AS created_at,
      synced_at
    FROM firestore_backups
    WHERE collection_name = 'batches';

    -- View សម្រាប់ទិន្នន័យថ្នាំពេទ្យ (Medicine Batches - Data_BM)
    CREATE OR REPLACE VIEW view_medicine_batches_summary AS
    SELECT 
      doc_id,
      data->>'batchId' AS batch_id,
      data->>'collector' AS collector,
      data->>'date' AS batch_date,
      (data->>'grandTotal')::NUMERIC AS grand_total,
      synced_at
    FROM firestore_backups
    WHERE collection_name = 'medicine_batches';
  `;

  await pool.query(query);
  console.log('✓ PostgreSQL Schema ត្រូវបានរៀបចំរួចរាល់ (Schema Initialized)');
}

/**
 * ទាញទិន្នន័យពី Collection នីមួយៗក្នុង Firestore រួច Upsert ចូល PostgreSQL
 */
async function backupCollection(pool, collectionName, label) {
  const startedAt = new Date();
  console.log(`\n⏳ កំពុងទាញទិន្នន័យពី: [${collectionName}] (${label})...`);

  try {
    const colRef = collection(firestore, collectionName);
    const snapshot = await getDocs(colRef);

    if (snapshot.empty) {
      console.log(`  ℹ️ គ្មានទិន្នន័យក្នុង ${collectionName} ទេ`);
      return 0;
    }

    let count = 0;
    for (const doc of snapshot.docs) {
      const docId = doc.id;
      const rawData = doc.data();

      // បម្លែង Firestore Timestamp ទៅជា ISO String ប្រសិនបើមាន
      const cleanedData = JSON.parse(JSON.stringify(rawData, (key, value) => {
        if (value && typeof value === 'object' && value.seconds !== undefined && value.nanoseconds !== undefined) {
          return new Date(value.seconds * 1000).toISOString();
        }
        return value;
      }));

      const firestoreCreatedAt = cleanedData.createdAt || cleanedData.timestamp || null;

      // UPSERT: បើមាន doc_id រួចហើយ នឹង Update ទិន្នន័យចុងក្រោយ
      const upsertQuery = `
        INSERT INTO firestore_backups (collection_name, doc_id, data, firestore_created_at, synced_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (collection_name, doc_id) 
        DO UPDATE SET 
          data = EXCLUDED.data,
          firestore_created_at = EXCLUDED.firestore_created_at,
          synced_at = NOW();
      `;

      await pool.query(upsertQuery, [
        collectionName,
        docId,
        JSON.stringify(cleanedData),
        firestoreCreatedAt ? new Date(firestoreCreatedAt) : null
      ]);

      count++;
    }

    // កត់ត្រាចូល Backup History Logs
    await pool.query(
      `INSERT INTO backup_history_logs (collection_name, records_synced, status, started_at)
       VALUES ($1, $2, 'SUCCESS', $3)`,
      [collectionName, count, startedAt]
    );

    console.log(`  ✓ បាន Backup ${count} ឯកសារ (records) ចូល PostgreSQL`);
    return count;
  } catch (error) {
    console.error(`  ❌ កំហុសពេល Backup ${collectionName}:`, error.message);
    await pool.query(
      `INSERT INTO backup_history_logs (collection_name, records_synced, status, message, started_at)
       VALUES ($1, 0, 'FAILED', $2, $3)`,
      [collectionName, error.message, startedAt]
    );
    return 0;
  }
}

/**
 * មុខងារចម្បងសម្រាប់ដំណើរការ Backup ទាំងអស់
 */
async function runBackup() {
  console.log('====================================================');
  console.log('🚀 ចាប់ផ្តើមដំណើរការ Backup ពី Firebase ចូល PostgreSQL');
  console.log(`📅 កាលបរិច្ឆេទ: ${new Date().toLocaleString('km-KH')}`);
  console.log(`🎯 Firebase Project: ${firebaseConfig.projectId}`);
  console.log(`🐘 PostgreSQL Host: ${pgBaseConfig.host}:${pgBaseConfig.port}/${targetDbName}`);
  console.log('====================================================');

  let pool;
  try {
    // ជំហានទី ១៖ ផ្ទៀងផ្ទាត់ Connection និងបង្កើត Database ប្រសិនបើមិនទាន់មាន
    await ensureDatabaseExists();

    // ជំហានទី ២៖ បង្កើត Pool ភ្ជាប់ទៅ Target Database
    pool = new Pool({
      ...pgBaseConfig,
      database: targetDbName,
    });

    await pool.query('SELECT 1');
    await initPostgresSchema(pool);

    let totalSynced = 0;
    for (const item of COLLECTIONS_TO_BACKUP) {
      const count = await backupCollection(pool, item.name, item.label);
      totalSynced += count;
    }

    console.log('\n====================================================');
    console.log(`🎉 ដំណើរការ Backup ជោគជ័យទាំងស្រុង! សរុប: ${totalSynced} records`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ មិនអាចភ្ជាប់ទៅកាន់ PostgreSQL បានទេ:', err.message);
    if (err.message.includes('password authentication failed')) {
      console.error('👉 មូលហេតុ: ខុសលេខសម្ងាត់ (PG_PASSWORD) ក្នុង file .env');
      console.error('👉 សូមបើក file .env រួចកំណត់: PG_PASSWORD="លេខសម្ងាត់របស់អ្នក"');
    } else {
      console.error('👉 សូមពិនិត្យមើលថាតើ PostgreSQL Service បាន Start នៅលើ Port ' + pgBaseConfig.port + ' ហើយឬនៅ។');
    }
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
    process.exit(0);
  }
}

// Execute
runBackup();
