import { describe, expect, it } from 'vitest';
import { ethDateFromForm, ethToIso, formatEthDate, isValidEth, isoToEth } from './ethiopian-date';

describe('Ethiopian calendar', () => {
  it('maps known new years and dates', () => {
    expect(ethToIso({ year: 2019, month: 1, day: 1 })).toBe('2026-09-11');
    expect(ethToIso({ year: 2020, month: 1, day: 1 })).toBe('2027-09-12'); // after a 6-day Pagume
    expect(ethToIso({ year: 2016, month: 1, day: 1 })).toBe('2023-09-12');
    expect(ethToIso({ year: 2017, month: 4, day: 29 })).toBe('2025-01-07'); // Genna
    expect(isoToEth('2026-10-14')).toEqual({ year: 2019, month: 2, day: 4 });
    expect(isoToEth('2027-09-11')).toEqual({ year: 2019, month: 13, day: 6 });
    expect(isoToEth('2027-09-30')).toEqual({ year: 2020, month: 1, day: 19 }); // Meskel eve
  });

  it('round-trips every day across several years', () => {
    let iso = '2022-01-01';
    for (let i = 0; i < 365 * 6; i++) {
      expect(ethToIso(isoToEth(iso))).toBe(iso);
      iso = new Date(Date.parse(iso) + 86_400_000).toISOString().slice(0, 10);
    }
  });

  it('validates Pagume length', () => {
    expect(isValidEth({ year: 2019, month: 13, day: 6 })).toBe(true);
    expect(isValidEth({ year: 2018, month: 13, day: 6 })).toBe(false);
    expect(isValidEth({ year: 2018, month: 2, day: 31 })).toBe(false);
    expect(isValidEth({ year: 2018, month: 14, day: 1 })).toBe(false);
  });

  it('formats in both languages', () => {
    expect(formatEthDate('2026-10-14', 'en')).toBe('4 Tikimt 2019');
    expect(formatEthDate('2026-10-14', 'am')).toBe('4 ጥቅምት 2019');
    expect(formatEthDate(null, 'en')).toBe('—');
  });
});

describe('ethDateFromForm', () => {
  it('reads empty, valid and invalid dates', () => {
    expect(ethDateFromForm({}, 'd')).toBe('');
    expect(ethDateFromForm({ d__d: '4', d__m: '2', d__y: '2019' }, 'd')).toBe('2026-10-14');
    expect(ethDateFromForm({ d__d: '4', d__m: '', d__y: '2019' }, 'd')).toBeNull();
    expect(ethDateFromForm({ d__d: '6', d__m: '13', d__y: '2018' }, 'd')).toBeNull();
  });
});
