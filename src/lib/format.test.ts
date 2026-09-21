import { describe, expect, it } from 'vitest';
import { daysBetween, formatDate, formatEtb, formatKm, formatNumber, todayAddis } from './format';

describe('format', () => {
  it('daysBetween is date-only', () => {
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
    expect(daysBetween('2026-10-24', '2026-10-25')).toBe(1);
  });
  it('todayAddis shape', () => {
    expect(todayAddis()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayAddis(new Date('2026-09-21T22:00:00Z'))).toBe('2026-09-22');
  });
  it('formatEtb', () => {
    expect(formatEtb(1234500, 'en')).toBe('ETB 12,345.00');
    expect(formatEtb(1234500, 'am')).toBe('12,345.00 ብር');
    expect(formatEtb(null, 'en')).toBe('—');
  });
  it('dates use latin digits and do not shift', () => {
    expect(formatDate('2026-09-21', 'en')).toContain('21');
    expect(formatDate('2026-09-21', 'am')).toMatch(/21/);
    expect(formatDate(null, 'am')).toBe('—');
  });
  it('numbers', () => {
    expect(formatNumber(1234.5, 'en', 1)).toBe('1,234.5');
    expect(formatKm(1200, 'en')).toBe('1,200 km');
  });
});
