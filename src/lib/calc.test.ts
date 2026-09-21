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

describe('fuelEfficiency unmatched fills', () => {
  it('is insufficient when a fill between first and last odometer fill has no odometer', () => {
    expect(
      fuelEfficiency([
        { date: '2026-09-01', quantity: 40, odometer: 1000 },
        { date: '2026-09-10', quantity: 30, odometer: null },
        { date: '2026-09-20', quantity: 40, odometer: 1600 },
      ]),
    ).toEqual({ status: 'insufficient', reason: 'missing_odometer_in_span' });
  });
  it('ignores null-odometer fills outside the span', () => {
    expect(
      fuelEfficiency([
        { date: '2026-08-01', quantity: 30, odometer: null },
        { date: '2026-09-01', quantity: 40, odometer: 1000 },
        { date: '2026-09-20', quantity: 40, odometer: 1600 },
        { date: '2026-09-25', quantity: 30, odometer: null },
      ]),
    ).toEqual({ status: 'ok', value: 600 / 40 });
  });
});

describe('misc calc', () => {
  it('odometerSpan', () => {
    expect(odometerSpan([100, null, 350])).toBe(250);
    expect(odometerSpan([100, null])).toBeNull();
  });
  it('costPerKm', () => {
    expect(costPerKm(10000, 100)).toEqual({ status: 'ok', value: 100 });
    expect(costPerKm(10000, 100, 2)).toEqual({ status: 'ok', value: 100, excluded: 2 });
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
      { status: 'COMPLETED', revenue: 1000.1, expenses: 200.2, has_revenue: true },
      { status: 'COMPLETED', revenue: null, expenses: 999, has_revenue: false },
      { status: 'IN_PROGRESS', revenue: 50000, expenses: 1, has_revenue: true },
      { status: 'PLANNED', revenue: null, expenses: 1, has_revenue: false },
      { status: 'CANCELLED', revenue: 70000, expenses: 1, has_revenue: true },
    ]);
    expect(m).toEqual({ status: 'ok', value: 79990, excluded: 1 });
    expect(monthProfit([{ status: 'COMPLETED', revenue: null, expenses: 5, has_revenue: false }]).status).toBe('insufficient');
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
