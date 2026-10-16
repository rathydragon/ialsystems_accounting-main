import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client } = pg;

const targetDbName = process.env.PG_DATABASE || 'ialsystems_backup';
const config = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  database: 'postgres' // Connect to default postgres DB to manage other DBs
};

async function resetDb() {
  console.log(`🐘 កំពុងភ្ជាប់ទៅកាន់ PostgreSQL Server (${config.host}:${config.port})...`);
  const client = new Client(config);

  try {
    await client.connect();
    console.log('✓ ភ្ជាប់ជោគជ័យ!');

    // ១. បិទ Connection ចាស់ៗដែលកំពុងភ្ជាប់ទៅ ialsystems_backup
    console.log(`⏳ កំពុងផ្តាច់ Connection ចាស់ៗពី "${targetDbName}"...`);
    await client.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = $1 AND pid <> pg_backend_pid();
    `, [targetDbName]);

    // ២. លុប Database ចាស់
    console.log(`🗑️  កំពុងលុប Database "${targetDbName}" ចាស់...`);
    await client.query(`DROP DATABASE IF EXISTS "${targetDbName}"`);
    console.log(`✓ បានលុប "${targetDbName}" ចាស់ជោគជ័យ!`);

    // ៣. បង្កើត Database ថ្មីដោយបញ្ជាក់ UTF-8 ច្បាស់លាស់
    console.log(`✨ កំពុងបង្កើត Database "${targetDbName}" ថ្មីជាមួយ ENCODING 'UTF8'...`);
    try {
      await client.query(`CREATE DATABASE "${targetDbName}" WITH ENCODING 'UTF8' LC_COLLATE = 'C' LC_CTYPE = 'C'`);
    } catch (e) {
      await client.query(`CREATE DATABASE "${targetDbName}" WITH ENCODING 'UTF8'`);
    }
    console.log(`🎉 បានបង្កើត Database "${targetDbName}" (UTF-8) ជោគជ័យ ១០០%!`);

    // ៤. ផ្ទៀងផ្ទាត់ Encoding
    const res = await client.query(`
      SELECT datname, pg_encoding_to_char(encoding) as encoding 
      FROM pg_database 
      WHERE datname = $1
    `, [targetDbName]);

    if (res.rows.length > 0) {
      console.log(`\n🔍 ព័ត៌មាន Database: ${res.rows[0].datname} -> Encoding: ${res.rows[0].encoding}`);
    }

  } catch (err) {
    console.error('❌ កំហុស:', err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

resetDb();
