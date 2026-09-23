'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireViewer, isAdmin } from '@/lib/auth';
import { formValues, mapDbError, type FormState } from '@/lib/action-helpers';
import {
  fieldErrorsFromZod, zChoice, zDate, zOdometer, zOptionalText, zUuid,
} from '@/lib/schemas';
import { parseDecimal } from '@/lib/money';
import {
  SERVICE_CATEGORIES, hasInterval, odometerJumpNeedsConfirm,
} from '@/lib/maintenance-rules';

const emptyToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** Optional non-negative money (0 allowed: free service). Returns a decimal string. */
const zOptionalCost = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (s == null || s.trim() === '') return undefined;
    const v = parseDecimal(s, { maxInt: 12, maxFrac: 2 });
    if (v === null) {
      ctx.addIssue({ code: 'custom', message: 'invalidNumber' });
      return z.NEVER;
    }
    return v;
  });

const serviceSchema = z.object({
  vehicle_id: zUuid(),
  category: zChoice(SERVICE_CATEGORIES),
  service_date: zDate(),
  odometer: zOdometer(),
  cost: zOptionalCost,
  service_provider: zOptionalText(120),
  description: zOptionalText(500),
});

export async function createServiceRecord(_prev: FormState, fd: FormData): Promise<FormState> {
  const { profile } = await requireViewer();
  const values = formValues(fd);

  const parsed = serviceSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: vehicle, error: vErr } = await supabase
    .from('vehicles')
    .select('id, current_odometer')
    .eq('id', d.vehicle_id)
    .eq('organization_id', profile.organization_id)
    .maybeSingle();
  if (vErr) return { error: mapDbError(vErr), values };
  if (!vehicle) return { fieldErrors: { vehicle_id: 'invalidChoice' }, values };

  // Only large forward jumps need confirmation; lower (backdated) readings are allowed.
  if (
    values.confirm !== '1' &&
    d.odometer !== undefined &&
    odometerJumpNeedsConfirm(
      Number(d.odometer),
      vehicle.current_odometer == null ? null : Number(vehicle.current_odometer),
    )
  ) {
    return { needsConfirm: true, values };
  }

  const { error } = await supabase.from('service_records').insert({
    organization_id: profile.organization_id,
    vehicle_id: d.vehicle_id,
    category: d.category,
    service_date: d.service_date,
    odometer: d.odometer ?? null,
    cost: d.cost ?? null,
    service_provider: d.service_provider ?? null,
    description: d.description ?? null,
  });
  if (error) return { error: mapDbError(error), values };

  revalidatePath('/maintenance');
  redirect('/maintenance?saved=1');
}

const scheduleSchema = z.object({
  vehicle_id: zUuid(),
  service_category: zChoice(SERVICE_CATEGORIES),
  interval_km: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (s == null || s.trim() === '') return undefined;
      const v = parseDecimal(s, { maxInt: 7, maxFrac: 1 });
      if (v === null || Number(v) <= 0) {
        ctx.addIssue({ code: 'custom', message: 'invalidNumber' });
        return z.NEVER;
      }
      return v;
    }),
  interval_days: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (s == null || s.trim() === '') return undefined;
      const t = s.trim();
      if (!/^\d{1,4}$/.test(t) || Number(t) <= 0) {
        ctx.addIssue({ code: 'custom', message: 'invalidNumber' });
        return z.NEVER;
      }
      return Number(t);
    }),
  interval_trips: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (s == null || s.trim() === '') return undefined;
      const t = s.trim();
      if (!/^\d{1,3}$/.test(t) || Number(t) <= 0) {
        ctx.addIssue({ code: 'custom', message: 'invalidNumber' });
        return z.NEVER;
      }
      return Number(t);
    }),
  next_due_date: z.preprocess(emptyToUndef, zDate({ allowFuture: true }).optional()),
  next_due_odometer: zOdometer(),
});

export async function createSchedule(_prev: FormState, fd: FormData): Promise<FormState> {
  const { profile } = await requireViewer();
  if (!isAdmin(profile)) return { error: 'noPermission' };
  const values = formValues(fd);

  const parsed = scheduleSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }
  const d = parsed.data;
  if (!hasInterval(values.interval_km, values.interval_days, values.interval_trips)) {
    return { error: 'maintenance.intervalRequired', values };
  }

  const supabase = await createClient();
  const { data: vehicle, error: vErr } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', d.vehicle_id)
    .eq('organization_id', profile.organization_id)
    .maybeSingle();
  if (vErr) return { error: mapDbError(vErr), values };
  if (!vehicle) return { fieldErrors: { vehicle_id: 'invalidChoice' }, values };

  const { error } = await supabase.from('maintenance_schedules').insert({
    organization_id: profile.organization_id,
    vehicle_id: d.vehicle_id,
    service_category: d.service_category,
    interval_km: d.interval_km ?? null,
    interval_days: d.interval_days ?? null,
    interval_trips: d.interval_trips ?? null,
    next_due_date: d.next_due_date ?? null,
    next_due_odometer: d.next_due_odometer ?? null,
  });
  if (error) {
    return { error: error.code === '23505' ? 'maintenance.duplicateSchedule' : mapDbError(error), values };
  }

  revalidatePath('/maintenance');
  redirect('/maintenance?saved=1');
}
