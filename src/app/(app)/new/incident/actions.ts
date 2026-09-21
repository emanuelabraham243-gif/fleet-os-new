'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/auth';
import { fieldErrorsFromZod, zOptionalText, zText, zUuid } from '@/lib/schemas';
import { formValues, mapDbError, type FormState } from '@/lib/action-helpers';
import { addisLocalToIso } from '@/lib/trip-rules';

const incidentSchema = z.object({
  vehicle_id: zUuid(),
  driver_id: z.string().optional(),
  trip_id: z.string().optional(),
  occurred_at: z.string({ error: 'required' }).min(1, 'required'),
  title: zText(120),
  description: zOptionalText(2000),
});

export async function createIncident(_prev: FormState, fd: FormData): Promise<FormState> {
  const { profile } = await requireViewer();
  const values = formValues(fd);

  const parsed = incidentSchema.safeParse(values);
  const fieldErrors: Record<string, string> = parsed.success ? {} : fieldErrorsFromZod(parsed.error);

  const uuid = z.uuid();
  const driverId = values.driver_id?.trim() ? values.driver_id.trim() : undefined;
  const tripId = values.trip_id?.trim() ? values.trip_id.trim() : undefined;
  if (driverId && !uuid.safeParse(driverId).success) fieldErrors.driver_id = 'invalidChoice';
  if (tripId && !uuid.safeParse(tripId).success) fieldErrors.trip_id = 'invalidChoice';

  const iso = addisLocalToIso(values.occurred_at ?? '');
  if (!fieldErrors.occurred_at) {
    if (!iso) fieldErrors.occurred_at = 'invalidDate';
    else if (new Date(iso).getTime() > Date.now() + 5 * 60_000) fieldErrors.occurred_at = 'futureDate';
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0 || !iso) {
    return { fieldErrors, values };
  }
  const d = parsed.data;

  const supabase = await createClient();
  if (tripId) {
    const { data: trip, error: tErr } = await supabase
      .from('trips')
      .select('id')
      .eq('id', tripId)
      .eq('vehicle_id', d.vehicle_id)
      .is('voided_at', null)
      .maybeSingle();
    if (tErr) return { error: mapDbError(tErr), values };
    if (!trip) return { fieldErrors: { trip_id: 'invalidChoice' }, values };
  }

  const { error } = await supabase.from('incidents').insert({
    organization_id: profile.organization_id,
    vehicle_id: d.vehicle_id,
    driver_id: driverId ?? null,
    trip_id: tripId ?? null,
    occurred_at: iso,
    title: d.title,
    description: d.description ?? null,
    status: 'OPEN',
  });
  if (error) return { error: mapDbError(error), values };

  revalidatePath(`/vehicles/${d.vehicle_id}`);
  redirect(`/vehicles/${d.vehicle_id}?saved=1`);
}
