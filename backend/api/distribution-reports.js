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

const targetLocalDbName = process.env.PG_DATABASE || 'ialsystems_backup';
const pgLocalConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  client_encoding: 'UTF8',
  max: 5,
  connectionTimeoutMillis: 3000,
};

let pool = null;
function getPool() {
  if (!pool) {
    pool = new Pool({
      ...pgLocalConfig,
      database: targetLocalDbName,
    });
  }
  return pool;
}

function sendJson(res, statusCode, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

function cleanDateStr(val, fallback = '') {
  if (!val) return fallback;
  const s = String(val).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${da}`;
    }
  } catch {}
  return s;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // 1. GET: Fetch all distribution reports — Hostinger MySQL is the single source of truth.
  // No PostgreSQL / Google Sheets fallback: those mirrors can lag behind deletes and would resurrect rows.
  if (req.method === 'GET') {
    try {
      const { getMySQLPool } = await import('./remote-mysql.js');
      const myPool = getMySQLPool();
      const [rows] = await myPool.query('SELECT * FROM tbl_distribution_reports ORDER BY created_at DESC, report_date DESC LIMIT 5000');
      const items = (rows || []).map(d => ({
        id: String(d.id),
        barcode: String(d.barcode || '').trim(),
        name: String(d.name || '').trim(),
        date: cleanDateStr(d.report_date, d.created_at ? String(d.created_at).slice(0, 10) : ''),
        report_date: cleanDateStr(d.report_date, d.created_at ? String(d.created_at).slice(0, 10) : ''),
        remarks: String(d.remarks || '').trim(),
        operatorEmail: String(d.operator_email || '').trim(),
        createdBy: d.created_by || 'User',
        createdAt: d.created_at || new Date().toISOString(),
        updatedAt: d.updated_at || d.created_at || new Date().toISOString()
      })).filter(it => it.id && it.barcode);

      return sendJson(res, 200, {
        status: 'success',
        source: 'hostinger_mysql_master',
        count: items.length,
        data: items
      });
    } catch (mySqlErr) {
      console.error('[distribution-reports.js] Hostinger MySQL fetch failed:', mySqlErr.message);
      return sendJson(res, 503, {
        status: 'error',
        code: 'PRIMARY_DB_READ_FAILED',
        message: `មិនអាចទាញទិន្នន័យពី Hostinger MariaDB: ${mySqlErr.message}`
      });
    }
  }

  // 2. POST: Save / Update distribution report(s) into Hostinger MariaDB (Primary) then PostgreSQL (Backup)
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const reports = Array.isArray(body.reports) ? body.reports : (body.report ? [body.report] : []);

      if (reports.length === 0) {
        return sendJson(res, 400, { status: 'error', message: 'No reports provided' });
      }

      // Step 1: Write to Hostinger MariaDB through the shared master handler (tombstone-protected:
      // reports that were already deleted are ignored instead of being re-inserted)
      let result;
      try {
        const { getMySQLPool } = await import('./remote-mysql.js');
        const { saveDistributionReportToMySQL } = await import('./mysql-master-handlers.js');
        const normalized = reports.filter(it => it && it.id).map(it => ({
          ...it,
          date: cleanDateStr(it.date, it.createdAt ? String(it.createdAt).slice(0, 10) : '') || ''
        }));
        result = await saveDistributionReportToMySQL(getMySQLPool(), normalized, body.webAppUrl);
      } catch (mySqlErr) {
        console.error('[distribution-reports.js] Hostinger MariaDB Primary write failed:', mySqlErr);
        return sendJson(res, 500, {
          status: 'error',
          code: 'PRIMARY_DB_WRITE_FAILED',
          message: `កំហុសរក្សាទុកទៅកាន់ Hostinger MariaDB: ${mySqlErr.message}`
        });
      }

      return sendJson(res, 200, {
        status: 'success',
        source: 'hostinger_mysql_master',
        message: `✓ Saved ${result.count} report(s) directly to Hostinger Master MariaDB`,
        count: result.count,
        skippedDeleted: result.skippedDeleted || 0
      });
    } catch (err) {
      console.error('[distribution-reports.js] Save error:', err);
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  // 3. DELETE: Remove report by id from Hostinger Remote MariaDB (Primary) then Local PostgreSQL (Backup)
  if (req.method === 'DELETE') {
    try {
      const body = req.body || {};
      const id = body.id || req.query?.id;
      if (!id) {
        return sendJson(res, 400, { status: 'error', message: 'No id provided' });
      }

      // Step 1: Delete from Hostinger MariaDB Primary (records a tombstone so it cannot come back)
      try {
        const { getMySQLPool } = await import('./remote-mysql.js');
        const { deleteDistributionReportFromMySQL } = await import('./mysql-master-handlers.js');
        await deleteDistributionReportFromMySQL(getMySQLPool(), [String(id)], body.barcode, body.webAppUrl);
      } catch (mySqlDelErr) {
        console.error('[distribution-reports.js] Hostinger MariaDB delete failed:', mySqlDelErr);
        return sendJson(res, 500, {
          status: 'error',
          code: 'PRIMARY_DB_DELETE_FAILED',
          message: `កំហុសលុបកំណត់ត្រាពី Hostinger MariaDB: ${mySqlDelErr.message}`
        });
      }

      // Step 2: Delete from Local PostgreSQL Backup
      try {
        const p = getPool();
        await p.query(`DELETE FROM local_offline_backups WHERE table_name = 'distribution_reports' AND record_id = $1`, [String(id)]);
        await p.query(`DELETE FROM tbl_distribution_reports WHERE id = $1`, [String(id)]).catch(() => {});
      } catch (pgDelErr) {
        console.warn('[distribution-reports.js] PostgreSQL backup delete warning:', pgDelErr.message);
      }

      return sendJson(res, 200, {
        status: 'success',
        source: 'hostinger_mysql_master',
        message: 'Deleted report ' + id + ' from Hostinger MariaDB'
      });
    } catch (err) {
      console.error('[distribution-reports.js] Delete error:', err);
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  return sendJson(res, 405, { status: 'error', message: 'Method Not Allowed' });
}
