import { describe, expect, it } from 'vitest';
import {
  addisLocalToIso,
  allowedTransitions,
  calcTotalCents,
  canTransition,
  centsToDecimal,
  expenseDuplicateKey,
  isOdometerDrop,
  isOdometerJump,
  isOdometerSuspicious,
  isoToAddisLocal,
  tripDuplicateKey,
} from './trip-rules';

describe('trip transitions', () => {
  it('allows only the documented transitions', () => {
    expect(allowedTransitions('PLANNED')).toEqual(['IN_PROGRESS', 'CANCELLED']);
    expect(allowedTransitions('IN_PROGRESS')).toEqual(['COMPLETED', 'CANCELLED']);
    expect(allowedTransitions('COMPLETED')).toEqual([]);
    expect(allowedTransitions('CANCELLED')).toEqual([]);
    expect(allowedTransitions('bogus')).toEqual([]);
  });
  it('rejects illegal moves', () => {
    expect(canTransition('PLANNED', 'COMPLETED')).toBe(false);
    expect(canTransition('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('PLANNED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'nope')).toBe(false);
  });
});

describe('duplicate keys', () => {
  it('normalizes case and whitespace for trips', () => {
    const a = tripDuplicateKey({ vehicle_id: 'v', driver_id: 'd', trip_date: '2026-09-01', origin: ' Addis  Ababa', destination: 'Adama' });
    const b = tripDuplicateKey({ vehicle_id: 'v', driver_id: 'd', trip_date: '2026-09-01', origin: 'addis ababa', destination: 'ADAMA ' });
    expect(a).toBe(b);
  });
  it('differs when amount differs', () => {
    const base = { trip_id: 't', category: 'TOLL', expense_date: '2026-09-01' };
    expect(expenseDuplicateKey({ ...base, amountCents: 1000 })).not.toBe(
      expenseDuplicateKey({ ...base, amountCents: 1001 }),
    );
  });
});

describe('odometer jump', () => {
  it('flags only large forward jumps', () => {
    expect(isOdometerJump(12001, 10000)).toBe(true);
    expect(isOdometerJump(12000, 10000)).toBe(false);
    expect(isOdometerJump(5000, 10000)).toBe(false);
    expect(isOdometerJump(5000, null)).toBe(false);
    expect(isOdometerJump(null, 10)).toBe(false);
  });
});

describe('Addis datetime', () => {
  it('converts local Addis time to UTC ISO', () => {
    expect(addisLocalToIso('2026-09-21T10:30')).toBe('2026-09-21T07:30:00.000Z');
    expect(addisLocalToIso('2026-09-21T01:00')).toBe('2026-09-20T22:00:00.000Z');
  });
  it('rejects invalid input', () => {
    expect(addisLocalToIso('')).toBeNull();
    expect(addisLocalToIso('2026-02-31T10:00')).toBeNull();
    expect(addisLocalToIso('2026-13-01T10:00')).toBeNull();
  });
  it('round-trips', () => {
    expect(isoToAddisLocal('2026-09-20T22:00:00.000Z')).toBe('2026-09-21T01:00');
  });
});

describe('fuel total', () => {
  it('uses integer cents', () => {
    expect(calcTotalCents('40', '85.5')).toBe(342000);
    expect(calcTotalCents('0.1', '0.2')).toBe(2);
    expect(calcTotalCents('', '5')).toBeNull();
    expect(centsToDecimal(342000)).toBe('3420.00');
    expect(centsToDecimal(5)).toBe('0.05');
  });
});

describe('odometer plausibility', () => {
  it('flags a drop of more than 5000 km only', () => {
    expect(isOdometerDrop(90000, 100000)).toBe(true);
    expect(isOdometerDrop(95000, 100000)).toBe(false);
    expect(isOdometerDrop(94999, 100000)).toBe(true);
    expect(isOdometerDrop(100500, 100000)).toBe(false);
    expect(isOdometerDrop(null, 100000)).toBe(false);
    expect(isOdometerDrop(10, null)).toBe(false);
  });
  it('suspicious covers both forward jumps and drops', () => {
    expect(isOdometerSuspicious(103000, 100000)).toBe(true);
    expect(isOdometerSuspicious(80000, 100000)).toBe(true);
    expect(isOdometerSuspicious(100100, 100000)).toBe(false);
    expect(isOdometerSuspicious(99000, 100000)).toBe(false);
  });
});
