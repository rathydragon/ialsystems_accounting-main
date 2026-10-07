/**
 * Helper to query latest PostgreSQL and Supabase backup status
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {}

export async function getLatestBackupStatus() {
  const targetLocalDbName = process.env.PG_DATABASE || 'ialsystems_backup';
  const pgLocalConfig = {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'Admin@#1992',
    client_encoding: 'UTF8',
    connectionTimeoutMillis: 2000,
  };

  const supabaseDbUrl = process.env.SUPABASE_DB_URL || '';

  const activeDestinations = [];
  let latestInfo = null;
  let collections = [];

  // 1. Try Local PostgreSQL first (fast local network)
  if (!process.env.VERCEL) {
    let localPool = null;
    try {
      localPool = new Pool({
        ...pgLocalConfig,
        database: targetLocalDbName,
      });
      const res = await localPool.query(`
        SELECT 
          MAX(synced_at) AS latest_synced,
          COUNT(*) AS total_records
        FROM firestore_backups
      `);
      
      const collRes = await localPool.query(`
        SELECT 
          collection_name, 
          COUNT(*) AS count,
          MAX(synced_at) AS max_synced
        FROM firestore_backups 
        GROUP BY collection_name
        ORDER BY count DESC
      `);

      activeDestinations.push('Local PostgreSQL');
      latestInfo = res.rows[0];
      collections = collRes.rows.map(r => ({
        name: r.collection_name,
        count: parseInt(r.count, 10),
        syncedAt: r.max_synced
      }));
    } catch (err) {
      // Local PG might not be reachable
    } finally {
      if (localPool) await localPool.end().catch(() => {});
    }
  }

  let supaLatestInfo = null;
  // 2. Try Supabase
  if (supabaseDbUrl && supabaseDbUrl.trim() !== '') {
    let supaPool = null;
    try {
      supaPool = new Pool({
        connectionString: supabaseDbUrl.trim(),
        ssl: { rejectUnauthorized: false },
        client_encoding: 'UTF8',
        connectionTimeoutMillis: 3500,
      });
      const res = await supaPool.query(`
        SELECT 
          MAX(synced_at) AS latest_synced,
          COUNT(*) AS total_records
        FROM firestore_backups
      `);
      activeDestinations.push('Cloud Supabase');
      supaLatestInfo = res.rows[0];
    } catch (err) {
      // Supabase not reachable
    } finally {
      if (supaPool) await supaPool.end().catch(() => {});
    }
  }

  // Choose the most recent info
  const effectiveInfo = latestInfo?.latest_synced 
    ? (supaLatestInfo?.latest_synced && new Date(supaLatestInfo.latest_synced) > new Date(latestInfo.latest_synced) ? supaLatestInfo : latestInfo)
    : supaLatestInfo;

  // Load schedule configuration if exists
  let scheduleStr = 'រៀងរាល់ថ្ងៃ ម៉ោង 18:00 (Auto-Backup)';
  let scheduleActive = true;
  let scheduleConfig = { enabled: true, mode: 'DAILY_TIME', time: '18:00', intervalHours: 1, intervalMinutes: 0 };
  try {
    const fs = await import('fs');
    const schedPath = path.resolve(__dirname, 'backup-schedule.json');
    if (fs.existsSync(schedPath)) {
      scheduleConfig = JSON.parse(fs.readFileSync(schedPath, 'utf8'));
      if (scheduleConfig.enabled === false) {
        scheduleStr = 'បានផ្អាក (Auto-Backup Paused)';
        scheduleActive = false;
      } else if (scheduleConfig.mode === 'INTERVAL') {
        const h = scheduleConfig.intervalHours || 0;
        const m = scheduleConfig.intervalMinutes || 0;
        const parts = [];
        if (h > 0) parts.push(`${h} ម៉ោង`);
        if (m > 0) parts.push(`${m} នាទី`);
        scheduleStr = `រៀងរាល់ ${parts.length > 0 ? parts.join(' ') : '១ ម៉ោង'}ម្តង (Auto-Backup)`;
      } else {
        scheduleStr = `រៀងរាល់ថ្ងៃ ម៉ោង ${scheduleConfig.time || '18:00'} (Auto-Backup)`;
      }
    }
  } catch {}

  if (!effectiveInfo || !effectiveInfo.latest_synced) {
    return {
      hasData: false,
      destinations: activeDestinations,
      schedule: scheduleStr,
      scheduleActive,
      scheduleConfig
    };
  }

  const maxRecords = Math.max(
    parseInt(latestInfo?.total_records, 10) || 0,
    parseInt(supaLatestInfo?.total_records, 10) || 0
  );

  const dateObj = new Date(effectiveInfo.latest_synced);
  const timeStr = dateObj.toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = dateObj.toLocaleDateString('km-KH', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return {
    hasData: true,
    totalRecords: maxRecords,
    destinations: activeDestinations,
    latestSynced: effectiveInfo.latest_synced,
    formattedTime: timeStr,
    formattedDate: dateStr,
    collections,
    schedule: scheduleStr,
    scheduleActive,
    scheduleConfig
  };
}

if (process.argv[1] && process.argv[1].endsWith('get-backup-status.js')) {
  getLatestBackupStatus().then(res => {
    console.log('Result:', JSON.stringify(res, null, 2));
    process.exit(0);
  });
}
