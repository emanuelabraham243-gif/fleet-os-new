import { describe, expect, it } from 'vitest';
import { todayAddis } from './format';
import {
  addDaysISO,
  computeVehicleMetrics,
  currentTripByVehicle,
  fleetCounts,
  inWindow,
  isSameMonth,
  mergeHistory,
  monthStart,
  reasonKey,
  windowFrom,
  type FinancialRow,
} from './vehicle-file';

const TODAY = '2026-09-21';

describe('window and month boundaries', () => {
  it('window is inclusive of day 90 and excludes day 91 and the future', () => {
    expect(windowFrom(TODAY)).toBe('2026-06-23');
    expect(inWindow('2026-06-23', TODAY)).toBe(true);
    expect(inWindow('2026-06-22', TODAY)).toBe(false);
    expect(inWindow(TODAY, TODAY)).toBe(true);
    expect(inWindow('2026-09-22', TODAY)).toBe(false);
  });
  it('adds days across month and year ends', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('uses the Addis month, not UTC', () => {
    // 2026-09-30 22:00 UTC is already 2026-10-01 01:00 in Addis (UTC+3).
    const today = todayAddis(new Date('2026-09-30T22:00:00Z'));
    expect(today).toBe('2026-10-01');
    expect(monthStart(today)).toBe('2026-10-01');
    expect(isSameMonth('2026-09-30', today)).toBe(false);
    expect(isSameMonth('2026-10-01', today)).toBe(true);
  });
});

const fin = (o: Partial<FinancialRow>): FinancialRow => ({
  trip_id: 't1',
  trip_date: '2026-09-10',
  origin: 'A',
  destination: 'B',
  status: 'COMPLETED',
  revenue: 1000,
  expenses: 400,
  has_revenue: true,
  profit: 600,
  ...o,
});

describe('computeVehicleMetrics', () => {
  it('cost per km = fuel records + service + non-FUEL trip expenses (no double counting)', () => {
    const m = computeVehicleMetrics({
      today: TODAY,
      fuel: [
        { id: 'f1', fuel_date: '2026-09-01', quantity: 40, total_amount: 1000, odometer: 1000 },
        { id: 'f2', fuel_date: '2026-09-15', quantity: 40, total_amount: 1000, odometer: 1500 },
      ],
      service: [{ id: 's1', service_date: '2026-09-05', category: 'OIL_CHANGE', cost: 500, odometer: 1100 }],
      tripExpenses: [
        { trip_id: 't1', category: 'TOLL', amount: 300, expense_date: '2026-09-02' },
        { trip_id: 't1', category: 'FUEL', amount: 9999, expense_date: '2026-09-02' },
      ],
      financials: [],
      eligibleTripIds: ['t1'],
    });
    // (1000 + 1000 + 500 + 300) ETB = 280000 cents over 500 km; trip FUEL expense not counted
    expect(m.costPerKm).toEqual({ status: 'ok', value: 560 });
    expect(m.fuelEfficiency.status).toBe('ok');
  });
  it('excludes expenses of voided/cancelled (non-eligible) trips', () => {
    const m = computeVehicleMetrics({
      today: TODAY,
      fuel: [
        { id: 'f1', fuel_date: '2026-09-01', quantity: 10, total_amount: 100, odometer: 1000 },
        { id: 'f2', fuel_date: '2026-09-02', quantity: 10, total_amount: 100, odometer: 1100 },
      ],
      service: [],
      tripExpenses: [
        { trip_id: 'ok', category: 'TOLL', amount: 50, expense_date: '2026-09-02' },
        { trip_id: 'cancelled', category: 'TOLL', amount: 5000, expense_date: '2026-09-02' },
        { trip_id: 'voided', category: 'OTHER', amount: 5000, expense_date: '2026-09-02' },
      ],
      financials: [],
      eligibleTripIds: ['ok'],
    });
    // 10000 + 10000 + 5000 cents over 100 km
    expect(m.costPerKm).toEqual({ status: 'ok', value: 250 });
  });
  it('ignores voided rows and out-of-window rows; counts null service cost as excluded', () => {
    const m = computeVehicleMetrics({
      today: TODAY,
      fuel: [
        { id: 'f1', fuel_date: '2026-09-01', quantity: 40, total_amount: 0.1, odometer: 1000 },
        { id: 'f2', fuel_date: '2026-09-15', quantity: 40, total_amount: 0.2, odometer: 1200 },
        { id: 'f3', fuel_date: '2026-09-16', quantity: 40, total_amount: 500, odometer: 9000, voided_at: 'x' },
        { id: 'f4', fuel_date: '2026-01-01', quantity: 40, total_amount: 500, odometer: 1 },
      ],
      service: [
        { id: 's1', service_date: '2026-09-05', category: 'X', cost: null, odometer: null },
        { id: 's2', service_date: '2026-09-06', category: 'X', cost: 100, odometer: null, voided_at: 'x' },
      ],
      tripExpenses: [
        { trip_id: 't', category: 'TOLL', amount: 100, expense_date: '2026-09-02' },
        { trip_id: 't', category: 'TOLL', amount: 5000, expense_date: '2026-09-03', voided_at: 'x' },
        { trip_id: 't', category: 'TOLL', amount: 5000, expense_date: '2026-01-03' },
      ],
      financials: [],
      eligibleTripIds: ['t'],
    });
    // 10 + 20 + 10000 = 10030 cents over 200 km
    expect(m.costPerKm).toEqual({ status: 'ok', value: 10030 / 200, excluded: 1 });
  });
  it('is insufficient without distance or cost', () => {
    const base = { today: TODAY, service: [], financials: [] };
    const noDist = computeVehicleMetrics({
      ...base,
      fuel: [{ id: 'f', fuel_date: '2026-09-01', quantity: 10, total_amount: 0, odometer: 10 }],
      tripExpenses: [{ trip_id: 't', category: 'TOLL', amount: 10, expense_date: '2026-09-02' }],
    });
    expect(noDist.costPerKm.status).toBe('insufficient');
    expect(noDist.fuelEfficiency.status).toBe('insufficient');
    const noCost = computeVehicleMetrics({
      ...base,
      fuel: [
        { id: 'a', fuel_date: '2026-09-01', quantity: 10, total_amount: 0, odometer: 10 },
        { id: 'b', fuel_date: '2026-09-02', quantity: 10, total_amount: 0, odometer: 110 },
      ],
      tripExpenses: [],
    });
    expect(noCost.costPerKm).toEqual({ status: 'insufficient', reason: 'no cost' });
  });
  it('month profit only counts the current Addis month and reports excluded trips', () => {
    const m = computeVehicleMetrics({
      today: TODAY,
      fuel: [],
      service: [],
      tripExpenses: [],
      financials: [
        fin({ trip_id: 'a' }),
        fin({ trip_id: 'b', revenue: null, has_revenue: false, profit: null }),
        fin({ trip_id: 'c', trip_date: '2026-08-31', revenue: 9000, profit: 8600 }),
      ],
    });
    expect(m.monthProfit).toEqual({ status: 'ok', value: 60000, excluded: 1 });
    const none = computeVehicleMetrics({
      today: TODAY,
      fuel: [],
      service: [],
      tripExpenses: [],
      financials: [fin({ revenue: null, has_revenue: false, profit: null })],
    });
    expect(none.monthProfit.status).toBe('insufficient');
  });
  it('month profit ignores PLANNED, IN_PROGRESS and CANCELLED trips', () => {
    const m = computeVehicleMetrics({
      today: TODAY,
      fuel: [],
      service: [],
      tripExpenses: [],
      financials: [
        fin({ trip_id: 'a' }),
        fin({ trip_id: 'b', status: 'PLANNED', revenue: null, has_revenue: false, profit: null }),
        fin({ trip_id: 'c', status: 'IN_PROGRESS', revenue: 9000, profit: 8600 }),
        fin({ trip_id: 'd', status: 'CANCELLED', revenue: 9000, profit: 8600 }),
      ],
    });
    expect(m.monthProfit).toEqual({ status: 'ok', value: 60000, excluded: 0 });
    const onlyOpen = computeVehicleMetrics({
      today: TODAY,
      fuel: [],
      service: [],
      tripExpenses: [],
      financials: [fin({ status: 'IN_PROGRESS' }), fin({ status: 'PLANNED', revenue: null, has_revenue: false })],
    });
    expect(onlyOpen.monthProfit.status).toBe('insufficient');
  });
  it('maps reasons to dictionary keys', () => {
    expect(reasonKey('no distance')).toBe('noDistance');
    expect(reasonKey('no trips with revenue')).toBe('noRevenue');
    expect(reasonKey('missing_odometer_in_span')).toBe('missingOdometer');
    expect(reasonKey('whatever')).toBe('generic');
  });
});

describe('mergeHistory', () => {
  it('merges, sorts date-descending, drops voided and non-completed trips', () => {
    const items = mergeHistory(
      {
        fuel: [
          { id: 'f1', fuel_date: '2026-09-10', quantity: 30, total_amount: 100, odometer: null, amount_mismatch: true },
          { id: 'f2', fuel_date: '2026-09-12', quantity: 30, total_amount: 100, odometer: null, voided_at: 'x' },
        ],
        service: [{ id: 's1', service_date: '2026-09-11', category: 'TIRES', cost: null, odometer: null }],
        trips: [
          fin({ trip_id: 't1', trip_date: '2026-09-09' }),
          fin({ trip_id: 't2', trip_date: '2026-09-13', status: 'IN_PROGRESS' }),
          fin({ trip_id: 't3', trip_date: '2026-09-08', has_revenue: false, revenue: null, profit: null }),
        ],
      },
      15,
    );
    expect(items.map((i) => i.id)).toEqual(['s1', 'f1', 't1', 't3']);
    const s = items[0];
    expect(s.kind === 'service' && s.costCents).toBe(null);
    const f = items[1];
    expect(f.kind === 'fuel' && f.mismatch).toBe(true);
    const t3 = items[3];
    expect(t3.kind === 'trip' && t3.profitCents).toBe(null);
  });
  it('respects the limit and dedupes repeated ids', () => {
    const fuel = Array.from({ length: 20 }, (_, i) => ({
      id: 'f' + i,
      fuel_date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      quantity: 1,
      total_amount: 1,
      odometer: null,
    }));
    const items = mergeHistory({ fuel: [...fuel, ...fuel], service: [], trips: [] });
    expect(items).toHaveLength(15);
    expect(items[0].date).toBe('2026-09-20');
  });
});

describe('fleet helpers', () => {
  it('counts statuses; OUT_OF_SERVICE only in total', () => {
    expect(
      fleetCounts([
        { status: 'ON_TRIP' },
        { status: 'AVAILABLE' },
        { status: 'MAINTENANCE' },
        { status: 'OUT_OF_SERVICE' },
      ]),
    ).toEqual({ total: 4, onTrip: 1, available: 1, maintenance: 1 });
  });
  it('picks the latest open trip per vehicle', () => {
    const m = currentTripByVehicle([
      { id: 'a', vehicle_id: 'v', driver_id: 'd1', trip_date: '2026-09-01' },
      { id: 'b', vehicle_id: 'v', driver_id: 'd2', trip_date: '2026-09-05' },
    ]);
    expect(m.get('v')?.driver_id).toBe('d2');
  });
});
