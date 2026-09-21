// Pure assembly logic for the vehicle file and fleet views. No I/O, no framework imports.
import { costPerKm, fuelEfficiency, monthProfit, odometerSpan, type Metric } from './calc';
import { toCents, sumCents } from './money';

export const WINDOW_DAYS = 90;
export const HISTORY_LIMIT = 15;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Adds whole days to a 'YYYY-MM-DD' date (UTC arithmetic, no DST issues). */
export function addDaysISO(iso: string, days: number): string {
  const m = DATE_ONLY.exec(iso.slice(0, 10));
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/** First day of the month containing `today` ('YYYY-MM-01'). */
export function monthStart(today: string): string {
  return today.slice(0, 7) + '-01';
}

export function isSameMonth(date: string, today: string): boolean {
  return date.slice(0, 7) === today.slice(0, 7);
}

/** Window is [today - 90 days, today], both ends inclusive. */
export function windowFrom(today: string, days = WINDOW_DAYS): string {
  return addDaysISO(today, -days);
}

export function inWindow(date: string, today: string, days = WINDOW_DAYS): boolean {
  const d = date.slice(0, 10);
  return d >= windowFrom(today, days) && d <= today;
}

export type FuelRow = {
  id: string;
  fuel_date: string;
  quantity: number | string;
  unit_price?: number | string;
  total_amount: number | string;
  amount_mismatch?: boolean;
  odometer: number | string | null;
  voided_at?: string | null;
};
export type ServiceRow = {
  id: string;
  service_date: string;
  category: string;
  cost: number | string | null;
  odometer: number | string | null;
  voided_at?: string | null;
};
export type TripExpenseRow = {
  amount: number | string;
  expense_date: string;
  voided_at?: string | null;
};
export type FinancialRow = {
  trip_id: string;
  trip_date: string;
  origin: string;
  destination: string;
  status: string;
  revenue: number | string | null;
  expenses: number | string;
  has_revenue: boolean;
  profit: number | string | null;
};

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export type VehicleMetrics = {
  costPerKm: Metric;
  fuelEfficiency: Metric;
  monthProfit: Metric;
};

/**
 * Metrics over the last 90 days.
 * Cost = non-voided trip expenses (trip FUEL expenses already cover fuel, so
 * fuel_records are NOT added) + non-null service costs. Distance = odometer span
 * across non-voided fuel and service records in the window.
 */
export function computeVehicleMetrics(input: {
  today: string;
  fuel: FuelRow[];
  service: ServiceRow[];
  tripExpenses: TripExpenseRow[];
  financials: FinancialRow[];
}): VehicleMetrics {
  const { today } = input;
  const fuel = input.fuel.filter((f) => !f.voided_at && inWindow(f.fuel_date, today));
  const service = input.service.filter((s) => !s.voided_at && inWindow(s.service_date, today));
  const expenses = input.tripExpenses.filter((e) => !e.voided_at && inWindow(e.expense_date, today));

  const costCents = sumCents([
    ...expenses.map((e) => toCents(e.amount)),
    ...service.map((s) => toCents(s.cost)),
  ]);
  const span = odometerSpan([...fuel.map((f) => num(f.odometer)), ...service.map((s) => num(s.odometer))]);

  const efficiency = fuelEfficiency(
    fuel.flatMap((f) => {
      const quantity = num(f.quantity);
      return quantity == null ? [] : [{ date: f.fuel_date, quantity, odometer: num(f.odometer) }];
    }),
  );

  const monthTrips = input.financials
    .filter((t) => isSameMonth(t.trip_date, today))
    .map((t) => ({ revenue: num(t.revenue), expenses: num(t.expenses) ?? 0, has_revenue: t.has_revenue }));

  return {
    costPerKm: costPerKm(costCents, span),
    fuelEfficiency: efficiency,
    monthProfit: monthProfit(monthTrips),
  };
}

/** Maps calc.ts English reasons to `vehicles.reason.*` dictionary keys. */
export function reasonKey(reason: string): string {
  switch (reason) {
    case 'no distance':
    case 'no distance between readings':
      return 'noDistance';
    case 'no cost':
      return 'noCost';
    case 'fewer than 2 fuel records with odometer':
      return 'fewerReadings';
    case 'no fuel quantity':
      return 'noFuel';
    case 'no trips with revenue':
      return 'noRevenue';
    default:
      return 'generic';
  }
}

export type HistoryItem =
  | { kind: 'fuel'; id: string; date: string; liters: number | null; totalCents: number | null; mismatch: boolean }
  | { kind: 'service'; id: string; date: string; category: string; costCents: number | null }
  | {
      kind: 'trip';
      id: string;
      date: string;
      origin: string;
      destination: string;
      profitCents: number | null;
    };

const KIND_ORDER = { trip: 0, service: 1, fuel: 2 } as const;

/** Merged, date-descending, capped list of fuel, service and completed trips (voided rows excluded). */
export function mergeHistory(
  input: { fuel: FuelRow[]; service: ServiceRow[]; trips: FinancialRow[] },
  limit = HISTORY_LIMIT,
): HistoryItem[] {
  const items: HistoryItem[] = [];
  const seen = new Set<string>();
  const once = (k: string, id: string) => {
    const key = k + ':' + id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  for (const f of input.fuel) {
    if (f.voided_at || !once('fuel', f.id)) continue;
    items.push({
      kind: 'fuel',
      id: f.id,
      date: f.fuel_date,
      liters: num(f.quantity),
      totalCents: toCents(f.total_amount),
      mismatch: Boolean(f.amount_mismatch),
    });
  }
  for (const s of input.service) {
    if (s.voided_at || !once('service', s.id)) continue;
    items.push({
      kind: 'service',
      id: s.id,
      date: s.service_date,
      category: s.category,
      costCents: toCents(s.cost),
    });
  }
  for (const t of input.trips) {
    if (t.status !== 'COMPLETED' || !once('trip', t.trip_id)) continue;
    items.push({
      kind: 'trip',
      id: t.trip_id,
      date: t.trip_date,
      origin: t.origin,
      destination: t.destination,
      profitCents: t.has_revenue ? toCents(t.profit) : null,
    });
  }
  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return a.id < b.id ? -1 : 1;
  });
  return items.slice(0, limit);
}

export type OpenTrip = {
  id: string;
  vehicle_id: string;
  driver_id: string;
  trip_date: string;
  created_at?: string | null;
};

/** Map vehicle_id -> latest IN_PROGRESS trip (by trip_date, then created_at). */
export function currentTripByVehicle<T extends OpenTrip>(trips: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const t of trips) {
    const cur = out.get(t.vehicle_id);
    if (
      !cur ||
      t.trip_date > cur.trip_date ||
      (t.trip_date === cur.trip_date && (t.created_at ?? '') > (cur.created_at ?? ''))
    ) {
      out.set(t.vehicle_id, t);
    }
  }
  return out;
}

export type FleetCounts = { total: number; onTrip: number; available: number; maintenance: number };

/** OUT_OF_SERVICE counts only toward the total. */
export function fleetCounts(vehicles: { status: string }[]): FleetCounts {
  return {
    total: vehicles.length,
    onTrip: vehicles.filter((v) => v.status === 'ON_TRIP').length,
    available: vehicles.filter((v) => v.status === 'AVAILABLE').length,
    maintenance: vehicles.filter((v) => v.status === 'MAINTENANCE').length,
  };
}
