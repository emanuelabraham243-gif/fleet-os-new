'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireViewer, isAdmin } from '@/lib/auth';
import { formValues, mapDbError, type FormState } from '@/lib/action-helpers';
import { fieldErrorsFromZod, zChoice, zOdometer, zOptionalText, zText, zUuid } from '@/lib/schemas';

const EDITABLE_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'OUT_OF_SERVICE'] as const;

const zYear = () =>
  z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (s == null || s.trim() === '') return undefined;
      const t = s.trim();
      if (!/^\d{4}$/.test(t) || Number(t) < 1980 || Number(t) > 2100) {
        ctx.addIssue({ code: 'custom', message: 'invalidNumber' });
        return z.NEVER;
      }
      return Number(t);
    });

const vehicleSchema = z.object({
  name: zText(120),
  plate_number: zText(30),
  make: zOptionalText(60),
  model: zOptionalText(60),
  year: zYear(),
  current_odometer: zOdometer(),
  notes: zOptionalText(500),
});

export async function createVehicle(_prev: FormState, fd: FormData): Promise<FormState> {
  const { profile } = await requireViewer();
  if (!isAdmin(profile)) return { error: 'noPermission' };
  const values = formValues(fd);

  const parsed = vehicleSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error), values };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from('vehicles').insert({
    organization_id: profile.organization_id,
    name: d.name,
    plate_number: d.plate_number,
    make: d.make ?? null,
    model: d.model ?? null,
    year: d.year ?? null,
    current_odometer: d.current_odometer ?? null,
    notes: d.notes ?? null,
  });
  if (error) return { error: mapDbError(error), values };

  revalidatePath('/vehicles');
  redirect('/vehicles?saved=1');
}

const vehicleEditSchema = vehicleSchema.extend({
  id: zUuid(),
  status: zChoice(EDITABLE_STATUSES).optional(),
});

export async function updateVehicle(_prev: FormState, fd: FormData): Promise<FormState> {
  const { profile } = await requireViewer();
  if (!isAdmin(profile)) return { error: 'noPermission' };
  const values = formValues(fd);

  const parsed = vehicleEditSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error), values };
  const d = parsed.data;

  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    name: d.name,
    plate_number: d.plate_number,
    make: d.make ?? null,
    model: d.model ?? null,
    year: d.year ?? null,
    current_odometer: d.current_odometer ?? null,
    notes: d.notes ?? null,
  };

  if (d.status) {
    // The form omits the status field while a trip is open; guard again here
    // against a direct/racing submit so a manual edit can never contradict
    // the trip-driven ON_TRIP state.
    const { data: openTrip } = await supabase
      .from('trips')
      .select('id')
      .eq('vehicle_id', d.id)
      .eq('status', 'IN_PROGRESS')
      .is('voided_at', null)
      .maybeSingle();
    if (!openTrip) patch.status = d.status;
  }

  const { error } = await supabase
    .from('vehicles')
    .update(patch)
    .eq('id', d.id)
    .eq('organization_id', profile.organization_id);
  if (error) return { error: mapDbError(error), values };

  revalidatePath('/vehicles');
  revalidatePath(`/vehicles/${d.id}`);
  redirect(`/vehicles/${d.id}?saved=1`);
}
