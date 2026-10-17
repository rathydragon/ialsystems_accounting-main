import { describe, it, expect } from 'vitest';
import {
  roundUSD,
  roundKHR,
  addUSD,
  subtractUSD,
  formatUSD,
  formatKHR,
  parseCurrency
} from '../../src/utils/currency';

describe('Currency & Financial Precision Utility (Unit Tests)', () => {
  describe('roundUSD', () => {
    it('should correctly round floating point cents without precision drift', () => {
      expect(roundUSD(0.1 + 0.2)).toBe(0.3);
      expect(roundUSD(10.555)).toBe(10.56);
      expect(roundUSD(10.554)).toBe(10.55);
    });

    it('should handle string inputs and symbols gracefully', () => {
      expect(roundUSD('$1,234.567')).toBe(1234.57);
      expect(roundUSD('')).toBe(0);
      expect(roundUSD(null)).toBe(0);
      expect(roundUSD(undefined)).toBe(0);
    });
  });

  describe('roundKHR', () => {
    it('should round to the nearest whole riel', () => {
      expect(roundKHR(4100.4)).toBe(4100);
      expect(roundKHR(4100.6)).toBe(4101);
      expect(roundKHR('4,100.5 ៛')).toBe(4101);
    });
  });

  describe('addUSD and subtractUSD', () => {
    it('should add values without IEEE-754 precision issues', () => {
      expect(addUSD(0.1, 0.2)).toBe(0.3);
      expect(addUSD(19.99, 0.01)).toBe(20);
    });

    it('should subtract values accurately', () => {
      expect(subtractUSD(20, 0.01)).toBe(19.99);
      expect(subtractUSD(0.3, 0.1)).toBe(0.2);
    });
  });

  describe('formatUSD and formatKHR', () => {
    it('should format USD with dollar sign and commas', () => {
      expect(formatUSD(1234.5)).toBe('$1,234.50');
      expect(formatUSD(0)).toBe('$0.00');
    });

    it('should format KHR with riel sign', () => {
      expect(formatKHR(4000000)).toBe('4,000,000 ៛');
      expect(formatKHR(0)).toBe('0 ៛');
    });
  });

  describe('parseCurrency', () => {
    it('should parse currency strings with symbols and commas', () => {
      expect(parseCurrency('$1,500.50')).toBe(1500.5);
      expect(parseCurrency('2,000 ៛')).toBe(2000);
      expect(parseCurrency('invalid')).toBe(0);
    });
  });
});
