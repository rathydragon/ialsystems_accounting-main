/**
 * Creates / upgrades every table the app normally creates on first use, on Hostinger MySQL:
 * warehouse (Arrived Hub, Return Shipments + operation_code / batch_id / origin columns),
 * Customers, Telegram Booking, deleted-records log, system locks, permission columns.
 *
 * Safe to run more than once: only CREATE TABLE IF NOT EXISTS and ADD COLUMN when missing.
 * Nothing is dropped, renamed or rewritten.
 *
 *   npm run migrate:tables --prefix backend
 */
import { getMySQLPool } from '../api/remote-mysql.js';
import {
  ensureWarehouseScanColumns,
  ensureDeletedRecordsTable,
  ensurePermissionColumns,
  ensureSystemLocksTable,
} from '../api/mysql-master-handlers.js';
import { ensureCustomerTable } from '../api/customers.js';
import { ensureBookingTables } from '../api/telegram-booking.js';

const TABLES = [
  'tbl_arrived_hub',
  'tbl_return_shipments',
  'tbl_customers',
  'tbl_deleted_records',
  'tbl_system_locks',
  'tbl_tg_bookings',
  'tbl_tg_booking_replies',
  'tbl_tg_booking_team',
  'tbl_tg_booking_config',
  'tbl_tg_booking_status_log',
];

async function main() {
  const pool = getMySQLPool();

  const [before] = await pool.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)',
    [TABLES]
  );
  const existed = new Set(before.map((r) => r.TABLE_NAME));

  const steps = [
    ['Warehouse tables & columns', () => ensureWarehouseScanColumns(pool)],
    ['Deleted records log', () => ensureDeletedRecordsTable(pool)],
    ['Permission columns', () => ensurePermissionColumns(pool)],
    ['System locks', () => ensureSystemLocksTable(pool)],
    ['Customers', () => ensureCustomerTable()],
    ['Telegram Booking', () => ensureBookingTables()],
  ];
  for (const [name, run] of steps) {
    await run();
    console.log(`✓ ${name}`);
  }

  console.log('\nTables on Hostinger:');
  for (const t of TABLES) {
    const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    console.log(`  ${existed.has(t) ? 'existing' : 'CREATED '}  ${t} (${n} rows)`);
  }
  await pool.end();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✗ Migration failed:', err?.message || err);
    process.exit(1);
  });
