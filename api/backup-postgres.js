import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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

// 1. Firebase Config
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyBNXqK2paVb4pvMfxhCXTD6Xj5kna7ZY6I',
  authDomain: `${process.env.VITE_FIREBASE_PROJECT_ID || 'ialexpress'}.firebaseapp.com`,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'ialexpress',
  storageBucket: `${process.env.VITE_FIREBASE_PROJECT_ID || 'ialexpress'}.appspot.com`,
  appId: process.env.VITE_FIREBASE_APP_ID || '1:494989224946:web:590a34eace464d1a82d96b',
};

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const firestore = getFirestore(app);

// 2. Database Targets
const targetLocalDbName = process.env.PG_DATABASE || 'ialsystems_backup';
const pgLocalConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'Admin@#1992',
  client_encoding: 'UTF8',
};

// Cloud Supabase Connection String (Primary for Vercel Cloud)
const supabaseDbUrl =
  process.env.SUPABASE_DB_URL ||
  'postgresql://postgres.tinrrnfxrbwzrqcyvdlo:Ialexpress%40%23admin@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

const COLLECTIONS_TO_BACKUP = [
  { name: 'batches', label: 'ទទួលប្រាក់ទូទៅ (General Batches)' },
  { name: 'medicine_batches', label: 'ទទួលលុយថ្នាំពេទ្យ (Medicine Batches - Data_BM)' },
  { name: 'permissions', label: 'សិទ្ធិអ្នកប្រើប្រាស់ (User Permissions)' },
  { name: 'activity_logs', label: 'កំណត់ត្រាសកម្មភាព (Activity Logs)' },
  { name: 'app_config', label: 'ការកំណត់ប្រព័ន្ធ (App Configuration)' },
  { name: 'bank_slips', label: 'បង្កាន់ដៃធនាគារ (Bank Slips)' },
  { name: 'distribution_reports', label: 'របាយការណ៍ចែកចាយ (Distribution Alert Reports)' },
  { name: 'warehouse_scans', label: 'ប្រតិបត្តិការឃ្លាំង (Warehouse Scans)' }
];

async function initSchema(pool) {
  const query = `
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

    CREATE TABLE IF NOT EXISTS backup_history_logs (
      id SERIAL PRIMARY KEY,
      collection_name VARCHAR(100) NOT NULL,
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
    let lastBackup = null;
    let pool = null;
    try {
      if (supabaseDbUrl && supabaseDbUrl.trim() !== '') {
        pool = new Pool({
          connectionString: supabaseDbUrl.trim(),
          ssl: { rejectUnauthorized: false },
          client_encoding: 'UTF8',
          connectionTimeoutMillis: 3500,
        });
        const [infoRes, collRes] = await Promise.all([
          pool.query(`
            SELECT 
              MAX(synced_at) AS latest_synced,
              COUNT(*) AS total_records
            FROM firestore_backups
          `),
          pool.query(`
            SELECT 
              collection_name, 
              COUNT(*) AS count,
              MAX(synced_at) AS max_synced
            FROM firestore_backups 
            GROUP BY collection_name
            ORDER BY count DESC
          `)
        ]);

        if (infoRes.rows[0]?.latest_synced) {
          const dateObj = new Date(infoRes.rows[0].latest_synced);
          lastBackup = {
            hasData: true,
            totalRecords: parseInt(infoRes.rows[0].total_records, 10) || 0,
            destinations: process.env.VERCEL ? ['Cloud Supabase'] : ['Local PostgreSQL', 'Cloud Supabase'],
            latestSynced: infoRes.rows[0].latest_synced,
            formattedTime: dateObj.toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            formattedDate: dateObj.toLocaleDateString('km-KH', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            collections: collRes.rows.map(r => ({
              name: r.collection_name,
              count: parseInt(r.count, 10),
              syncedAt: r.max_synced
            })),
            schedule: 'រៀងរាល់ ១ ម៉ោងម្តង (Windows Task Scheduler)',
            scheduleActive: true
          };
        }
      }
    } catch (e) {
      // ignore get errors
    } finally {
      if (pool) await pool.end().catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      status: 'ready',
      environment: process.env.VERCEL ? 'vercel_cloud' : 'local_node',
      supabaseConfigured: Boolean(supabaseDbUrl),
      lastBackup
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
  }

  const activeTargets = [];
  let localPool = null;
  let supabasePool = null;

  try {
    // 1. Try Cloud Supabase (Preferred on Vercel)
    if (supabaseDbUrl && supabaseDbUrl.trim() !== '') {
      try {
        supabasePool = new Pool({
          connectionString: supabaseDbUrl.trim(),
          ssl: { rejectUnauthorized: false },
          client_encoding: 'UTF8',
          connectionTimeoutMillis: 5000,
        });
        await supabasePool.query('SELECT 1');
        await initSchema(supabasePool);
        activeTargets.push({ name: 'Cloud Supabase PostgreSQL', pool: supabasePool });
      } catch (err) {
        console.warn('Supabase connect warning:', err.message);
      }
    }

    // 2. Try Local PostgreSQL (Only if running on local machine, not on Vercel)
    if (!process.env.VERCEL) {
      try {
        localPool = new Pool({
          ...pgLocalConfig,
          database: targetLocalDbName,
          connectionTimeoutMillis: 2000,
        });
        await localPool.query('SELECT 1');
        await initSchema(localPool);
        activeTargets.push({ name: 'Local PostgreSQL', pool: localPool });
      } catch (err) {
        // Ignored on environments without local postgres
      }
    }

    if (activeTargets.length === 0) {
      return res.status(500).json({
        ok: false,
        message: 'មិនអាចភ្ជាប់ទៅកាន់ PostgreSQL ឬ Supabase បានទេ។ សូមពិនិត្យមើល SUPABASE_DB_URL។'
      });
    }

    let totalDocsCount = 0;
    const upsertQuery = `
      INSERT INTO firestore_backups (collection_name, doc_id, data, firestore_created_at, synced_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (collection_name, doc_id) 
      DO UPDATE SET 
        data = EXCLUDED.data,
        firestore_created_at = EXCLUDED.firestore_created_at,
        synced_at = NOW();
    `;

    // Process collections in fast batches
    for (const item of COLLECTIONS_TO_BACKUP) {
      try {
        const snap = await getDocs(collection(firestore, item.name));
        if (snap.empty) continue;

        totalDocsCount += snap.docs.length;
        const now = new Date();

        // Run batch upserts concurrently in chunks of 20
        const chunkSize = 20;
        for (let i = 0; i < snap.docs.length; i += chunkSize) {
          const chunk = snap.docs.slice(i, i + chunkSize);
          await Promise.all(
            chunk.map(async (doc) => {
              const rawData = doc.data();
              const cleanedData = JSON.parse(
                JSON.stringify(rawData, (key, value) => {
                  if (value && typeof value === 'object' && value.seconds !== undefined) {
                    return new Date(value.seconds * 1000).toISOString();
                  }
                  return value;
                })
              );
              const createdAt = cleanedData.createdAt || cleanedData.timestamp || null;
              const params = [
                item.name,
                doc.id,
                JSON.stringify(cleanedData),
                createdAt ? new Date(createdAt) : null
              ];

              await Promise.all(
                activeTargets.map((t) => t.pool.query(upsertQuery, params).catch(() => {}))
              );
            })
          );
        }

        // Log history
        await Promise.all(
          activeTargets.map((t) =>
            t.pool
              .query(
                `INSERT INTO backup_history_logs (collection_name, records_synced, status, started_at)
                 VALUES ($1, $2, 'SUCCESS', $3)`,
                [item.name, snap.docs.length, now]
              )
              .catch(() => {})
          )
        );
      } catch (collErr) {
        console.warn(`Error backing up ${item.name}:`, collErr.message);
      }
    }

    return res.status(200).json({
      ok: true,
      status: 'success',
      records: totalDocsCount,
      destinations: activeTargets.map((t) => t.name),
      message: `✓ បាន Backup ជោគជ័យចូល ${activeTargets.map((t) => t.name).join(' & ')}! (សរុប ${totalDocsCount} ឯកសារ)`
    });
  } catch (globalErr) {
    return res.status(500).json({
      ok: false,
      message: 'កំហុសកំឡុងពេល Backup: ' + (globalErr?.message || globalErr)
    });
  } finally {
    if (localPool) await localPool.end().catch(() => {});
    if (supabasePool) await supabasePool.end().catch(() => {});
  }
}
