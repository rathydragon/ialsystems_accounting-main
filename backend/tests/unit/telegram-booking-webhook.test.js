import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = [];
let bookingRow = null;
let parentReply = null; // row in tbl_tg_booking_replies that the incoming message answers
let notifyBooking = null; // booking row read back when the bot DMs the pickup person
let openPickups = []; // ASSIGNED bookings of the driver writing to the bot

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
    if (/SELECT \* FROM `tbl_tg_bookings` WHERE id/.test(sql)) return { rows: notifyBooking ? [notifyBooking] : [] };
    if (/status = 'ASSIGNED' ORDER BY assigned_at/.test(sql)) return { rows: openPickups };
    // Booking lookups for status changes: by thread root, by button id, by DM message
    if (/SELECT id, picked_up_by FROM `tbl_tg_bookings`/.test(sql)) return { rows: bookingRow ? [bookingRow] : [] };
    if (/SELECT id, message_id, picked_up_by FROM `tbl_tg_bookings` WHERE id/.test(sql)) return { rows: bookingRow ? [{ message_id: 10, ...bookingRow }] : [] };
    if (/WHERE notify_chat_id = \? AND notify_message_id = \?/.test(sql)) return { rows: bookingRow && params[1] === 900 ? [{ message_id: 10, ...bookingRow }] : [] };
    if (/SELECT id, assign_message_id/.test(sql)) return { rows: bookingRow ? [bookingRow] : [] };
    if (/FROM `tbl_tg_booking_team`/.test(sql)) {
      return { rows: [
        { id: 1, name: 'Rin', aliases: 'rin driver', role: 'Driver', phone: '012345678', active: 1 },
        { id: 2, name: 'Phear', aliases: '', role: 'Driver', phone: null, tg_user_id: 777, active: 1 },
        { id: 3, name: 'Old Sok', aliases: '', role: 'Driver', phone: null, tg_user_id: 888, active: 0 },
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
const notifyUpdates = () => calls.filter((c) => /SET notify_status/.test(c.sql));
const tgSend = vi.fn(); // Telegram Bot API (sendMessage for the pickup DM)

describe('telegram booking webhook', () => {
  beforeEach(() => {
    calls.length = 0;
    bookingRow = { id: 7, assign_message_id: null };
    parentReply = null;
    notifyBooking = null;
    openPickups = [];
    tgSend.mockClear();
    tgSend.mockImplementation(async () => ({ json: async () => ({ ok: true, result: {} }) }));
    vi.stubGlobal('fetch', tgSend);
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

  // Group messages carry the sender's Telegram user id
  const group = { id: -1001, type: 'supergroup' };
  const groupReply = (fromId, firstName, text, extra = {}) => ({
    message: {
      message_id: 80, date: 1760000200, chat: group, from: { id: fromId, is_bot: false, first_name: firstName }, text, ...extra,
      reply_to_message: { message_id: 10, date: 1759999000, chat: group, text: 'Unicity has shipment' },
    },
  });

  it('assigns the member named by a mention from the name picker', async () => {
    const res = await post(groupReply(556322085, 'Long Khu', 'Phear S.', {
      entities: [{ type: 'text_mention', offset: 0, length: 8, user: { id: 777, is_bot: false, first_name: 'Phear' } }],
    }));
    expect(res.body).toMatchObject({ reason: 'assigned' });
    expect(updates()[0].params.slice(0, 3)).toEqual(['Phear', 'Phear S.', 0]);
  });

  it('lets a team member pick up an unassigned booking by replying to it', async () => {
    const res = await post(groupReply(777, 'Phear', 'ok I take it'));
    expect(res.body).toMatchObject({ reason: 'self_assigned' });
    expect(updates()[0].params[0]).toBe('Phear');
  });

  it('does not let a team member take a booking someone already has', async () => {
    bookingRow = { id: 7, assign_message_id: 60, picked_up_by: 'Rin' };
    const res = await post(groupReply(777, 'Phear', 'me too'));
    expect(res.body).toMatchObject({ reason: 'not_authorized' });
    expect(updates()).toHaveLength(0);
  });

  it('DMs the pickup person and records it as sent', async () => {
    notifyBooking = { id: 7, chat_id: -1001234, message_id: 10, picked_up_by: 'Phear', customer: 'Unicity', phone: '097', text: 'Unicity has <shipment>', assigned_by: 'Phear' };
    await post(groupReply(777, 'Phear', 'ok I take it'));
    expect(tgSend).toHaveBeenCalledTimes(1);
    const [url, init] = tgSend.mock.calls[0];
    expect(url).toMatch(/\/sendMessage$/);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ chat_id: 777, parse_mode: 'HTML' });
    expect(body.text).toContain('Unicity has &lt;shipment&gt;');
    expect(body.text).toContain('https://t.me/c/1234/10');
    expect(notifyUpdates()[0].params.slice(0, 3)).toEqual(['sent', null, 'Phear']);
  });

  it('records need_start when the person never opened the bot', async () => {
    notifyBooking = { id: 7, chat_id: -1001, message_id: 10, picked_up_by: 'Phear' };
    tgSend.mockImplementation(async () => ({ json: async () => ({ ok: false, description: "Forbidden: bot can't initiate conversation with a user" }) }));
    await post(groupReply(777, 'Phear', 'ok'));
    expect(notifyUpdates()[0].params.slice(0, 2)).toEqual(['failed', 'need_start']);
  });

  it('does not DM when the pickup name has no Telegram id', async () => {
    notifyBooking = { id: 7, chat_id: -1001, message_id: 10, picked_up_by: 'Rin' };
    await post(reply('B Khu 011', 'rin driver'));
    expect(tgSend).not.toHaveBeenCalled();
    expect(notifyUpdates()[0].params[0]).toBe('no_id');
  });

  it('answers /start in a private chat with the user id', async () => {
    const res = await post({ message: { message_id: 1, date: 1, chat: { id: 555, type: 'private' }, from: { id: 555, is_bot: false, first_name: 'Dara' }, text: '/start' } });
    expect(res.body).toMatchObject({ method: 'sendMessage', chat_id: 555, parse_mode: 'HTML' });
    expect(res.body.text).toContain('<code>555</code>');
  });

  const statusUpdates = () => calls.filter((c) => /SET status = \?, updated_by/.test(c.sql));

  it('marks the booking done when its pickup person replies "បានយក"', async () => {
    bookingRow = { id: 7, assign_message_id: 60, picked_up_by: 'Phear' };
    const res = await post(groupReply(777, 'Phear', 'បានយកហើយបង'));
    expect(res.body).toMatchObject({ reason: 'status_done' });
    expect(statusUpdates()[0].params).toEqual(['DONE', 'Phear (Telegram)', 7]);
    expect(updates().filter((c) => /picked_up_by = \?/.test(c.sql))).toHaveLength(0);
  });

  it('lets the dispatcher cancel instead of assigning a driver called "បោះបង់"', async () => {
    bookingRow = { id: 7, assign_message_id: 60, picked_up_by: 'Rin' };
    const res = await post(reply('B Khu 011', 'បោះបង់'));
    expect(res.body).toMatchObject({ reason: 'status_cancelled' });
    expect(statusUpdates()[0].params[0]).toBe('CANCELLED');
  });

  it('ignores "បានយក" from someone who is not the pickup person', async () => {
    bookingRow = { id: 7, assign_message_id: 60, picked_up_by: 'Rin' };
    const res = await post(groupReply(777, 'Phear', 'បានយក'));
    expect(res.body).toMatchObject({ reason: 'not_authorized' });
    expect(statusUpdates()).toHaveLength(0);
  });

  it('changes the status from a thread reply too', async () => {
    parentReply = { root: 10 };
    bookingRow = { id: 7, picked_up_by: 'Phear' };
    const res = await post(groupReply(777, 'Phear', 'យកបាន'));
    expect(res.body).toMatchObject({ reason: 'status_done' });
    expect(statusUpdates()[0].params[0]).toBe('DONE');
  });

  it('handles the DM buttons for the pickup person only', async () => {
    bookingRow = { id: 7, picked_up_by: 'Phear' };
    const press = (fromId) => post({ callback_query: { id: 'cb1', from: { id: fromId, first_name: 'P' }, data: 'st:7:DONE', message: { message_id: 900, chat: { id: fromId } } } });
    const denied = await press(999);
    expect(denied.body).toMatchObject({ method: 'answerCallbackQuery', callback_query_id: 'cb1' });
    expect(statusUpdates()).toHaveLength(0);
    const ok = await press(777);
    expect(ok.body).toMatchObject({ method: 'answerCallbackQuery' });
    expect(statusUpdates()[0].params[0]).toBe('DONE');
    expect(tgSend.mock.calls.some(([url]) => /editMessageReplyMarkup$/.test(url))).toBe(true);
  });

  it('asks for confirmation before changing the status', async () => {
    bookingRow = { id: 7, picked_up_by: 'Phear' };
    const press = (data) => post({ callback_query: { id: 'cb2', from: { id: 777, first_name: 'P' }, data, message: { message_id: 900, chat: { id: 777 } } } });
    const markupOf = () => JSON.parse(tgSend.mock.calls.at(-1)[1].body).reply_markup.inline_keyboard;

    await press('ask:7:DONE');
    expect(statusUpdates()).toHaveLength(0);
    expect(markupOf()[1].map((b) => b.callback_data)).toEqual(['st:7:DONE', 'back:7']);

    await press('back:7');
    expect(statusUpdates()).toHaveLength(0);
    expect(markupOf()[0].map((b) => b.callback_data)).toEqual(['ask:7:DONE', 'ask:7:CANCELLED']);

    await press('st:7:DONE');
    expect(statusUpdates()[0].params[0]).toBe('DONE');
  });

  it('sends the pickup DM with ask buttons', async () => {
    notifyBooking = { id: 7, chat_id: -1001, message_id: 10, picked_up_by: 'Phear' };
    await post(groupReply(777, 'Phear', 'ok'));
    const body = JSON.parse(tgSend.mock.calls[0][1].body);
    expect(body.reply_markup.inline_keyboard[0].map((b) => b.callback_data)).toEqual(['ask:7:DONE', 'ask:7:CANCELLED']);
  });

  it('accepts a text reply to the DM', async () => {
    bookingRow = { id: 7, picked_up_by: 'Phear' };
    const res = await post({ message: {
      message_id: 901, date: 1, chat: { id: 777, type: 'private' }, from: { id: 777, is_bot: false, first_name: 'Phear' },
      text: 'បោះបង់', reply_to_message: { message_id: 900, chat: { id: 777, type: 'private' }, from: { id: 1, is_bot: true } },
    } });
    expect(res.body).toMatchObject({ method: 'sendMessage', chat_id: 777 });
    expect(statusUpdates()[0].params[0]).toBe('CANCELLED');
  });

  const dm = (fromId, text) => post({ message: { message_id: 950, date: 1, chat: { id: fromId, type: 'private' }, from: { id: fromId, is_bot: false, first_name: 'Phear' }, text } });

  it('applies a plain "បានយក" in the DM to the only open pickup', async () => {
    openPickups = [{ id: 7, message_id: 10, customer: 'Unicity' }];
    const res = await dm(777, 'បានយក');
    expect(res.body).toMatchObject({ method: 'sendMessage', chat_id: 777 });
    expect(res.body.text).toContain('#10');
    expect(statusUpdates()[0].params.slice(0, 1)).toEqual(['DONE']);
    const open = calls.find((c) => /status = 'ASSIGNED'/.test(c.sql));
    expect(open.params).toEqual(['Phear']);
  });

  it('asks which one when the driver has several open pickups', async () => {
    openPickups = [{ id: 7, message_id: 10 }, { id: 8, message_id: 11 }];
    const res = await dm(777, 'បានយក');
    expect(res.body.text).toContain('#11');
    expect(statusUpdates()).toHaveLength(0);
  });

  it('answers people who are not in the team with their user id', async () => {
    const res = await dm(4242, 'បានយក');
    expect(res.body.text).toContain('4242');
    expect(statusUpdates()).toHaveLength(0);
  });

  it('ignores inactive members replying', async () => {
    const res = await post(groupReply(888, 'Old Sok', 'mine'));
    expect(res.body).toMatchObject({ reason: 'not_authorized' });
    expect(updates()).toHaveLength(0);
  });
});

describe('statusFromText', () => {
  it('reads done / cancel words and ignores negations', async () => {
    const { statusFromText } = await import('../../api/telegram-booking.js');
    expect(statusFromText('បានយកហើយ')).toBe('DONE');
    expect(statusFromText('យកបាន')).toBe('DONE');
    expect(statusFromText('Cancel please')).toBe('CANCELLED');
    expect(statusFromText('បោះបង់')).toBe('CANCELLED');
    expect(statusFromText('មិនទាន់យកបាន')).toBeNull();
    expect(statusFromText('do not cancel')).toBeNull();
    expect(statusFromText('VIN SAVITH')).toBeNull();
  });
});

describe('parseTgUserId', () => {
  it('accepts digits, empty means none, rejects the rest', async () => {
    const { parseTgUserId } = await import('../../api/telegram-booking.js');
    expect(parseTgUserId(' 882173247 ')).toBe(882173247);
    expect(parseTgUserId('')).toBeNull();
    expect(parseTgUserId(null)).toBeNull();
    expect(parseTgUserId('@king')).toBeUndefined();
    expect(parseTgUserId('-100123')).toBeUndefined();
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

  it('posts a mention for members with a Telegram id', async () => {
    memberStatus.set(104, 'member');
    const res = await inline(104, 'phear');
    expect(res.body.results[0].input_message_content).toEqual({
      message_text: '<a href="tg://user?id=777">Phear</a>', parse_mode: 'HTML',
    });
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
