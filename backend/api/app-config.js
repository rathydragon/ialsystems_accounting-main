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

const pgConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  database: process.env.PG_DATABASE || 'ialsystems_backup',
  client_encoding: 'UTF8',
  connectionTimeoutMillis: 3000
};

let pool = null;
function getPool() {
  if (!pool) {
    try {
      pool = new Pool(pgConfig);
    } catch (e) {
      console.warn('Failed to initialize PostgreSQL pool in app-config:', e);
    }
  }
  return pool;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    // ----------------------------------------------------
    // GET Handler: Retrieve app_config
    // ----------------------------------------------------
    if (req.method === 'GET') {
      const rawUrl = req.originalUrl || req.url || '/';
      const parsedUrl = new URL(rawUrl, 'http://localhost');
      const id = parsedUrl.searchParams.get('id') || (req.query && req.query.id);

      const p = getPool();
      if (p) {
        try {
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

          const allResult = await p.query('SELECT id, data, updated_at FROM app_config ORDER BY id');
          const allConfigs = {};
          allResult.rows.forEach(r => {
            allConfigs[r.id] = r.data;
          });
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'success', data: allConfigs }));
          return;
        } catch (dbErr) {
          console.warn('PostgreSQL app_config query notice:', dbErr.message);
        }
      }

      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'success', data: id ? null : {} }));
      return;
    }

    // ----------------------------------------------------
    // POST Handler: Save / Upsert app_config
    // ----------------------------------------------------
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

      const p = getPool();
      if (p) {
        try {
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
        } catch (dbErr) {
          console.warn('PostgreSQL app_config save notice:', dbErr.message);
        }
      }

      // Return success gracefully when database connection is not configured
      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'success', id, data, stored: 'client_managed' }));
      return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ status: 'error', message: 'Method not allowed' }));
  } catch (err) {
    console.error('API /api/app-config unexpected error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ status: 'error', message: err.message || 'Server error' }));
  }
}
