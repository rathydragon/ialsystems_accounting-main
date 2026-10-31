/**
 * Customer Pickup: numbered pieces of one parcel ("X/1", "X/2" …) each carry the
 * parcel's full Kgs and Pcs from the Data Report. For totals:
 * - every piece counts as 1 Pcs
 * - the parcel's Kgs counts once (on its lowest-numbered piece)
 * - the parcel's Pcs from the Data Report is the expected number of pieces,
 *   so fewer scanned pieces means some are missing.
 */
import { stripPieceSuffix } from '../services/warehouseScanService';

export interface PieceFields {
  barcode?: string;
  kgs?: number | null;
  pcs?: number | null;
}

export interface PieceAdjusted {
  /** Kgs to show / add up for this row (0 when another piece already carries it) */
  kgs?: number;
  /** Pcs to show / add up for this row */
  pcs?: number;
  /** true when the barcode is a numbered piece ("X/3") */
  isPiece: boolean;
  /** Piece row whose weight is counted on another piece of the same parcel */
  kgsOnOtherPiece?: string;
}

export interface PieceShortage {
  base: string;
  scanned: number;
  expected: number;
  missing: number;
}

export interface PieceSummary {
  rows: PieceAdjusted[];
  totalKgs: number;
  totalPcs: number;
  shortages: PieceShortage[];
}

const pieceNo = (code: string): number => {
  const m = code.match(/\/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
};

const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
};

export function summarizePieces<T>(items: T[], get: (it: T) => PieceFields): PieceSummary {
  const fields = items.map(get);
  const rows: PieceAdjusted[] = fields.map((f) => ({ kgs: num(f.kgs), pcs: num(f.pcs), isPiece: false }));

  // Group numbered pieces by their parcel code
  const groups = new Map<string, number[]>();
  fields.forEach((f, i) => {
    const code = (f.barcode || '').toUpperCase().trim();
    const base = stripPieceSuffix(code);
    if (!base) return;
    const list = groups.get(base) || [];
    list.push(i);
    groups.set(base, list);
  });

  const shortages: PieceShortage[] = [];
  groups.forEach((idxs, base) => {
    const codes = idxs.map((i) => (fields[i].barcode || '').toUpperCase().trim());
    const kgsValues = idxs.map((i) => num(fields[i].kgs) ?? 0);
    const parcelKgs = Math.max(0, ...kgsValues);
    const expected = Math.max(0, ...idxs.map((i) => Math.round(num(fields[i].pcs) ?? 0)));
    const scanned = new Set(codes).size;

    // Weight goes on the lowest-numbered piece
    let carrier = 0;
    idxs.forEach((_, k) => {
      if (pieceNo(codes[k]) < pieceNo(codes[carrier])) carrier = k;
    });
    idxs.forEach((i, k) => {
      rows[i] = {
        isPiece: true,
        pcs: 1,
        kgs: k === carrier ? parcelKgs : 0,
        kgsOnOtherPiece: k === carrier ? undefined : codes[carrier]
      };
    });

    if (expected > scanned) {
      shortages.push({ base, scanned, expected, missing: expected - scanned });
    }
  });

  const totalKgs = Math.round(rows.reduce((n, r) => n + (r.kgs && r.kgs > 0 ? r.kgs : 0), 0) * 100) / 100;
  const totalPcs = rows.reduce((n, r) => n + (r.pcs && r.pcs > 0 ? r.pcs : 0), 0);
  shortages.sort((a, b) => a.base.localeCompare(b.base));
  return { rows, totalKgs, totalPcs, shortages };
}

/** "SOCAM783528 (3/4)" lines for a tooltip / warning */
export function shortageText(shortages: PieceShortage[]): string {
  return shortages.map((s) => `${s.base} — ស្កេនបាន ${s.scanned}/${s.expected} (ខ្វះ ${s.missing})`).join('\n');
}
