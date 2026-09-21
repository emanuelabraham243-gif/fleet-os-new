'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/auth';
import {
  fieldErrorsFromZod,
  zChoice,
  zDate,
  zMoney,
  zOdometer,
  zOptionalText,
  zQuantity,
  zUuid,
} from '@/lib/schemas';
import { formValues, mapDbError, type FormState } from '@/lib/action-helpers';
import { isOdometerSuspicious } from '@/lib/trip-rules';

const fuelSchema = z.object({
  vehicle_id: zUuid(),
  fuel_date: zDate(),
  fuel_type: zChoice(['DIESEL', 'PETROL'] as const),
  quantity: zQuantity({ max: 2000 }),
  unit_price: zMoney(),
  total_amount: zMoney(),
  odometer: zOdometer(),
  notes: zOptionalText(500),
});

export async function createFuel(_prev: FormState, fd: FormData): Promise<FormState> {
  const { profile } = await requireViewer();
  const raw = formValues(fd);
  const confirm = raw.confirm === '1';
  const values = { ...raw };
  delete values.confirm;

  const parsed = fuelSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error), values };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: vehicle, error: vErr } = await supabase
    .from('vehicles')
    .select('id, current_odometer')
    .eq('id', d.vehicle_id)
    .maybeSingle();
  if (vErr) return { error: mapDbError(vErr), values };
  if (!vehicle) return { fieldErrors: { vehicle_id: 'invalidChoice' }, values };

  if (!confirm && d.odometer !== undefined) {
    const current = vehicle.current_odometer == null ? null : Number(vehicle.current_odometer);
    if (isOdometerSuspicious(Number(d.odometer), current)) {
      return { error: 'odometerJump', needsConfirm: true, values };
    }
  }

  const { data: row, error } = await supabase
    .from('fuel_records')
    .insert({
      organization_id: profile.organization_id,
      vehicle_id: d.vehicle_id,
      fuel_date: d.fuel_date,
      fuel_type: d.fuel_type,
      quantity: d.quantity,
      unit_price: d.unit_price,
      total_amount: d.total_amount,
      odometer: d.odometer ?? null,
      notes: d.notes ?? null,
    })
    .select('amount_mismatch')
    .single();
  if (error || !row) return { error: mapDbError(error), values };

  revalidatePath(`/vehicles/${d.vehicle_id}`);
  revalidatePath('/vehicles');
  redirect(`/vehicles/${d.vehicle_id}?saved=1${row.amount_mismatch ? '&warn=mismatch' : ''}`);
}
