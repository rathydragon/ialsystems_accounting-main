import { describe, it, expect } from 'vitest';
import {
  formatToStandardDateTime,
  getLocalDateString,
  getCambodiaTimeParts,
  CAMBODIA_TIMEZONE
} from '../../src/utils/dateFormatter';

describe('dateFormatter Utility (Asia/Phnom_Penh UTC+7)', () => {
  it('should verify the configured Cambodia timezone constant', () => {
    expect(CAMBODIA_TIMEZONE).toBe('Asia/Phnom_Penh');
  });

  it('should extract correct Cambodia time parts from a known UTC date', () => {
    // 2026-05-15 03:00:00 UTC = 2026-05-15 10:00:00 Cambodia (UTC+7)
    const utcDate = new Date('2026-05-15T03:00:00.000Z');
    const parts = getCambodiaTimeParts(utcDate);

    expect(parts.year).toBe('2026');
    expect(parts.month).toBe('05');
    expect(parts.day).toBe('15');
    expect(parts.hour).toBe('10');
    expect(parts.minute).toBe('00');
    expect(parts.second).toBe('00');
  });

  it('should format standard date-time string YYYY-MM-DD HH:mm:ss', () => {
    const utcDate = new Date('2026-10-16T07:30:45.000Z');
    // UTC 07:30:45 + 7h = 14:30:45
    const formatted = formatToStandardDateTime(utcDate);
    expect(formatted).toBe('2026-10-16 14:30:45');
  });

  it('should format standard date string YYYY-MM-DD', () => {
    const utcDate = new Date('2026-12-31T20:00:00.000Z');
    // UTC 20:00 Dec 31 + 7h = Jan 01 03:00 next year
    const formattedDate = getLocalDateString(utcDate);
    expect(formattedDate).toBe('2027-01-01');
  });

  it('should safely handle null/undefined by falling back or returning current date', () => {
    const fallback = formatToStandardDateTime(null, '2026-01-01 00:00:00');
    expect(fallback).toContain('2026-01-01');

    const result = formatToStandardDateTime('');
    // Current time should match standard pattern
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
