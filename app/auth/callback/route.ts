// app/auth/callback/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const supabase = createRouteHandlerClient({ cookies });
    const origin = requestUrl.origin; // This will be the current origin (localhost or production)

    if (!code) {
      throw new Error('No code provided');
    }

    await supabase.auth.exchangeCodeForSession(code);

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', origin));
    }

    // Get or create profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('profile_completed')
      .eq('id', session.user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Profile error:', profileError);
      throw profileError;
    }

    // If no profile exists or not completed, redirect to complete profile
    if (!profile?.profile_completed) {
      return NextResponse.redirect(new URL('/auth/complete-profile', origin));
    }

    // Redirect to homepage of current origin
    return NextResponse.redirect(new URL('/', origin));
  } catch (error) {
    console.error('Error processing auth callback:', error);
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(new URL('/auth/login?error=callback', origin));
  }
}
