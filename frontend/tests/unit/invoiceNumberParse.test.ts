import { describe, it, expect } from 'vitest';
import { parseTrackingInput } from '../../src/services/invoiceNumberService';

describe('parseTrackingInput', () => {
  it('reads one number per line, upper-cased and de-duplicated', () => {
    expect(parseTrackingInput('inv001\nINV002, inv001\n\n').trackings).toEqual(['INV001', 'INV002']);
  });

  it('expands a range and keeps the zero padding', () => {
    expect(parseTrackingInput('INV0008-INV0011').trackings).toEqual(['INV0008', 'INV0009', 'INV0010', 'INV0011']);
    expect(parseTrackingInput('A098 - 101').trackings).toEqual(['A098', 'A099', 'A100', 'A101']);
  });

  it('rejects a backwards range', () => {
    const r = parseTrackingInput('INV0050-INV0010');
    expect(r.trackings).toEqual([]);
    expect(r.error).toBeTruthy();
  });

  it('leaves plain numbers with letters alone', () => {
    expect(parseTrackingInput('E12812232191').trackings).toEqual(['E12812232191']);
  });
});
