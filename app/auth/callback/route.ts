import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Database } from '@/types/supabase';
import { logActivity, ActivityTemplates } from '@/lib/utils/activity-logger';
import { ACTIVITY_TYPES, RESOURCE_TYPES } from '@/types/activity';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const origin = requestUrl.origin;

    // Early return if no code
    if (!code) {
      return NextResponse.redirect(
        new URL(`/auth/login?error=no_code`, origin)
      );
    }

    const cookieStore = await cookies();
    
    // First try to get child app auth from state parameter (more reliable)
    let childAppAuth: any = null;
    
    if (state) {
      try {
        const stateData = JSON.parse(atob(state));
        if (stateData.childAppAuth) {
          childAppAuth = stateData.childAppAuth;
          console.log('[Auth Callback] Child app auth from state:', childAppAuth);
        }
      } catch (e) {
        console.log('[Auth Callback] State is not our encoded data, might be from OAuth provider');
      }
    }
    
    // Fallback to cookie if state doesn't have our data
    if (!childAppAuth) {
      const childAppAuthCookie = cookieStore.get('child_app_auth');
      
      // Log for debugging
      console.log('[Auth Callback] Cookie found:', !!childAppAuthCookie);
      console.log('[Auth Callback] Cookie value:', childAppAuthCookie?.value);
      
      if (childAppAuthCookie) {
        try {
          childAppAuth = JSON.parse(childAppAuthCookie.value);
          console.log('[Auth Callback] Parsed child app auth from cookie:', childAppAuth);
        } catch (e) {
          console.error('[Auth Callback] Failed to parse cookie:', e);
        }
      }
    }
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Exchange code for session
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
      code
    );
    if (exchangeError) {
      return NextResponse.redirect(
        new URL(`/auth/login?error=exchange`, origin)
      );
    }

    // Get user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.redirect(
        new URL(`/auth/login?error=session`, origin)
      );
    }

    try {
      // Get or create profile
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('profile_completed, full_name, role, institution_id, is_active')
        .eq('id', user.id)
        .single();

      // Helper function to log login activity
      const logLoginActivity = async (profile: any) => {
        try {
          const userName = profile?.full_name || user.email || 'Unknown';
          const template = ActivityTemplates.userLogin(userName);

          await logActivity({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            description: template.description,
            request,
            metadata: {
              login_method: 'google_oauth',
              user_email: user.email,
              user_role: profile?.role || 'unknown',
              profile_completed: profile?.profile_completed || false,
              first_login: !existingProfile
            },
            institutionId: profile?.institution_id,
            statusCode: 200
          });
        } catch (error) {
          // Don't throw - login should continue even if activity logging fails
        }
      };

      // If no profile exists, create one
      if (!existingProfile) {
        const newProfile = {
          id: user.id,
          email: user.email,
          role: 'guest',
          profile_completed: false,
          is_active: true
        };

        const { error: insertError } = await supabase
          .from('profiles')
          .insert([newProfile]);
        if (insertError) throw insertError;

        // Log login activity for new user
        await logLoginActivity(newProfile);

        return NextResponse.redirect(new URL('/auth/complete-profile', origin));
      }

      // Check if user account is active
      if (existingProfile.is_active === false) {
        // Sign out the user immediately
        await supabase.auth.signOut();

        // Redirect to unauthorized page with specific message
        return NextResponse.redirect(
          new URL('/unauthorized?reason=inactive', origin)
        );
      }

      // Log login activity for existing user
      await logLoginActivity(existingProfile);

      // If profile exists but not completed
      if (!existingProfile.profile_completed) {
        // Clear child app auth cookie if present
        if (childAppAuth) {
          cookieStore.delete('child_app_auth');
        }
        return NextResponse.redirect(new URL('/auth/complete-profile', origin));
      }

      // If this is a child app authentication request
      if (childAppAuth && childAppAuth.app_id && childAppAuth.redirect_uri) {
        // Clear the cookie
        cookieStore.delete('child_app_auth');
        
        // Redirect to the child app login consent page
        const consentUrl = new URL('/auth/child-app/login', origin);
        consentUrl.searchParams.append('app_id', childAppAuth.app_id);
        consentUrl.searchParams.append('redirect_uri', childAppAuth.redirect_uri);
        if (childAppAuth.scope) consentUrl.searchParams.append('scope', childAppAuth.scope);
        if (childAppAuth.state) consentUrl.searchParams.append('state', childAppAuth.state);
        
        return NextResponse.redirect(consentUrl);
      }

      // If profile exists and is completed, redirect based on role
      let destination = '/';
      if (existingProfile.role === 'guest') {
        destination = '/guest';
      } else if (existingProfile.role === 'student') {
        destination = '/learner';
      }

      return NextResponse.redirect(new URL(destination, origin));
    } catch (dbError) {
      return NextResponse.redirect(new URL('/auth/complete-profile', origin));
    }
  } catch (error) {
    return NextResponse.redirect(new URL(`/auth/login?error=general`, origin));
  }
}
