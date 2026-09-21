import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fieldErrorsFromZod, zChoice, zDate, zMoney, zOdometer, zOptionalText, zText } from './schemas';
import { todayAddis } from './format';

function msg(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.success ? null : r.error!.issues[0].message;
}

describe('schemas', () => {
  it('zMoney', () => {
    expect(zMoney().parse('1,200.50')).toBe('1200.50');
    expect(msg(zMoney().safeParse('0'))).toBe('invalidNumber');
    expect(msg(zMoney().safeParse('1.234'))).toBe('invalidNumber');
    expect(msg(zMoney().safeParse(''))).toBe('required');
  });
  it('zOdometer optional', () => {
    expect(zOdometer().parse('')).toBeUndefined();
    expect(zOdometer().parse(undefined)).toBeUndefined();
    expect(zOdometer().parse('12345')).toBe('12345');
    expect(msg(zOdometer().safeParse('-5'))).toBe('invalidNumber');
  });
  it('zDate', () => {
    expect(zDate().parse('2026-02-28')).toBe('2026-02-28');
    expect(msg(zDate().safeParse('2026-02-30'))).toBe('invalidDate');
    expect(msg(zDate().safeParse('21/09/2026'))).toBe('invalidDate');
    expect(msg(zDate().safeParse('2999-01-01'))).toBe('futureDate');
    expect(zDate({ allowFuture: true }).parse('2999-01-01')).toBe('2999-01-01');
    expect(zDate().parse(todayAddis())).toBe(todayAddis());
  });
  it('text and choice', () => {
    expect(msg(zText(3).safeParse('  '))).toBe('required');
    expect(msg(zText(3).safeParse('abcd'))).toBe('tooLong');
    expect(zOptionalText(5).parse('  ')).toBeUndefined();
    expect(msg(zChoice(['A', 'B'] as const).safeParse('C'))).toBe('invalidChoice');
  });
  it('fieldErrorsFromZod takes first message per field', () => {
    const r = z.object({ a: zText(2), b: zMoney() }).safeParse({ a: 'abc', b: 'x' });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrorsFromZod(r.error)).toEqual({ a: 'tooLong', b: 'invalidNumber' });
  });
});
