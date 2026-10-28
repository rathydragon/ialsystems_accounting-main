/**
 * Shipment Problems (បញ្ហាទំនិញ) → Hostinger MySQL.
 *
 * When a shipment reaches a location with a problem (damaged, missing pieces, wet...), staff scan
 * its barcode, pick the problem type and take photos as proof.
 *   tbl_shipment_problems        one row per reported problem (a barcode can have several)
 *   tbl_shipment_problem_photos  the photos; files are in Google Drive (same upload as Invoice Handover)
 *
 * Photos are sent one per request (shipment_problem_add_photo) so each request stays small.
 * Served as actions on /api/remote-mysql (shipment_problem_*), so it adds no Vercel function.
 */
import { executeQuery } from './remote-mysql.js';
import { cleanBarcode } from './data-report-db.js';
import { lookupDataReport, lookupWarehouse, uploadToDrive } from './invoice-handovers.js';

const T = 'tbl_shipment_problems';
const TP = 'tbl_shipment_problem_photos';

/** Google Drive folder for the photos (set SHIPMENT_PROBLEM_DRIVE_FOLDER_ID to use a separate one). */
const DRIVE_FOLDER_ID =
  process.env.SHIPMENT_PROBLEM_DRIVE_FOLDER_ID || process.env.INVOICE_HANDOVER_DRIVE_FOLDER_ID || '1RsAso9t-Y4TQF4OF95wjhEpxzEWZaYw0';

export const PROBLEM_TYPES = ['DAMAGED', 'MISSING', 'SHORT', 'WET', 'PACKAGING', 'WRONG_ITEM', 'WRONG_ADDRESS', 'REFUSED', 'NO_CONTACT', 'ARRIVED_NO_CONTACT', 'COD_UNPAID', 'OTHER'];
const STATUSES = ['OPEN', 'RESOLVED'];
const MAX_IMAGE_CHARS = 6 * 1024 * 1024;
const MAX_PHOTOS = 10;
const MAX_PAGE_SIZE = 500;

let tableReady = null;
function ensureTables() {
  if (!tableReady) {
    tableReady = (async () => {
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS \`${T}\` (
          \`id\` BIGINT NOT NULL AUTO_INCREMENT,
          \`barcode\` VARCHAR(100) NOT NULL,
          \`problem_type\` VARCHAR(30) NOT NULL DEFAULT 'OTHER',
          \`location\` VARCHAR(150) DEFAULT NULL,
          \`pieces\` INT DEFAULT NULL,
          \`note\` TEXT,
          \`report_date\` DATE NOT NULL,
          \`status\` VARCHAR(12) NOT NULL DEFAULT 'OPEN',
          \`resolve_note\` TEXT,
          \`resolved_by\` VARCHAR(150) DEFAULT NULL,
          \`resolved_at\` DATETIME DEFAULT NULL,
          \`link_info\` TEXT,
          \`operator_email\` VARCHAR(150) DEFAULT NULL,
          \`created_by\` VARCHAR(150) DEFAULT NULL,
          \`updated_by\` VARCHAR(150) DEFAULT NULL,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_sp_barcode\` (\`barcode\`),
          INDEX \`idx_sp_date\` (\`report_date\`),
          INDEX \`idx_sp_status\` (\`status\`),
          INDEX \`idx_sp_operator\` (\`operator_email\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS \`${TP}\` (
          \`id\` BIGINT NOT NULL AUTO_INCREMENT,
          \`problem_id\` BIGINT NOT NULL,
          \`drive_file_id\` VARCHAR(100) NOT NULL,
          \`drive_url\` VARCHAR(255) DEFAULT NULL,
          \`image_name\` VARCHAR(255) DEFAULT NULL,
          \`created_by\` VARCHAR(150) DEFAULT NULL,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_spp_problem\` (\`problem_id\`)
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

function str(value, max) {
  const s = String(value ?? '').trim().slice(0, max);
  return s || null;
}

const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';
const isViewer = (user) => String(user?.role || '').toUpperCase() === 'VIEWER';
const actorName = (user) => String(user?.name || user?.email || '').slice(0, 150) || null;
const emailOf = (user) => String(user?.email || '').toLowerCase().trim();
const isOwn = (user, row) => !!row && String(row.operator_email || '').toLowerCase() === emailOf(user);

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
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

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function mapPhoto(p) {
  return {
    id: Number(p.id),
    driveFileId: p.drive_file_id,
    driveUrl: p.drive_url || `https://drive.google.com/file/d/${p.drive_file_id}/view`,
    createdBy: p.created_by || null,
    createdAt: toIso(p.created_at),
  };
}

function mapRow(r, photos = []) {
  return {
    id: Number(r.id),
    barcode: r.barcode,
    problemType: r.problem_type,
    location: r.location || '',
    pieces: r.pieces === null || r.pieces === undefined ? null : Number(r.pieces),
    note: r.note || '',
    reportDate: toDateStr(r.report_date),
    status: r.status || 'OPEN',
    resolveNote: r.resolve_note || '',
    resolvedBy: r.resolved_by || null,
    resolvedAt: toIso(r.resolved_at),
    linkInfo: parseJson(r.link_info),
    operatorEmail: r.operator_email || null,
    createdBy: r.created_by || null,
    updatedBy: r.updated_by || null,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
    photos,
  };
}

/** Rows plus their photos (one extra query for the whole page). */
async function withPhotos(rows) {
  if (!rows.length) return [];
  const { rows: photos } = await executeQuery(
    `SELECT * FROM \`${TP}\` WHERE \`problem_id\` IN (?) ORDER BY \`id\` ASC`,
    [rows.map((r) => r.id)]
  );
  const byProblem = new Map();
  for (const p of photos) {
    const k = Number(p.problem_id);
    if (!byProblem.has(k)) byProblem.set(k, []);
    byProblem.get(k).push(mapPhoto(p));
  }
  return rows.map((r) => mapRow(r, byProblem.get(Number(r.id)) || []));
}

async function getProblem(id) {
  const { rows } = await executeQuery(`SELECT * FROM \`${T}\` WHERE \`id\` = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

/** Reporter emails this user may see. null = everyone; Own Only → self; All Data with a team → the team. */
function scopeEmails(user) {
  if (isAdmin(user)) return null;
  if (user?.viewOnlyOwn) return [emailOf(user)];
  const team = (user?.teamMembers || []).filter((v) => String(v).includes('@')).map((v) => String(v).toLowerCase());
  return team.length > 0 ? Array.from(new Set([emailOf(user), ...team])) : null;
}

function scopeWhere(user, where, params) {
  const emails = scopeEmails(user);
  if (emails) {
    where.push('LOWER(`operator_email`) IN (?)');
    params.push(emails);
  }
}

function canSee(user, row) {
  const emails = scopeEmails(user);
  return !emails || emails.includes(String(row?.operator_email || '').toLowerCase());
}

/** New report / add photos: anyone who may create. Edit an existing one: admin or the reporter. */
function canWrite(user, row) {
  if (isAdmin(user)) return true;
  if (isViewer(user)) return false;
  if (!row) return user?.canCreate !== false;
  return isOwn(user, row) && user?.canEdit !== false;
}

/** Resolving is often done by another team, so any editor who can see the row may do it. */
function canResolve(user, row) {
  if (isAdmin(user)) return true;
  if (isViewer(user) || user?.canEdit === false) return false;
  return canSee(user, row);
}

/** What the system knew about the barcode when the problem was reported. */
function buildLink(dataReport, warehouse) {
  const info = {};
  if (dataReport) {
    if (dataReport.shipper) info.shipper = dataReport.shipper;
    if (dataReport.consignee) info.consignee = dataReport.consignee;
    if (dataReport.destination) info.destination = dataReport.destination;
    if (dataReport.status) info.status = dataReport.status;
  }
  const step = warehouse?.[0];
  if (step) {
    Object.assign(info, { warehouseType: step.type, warehouseDate: step.date, warehousePerson: step.person });
    if (!info.destination && step.destination) info.destination = step.destination;
  }
  return Object.keys(info).length ? JSON.stringify(info).slice(0, 8000) : null;
}

// ── list ───────────────────────────────────────────────────────────────────

async function listProblems(user, q) {
  const where = [];
  const params = [];
  scopeWhere(user, where, params);

  const search = str(q.search, 100);
  if (search) {
    const like = `%${search}%`;
    where.push('(`barcode` LIKE ? OR `location` LIKE ? OR `note` LIKE ? OR `link_info` LIKE ? OR `created_by` LIKE ?)');
    params.push(like, like, like, like, like);
  }
  const type = String(q.type || '').toUpperCase();
  if (PROBLEM_TYPES.includes(type)) {
    where.push('`problem_type` = ?');
    params.push(type);
  }
  const start = validDate(q.startDate);
  const end = validDate(q.endDate);
  if (start) {
    where.push('`report_date` >= ?');
    params.push(start);
  }
  if (end) {
    where.push('`report_date` <= ?');
    params.push(end);
  }

  // Counts per status ignore the status filter, so the tabs always show both numbers
  const baseWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const status = String(q.status || '').toUpperCase();
  const listWhere = [...where];
  const listParams = [...params];
  if (STATUSES.includes(status)) {
    listWhere.push('`status` = ?');
    listParams.push(status);
  }
  const listWhereSql = listWhere.length ? `WHERE ${listWhere.join(' AND ')}` : '';

  const pageSize = Math.min(Math.max(parseInt(q.pageSize, 10) || 200, 1), MAX_PAGE_SIZE);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);

  const [{ rows }, { rows: counts }] = await Promise.all([
    executeQuery(
      `SELECT * FROM \`${T}\` ${listWhereSql} ORDER BY \`report_date\` DESC, \`id\` DESC LIMIT ? OFFSET ?`,
      [...listParams, pageSize, (page - 1) * pageSize]
    ),
    executeQuery(`SELECT \`status\`, COUNT(*) AS n FROM \`${T}\` ${baseWhere} GROUP BY \`status\``, params),
  ]);

  const open = Number(counts.find((c) => c.status === 'OPEN')?.n || 0);
  const resolved = Number(counts.find((c) => c.status === 'RESOLVED')?.n || 0);
  const total = STATUSES.includes(status) ? (status === 'OPEN' ? open : resolved) : open + resolved;
  return { rows: await withPhotos(rows), total, open, resolved, page, pageSize };
}

// ── lookup ─────────────────────────────────────────────────────────────────

async function lookupBarcode(user, rawBarcode) {
  const code = cleanBarcode(rawBarcode).slice(0, 100);
  if (!code) throw httpError(400, 'សូមបញ្ចូល Barcode');
  const [{ rows }, dataReport, warehouse] = await Promise.all([
    executeQuery(`SELECT * FROM \`${T}\` WHERE \`barcode\` = ? ORDER BY \`id\` DESC LIMIT 20`, [code]),
    lookupDataReport(code),
    lookupWarehouse(code),
  ]);
  const visible = rows.filter((r) => canSee(user, r));
  return { barcode: code, existing: await withPhotos(visible), dataReport, warehouse };
}

// ── save / photos / status / delete ────────────────────────────────────────

async function saveProblem(user, body) {
  const p = body.problem || {};
  const id = p.id ? parseInt(p.id, 10) : null;
  const barcode = cleanBarcode(p.barcode).slice(0, 100);
  const problemType = String(p.problemType || '').toUpperCase();
  const location = str(p.location, 150);
  const note = str(p.note, 2000);
  const reportDate = validDate(p.reportDate) || todayPhnomPenh();
  const piecesNum = p.pieces === '' || p.pieces === null || p.pieces === undefined ? null : Number(p.pieces);

  if (!barcode) throw httpError(400, 'សូមបញ្ចូល Barcode');
  if (!PROBLEM_TYPES.includes(problemType)) throw httpError(400, 'សូមជ្រើសរើសប្រភេទបញ្ហា');
  if (piecesNum !== null && (!Number.isInteger(piecesNum) || piecesNum < 0 || piecesNum > 100000)) {
    throw httpError(400, 'ចំនួនកញ្ចប់មិនត្រឹមត្រូវ');
  }

  const existing = id ? await getProblem(id) : null;
  if (id && !existing) throw httpError(404, 'រកមិនឃើញកំណត់ត្រានេះទេ (ប្រហែលត្រូវបានលុប)');
  if (!canWrite(user, existing)) throw httpError(403, 'អ្នកមិនមានសិទ្ធិរក្សាទុក / កែប្រែកំណត់ត្រានេះទេ');

  const actor = actorName(user);
  if (existing) {
    await executeQuery(
      `UPDATE \`${T}\` SET \`barcode\` = ?, \`problem_type\` = ?, \`location\` = ?, \`pieces\` = ?, \`note\` = ?, \`report_date\` = ?, \`updated_by\` = ?
       WHERE \`id\` = ?`,
      [barcode, problemType, location, piecesNum, note, reportDate, actor, id]
    );
    return (await withPhotos([await getProblem(id)]))[0];
  }

  const [dataReport, warehouse] = await Promise.all([lookupDataReport(barcode), lookupWarehouse(barcode).catch(() => [])]);
  const linkInfo = buildLink(dataReport, warehouse);
  const { rows: result } = await executeQuery(
    `INSERT INTO \`${T}\` (\`barcode\`, \`problem_type\`, \`location\`, \`pieces\`, \`note\`, \`report_date\`, \`status\`, \`link_info\`,
       \`operator_email\`, \`created_by\`, \`updated_by\`)
     VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`,
    [barcode, problemType, location, piecesNum, note, reportDate, linkInfo, emailOf(user) || null, actor, actor]
  );
  return (await withPhotos([await getProblem(result.insertId)]))[0];
}

async function addPhoto(user, body) {
  const id = parseInt(body.id, 10);
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  if (!id) throw httpError(400, 'Missing id');
  if (!/^data:image\/(webp|jpeg|png);base64,/.test(imageBase64)) throw httpError(400, 'ទម្រង់រូបភាពមិនត្រឹមត្រូវ');
  if (imageBase64.length > MAX_IMAGE_CHARS) throw httpError(413, 'រូបភាពធំពេក');

  const row = await getProblem(id);
  if (!row) throw httpError(404, 'រកមិនឃើញកំណត់ត្រានេះទេ (ប្រហែលត្រូវបានលុប)');
  // The reporter, or anyone allowed to resolve it, may add proof photos
  if (!canWrite(user, row) && !canResolve(user, row)) throw httpError(403, 'អ្នកមិនមានសិទ្ធិបន្ថែមរូបភាពទេ');

  const { rows: cnt } = await executeQuery(`SELECT COUNT(*) AS n FROM \`${TP}\` WHERE \`problem_id\` = ?`, [id]);
  const n = Number(cnt[0]?.n || 0);
  if (n >= MAX_PHOTOS) throw httpError(400, `មួយបញ្ហាបានរូបភាពច្រើនបំផុត ${MAX_PHOTOS} សន្លឹក`);

  const ext = imageBase64.startsWith('data:image/webp') ? 'webp' : imageBase64.startsWith('data:image/png') ? 'png' : 'jpg';
  const imageName = `PROBLEM_${String(row.barcode).replace(/[^A-Z0-9_-]/gi, '_')}_${id}_${Date.now()}.${ext}`;
  const drive = await uploadToDrive(body.webAppUrl, imageBase64, imageName, DRIVE_FOLDER_ID);
  await executeQuery(
    `INSERT INTO \`${TP}\` (\`problem_id\`, \`drive_file_id\`, \`drive_url\`, \`image_name\`, \`created_by\`) VALUES (?, ?, ?, ?, ?)`,
    [id, drive.fileId, drive.fileUrl, imageName, actorName(user)]
  );
  return (await withPhotos([row]))[0];
}

async function removePhoto(user, body) {
  const photoId = parseInt(body.photoId, 10);
  if (!photoId) throw httpError(400, 'Missing photoId');
  const { rows } = await executeQuery(`SELECT * FROM \`${TP}\` WHERE \`id\` = ? LIMIT 1`, [photoId]);
  const photo = rows[0];
  if (!photo) return null;
  const row = await getProblem(photo.problem_id);
  if (row && !canWrite(user, row)) throw httpError(403, 'អ្នកមិនមានសិទ្ធិលុបរូបភាពនេះទេ');
  // The file stays in Google Drive (kept as a record); only the link is removed
  await executeQuery(`DELETE FROM \`${TP}\` WHERE \`id\` = ?`, [photoId]);
  return row ? (await withPhotos([row]))[0] : null;
}

async function setStatus(user, body) {
  const id = parseInt(body.id, 10);
  const status = String(body.status || '').toUpperCase();
  if (!id) throw httpError(400, 'Missing id');
  if (!STATUSES.includes(status)) throw httpError(400, 'ស្ថានភាពមិនត្រឹមត្រូវ');
  const row = await getProblem(id);
  if (!row) throw httpError(404, 'រកមិនឃើញកំណត់ត្រានេះទេ (ប្រហែលត្រូវបានលុប)');
  if (!canResolve(user, row)) throw httpError(403, 'អ្នកមិនមានសិទ្ធិប្តូរស្ថានភាពទេ');
  const actor = actorName(user);
  if (status === 'RESOLVED') {
    await executeQuery(
      `UPDATE \`${T}\` SET \`status\` = 'RESOLVED', \`resolve_note\` = ?, \`resolved_by\` = ?, \`resolved_at\` = NOW(), \`updated_by\` = ? WHERE \`id\` = ?`,
      [str(body.resolveNote, 2000), actor, actor, id]
    );
  } else {
    await executeQuery(
      `UPDATE \`${T}\` SET \`status\` = 'OPEN', \`resolve_note\` = NULL, \`resolved_by\` = NULL, \`resolved_at\` = NULL, \`updated_by\` = ? WHERE \`id\` = ?`,
      [actor, id]
    );
  }
  return (await withPhotos([await getProblem(id)]))[0];
}

async function deleteProblem(user, body) {
  const id = parseInt(body.id, 10);
  if (!id) throw httpError(400, 'Missing id');
  const row = await getProblem(id);
  if (!row) return { deleted: 0 };
  if (!isAdmin(user) && !(isOwn(user, row) && user?.canDelete)) throw httpError(403, 'អ្នកមិនមានសិទ្ធិលុបកំណត់ត្រានេះទេ');
  // Photos stay in Google Drive; only the rows are removed
  await executeQuery(`DELETE FROM \`${TP}\` WHERE \`problem_id\` = ?`, [id]);
  await executeQuery(`DELETE FROM \`${T}\` WHERE \`id\` = ?`, [id]);
  return { deleted: 1 };
}

// ── entry ──────────────────────────────────────────────────────────────────

export async function handleShipmentProblemAction(req, action, url) {
  try {
    await ensureTables();
    const user = req.user;
    const q = Object.fromEntries(url.searchParams.entries());

    if (action === 'shipment_problem_list') {
      return [200, { ok: true, data: await listProblems(user, { ...q, ...(req.body || {}) }) }];
    }
    if (action === 'shipment_problem_lookup') {
      return [200, { ok: true, data: await lookupBarcode(user, q.barcode || req.body?.barcode) }];
    }

    if (req.method !== 'POST') return [405, { ok: false, message: 'Method Not Allowed' }];
    const body = req.body || {};
    if (action === 'shipment_problem_save') return [200, { ok: true, data: await saveProblem(user, body) }];
    if (action === 'shipment_problem_add_photo') return [200, { ok: true, data: await addPhoto(user, body) }];
    if (action === 'shipment_problem_remove_photo') return [200, { ok: true, data: await removePhoto(user, body) }];
    if (action === 'shipment_problem_status') return [200, { ok: true, data: await setStatus(user, body) }];
    if (action === 'shipment_problem_delete') return [200, { ok: true, data: await deleteProblem(user, body) }];
    return [400, { ok: false, message: `Unknown action: ${action}` }];
  } catch (err) {
    const status = err?.statusCode || 500;
    if (status >= 500) console.error('[shipment-problems]', action, err?.message);
    return [status, { ok: false, message: err?.message || 'Server error' }];
  }
}
