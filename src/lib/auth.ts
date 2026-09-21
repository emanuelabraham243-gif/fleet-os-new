import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Role = 'admin' | 'staff';

export type Profile = {
  id: string;
  organization_id: string;
  role: Role;
  language: 'am' | 'en';
  full_name: string;
  org_name: string;
  is_demo: boolean;
};

export type Viewer = {
  user: { id: string; email: string | null };
  profile: Profile | null;
};

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const user = { id: data.user.id, email: data.user.email ?? null };

  const { data: row } = await supabase
    .from('profiles')
    .select('id, organization_id, role, language, full_name, organizations(name, is_demo)')
    .eq('id', user.id)
    .maybeSingle();

  if (!row) return { user, profile: null };

  const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
  return {
    user,
    profile: {
      id: row.id as string,
      organization_id: row.organization_id as string,
      role: row.role === 'admin' ? 'admin' : 'staff',
      language: row.language === 'en' ? 'en' : 'am',
      full_name: (row.full_name as string) ?? '',
      org_name: (org?.name as string | undefined) ?? '',
      is_demo: Boolean(org?.is_demo),
    },
  };
});

export async function requireViewer(): Promise<{
  user: { id: string; email: string | null };
  profile: Profile;
}> {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  if (!viewer.profile) redirect('/login?error=no_profile');
  return { user: viewer.user, profile: viewer.profile };
}

export function isAdmin(profile: { role: string } | null | undefined): boolean {
  return profile?.role === 'admin';
}
