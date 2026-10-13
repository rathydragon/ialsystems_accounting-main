/**
 * Apply PostgreSQL Views for IAL Accounting Backups
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const targetDb = process.env.PG_DATABASE || 'ialsystems_backup';
const pgConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'Admin@#1992',
  database: targetDb,
  client_encoding: 'UTF8',
  connectionTimeoutMillis: 4000
};

async function run() {
  const client = new Client(pgConfig);
  try {
    console.log(`Connecting to PostgreSQL database: ${targetDb}...`);
    await client.connect();
    console.log('✓ Connected successfully.');
    const sqlPath = path.resolve(__dirname, 'create_backup_views.sql');
    const sqlQuery = fs.readFileSync(sqlPath, 'utf8');
    console.log('Executing SQL Views creation...');
    await client.query(sqlQuery);
    console.log('🎉 All SQL Views applied successfully in PostgreSQL!');
  } catch (err) {
    console.error('❌ Error executing SQL Views:', err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

run();
