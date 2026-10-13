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
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
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

  // 1. GET: Fetch all distribution reports from Local PostgreSQL (fallback to Google Sheets if PG is empty)
  if (req.method === 'GET') {
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
            date: String(it.date || it.report_date || (it.createdAt ? String(it.createdAt).slice(0, 10) : '')).trim(),
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
      const webAppUrl = process.env.VITE_GOOGLE_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbzLT1Yymc5zMv4lwldSQ0ft_LxcSbfdenvMzzQICKRb1gHGLGQFeCPis2tj3lwb3gPEXg/exec';
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

  // 2. POST: Save / Update distribution report(s) into Local PostgreSQL
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const reports = Array.isArray(body.reports) ? body.reports : (body.report ? [body.report] : []);

      if (reports.length === 0) {
        return sendJson(res, 400, { status: 'error', message: 'No reports provided' });
      }

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

        // Also upsert into tbl_distribution_reports
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
          item.date || null,
          item.remarks || null,
          item.operatorEmail || null,
          item.createdBy || 'User',
          item.createdAt || null
        ]).catch(() => {});
      }

      return sendJson(res, 200, {
        status: 'success',
        message: `Saved ${reports.length} report(s) to PostgreSQL`,
        count: reports.length
      });
    } catch (err) {
      console.error('[distribution-reports.js] Save error:', err);
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  // 3. DELETE: Remove report by id from Local PostgreSQL
  if (req.method === 'DELETE') {
    try {
      const body = req.body || {};
      const id = body.id || req.query?.id;
      if (!id) {
        return sendJson(res, 400, { status: 'error', message: 'No id provided' });
      }

      const p = getPool();
      await p.query(`DELETE FROM local_offline_backups WHERE table_name = 'distribution_reports' AND record_id = $1`, [String(id)]);
      await p.query(`DELETE FROM tbl_distribution_reports WHERE id = $1`, [String(id)]).catch(() => {});

      return sendJson(res, 200, { status: 'success', message: 'Deleted report ' + id });
    } catch (err) {
      console.error('[distribution-reports.js] Delete error:', err);
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  return sendJson(res, 405, { status: 'error', message: 'Method Not Allowed' });
}
