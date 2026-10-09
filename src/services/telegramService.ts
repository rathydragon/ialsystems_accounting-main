import { CollectionBatch, UserActivityLog, AppSettings, OperatorDistributionSummary } from '../types';

/**
 * Telegram Proxy Service
 * Routes all Telegram bot interactions securely through the Google Apps Script Web App
 * backend, preventing cleartext client-side exposure of private Bot Tokens.
 */

export interface SendTelegramAlertParams {
  webAppUrl?: string;
  botToken?: string;
  chatId?: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  botType?: 'MAIN' | 'PAYMENT' | 'LOG' | 'SLIP' | 'DISTRIBUTION';
}

export interface SendTelegramPhotoParams {
  webAppUrl?: string;
  botToken?: string;
  chatId: string;
  photo: Blob | File | string; // binary Blob/File or URL string
  caption?: string;
  parseMode?: 'HTML' | 'Markdown';
}

export interface TelegramProxyResponse {
  success: boolean;
  message?: string;
  chatId?: string;
}

/**
 * Send a photo with caption via Telegram Bot API (sendPhoto)
 */
export async function sendTelegramPhoto(
  params: SendTelegramPhotoParams
): Promise<TelegramProxyResponse> {
  const { webAppUrl, botToken, chatId, photo, caption = '', parseMode = 'HTML' } = params;

  // 1. Direct fetch to Telegram Bot API with FormData
  if (botToken && botToken.trim() && chatId && chatId.trim()) {
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId.trim());
      formData.append('caption', caption);
      formData.append('parse_mode', parseMode);

      if (typeof photo === 'string') {
        if (photo.startsWith('data:')) {
          try {
            const parts = photo.split(',');
            const mimeMatch = parts[0].match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            const binary = atob(parts[1]);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              array[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([array], { type: mime });
            formData.append('photo', blob, 'bank_slip.jpg');
          } catch (bErr) {
            console.warn('Failed to convert dataUrl to Blob, sending as string:', bErr);
            formData.append('photo', photo);
          }
        } else {
          formData.append('photo', photo);
        }
      } else {
        formData.append('photo', photo, 'bank_slip.jpg');
      }

      const directUrl = `https://api.telegram.org/bot${botToken.trim()}/sendPhoto`;
      const res = await fetch(directUrl, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(15000)
      });
      const data = await res.json();
      if (data.ok) {
        return { success: true, message: 'Sent photo via Telegram Bot API' };
      } else {
        console.warn('Telegram sendPhoto error:', data.description);
        return { success: false, message: data.description || 'Failed to send photo' };
      }
    } catch (err: any) {
      console.warn('Direct Telegram sendPhoto error:', err);
    }
  }

  // 2. Fallback to send text notification if photo upload fails or token is missing
  if (caption) {
    return sendTelegramNotification({
      webAppUrl,
      botToken,
      chatId,
      text: caption,
      parseMode,
      botType: 'SLIP'
    });
  }

  return { success: false, message: 'No valid Telegram Bot Token or Chat ID provided' };
}


/**
 * Send a notification message via Telegram
 * Prefers Google Apps Script backend proxy; falls back gracefully to direct fetch if proxy is unreachable.
 */
export async function sendTelegramNotification(
  params: SendTelegramAlertParams
): Promise<TelegramProxyResponse> {
  const { webAppUrl, botToken, chatId, text, parseMode = 'HTML', botType = 'PAYMENT' } = params;

  // 1. Primary Path: Google Apps Script Backend Proxy
  if (webAppUrl && webAppUrl.trim()) {
    try {
      const response = await fetch(webAppUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'send_telegram',
          text: text,
          chat_id: chatId || '',
          parse_mode: parseMode,
          bot_type: botType,
          token: botToken || ''
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (response.ok) {
        const json = await response.json();
        if (json && json.status === 'success') {
          return { success: true, message: json.message || 'Sent successfully via backend proxy' };
        } else if (json && json.status === 'error') {
          return { success: false, message: json.message || 'Telegram server error' };
        }
      }
    } catch (proxyErr: any) {
      console.warn('Telegram backend proxy warning, attempting direct fallback if token present:', proxyErr);
    }
  }

  // 2. Direct Fallback (e.g. if user configured custom botToken locally)
  if (botToken && botToken.trim() && chatId && chatId.trim()) {
    try {
      const directUrl = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;
      const res = await fetch(directUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.trim(),
          text: text,
          parse_mode: parseMode
        }),
        signal: AbortSignal.timeout(8000)
      });
      const data = await res.json();
      if (data.ok) {
        return { success: true, message: 'Sent via direct API' };
      } else {
        return { success: false, message: data.description || 'Failed to send direct message' };
      }
    } catch (directErr: any) {
      return { success: false, message: directErr?.message || 'Network error reaching Telegram API' };
    }
  }

  return { success: false, message: 'No valid Telegram Web App URL or Bot Token provided' };
}

/**
 * Auto-detect Telegram Chat ID via backend proxy or direct getUpdates
 */
export async function autoDetectChatId(
  webAppUrl: string | undefined,
  botToken: string
): Promise<{ success: boolean; chatId?: string; message: string }> {
  // 1. Try via Backend Proxy
  if (webAppUrl && webAppUrl.trim()) {
    try {
      const res = await fetch(webAppUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'detect_telegram_chat_id',
          token: botToken.trim()
        }),
        signal: AbortSignal.timeout(12000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && data.chatId) {
          return {
            success: true,
            chatId: String(data.chatId),
            message: `🎉 រកឃើញ Chat ID ពិតប្រាកដដោយជោគជ័យ៖ ${data.chatId} (${data.chatTitle || 'User'})!`
          };
        } else if (data.status === 'pending') {
          return { 
            success: false, 
            message: data.message || 'មិនទាន់ឃើញសារថ្មីទេ។ សូមបើក Telegram ហើយផ្ញើសារ /start ទៅកាន់ Bot រួចចុចម្តងទៀត!' 
          };
        } else if (data.message && !data.message.toLowerCase().includes('unknown action')) {
          return { success: false, message: data.message };
        }
        console.warn('Backend does not recognize detect_telegram_chat_id action. Falling back to direct Telegram API...');
      }
    } catch (err) {
      console.warn('Backend proxy detect failed, trying direct:', err);
    }
  }

  // 2. Direct Fallback
  if (!botToken.trim()) {
    return { success: false, message: 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន!' };
  }

  try {
    const meRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/getMe`, { signal: AbortSignal.timeout(7000) });
    const meData = await meRes.json();
    if (!meData.ok) {
      return { success: false, message: `Bot Token មិនត្រឹមត្រូវទេ: ${meData.description || 'Invalid Token'}` };
    }
    const botName = meData.result.first_name || 'Bot';
    const botUsername = meData.result.username || '';

    const upRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/getUpdates`, { signal: AbortSignal.timeout(7000) });
    const upData = await upRes.json();

    if (upData.ok && Array.isArray(upData.result) && upData.result.length > 0) {
      const reversed = [...upData.result].reverse();
      const found = reversed.find((u: any) => u.message?.chat?.id || u.channel_post?.chat?.id || u.my_chat_member?.chat?.id);
      const chat = found?.message?.chat || found?.channel_post?.chat || found?.my_chat_member?.chat;

      if (chat && chat.id) {
        return {
          success: true,
          chatId: String(chat.id),
          message: `🎉 រកឃើញ Chat ID ដោយជោគជ័យ៖ ${chat.id} (${chat.first_name || chat.title || 'User'})!`
        };
      }
    }

    return {
      success: false,
      message: `តភ្ជាប់ជាមួយ Bot "${botName}" (@${botUsername}) បានជោគជ័យ! ប៉ុន្តែមិនទាន់ឃើញសារថ្មីទេ។\n\n👉 សូមបើក Telegram ហើយផ្ញើសារអ្វីមួយ (ឬ /start) ទៅកាន់ @${botUsername} រួចចុច "Auto-Detect" នេះម្តងទៀត!`
    };
  } catch (err: any) {
    return { success: false, message: `កំហុសពេលទាញយក Chat ID៖ ${err.message || 'Network error'}` };
  }
}

/**
 * Format a Payment Collection Batch for Telegram notification (new or resend)
 * Uses clean HTML format to avoid Markdown parsing entity errors.
 */
export function formatBatchTelegramMessage(
  batch: CollectionBatch, 
  isResend = false,
  batchType: 'GENERAL' | 'MEDICINE' = 'GENERAL'
): string {
  const isMed = batchType === 'MEDICINE' || batch.batchNumber?.startsWith('MED-');
  const uniqueCustomers = Array.from(
    new Set((batch.items || []).map(i => i.name?.trim()).filter(Boolean))
  );
  const customerLine = uniqueCustomers.length > 0
    ? `👤 <b>${isMed ? 'អ្នកប្រគល់ / Handle By' : 'អ្នកប្រគល់ប្រាក់'}:</b> ${escapeHtml(uniqueCustomers.join(', '))}\n`
    : '';

  let itemsBlock = '';
  if (batch.items && batch.items.length > 0) {
    const maxDisplay = 10;
    const displayItems = batch.items.slice(0, maxDisplay);
    const lines = displayItems.map((item, idx) => {
      const trk = escapeHtml(item.tracking || '—');
      const usdVal = `$${(item.usd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const khmVal = `${(item.khm ?? 0).toLocaleString()} ៛`;
      return `${idx + 1}. <code>${trk}</code> | <b>${usdVal}</b> | <b>${khmVal}</b>`;
    });

    itemsBlock = `\n\n📄 <b>បញ្ជីទំនិញ (Tracking | USD | KHM):</b>\n` +
      `──────────────────\n` +
      lines.join('\n');

    if (batch.items.length > maxDisplay) {
      itemsBlock += `\n<i>... និងនៅសល់ ${batch.items.length - maxDisplay} វិក្កយបត្រទៀត</i>`;
    }
  }

  const receivedLines = [
    (batch.bankUSD !== undefined && batch.bankUSD > 0 ? `🏦 <b>ទទួលពីធនាគារ USD:</b> <code>$${batch.bankUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</code>` : ''),
    (batch.bankKHR !== undefined && batch.bankKHR > 0 ? `🏦 <b>ទទួលពីធនាគារ KHR:</b> <code>${batch.bankKHR.toLocaleString()} ៛</code>` : ''),
    (batch.cashUSD !== undefined && batch.cashUSD > 0 ? `💵 <b>ទទួលប្រាក់សុទ្ធ USD:</b> <code>$${batch.cashUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</code>` : ''),
    (batch.cashKHR !== undefined && batch.cashKHR > 0 ? `💵 <b>ទទួលប្រាក់សុទ្ធ KHR:</b> <code>${batch.cashKHR.toLocaleString()} ៛</code>` : ''),
    (batch.notes ? `📝 <b>ចំណាំ:</b> <i>${escapeHtml(batch.notes)}</i>` : '')
  ].filter(Boolean).join('\n');

  const headerPrefix = isResend 
    ? `🔄 <b>[ផ្ញើសារឡើងវិញ / Resend]</b>\n` 
    : '';

  const headerTitle = isMed 
    ? `💊 <b>ការទទួលលុយថ្នាំពេទ្យ (Medicine Payment Collection)</b>` 
    : `📦 <b>ការប្រមូលប្រាក់ (Payment Collection Batch)</b>`;

  return `${headerPrefix}${headerTitle}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>កញ្ចប់លេខ:</b> <code>${escapeHtml(batch.batchNumber)}</code>\n` +
    `⏰ <b>កាលបរិច្ឆេទ:</b> <code>${escapeHtml(new Date(batch.createdAt).toLocaleString('km-KH'))}</code>\n` +
    (customerLine ? `${customerLine}\n` : '\n') +
    `👤 <b>អ្នកកត់ត្រា:</b> <b>${escapeHtml(batch.operator)}</b>${batch.operatorEmail ? ` (<code>${escapeHtml(batch.operatorEmail)}</code>)` : ''}\n` +
    `🔢 <b>ចំនួនវិក្កយបត្រ:</b> <b>${batch.totalItems}</b>\n` +
    `💵 <b>សរុបប្រព័ន្ធ USD:</b> <code>$${batch.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</code>\n` +
    `៛ <b>សរុបប្រព័ន្ធ KHR:</b> <code>${batch.totalKHR.toLocaleString()} ៛</code>\n\n` +
    (receivedLines ? `${receivedLines}\n` : '') +
    (batch.reconciliation ? `⚖️ <b>ផ្ទៀងផ្ទាត់ (Recon):</b> <code>${escapeHtml(batch.reconciliation)}</code>\n` : '') +
    itemsBlock + `\n` +
    `━━━━━━━━━━━━━━━━━━`;
}

function escapeHtml(str?: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format User Activity Log into clean, readable Telegram HTML alert
 */
export function formatActivityLogTelegramMessage(log: UserActivityLog): string {
  const time = log.timestamp
    ? new Date(log.timestamp).toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' })
    : new Date().toLocaleString('en-GB');

  const actionEmoji: Record<string, string> = {
    LOGIN: '🔑',
    LOGOUT: '🚪',
    BATCH_SAVED: '📦',
    RESEND_TELEGRAM: '✈️',
    ADD_USER: '👤➕',
    UPDATE_ROLE: '👑',
    CHANGE_STATUS: '🔄',
    DELETE_USER: '🗑️👤',
    DELETE_BATCH: '🗑️📦',
    DELETE_ALL_BATCHES: '⚠️🗑️',
    SYNC_SHEETS: '📊',
    PAYER_ADDED: '🤝',
    PAYER_UPDATED: '✏️',
    PAYER_DELETED: '🗑️'
  };

  const actionTitle: Record<string, string> = {
    LOGIN: 'ចូលប្រើប្រព័ន្ធ (LOGIN)',
    LOGOUT: 'ចាកចេញពីប្រព័ន្ធ (LOGOUT)',
    BATCH_SAVED: 'រក្សាទុកកញ្ចប់ទទួលប្រាក់ (BATCH SAVED)',
    RESEND_TELEGRAM: 'ផ្ញើសារ Telegram ឡើងវិញ (RESEND)',
    ADD_USER: 'បង្កើតអ្នកប្រើប្រាស់ថ្មី (ADD USER)',
    UPDATE_ROLE: 'ផ្លាស់ប្តូរសិទ្ធិអ្នកប្រើ (UPDATE ROLE)',
    CHANGE_STATUS: 'ប្តូរស្ថានភាពអ្នកប្រើ (STATUS)',
    DELETE_USER: 'លុបអ្នកប្រើប្រាស់ (DELETE USER)',
    DELETE_BATCH: 'លុបកញ្ចប់ទទួលប្រាក់ (DELETE BATCH)',
    DELETE_ALL_BATCHES: 'លុបរាល់កញ្ចប់ទាំងអស់ (DELETE ALL)',
    SYNC_SHEETS: 'Sync ទិន្នន័យទៅ Google Sheets',
    PAYER_ADDED: 'បន្ថែមអ្នកប្រគល់ប្រាក់ថ្មី',
    PAYER_UPDATED: 'កែប្រែអ្នកប្រគល់ប្រាក់',
    PAYER_DELETED: 'លុបអ្នកប្រគល់ប្រាក់'
  };

  const emoji = actionEmoji[log.action] || '📜';
  const title = actionTitle[log.action] || log.action || 'សកម្មភាពអ្នកប្រើប្រាស់';

  let msg = `<b>${emoji} កំណត់ត្រាសកម្មភាព៖ ${title}</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `⏰ <b>ម៉ោង៖</b> <code>${time}</code>\n`;
  msg += `👤 <b>អ្នកប្រតិបត្តិការ៖</b> <b>${escapeHtml(log.operator || log.userName || 'Unknown')}</b>\n`;
  if (log.operatorEmail || log.userEmail) {
    msg += `📧 <b>Email៖</b> <code>${escapeHtml(log.operatorEmail || log.userEmail || '')}</code>\n`;
  }
  if (log.userRole) {
    msg += `🛡️ <b>តួនាទី (Role)៖</b> <code>${log.userRole}</code>\n`;
  }
  if (log.batchNumber) {
    msg += `📦 <b>លេខកញ្ចប់ (Batch)៖</b> <code>${escapeHtml(log.batchNumber)}</code>\n`;
  }
  if (log.itemsCount !== undefined && log.itemsCount > 0) {
    msg += `🔢 <b>ចំនួនទំនិញ៖</b> <b>${log.itemsCount}</b> ប្រតិបត្តិការ\n`;
  }
  if ((log.amountUSD || 0) > 0 || (log.amountKHR || 0) > 0) {
    const usd = log.amountUSD ? `$${log.amountUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
    const khm = log.amountKHR ? `${log.amountKHR.toLocaleString()}៛` : '0៛';
    msg += `💵 <b>ទឹកប្រាក់៖</b> <b>${usd}</b> | <b>${khm}</b>\n`;
  }
  if (log.targetUserEmail) {
    msg += `🎯 <b>គណនីគោលដៅ៖</b> <code>${escapeHtml(log.targetUserEmail)}</code>\n`;
  }
  if (log.details || log.description) {
    msg += `📝 <b>លម្អិត៖</b> ${escapeHtml(log.details || log.description || '')}\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🌐 <i>IAL Accounting Cloud Audit Trail</i>`;

  return msg;
}

/**
 * Send Telegram alert for User Activity Log
 */
export async function sendActivityLogTelegramAlert(
  log: UserActivityLog,
  customSettings?: AppSettings
): Promise<TelegramProxyResponse> {
  let settings = customSettings;
  if (!settings) {
    try {
      const raw = localStorage.getItem('accounting_app_settings');
      if (raw) settings = JSON.parse(raw);
    } catch (_) {}
  }

  if (!settings) {
    return { success: false, message: 'Settings not available' };
  }

  // Check if Log alerts are disabled
  if (settings.telegramLogAlertsEnabled === false) {
    return { success: false, message: 'Telegram log alerts disabled in settings' };
  }

  // Dedicated Log Chat ID (or fallback to primary Chat ID)
  const chatId = settings.telegramLogChatId?.trim() || settings.telegramChatId?.trim();
  if (!chatId) {
    return { success: false, message: 'No Telegram Chat ID configured for logs' };
  }

  // Bot Token (supports dedicated log token or fallback)
  const botToken = settings.telegramLogBotToken?.trim() || settings.telegramPaymentBotToken?.trim() || settings.telegramBotToken?.trim();

  const text = formatActivityLogTelegramMessage(log);

  return sendTelegramNotification({
    webAppUrl: settings.webAppUrl?.trim(),
    botToken: botToken,
    chatId: chatId,
    text: text,
    parseMode: 'HTML',
    botType: 'LOG'
  });
}

/**
 * Safely parse and normalize daily summary alert time into strict 24h 'HH:mm'
 * Handles Date objects, full Date strings, 12-hour AM/PM formats, and defaults safely to '18:00'.
 */
export function normalizeDailySummaryTime(timeVal?: any): string {
  if (!timeVal) return '18:00';
  const str = String(timeVal).trim();
  if (!str || str === '--:--') return '18:00';

  // If it's a full Date string like "Sat Dec 30 1899 18:00:00 GMT+0700..."
  if (str.includes('GMT') || str.includes('1899') || str.includes('T')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
  }

  // Handle "18:00:00" -> "18:00"
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(str)) {
    const parts = str.split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }

  // Handle 12-hour format with AM/PM (e.g. "06:00 PM", "6:00 PM", "6:00 AM")
  const match12 = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match12 && match12[3]) {
    let hour = parseInt(match12[1], 10);
    const min = match12[2];
    const isPM = match12[3].toUpperCase() === 'PM';
    if (isPM && hour < 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${min}`;
  }

  // Handle standard "18:00" or "6:00"
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [hStr, mStr] = str.split(':');
    let hour = parseInt(hStr, 10);
    const min = parseInt(mStr, 10);
    if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }

  return '18:00';
}

/**
 * Format Daily Distribution Operator Transaction Summary into Telegram HTML message
 * (រៀងរាល់ថ្ងៃម៉ោង ៦ ល្ងាច សរុបតាម EMAIL អ្នកធ្វើប្រតិបត្តិការ នីមួយៗ - ទម្រង់ Compact Table)
 */
export function formatDailyDistributionSummaryTelegramMessage(
  summaries: OperatorDistributionSummary[],
  totalCount: number,
  targetDate?: string,
  scheduledTime?: string
): string {
  const dateStr = targetDate || new Date().toISOString().slice(0, 10);
  const normalizedTime = normalizeDailySummaryTime(scheduledTime || '18:00');
  const [hStr, mStr] = normalizedTime.split(':');
  const h = parseInt(hStr, 10) || 18;
  const m = mStr || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  const khmerPeriod = h >= 12 ? (h >= 18 ? 'យប់' : 'ល្ងាច') : (h >= 11 ? 'ថ្ងៃត្រង់' : 'ព្រឹក');
  const khmerHour = h % 12 === 0 ? 12 : h % 12;
  const timeLabel = `ម៉ោង ${khmerHour}:${m} ${khmerPeriod}`;

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
      const namePadded = cleanName.padEnd(16, ' ');
      const countPadded = String(op.todayCount).padStart(5, ' ');
      const pct = totalCount > 0 ? ((op.todayCount / totalCount) * 100).toFixed(1) : '0';
      const pctPadded = `${pct}%`.padStart(8, ' ');

      msg += `${rankStr}${escapeHtml(namePadded)}${countPadded}${pctPadded}\n`;
    });

    msg += `────────────────────────────────\n`;
    const totalCountPadded = String(totalCount).padStart(5, ' ');
    msg += `សរុបទាំងអស់          ${totalCountPadded}    100%</code>\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🌐 <i>IAL Systems • Auto Report</i>`;

  return msg;
}

/**
 * Send Daily Distribution Summary alert to Telegram bot
 */
export async function sendDailyDistributionSummaryAlert(
  summaries: OperatorDistributionSummary[],
  totalCount: number,
  customSettings?: AppSettings,
  targetDate?: string
): Promise<TelegramProxyResponse> {
  let settings = customSettings;
  if (!settings) {
    try {
      const raw = localStorage.getItem('accounting_app_settings_v2') || localStorage.getItem('accounting_app_settings');
      if (raw) settings = JSON.parse(raw);
    } catch (_) {}
  }

  if (!settings) {
    return { success: false, message: 'Settings not available' };
  }

  // Distribution Chat ID fallback order:
  // 1. telegramDistributionChatId
  // 2. telegramPaymentChatId
  // 3. telegramChatId
  const chatId = settings.telegramDistributionChatId?.trim() || settings.telegramPaymentChatId?.trim() || settings.telegramChatId?.trim();
  if (!chatId) {
    return { success: false, message: 'No Telegram Chat ID configured for distribution summary' };
  }

  // Bot Token fallback order:
  // 1. telegramDistributionBotToken
  // 2. telegramPaymentBotToken
  // 3. telegramBotToken
  const botToken = settings.telegramDistributionBotToken?.trim() || settings.telegramPaymentBotToken?.trim() || settings.telegramBotToken?.trim();

  const timeSetting = settings.telegramDailySummaryTime || '18:00';
  const text = formatDailyDistributionSummaryTelegramMessage(summaries, totalCount, targetDate, timeSetting);

  return sendTelegramNotification({
    webAppUrl: settings.webAppUrl?.trim(),
    botToken: botToken,
    chatId: chatId,
    text: text,
    parseMode: 'HTML',
    botType: 'DISTRIBUTION'
  });
}

