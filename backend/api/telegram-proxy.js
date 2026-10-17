/**
 * Backend Telegram Proxy Handler
 * Securely proxies Telegram notifications from the server-side to prevent
 * exposing Telegram Bot Tokens in the frontend browser network tab.
 */

export default async function telegramAlertHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const {
      text,
      chatId: reqChatId,
      parseMode = 'HTML',
      botType = 'MAIN',
      photo,
      caption = '',
      botToken: reqBotToken,
      action
    } = req.body || {};

    // 1. Resolve Bot Token from Server Environment first (fallback to client-provided if allowed)
    let token = '';
    if (botType === 'PAYMENT') {
      token = process.env.TELEGRAM_PAYMENT_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || reqBotToken || '';
    } else if (botType === 'LOG') {
      token = process.env.TELEGRAM_LOG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || reqBotToken || '';
    } else if (botType === 'DISTRIBUTION') {
      token = process.env.TELEGRAM_DISTRIBUTION_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || reqBotToken || '';
    } else {
      token = process.env.TELEGRAM_BOT_TOKEN || reqBotToken || '';
    }

    token = String(token || '').trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'No Telegram Bot Token configured on server or request.'
      });
    }

    // 2. Action: auto-detect chat ID
    if (action === 'detect_chat_id') {
      try {
        const upRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
          signal: AbortSignal.timeout(8000)
        });
        const upData = await upRes.json();
        if (upData.ok && Array.isArray(upData.result) && upData.result.length > 0) {
          const reversed = [...upData.result].reverse();
          const found = reversed.find((u) => u.message?.chat?.id || u.channel_post?.chat?.id || u.my_chat_member?.chat?.id);
          const chat = found?.message?.chat || found?.channel_post?.chat || found?.my_chat_member?.chat;
          if (chat && chat.id) {
            return res.status(200).json({
              success: true,
              chatId: String(chat.id),
              chatTitle: chat.first_name || chat.title || 'User',
              message: `Chat ID detected: ${chat.id}`
            });
          }
        }
        return res.status(200).json({
          success: false,
          message: 'No recent updates found. Send /start to the bot and try again.'
        });
      } catch (err) {
        return res.status(500).json({
          success: false,
          message: `Failed to detect Chat ID: ${err?.message || 'Network error'}`
        });
      }
    }

    // 3. Resolve Chat ID
    let chatId = reqChatId;
    if (!chatId) {
      if (botType === 'LOG') chatId = process.env.TELEGRAM_LOG_CHAT_ID;
      else if (botType === 'PAYMENT') chatId = process.env.TELEGRAM_PAYMENT_CHAT_ID;
      else if (botType === 'DISTRIBUTION') chatId = process.env.TELEGRAM_DISTRIBUTION_CHAT_ID;
      chatId = chatId || process.env.TELEGRAM_CHAT_ID;
    }

    chatId = String(chatId || '').trim();

    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: 'No Telegram Chat ID provided or configured on server.'
      });
    }

    // 4. Send Photo if provided
    if (photo) {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('caption', caption || text || '');
      formData.append('parse_mode', parseMode);

      if (typeof photo === 'string' && photo.startsWith('data:')) {
        const parts = photo.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const binary = Buffer.from(parts[1], 'base64');
        const blob = new Blob([binary], { type: mime });
        formData.append('photo', blob, 'bank_slip.jpg');
      } else {
        formData.append('photo', photo);
      }

      const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(15000)
      });
      const data = await response.json();
      if (data.ok) {
        return res.status(200).json({ success: true, message: 'Photo sent successfully via Telegram' });
      }
      return res.status(502).json({
        success: false,
        message: data.description || 'Failed to send photo via Telegram'
      });
    }

    // 5. Send Text Message
    if (!text || !String(text).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message text is required.'
      });
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text).trim(),
        parse_mode: parseMode
      }),
      signal: AbortSignal.timeout(10000)
    });

    const data = await response.json();
    if (data.ok) {
      return res.status(200).json({
        success: true,
        message: 'Notification sent successfully via server proxy'
      });
    }

    return res.status(502).json({
      success: false,
      message: data.description || 'Failed to send message via Telegram'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err?.message || 'Internal error dispatching Telegram alert'
    });
  }
}
