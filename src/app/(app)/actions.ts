'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getViewer, requireViewer } from '@/lib/auth';
import { LANG_COOKIE, isLocale } from '@/lib/i18n-core';
import { mapDbError, safeReturnTo, formValues, type FormState } from '@/lib/action-helpers';

export async function setLanguage(fd: FormData): Promise<void> {
  const locale = fd.get('locale');
  const returnTo = safeReturnTo(fd.get('returnTo'), '/');
  if (!isLocale(locale)) redirect(returnTo);

  const store = await cookies();
  store.set(LANG_COOKIE, locale, {
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });

  const viewer = await getViewer();
  if (viewer?.profile) {
    const supabase = await createClient();
    await supabase.from('profiles').update({ language: locale }).eq('id', viewer.user.id);
  }

  revalidatePath('/', 'layout');
  redirect(returnTo);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

const VOID_TABLES = [
  'trips',
  'trip_revenue',
  'trip_expenses',
  'fuel_records',
  'service_records',
  'vehicle_documents',
  'driver_documents',
  'incidents',
] as const;

const voidSchema = z.object({
  table: z.enum(VOID_TABLES),
  id: z.uuid(),
  reason: z.string().trim().min(3),
});

export async function voidRecord(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireViewer();
  const values = formValues(fd);
  const returnTo = safeReturnTo(values.returnTo, '/');

  const parsed = voidSchema.safeParse(values);
  if (!parsed.success) {
    const reasonBad = parsed.error.issues.some((i) => i.path[0] === 'reason');
    return reasonBad
      ? { fieldErrors: { reason: 'voidReasonRequired' }, values: { reason: values.reason ?? '' } }
      : { error: 'generic' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(parsed.data.table)
    .update({ voided_at: new Date().toISOString(), void_reason: parsed.data.reason })
    .eq('id', parsed.data.id)
    .select('id');

  if (error) return { error: mapDbError(error) };
  if (!data || data.length === 0) return { error: 'noPermission' };

  revalidatePath(returnTo);
  const sep = returnTo.includes('?') ? '&' : '?';
  redirect(`${returnTo}${sep}saved=1`);
}
