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
  password: process.env.PG_PASSWORD || 'Admin@#1992',
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

  // 1. GET: Fetch all distribution reports (Primary: Hostinger Remote MySQL tbl_distribution_reports)
  if (req.method === 'GET') {
    try {
      const { getMySQLPool } = await import('./remote-mysql.js');
      const myPool = getMySQLPool();
      const [rows] = await myPool.query('SELECT * FROM tbl_distribution_reports ORDER BY created_at DESC, report_date DESC LIMIT 5000');
      if (rows && rows.length > 0) {
        const items = rows.map(d => ({
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
      }
    } catch (mySqlErr) {
      console.warn('[distribution-reports.js] Hostinger MySQL fetch warning:', mySqlErr.message);
    }

    // Secondary: Try local PostgreSQL
    try {
      const p = getPool();
      const dbRes = await p.query(`
        SELECT data 
        FROM local_offline_backups 
        WHERE table_name = 'distribution_reports' 
        ORDER BY COALESCE(record_created_at, synced_at) DESC
      `);

      if (dbRes && dbRes.rows && dbRes.rows.length > 0) {
        const items = dbRes.rows.map(r => {
          const it = r.data || {};
          return {
            id: String(it.id || r.record_id || ''),
            barcode: String(it.barcode || '').trim(),
            name: String(it.name || it.recipient_or_driver_name || '').trim(),
            date: cleanDateStr(it.date || it.report_date, (it.createdAt ? String(it.createdAt).slice(0, 10) : '')),
            remarks: String(it.remarks || '').trim(),
            createdBy: it.createdBy || it.created_by || 'User',
            operatorEmail: it.operatorEmail || it.operator_email || '',
            createdAt: it.createdAt || it.created_at || new Date().toISOString(),
            updatedAt: it.updatedAt || it.updated_at || it.createdAt
          };
        }).filter(it => it.id && it.barcode);

        return sendJson(res, 200, {
          status: 'success',
          source: 'local_postgresql',
          count: items.length,
          data: items
        });
      }
    } catch (err) {
      console.warn('[distribution-reports.js] PostgreSQL fetch error:', err.message);
    }

    // Fallback: Fetch from Google Apps Script if PostgreSQL was empty or had error
    try {
      const webAppUrl = process.env.VITE_GOOGLE_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbygSQiOEQX0ip8yb3wcw7Rctjv884tm6BGluiUkkSdxySMfdjtXwvAWS-NEky-HaBr0vQ/exec';
      const fetchUrl = `${webAppUrl}${webAppUrl.includes('?') ? '&' : '?'}action=get_distribution_reports`;
      const gRes = await fetch(fetchUrl);
      if (gRes.ok) {
        const json = await gRes.json();
        return sendJson(res, 200, {
          status: 'success',
          source: 'google_sheets',
          count: json.count || (json.data ? json.data.length : 0),
          data: json.data || []
        });
      }
    } catch (gErr) {
      console.warn('[distribution-reports.js] Google Sheets fetch error:', gErr.message);
    }

    return sendJson(res, 200, {
      status: 'success',
      source: 'empty',
      count: 0,
      data: []
    });
  }

  // 2. POST: Save / Update distribution report(s) into Hostinger MariaDB (Primary) then PostgreSQL (Backup)
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const reports = Array.isArray(body.reports) ? body.reports : (body.report ? [body.report] : []);

      if (reports.length === 0) {
        return sendJson(res, 400, { status: 'error', message: 'No reports provided' });
      }

      // Step 1: Write to Hostinger MariaDB (Authoritative Primary Master)
      const { getMySQLPool } = await import('./remote-mysql.js');
      const myPool = getMySQLPool();
      const conn = await myPool.getConnection();

      try {
        await conn.beginTransaction();

        for (const item of reports) {
          if (!item || !item.id) continue;
          await conn.query(`
            INSERT INTO tbl_distribution_reports (
              id, barcode, name, report_date, remarks, operator_email, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              barcode = VALUES(barcode),
              name = VALUES(name),
              report_date = VALUES(report_date),
              remarks = VALUES(remarks),
              operator_email = VALUES(operator_email),
              created_by = VALUES(created_by),
              updated_at = VALUES(updated_at)
          `, [
            String(item.id),
            item.barcode || '',
            item.name || '',
            cleanDateStr(item.date, item.createdAt ? String(item.createdAt).slice(0, 10) : '') || '',
            item.remarks || '',
            item.operatorEmail || '',
            item.createdBy || 'User',
            item.createdAt || new Date().toISOString(),
            new Date().toISOString()
          ]);
        }

        await conn.commit();
      } catch (mySqlErr) {
        await conn.rollback().catch(() => {});
        console.error('[distribution-reports.js] Hostinger MariaDB Primary write failed:', mySqlErr);
        return sendJson(res, 500, {
          status: 'error',
          code: 'PRIMARY_DB_WRITE_FAILED',
          message: `កំហុសរក្សាទុកទៅកាន់ Hostinger MariaDB: ${mySqlErr.message}`
        });
      } finally {
        conn.release();
      }

      // Step 2: Backup to Local PostgreSQL (Backup 2)
      try {
        const p = getPool();
        for (const item of reports) {
          if (!item || !item.id) continue;
          const createdAt = item.createdAt || item.date || new Date().toISOString();
          await p.query(`
            INSERT INTO local_offline_backups (table_name, record_id, data, record_created_at, synced_at)
            VALUES ('distribution_reports', $1, $2, $3, NOW())
            ON CONFLICT (table_name, record_id)
            DO UPDATE SET
              data = EXCLUDED.data,
              record_created_at = EXCLUDED.record_created_at,
              synced_at = NOW()
          `, [String(item.id), JSON.stringify(item), createdAt]);

          await p.query(`
            INSERT INTO tbl_distribution_reports (
              id, barcode, recipient_or_driver_name, report_date, remarks, operator_email, created_by, created_at, synced_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (id) DO UPDATE SET
              barcode = EXCLUDED.barcode,
              recipient_or_driver_name = EXCLUDED.recipient_or_driver_name,
              report_date = EXCLUDED.report_date,
              remarks = EXCLUDED.remarks,
              operator_email = EXCLUDED.operator_email,
              created_by = EXCLUDED.created_by,
              created_at = EXCLUDED.created_at,
              synced_at = NOW()
          `, [
            String(item.id),
            item.barcode || null,
            item.name || null,
            cleanDateStr(item.date, item.createdAt ? String(item.createdAt).slice(0, 10) : null) || null,
            item.remarks || null,
            item.operatorEmail || null,
            item.createdBy || 'User',
            item.createdAt || null
          ]).catch(() => {});
        }
      } catch (pgErr) {
        console.warn('[distribution-reports.js] PostgreSQL backup sync warning (primary safe in Hostinger):', pgErr.message);
      }

      return sendJson(res, 200, {
        status: 'success',
        source: 'hostinger_mysql_master',
        message: `✓ Saved ${reports.length} report(s) directly to Hostinger Master MariaDB`,
        count: reports.length
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

      // Step 1: Delete from Hostinger MariaDB Primary
      try {
        const { getMySQLPool } = await import('./remote-mysql.js');
        const myPool = getMySQLPool();
        await myPool.query(`DELETE FROM tbl_distribution_reports WHERE id = ?`, [String(id)]);
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
