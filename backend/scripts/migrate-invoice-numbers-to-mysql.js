/**
 * One-time copy of tbl_invoice_numbers from the office PC's PostgreSQL to Hostinger MySQL.
 *
 *   node backend/scripts/migrate-invoice-numbers-to-mysql.js
 *
 * Safe to run again: rows whose tracking is already in MySQL are left as they are (INSERT IGNORE).
 * Keeps each row's id, dates, status and who/when fields.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeQuery, getMySQLPool } from '../api/remote-mysql.js';
import invoiceNumbersHandler from '../api/invoice-numbers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const BATCH = 2000;
const env = (name, fallback) => process.env[`INVOICE_${name}`] || process.env[name] || fallback;

/** Creates the MySQL tables by calling the handler once (same CREATE TABLE as the live API). */
async function ensureMysqlTable() {
  let status = 0;
  let payload = null;
  const res = {
    setHeader() {},
    status(s) { status = s; return this; },
    json(j) { payload = j; return this; },
  };
  await invoiceNumbersHandler({ method: 'GET', query: { action: 'version' }, body: {} }, res);
  if (status !== 200) throw new Error(`MySQL table setup failed: ${payload?.message || status}`);
}

async function main() {
  const pgPool = new pg.Pool({
    host: env('PG_HOST', 'localhost'),
    port: parseInt(env('PG_PORT', '5432'), 10),
    user: env('PG_USER', 'postgres'),
    password: env('PG_PASSWORD', ''),
    database: env('PG_DATABASE', 'ialsystems_backup'),
  });

  await ensureMysqlTable();
  const total = Number((await pgPool.query('SELECT COUNT(*) AS n FROM tbl_invoice_numbers')).rows[0].n);
  console.log(`PostgreSQL rows: ${total.toLocaleString()}`);

  let lastId = 0;
  let copied = 0;
  let inserted = 0;
  for (;;) {
    const { rows } = await pgPool.query(
      `SELECT id, tracking, customer, company, province, name_prepare, prep_code,
         to_char("date", 'YYYY-MM-DD') AS d, status, to_char(issued_date, 'YYYY-MM-DD') AS issued_date,
         issued_at, issued_by, created_by, created_at, updated_by, updated_at
       FROM tbl_invoice_numbers WHERE id > $1 ORDER BY id LIMIT ${BATCH}`,
      [lastId]
    );
    if (!rows.length) break;
    const values = rows.map((r) => [
      r.id, String(r.tracking).toUpperCase(), r.customer, r.company, r.province, r.name_prepare, r.prep_code || null,
      r.d, r.status, r.issued_date, r.issued_at, r.issued_by, r.created_by, r.created_at, r.updated_by, r.updated_at,
    ]);
    const { rows: result } = await executeQuery(
      `INSERT IGNORE INTO tbl_invoice_numbers
         (id, tracking, customer, company, province, name_prepare, prep_code, \`date\`, status, issued_date,
          issued_at, issued_by, created_by, created_at, updated_by, updated_at)
       VALUES ?`,
      [values]
    );
    inserted += result.affectedRows;
    copied += rows.length;
    lastId = rows[rows.length - 1].id;
    process.stdout.write(`\r  ${copied.toLocaleString()} / ${total.toLocaleString()} read, ${inserted.toLocaleString()} new in MySQL`);
  }
  console.log();

  // Make open pages reload the list
  await executeQuery('UPDATE tbl_invoice_numbers_meta SET version = version + 1 WHERE id = 1');
  const mysqlTotal = Number((await executeQuery('SELECT COUNT(*) AS n FROM tbl_invoice_numbers')).rows[0].n);
  console.log(`MySQL rows now: ${mysqlTotal.toLocaleString()} (PostgreSQL: ${total.toLocaleString()})`);

  await pgPool.end();
  await getMySQLPool().end();
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
