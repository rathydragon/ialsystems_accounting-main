const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('🚀 Starting migration for Supabase user_permissions table...');
  try {
    // 1. Create user_permissions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.user_permissions (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'VIEWER',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        data_scope TEXT NOT NULL DEFAULT 'ALL_DATA',
        can_create BOOLEAN DEFAULT true,
        can_edit BOOLEAN DEFAULT false,
        can_delete BOOLEAN DEFAULT false,
        allowed_pages TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_login TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ Created public.user_permissions table');

    // 2. Enable RLS and public read policy (mutations handled safely via backend API)
    await pool.query(`
      ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
      
      DROP POLICY IF EXISTS "Allow all access on user_permissions" ON public.user_permissions;

      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'user_permissions' AND policyname = 'Allow read access on user_permissions'
        ) THEN
          CREATE POLICY "Allow read access on user_permissions"
            ON public.user_permissions FOR SELECT
            USING (true);
        END IF;
      END $$;
    `);
    console.log('✓ Enabled RLS and configured safe policies');

    // 3. Add to supabase_realtime publication
    try {
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_permissions'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.user_permissions;
          END IF;
        END $$;
      `);
      console.log('✓ Added user_permissions to supabase_realtime publication');
    } catch (e) {
      console.warn('Note on realtime publication:', e.message);
    }

    // 4. Seed / migrate existing permissions from firestore_backups if available
    const backupRows = await pool.query(`
      SELECT data FROM firestore_backups WHERE collection_name = 'permissions'
    `);
    console.log(`Found ${backupRows.rows.length} existing permissions in firestore_backups`);

    for (const row of backupRows.rows) {
      const p = row.data;
      if (!p || !p.email) continue;
      const email = String(p.email).toLowerCase().trim();
      const id = String(p.id || `u-${Date.now()}`);
      const name = String(p.name || email.split('@')[0]);
      const role = String(p.role || 'VIEWER').toUpperCase();
      const status = String(p.status || 'ACTIVE').toUpperCase();
      const dataScope = p.viewOnlyOwn ? 'OWN_ONLY' : 'ALL_DATA';
      const canCreate = p.canCreate !== false;
      const canEdit = Boolean(p.canEdit);
      const canDelete = Boolean(p.canDelete);
      const allowedPages = Array.isArray(p.allowedPages) ? p.allowedPages : [];
      const createdAt = p.createdAt || new Date().toISOString();
      const lastLogin = p.lastLogin || null;
      const updatedAt = p.updatedAt || new Date().toISOString();

      await pool.query(`
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
      `, [
        id, email, name, role, status, dataScope, canCreate, canEdit, canDelete, allowedPages, createdAt, lastLogin, updatedAt
      ]);
    }
    console.log('✓ Successfully migrated existing permissions to public.user_permissions');

    const total = await pool.query('SELECT count(*) FROM public.user_permissions');
    console.log(`🎉 Complete! Total users in user_permissions: ${total.rows[0].count}`);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
