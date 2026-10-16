import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client } = pg;

async function inspectScans() {
  const client = new Client({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DATABASE || 'ialsystems_backup'
  });

  await client.connect();
  const cols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'local_offline_backups'");
  console.log('Columns of local_offline_backups:', cols.rows);

  const res = await client.query("SELECT * FROM local_offline_backups WHERE table_name = 'warehouse_scans'");
  console.log('Total warehouse_scans rows in PG:', res.rows.length);

  const breakdown = {};
  res.rows.forEach(r => {
    const d = r.data || {};
    const type = d.scan_type || d.scanType || 'UNKNOWN';
    breakdown[type] = (breakdown[type] || 0) + 1;
  });

  console.log('Scan types breakdown:', breakdown);
  console.log('\nSample records (first 3):');
  console.log(JSON.stringify(res.rows.slice(0, 3), null, 2));

  await client.end();
}

inspectScans().catch(console.error);
