'use server';

import { createClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/auth';
import { checkNewPassword } from '@/lib/auth-rules';
import type { FormState } from '@/lib/action-helpers';

export async function updatePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireViewer();
  const problem = checkNewPassword(String(fd.get('password') ?? ''), String(fd.get('confirm') ?? ''));
  if (problem) return { fieldErrors: { [problem === 'passwordMismatch' ? 'confirm' : 'password']: problem } };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: String(fd.get('password')) });
  if (error) return { error: 'generic' };
  return { ok: true };
}
