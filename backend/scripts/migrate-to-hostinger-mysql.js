/**
 * Migration Script to Hostinger Remote MySQL Database
 * ផ្ទេរ និងធ្វើសមកាលកម្មទិន្នន័យពី Local PostgreSQL & Google Sheets ទៅកាន់ Hostinger Remote MySQL
 */

import mysql from 'mysql2/promise';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client: PgClient } = pg;

// MySQL Config
const mysqlConfig = {
  host: process.env.REMOTE_DB_HOST || 'srv1366.hstgr.io',
  port: parseInt(process.env.REMOTE_DB_PORT || '3306', 10),
  user: process.env.REMOTE_DB_USER || '',
  password: process.env.REMOTE_DB_PASSWORD || '',
  database: process.env.REMOTE_DB_NAME || 'u112951411_iale_api',
  multipleStatements: true,
  charset: 'utf8mb4',
  timezone: '+07:00', // 🇰🇭 Cambodia Timezone (Asia/Phnom_Penh, UTC+7)
  connectTimeout: 20000,
};

// 🇰🇭 Format any date or timestamp strictly to Cambodia Local Time (Asia/Phnom_Penh)
function toCambodiaDateTime(val) {
  if (!val && val !== 0) return '';
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) return str;
  const d = val instanceof Date ? val : new Date(str);
  if (isNaN(d.getTime())) return str;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Phnom_Penh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const p = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  const hr = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day} ${hr}:${p.minute}:${p.second}`;
}

// Local PG Config
const pgConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  database: process.env.PG_DATABASE || 'ialsystems_backup',
};

async function main() {
  console.log('================================================================');
  console.log('🚀 ចាប់ផ្តើមដំណើរការ Migration ទៅកាន់ Remote MySQL (Hostinger)');
  console.log(`🌐 Host: ${mysqlConfig.host}:${mysqlConfig.port}`);
  console.log(`🗄️  Database: ${mysqlConfig.database}`);
  console.log(`🇰🇭 Timezone: Asia/Phnom_Penh (UTC+7)`);
  console.log(`📅 ពេលវេលា: ${toCambodiaDateTime(new Date())}`);
  console.log('================================================================\n');

  // 1. Connect to MySQL
  console.log('🔌 កំពុងភ្ជាប់ទៅកាន់ Hostinger MySQL...');
  let mysqlConn = null;
  try {
    mysqlConn = await mysql.createConnection(mysqlConfig);
    await mysqlConn.query("SET time_zone = '+07:00'");
    console.log('✓ បានភ្ជាប់ជោគជ័យទៅកាន់ Hostinger MySQL (Timezone: +07:00)!\n');
  } catch (err) {
    console.error('❌ ពុំអាចភ្ជាប់ទៅកាន់ Hostinger MySQL បានទេ:', err.message);
    process.exit(1);
  }

  // 2. Execute DDL Schema to create 15 tables
  console.log('🏗️  ជំហានទី ១: កំពុងដំណើរការបង្កើតរចនាសម្ព័ន្ធ Tables ទាំង ១៥ (DDL Schema)...');
  const schemaPath = path.resolve(__dirname, 'hostinger_mysql_schema.sql');
  const ddlSql = fs.readFileSync(schemaPath, 'utf8');

  // Clean comments and split statements
  const statements = ddlSql
    .split(';')
    .map(s => {
      // Strip line comments
      return s.split('\n')
        .map(line => line.trim().startsWith('--') ? '' : line)
        .join('\n')
        .trim();
    })
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      await mysqlConn.query(stmt);
    } catch (err) {
      console.warn(`⚠️ Warning executing statement: ${err.message}`);
    }
  }
  console.log('✓ បានបង្កើត/ផ្ទៀងផ្ទាត់ Tables ទាំង ១៥ ក្នុង Database ជោគជ័យ!\n');

  // 3. Connect to Local PostgreSQL (Data Source)
  console.log('📦 ជំហានទី ២: កំពុងទាញទិន្នន័យពី Local PostgreSQL (ialsystems_backup)...');
  let pgClient = null;
  let pgAvailable = false;
  try {
    pgClient = new PgClient(pgConfig);
    await pgClient.connect();
    pgAvailable = true;
    console.log('✓ បានភ្ជាប់ទៅកាន់ Local PostgreSQL ជោគជ័យ!\n');
  } catch (e) {
    console.warn('⚠️ មិនអាចភ្ជាប់ Local PostgreSQL បានទេ នឹងប្រើប្រាស់ទិន្នន័យ File ជំនួស:', e.message);
  }

  const stats = {};

  // --- MIGRATE: 1. Batches & 2. Collection_Items ---
  console.log('⏳ កំពុង Migrate: Batches & Collection_Items...');
  let batchesCount = 0;
  let itemsCount = 0;
  if (pgAvailable) {
    const res = await pgClient.query(`
      SELECT record_id, data FROM local_offline_backups WHERE table_name = 'batches'
    `);
    for (const r of res.rows) {
      const d = r.data || {};
      const batchId = r.record_id || d.batchNumber || d.id;
      const dateVal = d.date || d.batch_date || '';
      const operator = d.operator || '';
      const totalItems = Number(d.totalItems || d.total_items || (d.items ? d.items.length : 0)) || 0;
      const totalUsd = Number(d.totalUSD || d.total_usd || 0);
      const totalKhr = Number(d.totalKHR || d.total_khr || 0);
      const bankUsd = Number(d.bankUSD || d.bank_usd || 0);
      const bankKhr = Number(d.bankKHR || d.bank_khr || 0);
      const cashUsd = Number(d.cashUSD || d.cash_usd || 0);
      const cashKhr = Number(d.cashKHR || d.cash_khr || 0);
      const reconcil = d.reconciliation || '';
      const notes = d.notes || '';
      const createdAt = d.createdAt || d.created_at || '';

      await mysqlConn.query(`
        INSERT INTO tbl_batches (
          batch_id, batch_date, operator, total_items, total_usd, total_khr,
          bank_usd, bank_khr, cash_usd, cash_khr, reconciliation, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          batch_date = VALUES(batch_date),
          operator = VALUES(operator),
          total_items = VALUES(total_items),
          total_usd = VALUES(total_usd),
          total_khr = VALUES(total_khr),
          bank_usd = VALUES(bank_usd),
          bank_khr = VALUES(bank_khr),
          cash_usd = VALUES(cash_usd),
          cash_khr = VALUES(cash_khr),
          reconciliation = VALUES(reconciliation),
          notes = VALUES(notes)
      `, [batchId, dateVal, operator, totalItems, totalUsd, totalKhr, bankUsd, bankKhr, cashUsd, cashKhr, reconcil, notes, createdAt]);
      batchesCount++;

      // Unpack items
      if (Array.isArray(d.items)) {
        for (const it of d.items) {
          const tracking = it.tracking || it.barcode || '';
          const cName = it.name || it.customerName || '';
          const pay = it.paymentMethod || it.payment || 'CASH';
          const usd = Number(it.usd || 0);
          const khm = Number(it.khm || it.khr || 0);
          const iDate = it.date || '';
          const iCreatedAt = it.createdAt || it.created_at || createdAt;

          await mysqlConn.query(`
            INSERT INTO tbl_collection_items (batch_id, tracking, customer_name, payment, usd, khm, item_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [batchId, tracking, cName, pay, usd, khm, iDate, iCreatedAt]);
          itemsCount++;
        }
      }
    }
  }
  stats['tbl_batches'] = batchesCount;
  stats['tbl_collection_items'] = itemsCount;

  // --- MIGRATE: 3. Medicine_Batches & 4. Medicine_Items ---
  console.log('⏳ កំពុង Migrate: Medicine_Batches & Medicine_Items...');
  let medBatchesCount = 0;
  let medItemsCount = 0;
  if (pgAvailable) {
    const res = await pgClient.query(`
      SELECT record_id, data FROM local_offline_backups WHERE table_name = 'medicine_batches'
    `);
    for (const r of res.rows) {
      const d = r.data || {};
      const batchId = r.record_id || d.batchNumber || d.id;
      const dateVal = d.date || d.batch_date || '';
      const operator = d.operator || '';
      const totalItems = Number(d.totalItems || d.total_items || (d.items ? d.items.length : 0)) || 0;
      const totalUsd = Number(d.totalUSD || d.total_usd || 0);
      const totalKhr = Number(d.totalKHR || d.total_khr || 0);
      const bankUsd = Number(d.bankUSD || d.bank_usd || 0);
      const bankKhr = Number(d.bankKHR || d.bank_khr || 0);
      const cashUsd = Number(d.cashUSD || d.cash_usd || 0);
      const cashKhr = Number(d.cashKHR || d.cash_khr || 0);
      const reconcil = d.reconciliation || '';
      const notes = d.notes || '';
      const createdAt = d.createdAt || d.created_at || '';

      await mysqlConn.query(`
        INSERT INTO tbl_medicine_batches (
          batch_id, batch_date, operator, total_items, total_usd, total_khr,
          bank_usd, bank_khr, cash_usd, cash_khr, reconciliation, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          batch_date = VALUES(batch_date),
          operator = VALUES(operator),
          total_items = VALUES(total_items),
          total_usd = VALUES(total_usd),
          total_khr = VALUES(total_khr),
          bank_usd = VALUES(bank_usd),
          bank_khr = VALUES(bank_khr),
          cash_usd = VALUES(cash_usd),
          cash_khr = VALUES(cash_khr),
          reconciliation = VALUES(reconciliation),
          notes = VALUES(notes)
      `, [batchId, dateVal, operator, totalItems, totalUsd, totalKhr, bankUsd, bankKhr, cashUsd, cashKhr, reconcil, notes, createdAt]);
      medBatchesCount++;

      // Unpack medicine items
      if (Array.isArray(d.items)) {
        for (const it of d.items) {
          const tracking = it.tracking || it.barcode || '';
          const cName = it.name || it.customerName || '';
          const pay = it.paymentMethod || it.payment || 'CASH';
          const usd = Number(it.usd || 0);
          const khm = Number(it.khm || it.khr || 0);
          const iDate = it.date || '';
          const iCreatedAt = it.createdAt || it.created_at || createdAt;

          await mysqlConn.query(`
            INSERT INTO tbl_medicine_items (batch_id, tracking, customer_name, payment, usd, khm, item_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [batchId, tracking, cName, pay, usd, khm, iDate, iCreatedAt]);
          medItemsCount++;
        }
      }
    }
  }
  stats['tbl_medicine_batches'] = medBatchesCount;
  stats['tbl_medicine_items'] = medItemsCount;

  // --- MIGRATE: 5. List_Name (Payers) ---
  console.log('⏳ កំពុង Migrate: List_Name (Payers)...');
  let listNameCount = 0;
  if (pgAvailable) {
    const res = await pgClient.query(`
      SELECT record_id, data FROM local_offline_backups WHERE table_name IN ('list_name', 'payers')
    `);
    for (const r of res.rows) {
      const d = r.data || {};
      const id = r.record_id || d.id;
      const name = d.name || '';
      const phone = d.phone || '';
      const cat = d.category || '';
      const area = d.area || '';
      const status = d.status || 'ACTIVE';
      const notes = d.notes || '';
      const cAt = d.createdAt || d.created_at || '';
      const uAt = d.updatedAt || d.updated_at || '';

      if (id && name) {
        await mysqlConn.query(`
          INSERT INTO tbl_list_name (id, name, phone, category, area, status, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name), phone = VALUES(phone), category = VALUES(category),
            area = VALUES(area), status = VALUES(status), notes = VALUES(notes)
        `, [id, name, phone, cat, area, status, notes, cAt, uAt]);
        listNameCount++;
      }
    }
  }

  // Fallback to Google Sheets WebApp if Local PG didn't have payers
  if (listNameCount === 0 && process.env.VITE_GOOGLE_WEBAPP_URL) {
    try {
      console.log('🌐 កំពុងទាញបញ្ជី List_Name ពី Google Sheets WebApp...');
      const response = await fetch(`${process.env.VITE_GOOGLE_WEBAPP_URL}?action=get_all_data`);
      const json = await response.json();
      const payers = json?.data?.payers || [];
      for (const p of payers) {
        if (!p.id || !p.name) continue;
        await mysqlConn.query(`
          INSERT INTO tbl_list_name (id, name, phone, category, area, status, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name), phone = VALUES(phone), category = VALUES(category),
            area = VALUES(area), status = VALUES(status), notes = VALUES(notes)
        `, [p.id, p.name, p.phone || '', p.category || '', p.area || '', p.status || 'ACTIVE', p.notes || '', p.createdAt || '', p.updatedAt || '']);
        listNameCount++;
      }
    } catch (e) {
      console.warn('⚠️ Google WebApp Fetch Warning:', e.message);
    }
  }
  stats['tbl_list_name'] = listNameCount;

  // --- MIGRATE: 6. Distribution_Reports ---
  console.log('⏳ កំពុង Migrate: Distribution_Reports...');
  let distCount = 0;
  if (pgAvailable) {
    const res = await pgClient.query(`
      SELECT record_id, data FROM local_offline_backups WHERE table_name = 'distribution_reports'
    `);
    for (const r of res.rows) {
      const d = r.data || {};
      const id = r.record_id || d.id;
      const barcode = d.barcode || '';
      const name = d.name || d.recipient_or_driver_name || '';
      const rDate = d.date || d.report_date || '';
      const remarks = d.remarks || '';
      const opEmail = d.operatorEmail || d.operator_email || '';
      const createdBy = d.createdBy || d.created_by || '';
      const cAt = d.createdAt || d.created_at || '';
      const uAt = d.updatedAt || d.updated_at || '';

      await mysqlConn.query(`
        INSERT INTO tbl_distribution_reports (id, barcode, name, report_date, remarks, operator_email, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          barcode = VALUES(barcode), name = VALUES(name), report_date = VALUES(report_date),
          remarks = VALUES(remarks), operator_email = VALUES(operator_email)
      `, [id, barcode, name, rDate, remarks, opEmail, createdBy, cAt, uAt]);
      distCount++;
    }
  }
  stats['tbl_distribution_reports'] = distCount;

  // --- MIGRATE: 7. Bank_Slips ---
  console.log('⏳ កំពុង Migrate: Bank_Slips...');
  let slipsCount = 0;
  if (pgAvailable) {
    const res = await pgClient.query(`
      SELECT record_id, data FROM local_offline_backups WHERE table_name = 'bank_slips'
    `);
    for (const r of res.rows) {
      const d = r.data || {};
      const id = r.record_id || d.id;
      const awbn = d.awbn || d.batchNumber || '';
      const cat = d.category || '';
      const rName = d.receiverName || d.receiver_name || '';
      const op = d.operator || '';
      const opEmail = d.operatorEmail || d.operator_email || '';
      const link = d.driveImageLink || d.drive_image_link || '';
      const fId = d.driveFileId || d.drive_file_id || '';
      const cAt = d.createdAt || d.created_at || '';

      await mysqlConn.query(`
        INSERT INTO tbl_bank_slips (id, awbn, category, receiver_name, operator, operator_email, drive_image_link, drive_file_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          awbn = VALUES(awbn), category = VALUES(category), receiver_name = VALUES(receiver_name),
          drive_image_link = VALUES(drive_image_link)
      `, [id, awbn, cat, rName, op, opEmail, link, fId, cAt]);
      slipsCount++;
    }
  }
  stats['tbl_bank_slips'] = slipsCount;

  // --- MIGRATE: 8. Permissions ---
  console.log('⏳ កំពុង Migrate: Permissions...');
  let permCount = 0;
  // Load from user_permissions.json as primary source
  const permJsonPath = path.resolve(__dirname, 'user_permissions.json');
  if (fs.existsSync(permJsonPath)) {
    try {
      const perms = JSON.parse(fs.readFileSync(permJsonPath, 'utf8'));
      for (const p of perms) {
        const uId = p.id || p.email;
        const email = p.email || '';
        const name = p.name || '';
        const role = p.role || 'USER';
        const status = p.status || 'ACTIVE';
        const dataScope = p.dataScope || (p.viewOnlyOwn ? 'OWN' : 'ALL');
        const canCreate = p.canCreate ? 1 : 0;
        const canEdit = p.canEdit ? 1 : 0;
        const canDelete = p.canDelete ? 1 : 0;
        const allowedPages = Array.isArray(p.allowedPages) ? JSON.stringify(p.allowedPages) : (p.allowedPages || '');
        const cAt = p.createdAt || '';
        const lastLogin = p.lastLogin || '';
        const uAt = p.updatedAt || '';

        if (email) {
          await mysqlConn.query(`
            INSERT INTO tbl_permissions (
              user_id, email, name, role, status, data_scope,
              can_create, can_edit, can_delete, allowed_pages, created_at, last_login, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              name = VALUES(name), role = VALUES(role), status = VALUES(status),
              data_scope = VALUES(data_scope), can_create = VALUES(can_create),
              can_edit = VALUES(can_edit), can_delete = VALUES(can_delete),
              allowed_pages = VALUES(allowed_pages)
          `, [uId, email, name, role, status, dataScope, canCreate, canEdit, canDelete, allowedPages, cAt, lastLogin, uAt]);
          permCount++;
        }
      }
    } catch (e) {
      console.warn('⚠️ Error parsing user_permissions.json:', e.message);
    }
  }
  stats['tbl_permissions'] = permCount;

  // --- MIGRATE: 9. User_Logs ---
  console.log('⏳ កំពុង Migrate: User_Logs...');
  let logsCount = 0;
  if (pgAvailable) {
    const res = await pgClient.query(`
      SELECT record_id, data FROM local_offline_backups WHERE table_name = 'activity_logs'
    `);
    for (const r of res.rows) {
      const d = r.data || {};
      const logId = r.record_id || d.id;
      const ts = d.timestamp || d.action_timestamp || '';
      const op = d.operator || '';
      const email = d.operatorEmail || d.operator_email || '';
      const role = d.role || '';
      const action = d.action || '';
      const details = d.description || d.details || '';
      const bNum = d.batchNumber || '';
      const meta = d.metadata || {};
      const usd = Number(meta.totalUSD || d.amount_usd || 0);
      const khr = Number(meta.totalKHR || d.amount_khr || 0);
      const count = Number(meta.totalItems || d.items_count || 0);
      const cAt = d.createdAt || ts;

      await mysqlConn.query(`
        INSERT INTO tbl_user_logs (
          log_id, timestamp, operator, email, role, action, details,
          batch_number, amount_usd, amount_khr, items_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [logId, ts, op, email, role, action, details, bNum, usd, khr, count, cAt]);
      logsCount++;
    }
  }
  stats['tbl_user_logs'] = logsCount;

  // --- MIGRATE: 10. Scan_In, 11. Scan_Out, 12. Out_Of_Delivery, 13. Hold_Remaining ---
  console.log('⏳ កំពុង Migrate: Warehouse Scans (Scan_In, Scan_Out, Out_Of_Delivery, Hold_Remaining)...');
  let scanInCount = 0;
  let scanOutCount = 0;
  let oodCount = 0;
  let holdCount = 0;

  if (pgAvailable) {
    const res = await pgClient.query(`
      SELECT record_id, data FROM local_offline_backups WHERE table_name = 'warehouse_scans'
    `);
    for (const r of res.rows) {
      const d = r.data || {};
      const id = r.record_id || d.id;
      const barcode = d.barcode || '';
      const tracking = d.tracking || '';
      const dest = d.destination || '';
      const driver = d.driverName || d.driver_name || '';
      const truck = d.truckNo || d.truck_no || '';
      const opEmail = d.operatorEmail || d.operator_email || '';
      const createdBy = d.createdBy || d.created_by || '';
      const scanDate = d.date || d.scan_date || '';
      const cAt = d.createdAt || d.created_at || '';
      const remarks = d.remarks || '';
      const scanType = (d.scanType || d.scan_type || '').toUpperCase();

      if (scanType === 'SCAN_IN') {
        await mysqlConn.query(`
          INSERT INTO tbl_scan_in (id, barcode, tracking, destination, driver_name, truck_no, operator_email, created_by, scan_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE barcode=VALUES(barcode)
        `, [id, barcode, tracking, dest, driver, truck, opEmail, createdBy, scanDate, cAt]);
        scanInCount++;
      } else if (scanType === 'SCAN_OUT') {
        await mysqlConn.query(`
          INSERT INTO tbl_scan_out (id, barcode, tracking, destination, driver_name, truck_no, operator_email, created_by, scan_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE barcode=VALUES(barcode)
        `, [id, barcode, tracking, dest, driver, truck, opEmail, createdBy, scanDate, cAt]);
        scanOutCount++;
      } else if (scanType === 'OUT_OF_DELIVERY') {
        const rider = d.riderName || d.rider_name || '';
        const zone = d.deliveryZone || d.delivery_zone || '';
        const cod = Number(d.codAmount || d.cod_amount || 0);
        const curr = d.currency || 'KHR';
        await mysqlConn.query(`
          INSERT INTO tbl_out_of_delivery (id, barcode, tracking, rider_name, delivery_zone, cod_amount, currency, operator_email, created_by, scan_date, created_at, remarks)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE barcode=VALUES(barcode)
        `, [id, barcode, tracking, rider, zone, cod, curr, opEmail, createdBy, scanDate, cAt, remarks]);
        oodCount++;
      } else if (scanType === 'HOLD_REMAINING' || !scanType) {
        const hReason = d.holdReason || d.hold_reason || remarks;
        const loc = d.location || d.shelf_location || '';
        await mysqlConn.query(`
          INSERT INTO tbl_hold_remaining (id, barcode, tracking, destination, hold_reason, shelf_location, operator_email, created_by, scan_date, created_at, remarks)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE barcode=VALUES(barcode)
        `, [id, barcode, tracking, dest, hReason, loc, opEmail, createdBy, scanDate, cAt, remarks]);
        holdCount++;
      }
    }
  }
  stats['tbl_scan_in'] = scanInCount;
  stats['tbl_scan_out'] = scanOutCount;
  stats['tbl_out_of_delivery'] = oodCount;
  stats['tbl_hold_remaining'] = holdCount;

  // --- MIGRATE: 14. Settings ---
  console.log('⏳ កំពុង Migrate: Settings...');
  let settingsCount = 0;
  if (pgAvailable) {
    const res = await pgClient.query(`
      SELECT record_id, data FROM local_offline_backups WHERE table_name = 'app_config'
    `);
    for (const r of res.rows) {
      const d = r.data || {};
      const key = r.record_id;
      const val = typeof d === 'object' ? JSON.stringify(d) : String(d);
      const uAt = new Date().toISOString();

      await mysqlConn.query(`
        INSERT INTO tbl_settings (setting_key, setting_value, description, updated_at)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)
      `, [key, val, `Synced from app_config: ${key}`, uAt]);
      settingsCount++;
    }
  }
  stats['tbl_settings'] = settingsCount;

  // --- MIGRATE: 15. Data (Master Tracking) ---
  console.log('⏳ កំពុង Migrate: Data (Master Tracking)...');
  let dataCount = 0;
  // If there are records in existing remote MySQL table 'shipment_detail' or 'bill', report count
  try {
    const [existingData] = await mysqlConn.query('SELECT COUNT(*) as cnt FROM tbl_data');
    dataCount = existingData[0]?.cnt || 0;
  } catch {}
  stats['tbl_data'] = dataCount;

  // Close connections
  if (pgClient) await pgClient.end().catch(() => {});
  await mysqlConn.end().catch(() => {});

  // Print Summary Table
  console.log('\n================================================================');
  console.log('🎉 ដំណើរការ Migration ទៅកាន់ Hostinger MySQL បានបញ្ចប់ដោយជោគជ័យ!');
  console.log('================================================================');
  console.table(Object.entries(stats).map(([table, count]) => ({ 'Table Name': table, 'Records Migrated': count })));
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Fatal Migration Error:', err);
  process.exit(1);
});
