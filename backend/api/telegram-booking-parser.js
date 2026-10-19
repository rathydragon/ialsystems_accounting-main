/**
 * Telegram "IAL Booking" message parsing (pure functions, no I/O).
 *
 * Booking posts are free text written by staff, e.g.
 *   "Amrurice HQ has shipment Overseas 0963725526"
 *   "098395013 has shipment need moto at May Bank Toul Kork"
 *   "+855 99 777 698 SafetyNet has shipment local"
 * Replies from the dispatcher name who picks the job up, e.g. "rin driver", "Sna".
 */

// Cambodian phone numbers: +855 / 855 / 0 prefix, 8–9 digits after, optional spaces or dashes
const PHONE_RE = /(?:\+?855[\s-]?|\b0)(?:\d[\s-]?){7,8}\d\b/g;
const MAP_URL_RE = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\S*/i;
const ANY_URL_RE = /https?:\/\/\S+/gi;

const SERVICE_KEYWORDS = [
  { type: 'Tuktuk', re: /tuk\s*-?\s*tuk|រ៉ឺម៉ក|រុឺម៉ក|កង់បី/i },
  { type: 'Moto', re: /\bmoto\b|motor\s*bike|ម៉ូតូ/i },
  { type: 'Truck', re: /\btruck\b|ឡានធំ/i },
  { type: 'Car', re: /\bcar\b|\bvan\b|ឡាន/i },
  { type: 'DHL', re: /\bdhl\b/i },
  { type: 'Overseas', re: /over\s*seas?|អន្តរជាតិ/i },
  { type: 'Local', re: /\blocal\b|ក្នុងស្រុក/i },
];

/** Normalizes a Cambodian phone number to local "0XXXXXXXX" form. */
export function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('855')) digits = `0${digits.slice(3)}`;
  if (!digits.startsWith('0')) digits = `0${digits}`;
  return digits;
}

export function extractPhones(text) {
  const found = String(text || '').match(PHONE_RE) || [];
  return [...new Set(found.map(normalizePhone).filter((p) => p.length >= 9 && p.length <= 10))];
}

export function detectServiceType(text) {
  const t = String(text || '');
  const hit = SERVICE_KEYWORDS.find((k) => k.re.test(t));
  return hit ? hit.type : '';
}

function collapse(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/**
 * Splits a booking post into customer / phone / service / location fields.
 * Anything it cannot recognise stays only in the original text, which is always kept.
 */
export function parseBookingText(text) {
  const raw = String(text || '');
  const mapUrl = (raw.match(MAP_URL_RE) || [''])[0];
  const phones = extractPhones(raw);
  const serviceType = detectServiceType(raw);

  // Strip URLs and phone numbers so they do not leak into customer / location
  const clean = collapse(raw.replace(ANY_URL_RE, ' ').replace(PHONE_RE, ' ').replace(/[,;]+/g, ' '));

  let customer = '';
  const hasShipment = clean.match(/^(.*?)\b(?:has|have|had)\s+(?:a\s+)?(?:shipments?|sh\b|parcels?|items?|goods)/i);
  if (hasShipment) {
    customer = collapse(hasShipment[1]).replace(/^(from|by)\s+/i, '');
  } else {
    const needMatch = clean.match(/^(.*?)\bneed\b/i);
    if (needMatch) customer = collapse(needMatch[1]);
  }
  if (customer.length > 120) customer = '';

  let location = '';
  const locMatch = clean.match(/\b(?:at|near|in front of|location|loc)\b[:\s]+(.+)$/i);
  if (locMatch) {
    location = collapse(locMatch[0]).replace(/^at\s+/i, '');
  } else {
    const kmMatch = clean.match(/(?:^|\s)(នៅ\S*.*)$/);
    if (kmMatch) location = collapse(kmMatch[1]);
  }
  if (location.length > 255) location = location.slice(0, 255);

  return {
    customer,
    phone: phones.join(', '),
    serviceType,
    location,
    mapUrl,
  };
}

/** Lower-cases and strips decoration so "Rin Driver!" and "rin" compare equal. */
export function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/@\w+/g, ' ')
    .replace(/\b(driver|drivers|rider|moto|tuktuk|tuk tuk|car|pick\s*up|pickup|by|ok|go|bong|bro)\b/g, ' ')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves a reply such as "rin driver" to a team member.
 * team: [{ name, aliases: string[] | comma-separated string, active }]
 * Returns { name, matched } — when unmatched, name is the cleaned reply text so it is still visible.
 */
export function matchTeamMember(replyText, team = []) {
  const firstLine = String(replyText || '').split(/\r?\n/)[0];
  const norm = normalizeName(firstLine);
  if (!norm) return { name: collapse(firstLine), matched: false };

  const candidates = [];
  for (const m of team) {
    if (m.active === false || m.active === 0) continue;
    const aliasList = Array.isArray(m.aliases) ? m.aliases : String(m.aliases || '').split(',');
    for (const a of [m.name, ...aliasList]) {
      const na = normalizeName(a);
      if (na) candidates.push({ key: na, name: m.name });
    }
  }

  const exact = candidates.find((c) => c.key === norm);
  if (exact) return { name: exact.name, matched: true };

  // Whole-word match inside a longer reply ("ok rin take it"); prefer the longest alias
  const words = ` ${norm} `;
  const partial = candidates
    .filter((c) => words.includes(` ${c.key} `))
    .sort((a, b) => b.key.length - a.key.length)[0];
  if (partial) return { name: partial.name, matched: true };

  const pretty = collapse(firstLine.replace(/\b(driver|rider)\b/gi, ' '));
  return { name: pretty ? pretty.charAt(0).toUpperCase() + pretty.slice(1) : collapse(firstLine), matched: false };
}

/** Pulls the message out of any update type the bot can receive. */
export function extractMessage(update) {
  if (!update || typeof update !== 'object') return { msg: null, edited: false };
  const msg = update.channel_post || update.message || update.edited_channel_post || update.edited_message || null;
  const edited = Boolean(update.edited_channel_post || update.edited_message);
  return { msg, edited };
}

/** Text of a message including captions, venues and shared locations. */
export function messageText(msg) {
  if (!msg) return '';
  const parts = [msg.text || msg.caption || ''];
  if (msg.venue) parts.push(`${msg.venue.title || ''} ${msg.venue.address || ''}`);
  return collapse(parts.join(' '));
}

export function messageMapUrl(msg) {
  const loc = msg?.venue?.location || msg?.location;
  if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
    return `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
  }
  return '';
}

/** Display name of whoever posted: channel signature, or the user's name in a group. */
export function messageAuthor(msg) {
  if (!msg) return { name: '', id: null };
  if (msg.from && !msg.from.is_bot) {
    const name = collapse(`${msg.from.first_name || ''} ${msg.from.last_name || ''}`) || msg.from.username || '';
    return { name: msg.author_signature || name, id: msg.from.id ?? null };
  }
  return { name: msg.author_signature || msg.sender_chat?.title || '', id: null };
}

/**
 * Whether a reply may assign a driver. User IDs are authoritative when Telegram sends one
 * (groups); channel posts only carry the author signature, so fall back to the configured names.
 */
export function isAuthorizedAssigner(author, { assignerIds = [], assignerNames = [] } = {}) {
  const ids = assignerIds.map((x) => String(x).trim()).filter(Boolean);
  const names = assignerNames.map((x) => collapse(x).toLowerCase()).filter(Boolean);
  if (ids.length === 0 && names.length === 0) return false;
  if (author.id != null && ids.includes(String(author.id))) return true;
  if (author.id != null && ids.length > 0) return false;
  return Boolean(author.name) && names.includes(collapse(author.name).toLowerCase());
}
