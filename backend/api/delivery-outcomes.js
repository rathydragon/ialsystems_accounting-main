/**
 * Rider run results (Out of Delivery) → what happened to each barcode after the rider took it out.
 *
 * Read-only. Sources, all on Hostinger MySQL:
 *   - shipment_detail (POD app): 'Delivered', or a failed-delivery status such as 'Delivery not accepted'
 *   - tbl_return_shipments: scanned for Return
 *   - tbl_hold_remaining:  scanned back into the hub (Hold)
 *
 * Each run is judged on its own: the first event after the run started wins. So a parcel that was
 * held after run 1 and delivered on run 2 shows "back to hub" on run 1 and "delivered" on run 2.
 *
 * Served as the action get_delivery_outcomes on /api/remote-mysql (no new Vercel function).
 */
import { executeQuery } from './remote-mysql.js';

const MAX_ITEMS = 3000;

/** POD statuses that mean the rider tried and failed (the status text is the reason). */
const POD_FAILED = /not\s*delivered|not\s*accepted|unsuccessful|consignee\s+has\s+moved|returned|on\s*hold|destroy/i;

const clean = (v, max = 100) => String(v ?? '').trim().slice(0, max);
const toMs = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
};

/**
 * POD delivery_on is Cambodia local time text: 'DD-MM-YYYY HH:mm:ss', sometimes only 'DD-MM-YYYY'.
 * A date without a time counts as the end of that day.
 */
export function parsePodTime(v) {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(clean(v, 30));
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m;
  const hasTime = h !== undefined;
  const utc = Date.UTC(+y, +mo - 1, +d, hasTime ? +h : 23, hasTime ? +mi : 59, hasTime ? +(s || 0) : 59);
  return utc - 7 * 3600 * 1000; // UTC+7
}

/** Reads { items: [{ key, barcode, since }] }; since is when that barcode left on the run. */
export function readOutcomeRequest(body) {
  const list = Array.isArray(body?.items) ? body.items : [];
  if (list.length > MAX_ITEMS) throw Object.assign(new Error(`ច្រើនបំផុត ${MAX_ITEMS} លេខក្នុងមួយដង`), { status: 400 });
  const items = [];
  for (const it of list) {
    const barcode = clean(it?.barcode).toUpperCase();
    if (!barcode) continue;
    items.push({ key: clean(it?.key, 200) || barcode, barcode, since: toMs(it?.since) });
  }
  return items;
}

const groupByBarcode = (rows, field) => {
  const m = new Map();
  for (const r of rows) {
    const k = clean(r[field]).toUpperCase();
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};

/** One result per item: DELIVERED, RETURNED, BACK_TO_HUB, FAILED (POD only) or PENDING. */
export function decideOutcomes(items, podRows, returnRows, holdRows) {
  const pods = groupByBarcode(podRows, 'tracking_number');
  const returns = groupByBarcode(returnRows, 'barcode');
  const holds = groupByBarcode(holdRows, 'barcode');

  const out = {};
  for (const { key, barcode, since } of items) {
    const after = (at) => since === null || at === null || at >= since;
    const events = [];
    let failed = null;
    let podStatus = null;
    for (const p of pods.get(barcode) || []) {
      const status = clean(p.status, 100);
      if (!podStatus || status === 'Delivered') podStatus = status || podStatus;
      const at = parsePodTime(p.delivery_on);
      if (status === 'Delivered') {
        // Delivered before this run started belongs to an earlier run, unless nothing else explains it
        events.push({
          at: at ?? Number.MAX_SAFE_INTEGER,
          late: !after(at),
          result: {
            outcome: 'DELIVERED',
            at: clean(p.delivery_on, 30) || null,
            by: clean(p.delivery_by, 50) || null,
            signBy: clean(p.sign_by, 100) || null,
          },
        });
      } else if (POD_FAILED.test(status)) {
        failed = { outcome: 'FAILED', reason: status, at: clean(p.delivery_on, 30) || null, by: clean(p.delivery_by, 50) || null };
      }
    }
    for (const r of returns.get(barcode) || []) {
      const at = toMs(r.created_at);
      if (after(at)) events.push({ at: at ?? 0, result: { outcome: 'RETURNED', reason: clean(r.return_reason, 255) || null, at: r.created_at || null, by: r.created_by || null } });
    }
    for (const r of holds.get(barcode) || []) {
      const at = toMs(r.created_at);
      if (after(at)) events.push({ at: at ?? 0, result: { outcome: 'BACK_TO_HUB', reason: clean(r.hold_reason, 255) || null, at: r.created_at || null, by: r.created_by || null } });
    }

    const current = events.filter((e) => !e.late).sort((a, b) => a.at - b.at);
    const pick = current[0] || events[0] || null;
    out[key] = pick ? { ...pick.result, podStatus } : failed ? { ...failed, podStatus } : { outcome: 'PENDING', podStatus };
  }
  return out;
}

export async function getDeliveryOutcomes(body) {
  const items = readOutcomeRequest(body);
  if (items.length === 0) return {};
  const codes = [...new Set(items.map((i) => i.barcode))];
  const [pod, ret, hold] = await Promise.all([
    executeQuery(
      'SELECT id, tracking_number, status, sign_by, delivery_on, delivery_by FROM shipment_detail WHERE tracking_number IN (?)',
      [codes]
    ),
    executeQuery('SELECT barcode, return_reason, created_by, created_at FROM tbl_return_shipments WHERE barcode IN (?)', [codes]),
    executeQuery('SELECT barcode, hold_reason, created_by, created_at FROM tbl_hold_remaining WHERE barcode IN (?)', [codes]),
  ]);
  return decideOutcomes(items, pod.rows, ret.rows, hold.rows);
}
