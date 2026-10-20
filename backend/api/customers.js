/**
 * Customer Details → Hostinger MySQL (tbl_customers).
 *
 * Served as actions on /api/remote-mysql (get_customers, get_sale_users, save_customer,
 * import_customers, delete_customer) so it does not add another Vercel function
 * (api/ is already at the Hobby limit of 12).
 *
 * Sale handle is a link to a user account: sale_user_id = tbl_permissions.user_id. The name shown
 * is always read live from the account; sale_handle keeps the last known name (export / fallback),
 * or the raw text when an imported or legacy name matches no account yet.
 */
import { executeQuery } from './remote-mysql.js';

const T_CUSTOMERS = 'tbl_customers';
const T_USERS = 'tbl_permissions';

const CUSTOMER_TYPES = ['INDIVIDUAL', 'BUSINESS'];
const STATUSES = ['ACTIVE', 'INACTIVE'];

/** Upgrades tables created before a column existed (MySQL has no ADD COLUMN IF NOT EXISTS). */
async function addColumnIfMissing(column, definition) {
  try {
    await executeQuery(`ALTER TABLE \`${T_CUSTOMERS}\` ADD COLUMN \`${column}\` ${definition}`);
  } catch (err) {
    if (err?.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

let tableReady = null;
export function ensureCustomerTable() {
  if (!tableReady) {
    tableReady = executeQuery(`
      CREATE TABLE IF NOT EXISTS \`${T_CUSTOMERS}\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`customer_code\` VARCHAR(50) DEFAULT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`company\` VARCHAR(255) DEFAULT NULL,
        \`customer_type\` VARCHAR(20) NOT NULL DEFAULT 'INDIVIDUAL',
        \`phone\` VARCHAR(100) DEFAULT NULL,
        \`phone2\` VARCHAR(100) DEFAULT NULL,
        \`email\` VARCHAR(150) DEFAULT NULL,
        \`telegram\` VARCHAR(100) DEFAULT NULL,
        \`address\` TEXT,
        \`province\` VARCHAR(100) DEFAULT NULL,
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        \`sale_user_id\` VARCHAR(255) DEFAULT NULL,
        \`sale_handle\` VARCHAR(150) DEFAULT NULL,
        \`notes\` TEXT,
        \`created_by\` VARCHAR(150) DEFAULT NULL,
        \`updated_by\` VARCHAR(150) DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_customer_code\` (\`customer_code\`),
        INDEX \`idx_customer_name\` (\`name\`),
        INDEX \`idx_customer_phone\` (\`phone\`),
        INDEX \`idx_customer_status\` (\`status\`),
        INDEX \`idx_customer_sale_user\` (\`sale_user_id\`),
        INDEX \`idx_customer_sale\` (\`sale_handle\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
      .then(() => addColumnIfMissing('sale_handle', "VARCHAR(150) DEFAULT NULL AFTER `status`, ADD INDEX `idx_customer_sale` (`sale_handle`)"))
      .then(() => addColumnIfMissing('sale_user_id', "VARCHAR(255) DEFAULT NULL AFTER `status`, ADD INDEX `idx_customer_sale_user` (`sale_user_id`)"))
      .catch((err) => {
        tableReady = null; // retry on next request
        throw err;
      });
  }
  return tableReady;
}

function str(value, max) {
  const s = String(value ?? '').trim().slice(0, max);
  return s || null;
}

function actorName(user) {
  return user?.name || user?.email || null;
}

function isAdmin(user) {
  return String(user?.role || '').toUpperCase() === 'ADMIN';
}

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

// ── User accounts (Sale handle source) ─────────────────────────────────────

/** "MR. Vanna" / "Mr.Vanna" / "vanna" / "លោក Vanna" → "vanna" (leading title ignored) */
const normName = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/^(mr|mrs|ms|miss|dr|lok|neak)\b\.?\s*|^(លោកស្រី|លោក|អ្នកស្រី|កញ្ញា)\s*/u, '')
    .replace(/[\s.]/g, '');

export async function loadUsers() {
  try {
    const { rows } = await executeQuery(`SELECT user_id, email, name, role, status FROM \`${T_USERS}\` ORDER BY name ASC`);
    return rows.filter((u) => u.user_id);
  } catch (err) {
    console.warn('[customers] user list unavailable:', err?.message);
    return [];
  }
}

export function indexUsers(users) {
  const byId = new Map();
  const byEmail = new Map();
  const byName = new Map();
  for (const u of users) {
    byId.set(String(u.user_id), u);
    if (u.email) byEmail.set(String(u.email).toLowerCase().trim(), u);
    const key = normName(u.name);
    // Two accounts with the same name: ambiguous, never auto-link by name
    if (key) byName.set(key, byName.has(key) ? null : u);
  }
  return { byId, byEmail, byName };
}

const displayName = (u) => u.name || u.email;

/** Resolves a customer's sale (picked id, or typed name / email) to [sale_user_id, sale_handle]. */
export function resolveSale(c, idx) {
  const id = str(c.sale_user_id, 255);
  const linked = id && idx.byId.get(id);
  if (linked) return [String(linked.user_id), displayName(linked)];
  const text = str(c.sale_handle, 150);
  if (!text) return [null, null];
  const u = idx.byEmail.get(text.toLowerCase()) || idx.byName.get(normName(text));
  return u ? [String(u.user_id), displayName(u)] : [null, text];
}

/** Data scope "OWN": customers the user handles as sale, or created. */
function ownScope(user, idx) {
  if (isAdmin(user) || !user?.viewOnlyOwn) return null;
  const ids = new Set();
  if (user.id && idx.byId.has(String(user.id))) ids.add(String(user.id));
  const byEmail = user.email && idx.byEmail.get(String(user.email).toLowerCase().trim());
  if (byEmail) ids.add(String(byEmail.user_id));
  const names = new Set([user.name, user.email].filter(Boolean).map((s) => String(s).toLowerCase()));
  return (row) => ids.has(String(row.sale_user_id || '')) || names.has(String(row.created_by || '').toLowerCase());
}

// ── Customers ──────────────────────────────────────────────────────────────

export async function listCustomers(user, idx) {
  const { rows } = await executeQuery(`SELECT * FROM \`${T_CUSTOMERS}\` ORDER BY name ASC`);

  // Link legacy / imported names (or links to a deleted account) to accounts created or renamed since
  const toLink = [];
  for (const row of rows) {
    if (!row.sale_handle || (row.sale_user_id && idx.byId.has(String(row.sale_user_id)))) continue;
    const [saleId, saleName] = resolveSale({ sale_handle: row.sale_handle }, idx);
    if (saleId) {
      row.sale_user_id = saleId;
      row.sale_handle = saleName;
      toLink.push([saleId, saleName, row.id]);
    }
  }
  for (const params of toLink) {
    await executeQuery(`UPDATE \`${T_CUSTOMERS}\` SET sale_user_id = ?, sale_handle = ? WHERE id = ?`, params);
  }

  const inScope = ownScope(user, idx);
  return rows
    .filter((row) => !inScope || inScope(row))
    .map((row) => {
      const u = row.sale_user_id ? idx.byId.get(String(row.sale_user_id)) : null;
      return { ...row, sale_handle: u ? displayName(u) : row.sale_handle, sale_linked: Boolean(u) };
    });
}

const COLUMNS = ['customer_code', 'name', 'company', 'customer_type', 'phone', 'phone2', 'email', 'telegram', 'address', 'province', 'status', 'sale_user_id', 'sale_handle', 'notes'];

/** Column values in COLUMNS order (index 0 = customer_code, 1 = name, 4 = phone). */
function customerValues(c, idx) {
  return [
    str(c.customer_code, 50),
    str(c.name, 255),
    str(c.company, 255),
    CUSTOMER_TYPES.includes(c.customer_type) ? c.customer_type : 'INDIVIDUAL',
    str(c.phone, 100),
    str(c.phone2, 100),
    str(c.email, 150),
    str(c.telegram, 100),
    str(c.address, 2000),
    str(c.province, 100),
    STATUSES.includes(c.status) ? c.status : 'ACTIVE',
    ...resolveSale(c, idx),
    str(c.notes, 2000),
  ];
}

async function numberNewCustomers() {
  // No code given: number it from the row id (CUS-00001)
  await executeQuery(`UPDATE \`${T_CUSTOMERS}\` SET customer_code = CONCAT('CUS-', LPAD(id, 5, '0')) WHERE customer_code IS NULL`);
}

const dedupeKey = (name, phone) => `${String(name || '').trim().toLowerCase()}|${String(phone || '').replace(/\D/g, '')}`;

export const MAX_IMPORT_ROWS = 5000;

/**
 * Bulk import. A row whose customer_code already exists updates that customer; a row without a code
 * is skipped when a customer with the same name + phone exists (so re-importing a file is safe).
 * Sale_Handle may hold an account's name or email; names that match no account are kept unlinked.
 */
export async function importCustomers(list, user, idx) {
  if (!Array.isArray(list)) throw httpError(400, 'Invalid import data');
  if (list.length > MAX_IMPORT_ROWS) throw httpError(400, `Too many rows (max ${MAX_IMPORT_ROWS})`);

  const { rows: existing } = await executeQuery(`SELECT customer_code, name, phone, sale_user_id, created_by FROM \`${T_CUSTOMERS}\``);
  const existingByCode = new Map(existing.filter((r) => r.customer_code).map((r) => [String(r.customer_code).toLowerCase(), r]));
  const seenKeys = new Set(existing.map((r) => dedupeKey(r.name, r.phone)));
  const seenCodes = new Set();
  const inScope = ownScope(user, idx);

  let skipped = 0;
  let updated = 0;
  let unlinkedSale = 0;
  const rows = [];
  for (const raw of list) {
    const values = customerValues(raw || {}, idx);
    const code = String(values[0] || '').toLowerCase();
    if (!values[1] || (code && seenCodes.has(code))) { skipped++; continue; }
    if (code) {
      const current = existingByCode.get(code);
      // "Own data" users may not overwrite someone else's customer
      if (current && inScope && !inScope(current)) { skipped++; continue; }
      seenCodes.add(code);
      if (current) updated++;
    } else {
      const key = dedupeKey(values[1], values[4]);
      if (seenKeys.has(key)) { skipped++; continue; }
      seenKeys.add(key);
    }
    if (!values[11] && values[12]) unlinkedSale++;
    rows.push(values);
  }

  const actor = actorName(user);
  const updates = COLUMNS.slice(1).map((col) => `\`${col}\` = VALUES(\`${col}\`)`).join(', ');
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await executeQuery(
      `INSERT INTO \`${T_CUSTOMERS}\` (${COLUMNS.map((c) => `\`${c}\``).join(', ')}, created_by, updated_by)
       VALUES ${chunk.map(() => `(${COLUMNS.map(() => '?').join(', ')}, ?, ?)`).join(', ')}
       ON DUPLICATE KEY UPDATE ${updates}, updated_by = VALUES(updated_by)`,
      chunk.flatMap((v) => [...v, actor, actor])
    );
  }
  await numberNewCustomers();
  return { inserted: rows.length - updated, updated, skipped, unlinkedSale };
}

async function assertInScope(id, user, idx) {
  const inScope = ownScope(user, idx);
  if (!inScope) return;
  const { rows } = await executeQuery(`SELECT sale_user_id, created_by FROM \`${T_CUSTOMERS}\` WHERE id = ?`, [id]);
  if (rows[0] && !inScope(rows[0])) throw httpError(403, 'Forbidden: this customer belongs to another sale');
}

export async function saveCustomer(customer, user, idx) {
  const c = customer || {};
  const values = customerValues(c, idx);
  if (!values[1]) throw httpError(400, 'Customer name is required');

  try {
    const id = parseInt(c.id, 10);
    if (id) {
      await assertInScope(id, user, idx);
      await executeQuery(
        `UPDATE \`${T_CUSTOMERS}\` SET ${COLUMNS.map((col) => `\`${col}\` = ?`).join(', ')}, updated_by = ? WHERE id = ?`,
        [...values, actorName(user), id]
      );
      return id;
    }
    const { rows: result } = await executeQuery(
      `INSERT INTO \`${T_CUSTOMERS}\` (${COLUMNS.map((col) => `\`${col}\``).join(', ')}, created_by, updated_by)
       VALUES (${COLUMNS.map(() => '?').join(', ')}, ?, ?)`,
      [...values, actorName(user), actorName(user)]
    );
    if (!values[0]) await numberNewCustomers();
    return Number(result?.insertId);
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') throw httpError(409, `Customer code "${values[0]}" is already used`);
    throw err;
  }
}

export async function deleteCustomer(id, user, idx) {
  const customerId = parseInt(id, 10);
  if (!customerId) throw httpError(400, 'Missing customer ID');
  await assertInScope(customerId, user, idx);
  await executeQuery(`DELETE FROM \`${T_CUSTOMERS}\` WHERE id = ?`, [customerId]);
}

/** Runs one customer action; returns [statusCode, responseBody]. */
export async function handleCustomerAction(req, action) {
  try {
    await ensureCustomerTable();
    const user = req.user;
    const users = await loadUsers();
    const idx = indexUsers(users);

    if (action === 'get_customers') {
      return [200, { ok: true, data: await listCustomers(user, idx) }];
    }
    if (action === 'get_sale_users') {
      // Only what the Sale picker needs; never permission flags
      const data = users.map((u) => ({ user_id: String(u.user_id), name: u.name || '', email: u.email || '', role: u.role || '', status: u.status || 'ACTIVE' }));
      return [200, { ok: true, data }];
    }

    if (req.method !== 'POST') return [405, { ok: false, message: 'Method Not Allowed' }];
    const body = req.body || {};
    const role = String(user?.role || '').toUpperCase();

    if (action === 'save_customer') {
      if (!isAdmin(user) && (role === 'VIEWER' || (user?.canCreate === false && user?.canEdit === false))) {
        return [403, { ok: false, message: 'Forbidden: no edit permission' }];
      }
      const id = await saveCustomer(body.customer, user, idx);
      return [200, { ok: true, id, data: await listCustomers(user, idx) }];
    }

    if (action === 'import_customers') {
      if (!isAdmin(user) && (role === 'VIEWER' || user?.canCreate === false)) {
        return [403, { ok: false, message: 'Forbidden: no create permission' }];
      }
      const result = await importCustomers(body.customers, user, idx);
      return [200, { ok: true, data: { ...result, customers: await listCustomers(user, idx) } }];
    }

    if (action === 'delete_customer') {
      if (!isAdmin(user) && (role === 'VIEWER' || user?.canDelete === false)) {
        return [403, { ok: false, message: 'Forbidden: no delete permission' }];
      }
      await deleteCustomer(body.id, user, idx);
      return [200, { ok: true, data: await listCustomers(user, idx) }];
    }

    return [400, { ok: false, message: `Unknown action: ${action}` }];
  } catch (err) {
    console.error('[customers] api error:', err?.message);
    return [err.statusCode || 500, { ok: false, message: err?.message || 'Server error' }];
  }
}
