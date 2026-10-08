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

const supabaseDbUrl = process.env.SUPABASE_DB_URL || '';

let pool = null;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: supabaseDbUrl,
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

  const p = getPool();

  try {
    if (req.method === 'GET') {
      const result = await p.query(`
        SELECT 
          id, 
          email, 
          name, 
          role, 
          status, 
          data_scope as "dataScope", 
          (data_scope = 'OWN_ONLY') as "viewOnlyOwn",
          can_create as "canCreate", 
          can_edit as "canEdit", 
          can_delete as "canDelete", 
          allowed_pages as "allowedPages", 
          created_at as "createdAt", 
          last_login as "lastLogin", 
          updated_at as "updatedAt"
        FROM public.user_permissions
        ORDER BY created_at ASC
      `);

      res.statusCode = 200;
      res.end(JSON.stringify({
        status: 'success',
        source: 'supabase',
        data: result.rows
      }));
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch {}
      }

      const action = body?.action || 'save';

      // 1. Delete permission
      if (action === 'delete') {
        const email = String(body.email || '').toLowerCase().trim();
        if (!email) {
          res.statusCode = 400;
          res.end(JSON.stringify({ status: 'error', message: 'Email is required' }));
          return;
        }
        await p.query('DELETE FROM public.user_permissions WHERE LOWER(email) = LOWER($1)', [email]);
        res.statusCode = 200;
        res.end(JSON.stringify({ status: 'success', message: `Deleted ${email}` }));
        return;
      }

      // 2. Bulk sync permissions
      if (action === 'bulk_sync' && Array.isArray(body.permissions)) {
        for (const perm of body.permissions) {
          if (!perm.email) continue;
          const cleanEmail = perm.email.toLowerCase().trim();
          const id = perm.id || `u-${Date.now()}`;
          const name = perm.name?.trim() || cleanEmail.split('@')[0];
          const role = (perm.role || 'VIEWER').toUpperCase();
          const status = (perm.status || 'ACTIVE').toUpperCase();
          const dataScope = perm.viewOnlyOwn ? 'OWN_ONLY' : (perm.dataScope || 'ALL_DATA');
          const canCreate = perm.canCreate !== false;
          const canEdit = Boolean(perm.canEdit);
          const canDelete = Boolean(perm.canDelete);
          const allowedPages = Array.isArray(perm.allowedPages) ? perm.allowedPages : [];
          const createdAt = perm.createdAt || new Date().toISOString();
          const lastLogin = perm.lastLogin || null;
          const updatedAt = new Date().toISOString();

          await p.query(`
            INSERT INTO public.user_permissions (
              id, email, name, role, status, data_scope, can_create, can_edit, can_delete, allowed_pages, created_at, last_login, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
            ) ON CONFLICT (email) DO UPDATE SET
              name = EXCLUDED.name,
              role = EXCLUDED.role,
              status = EXCLUDED.status,
              data_scope = EXCLUDED.data_scope,
              can_create = EXCLUDED.can_create,
              can_edit = EXCLUDED.can_edit,
              can_delete = EXCLUDED.can_delete,
              allowed_pages = EXCLUDED.allowed_pages,
              last_login = COALESCE(EXCLUDED.last_login, public.user_permissions.last_login),
              updated_at = EXCLUDED.updated_at;
          `, [id, cleanEmail, name, role, status, dataScope, canCreate, canEdit, canDelete, allowedPages, createdAt, lastLogin, updatedAt]);
        }

        res.statusCode = 200;
        res.end(JSON.stringify({ status: 'success', count: body.permissions.length }));
        return;
      }

      // 3. Save single permission
      const perm = body.permission || body;
      const cleanEmail = String(perm.email || '').toLowerCase().trim();
      if (!cleanEmail) {
        res.statusCode = 400;
        res.end(JSON.stringify({ status: 'error', message: 'Email is required' }));
        return;
      }

      const id = perm.id || `u-${Date.now()}`;
      const name = perm.name?.trim() || cleanEmail.split('@')[0];
      const role = (perm.role || 'VIEWER').toUpperCase();
      const status = (perm.status || 'ACTIVE').toUpperCase();
      const dataScope = perm.viewOnlyOwn ? 'OWN_ONLY' : (perm.dataScope || 'ALL_DATA');
      const canCreate = perm.canCreate !== false;
      const canEdit = Boolean(perm.canEdit);
      const canDelete = Boolean(perm.canDelete);
      const allowedPages = Array.isArray(perm.allowedPages) ? perm.allowedPages : [];
      const createdAt = perm.createdAt || new Date().toISOString();
      const lastLogin = perm.lastLogin || null;
      const updatedAt = new Date().toISOString();

      await p.query(`
        INSERT INTO public.user_permissions (
          id, email, name, role, status, data_scope, can_create, can_edit, can_delete, allowed_pages, created_at, last_login, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          data_scope = EXCLUDED.data_scope,
          can_create = EXCLUDED.can_create,
          can_edit = EXCLUDED.can_edit,
          can_delete = EXCLUDED.can_delete,
          allowed_pages = EXCLUDED.allowed_pages,
          last_login = COALESCE(EXCLUDED.last_login, public.user_permissions.last_login),
          updated_at = EXCLUDED.updated_at;
      `, [id, cleanEmail, name, role, status, dataScope, canCreate, canEdit, canDelete, allowedPages, createdAt, lastLogin, updatedAt]);

      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'success', email: cleanEmail }));
      return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ status: 'error', message: 'Method Not Allowed' }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ status: 'error', message: err.message }));
  }
}
