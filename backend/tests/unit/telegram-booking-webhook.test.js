import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = [];
let bookingRow = null;
let parentReply = null; // row in tbl_tg_booking_replies that the incoming message answers

vi.mock('../../api/remote-mysql.js', () => ({
  executeQuery: vi.fn(async (sql, params = []) => {
    calls.push({ sql, params });
    if (/INSERT IGNORE INTO `tbl_tg_booking_team`/.test(sql)) return { rows: { affectedRows: 1 } };
    if (/SELECT config_key/.test(sql)) {
      return { rows: [
        { config_key: 'assigner_ids', config_value: '556322085' },
        { config_key: 'assigner_names', config_value: 'B Khu 011' },
        { config_key: 'chat_id', config_value: '-1001' },
      ] };
    }
    if (/COALESCE\(root_message_id/.test(sql)) return { rows: parentReply ? [parentReply] : [] };
    if (/SELECT id, assign_message_id/.test(sql)) return { rows: bookingRow ? [bookingRow] : [] };
    if (/FROM `tbl_tg_booking_team`/.test(sql)) {
      return { rows: [
        { id: 1, name: 'Rin', aliases: 'rin driver', role: 'Driver', phone: '012345678', active: 1 },
        { id: 2, name: 'Phear', aliases: '', role: 'Driver', phone: null, active: 1 },
        { id: 3, name: 'Old Sok', aliases: '', role: 'Driver', phone: null, active: 0 },
      ] };
    }
    return { rows: [] };
  }),
}));

process.env.TELEGRAM_BOOKING_BOT_TOKEN = '123:abc';
const { webhookHandler, bookingApiHandler, getWebhookSecret } = await import('../../api/telegram-booking.js');

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
    parentReply = null;
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

  const replyInserts = () => calls.filter((c) => /INSERT INTO `tbl_tg_booking_replies`/.test(c.sql));

  // Channel: post #10 → dispatcher replies "seng" (#50) → King Sroin replies to #50 (#60)
  const replyToReply = (signature, text, messageId = 60) => ({
    channel_post: {
      message_id: messageId, date: 1760000100, chat: channel, author_signature: signature, text,
      reply_to_message: { message_id: 50, date: 1760000000, chat: channel, author_signature: 'Long Khu', text: 'seng' },
    },
  });

  it('files a reply to a reply under the original booking', async () => {
    parentReply = { root: 10 };
    const res = await post(replyToReply('King Sroin', 'bong som Tuk Tuk'));
    expect(res.body).toMatchObject({ ok: true, type: 'reply', reason: 'thread' });
    const [ins] = replyInserts();
    // chat, message, replies-to, root, replies-to author, author
    expect(ins.params.slice(0, 6)).toEqual([-1001, 60, 50, 10, 'Long Khu', 'King Sroin']);
    expect(calls.some((c) => /INSERT INTO `tbl_tg_bookings`/.test(c.sql))).toBe(false);
  });

  it('does not reassign when the dispatcher answers inside a thread', async () => {
    parentReply = { root: 10 };
    const res = await post(replyToReply('B Khu 011', 'rin driver', 70));
    expect(res.body).toMatchObject({ reason: 'thread' });
    expect(updates()).toHaveLength(0);
  });

  it('stores a direct reply with the booking as its root', async () => {
    await post(reply('B Khu 011', 'rin driver'));
    expect(replyInserts()[0].params.slice(0, 4)).toEqual([-1001, 50, 10, 10]);
  });

  it('ignores chats other than the configured channel', async () => {
    const res = await post({ channel_post: { message_id: 1, date: 1, chat: { id: -999, type: 'channel' }, text: 'hello' } });
    expect(res.body).toMatchObject({ type: 'ignored', reason: 'other_chat' });
  });
});

describe('telegram booking inline name picker', () => {
  const memberStatus = new Map(); // user id → getChatMember status
  const fetchMock = vi.fn(async (url, init) => {
    const { user_id: userId } = JSON.parse(init.body);
    return { json: async () => ({ ok: true, result: { status: memberStatus.get(userId) || 'left' } }) };
  });

  beforeEach(() => {
    calls.length = 0;
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  const inline = (userId, query) => post({ inline_query: { id: `q${userId}`, from: { id: userId, first_name: 'X' }, query } });

  it('answers channel members with matching active team names', async () => {
    memberStatus.set(101, 'administrator');
    const res = await inline(101, 'ri');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ method: 'answerInlineQuery', inline_query_id: 'q101', is_personal: true });
    expect(res.body.results).toEqual([
      expect.objectContaining({ type: 'article', id: '1', title: 'Rin', input_message_content: { message_text: 'Rin' } }),
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ chat_id: '-1001', user_id: 101 });
  });

  it('lists every active member for an empty query and skips inactive ones', async () => {
    memberStatus.set(102, 'member');
    const res = await inline(102, '');
    expect(res.body.results.map((r) => r.title)).toEqual(['Rin', 'Phear']);
  });

  it('matches on aliases too', async () => {
    memberStatus.set(103, 'creator');
    const res = await inline(103, 'driver');
    expect(res.body.results.map((r) => r.title)).toEqual(['Rin']);
  });

  it('returns nothing to people outside the channel', async () => {
    const res = await inline(999, 'rin');
    expect(res.body).toMatchObject({ method: 'answerInlineQuery', results: [] });
    expect(calls.some((c) => /FROM `tbl_tg_booking_team`/.test(c.sql))).toBe(false);
  });
});

describe('telegram booking team import', () => {
  beforeEach(() => { calls.length = 0; });

  const callApi = (user, body) => {
    const res = { ...mockRes(), setHeader() {} };
    return bookingApiHandler({ method: 'POST', url: '/api/telegram-bookings', user, body }, res).then(() => res);
  };

  it('inserts trimmed, de-duplicated names in one statement', async () => {
    const res = await callApi({ role: 'ADMIN' }, {
      action: 'import_team',
      members: [
        { name: '  Sok   Dara ', role: 'Driver', phone: '012' },
        { name: 'sok dara', role: 'Staff' },
        { name: '', role: 'Staff' },
        { name: 'Lina', role: 'Staff', phone: '' },
      ],
    });
    expect(res.body).toMatchObject({ ok: true, data: { inserted: 1 } });
    const inserts = calls.filter((c) => /INSERT IGNORE INTO `tbl_tg_booking_team`/.test(c.sql));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params).toEqual(['Sok Dara', 'Driver', '012', 'Lina', 'Staff', null]);
  });

  it('is admin only', async () => {
    const res = await callApi({ role: 'USER' }, { action: 'import_team', members: [{ name: 'X' }] });
    expect(res.statusCode).toBe(403);
    expect(calls.some((c) => /INSERT IGNORE INTO `tbl_tg_booking_team`/.test(c.sql))).toBe(false);
  });
});
