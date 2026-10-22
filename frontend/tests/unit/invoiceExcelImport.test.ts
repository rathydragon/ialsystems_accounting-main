import { describe, it, expect } from 'vitest';
import { buildInvoiceRows, toInvoiceStatus, toIsoDate } from '../../src/utils/invoiceExcelImport';

const table = (rows: any[][]) => rows.map((r) => ({ raw: r, text: r.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ''))) }));

describe('toIsoDate', () => {
  it('reads Excel dates, ISO and day/month/year text', () => {
    expect(toIsoDate(new Date(Date.UTC(2026, 9, 5)), '')).toBe('2026-10-05');
    expect(toIsoDate(null, '2026-1-5')).toBe('2026-01-05');
    expect(toIsoDate(null, '05/10/2026')).toBe('2026-10-05');
    expect(toIsoDate(null, '10/25/2026')).toBe('2026-10-25'); // month first when day > 12
    expect(toIsoDate(null, '46000')).toBe('2025-12-09');
    expect(toIsoDate(null, '')).toBe('');
  });
});

describe('toInvoiceStatus', () => {
  it('maps English / Khmer words and falls back on CUSTOMER', () => {
    expect(toInvoiceStatus('USED', false)).toBe('ISSUED');
    expect(toInvoiceStatus('Unused', true)).toBe('PREPARED');
    expect(toInvoiceStatus('មិនទាន់ប្រើ', true)).toBe('PREPARED');
    expect(toInvoiceStatus('បានបើកឲ្យ', false)).toBe('ISSUED');
    expect(toInvoiceStatus('Cancelled', true)).toBe('CANCELLED');
    expect(toInvoiceStatus('', true)).toBe('ISSUED');
    expect(toInvoiceStatus('', false)).toBe('PREPARED');
  });
});

describe('buildInvoiceRows', () => {
  it('finds the header row, skips blanks and duplicates, and copies DATE to the issue day', () => {
    const parsed = buildInvoiceRows(
      table([
        ['Invoice list 2025'],
        ['TRACKING', 'CUSTOMER', 'PROVINCE', 'NAME PREPAIRE', 'DATE', 'STATUS', 'Extra'],
        ['inv001', 'ABC', 'Kandal', 'Sokha', '01/02/2025', '', 'x'],
        ['INV002', '', '', 'Sokha', '01/02/2025', '', ''],
        ['INV001', 'dup', '', '', '', '', ''],
        ['', 'no number', '', '', '', '', ''],
        ['', '', '', '', '', '', ''],
      ])
    );
    expect(parsed.rows).toEqual([
      { tracking: 'INV001', customer: 'ABC', province: 'Kandal', namePrepare: 'Sokha', date: '2025-02-01', status: 'ISSUED', issuedDate: '2025-02-01', issuedBy: '' },
      { tracking: 'INV002', customer: '', province: '', namePrepare: 'Sokha', date: '2025-02-01', status: 'PREPARED', issuedDate: '', issuedBy: '' },
    ]);
    expect(parsed.duplicatesInFile).toBe(1);
    expect(parsed.missingTracking).toBe(1);
    expect(parsed.ignoredHeaders).toEqual(['Extra']);
  });

  it('needs a TRACKING column', () => {
    expect(() => buildInvoiceRows(table([['CUSTOMER', 'DATE'], ['A', '2025-01-01']]))).toThrow();
  });
});
