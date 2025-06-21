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
      console.error('No code in callback');
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
      console.error('Exchange error:', exchangeError);
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
      console.error('User error:', userError);
      return NextResponse.redirect(
        new URL(`/auth/login?error=session`, origin)
      );
    }

    try {
      // Get or create profile
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('profile_completed, full_name, role, institution_id')
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
          console.error('Failed to log login activity:', error);
          // Don't throw - login should continue even if activity logging fails
        }
      };

      // If no profile exists, create one
      if (!existingProfile) {
        const newProfile = {
          id: user.id,
          email: user.email,
          role: 'student',
          profile_completed: false
        };

        const { error: insertError } = await supabase
          .from('profiles')
          .insert([newProfile]);
        if (insertError) throw insertError;

        // Log login activity for new user
        await logLoginActivity(newProfile);

        return NextResponse.redirect(new URL('/auth/complete-profile', origin));
      }

      // Log login activity for existing user
      await logLoginActivity(existingProfile);

      // If profile exists but not completed
      if (!existingProfile.profile_completed) {
        return NextResponse.redirect(new URL('/auth/complete-profile', origin));
      }

      // If profile exists and is completed, redirect to home
      return NextResponse.redirect(new URL('/', origin));
    } catch (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.redirect(new URL('/auth/complete-profile', origin));
    }
  } catch (error) {
    console.error('General error:', error);
    return NextResponse.redirect(new URL(`/auth/login?error=general`, origin));
  }
}
