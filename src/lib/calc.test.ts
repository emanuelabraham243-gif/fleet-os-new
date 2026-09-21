import { describe, expect, it } from 'vitest';
import { costPerKm, docStatus, fuelEfficiency, monthProfit, odometerSpan, tripProfitCents } from './calc';

describe('fuelEfficiency', () => {
  it('computes km/L excluding first fill', () => {
    const m = fuelEfficiency([
      { date: '2026-09-10', quantity: 40, odometer: 1000 },
      { date: '2026-09-01', quantity: 30, odometer: 500 },
      { date: '2026-09-20', quantity: 50, odometer: 1500 },
    ]);
    expect(m).toEqual({ status: 'ok', value: 1000 / 90 });
  });
  it('is insufficient with <2 odometer points', () => {
    expect(fuelEfficiency([{ date: '2026-09-01', quantity: 10, odometer: 1 }]).status).toBe('insufficient');
    expect(
      fuelEfficiency([
        { date: '2026-09-01', quantity: 10, odometer: 1 },
        { date: '2026-09-02', quantity: 10, odometer: null },
      ]).status,
    ).toBe('insufficient');
  });
  it('is insufficient with zero distance or zero liters', () => {
    expect(
      fuelEfficiency([
        { date: '2026-09-01', quantity: 10, odometer: 100 },
        { date: '2026-09-02', quantity: 10, odometer: 100 },
      ]).status,
    ).toBe('insufficient');
    expect(
      fuelEfficiency([
        { date: '2026-09-01', quantity: 10, odometer: 100 },
        { date: '2026-09-02', quantity: 0, odometer: 200 },
      ]).status,
    ).toBe('insufficient');
  });
});

describe('misc calc', () => {
  it('odometerSpan', () => {
    expect(odometerSpan([100, null, 350])).toBe(250);
    expect(odometerSpan([100, null])).toBeNull();
  });
  it('costPerKm', () => {
    expect(costPerKm(10000, 100)).toEqual({ status: 'ok', value: 100 });
    expect(costPerKm(10000, null).status).toBe('insufficient');
    expect(costPerKm(10000, 0).status).toBe('insufficient');
    expect(costPerKm(0, 50).status).toBe('insufficient');
  });
  it('tripProfitCents', () => {
    expect(tripProfitCents(null, 500)).toBeNull();
    expect(tripProfitCents(1000, 400)).toBe(600);
  });
  it('monthProfit excludes trips without revenue', () => {
    const m = monthProfit([
      { revenue: 1000.1, expenses: 200.2, has_revenue: true },
      { revenue: null, expenses: 999, has_revenue: false },
    ]);
    expect(m).toEqual({ status: 'ok', value: 79990, excluded: 1 });
    expect(monthProfit([{ revenue: null, expenses: 5, has_revenue: false }]).status).toBe('insufficient');
    expect(monthProfit([]).status).toBe('insufficient');
  });
});

describe('docStatus', () => {
  const today = '2026-09-21';
  it('handles boundaries', () => {
    expect(docStatus(null, today)).toBe('UNKNOWN');
    expect(docStatus('2026-09-20', today)).toBe('EXPIRED');
    expect(docStatus('2026-09-21', today)).toBe('EXPIRING_SOON');
    expect(docStatus('2026-10-21', today)).toBe('EXPIRING_SOON');
    expect(docStatus('2026-10-22', today)).toBe('VALID');
  });
});
