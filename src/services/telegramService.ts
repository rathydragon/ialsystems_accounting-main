import { CollectionBatch, UserActivityLog, AppSettings } from '../types';

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
  botType?: 'MAIN' | 'PAYMENT' | 'LOG';
}

export interface TelegramProxyResponse {
  success: boolean;
  message?: string;
  chatId?: string;
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
        signal: AbortSignal.timeout(12000)
      });

      if (response.ok) {
        const json = await response.json();
        if (json && json.status === 'success') {
          return { success: true, message: json.message || 'Sent successfully via backend proxy' };
        }
      }
    } catch (proxyErr) {
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
    ? `👤 ${isMed ? 'អ្នកប្រគល់ / Handle By' : 'អ្នកប្រគល់ប្រាក់'}: ${uniqueCustomers.join(', ')}\n`
    : '';

  let itemsBlock = '';
  if (batch.items && batch.items.length > 0) {
    const maxDisplay = 10;
    const displayItems = batch.items.slice(0, maxDisplay);
    const lines = displayItems.map((item, idx) => {
      const trk = item.tracking || '—';
      const usdVal = `$${(item.usd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const khmVal = `${(item.khm ?? 0).toLocaleString()} ៛`;
      return `${idx + 1}. \`${trk}\` | ${usdVal} | ${khmVal}`;
    });

    itemsBlock = `\n\n📄 បញ្ជីទំនិញ (Tracking | USD | KHM):\n` +
      `──────────────────\n` +
      lines.join('\n');

    if (batch.items.length > maxDisplay) {
      itemsBlock += `\n... និងនៅសល់ ${batch.items.length - maxDisplay} វិក្កយបត្រទៀត`;
    }
  }

  const receivedLines = [
    (batch.bankUSD !== undefined && batch.bankUSD > 0 ? `- ទទួលពីធនាគារ USD: $${batch.bankUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''),
    (batch.bankKHR !== undefined && batch.bankKHR > 0 ? `- ទទួលពីធនាគារ KHR: ${batch.bankKHR.toLocaleString()} ៛` : ''),
    (batch.cashUSD !== undefined && batch.cashUSD > 0 ? `- ទទួលប្រាក់សុទ្ធ USD: $${batch.cashUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''),
    (batch.cashKHR !== undefined && batch.cashKHR > 0 ? `- ទទួលប្រាក់សុទ្ធ KHR: ${batch.cashKHR.toLocaleString()} ៛` : ''),
    (batch.notes ? `- ចំណាំ: ${batch.notes}` : '')
  ].filter(Boolean).join('\n');

  const headerPrefix = isResend 
    ? `🔄 [ផ្ញើសារឡើងវិញ / Resend]\n` 
    : '';

  const headerTitle = isMed 
    ? `💊 ការទទួលលុយថ្នាំពេទ្យ (Medicine Payment Collection)` 
    : `📦 ការប្រមូលប្រាក់ (Payment Collection Batch)`;

  return `${headerPrefix}${headerTitle}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 កញ្ចប់លេខ: \`${batch.batchNumber}\`\n` +
    `⏰ កាលបរិច្ឆេទ: ${new Date(batch.createdAt).toLocaleString('km-KH')}\n` +
    (customerLine ? `${customerLine}\n` : '\n') +
    `+ អ្នកកត់ត្រា: ${batch.operator}${batch.operatorEmail ? ` (${batch.operatorEmail})` : ''}\n` +
    `- ចំនួនវិក្កយបត្រ: ${batch.totalItems}\n` +
    `- សរុបប្រព័ន្ធ USD: $${batch.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
    `- សរុបប្រព័ន្ធ KHR: ${batch.totalKHR.toLocaleString()} ៛\n\n` +
    (receivedLines ? `${receivedLines}\n` : '') +
    (batch.reconciliation ? `=> ផ្ទៀងផ្ទាត់ (Recon): ${batch.reconciliation}\n` : '') +
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

