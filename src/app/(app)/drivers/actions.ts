'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireViewer, isAdmin } from '@/lib/auth';
import { formValues, mapDbError, type FormState } from '@/lib/action-helpers';
import { fieldErrorsFromZod, zChoice, zDate, zOptionalText, zText, zUuid } from '@/lib/schemas';

const DRIVER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const emptyToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const driverSchema = z.object({
  name: zText(120),
  phone: zOptionalText(20),
  license_number: zOptionalText(40),
  license_expiry: z.preprocess(emptyToUndef, zDate({ allowFuture: true }).optional()),
  notes: zOptionalText(500),
});

export async function createDriver(_prev: FormState, fd: FormData): Promise<FormState> {
  const { profile } = await requireViewer();
  if (!isAdmin(profile)) return { error: 'noPermission' };
  const values = formValues(fd);

  const parsed = driverSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error), values };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from('drivers').insert({
    organization_id: profile.organization_id,
    name: d.name,
    phone: d.phone ?? null,
    license_number: d.license_number ?? null,
    license_expiry: d.license_expiry ?? null,
    notes: d.notes ?? null,
  });
  if (error) return { error: mapDbError(error), values };

  revalidatePath('/drivers');
  redirect('/drivers?saved=1');
}

const driverEditSchema = driverSchema.extend({ id: zUuid(), status: zChoice(DRIVER_STATUSES) });

export async function updateDriver(_prev: FormState, fd: FormData): Promise<FormState> {
  const { profile } = await requireViewer();
  if (!isAdmin(profile)) return { error: 'noPermission' };
  const values = formValues(fd);

  const parsed = driverEditSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error), values };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from('drivers')
    .update({
      name: d.name,
      phone: d.phone ?? null,
      license_number: d.license_number ?? null,
      license_expiry: d.license_expiry ?? null,
      status: d.status,
      notes: d.notes ?? null,
    })
    .eq('id', d.id)
    .eq('organization_id', profile.organization_id);
  if (error) return { error: mapDbError(error), values };

  revalidatePath('/drivers');
  redirect('/drivers?saved=1');
}
