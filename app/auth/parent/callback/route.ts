import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * OAuth callback handler for parent authentication
 * Handles the callback from Supabase Auth after OTP verification
 * Sets session and redirects to dashboard
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');

  // Handle error from OAuth provider
  if (error) {
    console.error('[parent-auth] OAuth error:', { error, error_description });
    return NextResponse.redirect(
      new URL(`/auth/parent/login?error=${encodeURIComponent(error_description || error)}`, requestUrl.origin)
    );
  }

  // Code is required for session exchange
  if (!code) {
    console.error('[parent-auth] Missing authorization code');
    return NextResponse.redirect(
      new URL('/auth/parent/login?error=Missing authorization code', requestUrl.origin)
    );
  }

  try {
    const supabase = await createServerSupabaseClient();

    // Exchange code for session
    const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError || !sessionData.session) {
      console.error('[parent-auth] Session exchange failed:', sessionError);
      throw sessionError || new Error('Failed to create session');
    }

    // Get user ID
    const userId = sessionData.session.user.id;

    // Check if parent profile exists
    const { data: parentProfile, error: profileError } = await supabase
      .from('parent_profiles')
      .select('id, institution_id')
      .eq('user_id', userId)
      .single();

    if (profileError) {
      console.error('[parent-auth] Failed to fetch parent profile:', profileError);

      // If profile doesn't exist, redirect to registration completion
      if (profileError.code === 'PGRST116') {
        return NextResponse.redirect(
          new URL('/auth/parent/register?step=complete', requestUrl.origin)
        );
      }

      throw profileError;
    }

    // Log successful login
    await supabase
      .from('parent_activity_log')
      .insert({
        parent_id: parentProfile.id,
        activity_type: 'login',
        description: 'Logged in successfully',
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent'),
      });

    // Redirect to dashboard
    return NextResponse.redirect(new URL('/parent-portal/dashboard', requestUrl.origin));

  } catch (error: any) {
    console.error('[parent-auth] Callback error:', error);
    return NextResponse.redirect(
      new URL(
        `/auth/parent/login?error=${encodeURIComponent(error.message || 'Authentication failed')}`,
        requestUrl.origin
      )
    );
  }
}
