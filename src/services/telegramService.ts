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
  botType?: 'MAIN' | 'PAYMENT';
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
        } else if (data.message) {
          return { success: false, message: data.message };
        }
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
