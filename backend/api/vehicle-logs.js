/**
 * Vehicle History Log (កំណត់ត្រាលម្អិត) for the Meterial_Office page → Hostinger MySQL.
 *
 * Each vehicle (row of tbl_meterial_office) keeps a history of problems, repairs, maintenance,
 * speeding and documents, with photos / PDF files attached.
 *   tbl_vehicle_logs        one row per event
 *   tbl_vehicle_log_files   attached files; the files themselves are in Google Drive
 *
 * Files are sent one per request (vehicle_log_add_file) so each request stays small.
 * Served as actions on /api/remote-mysql (vehicle_log_*).
 *
 * Permissions follow the Meterial_Office page: everyone signed in may view; create / edit /
 * delete need the matching canCreate / canEdit / canDelete flag (VIEWER never writes).
 */
import { executeQuery } from './remote-mysql.js';
import { uploadToDrive } from './invoice-handovers.js';

const T = 'tbl_vehicle_logs';
const TF = 'tbl_vehicle_log_files';
const TV = 'tbl_meterial_office';

/** Google Drive folder for the files (set VEHICLE_LOG_DRIVE_FOLDER_ID to use a separate one). */
const DRIVE_FOLDER_ID =
  process.env.VEHICLE_LOG_DRIVE_FOLDER_ID ||
  process.env.SHIPMENT_PROBLEM_DRIVE_FOLDER_ID ||
  process.env.INVOICE_HANDOVER_DRIVE_FOLDER_ID ||
  '1RsAso9t-Y4TQF4OF95wjhEpxzEWZaYw0';

export const LOG_TYPES = ['PROBLEM', 'REPAIR', 'MAINTENANCE', 'SPEEDING', 'DOCUMENT', 'OTHER'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE'];
// Base64 text length. Kept under a 4.5MB request size (≈ 3MB file).
const MAX_FILE_CHARS = 4.2 * 1024 * 1024;
const MAX_FILES = 15;
const FILE_RE = /^data:(image\/(?:webp|jpeg|png)|application\/pdf);base64,/;

let tableReady = null;
function ensureTables() {
  if (!tableReady) {
    tableReady = (async () => {
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS \`${T}\` (
          \`id\` BIGINT NOT NULL AUTO_INCREMENT,
          \`vehicle_id\` BIGINT NOT NULL,
          \`model_no\` VARCHAR(50) DEFAULT NULL,
          \`log_type\` VARCHAR(20) NOT NULL DEFAULT 'OTHER',
          \`log_date\` DATE NOT NULL,
          \`title\` VARCHAR(200) DEFAULT NULL,
          \`description\` TEXT,
          \`status\` VARCHAR(12) NOT NULL DEFAULT 'OPEN',
          \`cost\` DECIMAL(12,2) DEFAULT NULL,
          \`shop\` VARCHAR(150) DEFAULT NULL,
          \`odometer\` INT DEFAULT NULL,
          \`driver\` VARCHAR(150) DEFAULT NULL,
          \`speed_kmh\` INT DEFAULT NULL,
          \`speed_limit_kmh\` INT DEFAULT NULL,
          \`location\` VARCHAR(200) DEFAULT NULL,
          \`created_by\` VARCHAR(150) DEFAULT NULL,
          \`updated_by\` VARCHAR(150) DEFAULT NULL,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_vl_vehicle\` (\`vehicle_id\`),
          INDEX \`idx_vl_date\` (\`log_date\`),
          INDEX \`idx_vl_status\` (\`status\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS \`${TF}\` (
          \`id\` BIGINT NOT NULL AUTO_INCREMENT,
          \`log_id\` BIGINT NOT NULL,
          \`drive_file_id\` VARCHAR(100) NOT NULL,
          \`drive_url\` VARCHAR(255) DEFAULT NULL,
          \`file_name\` VARCHAR(255) DEFAULT NULL,
          \`mime_type\` VARCHAR(60) DEFAULT NULL,
          \`created_by\` VARCHAR(150) DEFAULT NULL,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_vlf_log\` (\`log_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((err) => {
      tableReady = null; // retry on next request
      throw err;
    });
  }
  return tableReady;
}

// ── helpers ────────────────────────────────────────────────────────────────

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';
const isViewer = (user) => String(user?.role || '').toUpperCase() === 'VIEWER';
const actorName = (user) => String(user?.name || user?.email || '').slice(0, 150) || null;
const can = (user, flag) => isAdmin(user) || (!isViewer(user) && user?.[flag] !== false);

function str(value, max) {
  const s = String(value ?? '').trim().slice(0, max);
  return s || null;
}

/** Empty → null; otherwise a number in [min, max] or a 400 error. */
function num(value, label, { min = 0, max = 1e9, int = false } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) {
    throw httpError(400, `${label} មិនត្រឹមត្រូវ`);
  }
  return n;
}

const validDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
// UTC+7, no daylight saving
const todayPhnomPenh = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

function toDateStr(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);
}
const toIso = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const numOrNull = (v) => (v === null || v === undefined ? null : Number(v));

function mapFile(f) {
  return {
    id: Number(f.id),
    driveFileId: f.drive_file_id,
    driveUrl: f.drive_url || `https://drive.google.com/file/d/${f.drive_file_id}/view`,
    fileName: f.file_name || '',
    mimeType: f.mime_type || '',
    createdBy: f.created_by || null,
    createdAt: toIso(f.created_at),
  };
}

function mapRow(r, files = []) {
  return {
    id: Number(r.id),
    vehicleId: Number(r.vehicle_id),
    modelNo: r.model_no || '',
    logType: r.log_type,
    logDate: toDateStr(r.log_date),
    title: r.title || '',
    description: r.description || '',
    status: r.status || 'OPEN',
    cost: numOrNull(r.cost),
    shop: r.shop || '',
    odometer: numOrNull(r.odometer),
    driver: r.driver || '',
    speedKmh: numOrNull(r.speed_kmh),
    speedLimitKmh: numOrNull(r.speed_limit_kmh),
    location: r.location || '',
    createdBy: r.created_by || null,
    updatedBy: r.updated_by || null,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
    files,
  };
}

/** Rows plus their files (one extra query). */
async function withFiles(rows) {
  if (!rows.length) return [];
  const { rows: files } = await executeQuery(`SELECT * FROM \`${TF}\` WHERE \`log_id\` IN (?) ORDER BY \`id\` ASC`, [
    rows.map((r) => r.id),
  ]);
  const byLog = new Map();
  for (const f of files) {
    const k = Number(f.log_id);
    if (!byLog.has(k)) byLog.set(k, []);
    byLog.get(k).push(mapFile(f));
  }
  return rows.map((r) => mapRow(r, byLog.get(Number(r.id)) || []));
}

async function getLog(id) {
  const { rows } = await executeQuery(`SELECT * FROM \`${T}\` WHERE \`id\` = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function getVehicle(id) {
  const { rows } = await executeQuery(`SELECT \`id\`, \`model_no\` FROM \`${TV}\` WHERE \`id\` = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

// ── list / summary ─────────────────────────────────────────────────────────

async function listLogs(q) {
  const vehicleId = parseInt(q.vehicleId, 10);
  if (!vehicleId) throw httpError(400, 'Missing vehicleId');
  const { rows } = await executeQuery(
    `SELECT * FROM \`${T}\` WHERE \`vehicle_id\` = ? ORDER BY \`log_date\` DESC, \`id\` DESC LIMIT 1000`,
    [vehicleId]
  );
  return withFiles(rows);
}

/** Per vehicle: how many logs, how many not finished yet, and the latest date (for the row badge). */
async function summary() {
  const { rows } = await executeQuery(
    `SELECT \`vehicle_id\`, COUNT(*) AS total, SUM(\`status\` <> 'DONE') AS open, MAX(\`log_date\`) AS last_date
       FROM \`${T}\` GROUP BY \`vehicle_id\``
  );
  return rows.map((r) => ({
    vehicleId: Number(r.vehicle_id),
    total: Number(r.total || 0),
    open: Number(r.open || 0),
    lastDate: toDateStr(r.last_date),
  }));
}

// ── save / files / delete ──────────────────────────────────────────────────

async function saveLog(user, body) {
  const p = body.log || {};
  const id = p.id ? parseInt(p.id, 10) : null;
  const existing = id ? await getLog(id) : null;
  if (id && !existing) throw httpError(404, 'រកមិនឃើញកំណត់ត្រានេះទេ (ប្រហែលត្រូវបានលុប)');
  if (!can(user, existing ? 'canEdit' : 'canCreate')) {
    throw httpError(403, `អ្នកមិនមានសិទ្ធិ${existing ? 'កែប្រែ' : 'បន្ថែម'}កំណត់ត្រានេះទេ`);
  }

  const vehicleId = existing ? Number(existing.vehicle_id) : parseInt(p.vehicleId, 10);
  const vehicle = vehicleId ? await getVehicle(vehicleId) : null;
  if (!existing && !vehicle) throw httpError(400, 'រកមិនឃើញរថយន្តនេះទេ');

  const logType = String(p.logType || '').toUpperCase();
  if (!LOG_TYPES.includes(logType)) throw httpError(400, 'សូមជ្រើសរើសប្រភេទកំណត់ត្រា');
  const status = STATUSES.includes(String(p.status || '').toUpperCase()) ? String(p.status).toUpperCase() : 'OPEN';
  const description = str(p.description, 5000);
  const title = str(p.title, 200);
  if (!title && !description) throw httpError(400, 'សូមបញ្ចូលចំណងជើង ឬការពិពណ៌នា');

  const values = {
    log_type: logType,
    log_date: validDate(p.logDate) || todayPhnomPenh(),
    title,
    description,
    status,
    cost: num(p.cost, 'ថ្លៃចំណាយ', { max: 1e9 }),
    shop: str(p.shop, 150),
    odometer: num(p.odometer, 'Km (Odometer)', { max: 1e8, int: true }),
    driver: str(p.driver, 150),
    speed_kmh: num(p.speedKmh, 'ល្បឿន', { max: 400, int: true }),
    speed_limit_kmh: num(p.speedLimitKmh, 'ល្បឿនកំណត់', { max: 400, int: true }),
    location: str(p.location, 200),
  };
  const keys = Object.keys(values);
  const actor = actorName(user);

  if (existing) {
    await executeQuery(`UPDATE \`${T}\` SET ${keys.map((k) => `\`${k}\` = ?`).join(', ')}, \`updated_by\` = ? WHERE \`id\` = ?`, [
      ...keys.map((k) => values[k]),
      actor,
      id,
    ]);
    return (await withFiles([await getLog(id)]))[0];
  }

  const { rows: result } = await executeQuery(
    `INSERT INTO \`${T}\` (\`vehicle_id\`, \`model_no\`, ${keys.map((k) => `\`${k}\``).join(', ')}, \`created_by\`, \`updated_by\`)
     VALUES (?, ?, ${keys.map(() => '?').join(', ')}, ?, ?)`,
    [vehicleId, str(vehicle.model_no, 50), ...keys.map((k) => values[k]), actor, actor]
  );
  return (await withFiles([await getLog(result.insertId)]))[0];
}

async function addFile(user, body) {
  const id = parseInt(body.id, 10);
  const dataUrl = typeof body.fileBase64 === 'string' ? body.fileBase64 : '';
  if (!id) throw httpError(400, 'Missing id');
  const m = dataUrl.match(FILE_RE);
  if (!m) throw httpError(400, 'អាចភ្ជាប់បានតែរូបភាព (JPG / PNG / WEBP) ឬ PDF ប៉ុណ្ណោះ');
  if (dataUrl.length > MAX_FILE_CHARS) throw httpError(413, 'ឯកសារធំពេក (អតិបរមា 3MB)');

  const row = await getLog(id);
  if (!row) throw httpError(404, 'រកមិនឃើញកំណត់ត្រានេះទេ (ប្រហែលត្រូវបានលុប)');
  if (!can(user, 'canCreate') && !can(user, 'canEdit')) throw httpError(403, 'អ្នកមិនមានសិទ្ធិភ្ជាប់ឯកសារទេ');

  const { rows: cnt } = await executeQuery(`SELECT COUNT(*) AS n FROM \`${TF}\` WHERE \`log_id\` = ?`, [id]);
  if (Number(cnt[0]?.n || 0) >= MAX_FILES) throw httpError(400, `មួយកំណត់ត្រាភ្ជាប់បានច្រើនបំផុត ${MAX_FILES} ឯកសារ`);

  const mime = m[1];
  const ext = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' }[mime];
  const plate = String(row.model_no || row.vehicle_id).replace(/[^A-Z0-9_-]/gi, '_');
  const original = String(body.fileName || '')
    .replace(/\.[^.]*$/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .slice(0, 60);
  const fileName = `VEHICLE_${plate}_${id}_${Date.now()}${original ? `_${original}` : ''}.${ext}`;

  let drive;
  try {
    drive = await uploadToDrive(body.webAppUrl, dataUrl, fileName, DRIVE_FOLDER_ID);
  } catch (err) {
    // An Apps Script deployed before PDF support only takes images
    if (mime === 'application/pdf' && /Only webp/i.test(err?.message || '')) {
      throw httpError(502, 'Google Apps Script មិនទាន់ទទួល PDF — សូម Deploy Code.gs (docs/gas) ថ្មីម្តងទៀត។');
    }
    throw err;
  }
  await executeQuery(
    `INSERT INTO \`${TF}\` (\`log_id\`, \`drive_file_id\`, \`drive_url\`, \`file_name\`, \`mime_type\`, \`created_by\`) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, drive.fileId, drive.fileUrl, fileName, mime, actorName(user)]
  );
  return (await withFiles([row]))[0];
}

async function removeFile(user, body) {
  const fileId = parseInt(body.fileId, 10);
  if (!fileId) throw httpError(400, 'Missing fileId');
  if (!can(user, 'canEdit')) throw httpError(403, 'អ្នកមិនមានសិទ្ធិលុបឯកសារនេះទេ');
  const { rows } = await executeQuery(`SELECT * FROM \`${TF}\` WHERE \`id\` = ? LIMIT 1`, [fileId]);
  const file = rows[0];
  if (!file) return null;
  // The file stays in Google Drive (kept as a record); only the link is removed
  await executeQuery(`DELETE FROM \`${TF}\` WHERE \`id\` = ?`, [fileId]);
  const row = await getLog(file.log_id);
  return row ? (await withFiles([row]))[0] : null;
}

async function deleteLog(user, body) {
  const id = parseInt(body.id, 10);
  if (!id) throw httpError(400, 'Missing id');
  if (!can(user, 'canDelete')) throw httpError(403, 'អ្នកមិនមានសិទ្ធិលុបកំណត់ត្រានេះទេ');
  // Files stay in Google Drive; only the rows are removed
  await executeQuery(`DELETE FROM \`${TF}\` WHERE \`log_id\` = ?`, [id]);
  const { rows } = await executeQuery(`DELETE FROM \`${T}\` WHERE \`id\` = ?`, [id]);
  return { deleted: Number(rows.affectedRows || 0) };
}

// ── entry ──────────────────────────────────────────────────────────────────

export async function handleVehicleLogAction(req, action, url) {
  try {
    await ensureTables();
    const user = req.user;
    const q = Object.fromEntries(url.searchParams.entries());

    if (action === 'vehicle_log_list') return [200, { ok: true, data: await listLogs({ ...q, ...(req.body || {}) }) }];
    if (action === 'vehicle_log_summary') return [200, { ok: true, data: await summary() }];

    if (req.method !== 'POST') return [405, { ok: false, message: 'Method Not Allowed' }];
    const body = req.body || {};
    if (action === 'vehicle_log_save') return [200, { ok: true, data: await saveLog(user, body) }];
    if (action === 'vehicle_log_add_file') return [200, { ok: true, data: await addFile(user, body) }];
    if (action === 'vehicle_log_remove_file') return [200, { ok: true, data: await removeFile(user, body) }];
    if (action === 'vehicle_log_delete') return [200, { ok: true, data: await deleteLog(user, body) }];
    return [400, { ok: false, message: `Unknown action: ${action}` }];
  } catch (err) {
    const status = err?.statusCode || 500;
    if (status >= 500) console.error('[vehicle-logs]', action, err?.message);
    return [status, { ok: false, message: err?.message || 'Server error' }];
  }
}
