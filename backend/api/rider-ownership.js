/**
 * A Rider (role DELIVERY) may only record a delivery for a parcel that is with them right now:
 * the latest Out of Delivery scan of that barcode is in their name, and it has not come back
 * to the hub (Hold) or been returned since.
 */
import { executeQuery } from './remote-mysql.js';

/** "MR.TY SAMBO", "Mr. Ty  Sambo" → "TYSAMBO" */
export function riderKey(name) {
  return String(name || '')
    .toUpperCase()
    .trim()
    .replace(/^(MRS|MR|MS|MISS)\b\.?/, '')
    .replace(/[^A-Z0-9ក-៿]/g, '');
}

const toMs = (v) => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
};
const fmt = (v) => {
  const t = toMs(v);
  return t === null ? '' : new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
};

/**
 * Returns one Khmer message per barcode the rider may not record (empty array = all fine).
 * oodRows: { barcode, tracking, rider_name, created_at, operation_code }; hold/returnRows: { barcode, created_at }.
 */
export function findOwnershipProblems(barcodes, userName, oodRows, holdRows = [], returnRows = []) {
  const me = riderKey(userName);
  const problems = [];
  for (const raw of barcodes) {
    const code = String(raw || '').trim().toUpperCase();
    if (!code) continue;
    const runs = oodRows
      .filter((r) => [r.barcode, r.tracking].some((v) => String(v || '').trim().toUpperCase() === code))
      .sort((a, b) => (toMs(b.created_at) ?? 0) - (toMs(a.created_at) ?? 0));
    const last = runs[0];
    if (!last) {
      problems.push(`«${code}» មិនទាន់បានស្កេន Out of Delivery ឲ្យអ្នកទេ`);
      continue;
    }
    if (!me || riderKey(last.rider_name) !== me) {
      problems.push(`«${code}» ជាកញ្ចប់របស់ ${last.rider_name || 'Rider ផ្សេង'} (ចេញ ${fmt(last.created_at)}) មិនមែនរបស់អ្នកទេ`);
      continue;
    }
    const since = toMs(last.created_at) ?? 0;
    const back = [...holdRows, ...returnRows].some(
      (r) => String(r.barcode || '').trim().toUpperCase() === code && (toMs(r.created_at) ?? 0) > since
    );
    if (back) problems.push(`«${code}» ត្រូវបានយកមកឃ្លាំងវិញ (Hold/Return) ហើយ មិននៅជាមួយអ្នកទៀតទេ`);
  }
  return problems;
}

export async function checkRiderOwnership(barcodes, userName) {
  const codes = [...new Set(barcodes.map((b) => String(b || '').trim().toUpperCase()).filter(Boolean))];
  if (codes.length === 0) return [];
  const [ood, hold, ret] = await Promise.all([
    executeQuery(
      'SELECT barcode, tracking, rider_name, created_at, operation_code FROM tbl_out_of_delivery WHERE barcode IN (?) OR tracking IN (?)',
      [codes, codes]
    ),
    executeQuery('SELECT barcode, created_at FROM tbl_hold_remaining WHERE barcode IN (?)', [codes]),
    executeQuery('SELECT barcode, created_at FROM tbl_return_shipments WHERE barcode IN (?)', [codes]),
  ]);
  return findOwnershipProblems(codes, userName, ood.rows, hold.rows, ret.rows);
}
