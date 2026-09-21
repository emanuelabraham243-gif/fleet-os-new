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
  zOptionalText,
  zUuid,
} from '@/lib/schemas';
import { formValues, mapDbError, type FormState } from '@/lib/action-helpers';
import { toCents } from '@/lib/money';
import { expenseDuplicateKey } from '@/lib/trip-rules';

const CATEGORIES = [
  'FUEL',
  'DRIVER_ALLOWANCE',
  'TOLL',
  'LOADING',
  'PARKING',
  'REPAIR',
  'FINE',
  'OTHER',
] as const;

const expenseSchema = z.object({
  trip_id: zUuid(),
  category: zChoice(CATEGORIES),
  amount: zMoney(),
  expense_date: zDate(),
  description: zOptionalText(200),
});

export async function createExpense(_prev: FormState, fd: FormData): Promise<FormState> {
  const { profile } = await requireViewer();
  const raw = formValues(fd);
  const confirm = raw.confirm === '1';
  const values = { ...raw };
  delete values.confirm;

  const parsed = expenseSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error), values };
  const d = parsed.data;

  const supabase = await createClient();
  // Vehicle always comes from the trip in the database, never from the client.
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('id, vehicle_id')
    .eq('id', d.trip_id)
    .is('voided_at', null)
    .maybeSingle();
  if (tripErr) return { error: mapDbError(tripErr), values };
  if (!trip) return { fieldErrors: { trip_id: 'invalidChoice' }, values };

  if (!confirm) {
    const { data: same, error: dupErr } = await supabase
      .from('trip_expenses')
      .select('amount')
      .eq('trip_id', d.trip_id)
      .eq('category', d.category)
      .eq('expense_date', d.expense_date)
      .is('voided_at', null);
    if (dupErr) return { error: mapDbError(dupErr), values };
    const key = expenseDuplicateKey({
      trip_id: d.trip_id,
      category: d.category,
      amountCents: toCents(d.amount) ?? -1,
      expense_date: d.expense_date,
    });
    const isDup = (same ?? []).some(
      (e) =>
        expenseDuplicateKey({
          trip_id: d.trip_id,
          category: d.category,
          amountCents: toCents(e.amount as number | string) ?? -2,
          expense_date: d.expense_date,
        }) === key,
    );
    if (isDup) return { error: 'duplicate', needsConfirm: true, values };
  }

  const { error } = await supabase.from('trip_expenses').insert({
    organization_id: profile.organization_id,
    trip_id: d.trip_id,
    vehicle_id: trip.vehicle_id as string,
    category: d.category,
    amount: d.amount,
    expense_date: d.expense_date,
    description: d.description ?? null,
  });
  if (error) return { error: mapDbError(error), values };

  revalidatePath('/expenses');
  revalidatePath('/trips');
  redirect(`/expenses?trip=${d.trip_id}&saved=1`);
}

const revenueSchema = z.object({
  trip_id: zUuid(),
  amount: zMoney(),
  revenue_date: zDate(),
  description: zOptionalText(200),
});

export async function createRevenue(_prev: FormState, fd: FormData): Promise<FormState> {
  const { profile } = await requireViewer();
  const raw = formValues(fd);
  const confirm = raw.confirm === '1';
  const values = { ...raw };
  delete values.confirm;

  const parsed = revenueSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error), values };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('id')
    .eq('id', d.trip_id)
    .is('voided_at', null)
    .maybeSingle();
  if (tripErr) return { error: mapDbError(tripErr), values };
  if (!trip) return { fieldErrors: { trip_id: 'invalidChoice' }, values };

  if (!confirm) {
    const { data: same, error: dupErr } = await supabase
      .from('trip_revenue')
      .select('amount')
      .eq('trip_id', d.trip_id)
      .eq('revenue_date', d.revenue_date)
      .is('voided_at', null);
    if (dupErr) return { error: mapDbError(dupErr), values };
    const cents = toCents(d.amount);
    if ((same ?? []).some((r) => toCents(r.amount as number | string) === cents)) {
      return { error: 'duplicate', needsConfirm: true, values };
    }
  }

  const { error } = await supabase.from('trip_revenue').insert({
    organization_id: profile.organization_id,
    trip_id: d.trip_id,
    amount: d.amount,
    revenue_date: d.revenue_date,
    description: d.description ?? null,
  });
  if (error) return { error: mapDbError(error), values };

  revalidatePath('/expenses');
  revalidatePath('/trips');
  redirect(`/expenses?trip=${d.trip_id}&saved=1`);
}
