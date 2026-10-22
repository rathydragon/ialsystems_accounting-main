import { describe, it, expect } from 'vitest';
import { recordsFromSheetDb } from '../../src/utils/sheetDataParser';
import { bmRowsFromSheetDb, matchBMRecord } from '../../src/services/dataBMService';

describe('Data (tbl_collection_data) → payment records', () => {
  const columns = ['BARCODE', 'PICK UP', 'DESTINATION', 'PAYMENT', 'USD', 'KHM', 'DATE'];

  it('maps columns by header name and reads amounts', () => {
    const recs = recordsFromSheetDb(columns, [
      ['E128', 'MR.A', 'SHV', 'COLLECT', '2.2', '', '21-Oct-2026'],
      ['HN25', '', '', 'CASH', '', '12,000', '1-Sep-2026']
    ]);
    expect(recs[0]).toMatchObject({ barcode: 'E128', pickup: 'MR.A', destination: 'SHV', payment: 'COLLECT', usd: 2.2, khm: 0, date: '21-Oct-2026' });
    expect(recs[1]).toMatchObject({ barcode: 'HN25', payment: 'CASH', usd: 0, khm: 12000 });
  });

  it('keeps the currency auto-correction (small KHM is USD, large round USD is KHM)', () => {
    const recs = recordsFromSheetDb(columns, [
      ['A1', '', '', 'CASH', '', '5', 'x'],
      ['A2', '', '', 'CASH', '8000', '', 'x']
    ]);
    expect(recs[0]).toMatchObject({ usd: 5, khm: 0 });
    expect(recs[1]).toMatchObject({ usd: 0, khm: 8000 });
  });

  it('skips rows without a barcode', () => {
    expect(recordsFromSheetDb(columns, [['', 'x', '', '', '', '', '']])).toEqual([]);
  });
});

describe('Data_BM (tbl_data_bm) → rows for matchBMRecord', () => {
  it('finds a medicine parcel by AWBN with its amounts', () => {
    const { rows, columns } = bmRowsFromSheetDb(
      ['AWBN', 'Delivery Date', 'Receiver Name', 'USD', 'KHM', 'Receiver Address', 'HANDLE BY', 'TRANSFER TO', 'DEST'],
      [['SOCAM775834', '1-Oct-2026', 'Pharmacy A', '108.29', '439,000', 'Kampong Speu', 'MR.ROS', 'K.SPEU', 'K.SPEU']]
    );
    expect(columns[0]).toMatchObject({ id: 'col_0', label: 'AWBN' });
    const m = matchBMRecord('socam775834', rows, columns);
    expect(m).toMatchObject({ usd: 108.29, khm: 439000 });
  });
});
