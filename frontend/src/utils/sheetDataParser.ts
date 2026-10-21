import { DatabaseRecord } from '../types';

/**
 * Parse the Google Sheets "Data" tab (GViz JSON) into records.
 * Columns are found by their header name (BARCODE, PICK UP, DESTINATION, PAYMENT, USD, KHM, DATE),
 * so adding, removing or moving a column in the sheet does not shift the values.
 * Sheets without recognisable headers fall back to the old fixed layout: BARCODE, PAYMENT, USD, KHM, DATE.
 */

type FieldKey = 'barcode' | 'pickup' | 'destination' | 'payment' | 'usd' | 'khm' | 'date';

const HEADER_ALIASES: Record<FieldKey, string[]> = {
  barcode: ['BARCODE', 'TRACKING', 'CODE'],
  pickup: ['PICKUP', 'PICK UP', 'PICK-UP', 'SENDER'],
  destination: ['DESTINATION', 'DEST', 'TO'],
  payment: ['PAYMENT', 'PAYMENT TYPE', 'PAY'],
  usd: ['USD', '$'],
  khm: ['KHM', 'KHR', 'RIEL', '៛'],
  date: ['DATE']
};

const LEGACY_LAYOUT: Partial<Record<FieldKey, number>> = { barcode: 0, payment: 1, usd: 2, khm: 3, date: 4 };

const norm = (v: unknown) => String(v ?? '').toUpperCase().replace(/\s+/g, ' ').trim();

function matchHeaders(labels: string[]): Partial<Record<FieldKey, number>> | null {
  const map: Partial<Record<FieldKey, number>> = {};
  labels.forEach((label, i) => {
    const l = norm(label);
    if (!l) return;
    (Object.keys(HEADER_ALIASES) as FieldKey[]).forEach((key) => {
      if (map[key] === undefined && HEADER_ALIASES[key].includes(l)) map[key] = i;
    });
  });
  return map.barcode !== undefined ? map : null;
}

function cellText(cell: any): string {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  return String(cell.v).trim();
}

function cellDate(cell: any): string {
  if (!cell) return '';
  if (cell.f) return String(cell.f);
  const v = cell.v;
  if (typeof v === 'string' && v.startsWith('Date(')) {
    const parts = v.replace('Date(', '').replace(')', '').split(',');
    if (parts.length >= 3) {
      return `${parts[2].trim()}-${Number(parts[1].trim()) + 1}-${parts[0].trim()}`;
    }
  }
  return v === undefined || v === null ? '' : String(v);
}

export function parseGvizDataRecords(table: any): DatabaseRecord[] {
  const rows: any[] = Array.isArray(table?.rows) ? table.rows : [];
  const labels: string[] = Array.isArray(table?.cols) ? table.cols.map((c: any) => c?.label || '') : [];

  // Headers usually come back as column labels; sometimes GViz leaves them as the first row instead
  let columns = matchHeaders(labels);
  let start = 0;
  if (!columns && rows.length > 0) {
    columns = matchHeaders((rows[0]?.c || []).map(cellText));
    if (columns) start = 1;
  }
  const col = columns || LEGACY_LAYOUT;

  const at = (c: any[], key: FieldKey) => (col[key] === undefined ? undefined : c[col[key] as number]);
  const parsed: DatabaseRecord[] = [];

  for (let idx = start; idx < rows.length; idx++) {
    const c = rows[idx]?.c || [];
    const barcode = cellText(at(c, 'barcode'));
    if (!barcode || norm(barcode) === 'BARCODE') continue;

    let usd = Number(at(c, 'usd')?.v) || 0;
    let khm = Number(at(c, 'khm')?.v) || 0;
    // Currency auto-correction: a small amount typed in KHM is USD, a large round amount typed in USD is KHM
    if (khm > 0 && khm < 100 && usd === 0) {
      usd = khm;
      khm = 0;
    } else if (usd >= 500 && usd % 100 === 0 && khm === 0) {
      khm = usd;
      usd = 0;
    }

    parsed.push({
      id: `row-${idx + 1}-${barcode}`,
      barcode,
      pickup: cellText(at(c, 'pickup')) || undefined,
      destination: cellText(at(c, 'destination')) || undefined,
      payment: cellText(at(c, 'payment')) || 'CASH',
      usd,
      khm,
      date: cellDate(at(c, 'date'))
    });
  }
  return parsed;
}
