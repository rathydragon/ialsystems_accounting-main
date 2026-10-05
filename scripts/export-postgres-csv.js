import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client } = pg;

async function exportToExcelCsv(tableName = 'firestore_backups', outputFile = 'export_with_khmer.csv') {
  const client = new Client({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    database: process.env.PG_DATABASE || 'ialsystems_backup',
    client_encoding: 'UTF8'
  });

  try {
    await client.connect();
    await client.query("SET client_encoding TO 'UTF8'");

    const res = await client.query(`SELECT * FROM ${tableName} ORDER BY 1 LIMIT 500`);
    if (res.rows.length === 0) {
      console.log('No data found.');
      return;
    }

    const fields = Object.keys(res.rows[0]);
    const headerLine = fields.map(f => `"${f.replace(/"/g, '""')}"`).join(',');
    const dataLines = res.rows.map(row => {
      return fields.map(f => {
        let val = row[f];
        if (typeof val === 'object' && val !== null) {
          val = JSON.stringify(val);
        }
        val = val !== null && val !== undefined ? String(val) : '';
        return `"${val.replace(/"/g, '""')}"`;
      }).join(',');
    });

    // \uFEFF is the UTF-8 BOM (Byte Order Mark) that tells Microsoft Excel to render UTF-8 Khmer
    const csvContent = '\uFEFF' + headerLine + '\r\n' + dataLines.join('\r\n');
    fs.writeFileSync(outputFile, csvContent, 'utf8');

    console.log(`✓ Exported ${res.rows.length} rows to ${outputFile} with UTF-8 BOM! (Excel opens Khmer perfectly)`);
  } finally {
    await client.end().catch(() => {});
  }
}

const table = process.argv[2] || 'firestore_backups';
const out = process.argv[3] || 'sample_khmer_excel.csv';
exportToExcelCsv(table, out);
