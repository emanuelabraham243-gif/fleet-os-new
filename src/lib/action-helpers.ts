// Plain helpers for server actions (this is NOT a 'use server' file).

export type FormState = {
  ok?: boolean;
  /** Key in the `errors` dictionary namespace. */
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  needsConfirm?: boolean;
};

export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/** Maps a Postgres/Supabase error to a key in the `errors` namespace. */
export function mapDbError(
  err: { code?: string; message?: string; details?: string } | null | undefined,
): string {
  if (!err) return 'generic';
  const msg = err.message ?? '';
  const text = `${msg} ${err.details ?? ''}`;
  if (err.code === '42501') return 'noPermission';
  if (err.code === '23505' && text.includes('trips_one_in_progress_per_vehicle')) return 'vehicleBusy';
  if (msg.includes('vehicle already has a trip')) return 'vehicleBusy';
  if (/vehicle is (MAINTENANCE|OUT_OF_SERVICE)/.test(msg)) return 'vehicleUnavailable';
  if (msg.includes('driver is not active')) return 'driverInactive';
  if (msg.includes('expense vehicle does not match')) return 'expenseVehicle';
  if (msg.includes('reason is required')) return 'voidReasonRequired';
  if (err.code === '23503') return 'badReference';
  if (err.code === '23505') {
    return text.includes('trips_one_in_progress_per_vehicle') ? 'vehicleBusy' : 'duplicate';
  }
  if (err.code === '22P02' || err.code === '22003') return 'invalidNumber';
  // 23514 (check violation) and anything else, including 'already voided', is generic.
  return 'generic';
}

/** Only same-origin relative paths are allowed. */
export function safeReturnTo(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(v)) return fallback;
  if (/%(2f|5c)/i.test(v)) return fallback;
  return v;
}
