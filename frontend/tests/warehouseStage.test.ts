import { computeWarehouseStage } from '../src/components/dataReport/warehouseStage';
import { WarehouseScanItem } from '../src/types';

const scan = (scanType: WarehouseScanItem['scanType'], createdAt: string, extra: Partial<WarehouseScanItem> = {}) =>
  ({
    id: `${scanType}-${createdAt}`,
    scanType,
    barcode: 'E1',
    date: createdAt.slice(0, 10),
    createdAt,
    operatorEmail: '',
    createdBy: '',
    ...extra
  }) as WarehouseScanItem;

describe('computeWarehouseStage', () => {
  it('returns null when there is no warehouse history', () => {
    expect(computeWarehouseStage([])).toBeNull();
  });

  it('picks the most recent step', () => {
    const stage = computeWarehouseStage([
      scan('SCAN_IN', '2026-10-24T01:00:00Z'),
      scan('OUT_OF_DELIVERY', '2026-10-25T02:00:00Z', { riderName: 'MR.A' }),
      scan('SCAN_OUT', '2026-10-24T05:00:00Z')
    ])!;
    expect(stage.current.key).toBe('OUT_OF_DELIVERY');
    expect(stage.current.last?.detail).toBe('MR.A');
    expect(stage.steps.map((s) => s.count)).toEqual([0, 1, 1, 0, 0, 1, 0, 0]);
  });

  it('lists every step that happened, in time order', () => {
    const stage = computeWarehouseStage([
      scan('SCAN_OUT', '2026-10-26T04:42:00Z'),
      scan('SCAN_IN', '2026-10-26T00:56:00Z'),
      scan('OUT_OF_DELIVERY', '2026-10-26T06:00:00Z'),
      scan('HOLD_REMAINING', '2026-10-26T05:00:00Z')
    ])!;
    expect(stage.history.map((s) => s.key)).toEqual(['SCAN_IN', 'SCAN_OUT', 'HOLD_REMAINING', 'OUT_OF_DELIVERY']);
  });

  it('a hold after a rider run becomes the current step', () => {
    const stage = computeWarehouseStage([
      scan('OUT_OF_DELIVERY', '2026-10-25T02:00:00Z'),
      scan('HOLD_REMAINING', '2026-10-25T10:00:00Z', { holdReason: 'No answer' })
    ])!;
    expect(stage.current.key).toBe('HOLD_REMAINING');
  });

  it('uses process order to break same-time ties', () => {
    const stage = computeWarehouseStage([
      scan('SCAN_OUT', '2026-10-25T02:00:00Z'),
      scan('SCAN_IN', '2026-10-25T02:00:00Z')
    ])!;
    expect(stage.current.key).toBe('SCAN_OUT');
  });

  it('a later distribution report wins and counts rider runs', () => {
    const stage = computeWarehouseStage(
      [scan('OUT_OF_DELIVERY', '2026-10-24T02:00:00Z'), scan('OUT_OF_DELIVERY', '2026-10-25T02:00:00Z')],
      { id: 'd', barcode: 'E1', name: 'Dara', date: '2026-10-25', remarks: '', createdAt: '2026-10-25T09:00:00Z' }
    )!;
    expect(stage.current.key).toBe('DIST_REPORT');
    expect(stage.steps.find((s) => s.key === 'OUT_OF_DELIVERY')!.count).toBe(2);
  });
});
