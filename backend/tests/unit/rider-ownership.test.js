import { describe, it, expect } from 'vitest';
import { findOwnershipProblems, riderKey } from '../../api/rider-ownership.js';

const ood = (barcode, rider_name, created_at) => ({ barcode, tracking: '', rider_name, created_at, operation_code: 'OP' });

describe('riderKey', () => {
  it('ignores title, dots, spaces and case', () => {
    expect(riderKey('MR.TY SAMBO')).toBe('TYSAMBO');
    expect(riderKey('Mr. Ty  Sambo')).toBe('TYSAMBO');
    expect(riderKey('MR. NOY SAMNIENG')).toBe(riderKey('MR.NOY SAMNIENG'));
  });
});

describe('findOwnershipProblems', () => {
  it('allows a parcel whose latest run is the rider', () => {
    expect(findOwnershipProblems(['E1'], 'MR.TY SAMBO', [ood('E1', 'MR. TY SAMBO', '2026-11-03T09:00:00Z')])).toEqual([]);
  });

  it('blocks a parcel that is with another rider', () => {
    const p = findOwnershipProblems(['E2'], 'MR.TY SAMBO', [ood('E2', 'MR.ROS CHHIN', '2026-11-03T09:00:00Z')]);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('MR.ROS CHHIN');
  });

  it('uses the latest run: handed over from A to B means only B may record it', () => {
    const rows = [ood('E3', 'MR.A', '2026-11-03T02:00:00Z'), ood('E3', 'MR.B', '2026-11-03T07:00:00Z')];
    expect(findOwnershipProblems(['E3'], 'MR.A', rows)).toHaveLength(1);
    expect(findOwnershipProblems(['E3'], 'MR.B', rows)).toEqual([]);
  });

  it('blocks a parcel never scanned out', () => {
    expect(findOwnershipProblems(['E4'], 'MR.A', [])).toHaveLength(1);
  });

  it('blocks a parcel brought back to the hub after the run', () => {
    const p = findOwnershipProblems(['E5'], 'MR.A', [ood('E5', 'MR.A', '2026-11-03T02:00:00Z')], [{ barcode: 'E5', created_at: '2026-11-03T08:00:00Z' }]);
    expect(p).toHaveLength(1);
  });
});
