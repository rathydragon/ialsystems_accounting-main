/**
 * Server-side audit trail for User Logs (tbl_user_logs).
 *
 * Every signed-in request that changes data (POST / PUT / PATCH / DELETE) is written to
 * tbl_user_logs with who did it, what they did and whether it worked. It runs on the server,
 * so it records actions from every user on every device, not only what one browser saw.
 *
 * Hooked from authenticateRequest() in auth-middleware.js, which every protected endpoint
 * already calls (Express routes, Vercel functions and the self-authenticating handlers).
 */

// Reads, background syncs and system jobs: not user actions.
const SKIP_ACTIONS = new Set([
  'log_activity', // the browser's own log entries, saved by their own handler
  'get_user_logs',
  'daily_summary_lock',
  'sync_pod_batch',
  'auto_sync_new_pod',
  'deduplicate_pod_sheet',
  'sync_distribution_sheet',
  'pod_sync_batch',
  'pod_sync_new_records',
  'test_pod_webapp',
  // Already logged by the app with amounts and batch numbers (COMMIT_BATCH, DELETE_BATCH, DELETE_ALL_BATCHES)
  'save_batch',
  'delete_batch',
  'delete_all_batches'
]);
const READ_ACTION = /^(get_|list|fetch|test|stats|version|master_version|table_data|export)/i;

// Endpoints that are not user actions, or whose actions the app already logs itself
// (/api/permissions: ADD_USER, UPDATE_ROLE, CHANGE_STATUS, DELETE_USER, LOGIN).
const SKIP_PATHS = ['/api/telegram-alert', '/api/gemini-proxy', '/api/sheet-proxy', '/api/health', '/api/permissions'];

// Khmer label per action (fallback: the action code itself)
const ACTION_LABELS = {
  save_medicine_batch: 'រក្សាទុកកញ្ចប់ថ្នាំ',
  delete_medicine_batch: 'លុបកញ្ចប់ថ្នាំ',
  delete_all_medicine_batches: 'លុបកញ្ចប់ថ្នាំទាំងអស់',
  save_cod_batch: 'រក្សាទុកកញ្ចប់ COD',
  delete_cod_batch: 'លុបកញ្ចប់ COD',
  delete_all_cod_batches: 'លុបកញ្ចប់ COD ទាំងអស់',
  save_list_name: 'រក្សាទុកឈ្មោះអ្នកបង់',
  delete_payer: 'លុបឈ្មោះអ្នកបង់',
  save_warehouse_scan: 'ស្កេនទំនិញ (ឃ្លាំង)',
  delete_warehouse_scan: 'លុបការស្កេន (ឃ្លាំង)',
  delete_warehouse_scan_batch: 'លុបបាច់ស្កេន (ឃ្លាំង)',
  clear_all_warehouse_scans: 'សម្អាតការស្កេនទាំងអស់',
  save_bank_slip: 'រក្សាទុកស្លីបធនាគារ',
  delete_bank_slip: 'លុបស្លីបធនាគារ',
  save_permission: 'រក្សាទុកសិទ្ធិអ្នកប្រើ',
  delete_permission: 'លុបសិទ្ធិអ្នកប្រើ',
  save_settings: 'កែការកំណត់ប្រព័ន្ធ',
  save_distribution_reports: 'រក្សាទុករបាយការណ៍ចែកចាយ',
  delete_distribution_reports: 'លុបរបាយការណ៍ចែកចាយ',
  save_distribution_report: 'រក្សាទុករបាយការណ៍ចែកចាយ',
  delete_distribution_report: 'លុបរបាយការណ៍ចែកចាយ',
  save_customer: 'រក្សាទុកអតិថិជន',
  import_customers: 'នាំចូលអតិថិជន (Excel)',
  delete_customer: 'លុបអតិថិជន',
  delete_customers: 'លុបអតិថិជនច្រើន',
  update_booking: 'កែការកក់ (Telegram)',
  notify_pickup: 'ជូនដំណឹងមកយកទំនិញ',
  delete_booking: 'លុបការកក់ (Telegram)',
  save_team_member: 'រក្សាទុកសមាជិកក្រុម',
  import_team: 'នាំចូលសមាជិកក្រុម',
  delete_team_member: 'លុបសមាជិកក្រុម',
  save_config: 'កែការកំណត់ Booking',
  set_webhook: 'កំណត់ Telegram Webhook',
  delete_webhook: 'លុប Telegram Webhook',
  save_app_config: 'កែការកំណត់កម្មវិធី',
  backup_postgres: 'Backup ទិន្នន័យ',
  backup_schedule: 'កែកាលវិភាគ Backup',
  pod_sync_control: 'កែ POD Sync'
};

function str(v, max = 80) {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, max);
}

/** Work out the action code for this request (e.g. "save_customer"). */
function resolveAction(req, path) {
  let action = '';
  try {
    const url = new URL(req.originalUrl || req.url || '/', 'http://localhost');
    action = url.searchParams.get('action') || '';
  } catch {}
  if (!action && req.body && typeof req.body === 'object') action = req.body.action || '';
  if (action) return String(action);

  // Endpoints without an action field: name them after the route
  const route = path.replace(/^\/api\//, '').replace(/[^a-z0-9]+/gi, '_');
  if (route === 'distribution_reports') {
    return req.method === 'DELETE' ? 'delete_distribution_report' : 'save_distribution_report';
  }
  if (route === 'app_config') return 'save_app_config';
  return route || 'request';
}

/** Short summary of what was changed, taken from the request body. */
function describeBody(body) {
  if (!body || typeof body !== 'object') return { text: '', items: 0, batch: '' };
  const parts = [];
  let items = 0;

  const batch = body.batch && typeof body.batch === 'object' ? body.batch : null;
  const batchNumber = str(body.batchNumber || batch?.batchNumber || body.batch_number || body.batchId || '');

  for (const key of ['items', 'scans', 'reports', 'rows', 'customers', 'ids', 'members', 'permissions', 'records']) {
    if (Array.isArray(body[key])) {
      items = body[key].length;
      parts.push(`${items} ធាតុ`);
      break;
    }
  }
  if (!items && batch && Array.isArray(batch.items)) {
    items = batch.items.length;
    parts.push(`${items} ធាតុ`);
  }

  const one = body.scan || body.report || body.slip || body.customer || body.payer || body.item || body.member || body.permission || body;
  const ident = [
    ['Barcode', one.barcode || body.barcode],
    ['ឈ្មោះ', one.name || one.customerName || one.payerName],
    ['Email', one.email],
    ['ID', one.id || body.id]
  ];
  for (const [label, value] of ident) {
    const v = str(value, 60);
    if (v) parts.push(`${label}: ${v}`);
  }
  if (one.scanType || body.scanType) parts.push(`ប្រភេទ: ${str(one.scanType || body.scanType, 30)}`);
  if (body.status && typeof body.status === 'string') parts.push(`ស្ថានភាព: ${str(body.status, 30)}`);

  return { text: parts.join(', '), items, batch: batchNumber };
}

let tableReady = null;
function ensureLogTable(pool) {
  if (!tableReady) {
    tableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS \`tbl_user_logs\` (
        \`id\` INT AUTO_INCREMENT NOT NULL,
        \`log_id\` VARCHAR(100) DEFAULT NULL,
        \`timestamp\` VARCHAR(50) DEFAULT NULL,
        \`operator\` VARCHAR(150) DEFAULT NULL,
        \`email\` VARCHAR(150) DEFAULT NULL,
        \`role\` VARCHAR(100) DEFAULT NULL,
        \`action\` VARCHAR(100) DEFAULT NULL,
        \`details\` TEXT DEFAULT NULL,
        \`batch_number\` VARCHAR(100) DEFAULT NULL,
        \`amount_usd\` DECIMAL(15, 2) DEFAULT 0.00,
        \`amount_khr\` DECIMAL(18, 2) DEFAULT 0.00,
        \`items_count\` INT DEFAULT 0,
        \`created_at\` VARCHAR(50) DEFAULT NULL,
        \`synced_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_log_operator\` (\`operator\`),
        INDEX \`idx_log_action\` (\`action\`),
        INDEX \`idx_log_batch\` (\`batch_number\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

async function writeAuditRow(req, statusCode, path, action) {
  const { getMySQLPool } = await import('./remote-mysql.js');
  const pool = getMySQLPool();
  await ensureLogTable(pool);

  const user = req.user || {};
  const label = ACTION_LABELS[action] || action;
  const { text, items, batch } = describeBody(req.body);
  const ok = statusCode < 400;
  const details = [
    label,
    text ? `(${text})` : '',
    ok ? '' : `— បរាជ័យ (HTTP ${statusCode})`
  ].filter(Boolean).join(' ').slice(0, 2000);

  const now = new Date().toISOString();
  await pool.query(`
    INSERT INTO tbl_user_logs (
      log_id, timestamp, operator, email, role, action, details,
      batch_number, amount_usd, amount_khr, items_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    `srv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    now,
    str(user.name || user.email || 'Unknown', 150),
    str(user.email, 150),
    str(user.role, 100),
    action.toUpperCase().slice(0, 100),
    details,
    str(batch, 100),
    0,
    0,
    items,
    now
  ]);
}

/**
 * Attach the audit hook to a request once it is authenticated.
 * The row is written just before the response is sent, so the result (success / HTTP error)
 * is known and the write finishes before a serverless function can be frozen.
 */
export function attachAuditTrail(req, res) {
  if (!req || !res || req.__auditAttached) return;
  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
  if (process.env.NODE_ENV === 'test' || !process.env.REMOTE_DB_USER) return;

  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (SKIP_PATHS.some((p) => path === p || path.startsWith(p + '/'))) return;

  req.__auditAttached = true;
  const originalEnd = res.end;
  let done = false;

  res.end = function (...args) {
    if (done) return originalEnd.apply(this, args);
    done = true;
    const self = this;

    // Body is read here (not earlier) so it is parsed by now on every runtime
    const action = resolveAction(req, path);
    if (SKIP_ACTIONS.has(action) || READ_ACTION.test(action)) {
      return originalEnd.apply(self, args);
    }

    const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
    Promise.race([writeAuditRow(req, res.statusCode || 200, path, action), timeout])
      .catch((err) => console.warn('[audit] Could not write user log:', err?.message))
      .finally(() => originalEnd.apply(self, args));
    return self;
  };
}
