'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/auth';
import type { FormState } from '@/lib/action-helpers';

const schema = z.object({ password: z.string().min(8) });

export async function updatePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireViewer();
  const parsed = schema.safeParse({ password: fd.get('password') });
  if (!parsed.success) return { fieldErrors: { password: 'passwordTooShort' } };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: 'generic' };
  return { ok: true };
}
