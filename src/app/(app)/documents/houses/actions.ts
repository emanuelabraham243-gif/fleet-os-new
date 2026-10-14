'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, requireViewer } from '@/lib/auth';
import { parseMoney } from '@/lib/money';
import { formValues, mapDbError, type FormState } from '@/lib/action-helpers';
import { fieldErrorsFromZod, zChoice, zDate, zOptionalText, zText, zUuid } from '@/lib/schemas';
import { HOUSE_PAYMENT_KINDS, HOUSE_PLANS, HOUSE_STATUSES, splitChecks } from '@/lib/house-rules';

const PATH = '/documents/houses';
const emptyToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const checked = z.preprocess((v) => v === 'on' || v === '1' || v === 'true', z.boolean());

/** Blank = unknown (undefined); otherwise a positive amount. */
function zOptionalMoney() {
  return z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (s == null || s.trim() === '') return undefined;
      const v = parseMoney(s);
      if (v === null) {
        ctx.addIssue({ code: 'custom', message: 'invalidNumber' });
        return z.NEVER;
      }
      return v;
    });
}

const houseSchema = z.object({
  id: z.preprocess(emptyToUndef, zUuid().optional()),
  name: zText(120),
  kind: zOptionalText(120),
  location: zOptionalText(160),
  house_no: zOptionalText(60),
  ownership: zOptionalText(160),
  price: zOptionalMoney(),
  price_confirmed: checked,
  plan: zChoice(HOUSE_PLANS),
  rounds_total: z.preprocess(
    emptyToUndef,
    z.coerce.number({ error: 'invalidNumber' }).int('invalidNumber').min(1, 'invalidNumber').max(500, 'invalidNumber').optional(),
  ),
  round_amount: zOptionalMoney(),
  payments_complete: checked,
  property_status: zChoice(HOUSE_STATUSES),
  hold_reason: zOptionalText(500),
  next_due_on: z.preprocess(emptyToUndef, zDate({ allowFuture: true }).optional()),
  next_amount: zOptionalMoney(),
  finishing_pending: checked,
  finishing_amount: zOptionalMoney(),
  checks: zOptionalText(4000),
  notes: zOptionalText(4000),
  refs: zOptionalText(2000),
});

async function requireAdmin() {
  const { profile } = await requireViewer();
  return isAdmin(profile) ? profile : null;
}

export async function saveHouse(_prev: FormState, fd: FormData): Promise<FormState> {
  const profile = await requireAdmin();
  const values = formValues(fd);
  if (!profile) return { error: 'noPermission', values };

  const parsed = houseSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error), values };
  const d = parsed.data;

  const row = {
    name: d.name,
    kind: d.kind ?? null,
    location: d.location ?? null,
    house_no: d.house_no ?? null,
    ownership: d.ownership ?? null,
    price: d.price ?? null,
    price_confirmed: d.price_confirmed,
    plan: d.plan,
    rounds_total: d.rounds_total ?? null,
    round_amount: d.round_amount ?? null,
    payments_complete: d.payments_complete,
    property_status: d.property_status,
    hold_reason: d.hold_reason ?? null,
    next_due_on: d.next_due_on ?? null,
    next_amount: d.next_amount ?? null,
    finishing_pending: d.finishing_pending,
    finishing_amount: d.finishing_amount ?? null,
    checks: splitChecks(d.checks),
    notes: d.notes ?? null,
    refs: d.refs ?? null,
  };

  const supabase = await createClient();
  if (d.id) {
    const { data, error } = await supabase
      .from('house_properties')
      .update(row)
      .eq('id', d.id)
      .is('voided_at', null)
      .select('id');
    if (error) return { error: mapDbError(error), values };
    if (!data || data.length === 0) return { error: 'notFound', values };
  } else {
    const { data: last } = await supabase
      .from('house_properties')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase.from('house_properties').insert({
      ...row,
      organization_id: profile.organization_id,
      sort_order: ((last?.sort_order as number | undefined) ?? 0) + 1,
    });
    if (error) return { error: mapDbError(error), values };
  }

  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

const paymentSchema = z.object({
  property_id: zUuid(),
  amount: zOptionalMoney().refine((v) => v !== undefined, 'required'),
  kind: zChoice(HOUSE_PAYMENT_KINDS),
  paid_on: z.preprocess(emptyToUndef, zDate().optional()),
  confirmed: checked,
  note: zOptionalText(300),
});

export async function recordHousePayment(_prev: FormState, fd: FormData): Promise<FormState> {
  const profile = await requireAdmin();
  const values = formValues(fd);
  if (!profile) return { error: 'noPermission', values };

  const parsed = paymentSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error), values };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: house, error: houseErr } = await supabase
    .from('house_properties')
    .select('id')
    .eq('id', d.property_id)
    .is('voided_at', null)
    .maybeSingle();
  if (houseErr) return { error: mapDbError(houseErr), values };
  if (!house) return { error: 'notFound', values };

  // Round and advance payments are numbered in order (advance = 1).
  let label: string | null = null;
  if (d.kind === 'round' || d.kind === 'advance') {
    const { count } = await supabase
      .from('house_payments')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', d.property_id)
      .in('kind', ['round', 'advance'])
      .is('voided_at', null);
    label = String((count ?? 0) + 1);
  }

  const { error } = await supabase.from('house_payments').insert({
    organization_id: profile.organization_id,
    property_id: d.property_id,
    amount: d.amount,
    kind: d.kind,
    paid_on: d.paid_on ?? null,
    confirmed: d.confirmed,
    note: d.note ?? null,
    label,
  });
  if (error) return { error: mapDbError(error), values };

  // A recorded payment settles the reminder that was due; the next one is set with Edit house.
  const patch: Record<string, unknown> = { next_due_on: null, next_amount: null };
  if (d.kind === 'finishing' && d.confirmed) patch.finishing_pending = false;
  await supabase.from('house_properties').update(patch).eq('id', d.property_id);

  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function confirmHousePayment(fd: FormData): Promise<void> {
  const profile = await requireAdmin();
  const id = z.uuid().safeParse(fd.get('id'));
  if (!profile || !id.success) redirect(`${PATH}?error=generic`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('house_payments')
    .update({ confirmed: true })
    .eq('id', id.data)
    .is('voided_at', null)
    .select('id');
  if (error || !data || data.length === 0) redirect(`${PATH}?error=${error ? mapDbError(error) : 'notFound'}`);

  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}
