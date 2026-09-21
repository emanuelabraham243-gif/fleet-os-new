'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { LANG_COOKIE, isLocale } from '@/lib/i18n-core';
import type { FormState } from '@/lib/action-helpers';

const emailSchema = z.email();
const passwordLogin = z.object({ email: z.email(), password: z.string().min(1) });

export async function signInWithPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get('email') ?? '').trim();
  const values = { email };
  const parsed = passwordLogin.safeParse({
    email,
    password: String(fd.get('password') ?? ''),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = 'required';
    return { fieldErrors, values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: 'invalidCreds', values };

  const { data: profile } = await supabase
    .from('profiles')
    .select('language')
    .eq('id', data.user.id)
    .maybeSingle();
  if (isLocale(profile?.language)) {
    const store = await cookies();
    store.set(LANG_COOKIE, profile.language, {
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }
  redirect('/');
}

export async function sendMagicLink(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get('email') ?? '').trim();
  const values = { email };
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { fieldErrors: { email: 'required' }, values };

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  const origin = h.get('origin') ?? (host ? `${proto}://${host}` : '');

  const supabase = await createClient();
  // Result deliberately ignored so the response never reveals whether the email exists.
  await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` },
  });
  return { ok: true, values };
}
