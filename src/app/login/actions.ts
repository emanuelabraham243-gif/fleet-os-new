'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { LANG_COOKIE, isLocale } from '@/lib/i18n-core';
import { normalizeEthiopianMobile } from '@/lib/phone';
import { checkNewPassword, cleanResetCode } from '@/lib/auth-rules';
import { generateResetCode, getSmsSender, hashResetCode, resetCodeMessage } from '@/lib/sms';
import type { FormState } from '@/lib/action-helpers';

// Every action here is reachable by anyone (signed out). Inputs are untrusted; passwords and codes
// are never logged, returned, or put in a URL.

async function rememberLanguage(userId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('language').eq('id', userId).maybeSingle();
  if (isLocale(profile?.language)) {
    const store = await cookies();
    store.set(LANG_COOKIE, profile.language, {
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }
}

async function audit(userId: string, action: string) {
  await createAdminClient().rpc('auth_audit', { p_user: userId, p_action: action });
}

/** Signs the person in on this device. Returns the user id, or null on wrong credentials. */
async function startSession(phone: string, password: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ phone, password });
  return error || !data.user ? null : data.user.id;
}

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const rawPhone = String(fd.get('phone') ?? '');
  const password = String(fd.get('password') ?? '');
  const values = { phone: rawPhone };
  const phone = normalizeEthiopianMobile(rawPhone);
  if (!phone) return { fieldErrors: { phone: 'phoneInvalid' }, values };
  if (!password) return { fieldErrors: { password: 'required' }, values };

  const admin = createAdminClient();
  const { data: lockedUntil } = await admin.rpc('auth_login_locked_until', { p_phone: phone });
  if (lockedUntil) return { error: 'auth.tooManyTries', values };

  const userId = await startSession(phone, password);
  const { data: nowLocked } = await admin.rpc('auth_login_record', { p_phone: phone, p_success: Boolean(userId) });
  if (!userId) return { error: nowLocked ? 'auth.tooManyTries' : 'auth.invalidCreds', values };

  await audit(userId, 'SIGN_IN');
  await rememberLanguage(userId);
  redirect('/');
}

export async function signUp(_prev: FormState, fd: FormData): Promise<FormState> {
  const rawPhone = String(fd.get('phone') ?? '');
  const password = String(fd.get('password') ?? '');
  const confirm = String(fd.get('confirm') ?? '');
  const values = { phone: rawPhone };
  const phone = normalizeEthiopianMobile(rawPhone);
  if (!phone) return { fieldErrors: { phone: 'phoneInvalid' }, values };
  const pwError = checkNewPassword(password, confirm);
  if (pwError) return { fieldErrors: { [pwError === 'passwordMismatch' ? 'confirm' : 'password']: pwError }, values };

  // Only numbers an admin put on their organization's people list may create an account.
  const admin = createAdminClient();
  const { data: member } = await admin
    .from('org_phone_members')
    .select('organization_id, role, full_name, user_id')
    .eq('phone', phone)
    .maybeSingle();
  if (!member) return { error: 'auth.notListed', values };
  if (member.user_id) return { error: 'auth.phoneTaken', values };

  const { error } = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
    app_metadata: { organization_id: member.organization_id, role: member.role },
    user_metadata: { full_name: member.full_name },
  });
  if (error) return { error: error.code === 'phone_exists' ? 'auth.phoneTaken' : 'generic', values };

  const userId = await startSession(phone, password);
  if (!userId) return { error: 'generic', values };
  await audit(userId, 'SIGN_UP');
  redirect('/');
}

/** Step 1 of "forgot password". Same answer whether or not the number has an account. */
export async function requestReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const rawPhone = String(fd.get('phone') ?? '');
  const phone = normalizeEthiopianMobile(rawPhone);
  if (!phone) return { fieldErrors: { phone: 'phoneInvalid' }, values: { phone: rawPhone } };

  const sender = getSmsSender();
  if (!sender) return { error: 'auth.smsUnavailable', values: { phone: rawPhone } };

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('id').eq('phone_e164', phone).maybeSingle();
  if (profile) {
    const code = generateResetCode();
    const { data: result } = await admin.rpc('auth_reset_request', {
      p_phone: phone,
      p_code_hash: hashResetCode(phone, code),
    });
    if (result === 'ok') {
      await sender.send(phone, resetCodeMessage(code));
      await audit(profile.id, 'RESET_REQUEST');
    }
  }
  return { ok: true, values: { phone } };
}

/** Step 2: code + new password. On success every other session is signed out. */
export async function completeReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const phone = normalizeEthiopianMobile(String(fd.get('phone') ?? ''));
  const password = String(fd.get('password') ?? '');
  const confirm = String(fd.get('confirm') ?? '');
  const values = { phone: phone ?? '' };
  if (!phone) return { error: 'generic' };
  const code = cleanResetCode(fd.get('code'));
  if (!code) return { ok: true, fieldErrors: { code: 'codeInvalid' }, values };
  const pwError = checkNewPassword(password, confirm);
  if (pwError) {
    return { ok: true, fieldErrors: { [pwError === 'passwordMismatch' ? 'confirm' : 'password']: pwError }, values };
  }

  const admin = createAdminClient();
  const { data: result } = await admin.rpc('auth_reset_verify', {
    p_phone: phone,
    p_code_hash: hashResetCode(phone, code),
  });
  if (result === 'blocked') return { ok: true, error: 'auth.codeBlocked', values };
  if (result !== 'ok') return { ok: true, error: 'auth.codeInvalid', values };

  const { data: profile } = await admin.from('profiles').select('id').eq('phone_e164', phone).maybeSingle();
  if (!profile) return { error: 'generic' };
  const { error } = await admin.auth.admin.updateUserById(profile.id, { password });
  if (error) return { ok: true, error: 'generic', values };

  await admin.rpc('auth_revoke_sessions', { p_user: profile.id });
  await admin.rpc('auth_login_record', { p_phone: phone, p_success: true });
  const userId = await startSession(phone, password);
  await audit(profile.id, 'RESET_COMPLETE');
  if (!userId) redirect('/login');
  await rememberLanguage(userId);
  redirect('/');
}
