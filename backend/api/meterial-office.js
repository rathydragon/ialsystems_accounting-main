/**
 * Meterial_Office page (vehicles / fuel cards) → Hostinger MySQL (tbl_meterial_office).
 *
 * Served as actions on /api/remote-mysql so it does not add another Vercel function:
 *   meterial_office_list    – every row (all signed-in users)
 *   meterial_office_save    – create (no id) or update one row
 *   meterial_office_delete  – delete one or more rows by id
 *
 * Permissions follow the Customers page: ADMIN always; other users unless VIEWER or the
 * matching canCreate / canEdit / canDelete flag is false.
 */
import { executeQuery } from './remote-mysql.js';

const T = 'tbl_meterial_office';

// Column key → max length. Order = display order on the page.
export const FIELDS = [
  ['name_handle', 150],
  ['model_no', 50],
  ['size_type', 50],
  ['card_id', 100],
  ['details', 100],
  ['station', 100],
  ['status', 50],
  ['vehicle_type', 50],
  ['check_date', 20],
  ['check_expire', 20],
  ['monthly_limit', 50],
  ['net_amount_limit', 50],
  ['notes', 255],
  ['serial_gps', 100],
  ['link_sokimic', 255],
];
const KEYS = FIELDS.map(([k]) => k);

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';
const actorName = (user) => String(user?.name || user?.email || '').slice(0, 150) || null;

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = executeQuery(`
      CREATE TABLE IF NOT EXISTS \`${T}\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        ${FIELDS.map(([k, len]) => `\`${k}\` VARCHAR(${len}) NOT NULL DEFAULT ''`).join(',\n        ')},
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`created_by\` VARCHAR(150) DEFAULT NULL,
        \`updated_by\` VARCHAR(150) DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_mo_model\` (\`model_no\`),
        INDEX \`idx_mo_order\` (\`sort_order\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
      .then(addMissingColumns)
      .catch((err) => {
        tableReady = null; // retry on next request
        throw err;
      });
  }
  return tableReady;
}

/** Adds columns introduced after the table was first created (e.g. net_amount_limit). */
async function addMissingColumns() {
  const { rows } = await executeQuery(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [T]
  );
  const have = new Set(rows.map((r) => String(r.COLUMN_NAME || r.column_name).toLowerCase()));
  let prev = 'id';
  for (const [k, len] of FIELDS) {
    if (!have.has(k)) {
      await executeQuery(`ALTER TABLE \`${T}\` ADD COLUMN \`${k}\` VARCHAR(${len}) NOT NULL DEFAULT '' AFTER \`${prev}\``);
    }
    prev = k;
  }
}

async function listRows() {
  const { rows } = await executeQuery(
    `SELECT id, ${KEYS.map((k) => `\`${k}\``).join(', ')}, created_by, updated_by, created_at, updated_at
       FROM \`${T}\` ORDER BY sort_order ASC, id ASC`
  );
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

/** Cleans one incoming row: only known keys, trimmed, cut to the column length. */
function readRow(input) {
  const out = {};
  for (const [k, len] of FIELDS) {
    const v = input?.[k];
    out[k] = v === null || v === undefined ? '' : String(v).trim().slice(0, len);
  }
  return out;
}

const normPlate = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

async function saveRow(input, user) {
  const row = readRow(input);
  if (!row.model_no && !row.name_handle) throw httpError(400, 'សូមបញ្ចូល Model No. ឬ Name Handle');
  const id = Number(input?.id) || null;

  // Model No. (plate) must be unique when given
  if (row.model_no) {
    const { rows: dup } = await executeQuery(
      `SELECT id FROM \`${T}\` WHERE REPLACE(UPPER(model_no), ' ', '') = ? AND id <> ? LIMIT 1`,
      [normPlate(row.model_no), id || 0]
    );
    if (dup.length) throw httpError(409, `Model No. "${row.model_no}" មានរួចហើយ`);
  }

  if (id) {
    const { rows } = await executeQuery(
      `UPDATE \`${T}\` SET ${KEYS.map((k) => `\`${k}\` = ?`).join(', ')}, updated_by = ? WHERE id = ?`,
      [...KEYS.map((k) => row[k]), actorName(user), id]
    );
    if (!rows.affectedRows) throw httpError(404, 'រកមិនឃើញ (ប្រហែលត្រូវបានលុបរួចហើយ)');
    return id;
  }
  const { rows } = await executeQuery(
    `INSERT INTO \`${T}\` (${KEYS.map((k) => `\`${k}\``).join(', ')}, sort_order, created_by, updated_by)
     SELECT ${KEYS.map(() => '?').join(', ')}, COALESCE(MAX(sort_order), 0) + 1, ?, ? FROM \`${T}\``,
    [...KEYS.map((k) => row[k]), actorName(user), actorName(user)]
  );
  return Number(rows.insertId);
}

export async function handleMeterialOfficeAction(req, action) {
  try {
    await ensureTable();
    const user = req.user;

    if (action === 'meterial_office_list') {
      return [200, { ok: true, data: await listRows() }];
    }

    if (req.method !== 'POST') return [405, { ok: false, message: 'Method Not Allowed' }];
    const body = req.body || {};
    const role = String(user?.role || '').toUpperCase();
    const viewer = role === 'VIEWER';

    if (action === 'meterial_office_save') {
      const isNew = !Number(body.row?.id);
      const allowed = isAdmin(user) || (!viewer && (isNew ? user?.canCreate !== false : user?.canEdit !== false));
      if (!allowed) return [403, { ok: false, message: 'អ្នកមិនមានសិទ្ធិ' + (isNew ? 'បន្ថែម' : 'កែប្រែ') + 'ទិន្នន័យនេះទេ' }];
      const id = await saveRow(body.row, user);
      return [200, { ok: true, id, data: await listRows() }];
    }

    if (action === 'meterial_office_delete') {
      if (!isAdmin(user) && (viewer || user?.canDelete === false)) {
        return [403, { ok: false, message: 'អ្នកមិនមានសិទ្ធិលុបទិន្នន័យនេះទេ' }];
      }
      const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map(Number).filter((n) => n > 0);
      if (!ids.length) throw httpError(400, 'id មិនត្រឹមត្រូវ');
      const { rows } = await executeQuery(`DELETE FROM \`${T}\` WHERE id IN (?)`, [ids]);
      return [200, { ok: true, deleted: Number(rows.affectedRows || 0), data: await listRows() }];
    }

    return [400, { ok: false, message: `Unknown action: ${action}` }];
  } catch (err) {
    console.error('[meterial-office] api error:', err?.message);
    return [err.statusCode || 500, { ok: false, message: err?.message || 'Server error' }];
  }
}
