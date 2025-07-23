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
    const origin = requestUrl.origin;

    // Early return if no code
    if (!code) {
      return NextResponse.redirect(
        new URL(`/auth/login?error=no_code`, origin)
      );
    }

    const cookieStore = await cookies();
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
        return NextResponse.redirect(new URL('/auth/complete-profile', origin));
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
