/**
 * Telegram "IAL Booking" channel → Hostinger MySQL.
 *
 * - webhookHandler: public endpoint Telegram calls for every new / edited post. Verified by the
 *   X-Telegram-Bot-Api-Secret-Token header. Top-level posts become bookings; replies from the
 *   authorized dispatcher set "Picked up by".
 * - bookingApiHandler: authenticated endpoint the Booking page uses (list, assign, team, config).
 */
import crypto from 'crypto';
import { executeQuery } from './remote-mysql.js';
import {
  parseBookingText,
  matchTeamMember,
  extractMessage,
  messageText,
  messageMapUrl,
  messageAuthor,
  isAuthorizedAssigner,
} from './telegram-booking-parser.js';

const T_BOOKINGS = 'tbl_tg_bookings';
const T_REPLIES = 'tbl_tg_booking_replies';
const T_TEAM = 'tbl_tg_booking_team';
const T_CONFIG = 'tbl_tg_booking_config';

const DEFAULT_CONFIG = {
  assigner_ids: '556322085',
  assigner_names: 'B Khu 011',
  chat_id: '',
};

const STATUSES = ['PENDING', 'ASSIGNED', 'DONE', 'CANCELLED'];

function getBotToken() {
  return String(process.env.TELEGRAM_BOOKING_BOT_TOKEN || '').trim();
}

/** Webhook secret: explicit env value, or derived from the bot token so no extra setup is needed. */
export function getWebhookSecret() {
  const explicit = String(process.env.TELEGRAM_BOOKING_WEBHOOK_SECRET || '').trim();
  if (explicit) return explicit;
  const token = getBotToken();
  if (!token) return '';
  return crypto.createHash('sha256').update(`ial-booking:${token}`).digest('hex').slice(0, 48);
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
}

let tablesReady = null;
export function ensureBookingTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS \`${T_BOOKINGS}\` (
          \`id\` BIGINT NOT NULL AUTO_INCREMENT,
          \`chat_id\` BIGINT NOT NULL,
          \`message_id\` BIGINT NOT NULL,
          \`posted_at\` DATETIME NOT NULL,
          \`author\` VARCHAR(150) DEFAULT NULL,
          \`author_id\` BIGINT DEFAULT NULL,
          \`text\` TEXT,
          \`customer\` VARCHAR(255) DEFAULT NULL,
          \`phone\` VARCHAR(100) DEFAULT NULL,
          \`service_type\` VARCHAR(30) DEFAULT NULL,
          \`location\` VARCHAR(255) DEFAULT NULL,
          \`map_url\` VARCHAR(500) DEFAULT NULL,
          \`status\` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          \`picked_up_by\` VARCHAR(150) DEFAULT NULL,
          \`pickup_raw\` VARCHAR(255) DEFAULT NULL,
          \`pickup_unmatched\` TINYINT(1) NOT NULL DEFAULT 0,
          \`assigned_by\` VARCHAR(150) DEFAULT NULL,
          \`assigned_at\` DATETIME DEFAULT NULL,
          \`assign_message_id\` BIGINT DEFAULT NULL,
          \`note\` TEXT,
          \`updated_by\` VARCHAR(150) DEFAULT NULL,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_tg_booking_msg\` (\`chat_id\`, \`message_id\`),
          INDEX \`idx_tg_booking_posted\` (\`posted_at\`),
          INDEX \`idx_tg_booking_status\` (\`status\`),
          INDEX \`idx_tg_booking_pickup\` (\`picked_up_by\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS \`${T_REPLIES}\` (
          \`id\` BIGINT NOT NULL AUTO_INCREMENT,
          \`chat_id\` BIGINT NOT NULL,
          \`message_id\` BIGINT NOT NULL,
          \`reply_to_message_id\` BIGINT NOT NULL,
          \`author\` VARCHAR(150) DEFAULT NULL,
          \`author_id\` BIGINT DEFAULT NULL,
          \`text\` TEXT,
          \`accepted\` TINYINT(1) NOT NULL DEFAULT 0,
          \`reason\` VARCHAR(100) DEFAULT NULL,
          \`posted_at\` DATETIME NOT NULL,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_tg_reply_msg\` (\`chat_id\`, \`message_id\`),
          INDEX \`idx_tg_reply_target\` (\`chat_id\`, \`reply_to_message_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS \`${T_TEAM}\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`name\` VARCHAR(100) NOT NULL,
          \`aliases\` TEXT,
          \`role\` VARCHAR(50) DEFAULT 'Driver',
          \`phone\` VARCHAR(50) DEFAULT NULL,
          \`active\` TINYINT(1) NOT NULL DEFAULT 1,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_tg_team_name\` (\`name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS \`${T_CONFIG}\` (
          \`config_key\` VARCHAR(64) NOT NULL,
          \`config_value\` TEXT,
          PRIMARY KEY (\`config_key\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      const seeds = Object.entries(DEFAULT_CONFIG);
      await executeQuery(
        `INSERT IGNORE INTO \`${T_CONFIG}\` (config_key, config_value) VALUES ${seeds.map(() => '(?, ?)').join(', ')}`,
        seeds.flat()
      );
    })().catch((err) => {
      tablesReady = null; // retry on next request
      throw err;
    });
  }
  return tablesReady;
}

function splitList(v) {
  return String(v || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

export async function loadConfig() {
  const { rows } = await executeQuery(`SELECT config_key, config_value FROM \`${T_CONFIG}\``);
  const cfg = { ...DEFAULT_CONFIG };
  for (const r of rows) cfg[r.config_key] = r.config_value ?? '';
  return cfg;
}

async function loadTeam() {
  const { rows } = await executeQuery(`SELECT * FROM \`${T_TEAM}\` ORDER BY name`);
  return rows.map((r) => ({ ...r, active: Boolean(r.active), aliases: splitList(r.aliases) }));
}

const tgDate = (unix) => new Date((Number(unix) || Date.now() / 1000) * 1000);

async function upsertBooking(msg, edited) {
  const text = messageText(msg);
  const parsed = parseBookingText(text);
  const author = messageAuthor(msg);
  const mapUrl = parsed.mapUrl || messageMapUrl(msg);

  // An edit re-parses the text but never touches the assignment / status set since.
  await executeQuery(
    `INSERT INTO \`${T_BOOKINGS}\`
      (chat_id, message_id, posted_at, author, author_id, text, customer, phone, service_type, location, map_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      text = VALUES(text), customer = VALUES(customer), phone = VALUES(phone),
      service_type = VALUES(service_type), location = VALUES(location), map_url = VALUES(map_url)`,
    [
      msg.chat.id, msg.message_id, tgDate(msg.date), author.name || null, author.id,
      text, parsed.customer || null, parsed.phone || null, parsed.serviceType || null,
      parsed.location || null, mapUrl || null,
    ]
  );
  return { type: edited ? 'booking_edited' : 'booking_created' };
}

async function handleReply(msg, cfg) {
  const chatId = msg.chat.id;
  const targetId = msg.reply_to_message.message_id;
  const author = messageAuthor(msg);
  const text = messageText(msg);

  const allowed = isAuthorizedAssigner(author, {
    assignerIds: splitList(cfg.assigner_ids),
    assignerNames: splitList(cfg.assigner_names),
  });

  const { rows: targets } = await executeQuery(
    `SELECT id, assign_message_id FROM \`${T_BOOKINGS}\` WHERE chat_id = ? AND message_id = ? LIMIT 1`,
    [chatId, targetId]
  );
  let target = targets[0];

  // Reply to a post the bot never saw (posted before the bot joined): create it from the quoted copy.
  if (!target && msg.reply_to_message.chat?.id === chatId && !msg.reply_to_message.reply_to_message) {
    await upsertBooking(msg.reply_to_message, false);
    const { rows } = await executeQuery(
      `SELECT id, assign_message_id FROM \`${T_BOOKINGS}\` WHERE chat_id = ? AND message_id = ? LIMIT 1`,
      [chatId, targetId]
    );
    target = rows[0];
  }

  let reason = allowed ? 'assigned' : 'not_authorized';
  if (!target) reason = 'booking_not_found';

  if (allowed && target) {
    // A newer reply wins; an edit to an older reply must not undo a later reassignment.
    const isOlder = target.assign_message_id && Number(target.assign_message_id) > Number(msg.message_id);
    if (isOlder) {
      reason = 'superseded';
    } else {
      const team = await loadTeam();
      const match = matchTeamMember(text, team);
      await executeQuery(
        `UPDATE \`${T_BOOKINGS}\`
         SET picked_up_by = ?, pickup_raw = ?, pickup_unmatched = ?, assigned_by = ?, assigned_at = ?,
             assign_message_id = ?, status = IF(status IN ('PENDING', 'ASSIGNED'), 'ASSIGNED', status)
         WHERE id = ?`,
        [match.name.slice(0, 150), text.slice(0, 255), match.matched ? 0 : 1, author.name || String(author.id || ''),
          tgDate(msg.date), msg.message_id, target.id]
      );
    }
  }

  await executeQuery(
    `INSERT INTO \`${T_REPLIES}\`
      (chat_id, message_id, reply_to_message_id, author, author_id, text, accepted, reason, posted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE text = VALUES(text), accepted = VALUES(accepted), reason = VALUES(reason)`,
    [chatId, msg.message_id, targetId, author.name || null, author.id, text,
      reason === 'assigned' ? 1 : 0, reason, tgDate(msg.date)]
  );
  return { type: 'reply', reason };
}

/** Processes one Telegram update. Exported for tests. */
export async function processUpdate(update) {
  const { msg, edited } = extractMessage(update);
  if (!msg || !msg.chat) return { type: 'ignored', reason: 'no_message' };
  if (msg.from?.is_bot) return { type: 'ignored', reason: 'bot' };
  if (msg.chat.type === 'private') return { type: 'ignored', reason: 'private_chat' };

  await ensureBookingTables();
  const cfg = await loadConfig();
  const chatFilter = String(cfg.chat_id || '').trim();
  if (chatFilter && String(msg.chat.id) !== chatFilter) return { type: 'ignored', reason: 'other_chat' };
  if (!chatFilter) {
    // Lock onto the first chat the bot hears from so other chats it is added to are ignored.
    await executeQuery(`UPDATE \`${T_CONFIG}\` SET config_value = ? WHERE config_key = 'chat_id' AND (config_value IS NULL OR config_value = '')`, [String(msg.chat.id)]);
  }

  if (msg.reply_to_message) return handleReply(msg, cfg);
  if (!messageText(msg)) return { type: 'ignored', reason: 'empty' };
  return upsertBooking(msg, edited);
}

export async function webhookHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
  }
  const secret = getWebhookSecret();
  const header = req.headers?.['x-telegram-bot-api-secret-token'];
  if (!secret || !safeEqual(header, secret)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }
  try {
    const result = await processUpdate(req.body || {});
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[telegram-booking] webhook error:', err?.message);
    // Non-2xx makes Telegram retry later; inserts are idempotent on (chat_id, message_id).
    return res.status(500).json({ ok: false, message: 'Processing failed' });
  }
}

/* ------------------------------------------------------------------ */
/* Authenticated API for the Booking page                              */
/* ------------------------------------------------------------------ */

function isAdmin(user) {
  return String(user?.role || '').toUpperCase() === 'ADMIN';
}

async function telegramApi(method, payload) {
  const token = getBotToken();
  if (!token) throw new Error('TELEGRAM_BOOKING_BOT_TOKEN is not configured on the server.');
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
    signal: AbortSignal.timeout(10000),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data.result;
}

async function listBookings(q) {
  const where = [];
  const params = [];
  if (q.startDate) { where.push('posted_at >= ?'); params.push(`${q.startDate} 00:00:00`); }
  if (q.endDate) { where.push('posted_at <= ?'); params.push(`${q.endDate} 23:59:59`); }
  if (q.status && STATUSES.includes(q.status)) { where.push('status = ?'); params.push(q.status); }
  if (q.pickedUpBy) {
    if (q.pickedUpBy === '__UNMATCHED__') where.push('pickup_unmatched = 1');
    else { where.push('picked_up_by = ?'); params.push(q.pickedUpBy); }
  }
  if (q.search) {
    const s = `%${q.search}%`;
    where.push('(text LIKE ? OR customer LIKE ? OR phone LIKE ? OR location LIKE ? OR author LIKE ? OR picked_up_by LIKE ?)');
    params.push(s, s, s, s, s, s);
  }
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 500, 1), 2000);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await executeQuery(
    `SELECT * FROM \`${T_BOOKINGS}\` ${whereSql} ORDER BY posted_at DESC, id DESC LIMIT ${limit}`,
    params
  );
  return rows;
}

async function listReplies(bookingId) {
  const { rows } = await executeQuery(
    `SELECT r.* FROM \`${T_REPLIES}\` r
     JOIN \`${T_BOOKINGS}\` b ON b.chat_id = r.chat_id AND b.message_id = r.reply_to_message_id
     WHERE b.id = ? ORDER BY r.posted_at ASC, r.id ASC`,
    [bookingId]
  );
  return rows;
}

async function addAlias(memberName, alias) {
  const a = String(alias || '').trim();
  if (!memberName || !a) return;
  const { rows } = await executeQuery(`SELECT id, aliases FROM \`${T_TEAM}\` WHERE name = ? LIMIT 1`, [memberName]);
  if (!rows[0]) return;
  const list = splitList(rows[0].aliases);
  if (list.some((x) => x.toLowerCase() === a.toLowerCase()) || a.toLowerCase() === memberName.toLowerCase()) return;
  list.push(a);
  await executeQuery(`UPDATE \`${T_TEAM}\` SET aliases = ? WHERE id = ?`, [list.join(', '), rows[0].id]);
}

async function updateBooking(body, user) {
  const id = parseInt(body.id, 10);
  if (!id) throw Object.assign(new Error('Missing booking id'), { statusCode: 400 });
  const sets = [];
  const params = [];
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw Object.assign(new Error('Invalid status'), { statusCode: 400 });
    sets.push('status = ?'); params.push(body.status);
  }
  if (body.pickedUpBy !== undefined) {
    const name = String(body.pickedUpBy || '').trim().slice(0, 150);
    sets.push('picked_up_by = ?', 'pickup_unmatched = 0');
    params.push(name || null);
    if (name) {
      sets.push('assigned_at = COALESCE(assigned_at, NOW())', "status = IF(status = 'PENDING', 'ASSIGNED', status)");
    }
    if (body.rememberAlias) {
      const { rows } = await executeQuery(`SELECT pickup_raw FROM \`${T_BOOKINGS}\` WHERE id = ?`, [id]);
      const raw = String(rows[0]?.pickup_raw || '').split(/\r?\n/)[0].trim();
      if (raw) await addAlias(name, raw.slice(0, 100));
    }
  }
  for (const [key, col] of [['customer', 'customer'], ['phone', 'phone'], ['location', 'location'], ['serviceType', 'service_type'], ['note', 'note']]) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); params.push(String(body[key] ?? '').trim() || null); }
  }
  if (sets.length === 0) return;
  sets.push('updated_by = ?');
  params.push(user?.name || user?.email || null);
  await executeQuery(`UPDATE \`${T_BOOKINGS}\` SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

export async function bookingApiHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.originalUrl || req.url || '/', 'http://localhost');
  const body = req.body || {};
  const action = url.searchParams.get('action') || body.action || 'list';
  const q = Object.fromEntries(url.searchParams.entries());

  try {
    await ensureBookingTables();

    if (req.method === 'GET') {
      if (action === 'list') return res.status(200).json({ ok: true, data: await listBookings(q) });
      if (action === 'replies') return res.status(200).json({ ok: true, data: await listReplies(parseInt(q.id, 10)) });
      if (action === 'team') return res.status(200).json({ ok: true, data: await loadTeam() });
      if (action === 'config') {
        const cfg = await loadConfig();
        const out = { ...cfg, botConfigured: Boolean(getBotToken()), bot: null, webhook: null };
        if (out.botConfigured && isAdmin(req.user)) {
          try { out.bot = await telegramApi('getMe'); } catch (e) { out.botError = e.message; }
          try { out.webhook = await telegramApi('getWebhookInfo'); } catch (e) { out.botError = out.botError || e.message; }
        }
        return res.status(200).json({ ok: true, data: out });
      }
      return res.status(400).json({ ok: false, message: `Unknown action: ${action}` });
    }

    if (req.method === 'POST') {
      if (action === 'update_booking') {
        if (!isAdmin(req.user) && req.user?.canEdit === false) {
          return res.status(403).json({ ok: false, message: 'Forbidden: no edit permission' });
        }
        await updateBooking(body, req.user);
        return res.status(200).json({ ok: true });
      }

      // Everything below changes shared setup: admin only
      if (!isAdmin(req.user)) {
        return res.status(403).json({ ok: false, message: 'Forbidden: Admin privilege required' });
      }

      if (action === 'delete_booking') {
        await executeQuery(`DELETE FROM \`${T_BOOKINGS}\` WHERE id = ?`, [parseInt(body.id, 10)]);
        return res.status(200).json({ ok: true });
      }
      if (action === 'save_team_member') {
        const m = body.member || {};
        const name = String(m.name || '').trim().slice(0, 100);
        if (!name) return res.status(400).json({ ok: false, message: 'Name is required' });
        const aliases = (Array.isArray(m.aliases) ? m.aliases : splitList(m.aliases)).map((a) => String(a).trim()).filter(Boolean).join(', ');
        const values = [name, aliases, String(m.role || 'Driver').slice(0, 50), String(m.phone || '').slice(0, 50) || null, m.active === false ? 0 : 1];
        if (m.id) {
          const { rows: before } = await executeQuery(`SELECT name FROM \`${T_TEAM}\` WHERE id = ?`, [m.id]);
          await executeQuery(`UPDATE \`${T_TEAM}\` SET name = ?, aliases = ?, role = ?, phone = ?, active = ? WHERE id = ?`, [...values, m.id]);
          // Renaming a member keeps their past bookings attached to the new name
          if (before[0] && before[0].name !== name) {
            await executeQuery(`UPDATE \`${T_BOOKINGS}\` SET picked_up_by = ? WHERE picked_up_by = ?`, [name, before[0].name]);
          }
        } else {
          await executeQuery(`INSERT INTO \`${T_TEAM}\` (name, aliases, role, phone, active) VALUES (?, ?, ?, ?, ?)`, values);
        }
        return res.status(200).json({ ok: true, data: await loadTeam() });
      }
      if (action === 'delete_team_member') {
        await executeQuery(`DELETE FROM \`${T_TEAM}\` WHERE id = ?`, [parseInt(body.id, 10)]);
        return res.status(200).json({ ok: true, data: await loadTeam() });
      }
      if (action === 'save_config') {
        const allowedKeys = Object.keys(DEFAULT_CONFIG);
        for (const key of allowedKeys) {
          if (body.config?.[key] === undefined) continue;
          await executeQuery(
            `INSERT INTO \`${T_CONFIG}\` (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
            [key, String(body.config[key] ?? '').trim()]
          );
        }
        return res.status(200).json({ ok: true, data: await loadConfig() });
      }
      if (action === 'set_webhook') {
        const base = String(body.baseUrl || '').trim().replace(/\/+$/, '') || requestOrigin(req);
        if (!/^https:\/\//i.test(base)) {
          return res.status(400).json({ ok: false, message: `Telegram requires a public HTTPS URL (got ${base}). Run this from the deployed site.` });
        }
        const hookUrl = `${base}/api/telegram-booking-webhook`;
        await telegramApi('setWebhook', {
          url: hookUrl,
          secret_token: getWebhookSecret(),
          allowed_updates: ['channel_post', 'edited_channel_post', 'message', 'edited_message'],
          drop_pending_updates: false,
        });
        return res.status(200).json({ ok: true, data: { url: hookUrl } });
      }
      if (action === 'delete_webhook') {
        await telegramApi('deleteWebhook', { drop_pending_updates: false });
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ ok: false, message: `Unknown action: ${action}` });
    }

    return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
  } catch (err) {
    console.error('[telegram-booking] api error:', err?.message);
    return res.status(err.statusCode || 500).json({ ok: false, message: err?.message || 'Server error' });
  }
}
