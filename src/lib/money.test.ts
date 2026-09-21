import { describe, expect, it } from 'vitest';
import { parseDecimal, parseMoney, sumCents, toCents } from './money';

describe('money', () => {
  it('toCents rounds and sums without float drift', () => {
    expect(toCents(0.1)).toBe(10);
    expect(toCents('0.2')).toBe(20);
    expect(sumCents([toCents(0.1), toCents(0.2), null])).toBe(30);
    expect(toCents(null)).toBeNull();
  });
  it('parseDecimal', () => {
    expect(parseDecimal('1,234.50', { maxInt: 6, maxFrac: 2 })).toBe('1234.50');
    expect(parseDecimal(' 12 ', { maxInt: 6, maxFrac: 2 })).toBe('12');
    for (const bad of ['1e5', '-3', '1.234', '', 'abc', '1.', '.5']) {
      expect(parseDecimal(bad, { maxInt: 6, maxFrac: 2 })).toBeNull();
    }
    expect(parseDecimal('1234567', { maxInt: 6, maxFrac: 2 })).toBeNull();
  });
  it('parseMoney requires >0', () => {
    expect(parseMoney('0')).toBeNull();
    expect(parseMoney('0.00')).toBeNull();
    expect(parseMoney('250.5')).toBe('250.5');
    expect(parseMoney('1234567890123')).toBeNull();
  });
});
