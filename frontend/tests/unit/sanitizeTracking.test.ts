import { describe, it, expect } from 'vitest';
import { sanitizeTrackingCode } from '../../src/utils/sanitizeTracking';

describe('sanitizeTrackingCode Utility', () => {
  it('should return empty string for null, undefined, or empty values', () => {
    expect(sanitizeTrackingCode(null)).toBe('');
    expect(sanitizeTrackingCode(undefined)).toBe('');
    expect(sanitizeTrackingCode('')).toBe('');
  });

  it('should trim and convert normal tracking codes to uppercase', () => {
    expect(sanitizeTrackingCode('  exp12345678  ')).toBe('EXP12345678');
    expect(sanitizeTrackingCode('iale-9988-kh')).toBe('IALE-9988-KH');
  });

  it('should strip zero-width characters and control codes', () => {
    // zero-width space \u200B and BOM \uFEFF
    const dirty = '\uFEFFexp\u200B12345\u200C';
    expect(sanitizeTrackingCode(dirty)).toBe('EXP12345');
  });

  it('should strip outer quotes, brackets, and parenthesis added by scanner guns', () => {
    expect(sanitizeTrackingCode('"EXP998877"')).toBe('EXP998877');
    expect(sanitizeTrackingCode("('EXP998877')")).toBe('EXP998877');
    expect(sanitizeTrackingCode('<EXP998877>')).toBe('EXP998877');
    expect(sanitizeTrackingCode('[EXP998877]')).toBe('EXP998877');
  });

  it('should parse tracking parameters from full scanned URLs', () => {
    const url1 = 'https://tracking.ialsystems.com/track?id=EXP991122&ref=scanner';
    expect(sanitizeTrackingCode(url1)).toBe('EXP991122');

    const url2 = 'https://ialexpress.com/shipment?tracking=TRACK-8899';
    expect(sanitizeTrackingCode(url2)).toBe('TRACK-8899');

    const url3 = 'https://ialexpress.com/track/EXP-URL-PATH-77';
    expect(sanitizeTrackingCode(url3)).toBe('EXP-URL-PATH-77');
  });
});
