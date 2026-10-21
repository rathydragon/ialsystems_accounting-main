/**
 * Server-side Daily Distribution Summary (Telegram)
 *
 * The browser used to be the only thing sending this report, so it went out only when an admin
 * happened to have the Distribution Report page open after the scheduled time. This handler lets a
 * scheduler (Vercel Cron, or any external pinger) send it on time with no browser open.
 *
 * Safe to call as often as you like: it does nothing before the scheduled time
 * (Settings → telegramDailySummaryTime, Asia/Phnom_Penh) and shares the same MySQL once-per-day
 * lock as the browser, so the report is sent once per day by whoever reaches it first.
 *
 * Counting and message layout mirror frontend/src/services/distributionReportService.ts
 * (getOperatorDistributionStats) and telegramService.ts (formatDailyDistributionSummaryTelegramMessage).
 */
import { getMySQLPool } from './remote-mysql.js';
import { getSettingsFromMySQL, getDistributionReportsFromMySQL, dailySummaryLockInMySQL } from './mysql-master-handlers.js';

const TZ = 'Asia/Phnom_Penh';
const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

function phnomPenhDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function phnomPenhHourMinute(d = new Date()) {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(d).split(':').map((n) => parseInt(n, 10) || 0);
  return { h, m };
}

export function normalizeDailySummaryTime(timeVal) {
  const str = String(timeVal || '').trim();
  if (!str || str === '--:--') return '18:00';

  // Sheets-style full dates, e.g. "Sat Dec 30 1899 18:00:00 GMT+0700"
  if (str.includes('GMT') || str.includes('1899') || str.includes('T')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const { h, m } = phnomPenhHourMinute(d);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  const m12 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (m12) {
    let hour = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    if (m12[3]) {
      const isPM = m12[3].toUpperCase() === 'PM';
      if (isPM && hour < 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
    }
    if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }
  return '18:00';
}

/** Date (YYYY-MM-DD, Phnom Penh) a record was created on. */
export function createdDatePhnomPenh(createdAt, fallbackDate) {
  const raw = String(createdAt || '').trim();
  if (raw) {
    // A timestamp with no zone ("2026-10-21 18:30:00") is already Cambodia time. The server runs in
    // UTC, so parsing it with new Date() would shift it 7h and land evening scans on the next day.
    const local = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/);
    if (local) return local[1];
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return phnomPenhDate(d);
    const prefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (prefix) return prefix[1];
  }

  const fb = String(fallbackDate || '').trim();
  if (!fb) return '';
  const iso = fb.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = fb.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,}|\d{1,2})[-/ ](\d{4})/);
  if (dmy) {
    const mo = /^\d+$/.test(dmy[2]) ? dmy[2].padStart(2, '0') : (MONTHS[dmy[2].toLowerCase().slice(0, 3)] || '01');
    return `${dmy[3]}-${mo}-${dmy[1].padStart(2, '0')}`;
  }
  const d = new Date(fb);
  return isNaN(d.getTime()) ? '' : phnomPenhDate(d);
}

/** Per-operator counts for one day (same rules as the browser's getOperatorDistributionStats). */
export function getOperatorDistributionStats(items, dateToMatch) {
  const map = new Map();
  let totalToday = 0;

  for (const item of items) {
    const createdBy = String(item.createdBy || '').trim();
    const emailRaw = String(item.operatorEmail || (createdBy.includes('@') ? createdBy : '')).trim().toLowerCase();
    const key = emailRaw || createdBy || 'Unknown';
    const isToday = createdDatePhnomPenh(item.createdAt, item.date) === dateToMatch;
    if (isToday) totalToday++;

    let entry = map.get(key);
    if (!entry) {
      let displayName = createdBy;
      if (!displayName || displayName.includes('@')) {
        if (emailRaw === 'ialexpress2023@gmail.com') displayName = 'IAL Accounting';
        else if (emailRaw === 'rathykim34@gmail.com') displayName = 'KEUN RATHY';
        else if (emailRaw) displayName = emailRaw.split('@')[0];
        else displayName = 'Unknown Operator';
      }
      entry = { operatorEmail: emailRaw, operatorName: displayName, todayCount: 0, totalCount: 0 };
      map.set(key, entry);
    }
    entry.totalCount++;
    if (isToday) entry.todayCount++;
  }

  const summaries = Array.from(map.values()).sort((a, b) =>
    (b.todayCount - a.todayCount) || (b.totalCount - a.totalCount));
  return { summaries, totalToday };
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatDailySummaryMessage(summaries, totalCount, dateStr, scheduledTime) {
  const [hStr, mStr] = normalizeDailySummaryTime(scheduledTime).split(':');
  const h = parseInt(hStr, 10);
  const khmerPeriod = h >= 12 ? (h >= 18 ? 'យប់' : 'ល្ងាច') : (h >= 11 ? 'ថ្ងៃត្រង់' : 'ព្រឹក');
  const khmerHour = h % 12 === 0 ? 12 : h % 12;
  const timeLabel = `ម៉ោង ${khmerHour}:${mStr} ${khmerPeriod}`;

  let msg = `📦 <b>DAILY DISTRIBUTION SUMMARY (${timeLabel})</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 <code>${escapeHtml(dateStr)}</code> | 👥 <b>${summaries.length} នាក់</b> | សរុប <b>${totalCount} កញ្ចប់</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

  if (summaries.length === 0) {
    msg += `<i>⚠️ គ្មានទិន្នន័យប្រតិបត្តិការចែកចាយសម្រាប់ថ្ងៃនេះឡើយ</i>\n`;
  } else {
    msg += `<code>#  ឈ្មោះ             ចំនួន   ភាគរយ\n`;
    msg += `────────────────────────────────\n`;
    summaries.forEach((op, index) => {
      const rankStr = `${index + 1}. `.padEnd(3, ' ');
      const rawName = op.operatorName || op.operatorEmail || 'Unknown';
      const cleanName = rawName.length > 15 ? rawName.slice(0, 14) + '…' : rawName;
      const pct = totalCount > 0 ? ((op.todayCount / totalCount) * 100).toFixed(1) : '0';
      msg += `${rankStr}${escapeHtml(cleanName.padEnd(16, ' '))}${String(op.todayCount).padStart(5, ' ')}${`${pct}%`.padStart(8, ' ')}\n`;
    });
    msg += `────────────────────────────────\n`;
    msg += `សរុបទាំងអស់          ${String(totalCount).padStart(5, ' ')}    100%</code>\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🌐 <i>IAL Systems • Auto Report</i>`;
  return msg;
}

async function sendTelegram(token, chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    signal: AbortSignal.timeout(10000)
  });
  const data = await r.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `Telegram HTTP ${r.status}`);
}

/** Send today's summary if it is due and not yet sent. Returns what happened. */
export async function runDailyDistributionSummary(pool = getMySQLPool(), now = new Date()) {
  const settings = await getSettingsFromMySQL(pool);
  if (settings.telegramDailySummaryEnabled === false || settings.telegramDailySummaryEnabled === 'false') {
    return { sent: false, reason: 'disabled in settings' };
  }

  const today = phnomPenhDate(now);
  const scheduled = normalizeDailySummaryTime(settings.telegramDailySummaryTime);
  const [tH, tM] = scheduled.split(':').map((n) => parseInt(n, 10));
  const { h, m } = phnomPenhHourMinute(now);
  if (h < tH || (h === tH && m < tM)) {
    return { sent: false, reason: `waiting for ${scheduled} (now ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')})` };
  }

  const pick = (...vals) => vals.map((v) => String(v || '').trim()).find(Boolean) || '';
  // Same chat/token order as the browser (sendDailyDistributionSummaryAlert + telegram-proxy)
  const chatId = pick(settings.telegramDistributionChatId, settings.telegramPaymentChatId, settings.telegramChatId,
    process.env.TELEGRAM_DISTRIBUTION_CHAT_ID, process.env.TELEGRAM_CHAT_ID);
  const token = pick(process.env.TELEGRAM_DISTRIBUTION_BOT_TOKEN, process.env.TELEGRAM_BOT_TOKEN,
    settings.telegramDistributionBotToken, settings.telegramPaymentBotToken, settings.telegramBotToken);
  if (!chatId || !token) return { sent: false, reason: 'no Telegram bot token / chat ID configured' };

  const lock = await dailySummaryLockInMySQL(pool, 'claim', today);
  if (!lock.claimed) return { sent: false, reason: `already sent for ${today}` };

  try {
    const items = await getDistributionReportsFromMySQL(pool);
    const { summaries, totalToday } = getOperatorDistributionStats(items, today);
    await sendTelegram(token, chatId, formatDailySummaryMessage(summaries, totalToday, today, scheduled));
    return { sent: true, date: today, total: totalToday, operators: summaries.length };
  } catch (err) {
    // Let the next scheduler run (or an open browser) retry
    await dailySummaryLockInMySQL(pool, 'release', today).catch(() => {});
    throw err;
  }
}

/**
 * HTTP entry for schedulers. Protected by CRON_SECRET when it is set:
 * Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; external pingers can pass ?key=<CRON_SECRET>.
 */
export async function dailySummaryCronHandler(req, res) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (secret) {
    const auth = String(req.headers?.authorization || '');
    const key = String(req.query?.key || '');
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }
  }

  try {
    const result = await runDailyDistributionSummary();
    console.log('[Daily Summary Cron]', JSON.stringify(result));
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[Daily Summary Cron] ❌', err?.message);
    return res.status(500).json({ ok: false, message: err?.message || 'Daily summary failed' });
  }
}
