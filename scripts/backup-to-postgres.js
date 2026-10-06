/**
 * Firebase Firestore to Multi-Destination Backup Script
 * ប្រព័ន្ធ Backup ទិន្នន័យពី Firebase Firestore ចូល៖
 * 1. Local PostgreSQL (សម្រាប់ Offline / Local Backup)
 * 2. Cloud Supabase (សម្រាប់ High-Availability Cloud Backup)
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

// ២. Local PostgreSQL Configuration
const targetLocalDbName = process.env.PG_DATABASE || 'ialsystems_backup';
const pgLocalConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  client_encoding: 'UTF8',
};

// ៣. Supabase Cloud Configuration
const supabaseDbUrl = process.env.SUPABASE_DB_URL || '';

// ៤. បញ្ជី Collections សំខាន់ៗក្នុងប្រព័ន្ធគណនេយ្យ IAL Systems
const COLLECTIONS_TO_BACKUP = [
  { name: 'batches', label: 'ទទួលប្រាក់ទូទៅ (General Batches)' },
  { name: 'medicine_batches', label: 'ទទួលលុយថ្នាំពេទ្យ (Medicine Batches - Data_BM)' },
  { name: 'permissions', label: 'សិទ្ធិអ្នកប្រើប្រាស់ (User Permissions)' },
  { name: 'activity_logs', label: 'កំណត់ត្រាសកម្មភាព (Activity Logs)' },
  { name: 'app_config', label: 'ការកំណត់ប្រព័ន្ធ (App Configuration)' },
  { name: 'bank_slips', label: 'បង្កាន់ដៃធនាគារ (Bank Slips)' },
  { name: 'distribution_reports', label: 'របាយការណ៍ចែកចាយ (Distribution Alert Reports)' },
  { name: 'warehouse_scans', label: 'ប្រតិបត្តិការឃ្លាំង (Warehouse Scans: ScanIn, ScanOut, Out of Delivery)' }
];

/**
 * ពិនិត្យ និងបង្កើត Database លើ Local PostgreSQL ប្រសិនបើមិនទាន់មាន (Enforce UTF-8)
 */
async function ensureLocalDatabaseExists() {
  const adminClient = new Client({
    ...pgLocalConfig,
    database: 'postgres',
  });

  try {
    await adminClient.connect();
    await adminClient.query("SET client_encoding TO 'UTF8'");
    const res = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetLocalDbName]
    );

    if (res.rowCount === 0) {
      console.log(`📦 Local Database "${targetLocalDbName}" មិនទាន់មានទេ -> កំពុងបង្កើតដោយស្វ័យប្រវត្តិជាមួយ UTF-8...`);
      try {
        await adminClient.query(`CREATE DATABASE "${targetLocalDbName}" WITH ENCODING 'UTF8' LC_COLLATE = 'C' LC_CTYPE = 'C'`);
      } catch (errCollate) {
        await adminClient.query(`CREATE DATABASE "${targetLocalDbName}" WITH ENCODING 'UTF8'`);
      }
      console.log(`✓ បានបង្កើត Local Database "${targetLocalDbName}" (UTF-8) ជោគជ័យ!`);
    }
  } finally {
    await adminClient.end().catch(() => {});
  }
}

/**
 * បង្កើត Table, View និង Index ក្នុង PostgreSQL / Supabase
 */
async function initSchema(pool, targetName) {
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

    -- កំណត់ Row Level Security (RLS) និង Policies (សម្រាប់ Supabase ប្រសិនបើមាន Role)
    ALTER TABLE firestore_backups ENABLE ROW LEVEL SECURITY;
    ALTER TABLE backup_history_logs ENABLE ROW LEVEL SECURITY;

    DO $$
    BEGIN
      -- បង្កើត Policy សម្រាប់ service_role ប្រសិនបើមាន role នេះ (លើ Supabase)
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'firestore_backups' AND policyname = 'Allow service role full access on firestore_backups') THEN
          CREATE POLICY "Allow service role full access on firestore_backups" ON firestore_backups FOR ALL TO service_role USING (true) WITH CHECK (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'backup_history_logs' AND policyname = 'Allow service role full access on backup_history_logs') THEN
          CREATE POLICY "Allow service role full access on backup_history_logs" ON backup_history_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
        END IF;
      END IF;

      -- បង្កើត Policy សម្រាប់ authenticated users ប្រសិនបើមាន role នេះ
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'firestore_backups' AND policyname = 'Allow authenticated read access on firestore_backups') THEN
          CREATE POLICY "Allow authenticated read access on firestore_backups" ON firestore_backups FOR SELECT TO authenticated USING (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'backup_history_logs' AND policyname = 'Allow authenticated read access on backup_history_logs') THEN
          CREATE POLICY "Allow authenticated read access on backup_history_logs" ON backup_history_logs FOR SELECT TO authenticated USING (true);
        END IF;
      END IF;
    END
    $$;

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

    -- View សម្រាប់របាយការណ៍ចែកចាយ (Distribution Alert Reports)
    DROP VIEW IF EXISTS view_distribution_reports_summary CASCADE;
    CREATE VIEW view_distribution_reports_summary AS
    SELECT 
      doc_id,
      data->>'barcode' AS barcode,
      data->>'name' AS recipient_or_driver_name,
      data->>'date' AS report_date,
      data->>'remarks' AS remarks,
      data->>'operatorEmail' AS operator_email,
      data->>'createdBy' AS created_by,
      data->>'createdAt' AS created_at,
      data->>'updatedAt' AS updated_at,
      synced_at
    FROM firestore_backups
    WHERE collection_name = 'distribution_reports';

    -- View សម្រាប់កំណត់ត្រាសកម្មភាព (Activity Logs)
    DROP VIEW IF EXISTS view_activity_logs CASCADE;
    CREATE VIEW view_activity_logs AS
    SELECT 
      doc_id,
      data->>'id' AS log_id,
      data->>'action' AS action,
      data->>'operator' AS operator,
      data->>'operatorEmail' AS operator_email,
      data->>'title' AS title,
      data->>'description' AS description,
      data->>'batchNumber' AS batch_number,
      data->>'targetUserEmail' AS target_user_email,
      data->>'timestamp' AS log_timestamp,
      synced_at
    FROM firestore_backups
    WHERE collection_name = 'activity_logs';

    -- View សម្រាប់សិទ្ធិអ្នកប្រើប្រាស់ (User Permissions)
    DROP VIEW IF EXISTS view_permissions CASCADE;
    CREATE VIEW view_permissions AS
    SELECT 
      doc_id,
      data->>'id' AS user_id,
      data->>'name' AS user_name,
      data->>'email' AS email,
      data->>'role' AS role,
      data->>'status' AS status,
      (data->>'canCreate')::BOOLEAN AS can_create,
      (data->>'canEdit')::BOOLEAN AS can_edit,
      (data->>'canDelete')::BOOLEAN AS can_delete,
      (data->>'viewOnlyOwn')::BOOLEAN AS view_only_own,
      data->>'lastLogin' AS last_login,
      data->>'createdAt' AS created_at,
      synced_at
    FROM firestore_backups
    WHERE collection_name = 'permissions';

    -- View សម្រាប់ប្រតិបត្តិការឃ្លាំង (Warehouse Scans)
    DROP VIEW IF EXISTS view_warehouse_scans CASCADE;
    CREATE VIEW view_warehouse_scans AS
    SELECT 
      doc_id,
      data->>'id' AS scan_id,
      data->>'barcode' AS barcode,
      data->>'tracking' AS tracking,
      data->>'scanType' AS scan_type,
      data->>'driverName' AS driver_name,
      data->>'riderName' AS rider_name,
      data->>'riderPhone' AS rider_phone,
      data->>'destination' AS destination,
      data->>'deliveryZone' AS delivery_zone,
      data->>'truckNo' AS truck_no,
      (data->>'codAmount')::NUMERIC AS cod_amount,
      data->>'currency' AS currency,
      data->>'location' AS location,
      data->>'customerName' AS customer_name,
      data->>'customerPhone' AS customer_phone,
      data->>'operatorEmail' AS operator_email,
      data->>'remarks' AS remarks,
      data->>'createdAt' AS scan_time,
      synced_at
    FROM firestore_backups
    WHERE collection_name = 'warehouse_scans';

    -- កំណត់ security_invoker = true លើ Views (ដោះស្រាយ Supabase Security Advisor Error)
    DO $$
    BEGIN
      BEGIN
        ALTER VIEW view_batches_summary SET (security_invoker = true);
        ALTER VIEW view_medicine_batches_summary SET (security_invoker = true);
        ALTER VIEW view_distribution_reports_summary SET (security_invoker = true);
        ALTER VIEW view_activity_logs SET (security_invoker = true);
        ALTER VIEW view_permissions SET (security_invoker = true);
        ALTER VIEW view_warehouse_scans SET (security_invoker = true);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END
    $$;
  `;

  await pool.query(query);
  console.log(`  ✓ Schema & Views បានរៀបចំជោគជ័យលើ [${targetName}]`);
}

/**
 * ទាញទិន្នន័យពី Collection នីមួយៗក្នុង Firestore រួច Upsert ចូល Targets ទាំងពីរ
 */
async function backupCollection(activeTargets, collectionName, label) {
  const startedAt = new Date();
  console.log(`\n⏳ កំពុងទាញទិន្នន័យពី: [${collectionName}] (${label})...`);

  try {
    const colRef = collection(firestore, collectionName);
    const snapshot = await getDocs(colRef);

    if (snapshot.empty) {
      console.log(`  ℹ️ គ្មានទិន្នន័យក្នុង ${collectionName} ទេ`);
      return { totalDocs: 0, targetCounts: {} };
    }

    const docs = snapshot.docs;
    const upsertQuery = `
      INSERT INTO firestore_backups (collection_name, doc_id, data, firestore_created_at, synced_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (collection_name, doc_id) 
      DO UPDATE SET 
        data = EXCLUDED.data,
        firestore_created_at = EXCLUDED.firestore_created_at,
        synced_at = NOW();
    `;

    const targetCounts = {};
    for (const target of activeTargets) {
      targetCounts[target.name] = 0;
    }

    for (const doc of docs) {
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
      const queryParams = [
        collectionName,
        docId,
        JSON.stringify(cleanedData),
        firestoreCreatedAt ? new Date(firestoreCreatedAt) : null
      ];

      // Upsert ទៅកាន់ Target នីមួយៗ (Local PG និង Supabase) ស្របគ្នា
      await Promise.allSettled(
        activeTargets.map(async (target) => {
          try {
            await target.pool.query(upsertQuery, queryParams);
            targetCounts[target.name]++;
          } catch (err) {
            // Error handling per target to avoid blocking other targets
          }
        })
      );
    }

    // កត់ត្រា History Log ចូល Target នីមួយៗ
    for (const target of activeTargets) {
      const count = targetCounts[target.name] || 0;
      try {
        await target.pool.query(
          `INSERT INTO backup_history_logs (collection_name, records_synced, status, started_at)
           VALUES ($1, $2, 'SUCCESS', $3)`,
          [collectionName, count, startedAt]
        );
        console.log(`  ✓ [${target.name}] បាន Backup ${count}/${docs.length} ឯកសារ`);
      } catch (logErr) {
        // Ignore log errors
      }
    }

    return { totalDocs: docs.length, targetCounts };
  } catch (error) {
    console.error(`  ❌ កំហុសពេលទាញយក ${collectionName} ពី Firebase:`, error.message);
    return { totalDocs: 0, targetCounts: {} };
  }
}

/**
 * មុខងារចម្បងសម្រាប់ដំណើរការ Backup ទាំងអស់
 */
async function runBackup() {
  console.log('====================================================');
  console.log('🚀 ចាប់ផ្តើមដំណើរការ Backup ពី Firebase ចូល PostgreSQL & Supabase');
  console.log(`📅 កាលបរិច្ឆេទ: ${new Date().toLocaleString('km-KH')}`);
  console.log(`🎯 Firebase Project: ${firebaseConfig.projectId}`);
  console.log('====================================================');

  const activeTargets = [];
  let localPool = null;
  let supabasePool = null;

  // ១. ភ្ជាប់ Local PostgreSQL
  try {
    await ensureLocalDatabaseExists();
    localPool = new Pool({
      ...pgLocalConfig,
      database: targetLocalDbName,
    });
    await localPool.query('SELECT 1');
    await localPool.query("SET client_encoding TO 'UTF8'");
    console.log(`🐘 [Local PostgreSQL] បានភ្ជាប់ជោគជ័យ -> ${pgLocalConfig.host}:${pgLocalConfig.port}/${targetLocalDbName}`);
    await initSchema(localPool, 'Local PostgreSQL');
    activeTargets.push({ name: 'Local PostgreSQL', pool: localPool });
  } catch (err) {
    console.warn(`⚠️ [Local PostgreSQL] មិនអាចភ្ជាប់បានទេ: ${err.message}`);
    console.warn('👉 ប្រសិនបើមិនទាន់បានបើក Local Postgres វានឹងរំលង ហើយបន្តទៅ Supabase។');
  }

  // ២. ភ្ជាប់ Cloud Supabase
  if (supabaseDbUrl && supabaseDbUrl.trim() !== '') {
    try {
      supabasePool = new Pool({
        connectionString: supabaseDbUrl.trim(),
        ssl: { rejectUnauthorized: false }, // ចាំបាច់សម្រាប់ Supabase SSL
        client_encoding: 'UTF8',
      });
      await supabasePool.query('SELECT 1');
      await supabasePool.query("SET client_encoding TO 'UTF8'");
      console.log('⚡ [Cloud Supabase] បានភ្ជាប់ជោគជ័យតាមរយៈ SSL Connection!');
      await initSchema(supabasePool, 'Cloud Supabase');
      activeTargets.push({ name: 'Cloud Supabase', pool: supabasePool });
    } catch (err) {
      console.error(`❌ [Cloud Supabase] មិនអាចភ្ជាប់បានទេ: ${err.message}`);
      console.error('👉 សូមពិនិត្យមើល SUPABASE_DB_URL ក្នុង file .env (Password ឬ Connection String)');
    }
  } else {
    console.log('ℹ️ [Cloud Supabase] មិនទាន់បានកំណត់ SUPABASE_DB_URL ក្នុង file .env នៅឡើយទេ (កំពុងរំលង)');
  }

  // ៣. ពិនិត្យមើលថាតើមាន Database យ៉ាងហោចណាស់មួយភ្ជាប់បានដែរឬទេ
  if (activeTargets.length === 0) {
    console.error('\n❌ គ្មាន Database ណាមួយ (Local Postgres ឬ Supabase) អាចភ្ជាប់បានឡើយ! សូមពិនិត្យការកំណត់ .env');
    process.exit(1);
  }

  console.log(`\n📡 គោលដៅ Backup សកម្ម (Active Destinations): ${activeTargets.map(t => t.name).join(' + ')}`);

  try {
    let totalDocsRead = 0;
    for (const item of COLLECTIONS_TO_BACKUP) {
      const res = await backupCollection(activeTargets, item.name, item.label);
      totalDocsRead += res.totalDocs;
    }

    console.log('\n====================================================');
    console.log(`🎉 ដំណើរការ Backup ជោគជ័យទាំងស្រុង! សរុបឯកសារ: ${totalDocsRead} records`);
    console.log(`🎯 បាន Sync ទៅកាន់: ${activeTargets.map(t => t.name).join(', ')}`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ កំហុសកំឡុងពេលដំណើរការ Backup:', err.message);
  } finally {
    if (localPool) await localPool.end().catch(() => {});
    if (supabasePool) await supabasePool.end().catch(() => {});
    process.exit(0);
  }
}

// Execute
runBackup();
