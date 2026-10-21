/**
 * Clean up Telegram Booking rows created from replies.
 *
 * Before the reply-thread fix, a reply to a reply (e.g. King Sroin answering the dispatcher's
 * "seng") made the bot save the dispatcher's reply as a new booking. This script finds those
 * bookings, moves the replies filed under them to the real booking post, and deletes them.
 *
 *   node scripts/fix-tg-reply-threads.js          list what would change (read-only)
 *   node scripts/fix-tg-reply-threads.js --apply  make the changes
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const { executeQuery } = await import('../api/remote-mysql.js');

const T_BOOKINGS = 'tbl_tg_bookings';
const T_REPLIES = 'tbl_tg_booking_replies';
const apply = process.argv.includes('--apply');

// A booking is wrong when the same message was also stored as a reply.
const { rows: wrong } = await executeQuery(
  `SELECT b.id, b.chat_id, b.message_id, b.posted_at, b.author, b.text, b.status, b.picked_up_by, b.updated_by,
          b.pickup_raw, b.pickup_unmatched, b.assigned_by, b.assigned_at, b.assign_message_id
   FROM \`${T_BOOKINGS}\` b
   JOIN \`${T_REPLIES}\` r ON r.chat_id = b.chat_id AND r.message_id = b.message_id
   ORDER BY b.posted_at`
);

if (wrong.length === 0) {
  console.log('No bookings created from replies. Nothing to do.');
  process.exit(0);
}

// Every reply in the affected chats, to walk each chain up to the real booking post.
const chats = [...new Set(wrong.map((w) => String(w.chat_id)))];
const { rows: replies } = await executeQuery(
  `SELECT chat_id, message_id, reply_to_message_id FROM \`${T_REPLIES}\` WHERE chat_id IN (?)`,
  [chats]
);
const parentOf = new Map(replies.map((r) => [`${r.chat_id}:${r.message_id}`, Number(r.reply_to_message_id)]));

function rootOf(chatId, messageId) {
  let id = Number(messageId);
  const seen = new Set();
  while (parentOf.has(`${chatId}:${id}`) && !seen.has(id)) {
    seen.add(id);
    id = parentOf.get(`${chatId}:${id}`);
  }
  return id;
}

const { rows: real } = await executeQuery(
  `SELECT chat_id, message_id, id, text, picked_up_by FROM \`${T_BOOKINGS}\` WHERE chat_id IN (?)`,
  [chats]
);
const bookingByMsg = new Map(real.map((b) => [`${b.chat_id}:${b.message_id}`, b]));

const plan = wrong.map((w) => {
  const root = rootOf(w.chat_id, w.message_id);
  const target = bookingByMsg.get(`${w.chat_id}:${root}`);
  // The dispatcher picked a driver on the wrong row while the real booking has none: keep that pickup.
  const carryPickup = Boolean(target && w.picked_up_by && !target.picked_up_by);
  return { w, root, target, carryPickup };
});

console.log(`${wrong.length} booking(s) were created from replies:\n`);
for (const { w, root, target, carryPickup } of plan) {
  console.log(`#${w.message_id}  ${new Date(w.posted_at).toISOString().slice(0, 16)}  ${w.author || '?'}: ${String(w.text || '').slice(0, 60)}`);
  console.log(`   → belongs to booking #${root}${target ? `: ${String(target.text || '').slice(0, 60)}` : ' (post not in database)'}`);
  if (carryPickup) console.log(`   ✓ pickup "${w.picked_up_by}" moves to booking #${root} (it has none)`);
  else if (w.picked_up_by) console.log(`   – pickup "${w.picked_up_by}" dropped; booking #${root} keeps "${target?.picked_up_by || '-'}"`);
  if (w.updated_by) console.log(`   ⚠ was edited in the app by ${w.updated_by}`);
}

if (!apply) {
  console.log('\nRead-only run. Add --apply to move the replies and delete these bookings.');
  process.exit(0);
}

// Make sure the thread columns exist (same migration the webhook runs).
const { ensureBookingTables } = await import('../api/telegram-booking.js');
await ensureBookingTables();

let moved = 0;
let deleted = 0;
for (const { w, root, target, carryPickup } of plan) {
  if (!target) {
    console.log(`Skip #${w.message_id}: booking #${root} is not in the database`);
    continue;
  }
  // Replies anywhere below the wrong booking now hang off the real post.
  const { rows: res } = await executeQuery(
    `UPDATE \`${T_REPLIES}\` SET root_message_id = ? WHERE chat_id = ? AND root_message_id = ?`,
    [root, w.chat_id, w.message_id]
  );
  moved += res.affectedRows || 0;
  if (carryPickup) {
    await executeQuery(
      `UPDATE \`${T_BOOKINGS}\`
       SET picked_up_by = ?, pickup_raw = ?, pickup_unmatched = ?, assigned_by = ?, assigned_at = ?,
           assign_message_id = ?, status = IF(status = 'PENDING', 'ASSIGNED', status)
       WHERE id = ?`,
      [w.picked_up_by, w.pickup_raw, w.pickup_unmatched, w.assigned_by, w.assigned_at, w.assign_message_id, target.id]
    );
  }
  // Replies to the wrong booking were made inside a thread. The one whose pickup was carried over
  // stays marked as the assignment; the rest are thread replies.
  await executeQuery(
    `UPDATE \`${T_REPLIES}\` SET reason = 'thread', accepted = 0
     WHERE chat_id = ? AND reply_to_message_id = ? AND message_id <> ?`,
    [w.chat_id, w.message_id, carryPickup ? w.assign_message_id || 0 : 0]
  );
  const { rows: del } = await executeQuery(`DELETE FROM \`${T_BOOKINGS}\` WHERE id = ?`, [w.id]);
  deleted += del.affectedRows || 0;
}

console.log(`\nDone: ${moved} reply row(s) moved, ${deleted} wrong booking(s) deleted.`);
process.exit(0);
