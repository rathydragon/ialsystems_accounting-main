const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;");
  console.log('Current tables:', res.rows.map(r => r.table_name));

  const pol = await pool.query("SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';");
  console.log('\nPolicies:', pol.rows);

  pool.end();
}

main().catch(err => {
  console.error(err);
  pool.end();
});
