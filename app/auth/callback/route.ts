import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  // Early return if no code
  if (!code) {
    console.error('No code in callback');
    return NextResponse.redirect(new URL(`/auth/login?error=no_code`, origin));
  }

  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Exchange code for session
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
      code
    );

    if (exchangeError) {
      console.error('Exchange error:', exchangeError);
      return NextResponse.redirect(
        new URL(`/auth/login?error=exchange`, origin)
      );
    }

    // Get session
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.error('Session error:', sessionError);
      return NextResponse.redirect(
        new URL(`/auth/login?error=session`, origin)
      );
    }

    try {
      // Try to get profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('profile_completed')
        .eq('id', session.user.id)
        .single();

      // If no profile, the trigger should have created one
      if (!profile || !profile.profile_completed) {
        return NextResponse.redirect(new URL('/auth/complete-profile', origin));
      }

      // All good - redirect to home
      return NextResponse.redirect(new URL('/', origin));
    } catch (dbError) {
      console.error('Database error:', dbError);
      // If database error, still allow login but redirect to complete profile
      return NextResponse.redirect(new URL('/auth/complete-profile', origin));
    }
  } catch (error) {
    console.error('General error:', error);
    return NextResponse.redirect(new URL(`/auth/login?error=general`, origin));
  }
}
