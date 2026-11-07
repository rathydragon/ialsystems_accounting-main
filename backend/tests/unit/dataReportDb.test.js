import { describe, it, expect } from 'vitest';
import {
  assignStableKeys,
  buildRecords,
  latestDeliveredReports,
  parseCsv,
  pickDuplicateLosers,
  planDistributionOverlay,
  toDbColumnNames
} from '../../api/data-report-db.js';

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

describe('Data Report (DB) stable keys (rows kept after they leave the sheet)', () => {
  // What MySQL holds after syncing `rows`
  const store = (rows) =>
    buildRecords([HEADER, ...rows]).records.map((r) => ({
      row_key: r.rowKey,
      barcode_key: r.barcodeKey,
      row_hash: r.hash,
      is_removed: 0
    }));
  const sync = (rows, stored) => {
    const { records } = buildRecords([HEADER, ...rows]);
    assignStableKeys(records, stored);
    return Object.fromEntries(records.map((r) => [r.rowKey, r.values[1]]));
  };

  it('keeps the usual keys when nothing shifted', () => {
    const rows = [['X1', 'new', ''], ['A1', 'a', ''], ['X1', 'old', '']];
    expect(sync(rows, store(rows))).toEqual({ 'X1#2': 'new', A1: 'a', X1: 'old' });
  });

  it('deleting the oldest duplicate from the sheet does not move the newer row onto its key', () => {
    const before = [['X1', 'new', ''], ['X1', 'old', '']];
    expect(sync([['X1', 'new', '']], store(before))).toEqual({ 'X1#2': 'new' });
  });

  it('an edited row keeps its key', () => {
    const before = [['X1', 'new', ''], ['X1', 'old', '']];
    expect(sync([['X1', 'new', 'DONE'], ['X1', 'old', '']], store(before))).toEqual({ 'X1#2': 'new', X1: 'old' });
  });

  it('a new row never takes the key of a row that left the sheet', () => {
    const stored = store([['X1', 'old', '']]).map((r) => ({ ...r, is_removed: 1 }));
    expect(sync([['X1', 'reused barcode', '']], stored)).toEqual({ 'X1#2': 'reused barcode' });
  });

  it('a row that comes back unchanged gets its old key back', () => {
    const stored = store([['X1', 'old', '']]).map((r) => ({ ...r, is_removed: 1 }));
    expect(sync([['X1', 'old', '']], stored)).toEqual({ X1: 'old' });
  });

  it('editing the only sheet row keeps its "#2" key when the plain key left the sheet', () => {
    const stored = [
      ...store([['X1', 'barcode only', '']]).map((r) => ({ ...r, is_removed: 1 })),
      ...store([['X1', 'half', ''], ['X1', 'barcode only', '']]).filter((r) => r.row_key === 'X1#2')
    ];
    expect(sync([['X1', 'full', 'DELIVERED']], stored)).toEqual({ 'X1#2': 'full' });
  });

  it('new duplicates are numbered above every number used before', () => {
    const before = [['X1', 'b', ''], ['X1', 'a', '']];
    expect(sync([['X1', 'c', ''], ['X1', 'b', '']], store(before))).toEqual({ 'X1#3': 'c', 'X1#2': 'b' });
  });
});

describe('Data Report (DB) one row per barcode', () => {
  const row = (id, row_key, is_removed = 0) => ({ id, row_key, barcode_key: row_key.split('#')[0], is_removed });

  it('hides the old copy that left the sheet and keeps the sheet row', () => {
    expect([...pickDuplicateLosers([row(1, 'X1', 1), row(2, 'X1#2', 0)])]).toEqual(['1']);
  });

  it('keeps the sheet row even when its number is lower', () => {
    expect([...pickDuplicateLosers([row(1, 'X1', 0), row(2, 'X1#2', 1)])]).toEqual(['2']);
  });

  it('two copies in the sheet: keeps the newest (highest number)', () => {
    expect([...pickDuplicateLosers([row(1, 'X1', 0), row(2, 'X1#2', 0), row(3, 'X1#3', 0)])].sort()).toEqual(['1', '2']);
  });

  it('never hides single rows or rows without a barcode', () => {
    expect(pickDuplicateLosers([row(1, 'A1'), row(2, 'NO_BARCODE'), row(3, 'NO_BARCODE#2')]).size).toBe(0);
  });
});

describe('Distribution Report → Data Report', () => {
  const reports = latestDeliveredReports([
    { barcode: ' ab1 ', name: 'Old', report_date: '01-Nov-2026', updated_at: '2026-11-01T01:00:00Z' },
    { barcode: 'AB1', name: 'Sokha', report_date: '03-Nov-2026', updated_at: '2026-11-03T01:00:00Z' },
    { barcode: 'NOTDEL', name: 'X', report_date: '03-Nov-2026', status: 'Returned' }
  ]);
  const row = (over) => ({ id: 1, barcode_key: 'AB1', dup_hidden: 0, dist_applied: 0, dist_orig: null, status: 'UPLEFT', sign: '', date: '', ...over });

  it('keeps the newest delivered report per barcode and skips other statuses', () => {
    expect(reports.get('AB1')).toEqual({ name: 'Sokha', date: '03-Nov-2026' });
    expect(reports.has('NOTDEL')).toBe(false);
  });

  it('fills STATUS, SIGN AND NAME and TIME AND DATE and keeps the sheet values', () => {
    expect(planDistributionOverlay([row()], reports)).toEqual([
      {
        id: 1,
        values: { status: 'DELIVERED', sign: 'Sokha', date: '03-Nov-2026' },
        applied: 1,
        orig: JSON.stringify({ status: 'UPLEFT', sign: '', date: '' })
      }
    ]);
  });

  it('leaves a row the sheet already marks DELIVERED', () => {
    expect(planDistributionOverlay([row({ status: 'delivered', sign: 'Sheet' })], reports)).toEqual([]);
  });

  it('skips hidden duplicate copies and barcodes without a report', () => {
    expect(planDistributionOverlay([row({ dup_hidden: 1 }), row({ id: 2, barcode_key: 'ZZ9' })], reports)).toEqual([]);
  });

  it('updates a filled row when the report changes, keeping the first sheet values', () => {
    const orig = JSON.stringify({ status: 'UPLEFT', sign: '', date: '' });
    const filled = row({ dist_applied: 1, dist_orig: orig, status: 'DELIVERED', sign: 'Old', date: '01-Nov-2026' });
    expect(planDistributionOverlay([filled], reports)).toEqual([
      { id: 1, values: { status: 'DELIVERED', sign: 'Sokha', date: '03-Nov-2026' }, applied: 1, orig }
    ]);
    const current = { ...filled, sign: 'Sokha', date: '03-Nov-2026' };
    expect(planDistributionOverlay([current], reports)).toEqual([]);
  });

  it('puts the sheet values back when the report is deleted', () => {
    const filled = row({
      barcode_key: 'GONE1',
      dist_applied: 1,
      dist_orig: JSON.stringify({ status: 'OUT FOR DELIVERY', sign: '', date: '02-Nov-2026' }),
      status: 'DELIVERED'
    });
    expect(planDistributionOverlay([filled], reports)).toEqual([
      { id: 1, values: { status: 'OUT FOR DELIVERY', sign: '', date: '02-Nov-2026' }, applied: 0, orig: null }
    ]);
  });

  it('only writes the columns the sheet has', () => {
    expect(planDistributionOverlay([row()], reports, ['status'])[0].values).toEqual({ status: 'DELIVERED' });
  });
});
