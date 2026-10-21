import { test, expect } from 'vitest';
import { parseGvizDataRecords } from '../../src/utils/sheetDataParser';

const v = (x: any) => ({ v: x });

test('reads columns by header name (BARCODE, PICK UP, DESTINATION, PAYMENT, USD, KHM, DATE)', () => {
  const table = {
    cols: ['BARCODE', 'PICK UP', 'DESTINATION', 'PAYMENT', 'USD', 'KHM', 'DATE'].map((label) => ({ label })),
    rows: [
      { c: [v('DO25008394'), v('MR.TO SAORY'), v('KRATIE'), v('COLLECT'), v(1.93), null, { v: 'Date(2026,9,20)', f: '20-Oct-2026' }] },
      { c: [v('DO25008583'), v('MS.KHEM SREYTOUCH'), v('BTB'), v('COLLECT'), null, v(30000), { f: '20-Oct-2026' }] }
    ]
  };
  const r = parseGvizDataRecords(table);
  expect(r[0]).toMatchObject({ barcode: 'DO25008394', pickup: 'MR.TO SAORY', destination: 'KRATIE', payment: 'COLLECT', usd: 1.93, khm: 0, date: '20-Oct-2026' });
  expect(r[1]).toMatchObject({ usd: 0, khm: 30000 });
});

test('finds headers in the first row when GViz leaves labels empty', () => {
  const table = {
    cols: Array.from({ length: 7 }, () => ({ label: '' })),
    rows: [
      { c: ['BARCODE', 'PICK UP', 'DESTINATION', 'PAYMENT', 'USD', 'KHM', 'DATE'].map(v) },
      { c: [v('E1'), v('A'), v('B'), v('CASH'), v(2), null, { f: 'x' }] }
    ]
  };
  expect(parseGvizDataRecords(table)).toEqual([expect.objectContaining({ barcode: 'E1', pickup: 'A', destination: 'B', payment: 'CASH', usd: 2 })]);
});

test('falls back to the old 5-column layout without headers', () => {
  const table = { cols: [{ label: '' }], rows: [{ c: [v('E1'), v('CASH'), v(3), null, { f: 'd' }] }] };
  expect(parseGvizDataRecords(table)[0]).toMatchObject({ barcode: 'E1', payment: 'CASH', usd: 3, date: 'd' });
});
