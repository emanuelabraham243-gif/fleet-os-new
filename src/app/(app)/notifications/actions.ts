'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { mapDbError } from '@/lib/action-helpers';

const uuid = z.uuid();
const resolution = z.enum(['COMPLETED', 'DISMISSED']);

function done(errorKey?: string): never {
  revalidatePath('/', 'layout');
  redirect(errorKey ? `/notifications?error=${errorKey}` : '/notifications?saved=1');
}

/** Marks one of the viewer's own deliveries as read (RLS also restricts to recipient_id = auth.uid()). */
export async function markRead(deliveryId: string, _fd?: FormData): Promise<void> {
  void _fd;
  await requireViewer();
  const id = uuid.safeParse(deliveryId);
  if (!id.success) done('generic');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notification_deliveries')
    .update({ status: 'READ', read_at: new Date().toISOString() })
    .eq('id', id.data)
    .select('id');
  if (error) done(mapDbError(error));
  if (!data || data.length === 0) done('noPermission');
  done();
}

/** Completes or dismisses a reminder. Only status and the matching timestamp are written. */
export async function resolveReminder(
  reminderId: string,
  status: 'COMPLETED' | 'DISMISSED',
  _fd?: FormData,
): Promise<void> {
  void _fd;
  await requireViewer();
  const id = uuid.safeParse(reminderId);
  const st = resolution.safeParse(status);
  if (!id.success || !st.success) done('generic');

  const now = new Date().toISOString();
  const patch =
    st.data === 'COMPLETED'
      ? { status: 'COMPLETED', completed_at: now }
      : { status: 'DISMISSED', dismissed_at: now };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('reminders')
    .update(patch)
    .eq('id', id.data)
    .in('status', ['PENDING', 'SCHEDULED'])
    .select('id');
  if (error) done(mapDbError(error));
  if (!data || data.length === 0) done('noPermission');
  done();
}
