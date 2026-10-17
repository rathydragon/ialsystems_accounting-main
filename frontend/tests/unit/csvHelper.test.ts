import { describe, it, expect } from 'vitest';
import { sanitizeCsvCell, formatCsv } from '../../src/utils/csvHelper';

describe('CSV Formula Injection Prevention (CWE-1236)', () => {
  describe('sanitizeCsvCell', () => {
    it('should prepend single quote to neutralize formula triggers (=, +, -, @)', () => {
      expect(sanitizeCsvCell('=1+1')).toBe(`"'=1+1"`);
      expect(sanitizeCsvCell('=cmd|\' /C calc\'!A0')).toBe(`"'=cmd|\' /C calc\'!A0"`);
      expect(sanitizeCsvCell('+SUM(A1:A10)')).toBe(`"'+SUM(A1:A10)"`);
      expect(sanitizeCsvCell('-5+2')).toBe(`"'-5+2"`);
      expect(sanitizeCsvCell('@SUM(B1:B5)')).toBe(`"'@SUM(B1:B5)"`);
    });

    it('should neutralize formula triggers even if preceded by whitespace', () => {
      expect(sanitizeCsvCell('   =HYPERLINK("http://evil.com")')).toBe(`"'   =HYPERLINK(""http://evil.com"")"`);
      expect(sanitizeCsvCell('\t=calc')).toBe(`"'\t=calc"`);
    });

    it('should escape internal double quotes according to RFC 4180', () => {
      expect(sanitizeCsvCell('John "The Boss" Smith')).toBe(`"John ""The Boss"" Smith"`);
    });

    it('should preserve standard numeric values without quoting or single quote', () => {
      expect(sanitizeCsvCell(12345)).toBe('12345');
      expect(sanitizeCsvCell(45.5)).toBe('45.5');
      expect(sanitizeCsvCell(0)).toBe('0');
    });

    it('should handle null and undefined safely', () => {
      expect(sanitizeCsvCell(null)).toBe('""');
      expect(sanitizeCsvCell(undefined)).toBe('""');
    });

    it('should safely format normal strings and Khmer Unicode', () => {
      expect(sanitizeCsvCell('ភ្នំពេញ')).toBe(`"ភ្នំពេញ"`);
      expect(sanitizeCsvCell('Payment Completed')).toBe(`"Payment Completed"`);
    });
  });

  describe('formatCsv', () => {
    it('should prepend UTF-8 BOM and format rows with sanitized cells', () => {
      const headers = ['Name', 'Amount', 'Formula'];
      const rows = [
        ['Alice', 100, '=2+2'],
        ['Bob "The Builder"', 250, 'Safe']
      ];

      const csv = formatCsv(headers, rows);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain(`"Alice",100,"'=2+2"`);
      expect(csv).toContain(`"Bob ""The Builder""",250,"Safe"`);
    });
  });
});
