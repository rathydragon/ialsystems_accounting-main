/**
 * Helper to query latest PostgreSQL backup status
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readSchedule, scheduleLabel, nextRunAt } from './backup-schedule.js';

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
    password: process.env.PG_PASSWORD || '',
    client_encoding: 'UTF8',
    connectionTimeoutMillis: 2000,
  };

  const activeDestinations = [];
  let pgError = null;
  let history = [];
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
      // Query local_offline_backups (primary) or firestore_backups
      let res = await localPool.query(`
        SELECT 
          MAX(synced_at) AS latest_synced,
          COUNT(*) AS total_records
        FROM local_offline_backups
      `).catch(() => null);

      let collRes = await localPool.query(`
        SELECT 
          table_name AS name, 
          COUNT(*) AS count,
          MAX(synced_at) AS max_synced
        FROM local_offline_backups 
        GROUP BY table_name
        ORDER BY count DESC
      `).catch(() => null);

      if (!res || !res.rows[0]?.latest_synced || parseInt(res.rows[0]?.total_records, 10) === 0) {
        res = await localPool.query(`
          SELECT 
            MAX(synced_at) AS latest_synced,
            COUNT(*) AS total_records
          FROM firestore_backups
        `).catch(() => null);

        collRes = await localPool.query(`
          SELECT 
            collection_name AS name, 
            COUNT(*) AS count,
            MAX(synced_at) AS max_synced
          FROM firestore_backups 
          GROUP BY collection_name
          ORDER BY count DESC
        `).catch(() => null);
      }

      // Prefer the full copy of every Hostinger table (schema "hostinger")
      const mirrorColl = await localPool.query(`
        SELECT table_name AS name, row_count AS count, synced_at AS max_synced, status
        FROM hostinger_mirror_status ORDER BY row_count DESC, table_name
      `).catch(() => null);
      if (mirrorColl?.rows?.length) {
        res = {
          rows: [{
            latest_synced: mirrorColl.rows.reduce((m, r) => (!m || r.max_synced > m ? r.max_synced : m), null),
            total_records: mirrorColl.rows.reduce((s, r) => s + Number(r.count || 0), 0)
          }]
        };
        collRes = mirrorColl;
      }

      activeDestinations.push('Local PostgreSQL');
      latestInfo = res?.rows?.[0] || null;
      if (collRes?.rows) {
        collections = collRes.rows.map(r => ({
          name: r.name,
          count: parseInt(r.count, 10),
          syncedAt: r.max_synced,
          ...(r.status ? { status: r.status } : {})
        }));
      }
      // Latest full-run records (newest first)
      const hist = await localPool.query(`
        SELECT records_synced, status, message, started_at, finished_at
        FROM backup_history_logs WHERE table_name = 'ALL_TABLES'
        ORDER BY finished_at DESC LIMIT 10
      `).catch(() => null);
      history = (hist?.rows || []).map((r) => ({
        rows: Number(r.records_synced),
        status: r.status,
        message: r.message,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        durationMs: r.started_at && r.finished_at ? new Date(r.finished_at) - new Date(r.started_at) : null
      }));
    } catch (err) {
      pgError = err?.message || String(err);
    } finally {
      if (localPool) await localPool.end().catch(() => {});
    }
  }

  const effectiveInfo = latestInfo;
  const scheduleConfig = readSchedule();
  const scheduleStr = scheduleLabel(scheduleConfig);
  const scheduleActive = scheduleConfig.enabled !== false;
  const next = nextRunAt(scheduleConfig);
  const common = {
    destinations: activeDestinations,
    pgError,
    schedule: scheduleStr,
    scheduleActive,
    scheduleConfig,
    nextRunAt: next ? next.toISOString() : null,
    lastResult: scheduleConfig.lastResult || null,
    history
  };

  if (!effectiveInfo || !effectiveInfo.latest_synced) {
    return { hasData: false, ...common };
  }

  const maxRecords = parseInt(effectiveInfo?.total_records, 10) || 0;

  const dateObj = new Date(effectiveInfo.latest_synced);
  const timeStr = dateObj.toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = dateObj.toLocaleDateString('km-KH', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return {
    hasData: true,
    totalRecords: maxRecords,
    latestSynced: effectiveInfo.latest_synced,
    formattedTime: timeStr,
    formattedDate: dateStr,
    collections,
    ...common
  };
}

if (process.argv[1] && process.argv[1].endsWith('get-backup-status.js')) {
  getLatestBackupStatus().then(res => {
    console.log('Result:', JSON.stringify(res, null, 2));
    process.exit(0);
  });
}
