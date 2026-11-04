/**
 * Issue Invoice (ចេញវិក័យប័ត្រ) → Hostinger MySQL (tbl_issue_invoices).
 *
 * One row per tracking number: unit price, customer name and a note.
 * Rows are typed in on the page or uploaded from an Excel template (sent in chunks).
 * Served as actions on /api/remote-mysql (issue_invoice_*), so it adds no Vercel function.
 */
import { executeQuery } from './remote-mysql.js';

const T = 'tbl_issue_invoices';
const MAX_PAGE_SIZE = 1000;
const MAX_IMPORT_ROWS = 1000; // per request; the page sends bigger files in chunks

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = executeQuery(`
      CREATE TABLE IF NOT EXISTS \`${T}\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`tracking\` VARCHAR(100) NOT NULL,
        \`unit_price\` DECIMAL(14,2) DEFAULT NULL,
        \`customer_name\` VARCHAR(255) DEFAULT NULL,
        \`note\` TEXT,
        \`operator_email\` VARCHAR(150) DEFAULT NULL,
        \`created_by\` VARCHAR(150) DEFAULT NULL,
        \`updated_by\` VARCHAR(150) DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_ii_tracking\` (\`tracking\`),
        INDEX \`idx_ii_customer\` (\`customer_name\`),
        INDEX \`idx_ii_created\` (\`created_at\`)
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

const cleanTracking = (v) => String(v ?? '').toUpperCase().replace(/\s+/g, '').slice(0, 100);

/** "1,250.50", "$12", 12 → number; blank → null; anything else → NaN. */
function toPrice(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s៛]/g, ''));
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? Math.round(n * 100) / 100 : NaN;
}

const role = (user) => String(user?.role || '').toUpperCase();
const isAdmin = (user) => role(user) === 'ADMIN';
const isViewer = (user) => role(user) === 'VIEWER';
const actorName = (user) => String(user?.name || user?.email || '').slice(0, 150) || null;
const emailOf = (user) => String(user?.email || '').toLowerCase().trim();

const canCreate = (user) => isAdmin(user) || (!isViewer(user) && user?.canCreate !== false);
const canEdit = (user) => isAdmin(user) || (!isViewer(user) && user?.canEdit !== false);
const canDelete = (user) => isAdmin(user) || (!isViewer(user) && user?.canDelete === true);

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

const toIso = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

function mapRow(r) {
  return {
    id: Number(r.id),
    tracking: r.tracking,
    unitPrice: r.unit_price === null || r.unit_price === undefined ? null : Number(r.unit_price),
    customerName: r.customer_name || '',
    note: r.note || '',
    createdBy: r.created_by || null,
    updatedBy: r.updated_by || null,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

async function getRow(id) {
  const { rows } = await executeQuery(`SELECT * FROM \`${T}\` WHERE \`id\` = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

// ── list ───────────────────────────────────────────────────────────────────

async function listRows(q) {
  const where = [];
  const params = [];
  const search = str(q.search, 100);
  if (search) {
    const like = `%${search}%`;
    where.push('(`tracking` LIKE ? OR `customer_name` LIKE ? OR `note` LIKE ?)');
    params.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageSize = Math.min(Math.max(parseInt(q.pageSize, 10) || 500, 1), MAX_PAGE_SIZE);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);

  const [{ rows }, { rows: totals }] = await Promise.all([
    executeQuery(`SELECT * FROM \`${T}\` ${whereSql} ORDER BY \`id\` DESC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]),
    executeQuery(`SELECT COUNT(*) AS n, COALESCE(SUM(\`unit_price\`), 0) AS amount FROM \`${T}\` ${whereSql}`, params),
  ]);
  return {
    rows: rows.map(mapRow),
    total: Number(totals[0]?.n || 0),
    totalAmount: Number(totals[0]?.amount || 0),
    page,
    pageSize,
  };
}

// ── save / import / delete ─────────────────────────────────────────────────

async function saveRow(user, body) {
  const p = body.invoice || {};
  const id = parseInt(p.id, 10) || null;
  if (id ? !canEdit(user) : !canCreate(user)) throw httpError(403, 'អ្នកមិនមានសិទ្ធិរក្សាទុកទេ');

  const tracking = cleanTracking(p.tracking);
  if (!tracking) throw httpError(400, 'សូមបញ្ចូល Tracking');
  const unitPrice = toPrice(p.unitPrice);
  if (Number.isNaN(unitPrice)) throw httpError(400, 'Unit Price មិនត្រឹមត្រូវ');
  const customer = str(p.customerName, 255);
  const note = str(p.note, 2000);
  const actor = actorName(user);

  const { rows: dup } = await executeQuery(`SELECT \`id\` FROM \`${T}\` WHERE \`tracking\` = ? LIMIT 1`, [tracking]);
  if (dup[0] && Number(dup[0].id) !== id) throw httpError(409, `Tracking ${tracking} មានរួចហើយ`);

  if (id) {
    if (!(await getRow(id))) throw httpError(404, 'រកមិនឃើញកំណត់ត្រា');
    await executeQuery(
      `UPDATE \`${T}\` SET \`tracking\` = ?, \`unit_price\` = ?, \`customer_name\` = ?, \`note\` = ?, \`updated_by\` = ? WHERE \`id\` = ?`,
      [tracking, unitPrice, customer, note, actor, id]
    );
    return mapRow(await getRow(id));
  }
  const { rows: result } = await executeQuery(
    `INSERT INTO \`${T}\` (\`tracking\`, \`unit_price\`, \`customer_name\`, \`note\`, \`operator_email\`, \`created_by\`, \`updated_by\`)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tracking, unitPrice, customer, note, emailOf(user) || null, actor, actor]
  );
  return mapRow(await getRow(result.insertId));
}

/**
 * Bulk upload. mode "skip" keeps rows whose tracking already exists; "overwrite" replaces their
 * price / customer / note. Returns how many were inserted, updated, skipped or invalid.
 */
async function importRows(user, body) {
  const overwrite = body.mode === 'overwrite';
  if (!canCreate(user) || (overwrite && !canEdit(user))) throw httpError(403, 'អ្នកមិនមានសិទ្ធិ Upload ទេ');
  const input = Array.isArray(body.rows) ? body.rows : [];
  if (input.length > MAX_IMPORT_ROWS) throw httpError(400, `យ៉ាងច្រើន ${MAX_IMPORT_ROWS} ជួរក្នុងមួយដង`);

  const seen = new Set();
  const clean = [];
  const invalid = [];
  for (const r of input) {
    const tracking = cleanTracking(r?.tracking);
    const unitPrice = toPrice(r?.unitPrice);
    if (!tracking || Number.isNaN(unitPrice)) {
      invalid.push(tracking || '(blank)');
      continue;
    }
    if (seen.has(tracking)) continue;
    seen.add(tracking);
    clean.push([tracking, unitPrice, str(r.customerName, 255), str(r.note, 2000)]);
  }
  if (!clean.length) return { inserted: 0, updated: 0, skipped: 0, invalid };

  const { rows: existingRows } = await executeQuery(`SELECT \`tracking\` FROM \`${T}\` WHERE \`tracking\` IN (?)`, [clean.map((c) => c[0])]);
  const existing = new Set(existingRows.map((r) => String(r.tracking).toUpperCase()));
  const toInsert = clean.filter((c) => !existing.has(c[0]));
  const toUpdate = overwrite ? clean.filter((c) => existing.has(c[0])) : [];
  const actor = actorName(user);
  const email = emailOf(user) || null;

  if (toInsert.length) {
    await executeQuery(
      `INSERT INTO \`${T}\` (\`tracking\`, \`unit_price\`, \`customer_name\`, \`note\`, \`operator_email\`, \`created_by\`, \`updated_by\`) VALUES ?
       ON DUPLICATE KEY UPDATE \`tracking\` = \`tracking\``,
      [toInsert.map((c) => [...c, email, actor, actor])]
    );
  }
  for (const [tracking, unitPrice, customer, note] of toUpdate) {
    await executeQuery(
      `UPDATE \`${T}\` SET \`unit_price\` = ?, \`customer_name\` = ?, \`note\` = ?, \`updated_by\` = ? WHERE \`tracking\` = ?`,
      [unitPrice, customer, note, actor, tracking]
    );
  }
  return {
    inserted: toInsert.length,
    updated: toUpdate.length,
    skipped: clean.length - toInsert.length - toUpdate.length,
    invalid,
  };
}

async function deleteRows(user, body) {
  if (!canDelete(user)) throw httpError(403, 'អ្នកមិនមានសិទ្ធិលុបទេ');
  const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map((v) => parseInt(v, 10)).filter(Boolean).slice(0, 1000);
  if (!ids.length) throw httpError(400, 'Missing id');
  const { rows: result } = await executeQuery(`DELETE FROM \`${T}\` WHERE \`id\` IN (?)`, [ids]);
  return { deleted: Number(result?.affectedRows ?? 0) };
}

// ── entry ──────────────────────────────────────────────────────────────────

export async function handleIssueInvoiceAction(req, action, url) {
  try {
    await ensureTable();
    const user = req.user;
    if (action === 'issue_invoice_list') {
      const q = Object.fromEntries(url.searchParams.entries());
      return [200, { ok: true, data: await listRows({ ...q, ...(req.body || {}) }) }];
    }
    if (req.method !== 'POST') return [405, { ok: false, message: 'Method Not Allowed' }];
    const body = req.body || {};
    if (action === 'issue_invoice_save') return [200, { ok: true, data: await saveRow(user, body) }];
    if (action === 'issue_invoice_import') return [200, { ok: true, data: await importRows(user, body) }];
    if (action === 'issue_invoice_delete') return [200, { ok: true, data: await deleteRows(user, body) }];
    return [400, { ok: false, message: `Unknown action: ${action}` }];
  } catch (err) {
    const status = err?.statusCode || (err?.code === 'ER_DUP_ENTRY' ? 409 : 500);
    if (status >= 500) console.error('[issue-invoices]', action, err?.message);
    return [status, { ok: false, message: status === 409 && !err?.statusCode ? 'Tracking មានរួចហើយ' : err?.message || 'Server error' }];
  }
}
