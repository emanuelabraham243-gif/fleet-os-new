import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LANG_COOKIE, isLocale } from '@/lib/i18n-core';
import { safeReturnTo } from '@/lib/action-helpers';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const dest = safeReturnTo(searchParams.get('next'), '/');

  if (!code) return NextResponse.redirect(`${origin}/login?error=callback`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=callback`);

  const response = NextResponse.redirect(`${origin}${dest}`);
  const { data: profile } = await supabase
    .from('profiles')
    .select('language')
    .eq('id', data.user.id)
    .maybeSingle();
  if (isLocale(profile?.language)) {
    response.cookies.set(LANG_COOKIE, profile.language, {
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }
  return response;
}
