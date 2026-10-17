import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import telegramAlertHandler from '../../api/telegram-proxy.js';

describe('Telegram Proxy Handler (Unit Tests)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function createMockRes() {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
      setHeader(k, v) {
        this.headers[k] = v;
      }
    };
    return res;
  }

  it('should reject non-POST requests with 405 Method Not Allowed', async () => {
    const req = { method: 'GET' };
    const res = createMockRes();

    await telegramAlertHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 if no bot token is available', async () => {
    const req = {
      method: 'POST',
      body: { text: 'Hello', chatId: '12345' }
    };
    const res = createMockRes();

    const origToken = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;

    try {
      await telegramAlertHandler(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('No Telegram Bot Token configured');
    } finally {
      if (origToken) process.env.TELEGRAM_BOT_TOKEN = origToken;
    }
  });

  it('should return 400 if text and photo are missing', async () => {
    const req = {
      method: 'POST',
      body: { chatId: '12345', botToken: 'mock-bot-token' }
    };
    const res = createMockRes();

    await telegramAlertHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Message text is required');
  });

  it('should return 400 if chatId is missing', async () => {
    const req = {
      method: 'POST',
      body: { text: 'Test alert', botToken: 'mock-bot-token' }
    };
    const res = createMockRes();

    const origChatId = process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_CHAT_ID;

    try {
      await telegramAlertHandler(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('No Telegram Chat ID provided');
    } finally {
      if (origChatId) process.env.TELEGRAM_CHAT_ID = origChatId;
    }
  });

  it('should successfully send text message when parameters are valid', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 999 } })
    });

    const req = {
      method: 'POST',
      body: {
        text: '<b>Test Alert</b>',
        chatId: '-100123456789',
        botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
        parseMode: 'HTML'
      }
    };
    const res = createMockRes();

    await telegramAlertHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    );
  });

  it('should successfully detect chat ID via detect_chat_id action', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: [
          {
            update_id: 1,
            message: {
              chat: { id: 778899, first_name: 'Admin' }
            }
          }
        ]
      })
    });

    const req = {
      method: 'POST',
      body: {
        action: 'detect_chat_id',
        botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'
      }
    };
    const res = createMockRes();

    await telegramAlertHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.chatId).toBe('778899');
    expect(res.body.chatTitle).toBe('Admin');
  });
});
