import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = [];
let bookingRow = null;

vi.mock('../../api/remote-mysql.js', () => ({
  executeQuery: vi.fn(async (sql, params = []) => {
    calls.push({ sql, params });
    if (/SELECT config_key/.test(sql)) {
      return { rows: [
        { config_key: 'assigner_ids', config_value: '556322085' },
        { config_key: 'assigner_names', config_value: 'B Khu 011' },
        { config_key: 'chat_id', config_value: '-1001' },
      ] };
    }
    if (/SELECT id, assign_message_id/.test(sql)) return { rows: bookingRow ? [bookingRow] : [] };
    if (/FROM `tbl_tg_booking_team`/.test(sql)) return { rows: [{ id: 1, name: 'Rin', aliases: 'rin driver', active: 1 }] };
    return { rows: [] };
  }),
}));

process.env.TELEGRAM_BOOKING_BOT_TOKEN = '123:abc';
const { webhookHandler, getWebhookSecret } = await import('../../api/telegram-booking.js');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
  };
}

const post = (body, secret = getWebhookSecret()) => {
  const res = mockRes();
  return webhookHandler({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body }, res).then(() => res);
};

const channel = { id: -1001, type: 'channel', title: 'IAL Booking' };
const reply = (signature, text, messageId = 50) => ({
  channel_post: {
    message_id: messageId, date: 1760000000, chat: channel, author_signature: signature, text,
    reply_to_message: { message_id: 10, date: 1759999000, chat: channel, text: 'Unicity has shipment' },
  },
});

const updates = () => calls.filter((c) => /UPDATE `tbl_tg_bookings`/.test(c.sql));

describe('telegram booking webhook', () => {
  beforeEach(() => {
    calls.length = 0;
    bookingRow = { id: 7, assign_message_id: null };
  });

  it('rejects requests without the secret token', async () => {
    const res = await post(reply('B Khu 011', 'rin driver'), 'wrong');
    expect(res.statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('stores a new post as a booking', async () => {
    const res = await post({ channel_post: { message_id: 10, date: 1760000000, chat: channel, author_signature: 'Tevan', text: 'Amrurice HQ has shipment Overseas 0963725526' } });
    expect(res.body).toMatchObject({ ok: true, type: 'booking_created' });
    const insert = calls.find((c) => /INSERT INTO `tbl_tg_bookings`/.test(c.sql));
    expect(insert.params).toEqual(expect.arrayContaining(['Tevan', 'Amrurice HQ', '0963725526', 'Overseas']));
  });

  it('assigns the driver when B Khu 011 replies', async () => {
    const res = await post(reply('B Khu 011', 'rin driver'));
    expect(res.body).toMatchObject({ ok: true, reason: 'assigned' });
    expect(updates()).toHaveLength(1);
    expect(updates()[0].params.slice(0, 4)).toEqual(['Rin', 'rin driver', 0, 'B Khu 011']);
  });

  it('only logs replies from anyone else', async () => {
    const res = await post(reply('Tevan', 'Sna'));
    expect(res.body).toMatchObject({ ok: true, reason: 'not_authorized' });
    expect(updates()).toHaveLength(0);
    expect(calls.some((c) => /INSERT INTO `tbl_tg_booking_replies`/.test(c.sql))).toBe(true);
  });

  it('does not let an edit of an older reply undo a newer assignment', async () => {
    bookingRow = { id: 7, assign_message_id: 60 };
    const res = await post(reply('B Khu 011', 'Sna', 50));
    expect(res.body).toMatchObject({ reason: 'superseded' });
    expect(updates()).toHaveLength(0);
  });

  it('ignores chats other than the configured channel', async () => {
    const res = await post({ channel_post: { message_id: 1, date: 1, chat: { id: -999, type: 'channel' }, text: 'hello' } });
    expect(res.body).toMatchObject({ type: 'ignored', reason: 'other_chat' });
  });
});
