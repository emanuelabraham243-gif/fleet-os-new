'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/auth';
import { fieldErrorsFromZod, zDate, zMoney, zText, zUuid } from '@/lib/schemas';
import { formValues, mapDbError, type FormState } from '@/lib/action-helpers';
import { canTransition, isTripStatus, tripDuplicateKey } from '@/lib/trip-rules';

const createSchema = z.object({
  vehicle_id: zUuid(),
  driver_id: zUuid(),
  trip_date: zDate({ allowFuture: true }),
  origin: zText(120),
  destination: zText(120),
  revenue: z.string().optional(),
});

export async function createTrip(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireViewer();
  const raw = formValues(fd);
  const confirm = raw.confirm === '1';
  const values = { ...raw };
  delete values.confirm;

  const parsed = createSchema.safeParse(values);
  const fieldErrors: Record<string, string> = parsed.success ? {} : fieldErrorsFromZod(parsed.error);

  let revenue: string | undefined;
  if (values.revenue && values.revenue.trim() !== '') {
    const r = zMoney().safeParse(values.revenue);
    if (r.success) revenue = r.data;
    else fieldErrors.revenue = r.error.issues[0]?.message ?? 'invalidNumber';
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) return { fieldErrors, values };
  const d = parsed.data;

  const supabase = await createClient();

  if (!confirm) {
    const { data: same, error: dupErr } = await supabase
      .from('trips')
      .select('vehicle_id, driver_id, trip_date, origin, destination')
      .eq('vehicle_id', d.vehicle_id)
      .eq('driver_id', d.driver_id)
      .eq('trip_date', d.trip_date)
      .is('voided_at', null);
    if (dupErr) return { error: mapDbError(dupErr), values };
    const key = tripDuplicateKey(d);
    if ((same ?? []).some((t) => tripDuplicateKey(t as typeof d) === key)) {
      return { error: 'duplicate', needsConfirm: true, values };
    }
  }

  // Atomic: the trip and its optional revenue are saved together or not at all.
  const { error } = await supabase.rpc('create_trip_with_revenue', {
    p_vehicle_id: d.vehicle_id,
    p_driver_id: d.driver_id,
    p_trip_date: d.trip_date,
    p_origin: d.origin,
    p_destination: d.destination,
    p_status: 'PLANNED',
    p_notes: null,
    p_revenue: revenue ?? null,
    p_revenue_description: null,
  });
  if (error) return { error: mapDbError(error), values };

  revalidatePath('/trips');
  revalidatePath('/expenses');
  revalidatePath('/vehicles');
  redirect('/trips?saved=1');
}

const statusSchema = z.object({ id: zUuid(), to: z.string() });

/** Plain <form action>: status change buttons. Re-checks against the current DB status. */
export async function setTripStatus(fd: FormData): Promise<void> {
  await requireViewer();
  const parsed = statusSchema.safeParse({ id: fd.get('id'), to: fd.get('to') });
  const back = typeof fd.get('back') === 'string' && String(fd.get('back')).startsWith('/trips')
    ? String(fd.get('back')).split('?')[0]
    : '/trips';
  if (!parsed.success || !isTripStatus(parsed.data.to)) redirect(`${back}?error=generic`);
  const { id, to } = parsed.data;

  const supabase = await createClient();
  const { data: current, error: readErr } = await supabase
    .from('trips')
    .select('status')
    .eq('id', id)
    .is('voided_at', null)
    .maybeSingle();
  if (readErr) redirect(`${back}?error=${mapDbError(readErr)}`);
  if (!current) redirect(`${back}?error=notFound`);
  if (!canTransition(current.status as string, to)) redirect(`${back}?warn=badTransition`);

  const { data, error } = await supabase
    .from('trips')
    .update({ status: to })
    .eq('id', id)
    .eq('status', current.status as string)
    .select('id');
  if (error) redirect(`${back}?error=${mapDbError(error)}`);
  if (!data || data.length === 0) redirect(`${back}?warn=badTransition`);

  revalidatePath('/trips');
  revalidatePath('/vehicles');
  revalidatePath('/');
  redirect(`${back}?saved=1`);
}
