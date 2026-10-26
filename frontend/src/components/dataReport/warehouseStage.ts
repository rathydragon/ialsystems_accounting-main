import { DistributionReportItem, WarehouseScanItem, WarehouseScanType } from '../../types';

export type WarehouseStageKey = WarehouseScanType | 'DIST_REPORT';

export interface WarehouseStageDef {
  key: WarehouseStageKey;
  label: string; // short English label for the badge
  labelKh: string;
  tone: 'teal' | 'blue' | 'sky' | 'indigo' | 'amber' | 'violet' | 'orange' | 'emerald';
}

/** Steps in the order a package normally moves through them. */
export const WAREHOUSE_STAGES: WarehouseStageDef[] = [
  { key: 'CUSTOMER_PICKUP', label: 'Customer', labelKh: 'ទទួលពីអតិថិជន', tone: 'teal' },
  { key: 'SCAN_IN', label: 'Scan In', labelKh: 'ចូលឃ្លាំង', tone: 'blue' },
  { key: 'SCAN_OUT', label: 'Scan Out', labelKh: 'ចេញពីឃ្លាំង', tone: 'sky' },
  { key: 'ARRIVED_HUB', label: 'Arrived Hub', labelKh: 'ទទួលចូលឃ្លាំង', tone: 'indigo' },
  { key: 'HOLD_REMAINING', label: 'Hold', labelKh: 'នៅសល់ក្នុងឃ្លាំង', tone: 'amber' },
  { key: 'OUT_OF_DELIVERY', label: 'With Rider', labelKh: 'ចេញចែកចាយ (Rider)', tone: 'violet' },
  { key: 'RETURN_SHIPMENTS', label: 'Return', labelKh: 'បង្វិលត្រឡប់', tone: 'orange' },
  { key: 'DIST_REPORT', label: 'Reported', labelKh: 'របាយការណ៍ចែកចាយ', tone: 'emerald' }
];

const STAGE_ORDER = new Map(WAREHOUSE_STAGES.map((s, i) => [s.key, i]));

export interface WarehouseStageStep extends WarehouseStageDef {
  count: number;
  /** Time of the first event for this step (ms), used to order the history. */
  firstTime?: number;
  last?: { date?: string; createdAt?: string; detail?: string; by?: string };
}

export interface WarehouseStage {
  /** The step the package is at right now (the most recent event). */
  current: WarehouseStageStep;
  /** Every step, in process order, with how many times it happened. */
  steps: WarehouseStageStep[];
  /** Only the steps that happened, in the order they first happened. */
  history: WarehouseStageStep[];
}

const toTime = (date?: string, createdAt?: string): number => {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  if (!isNaN(t)) return t;
  const d = date ? Date.parse(date) : NaN;
  return isNaN(d) ? 0 : d;
};

const detailOf = (s: WarehouseScanItem): string | undefined => {
  switch (s.scanType) {
    case 'OUT_OF_DELIVERY':
      return s.riderName || undefined;
    case 'HOLD_REMAINING':
    case 'RETURN_SHIPMENTS':
      return s.holdReason || s.remarks || undefined;
    case 'SCAN_IN':
      return s.shelfLocation || s.location || undefined;
    case 'SCAN_OUT':
      return s.destination || s.truckNo || undefined;
    case 'ARRIVED_HUB':
      return s.destination || undefined;
    case 'CUSTOMER_PICKUP':
      return s.driverName || undefined;
    default:
      return undefined;
  }
};

/**
 * Works out which warehouse step a package is at.
 * The current step is the latest event by time; events with the same time
 * are ranked by process order, so the later step wins.
 */
export function computeWarehouseStage(
  scans: WarehouseScanItem[],
  dist?: DistributionReportItem
): WarehouseStage | null {
  if (scans.length === 0 && !dist) return null;

  const steps: WarehouseStageStep[] = WAREHOUSE_STAGES.map((def) => ({ ...def, count: 0 }));
  const byKey = new Map(steps.map((s) => [s.key, s]));

  let best: { key: WarehouseStageKey; time: number } | null = null;
  const consider = (key: WarehouseStageKey, time: number) => {
    if (
      !best ||
      time > best.time ||
      (time === best.time && (STAGE_ORDER.get(key) ?? 0) > (STAGE_ORDER.get(best.key) ?? 0))
    ) {
      best = { key, time };
    }
  };

  for (const s of scans) {
    const step = byKey.get(s.scanType);
    if (!step) continue;
    const time = toTime(s.date, s.createdAt);
    const prevTime = step.last ? toTime(step.last.date, step.last.createdAt) : -1;
    step.count += 1;
    if (step.firstTime === undefined || time < step.firstTime) step.firstTime = time;
    if (time >= prevTime) {
      step.last = { date: s.date, createdAt: s.createdAt, detail: detailOf(s), by: s.createdBy || s.operatorEmail };
    }
    consider(s.scanType, time);
  }

  if (dist) {
    const step = byKey.get('DIST_REPORT')!;
    step.count = 1;
    step.firstTime = toTime(dist.date, dist.createdAt);
    step.last = {
      date: dist.date,
      createdAt: dist.createdAt,
      detail: [dist.name, dist.remarks].filter(Boolean).join(' · ') || undefined,
      by: dist.createdBy || dist.operatorEmail
    };
    consider('DIST_REPORT', toTime(dist.date, dist.createdAt));
  }

  // TS can't see the assignment inside `consider`, so widen the type back.
  const bestKey = (best as { key: WarehouseStageKey } | null)?.key;
  if (!bestKey) return null;
  const history = steps
    .filter((s) => s.count > 0)
    .sort(
      (a, b) =>
        (a.firstTime ?? 0) - (b.firstTime ?? 0) || (STAGE_ORDER.get(a.key) ?? 0) - (STAGE_ORDER.get(b.key) ?? 0)
    );
  return { current: byKey.get(bestKey)!, steps, history };
}
