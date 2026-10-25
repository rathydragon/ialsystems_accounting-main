import { describe, it, expect } from 'vitest';
import { bmRowsFromSheetDb, matchBMRecord } from '../../src/services/dataBMService';

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
