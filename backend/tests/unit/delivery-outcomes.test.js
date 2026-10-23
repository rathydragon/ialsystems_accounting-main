import { describe, it, expect } from 'vitest';
import { decideOutcomes, parsePodTime, readOutcomeRequest } from '../../api/delivery-outcomes.js';

// Run left the hub at 09:00 Cambodia time on 23-10-2026 (02:00 UTC)
const RUN = '2026-10-23T02:00:00.000Z';
const item = (barcode, since = RUN, key = barcode) => ({ key, barcode, since: Date.parse(since) });

describe('parsePodTime', () => {
  it('reads Cambodia local time', () => {
    expect(new Date(parsePodTime('23-10-2026 09:29:47')).toISOString()).toBe('2026-10-23T02:29:47.000Z');
  });
  it('treats a date without time as end of day', () => {
    expect(new Date(parsePodTime('23-10-2026')).toISOString()).toBe('2026-10-23T16:59:59.000Z');
  });
  it('returns null for empty or unknown text', () => {
    expect(parsePodTime('')).toBeNull();
    expect(parsePodTime('yesterday')).toBeNull();
  });
});

describe('readOutcomeRequest', () => {
  it('keeps one entry per run + barcode and upper-cases barcodes', () => {
    const items = readOutcomeRequest({ items: [{ key: 'A|e1', barcode: 'e1', since: RUN }, { barcode: '' }] });
    expect(items).toEqual([{ key: 'A|e1', barcode: 'E1', since: Date.parse(RUN) }]);
  });
  it('rejects very large requests', () => {
    expect(() => readOutcomeRequest({ items: Array.from({ length: 3001 }, (_, i) => ({ barcode: `B${i}` })) })).toThrow();
  });
});

describe('decideOutcomes', () => {
  it('marks POD Delivered as delivered with signer', () => {
    const out = decideOutcomes(
      [item('E1')],
      [{ id: 1, tracking_number: 'E1', status: 'Delivered', delivery_on: '23-10-2026 10:00:00', delivery_by: 'drye052', sign_by: 'Dara' }],
      [],
      []
    );
    expect(out.E1).toMatchObject({ outcome: 'DELIVERED', signBy: 'Dara', by: 'drye052' });
  });

  it('uses the Hold reason when the rider brought it back', () => {
    const out = decideOutcomes(
      [item('E2')],
      [],
      [],
      [{ barcode: 'E2', hold_reason: 'ទាក់ទងអ្នកទទួលមិនបាន', created_at: '2026-10-23T08:00:00Z', created_by: 'hub' }]
    );
    expect(out.E2).toMatchObject({ outcome: 'BACK_TO_HUB', reason: 'ទាក់ទងអ្នកទទួលមិនបាន' });
  });

  it('ignores a Hold scan from before the run started', () => {
    const out = decideOutcomes([item('E3')], [], [], [{ barcode: 'E3', hold_reason: 'old', created_at: '2026-10-22T08:00:00Z' }]);
    expect(out.E3.outcome).toBe('PENDING');
  });

  it('uses the Return reason', () => {
    const out = decideOutcomes([item('E4')], [], [{ barcode: 'E4', return_reason: 'Customer Refused', created_at: '2026-10-23T05:00:00Z' }], []);
    expect(out.E4).toMatchObject({ outcome: 'RETURNED', reason: 'Customer Refused' });
  });

  it('falls back to a failed POD status as the reason', () => {
    const out = decideOutcomes([item('E5')], [{ id: 2, tracking_number: 'E5', status: 'Delivery not accepted', delivery_on: '' }], [], []);
    expect(out.E5).toMatchObject({ outcome: 'FAILED', reason: 'Delivery not accepted' });
  });

  it('is PENDING when nothing is known, keeping the POD status for context', () => {
    const out = decideOutcomes([item('E6')], [{ id: 3, tracking_number: 'E6', status: 'Pickup' }], [], []);
    expect(out.E6).toEqual({ outcome: 'PENDING', podStatus: 'Pickup' });
  });

  it('judges each run separately: held after run 1, delivered on run 2', () => {
    const run2 = '2026-10-24T02:00:00.000Z';
    const out = decideOutcomes(
      [item('E7', RUN, 'R1|E7'), item('E7', run2, 'R2|E7')],
      [{ id: 4, tracking_number: 'E7', status: 'Delivered', delivery_on: '24-10-2026 11:00:00' }],
      [],
      [{ barcode: 'E7', hold_reason: 'Customer Postponed', created_at: '2026-10-23T09:00:00Z' }]
    );
    expect(out['R1|E7'].outcome).toBe('BACK_TO_HUB');
    expect(out['R2|E7'].outcome).toBe('DELIVERED');
  });
});
