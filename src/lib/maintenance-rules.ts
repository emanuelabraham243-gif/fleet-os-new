/** Pure rules for maintenance and documents screens. */

export const SERVICE_CATEGORIES = [
  'OIL_CHANGE', 'TIRES', 'BRAKES', 'BATTERY', 'FILTERS', 'GENERAL_SERVICE', 'OTHER',
] as const;

export const VEHICLE_DOC_TYPES = ['INSURANCE', 'ANNUAL_INSPECTION', 'REGISTRATION', 'OTHER'] as const;
export const DRIVER_DOC_TYPES = ['DRIVING_LICENSE', 'MEDICAL_CERTIFICATE', 'OTHER'] as const;
// General file storage, not tied to a vehicle or driver. `category` is a plain text column
// (see general_documents migration) so new buckets are an app-side list change, not a schema one.
export const GENERAL_DOC_CATEGORIES = ['FAMILY', 'SCHOOL', 'PERSONAL', 'OTHER'] as const;

export const ODOMETER_JUMP_KM = 2000;

/** True when the entered odometer is more than 2000 km above the known one. Lower values are allowed (backdating). */
export function odometerJumpNeedsConfirm(
  entered: number | null | undefined,
  current: number | null | undefined,
): boolean {
  if (entered == null || current == null) return false;
  return entered - current > ODOMETER_JUMP_KM;
}

/** Matches the DB check: a schedule needs at least one interval. */
export function hasInterval(
  km: string | undefined | null,
  days: string | undefined | null,
  trips?: string | undefined | null,
): boolean {
  return Boolean((km ?? '').trim() || (days ?? '').trim() || (trips ?? '').trim());
}

export type ScheduleFacts = {
  next_due_date: string | null;
  next_due_odometer: number | string | null;
  current_odometer: number | string | null;
  next_due_trip_count?: number | null;
};

export type UnknownReason = 'noDueInfo' | 'noOdometer' | null;

/**
 * Why a schedule card is UNKNOWN (or partly unknown). Never treats missing data as zero.
 * noDueInfo: nothing to compare against yet (no service recorded, no initial due values).
 * noOdometer: a km due exists but the vehicle odometer is unknown.
 */
export function unknownReason(s: ScheduleFacts): UnknownReason {
  if (s.next_due_date == null && s.next_due_odometer == null && (s.next_due_trip_count ?? null) == null) {
    return 'noDueInfo';
  }
  if (s.next_due_odometer != null && s.current_odometer == null) return 'noOdometer';
  return null;
}

/** Remaining km; null when either side is unknown. Negative = overdue. */
export function remainingKm(
  due: number | string | null,
  current: number | string | null,
): number | null {
  if (due == null || current == null) return null;
  const d = Number(due);
  const c = Number(current);
  if (!Number.isFinite(d) || !Number.isFinite(c)) return null;
  return Math.round((d - c) * 10) / 10;
}

export const MAINT_STATUS_ORDER = ['OVERDUE', 'DUE_SOON', 'OK', 'UNKNOWN'] as const;
export type MaintStatus = (typeof MAINT_STATUS_ORDER)[number];

export function normalizeStatus(s: unknown): MaintStatus {
  return (MAINT_STATUS_ORDER as readonly string[]).includes(s as string) ? (s as MaintStatus) : 'UNKNOWN';
}
