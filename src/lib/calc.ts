import { toCents } from './money';
import { daysBetween } from './format';

export type Metric =
  | { status: 'ok'; value: number; excluded?: number }
  | { status: 'insufficient'; reason: string };

/**
 * Km per liter using the full-tank method: distance between the first and last odometer
 * fill divided by the litres of every later fill. Assumes each fill is a full tank
 * (partial fills are a known limitation). If any fill dated between the first and last
 * odometer fill has no odometer, its litres cannot be matched to distance, so the
 * result is insufficient rather than guessed.
 */
export function fuelEfficiency(
  records: { date: string; quantity: number; odometer: number | null }[],
): Metric {
  const pts = records
    .filter((r): r is { date: string; quantity: number; odometer: number } => r.odometer != null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.odometer - b.odometer));
  if (pts.length < 2) return { status: 'insufficient', reason: 'fewer than 2 fuel records with odometer' };
  const first = pts[0];
  const last = pts[pts.length - 1];
  const distance = last.odometer - first.odometer;
  if (distance <= 0) return { status: 'insufficient', reason: 'no distance between readings' };
  if (records.some((r) => r.odometer == null && r.date >= first.date && r.date <= last.date)) {
    return { status: 'insufficient', reason: 'missing_odometer_in_span' };
  }
  const liters = pts.slice(1).reduce((s, r) => s + r.quantity, 0);
  if (liters <= 0) return { status: 'insufficient', reason: 'no fuel quantity' };
  return { status: 'ok', value: distance / liters };
}

export function odometerSpan(readings: (number | null)[]): number | null {
  const vals = readings.filter((r): r is number => r != null);
  if (vals.length < 2) return null;
  return Math.max(...vals) - Math.min(...vals);
}

/** Value is cents per km (float). */
export function costPerKm(costCents: number, distanceKm: number | null, excluded = 0): Metric {
  if (distanceKm == null || distanceKm <= 0) return { status: 'insufficient', reason: 'no distance' };
  if (costCents <= 0) return { status: 'insufficient', reason: 'no cost' };
  const value = costCents / distanceKm;
  return excluded > 0 ? { status: 'ok', value, excluded } : { status: 'ok', value };
}

export function tripProfitCents(revenueCents: number | null, expensesCents: number): number | null {
  if (revenueCents == null) return null;
  return revenueCents - expensesCents;
}

/** Only COMPLETED trips count. Inputs are NUMERIC ETB amounts; result value is cents. */
export function monthProfit(
  trips: { status: string; revenue: number | null; expenses: number; has_revenue: boolean }[],
): Metric {
  let total = 0;
  let counted = 0;
  let excluded = 0;
  for (const t of trips) {
    if (t.status !== 'COMPLETED') continue;
    const rev = t.has_revenue ? toCents(t.revenue) : null;
    if (rev == null) {
      excluded += 1;
      continue;
    }
    total += rev - (toCents(t.expenses) ?? 0);
    counted += 1;
  }
  if (counted === 0) return { status: 'insufficient', reason: 'no trips with revenue' };
  return { status: 'ok', value: total, excluded };
}

/** Mirrors SQL private.doc_status. */
export function docStatus(
  expiresOn: string | null,
  today: string,
  warnDays = 30,
): 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'UNKNOWN' {
  if (!expiresOn) return 'UNKNOWN';
  const left = daysBetween(today, expiresOn);
  if (Number.isNaN(left)) return 'UNKNOWN';
  if (left < 0) return 'EXPIRED';
  if (left <= warnDays) return 'EXPIRING_SOON';
  return 'VALID';
}
