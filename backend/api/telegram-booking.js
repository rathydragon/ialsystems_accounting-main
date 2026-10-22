/**
 * Telegram "IAL Booking" channel → Hostinger MySQL.
 *
 * - webhookHandler: public endpoint Telegram calls for every new / edited post. Verified by the
 *   X-Telegram-Bot-Api-Secret-Token header. Top-level posts become bookings; replies from the
 *   authorized dispatcher set "Picked up by". Inline queries ("@Bot rin") list team names so the
 *   dispatcher can pick one instead of typing it.
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

// ACCEPTED: the pickup person tapped "ទទួលយក" — they took the job but have not picked up yet
const STATUSES = ['PENDING', 'ASSIGNED', 'ACCEPTED', 'DONE', 'NOT_PICKED', 'CANCELLED'];

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
      // Independent tables: create in parallel so a cold start pays one round trip, not four.
      await Promise.all([
      executeQuery(`
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
      `),
      executeQuery(`
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
      `),
      executeQuery(`
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
      `),
      executeQuery(`
        CREATE TABLE IF NOT EXISTS \`${T_CONFIG}\` (
          \`config_key\` VARCHAR(64) NOT NULL,
          \`config_value\` TEXT,
          PRIMARY KEY (\`config_key\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `),
      ]);
      const seeds = Object.entries(DEFAULT_CONFIG);
      await executeQuery(
        `INSERT IGNORE INTO \`${T_CONFIG}\` (config_key, config_value) VALUES ${seeds.map(() => '(?, ?)').join(', ')}`,
        seeds.flat()
      );
      await migrateReplyThreads();
      await migrateTeamTelegramId();
      await migrateBookingNotify();
      await migrateStatusLog();
    })().catch((err) => {
      tablesReady = null; // retry on next request
      throw err;
    });
  }
  return tablesReady;
}

/**
 * Replies table, thread columns:
 * - root_message_id: the booking post the whole reply chain belongs to. A reply to a reply
 *   (someone answering the dispatcher's "seng") keeps the same root as its parent.
 * - reply_to_author: who the reply answers, shown as "King Sroin → Long Khu".
 * Older rows only had reply_to_message_id, which was always the booking, so it becomes the root.
 */
async function migrateReplyThreads() {
  const { rows } = await executeQuery(
    `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN ('root_message_id', 'reply_to_author')`,
    [T_REPLIES]
  );
  const have = new Set((rows || []).map((r) => r.c));
  if (!have.has('root_message_id')) {
    await executeQuery(
      `ALTER TABLE \`${T_REPLIES}\` ADD COLUMN \`root_message_id\` BIGINT DEFAULT NULL AFTER \`reply_to_message_id\`,
       ADD INDEX \`idx_tg_reply_root\` (\`chat_id\`, \`root_message_id\`)`
    );
  }
  if (!have.has('reply_to_author')) {
    await executeQuery(
      `ALTER TABLE \`${T_REPLIES}\` ADD COLUMN \`reply_to_author\` VARCHAR(150) DEFAULT NULL AFTER \`root_message_id\``
    );
  }
  await executeQuery(
    `UPDATE \`${T_REPLIES}\` SET root_message_id = reply_to_message_id WHERE root_message_id IS NULL`
  );
  // Older thread replies: take "who it answers" from the parent reply row.
  await executeQuery(
    `UPDATE \`${T_REPLIES}\` r JOIN \`${T_REPLIES}\` p ON p.chat_id = r.chat_id AND p.message_id = r.reply_to_message_id
     SET r.reply_to_author = p.author
     WHERE r.reply_to_author IS NULL AND p.author IS NOT NULL`
  );
}

/**
 * Team members' Telegram user_id: lets the name picker post a real mention, shows the team name
 * for messages sent from that account, and lets a driver pick up a booking by replying to it.
 */
async function migrateTeamTelegramId() {
  const { rows } = await executeQuery(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'tg_user_id'`,
    [T_TEAM]
  );
  if (rows.length === 0) {
    await executeQuery(
      `ALTER TABLE \`${T_TEAM}\` ADD COLUMN \`tg_user_id\` BIGINT DEFAULT NULL AFTER \`phone\`,
       ADD UNIQUE KEY \`uq_tg_team_user\` (\`tg_user_id\`)`
    );
  }
}

/**
 * Result of the bot's direct message to the pickup person:
 * notify_status = sent | failed | no_id, notified_to = the name it was for.
 */
async function migrateBookingNotify() {
  // notify_chat_id / notify_message_id: the DM itself, so a reply to it finds its booking
  const wanted = {
    notify_status: 'VARCHAR(20) DEFAULT NULL',
    notify_error: 'VARCHAR(255) DEFAULT NULL',
    notified_to: 'VARCHAR(150) DEFAULT NULL',
    notified_at: 'DATETIME DEFAULT NULL',
    notify_chat_id: 'BIGINT DEFAULT NULL',
    notify_message_id: 'BIGINT DEFAULT NULL',
  };
  const { rows } = await executeQuery(
    `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (?)`,
    [T_BOOKINGS, Object.keys(wanted)]
  );
  const have = new Set((rows || []).map((r) => r.c));
  const missing = Object.entries(wanted).filter(([c]) => !have.has(c));
  if (missing.length) {
    await executeQuery(
      `ALTER TABLE \`${T_BOOKINGS}\` ${missing.map(([c, def]) => `ADD COLUMN \`${c}\` ${def}`).join(', ')}`
    );
  }
}

/* ---- Status from Telegram: "ទទួលយក" → ACCEPTED, "បានយក" → DONE, "មិនបានយក" → NOT_PICKED, "បោះបង់" → CANCELLED ---- */

const ACCEPT_WORDS = ['ទទួលយក', 'accept'];
const DONE_WORDS = ['យកបាន', 'បានយក'];
const NOT_PICKED_WORDS = ['មិនបានយក', 'យកមិនបាន', 'not picked'];
const CANCEL_WORDS = ['បោះបង់', 'cancel'];
const STATUS_LABEL = { ACCEPTED: 'ទទួលយក', DONE: 'រួចរាល់', NOT_PICKED: 'មិនបានយក', CANCELLED: 'បោះបង់' };
const STATUS_ICON = { ACCEPTED: '👍', DONE: '✅', NOT_PICKED: '⚠️', CANCELLED: '❌' };
const STATUS_REASON = { ACCEPTED: 'status_accepted', DONE: 'status_done', NOT_PICKED: 'status_not_picked', CANCELLED: 'status_cancelled' };
const STATUS_RE = 'ACCEPTED|DONE|NOT_PICKED|CANCELLED';

/**
 * Status a reply asks for, or null. "មិនបានយក" is checked first because it is itself a
 * negation; any other negation ("មិនទាន់យកបាន", "not cancel") never counts.
 */
export function statusFromText(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (NOT_PICKED_WORDS.some((w) => t.includes(w))) return 'NOT_PICKED';
  if (/មិន|\bnot\b|\bno\b|\bdon'?t\b/.test(t)) return null;
  if (CANCEL_WORDS.some((w) => t.includes(w))) return 'CANCELLED';
  if (DONE_WORDS.some((w) => t.includes(w))) return 'DONE';
  if (ACCEPT_WORDS.some((w) => t.includes(w))) return 'ACCEPTED';
  return null;
}

/** Only the booking's pickup person (by Telegram id) or an authorized assigner may change its status. */
function canSetStatus(author, booking, team, cfg) {
  if (isAuthorizedAssigner(author, { assignerIds: splitList(cfg.assigner_ids), assignerNames: splitList(cfg.assigner_names) })) return true;
  const member = memberByTgId(team, author.id);
  return Boolean(member && booking?.picked_up_by && member.name === booking.picked_up_by);
}

/* ---------- Status history: when each status was set, by whom and from where ---------- */

const T_STATUS_LOG = 'tbl_tg_booking_status_log';

/** One row per status change; bookings.status_changed_at keeps the latest for the list. */
async function migrateStatusLog() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS \`${T_STATUS_LOG}\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`booking_id\` BIGINT NOT NULL,
      \`status\` VARCHAR(20) NOT NULL,
      \`changed_by\` VARCHAR(150) DEFAULT NULL,
      \`source\` VARCHAR(20) DEFAULT NULL,
      \`changed_at\` DATETIME NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`idx_tg_status_booking\` (\`booking_id\`, \`changed_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const { rows } = await executeQuery(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'status_changed_at'`,
    [T_BOOKINGS]
  );
  if (rows.length === 0) {
    await executeQuery(`ALTER TABLE \`${T_BOOKINGS}\` ADD COLUMN \`status_changed_at\` DATETIME DEFAULT NULL`);
  }
}

/**
 * source: tg_button (DM buttons), tg_dm (typed in the DM), tg_reply (reply in the group), web.
 * Same status again (e.g. a second "បានយក") is not logged twice.
 */
async function logStatusChange(bookingId, status, changedBy, source) {
  const { rows } = await executeQuery(
    `SELECT status FROM \`${T_STATUS_LOG}\` WHERE booking_id = ? ORDER BY changed_at DESC, id DESC LIMIT 1`,
    [bookingId]
  );
  if (rows[0]?.status === status) return;
  const at = new Date();
  await executeQuery(
    `INSERT INTO \`${T_STATUS_LOG}\` (booking_id, status, changed_by, source, changed_at) VALUES (?, ?, ?, ?, ?)`,
    [bookingId, status, changedBy ? String(changedBy).slice(0, 150) : null, source, at]
  );
  await executeQuery(`UPDATE \`${T_BOOKINGS}\` SET status_changed_at = ? WHERE id = ?`, [at, bookingId]);
}

/**
 * Returns false when nothing changed: "ទទួលយក" only moves an open booking forward, so a late tap
 * never turns a finished (DONE / CANCELLED …) booking back into an accepted one.
 */
async function setBookingStatus(bookingId, status, byName, source = 'tg_reply') {
  if (status === 'ACCEPTED') {
    const { rows } = await executeQuery(`SELECT status FROM \`${T_BOOKINGS}\` WHERE id = ? LIMIT 1`, [bookingId]);
    if (!['PENDING', 'ASSIGNED', 'ACCEPTED'].includes(rows[0]?.status)) return false;
  }
  await executeQuery(
    `UPDATE \`${T_BOOKINGS}\` SET status = ?, updated_by = ? WHERE id = ?`,
    [status, byName ? `${byName} (Telegram)`.slice(0, 150) : null, bookingId]
  );
  await logStatusChange(bookingId, status, byName, source);
  return true;
}

async function listStatusLog(bookingId) {
  const { rows } = await executeQuery(
    `SELECT status, changed_by, source, changed_at FROM \`${T_STATUS_LOG}\` WHERE booking_id = ? ORDER BY changed_at ASC, id ASC`,
    [bookingId]
  );
  return rows;
}

// First press only asks ("ask:"), the second confirms ("st:"), so a stray tap changes nothing.
// "ទទួលយក" needs no confirm (it never closes the booking) and turns into a label once accepted.
const statusButtons = (bookingId, accepted = false) => ({
  inline_keyboard: [
    accepted
      ? [{ text: '👍 បានទទួលយកហើយ', callback_data: 'noop' }]
      : [{ text: '👍 ទទួលយក', callback_data: `st:${bookingId}:ACCEPTED` }],
    [
      { text: '✅ យកបាន', callback_data: `ask:${bookingId}:DONE` },
      { text: '⚠️ មិនបានយក', callback_data: `ask:${bookingId}:NOT_PICKED` },
    ],
    [{ text: '❌ បោះបង់', callback_data: `ask:${bookingId}:CANCELLED` }],
  ],
});

const confirmButtons = (bookingId, status) => ({
  inline_keyboard: [
    [{ text: `បញ្ជាក់ ${STATUS_ICON[status]} ${STATUS_LABEL[status]}?`, callback_data: 'noop' }],
    [
      { text: '✔ បញ្ជាក់', callback_data: `st:${bookingId}:${status}` },
      { text: '↩ ត្រឡប់', callback_data: `back:${bookingId}` },
    ],
  ],
});

/** Telegram user ids are positive integers; anything else is rejected. */
export function parseTgUserId(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (!/^\d{3,15}$/.test(s)) return undefined;
  return Number(s);
}

const memberByTgId = (team, id) =>
  id ? team.find((m) => m.tg_user_id && String(m.tg_user_id) === String(id)) : undefined;

/** User id from a "text_mention" in the message (sent by the name picker for members with an id). */
function mentionedUserId(msg) {
  const entities = msg.entities || msg.caption_entities || [];
  const hit = entities.find((e) => e.type === 'text_mention' && e.user?.id);
  return hit ? hit.user.id : null;
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Supergroup/channel ids look like -100XXXXXXXXXX; only those have t.me/c/ message links. */
function messageLink(chatId, messageId) {
  const chat = String(chatId ?? '');
  return chat.startsWith('-100') && messageId ? `https://t.me/c/${chat.slice(4)}/${messageId}` : '';
}

export function buildPickupMessage(b) {
  const lines = [`🚚 <b>Pick up សម្រាប់ ${escapeHtml(b.picked_up_by)}</b>`];
  if (b.customer) lines.push(`👤 ${escapeHtml(b.customer)}`);
  if (b.phone) lines.push(`📞 ${escapeHtml(b.phone)}`);
  if (b.location) lines.push(`📍 ${escapeHtml(b.location)}`);
  if (b.map_url) lines.push(`🗺 ${escapeHtml(b.map_url)}`);
  if (b.text) lines.push('', `<i>${escapeHtml(String(b.text).slice(0, 800))}</i>`);
  const link = messageLink(b.chat_id, b.message_id);
  if (link) lines.push('', `🔗 <a href="${link}">មើលសារដើម #${b.message_id}</a>`);
  if (b.assigned_by) lines.push(`Assign ដោយ ${escapeHtml(b.assigned_by)}`);
  return lines.join('\n');
}

/** Telegram's reply when the person never pressed Start on the bot (bots cannot message first). */
const needsStart = (msg) => /chat not found|can't initiate|bot was blocked|user is deactivated/i.test(String(msg || ''));

/**
 * Send the booking to the pickup person's Telegram by direct message and record the result.
 * Only members with a Telegram user id can be reached; the person must have pressed Start once.
 */
export async function notifyPickup(bookingId) {
  const { rows } = await executeQuery(`SELECT * FROM \`${T_BOOKINGS}\` WHERE id = ? LIMIT 1`, [bookingId]);
  const b = rows[0];
  if (!b || !b.picked_up_by) return null;
  const member = (await loadTeam()).find((m) => m.name === b.picked_up_by);
  let status;
  let error = null;
  let sent = null;
  if (!member?.tg_user_id) {
    status = 'no_id';
  } else {
    try {
      sent = await telegramApi('sendMessage', {
        chat_id: member.tg_user_id,
        text: `${buildPickupMessage(b)}\n\nចុច "👍 ទទួលយក" ដើម្បីទទួលការ Assign\nពេលរួច ចុចប៊ូតុងខាងក្រោម ឬ Reply "បានយក" / "មិនបានយក" / "បោះបង់"`,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: statusButtons(b.id),
      }, 8000);
      status = 'sent';
    } catch (err) {
      status = 'failed';
      error = needsStart(err?.message) ? 'need_start' : String(err?.message || err).slice(0, 255);
    }
  }
  await executeQuery(
    `UPDATE \`${T_BOOKINGS}\`
     SET notify_status = ?, notify_error = ?, notified_to = ?, notified_at = ?, notify_chat_id = ?, notify_message_id = ?
     WHERE id = ?`,
    // Time from Node, not MySQL NOW(): the DB clock is UTC but the app reads DATETIMEs as +07:00
    [status, error, b.picked_up_by, new Date(), sent?.chat?.id ?? null, sent?.message_id ?? null, b.id]
  );
  return { status, error, to: b.picked_up_by };
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

async function insertReply(msg, { rootId, accepted, reason }) {
  const author = messageAuthor(msg);
  const parentAuthor = messageAuthor(msg.reply_to_message);
  await executeQuery(
    `INSERT INTO \`${T_REPLIES}\`
      (chat_id, message_id, reply_to_message_id, root_message_id, reply_to_author, author, author_id, text, accepted, reason, posted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE text = VALUES(text), accepted = VALUES(accepted), reason = VALUES(reason)`,
    [msg.chat.id, msg.message_id, msg.reply_to_message.message_id, rootId,
      (parentAuthor.name || '').slice(0, 150) || null, author.name || null, author.id, messageText(msg),
      accepted ? 1 : 0, reason, tgDate(msg.date)]
  );
}

async function handleReply(msg, cfg) {
  const chatId = msg.chat.id;
  const targetId = msg.reply_to_message.message_id;
  const author = messageAuthor(msg);
  const text = messageText(msg);

  // Reply to a reply (e.g. a question to the dispatcher about their "seng"): file it under the same
  // booking as its parent. It never changes "Picked up by"; only direct replies to the post do.
  const { rows: parents } = await executeQuery(
    `SELECT COALESCE(root_message_id, reply_to_message_id) AS root FROM \`${T_REPLIES}\`
     WHERE chat_id = ? AND message_id = ? LIMIT 1`,
    [chatId, targetId]
  );
  if (parents[0]) {
    // e.g. the driver answers the dispatcher's "VIN SAVITH" with "បានយក": status only, never the pickup
    let reason = 'thread';
    const wanted = statusFromText(text);
    if (wanted) {
      const { rows } = await executeQuery(
        `SELECT id, picked_up_by FROM \`${T_BOOKINGS}\` WHERE chat_id = ? AND message_id = ? LIMIT 1`,
        [chatId, parents[0].root]
      );
      if (rows[0] && canSetStatus(author, rows[0], await loadTeam(), cfg)
        && (await setBookingStatus(rows[0].id, wanted, author.name))) {
        reason = STATUS_REASON[wanted];
      }
    }
    await insertReply(msg, { rootId: parents[0].root, accepted: reason !== 'thread', reason });
    return { type: 'reply', reason };
  }

  const allowed = isAuthorizedAssigner(author, {
    assignerIds: splitList(cfg.assigner_ids),
    assignerNames: splitList(cfg.assigner_names),
  });

  const findTarget = () => executeQuery(
    `SELECT id, assign_message_id, picked_up_by FROM \`${T_BOOKINGS}\` WHERE chat_id = ? AND message_id = ? LIMIT 1`,
    [chatId, targetId]
  );
  let target = (await findTarget()).rows[0];

  // Reply to a post the bot never saw (posted before the bot joined): create it from the quoted copy.
  if (!target && msg.reply_to_message.chat?.id === chatId && !msg.reply_to_message.reply_to_message) {
    await upsertBooking(msg.reply_to_message, false);
    target = (await findTarget()).rows[0];
  }

  // A newer reply wins; an edit to an older reply must not undo a later reassignment.
  const isOlder = target?.assign_message_id && Number(target.assign_message_id) > Number(msg.message_id);
  const team = target ? await loadTeam() : [];
  const assign = async (name, unmatched) => {
    await executeQuery(
      `UPDATE \`${T_BOOKINGS}\`
       SET picked_up_by = ?, pickup_raw = ?, pickup_unmatched = ?, assigned_by = ?, assigned_at = ?,
           assign_message_id = ?, status = IF(status IN ('PENDING', 'ASSIGNED', 'ACCEPTED'), 'ASSIGNED', status)
       WHERE id = ?`,
      [name.slice(0, 150), text.slice(0, 255), unmatched ? 1 : 0, author.name || String(author.id || ''),
        tgDate(msg.date), msg.message_id, target.id]
    );
    // DM the pickup person, once per new name (an edited reply naming the same person sends nothing)
    if (!unmatched && name !== target.picked_up_by) await notifyPickup(target.id);
  };

  let reason;
  const wantedStatus = target ? statusFromText(text) : null;
  if (!target) {
    reason = 'booking_not_found';
  } else if (wantedStatus && canSetStatus(author, target, team, cfg)) {
    // "បានយក" / "បោះបង់" from the pickup person or the dispatcher: a status, not a pickup name
    reason = (await setBookingStatus(target.id, wantedStatus, author.name)) ? STATUS_REASON[wantedStatus] : 'closed';
  } else if (allowed) {
    if (isOlder) {
      reason = 'superseded';
    } else {
      // A mention from the name picker names the member by Telegram id; otherwise match the text.
      const mentioned = memberByTgId(team, mentionedUserId(msg));
      const match = mentioned ? { name: mentioned.name, matched: true } : matchTeamMember(text, team);
      await assign(match.name, !match.matched);
      reason = 'assigned';
    }
  } else {
    // A team member replying to a booking nobody has taken yet picks it up themselves.
    const self = memberByTgId(team.filter((m) => m.active), author.id);
    if (self && !target.picked_up_by && !isOlder) {
      await assign(self.name, false);
      reason = 'self_assigned';
    } else {
      reason = 'not_authorized';
    }
  }

  await insertReply(msg, { rootId: targetId, accepted: ['assigned', 'self_assigned', ...Object.values(STATUS_REASON)].includes(reason), reason });
  return { type: 'reply', reason };
}

const MEMBER_STATUSES = ['creator', 'administrator', 'member'];
const memberCache = new Map(); // `${chatId}:${userId}` → { ok, at }
const MEMBER_CACHE_MS = 10 * 60 * 1000;

/** Inline queries come from any Telegram user, so only members of the booking chat get the team list. */
async function isChatMember(chatId, userId) {
  const key = `${chatId}:${userId}`;
  const hit = memberCache.get(key);
  if (hit && Date.now() - hit.at < MEMBER_CACHE_MS) return hit.ok;
  let ok = false;
  try {
    const m = await telegramApi('getChatMember', { chat_id: chatId, user_id: userId });
    ok = MEMBER_STATUSES.includes(m?.status) || (m?.status === 'restricted' && m?.is_member === true);
  } catch {
    ok = false;
  }
  memberCache.set(key, { ok, at: Date.now() });
  return ok;
}

const foldName = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** "@Bot rin" in the chat → pick a team member's name to post as the reply. */
async function handleInlineQuery(q) {
  const answer = (results, cacheTime) => ({
    type: 'inline_query',
    reply: {
      method: 'answerInlineQuery',
      inline_query_id: q.id,
      results,
      cache_time: cacheTime,
      is_personal: true,
    },
  });

  await ensureBookingTables();
  const cfg = await loadConfig();
  const chatId = String(cfg.chat_id || '').trim();
  if (!chatId || !q.from?.id || !(await isChatMember(chatId, q.from.id))) return answer([], 60);

  const term = foldName(q.query);
  const team = (await loadTeam()).filter((m) => m.active);
  const hits = term
    ? team.filter((m) => [m.name, ...m.aliases].some((n) => foldName(n).includes(term)))
    : team;

  const results = hits.slice(0, 50).map((m) => ({
    type: 'article',
    id: String(m.id),
    title: m.name,
    description: [m.role, m.phone].filter(Boolean).join(' · ') || undefined,
    // With a Telegram id the name becomes a mention: tappable, and that person gets notified
    input_message_content: m.tg_user_id
      ? { message_text: `<a href="tg://user?id=${m.tg_user_id}">${escapeHtml(m.name)}</a>`, parse_mode: 'HTML' }
      : { message_text: m.name },
  }));
  return answer(results, 5);
}

const dmReply = (chatId, text, replyTo) => ({
  method: 'sendMessage', chat_id: chatId, text, ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {}),
});

/** Booking whose pickup DM is this message in this private chat. */
async function bookingForDm(chatId, messageId) {
  const { rows } = await executeQuery(
    `SELECT id, message_id, picked_up_by, status FROM \`${T_BOOKINGS}\` WHERE notify_chat_id = ? AND notify_message_id = ? LIMIT 1`,
    [chatId, messageId]
  );
  return rows[0];
}

/** The pickup person replies "បានយក" / "បោះបង់" to the bot's DM. */
async function handleDmReply(msg) {
  await ensureBookingTables();
  const booking = await bookingForDm(msg.chat.id, msg.reply_to_message.message_id);
  // Reply to some other message (e.g. the /start answer): treat it like a plain message
  if (!booking) return handleDmPlain(msg);
  const wanted = statusFromText(messageText(msg));
  const author = messageAuthor(msg);
  if (!wanted) {
    return { type: 'dm', reason: 'no_status', reply: dmReply(msg.chat.id, 'សូម Reply "បានយក" / "មិនបានយក" / "បោះបង់" ឬចុចប៊ូតុងខាងលើ', msg.message_id) };
  }
  if (!canSetStatus(author, booking, await loadTeam(), await loadConfig())) {
    return { type: 'dm', reason: 'not_authorized', reply: dmReply(msg.chat.id, 'Booking នេះលែងជារបស់អ្នកហើយ', msg.message_id) };
  }
  if (!(await setBookingStatus(booking.id, wanted, author.name, 'tg_dm'))) {
    return { type: 'dm', reason: 'closed', reply: dmReply(msg.chat.id, `Booking #${booking.message_id} បានបិទរួចហើយ`, msg.message_id) };
  }
  return {
    type: 'dm',
    reason: STATUS_REASON[wanted],
    reply: dmReply(msg.chat.id, `✅ Booking #${booking.message_id}: ${STATUS_LABEL[wanted]}`, msg.message_id),
  };
}

/**
 * "បានយក" typed as a new message (not a Reply) in the private chat: apply it when the sender has
 * exactly one open pickup; with several, ask them to reply to the right DM. Always answer, so the
 * driver never wonders whether the bot got it.
 */
async function handleDmPlain(msg) {
  const text = messageText(msg);
  if (!text) return { type: 'ignored', reason: 'private_chat' };
  await ensureBookingTables();
  const member = memberByTgId((await loadTeam()).filter((m) => m.active), msg.from?.id);
  const wanted = statusFromText(text);
  if (!member) {
    return { type: 'dm', reason: 'not_member', reply: dmReply(msg.chat.id, `អ្នកមិនទាន់នៅក្នុងក្រុមការងារទេ។ Telegram user_id របស់អ្នក: ${msg.from?.id}`) };
  }
  if (!wanted) {
    return { type: 'dm', reason: 'no_status', reply: dmReply(msg.chat.id, 'សូម Reply លើសារ Pick up ថា "បានយក" / "មិនបានយក" / "បោះបង់" ឬចុចប៊ូតុងក្រោមសារនោះ', msg.message_id) };
  }
  const { rows: open } = await executeQuery(
    `SELECT id, message_id, customer FROM \`${T_BOOKINGS}\`
     WHERE picked_up_by = ? AND status IN ('ASSIGNED', 'ACCEPTED') ORDER BY assigned_at DESC, id DESC LIMIT 10`,
    [member.name]
  );
  if (open.length === 0) {
    return { type: 'dm', reason: 'no_open_booking', reply: dmReply(msg.chat.id, 'អ្នកមិនមាន Booking ដែលកំពុងរង់ចាំទេ', msg.message_id) };
  }
  if (open.length > 1) {
    const list = open.map((b) => `• #${b.message_id}${b.customer ? ` ${b.customer}` : ''}`).join('\n');
    return {
      type: 'dm',
      reason: 'ambiguous',
      reply: dmReply(msg.chat.id, `អ្នកមាន Booking ${open.length} កំពុងរង់ចាំ៖\n${list}\n\nសូម Reply លើសារ Pick up នីមួយៗ ឬចុចប៊ូតុងក្រោមសារនោះ`, msg.message_id),
    };
  }
  await setBookingStatus(open[0].id, wanted, messageAuthor(msg).name, 'tg_dm');
  return {
    type: 'dm',
    reason: STATUS_REASON[wanted],
    reply: dmReply(msg.chat.id, `✅ Booking #${open[0].message_id}: ${STATUS_LABEL[wanted]}`, msg.message_id),
  };
}

/** "✅ យកបាន" / "❌ បោះបង់" buttons under the pickup DM. */
async function handleStatusButton(cq) {
  const answer = (text) => ({ type: 'callback', reply: { method: 'answerCallbackQuery', callback_query_id: cq.id, text } });
  const m = new RegExp(`^(ask|st|back):(\\d+)(?::(${STATUS_RE}))?$`).exec(String(cq.data || ''));
  if (!m || (m[1] !== 'back' && !m[3])) return answer('');
  await ensureBookingTables();
  const [, step, idStr, wanted] = m;
  const { rows } = await executeQuery(`SELECT id, message_id, picked_up_by, status FROM \`${T_BOOKINGS}\` WHERE id = ? LIMIT 1`, [Number(idStr)]);
  const booking = rows[0];
  if (!booking) return answer('រក Booking មិនឃើញ');
  const author = { id: cq.from?.id ?? null, name: [cq.from?.first_name, cq.from?.last_name].filter(Boolean).join(' ') };
  if (!canSetStatus(author, booking, await loadTeam(), await loadConfig())) return answer('Booking នេះលែងជារបស់អ្នកហើយ');

  const setButtons = (reply_markup) => (cq.message?.chat?.id && cq.message?.message_id
    ? telegramApi('editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup }, 5000).catch(() => {})
    : null);

  if (step === 'ask') {
    await setButtons(confirmButtons(booking.id, wanted));
    return answer('សូមចុច ✔ បញ្ជាក់');
  }
  if (step === 'back') {
    await setButtons(statusButtons(booking.id, booking.status === 'ACCEPTED'));
    return answer('');
  }
  if (!(await setBookingStatus(booking.id, wanted, author.name, 'tg_button'))) {
    // Already finished: say so in a popup (a short toast is easy to miss) and show the real status
    const closed = STATUS_LABEL[booking.status] ? `${STATUS_ICON[booking.status]} ${STATUS_LABEL[booking.status]}` : booking.status;
    await setButtons({ inline_keyboard: [[{ text: closed, callback_data: 'noop' }]] });
    const res = answer(`Booking #${booking.message_id} បានបិទរួចហើយ (${closed})។ មិនអាចទទួលយកបានទៀតទេ។`);
    res.reply.show_alert = true;
    return res;
  }
  if (wanted === 'ACCEPTED') {
    // Still open: keep "យកបាន / មិនបានយក / បោះបង់" for later
    await setButtons(statusButtons(booking.id, true));
    return answer('បានទទួលយក ✓');
  }
  // Swap the buttons for the result, so the DM shows what was chosen
  await setButtons({ inline_keyboard: [[{ text: `${STATUS_ICON[wanted]} ${STATUS_LABEL[wanted]}`, callback_data: 'noop' }]] });
  return answer(`${STATUS_LABEL[wanted]} ✓`);
}

/** Processes one Telegram update. Exported for tests. */
export async function processUpdate(update) {
  if (update?.inline_query) return handleInlineQuery(update.inline_query);
  if (update?.callback_query) return handleStatusButton(update.callback_query);
  const { msg, edited } = extractMessage(update);
  if (!msg || !msg.chat) return { type: 'ignored', reason: 'no_message' };
  if (msg.from?.is_bot) return { type: 'ignored', reason: 'bot' };
  if (msg.chat.type === 'private') {
    // Pressing Start lets the bot DM this person later; tell them their id for the team list
    if (/^\/start\b/.test(messageText(msg)) && msg.from?.id) {
      return {
        type: 'start',
        reply: {
          method: 'sendMessage',
          chat_id: msg.chat.id,
          parse_mode: 'HTML',
          text: `សួស្តី ${escapeHtml(msg.from.first_name || '')}! ✅\nBot អាចផ្ញើ Pick up មកអ្នកបានហើយ។\n\nTelegram user_id របស់អ្នក: <code>${msg.from.id}</code>\n(ផ្ញើលេខនេះទៅ Admin ដើម្បីដាក់ក្នុងក្រុមការងារ)`,
        },
      };
    }
    if (msg.reply_to_message) return handleDmReply(msg);
    return handleDmPlain(msg);
  }

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
    // Telegram runs a Bot API method returned in the webhook response, saving a round trip.
    if (result.reply) return res.status(200).json(result.reply);
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

async function telegramApi(method, payload, timeoutMs = 10000) {
  const token = getBotToken();
  if (!token) throw new Error('TELEGRAM_BOOKING_BOT_TOKEN is not configured on the server.');
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
    signal: AbortSignal.timeout(timeoutMs),
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
  // author_member: team name for the Telegram account that posted (via the member's tg_user_id)
  const { rows } = await executeQuery(
    `SELECT b.*, t.name AS author_member FROM (
       SELECT * FROM \`${T_BOOKINGS}\` ${whereSql} ORDER BY posted_at DESC, id DESC LIMIT ${limit}
     ) b
     LEFT JOIN \`${T_TEAM}\` t ON t.tg_user_id = b.author_id
     ORDER BY b.posted_at DESC, b.id DESC`,
    params
  );
  return rows;
}

/** Telegram accounts seen in the chat (newest name first), to fill in a team member's user id. */
async function listTelegramAccounts() {
  const { rows } = await executeQuery(
    `SELECT a.author_id, a.author, a.last_at, t.name AS member FROM (
       SELECT author_id, SUBSTRING_INDEX(GROUP_CONCAT(author ORDER BY posted_at DESC SEPARATOR '\\n'), '\\n', 1) AS author,
              MAX(posted_at) AS last_at
       FROM (
         SELECT author_id, author, posted_at FROM \`${T_BOOKINGS}\` WHERE author_id IS NOT NULL
         UNION ALL
         SELECT author_id, author, posted_at FROM \`${T_REPLIES}\` WHERE author_id IS NOT NULL
       ) x GROUP BY author_id
     ) a
     LEFT JOIN \`${T_TEAM}\` t ON t.tg_user_id = a.author_id
     ORDER BY a.last_at DESC`
  );
  return rows;
}

/** Cheap fingerprint of the booking data so the page can poll often and reload only on change. */
async function dataVersion() {
  // One round trip instead of three: each trip to Hostinger costs network latency.
  const { rows: [v] } = await executeQuery(
    `SELECT
       (SELECT COUNT(*) FROM \`${T_BOOKINGS}\`) AS b_n,
       (SELECT MAX(id) FROM \`${T_BOOKINGS}\`) AS b_max,
       (SELECT MAX(updated_at) FROM \`${T_BOOKINGS}\`) AS b_upd,
       (SELECT MAX(id) FROM \`${T_REPLIES}\`) AS r_max,
       (SELECT COUNT(*) FROM \`${T_TEAM}\`) AS t_n,
       (SELECT MAX(id) FROM \`${T_TEAM}\`) AS t_max,
       (SELECT COALESCE(SUM(tg_user_id), 0) FROM \`${T_TEAM}\`) AS t_tg`
  );
  const updated = v?.b_upd ? new Date(v.b_upd).getTime() : 0;
  return [v?.b_n, v?.b_max, updated, v?.r_max, v?.t_n, v?.t_max, v?.t_tg].map((x) => x ?? 0).join(':');
}

// Bot identity almost never changes; cache it so the Settings tab doesn't wait on Telegram each time.
const BOT_INFO_CACHE_MS = 10 * 60 * 1000;
let botInfoCache = null; // { token, bot, at }
async function getBotInfo() {
  const token = getBotToken();
  if (botInfoCache && botInfoCache.token === token && Date.now() - botInfoCache.at < BOT_INFO_CACHE_MS) {
    return botInfoCache.bot;
  }
  const bot = await telegramApi('getMe', {}, 5000);
  botInfoCache = { token, bot, at: Date.now() };
  return bot;
}

async function listReplies(bookingId) {
  const { rows } = await executeQuery(
    `SELECT r.*, t.name AS author_member FROM \`${T_REPLIES}\` r
     JOIN \`${T_BOOKINGS}\` b ON b.chat_id = r.chat_id AND b.message_id = r.root_message_id
     LEFT JOIN \`${T_TEAM}\` t ON t.tg_user_id = r.author_id
     WHERE b.id = ? ORDER BY r.posted_at ASC, r.id ASC`,
    [bookingId]
  );
  return rows;
}

/**
 * Bookings whose pickup is not a current team name (flagged unknown, or a name typed before the
 * member or alias existed): match the original reply / stored name against the team again and
 * switch to the real name. No DM is sent for these older bookings.
 */
export async function rematchUnknownPickups() {
  const team = (await loadTeam()).filter((m) => m.active);
  if (team.length === 0) return 0;
  const { rows } = await executeQuery(
    `SELECT id, picked_up_by, pickup_raw FROM \`${T_BOOKINGS}\`
     WHERE picked_up_by IS NOT NULL AND picked_up_by <> ''
       AND (pickup_unmatched = 1 OR picked_up_by NOT IN (?))`,
    [team.map((m) => m.name)]
  );
  let fixed = 0;
  for (const b of rows) {
    const match = [b.pickup_raw, b.picked_up_by]
      .map((t) => (t ? matchTeamMember(t, team) : null))
      .find((m) => m?.matched);
    if (!match) continue;
    await executeQuery(
      `UPDATE \`${T_BOOKINGS}\` SET picked_up_by = ?, pickup_unmatched = 0 WHERE id = ?`,
      [match.name, b.id]
    );
    fixed += 1;
  }
  return fixed;
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
  let notify = false;
  if (body.pickedUpBy !== undefined) {
    const name = String(body.pickedUpBy || '').trim().slice(0, 150);
    const { rows: prev } = await executeQuery(`SELECT picked_up_by FROM \`${T_BOOKINGS}\` WHERE id = ?`, [id]);
    notify = Boolean(name) && name !== (prev[0]?.picked_up_by || '');
    sets.push('picked_up_by = ?', 'pickup_unmatched = 0');
    params.push(name || null);
    // Cleared pickup: forget the old DM result
    if (!name) sets.push('notify_status = NULL', 'notify_error = NULL', 'notified_to = NULL', 'notified_at = NULL');
    if (name) {
      // A new person has not accepted yet: an accepted booking goes back to ASSIGNED
      const fromStatuses = notify ? "('PENDING', 'ACCEPTED')" : "('PENDING')";
      sets.push('assigned_at = COALESCE(assigned_at, ?)', `status = IF(status IN ${fromStatuses}, 'ASSIGNED', status)`);
      params.push(new Date());
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
  if (sets.length === 0) return null;
  sets.push('updated_by = ?');
  params.push(user?.name || user?.email || null);
  await executeQuery(`UPDATE \`${T_BOOKINGS}\` SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  if (body.status !== undefined) await logStatusChange(id, body.status, user?.name || user?.email, 'web');
  // Picked in the app: DM the new pickup person as well
  return notify ? notifyPickup(id) : null;
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
      if (action === 'version') return res.status(200).json({ ok: true, data: { version: await dataVersion() } });
      if (action === 'replies') return res.status(200).json({ ok: true, data: await listReplies(parseInt(q.id, 10)) });
      if (action === 'team') return res.status(200).json({ ok: true, data: await loadTeam() });
      if (action === 'tg_accounts') return res.status(200).json({ ok: true, data: await listTelegramAccounts() });
      if (action === 'status_log') return res.status(200).json({ ok: true, data: await listStatusLog(parseInt(q.id, 10)) });
      if (action === 'config') {
        const withBot = Boolean(getBotToken()) && isAdmin(req.user);
        // DB read and both Telegram calls run in parallel instead of one after another.
        const [cfg, botRes, hookRes] = await Promise.all([
          loadConfig(),
          withBot ? getBotInfo().then((v) => ({ v }), (e) => ({ e })) : null,
          withBot ? telegramApi('getWebhookInfo', {}, 5000).then((v) => ({ v }), (e) => ({ e })) : null,
        ]);
        const out = { ...cfg, botConfigured: Boolean(getBotToken()), bot: botRes?.v || null, webhook: hookRes?.v || null };
        const botError = botRes?.e?.message || hookRes?.e?.message;
        if (botError) out.botError = botError;
        return res.status(200).json({ ok: true, data: out });
      }
      return res.status(400).json({ ok: false, message: `Unknown action: ${action}` });
    }

    if (req.method === 'POST') {
      if (action === 'update_booking') {
        if (!isAdmin(req.user)) {
          return res.status(403).json({ ok: false, message: 'Forbidden: Admin privilege required' });
        }
        const notify = await updateBooking(body, req.user);
        return res.status(200).json({ ok: true, data: { notify } });
      }
      if (action === 'notify_pickup') {
        if (!isAdmin(req.user)) {
          return res.status(403).json({ ok: false, message: 'Forbidden: Admin privilege required' });
        }
        return res.status(200).json({ ok: true, data: { notify: await notifyPickup(parseInt(body.id, 10)) } });
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
        const tgUserId = parseTgUserId(m.tg_user_id);
        if (tgUserId === undefined) {
          return res.status(400).json({ ok: false, message: 'Telegram user_id ត្រូវតែជាលេខ' });
        }
        const values = [name, aliases, String(m.role || 'Driver').slice(0, 50), String(m.phone || '').slice(0, 50) || null, tgUserId, m.active === false ? 0 : 1];
        try {
          if (m.id) {
            const { rows: before } = await executeQuery(`SELECT name FROM \`${T_TEAM}\` WHERE id = ?`, [m.id]);
            await executeQuery(`UPDATE \`${T_TEAM}\` SET name = ?, aliases = ?, role = ?, phone = ?, tg_user_id = ?, active = ? WHERE id = ?`, [...values, m.id]);
            // Renaming a member keeps their past bookings attached to the new name
            if (before[0] && before[0].name !== name) {
              await executeQuery(`UPDATE \`${T_BOOKINGS}\` SET picked_up_by = ? WHERE picked_up_by = ?`, [name, before[0].name]);
            }
          } else {
            await executeQuery(`INSERT INTO \`${T_TEAM}\` (name, aliases, role, phone, tg_user_id, active) VALUES (?, ?, ?, ?, ?, ?)`, values);
          }
        } catch (err) {
          if (err?.code === 'ER_DUP_ENTRY') {
            const { rows: owner } = await executeQuery(`SELECT name FROM \`${T_TEAM}\` WHERE tg_user_id = ? OR name = ? LIMIT 1`, [tgUserId, name]);
            return res.status(409).json({ ok: false, message: `ឈ្មោះ ឬ Telegram user_id នេះមានរួចហើយ (${owner[0]?.name || '?'})` });
          }
          throw err;
        }
        // New aliases also fix older bookings that still show the unknown name ("Srorn" → KING SRON)
        const rematched = await rematchUnknownPickups();
        return res.status(200).json({ ok: true, data: await loadTeam(), rematched });
      }
      if (action === 'import_team') {
        const seen = new Set();
        const members = (Array.isArray(body.members) ? body.members : [])
          .map((m) => ({
            name: String(m?.name || '').replace(/\s+/g, ' ').trim().slice(0, 100),
            role: String(m?.role || 'Driver').slice(0, 50),
            phone: String(m?.phone || '').trim().slice(0, 50) || null,
          }))
          .filter((m) => m.name && !seen.has(m.name.toLowerCase()) && seen.add(m.name.toLowerCase()))
          .slice(0, 500);
        let inserted = 0;
        if (members.length) {
          // INSERT IGNORE skips names already in the team (unique key on name).
          const { rows: result } = await executeQuery(
            `INSERT IGNORE INTO \`${T_TEAM}\` (name, aliases, role, phone, active) VALUES ${members.map(() => "(?, '', ?, ?, 1)").join(', ')}`,
            members.flatMap((m) => [m.name, m.role, m.phone])
          );
          inserted = Number(result?.affectedRows) || 0;
        }
        await rematchUnknownPickups();
        return res.status(200).json({ ok: true, data: { inserted, team: await loadTeam() } });
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
          allowed_updates: ['channel_post', 'edited_channel_post', 'message', 'edited_message', 'inline_query', 'callback_query'],
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
