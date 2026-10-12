'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireViewer, isAdmin } from '@/lib/auth';
import { normalizeEthiopianMobile } from '@/lib/phone';
import { checkNewPassword } from '@/lib/auth-rules';
import { formValues, mapDbError, type FormState } from '@/lib/action-helpers';

const ROLES = ['admin', 'staff'] as const;

/** Puts a person on the organization's list so they can sign up with that number. */
export async function addPerson(_prev: FormState, fd: FormData): Promise<FormState> {
  const { profile } = await requireViewer();
  if (!isAdmin(profile)) return { error: 'noPermission' };
  const values = formValues(fd);

  const fieldErrors: Record<string, string> = {};
  const name = (values.full_name ?? '').trim();
  if (!name || name.length > 120) fieldErrors.full_name = 'required';
  const phone = normalizeEthiopianMobile(values.phone);
  if (!phone) fieldErrors.phone = 'phoneInvalid';
  const role = z.enum(ROLES).safeParse(values.role);
  if (!role.success) fieldErrors.role = 'invalidChoice';
  if (Object.keys(fieldErrors).length > 0 || !phone || !role.success) return { fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase
    .from('org_phone_members')
    .insert({ organization_id: profile.organization_id, phone, full_name: name, role: role.data });
  if (error) return { error: error.code === '23505' ? 'users.phoneOnList' : mapDbError(error), values };

  revalidatePath('/users');
  redirect('/users?saved=1');
}

/** Removes someone who has not signed up yet (RLS refuses signed-up people). */
export async function removePerson(fd: FormData): Promise<void> {
  const { profile } = await requireViewer();
  if (!isAdmin(profile)) redirect('/users?error=noPermission');
  const id = z.uuid().safeParse(fd.get('id'));
  if (!id.success) redirect('/users?error=generic');

  const supabase = await createClient();
  const { data } = await supabase.from('org_phone_members').delete().eq('id', id.data).is('user_id', null).select('id');
  revalidatePath('/users');
  redirect(data && data.length > 0 ? '/users?saved=1' : '/users?error=notFound');
}

/**
 * Recovery when SMS is not available: an admin sets a temporary password for a signed-up person
 * in their own organization. Every session of that person is signed out.
 */
export async function setTemporaryPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user, profile } = await requireViewer();
  if (!isAdmin(profile)) return { error: 'noPermission' };
  const id = z.uuid().safeParse(fd.get('id'));
  if (!id.success) return { error: 'generic' };
  const password = String(fd.get('password') ?? '');
  const problem = checkNewPassword(password, String(fd.get('confirm') ?? ''));
  if (problem) return { fieldErrors: { [problem === 'passwordMismatch' ? 'confirm' : 'password']: problem } };

  // Read through RLS: only rows of the caller's own organization are visible to an admin.
  const supabase = await createClient();
  const { data: member } = await supabase
    .from('org_phone_members')
    .select('user_id, organization_id')
    .eq('id', id.data)
    .maybeSingle();
  if (!member?.user_id || member.organization_id !== profile.organization_id) return { error: 'notFound' };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(member.user_id, { password });
  if (error) return { error: 'generic' };
  await admin.rpc('auth_revoke_sessions', { p_user: member.user_id });
  await admin.from('audit_logs').insert({
    organization_id: profile.organization_id,
    actor_id: user.id,
    action: 'TEMP_PASSWORD_SET',
    entity_type: 'auth',
    entity_id: member.user_id,
  });
  if (member.user_id === user.id) redirect('/login');
  return { ok: true };
}
