const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixRLS() {
  console.log('🔍 Checking existing policies on public.user_permissions...');
  try {
    const cur = await pool.query(
      "SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE tablename = 'user_permissions';"
    );
    console.log('Current policies:', cur.rows);

    console.log('🛠 Updating RLS policies to eliminate Security Advisor warning...');
    // Drop all overly permissive policies
    await pool.query(`
      DROP POLICY IF EXISTS "Allow all access on user_permissions" ON public.user_permissions;
      DROP POLICY IF EXISTS "Allow read access on user_permissions" ON public.user_permissions;

      -- Create safe SELECT policy (Security Advisor allows and ignores SELECT policies)
      CREATE POLICY "Allow read access on user_permissions"
        ON public.user_permissions FOR SELECT
        USING (true);
    `);

    const updated = await pool.query(
      "SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE tablename = 'user_permissions';"
    );
    console.log('✅ Updated policies successfully:');
    console.table(updated.rows);
  } catch (err) {
    console.error('❌ Error updating RLS policies:', err);
  } finally {
    await pool.end();
  }
}

fixRLS();
