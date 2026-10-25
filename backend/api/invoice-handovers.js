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
];

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
        \`operator_email\` VARCHAR(150) DEFAULT NULL,
        \`created_by\` VARCHAR(150) DEFAULT NULL,
        \`updated_by\` VARCHAR(150) DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_handover_barcode\` (\`barcode\`),
        INDEX \`idx_handover_date\` (\`handover_date\`),
        INDEX \`idx_handover_staff\` (\`staff_name\`),
        INDEX \`idx_handover_operator\` (\`operator_email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((err) => {
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
    where.push('(`barcode` LIKE ? OR `staff_name` LIKE ? OR `note` LIKE ? OR `link_info` LIKE ? OR `created_by` LIKE ?)');
    params.push(like, like, like, like, like);
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

async function lookupWarehouse(code) {
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
  const linkSource = str(h.linkSource, 30);
  const linkInfo = h.linkInfo && typeof h.linkInfo === 'object' ? JSON.stringify(h.linkInfo).slice(0, 8000) : null;
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';

  if (!barcode) throw httpError(400, 'សូមបញ្ចូល Barcode');
  if (!staffName) throw httpError(400, 'សូមជ្រើសរើសឈ្មោះអ្នកប្រគល់');
  if (imageBase64 && !/^data:image\/(webp|jpeg|png);base64,/.test(imageBase64)) throw httpError(400, 'ទម្រង់រូបភាពមិនត្រឹមត្រូវ');
  if (imageBase64.length > MAX_IMAGE_CHARS) throw httpError(413, 'រូបភាពធំពេក');

  let existingRow = null;
  if (id) {
    existingRow = (await executeQuery(`SELECT * FROM \`${T}\` WHERE \`id\` = ? LIMIT 1`, [id])).rows[0];
    if (!existingRow) throw httpError(404, 'រកមិនឃើញកំណត់ត្រានេះទេ (ប្រហែលត្រូវបានលុប)');
  } else if (!imageBase64) {
    throw httpError(400, 'សូមថតរូប ឬជ្រើសរូបភាពវិក័យប័ត្រ');
  }
  if (!canWrite(user, existingRow)) throw httpError(403, 'អ្នកមិនមានសិទ្ធិរក្សាទុក / កែប្រែកំណត់ត្រានេះទេ');

  // One record (one photo) per barcode
  const { rows: dup } = await executeQuery(
    `SELECT \`id\`, \`staff_name\`, \`handover_date\`, \`created_by\` FROM \`${T}\` WHERE \`barcode\` = ? AND \`id\` <> ? LIMIT 1`,
    [barcode, id || 0]
  );
  if (dup[0]) {
    throw httpError(409, `Barcode ${barcode} បានប្រគល់រួចហើយ (${toDateStr(dup[0].handover_date)} · ${dup[0].staff_name})`);
  }

  let drive = null;
  let imageName = null;
  if (imageBase64) {
    const ext = imageBase64.startsWith('data:image/webp') ? 'webp' : imageBase64.startsWith('data:image/png') ? 'png' : 'jpg';
    imageName = `INV_${barcode.replace(/[^A-Z0-9_-]/gi, '_')}_${handoverDate}_${Date.now()}.${ext}`;
    drive = await uploadToDrive(body.webAppUrl, imageBase64, imageName);
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
    const { rows: result } = await executeQuery(
      `INSERT INTO \`${T}\` (\`barcode\`, \`staff_name\`, \`handover_date\`, \`amount\`, \`currency\`, \`note\`, \`drive_file_id\`, \`drive_url\`,
         \`image_name\`, \`link_source\`, \`link_info\`, \`operator_email\`, \`created_by\`, \`updated_by\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [barcode, staffName, handoverDate, amount, currency, note, drive.fileId, drive.fileUrl, imageName, linkSource, linkInfo, emailOf(user) || null, actor, actor]
    );
    const { rows } = await executeQuery(`SELECT * FROM \`${T}\` WHERE \`id\` = ?`, [result.insertId]);
    return mapRow(rows[0]);
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') throw httpError(409, `Barcode ${barcode} បានប្រគល់រួចហើយ`);
    throw err;
  }
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

    if (req.method !== 'POST') return [405, { ok: false, message: 'Method Not Allowed' }];
    const body = req.body || {};
    if (action === 'invoice_handover_save') {
      return [200, { ok: true, data: await saveHandover(user, body) }];
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
