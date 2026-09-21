// Pure rules for trips / expenses / fuel / incidents. No I/O, no next/* imports.

export const TRIP_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export function isTripStatus(v: unknown): v is TripStatus {
  return typeof v === 'string' && (TRIP_STATUSES as readonly string[]).includes(v);
}

export const TRIP_TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function allowedTransitions(from: string): readonly TripStatus[] {
  return isTripStatus(from) ? TRIP_TRANSITIONS[from] : [];
}

export function canTransition(from: string, to: string): boolean {
  return isTripStatus(to) && allowedTransitions(from).includes(to);
}

function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Same vehicle + driver + date + origin + destination => probable duplicate trip. */
export function tripDuplicateKey(t: {
  vehicle_id: string;
  driver_id: string;
  trip_date: string;
  origin: string;
  destination: string;
}): string {
  return [t.vehicle_id, t.driver_id, t.trip_date, norm(t.origin), norm(t.destination)].join('|');
}

/** Same trip + category + amount (cents) + date => probable duplicate expense. */
export function expenseDuplicateKey(e: {
  trip_id: string;
  category: string;
  amountCents: number;
  expense_date: string;
}): string {
  return [e.trip_id, e.category, e.amountCents, e.expense_date].join('|');
}

/** True when the entered odometer is more than `maxJump` km above the known current value. */
export function isOdometerJump(
  entered: number | null | undefined,
  current: number | null | undefined,
  maxJump = 2000,
): boolean {
  if (entered == null || current == null) return false;
  if (!Number.isFinite(entered) || !Number.isFinite(current)) return false;
  return entered - current > maxJump;
}

/** 'YYYY-MM-DDTHH:mm' (Addis wall clock, +03:00) -> ISO UTC string, or null if invalid. */
export function addisLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h - 3, mi);
  const dt = new Date(ms);
  // Reject overflow such as Feb 31.
  const back = new Date(ms + 3 * 3_600_000);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return dt.toISOString();
}

/** ISO instant -> 'YYYY-MM-DDTHH:mm' in Addis wall clock (for datetime-local default). */
export function isoToAddisLocal(iso: Date | string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const s = new Date(d.getTime() + 3 * 3_600_000).toISOString();
  return s.slice(0, 16);
}

/** Integer-cent total of quantity x unit price, both decimal strings. Returns null if unparseable. */
export function calcTotalCents(quantity: string, unitPrice: string): number | null {
  const q = Number(quantity.replace(/[,\s]/g, ''));
  const p = Number(unitPrice.replace(/[,\s]/g, ''));
  if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p < 0) return null;
  return Math.round(Math.round(q * 100) * Math.round(p * 100) / 100);
}

/** Cents -> decimal string "1234.50". */
export function centsToDecimal(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
