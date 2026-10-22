import { describe, it, expect } from 'vitest';
import { buildRecords, parseCsv, toDbColumnNames } from '../../api/data-report-db.js';

const HEADER = ['BARCODE', 'CONSIGNEE', 'STATUS'];
const keys = (rows) => buildRecords([HEADER, ...rows]).records.map((r) => r.rowKey);

describe('Data Report (DB) row keys', () => {
  it('uses the barcode as the key', () => {
    expect(keys([['ab1', 'A', 'UPLEFT']])).toEqual(['AB1']);
  });

  it('numbers duplicate barcodes from the bottom (oldest row keeps the plain key)', () => {
    expect(keys([['X1', 'new', ''], ['X1', 'old', '']])).toEqual(['X1#2', 'X1']);
  });

  it('a new duplicate added at the top does not change the keys of older rows', () => {
    const before = buildRecords([HEADER, ['X1', 'second', ''], ['Y1', 'y', ''], ['X1', 'first', '']]).records;
    const after = buildRecords([HEADER, ['X1', 'third', ''], ['X1', 'second', ''], ['Y1', 'y', ''], ['X1', 'first', '']]).records;
    const byKey = (recs) => Object.fromEntries(recs.map((r) => [r.rowKey, r.values[1]]));
    expect(byKey(after)).toMatchObject(byKey(before)); // old keys still hold the same rows
    expect(byKey(after)['X1#3']).toBe('third');
  });

  it('skips fully empty rows and keeps sheet order', () => {
    const { records } = buildRecords([HEADER, ['B2', '', ''], ['', '', ''], ['A1', '', '']]);
    expect(records.map((r) => r.rowKey)).toEqual(['B2', 'A1']);
  });

  it('a changed cell changes the hash; an unchanged row keeps it', () => {
    const a = buildRecords([HEADER, ['A1', 'x', 'UPLEFT']]).records[0].hash;
    const b = buildRecords([HEADER, ['A1', 'x', 'UPLEFT']]).records[0].hash;
    const c = buildRecords([HEADER, ['A1', 'x', 'DELIVERED']]).records[0].hash;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('Data Report (DB) helpers', () => {
  it('turns sheet headers into safe, unique column names', () => {
    expect(toDbColumnNames(['PICK UP', 'RE-DEST', 'COD USD', 'id', 'PICK UP'])).toEqual([
      'pick_up',
      're_dest',
      'cod_usd',
      'id_2',
      'pick_up_2'
    ]);
  });

  it('parses quoted CSV with commas, quotes and new lines', () => {
    expect(parseCsv('"a","b, c"\n"say ""hi""","line1\nline2"')).toEqual([
      ['a', 'b, c'],
      ['say "hi"', 'line1\nline2']
    ]);
  });
});
