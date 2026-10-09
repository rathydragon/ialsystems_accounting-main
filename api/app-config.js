import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

// Load local .env if available
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {}

const supabaseDbUrl = process.env.SUPABASE_DB_URL;

let pool = null;
function getPool() {
  if (!supabaseDbUrl) {
    throw new Error('SUPABASE_DB_URL environment variable is not defined');
  }
  if (!pool) {
    const u = new URL(supabaseDbUrl);
    pool = new Pool({
      host: u.hostname,
      port: parseInt(u.port || '5432', 10),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.slice(1) || 'postgres',
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    const p = getPool();

    if (req.method === 'GET') {
      const { id } = req.query || {};
      if (id) {
        const result = await p.query('SELECT id, data, updated_at FROM app_config WHERE id = $1 LIMIT 1', [id]);
        if (result.rows.length > 0) {
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'success', data: result.rows[0].data, updatedAt: result.rows[0].updated_at }));
          return;
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ status: 'not_found', data: null }));
          return;
        }
      }

      // Return all configs
      const allResult = await p.query('SELECT id, data, updated_at FROM app_config ORDER BY id');
      const allConfigs = {};
      allResult.rows.forEach(r => {
        allConfigs[r.id] = r.data;
      });

      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'success', data: allConfigs }));
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      }

      const { id, data } = body || {};
      if (!id || !data) {
        res.statusCode = 400;
        res.end(JSON.stringify({ status: 'error', message: 'Missing id or data' }));
        return;
      }

      await p.query(
        `INSERT INTO app_config (id, data, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (id)
         DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [id, JSON.stringify(data)]
      );

      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'success', id, data }));
      return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ status: 'error', message: 'Method not allowed' }));
  } catch (err) {
    console.error('API /api/app-config error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ status: 'error', message: err.message || 'Server error' }));
  }
}
