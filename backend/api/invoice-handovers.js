/**
 * Invoice Handover (ប្រគល់វិក័យប័ត្រ) → Hostinger MySQL (tbl_invoice_handovers).
 *
 * A staff member (Company Staff / ឈ្មោះអ្នកប្រគល់) hands an invoice over; the operator scans its
 * barcode and takes one photo. The photo goes to Google Drive through the Apps Script web app
 * (action upload_drive_image); the record, with the Drive file id, is saved in MySQL.
 *
 * Served as actions on /api/remote-mysql (invoice_handover_*), so it adds no Vercel function.
 */
import { executeQuery, fetchGoogleScript } from './remote-mysql.js';
import { cleanBarcode, lookupDataReportBarcodes } from './data-report-db.js';

/** Invoice Numbers (PostgreSQL on the office PC only): loaded lazily so other hosts never need it. */
async function findInvoiceNumber(code) {
  try {
    const mod = await import('./invoice-numbers.js');
    return await mod.findInvoiceNumber(code);
  } catch {
    return null;
  }
}

/** Same summary the page builds (buildLinkInfo), for scans saved with autoLink. */
function linkFrom(dataReport, warehouse, invoice) {
  const info = {};
  const sources = [];
  if (dataReport) {
    sources.push('DATA_REPORT');
    if (dataReport.shipper) info.shipper = dataReport.shipper;
    if (dataReport.consignee) info.consignee = dataReport.consignee;
    if (dataReport.destination) info.destination = dataReport.destination;
    if (dataReport.status) info.status = dataReport.status;
  }
  const step = warehouse?.[0];
  if (step) {
    sources.push('WAREHOUSE');
    Object.assign(info, { warehouseType: step.type, warehouseDate: step.date, warehousePerson: step.person });
    if (!info.destination && step.destination) info.destination = step.destination;
  }
  if (invoice) {
    sources.push('INVOICE');
    Object.assign(info, { prepCode: invoice.prepCode || null, invoiceStatus: invoice.status, invoiceCustomer: invoice.customer || null });
  }
  return sources.length ? { linkSource: sources.join(',').slice(0, 30), linkInfo: JSON.stringify(info).slice(0, 8000) } : null;
}

const T = 'tbl_invoice_handovers';

/** Google Drive folder for the photos (override with INVOICE_HANDOVER_DRIVE_FOLDER_ID). */
const DRIVE_FOLDER_ID = process.env.INVOICE_HANDOVER_DRIVE_FOLDER_ID || '1RsAso9t-Y4TQF4OF95wjhEpxzEWZaYw0';
const CURRENCIES = ['USD', 'KHR'];
const MAX_IMAGE_CHARS = 6 * 1024 * 1024; // base64 of the compressed photo (~4.5 MB of image)
const MAX_PAGE_SIZE = 500;

// Warehouse stages, newest step first when two have the same time
const WAREHOUSE_TABLES = [
  ['CUSTOMER_PICKUP', 'tbl_customer_pickup'],
  ['RETURN_SHIPMENTS', 'tbl_return_shipments'],
  ['ARRIVED_HUB', 'tbl_arrived_hub'],
  ['HOLD_REMAINING', 'tbl_hold_remaining'],
  ['OUT_OF_DELIVERY', 'tbl_out_of_delivery'],
  ['SCAN_OUT', 'tbl_scan_out'],
  ['SCAN_IN', 'tbl_scan_in'],
];

export const INVOICE_HANDOVER_ACTIONS = [
  'invoice_handover_list',
  'invoice_handover_lookup',
  'invoice_handover_save',
  'invoice_handover_delete',
  'invoice_handover_next_code',
  'invoice_handover_save_batch',
];

const OP_CODE_RE = /^OP-INV-\d{6}-[A-Z0-9]{0,10}-?\d{3,}$/;

/** Operator tag like the warehouse codes: email user name, letters/digits, max 10. */
function operatorTag(user) {
  const base = String(user?.email || user?.name || '').split('@')[0];
  return base.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
}

/**
 * Next batch code for this operator and handover date: OP-INV-261026-RATHYKIM34-001.
 * Two calls before anything is saved return the same code, which is fine (same batch).
 */
async function nextOperationCode(user, dateStr) {
  const date = validDate(dateStr) || todayPhnomPenh();
  const yymmdd = date.slice(2).replace(/-/g, '');
  const tag = operatorTag(user);
  const prefix = tag ? `OP-INV-${yymmdd}-${tag}-` : `OP-INV-${yymmdd}-`;
  const { rows } = await executeQuery(`SELECT \`operation_code\` FROM \`${T}\` WHERE \`operation_code\` LIKE ?`, [`${prefix}%`]);
  let max = 0;
  for (const r of rows) {
    const n = parseInt(String(r.operation_code).slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = executeQuery(`
      CREATE TABLE IF NOT EXISTS \`${T}\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`barcode\` VARCHAR(100) NOT NULL,
        \`staff_name\` VARCHAR(150) NOT NULL,
        \`handover_date\` DATE NOT NULL,
        \`amount\` DECIMAL(14,2) DEFAULT NULL,
        \`currency\` VARCHAR(3) NOT NULL DEFAULT 'USD',
        \`note\` TEXT,
        \`drive_file_id\` VARCHAR(100) DEFAULT NULL,
        \`drive_url\` VARCHAR(255) DEFAULT NULL,
        \`image_name\` VARCHAR(255) DEFAULT NULL,
        \`link_source\` VARCHAR(30) DEFAULT NULL,
        \`link_info\` TEXT,
        \`operation_code\` VARCHAR(60) DEFAULT NULL,
        \`operator_email\` VARCHAR(150) DEFAULT NULL,
        \`created_by\` VARCHAR(150) DEFAULT NULL,
        \`updated_by\` VARCHAR(150) DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_handover_barcode\` (\`barcode\`),
        INDEX \`idx_handover_date\` (\`handover_date\`),
        INDEX \`idx_handover_staff\` (\`staff_name\`),
        INDEX \`idx_handover_operator\` (\`operator_email\`),
        INDEX \`idx_handover_opcode\` (\`operation_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
      .then(async () => {
        // Tables made before batches existed: add the Operation Code column once
        const { rows } = await executeQuery(
          `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'operation_code'`,
          [T]
        );
        if (!rows.length) {
          await executeQuery(
            `ALTER TABLE \`${T}\` ADD COLUMN \`operation_code\` VARCHAR(60) DEFAULT NULL AFTER \`link_info\`, ADD INDEX \`idx_handover_opcode\` (\`operation_code\`)`
          );
        }
      })
      .catch((err) => {
      tableReady = null; // retry on next request
      throw err;
    });
  }
  return tableReady;
}

// ── helpers ────────────────────────────────────────────────────────────────

function str(value, max) {
  const s = String(value ?? '').trim().slice(0, max);
  return s || null;
}

const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';
const actorName = (user) => user?.name || user?.email || null;
const emailOf = (user) => String(user?.email || '').toLowerCase().trim();

function httpError(statusCode, message, extra) {
  return Object.assign(new Error(message), { statusCode, extra });
}

function validDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function todayPhnomPenh() {
  // UTC+7, no daylight saving
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function toDateStr(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

const toIso = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function mapRow(r) {
  return {
    id: Number(r.id),
    barcode: r.barcode,
    staffName: r.staff_name,
    handoverDate: toDateStr(r.handover_date),
    amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
    currency: r.currency || 'USD',
    note: r.note || '',
    driveFileId: r.drive_file_id || null,
    driveUrl: r.drive_url || null,
    linkSource: r.link_source || null,
    linkInfo: parseJson(r.link_info),
    operationCode: r.operation_code || null,
    operatorEmail: r.operator_email || null,
    createdBy: r.created_by || null,
    updatedBy: r.updated_by || null,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

/** Data scope "OWN": only the rows this user saved. */
function scopeWhere(user, where, params) {
  if (!isAdmin(user) && user?.viewOnlyOwn) {
    where.push('LOWER(`operator_email`) = ?');
    params.push(emailOf(user));
  }
}

// ── list ───────────────────────────────────────────────────────────────────

async function listHandovers(user, q) {
  const where = [];
  const params = [];
  scopeWhere(user, where, params);

  const search = str(q.search, 100);
  if (search) {
    const like = `%${search}%`;
    where.push('(`barcode` LIKE ? OR `staff_name` LIKE ? OR `note` LIKE ? OR `link_info` LIKE ? OR `created_by` LIKE ? OR `operation_code` LIKE ?)');
    params.push(like, like, like, like, like, like);
  }
  const staff = str(q.staff, 150);
  if (staff) {
    where.push('`staff_name` = ?');
    params.push(staff);
  }
  const start = validDate(q.startDate);
  const end = validDate(q.endDate);
  if (start) {
    where.push('`handover_date` >= ?');
    params.push(start);
  }
  if (end) {
    where.push('`handover_date` <= ?');
    params.push(end);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageSize = Math.min(Math.max(parseInt(q.pageSize, 10) || 100, 1), MAX_PAGE_SIZE);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);

  const [{ rows }, { rows: totals }] = await Promise.all([
    executeQuery(
      `SELECT * FROM \`${T}\` ${whereSql} ORDER BY \`handover_date\` DESC, \`id\` DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    ),
    executeQuery(
      `SELECT COUNT(*) AS n,
              SUM(CASE WHEN \`currency\` = 'USD' THEN \`amount\` ELSE 0 END) AS usd,
              SUM(CASE WHEN \`currency\` = 'KHR' THEN \`amount\` ELSE 0 END) AS khr,
              COUNT(DISTINCT \`staff_name\`) AS staff
       FROM \`${T}\` ${whereSql}`,
      params
    ),
  ]);

  const t = totals[0] || {};
  return {
    rows: rows.map(mapRow),
    total: Number(t.n || 0),
    totalUsd: Number(t.usd || 0),
    totalKhr: Number(t.khr || 0),
    staffCount: Number(t.staff || 0),
    page,
    pageSize,
  };
}

// ── lookup: what the system already knows about a barcode ──────────────────

/** First non-empty value among the columns whose name contains one of the keys. */
function pick(row, keys) {
  for (const [label, value] of Object.entries(row)) {
    const l = label.toLowerCase();
    if (keys.some((k) => l.includes(k)) && String(value ?? '').trim()) return String(value).trim();
  }
  return '';
}

async function lookupDataReport(code) {
  try {
    const r = await lookupDataReportBarcodes([code]);
    const arr = r?.rows?.[0];
    if (!arr) return null;
    const row = {};
    r.columns.forEach((label, i) => (row[label] = arr[i + 1] ?? ''));
    return {
      shipper: pick(row, ['shipper', 'អ្នកផ្ញើ']),
      consignee: pick(row, ['consignee', 'អ្នកទទួល']),
      destination: pick(row, ['destination', 'ទិសដៅ']),
      status: pick(row, ['status', 'ស្ថានភាព']),
      codUsd: pick(row, ['cod usd']),
      codKhr: pick(row, ['cod khr']),
    };
  } catch (err) {
    console.warn('[invoice-handover] data report lookup failed:', err?.message);
    return null;
  }
}

// Rider/driver and destination live in different columns per table
const WAREHOUSE_PERSON_COL = { OUT_OF_DELIVERY: 'rider_name' };
const WAREHOUSE_DEST_COL = { OUT_OF_DELIVERY: 'delivery_zone', CUSTOMER_PICKUP: null };
const WAREHOUSE_NO_PERSON = new Set(['HOLD_REMAINING', 'RETURN_SHIPMENTS']);

/** All 7 warehouse tables in one round trip (each was its own query before). */
async function lookupWarehouse(code) {
  const parts = WAREHOUSE_TABLES.map(([type, table]) => {
    const person = WAREHOUSE_NO_PERSON.has(type) ? 'NULL' : `\`${WAREHOUSE_PERSON_COL[type] || 'driver_name'}\``;
    const destCol = type in WAREHOUSE_DEST_COL ? WAREHOUSE_DEST_COL[type] : 'destination';
    const dest = destCol ? `\`${destCol}\`` : 'NULL';
    return `(SELECT '${type}' AS step_type, \`scan_date\`, \`created_at\`,
               CAST(${person} AS CHAR(255)) AS person, CAST(${dest} AS CHAR(255)) AS dest,
               CAST(\`operation_code\` AS CHAR(255)) AS operation_code, CAST(\`created_by\` AS CHAR(255)) AS created_by
             FROM \`${table}\` WHERE \`barcode\` = ? OR \`tracking\` = ? ORDER BY \`created_at\` DESC LIMIT 1)`;
  });
  try {
    const { rows } = await executeQuery(
      parts.join(' UNION ALL '),
      WAREHOUSE_TABLES.flatMap(() => [code, code])
    );
    const found = rows.map((r) => ({
      type: r.step_type,
      date: toDateStr(r.scan_date) || toDateStr(r.created_at),
      createdAt: toIso(r.created_at),
      person: r.person || null,
      destination: r.dest || null,
      operationCode: r.operation_code || null,
      createdBy: r.created_by || null,
    }));
    found.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return found;
  } catch (err) {
    console.warn('[invoice-handover] combined warehouse lookup failed, using per-table:', err?.message);
    return lookupWarehousePerTable(code);
  }
}

async function lookupWarehousePerTable(code) {
  const results = await Promise.all(
    WAREHOUSE_TABLES.map(async ([type, table]) => {
      try {
        const { rows } = await executeQuery(
          `SELECT * FROM \`${table}\` WHERE \`barcode\` = ? OR \`tracking\` = ? ORDER BY \`created_at\` DESC LIMIT 1`,
          [code, code]
        );
        const r = rows[0];
        if (!r) return null;
        return {
          type,
          date: toDateStr(r.scan_date) || toDateStr(r.created_at),
          createdAt: toIso(r.created_at),
          person: r.rider_name || r.driver_name || null,
          destination: r.destination || r.delivery_zone || null,
          operationCode: r.operation_code || null,
          createdBy: r.created_by || null,
        };
      } catch (err) {
        if (err?.code !== 'ER_NO_SUCH_TABLE') console.warn(`[invoice-handover] ${table} lookup failed:`, err?.message);
        return null;
      }
    })
  );
  const found = results.filter(Boolean);
  // Latest step first
  found.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return found;
}

async function lookupBarcode(user, rawBarcode) {
  const code = cleanBarcode(rawBarcode).slice(0, 100);
  if (!code) throw httpError(400, 'សូមបញ្ចូល Barcode');

  const [existingRows, dataReport, warehouse] = await Promise.all([
    executeQuery(`SELECT * FROM \`${T}\` WHERE \`barcode\` = ? LIMIT 1`, [code]).then((r) => r.rows),
    lookupDataReport(code),
    lookupWarehouse(code),
  ]);

  let existing = existingRows[0] ? mapRow(existingRows[0]) : null;
  // Someone limited to their own rows only learns that it exists, not who / what
  if (existing && !isAdmin(user) && user?.viewOnlyOwn && existing.operatorEmail?.toLowerCase() !== emailOf(user)) {
    existing = { id: existing.id, barcode: existing.barcode, handoverDate: existing.handoverDate, hidden: true };
  }
  return { barcode: code, existing, dataReport, warehouse };
}

// ── Google Drive upload (Apps Script) ──────────────────────────────────────

function checkWebAppUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  // Only Google Apps Script web apps: never let the client point the server at another host
  if (u.protocol !== 'https:' || u.hostname !== 'script.google.com' || !u.pathname.startsWith('/macros/')) return null;
  return u.toString();
}

async function uploadToDrive(webAppUrl, imageBase64, fileName) {
  // The URL from the app's Settings, else the one in .env
  const url =
    checkWebAppUrl(webAppUrl) ||
    checkWebAppUrl(process.env.GOOGLE_WEBAPP_URL) ||
    checkWebAppUrl(process.env.VITE_GOOGLE_WEBAPP_URL);
  if (!url) {
    throw httpError(400, 'មិនទាន់កំណត់ Google Web App URL (Settings) ឬ URL មិនត្រឹមត្រូវ — មិនអាចរក្សាទុករូបភាពទៅ Google Drive បានទេ។');
  }
  const res = await fetchGoogleScript(url, {
    method: 'POST',
    body: JSON.stringify({ action: 'upload_drive_image', folderId: DRIVE_FOLDER_ID, fileName, imageBase64 }),
    timeout: 60000,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML error page */
  }
  if (json?.status === 'success' && json.fileId) {
    return { fileId: String(json.fileId), fileUrl: String(json.fileUrl || `https://drive.google.com/file/d/${json.fileId}/view`) };
  }
  if (json?.message && /unknown action|invalid action|not supported/i.test(json.message)) {
    throw httpError(502, 'Google Apps Script មិនទាន់ស្គាល់ action «upload_drive_image» — សូម Deploy Code.gs ថ្មីម្តងទៀត។');
  }
  if (json?.message && /FOLDER_ACCESS_DENIED|access denied/i.test(json.message)) {
    const who = (json.message.match(/[\w.+-]+@[\w.-]+/) || [])[0];
    throw httpError(
      502,
      `Google Drive បដិសេធ (Access denied) — គណនី ${who || 'ដែល Deploy Apps Script'} មិនមានសិទ្ធិលើ Folder រូបភាព។ ` +
        `សូម Share Folder (${DRIVE_FOLDER_ID}) ទៅគណនីនោះជា Editor ឬ Deploy Code.gs ថ្មី ហើយ Authorize សិទ្ធិ Drive។`
    );
  }
  if (!json && (res.url || '').includes('accounts.google.com')) {
    throw httpError(502, 'Google Web App ទាមទារ Login — សូមកំណត់ "Who has access" = "Anyone" ហើយ Deploy ម្តងទៀត។');
  }
  throw httpError(502, `Upload រូបភាពទៅ Google Drive បរាជ័យ: ${json?.message || text.slice(0, 120) || `HTTP ${res.status}`}`);
}

// ── save / delete ──────────────────────────────────────────────────────────

function canWrite(user, existingRow) {
  if (isAdmin(user)) return true;
  if (String(user?.role || '').toUpperCase() === 'VIEWER') return false;
  if (!existingRow) return user?.canCreate !== false;
  const own = String(existingRow.operator_email || '').toLowerCase() === emailOf(user);
  return own && user?.canEdit !== false;
}

async function saveHandover(user, body) {
  const h = body.handover || {};
  const id = h.id ? parseInt(h.id, 10) : null;
  const barcode = cleanBarcode(h.barcode).slice(0, 100);
  const staffName = str(h.staffName, 150);
  const handoverDate = validDate(h.handoverDate) || todayPhnomPenh();
  const currency = CURRENCIES.includes(String(h.currency || '').toUpperCase()) ? String(h.currency).toUpperCase() : 'USD';
  const amountNum = h.amount === '' || h.amount === null || h.amount === undefined ? null : Number(h.amount);
  if (amountNum !== null && (!isFinite(amountNum) || amountNum < 0)) throw httpError(400, 'ចំនួនទឹកប្រាក់មិនត្រឹមត្រូវ');
  const amount = amountNum === null ? null : Math.round(amountNum * 100) / 100;
  const note = str(h.note, 2000);
  let linkSource = str(h.linkSource, 30);
  let linkInfo = h.linkInfo && typeof h.linkInfo === 'object' ? JSON.stringify(h.linkInfo).slice(0, 8000) : null;
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const opRaw = String(h.operationCode || '').trim().toUpperCase();
  let operationCode = OP_CODE_RE.test(opRaw) ? opRaw : null;

  if (!barcode) throw httpError(400, 'សូមបញ្ចូល Barcode');
  if (!staffName) throw httpError(400, 'សូមជ្រើសរើសឈ្មោះអ្នកប្រគល់');
  if (imageBase64 && !/^data:image\/(webp|jpeg|png);base64,/.test(imageBase64)) throw httpError(400, 'ទម្រង់រូបភាពមិនត្រឹមត្រូវ');
  if (imageBase64.length > MAX_IMAGE_CHARS) throw httpError(413, 'រូបភាពធំពេក');

  let existingRow = null;
  if (id) {
    existingRow = (await executeQuery(`SELECT * FROM \`${T}\` WHERE \`id\` = ? LIMIT 1`, [id])).rows[0];
    if (!existingRow) throw httpError(404, 'រកមិនឃើញកំណត់ត្រានេះទេ (ប្រហែលត្រូវបានលុប)');
  }
  if (!canWrite(user, existingRow)) throw httpError(403, 'អ្នកមិនមានសិទ្ធិរក្សាទុក / កែប្រែកំណត់ត្រានេះទេ');

  // One record (one photo) per barcode. New records rely on the unique key instead (one round
  // trip less per scan); edits check first because the barcode may be changed to a used one.
  if (existingRow) {
    const { rows: dup } = await executeQuery(
      `SELECT \`id\`, \`staff_name\`, \`handover_date\` FROM \`${T}\` WHERE \`barcode\` = ? AND \`id\` <> ? LIMIT 1`,
      [barcode, id]
    );
    if (dup[0]) {
      throw httpError(409, `Barcode ${barcode} បានប្រគល់រួចហើយ (${toDateStr(dup[0].handover_date)} · ${dup[0].staff_name})`);
    }
  }

  // Scan with auto-save: the server looks the barcode up itself, in parallel with the photo upload
  const linkP =
    !existingRow && body.autoLink
      ? Promise.all([lookupDataReport(barcode), lookupWarehouse(barcode), findInvoiceNumber(barcode)]).then(([dr, wh, inv]) => linkFrom(dr, wh, inv))
      : null;

  let drive = null;
  let imageName = null;
  if (imageBase64) {
    const ext = imageBase64.startsWith('data:image/webp') ? 'webp' : imageBase64.startsWith('data:image/png') ? 'png' : 'jpg';
    imageName = `${barcode.replace(/[^A-Z0-9_-]/gi, '_')}.${ext}`; // file name = Barcode
    drive = await uploadToDrive(body.webAppUrl, imageBase64, imageName);
  }
  if (linkP) {
    const link = await linkP.catch(() => null);
    if (link) {
      linkSource = link.linkSource;
      linkInfo = link.linkInfo;
    }
  }

  const actor = actorName(user);
  try {
    if (existingRow) {
      await executeQuery(
        `UPDATE \`${T}\` SET \`barcode\` = ?, \`staff_name\` = ?, \`handover_date\` = ?, \`amount\` = ?, \`currency\` = ?, \`note\` = ?,
           \`link_source\` = ?, \`link_info\` = ?, \`updated_by\` = ?
           ${drive ? ', `drive_file_id` = ?, `drive_url` = ?, `image_name` = ?' : ''}
         WHERE \`id\` = ?`,
        [
          barcode, staffName, handoverDate, amount, currency, note,
          linkSource ?? existingRow.link_source, linkInfo ?? existingRow.link_info, actor,
          ...(drive ? [drive.fileId, drive.fileUrl, imageName] : []),
          id,
        ]
      );
      const { rows } = await executeQuery(`SELECT * FROM \`${T}\` WHERE \`id\` = ?`, [id]);
      return mapRow(rows[0]);
    }
    if (!operationCode) operationCode = await nextOperationCode(user, handoverDate);
    const { rows: result } = await executeQuery(
      `INSERT INTO \`${T}\` (\`barcode\`, \`staff_name\`, \`handover_date\`, \`amount\`, \`currency\`, \`note\`, \`drive_file_id\`, \`drive_url\`,
         \`image_name\`, \`link_source\`, \`link_info\`, \`operation_code\`, \`operator_email\`, \`created_by\`, \`updated_by\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [barcode, staffName, handoverDate, amount, currency, note, drive?.fileId ?? null, drive?.fileUrl ?? null, imageName, linkSource, linkInfo, operationCode, emailOf(user) || null, actor, actor]
    );
    // Build the saved row from what was written (no read-back round trip)
    const now = new Date();
    return mapRow({
      id: result.insertId,
      barcode, staff_name: staffName, handover_date: handoverDate, amount, currency, note,
      drive_file_id: drive?.fileId ?? null, drive_url: drive?.fileUrl ?? null,
      link_source: linkSource, link_info: linkInfo, operation_code: operationCode,
      operator_email: emailOf(user) || null, created_by: actor, updated_by: actor, created_at: now, updated_at: now,
    });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      const { rows: dup } = await executeQuery(
        `SELECT \`staff_name\`, \`handover_date\` FROM \`${T}\` WHERE \`barcode\` = ? LIMIT 1`,
        [barcode]
      ).catch(() => ({ rows: [] }));
      throw httpError(
        409,
        dup[0]
          ? `Barcode ${barcode} បានប្រគល់រួចហើយ (${toDateStr(dup[0].handover_date)} · ${dup[0].staff_name})`
          : `Barcode ${barcode} បានប្រគល់រួចហើយ`
      );
    }
    throw err;
  }
}

const MAX_BATCH_ITEMS = 1000;

/**
 * "រក្សាទុកសរុប": every scanned invoice of one batch in a single request, under one new
 * Operation Code. Barcodes already handed over come back in `duplicates`; photos are uploaded
 * afterwards by the page (one save per photo), so this request stays small.
 */
async function saveBatch(user, body) {
  if (!canWrite(user, null)) throw httpError(403, 'អ្នកមិនមានសិទ្ធិរក្សាទុកទេ');
  const list = Array.isArray(body.items) ? body.items : [];
  if (!list.length) throw httpError(400, 'មិនមានវិក័យប័ត្រក្នុង Batch ទេ');
  if (list.length > MAX_BATCH_ITEMS) throw httpError(400, `មួយ Batch បានច្រើនបំផុត ${MAX_BATCH_ITEMS} វិក័យប័ត្រ`);

  const failed = [];
  const seen = new Set();
  const items = [];
  for (const h of list) {
    const barcode = cleanBarcode(h?.barcode).slice(0, 100);
    if (!barcode || seen.has(barcode)) continue;
    seen.add(barcode);
    const staffName = str(h.staffName, 150);
    if (!staffName) {
      failed.push({ barcode, message: 'គ្មានឈ្មោះអ្នកប្រគល់' });
      continue;
    }
    const amountNum = h.amount === '' || h.amount === null || h.amount === undefined ? null : Number(h.amount);
    if (amountNum !== null && (!isFinite(amountNum) || amountNum < 0)) {
      failed.push({ barcode, message: 'ចំនួនទឹកប្រាក់មិនត្រឹមត្រូវ' });
      continue;
    }
    items.push({
      barcode,
      staffName,
      handoverDate: validDate(h.handoverDate) || todayPhnomPenh(),
      amount: amountNum === null ? null : Math.round(amountNum * 100) / 100,
      currency: CURRENCIES.includes(String(h.currency || '').toUpperCase()) ? String(h.currency).toUpperCase() : 'USD',
      note: str(h.note, 2000),
      linkSource: str(h.linkSource, 30),
      linkInfo: h.linkInfo && typeof h.linkInfo === 'object' ? JSON.stringify(h.linkInfo).slice(0, 8000) : null,
    });
  }

  const duplicates = [];
  if (items.length) {
    const { rows } = await executeQuery(
      `SELECT \`barcode\`, \`staff_name\`, \`handover_date\` FROM \`${T}\` WHERE \`barcode\` IN (?)`,
      [items.map((i) => i.barcode)]
    );
    const used = new Map(rows.map((r) => [String(r.barcode).toUpperCase(), r]));
    for (let k = items.length - 1; k >= 0; k--) {
      const r = used.get(items[k].barcode);
      if (r) {
        duplicates.push({ barcode: items[k].barcode, message: `បានប្រគល់រួចហើយ (${toDateStr(r.handover_date)} · ${r.staff_name})` });
        items.splice(k, 1);
      }
    }
  }
  if (!items.length) return { operationCode: null, saved: [], duplicates, failed };

  const operationCode = await nextOperationCode(user, items[0].handoverDate);
  const actor = actorName(user);
  const email = emailOf(user) || null;
  const COLS = '(`barcode`, `staff_name`, `handover_date`, `amount`, `currency`, `note`, `link_source`, `link_info`, `operation_code`, `operator_email`, `created_by`, `updated_by`)';
  const valuesOf = (i) => [i.barcode, i.staffName, i.handoverDate, i.amount, i.currency, i.note, i.linkSource, i.linkInfo, operationCode, email, actor, actor];

  let inserted = items;
  try {
    await executeQuery(`INSERT INTO \`${T}\` ${COLS} VALUES ?`, [items.map(valuesOf)]);
  } catch (err) {
    if (err?.code !== 'ER_DUP_ENTRY') throw err;
    // Someone saved one of these a moment ago: insert one by one and report the clash
    inserted = [];
    for (const i of items) {
      try {
        await executeQuery(`INSERT INTO \`${T}\` ${COLS} VALUES ?`, [[valuesOf(i)]]);
        inserted.push(i);
      } catch (e) {
        if (e?.code === 'ER_DUP_ENTRY') duplicates.push({ barcode: i.barcode, message: 'បានប្រគល់រួចហើយ' });
        else failed.push({ barcode: i.barcode, message: e?.message || 'រក្សាទុកបរាជ័យ' });
      }
    }
  }

  let saved = [];
  if (inserted.length) {
    const { rows } = await executeQuery(`SELECT * FROM \`${T}\` WHERE \`barcode\` IN (?)`, [inserted.map((i) => i.barcode)]);
    saved = rows.map(mapRow);
  }
  return { operationCode: saved.length ? operationCode : null, saved, duplicates, failed };
}

async function deleteHandover(user, body) {
  const id = parseInt(body.id, 10);
  if (!id) throw httpError(400, 'Missing id');
  const { rows } = await executeQuery(`SELECT * FROM \`${T}\` WHERE \`id\` = ? LIMIT 1`, [id]);
  const row = rows[0];
  if (!row) return { deleted: 0 };
  const own = String(row.operator_email || '').toLowerCase() === emailOf(user);
  if (!isAdmin(user) && !(own && user?.canDelete)) throw httpError(403, 'អ្នកមិនមានសិទ្ធិលុបកំណត់ត្រានេះទេ');
  // The photo stays in Google Drive (kept as a record); only the row is removed
  await executeQuery(`DELETE FROM \`${T}\` WHERE \`id\` = ?`, [id]);
  return { deleted: 1 };
}

// ── entry ──────────────────────────────────────────────────────────────────

export async function handleInvoiceHandoverAction(req, action, url) {
  try {
    await ensureTable();
    const user = req.user;
    const q = Object.fromEntries(url.searchParams.entries());

    if (action === 'invoice_handover_list') {
      return [200, { ok: true, data: await listHandovers(user, { ...q, ...(req.body || {}) }) }];
    }
    if (action === 'invoice_handover_lookup') {
      return [200, { ok: true, data: await lookupBarcode(user, q.barcode || req.body?.barcode) }];
    }
    if (action === 'invoice_handover_next_code') {
      return [200, { ok: true, data: { code: await nextOperationCode(user, q.date || req.body?.date) } }];
    }

    if (req.method !== 'POST') return [405, { ok: false, message: 'Method Not Allowed' }];
    const body = req.body || {};
    if (action === 'invoice_handover_save') {
      return [200, { ok: true, data: await saveHandover(user, body) }];
    }
    if (action === 'invoice_handover_save_batch') {
      return [200, { ok: true, data: await saveBatch(user, body) }];
    }
    if (action === 'invoice_handover_delete') {
      return [200, { ok: true, data: await deleteHandover(user, body) }];
    }
    return [400, { ok: false, message: `Unknown action: ${action}` }];
  } catch (err) {
    const status = err?.statusCode || 500;
    if (status >= 500) console.error('[invoice-handover]', action, err?.message);
    return [status, { ok: false, message: err?.message || 'Server error', ...(err?.extra || {}) }];
  }
}
