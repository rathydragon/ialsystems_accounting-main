import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildIssueInvoiceRows, fillIssueInvoiceTemplate, parseIssueInvoiceFile } from '../../src/utils/issueInvoiceExcel';

const table = (rows: any[][]) => rows.map((r) => ({ raw: r, text: r.map((v) => String(v ?? '')) }));

describe('buildIssueInvoiceRows', () => {
  it('finds the header, reads prices, and skips blanks, duplicates and bad prices', () => {
    const parsed = buildIssueInvoiceRows(
      table([
        ['Issue invoice Nov'],
        ['Tracking', 'Unit Price', 'Customers Name', 'Noted', 'Extra'],
        ['e123 456', 12.5, 'ABC Co., Ltd', 'paid', 'x'],
        ['E2', '1,250.00', '', '', ''],
        ['E3', '', 'No price', '', ''],
        ['E123456', 99, 'dup', '', ''],
        ['E4', 'abc', '', '', ''],
        ['', 5, 'no tracking', '', ''],
        ['', '', '', '', ''],
      ])
    );
    expect(parsed.rows).toEqual([
      { tracking: 'E123456', unitPrice: 12.5, customerName: 'ABC Co., Ltd', note: 'paid' },
      { tracking: 'E2', unitPrice: 1250, customerName: '', note: '' },
      { tracking: 'E3', unitPrice: null, customerName: 'No price', note: '' },
    ]);
    expect(parsed.duplicatesInFile).toBe(1);
    expect(parsed.missingTracking).toBe(1);
    expect(parsed.badPrice).toEqual(['E4']);
    expect(parsed.ignoredHeaders).toEqual(['Extra']);
  });

  it('accepts Khmer headers', () => {
    const parsed = buildIssueInvoiceRows(table([['Tracking', 'តម្លៃ', 'អតិថិជន', 'ចំណាំ'], ['A1', 3, 'សុខា', 'x']]));
    expect(parsed.rows).toEqual([{ tracking: 'A1', unitPrice: 3, customerName: 'សុខា', note: 'x' }]);
  });

  it('needs a Tracking column', () => {
    expect(() => buildIssueInvoiceRows(table([['Customers Name', 'Noted'], ['A', 'b']]))).toThrow();
  });
});

describe('upload template', () => {
  it('a filled-in template uploads back correctly', async () => {
    const wb = new ExcelJS.Workbook();
    fillIssueInvoiceTemplate(wb);
    const ws = wb.getWorksheet('Issue Invoice')!;
    ws.getCell('A2').value = '00123';
    ws.getCell('B2').value = 8.75;
    ws.getCell('C2').value = 'Customer A';
    ws.getCell('D2').value = 'note';
    const buf = await wb.xlsx.writeBuffer();
    const parsed = await parseIssueInvoiceFile(new File([buf], 'template.xlsx'));
    expect(parsed.rows).toEqual([{ tracking: '00123', unitPrice: 8.75, customerName: 'Customer A', note: 'note' }]);
  });
});
