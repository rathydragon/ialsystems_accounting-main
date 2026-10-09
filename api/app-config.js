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

const DEFAULT_SUPABASE_URL = 'https://tinrrnfxrbwzrqcyvdlo.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpbnJybmZ4cmJ3enJxY3l2ZGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMjc4ODUsImV4cCI6MjEwNjgwMzg4NX0.KCuwyhCuy_WkawZFEteMhrU1OwJepVECFOgDsxh0wnI';
const DEFAULT_SUPABASE_DB_URL = 'postgresql://postgres.tinrrnfxrbwzrqcyvdlo:Ialexpress%40%23admin@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
const supabaseDbUrl = process.env.SUPABASE_DB_URL || DEFAULT_SUPABASE_DB_URL;

let pool = null;
function getPool() {
  if (!pool && supabaseDbUrl) {
    try {
      const u = new URL(supabaseDbUrl);
      pool = new Pool({
        host: u.hostname,
        port: parseInt(u.port || '5432', 10),
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.slice(1) || 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });
    } catch (e) {
      console.warn('Failed to initialize PG pool:', e);
    }
  }
  return pool;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

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
      const { id } = req.query || {};

      // 1. Try Supabase REST API (Best for Vercel serverless)
      try {
        const restEndpoint = id 
          ? `${supabaseUrl}/rest/v1/app_config?id=eq.${encodeURIComponent(id)}&select=*`
          : `${supabaseUrl}/rest/v1/app_config?select=*`;

        const restRes = await fetch(restEndpoint, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        });

        if (restRes.ok) {
          const rows = await restRes.json();
          if (Array.isArray(rows)) {
            if (id) {
              if (rows.length > 0) {
                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'success', data: rows[0].data, updatedAt: rows[0].updated_at }));
                return;
              } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ status: 'not_found', data: null }));
                return;
              }
            } else {
              const allConfigs = {};
              rows.forEach(r => {
                allConfigs[r.id] = r.data;
              });
              res.statusCode = 200;
              res.end(JSON.stringify({ status: 'success', data: allConfigs }));
              return;
            }
          }
        }
      } catch (err) {
        console.warn('REST API fetch error, attempting direct PG pool:', err);
      }

      // 2. Fallback to direct PostgreSQL Pool
      const p = getPool();
      if (p) {
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
      }

      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'success', data: {} }));
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

      const now = new Date().toISOString();

      // 1. Try Supabase REST API upsert
      try {
        const restRes = await fetch(`${supabaseUrl}/rest/v1/app_config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            id,
            data,
            updated_at: now
          })
        });

        if (restRes.ok || restRes.status === 201) {
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'success', id, data }));
          return;
        }
      } catch (err) {
        console.warn('REST API save error, attempting direct PG pool:', err);
      }

      // 2. Fallback to direct PostgreSQL Pool
      const p = getPool();
      if (p) {
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

      res.statusCode = 500;
      res.end(JSON.stringify({ status: 'error', message: 'Unable to connect to database' }));
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
