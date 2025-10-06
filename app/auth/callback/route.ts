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
      // First check if a profile exists with this Google user ID
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('profile_completed, full_name, role, institution_id, is_active')
        .eq('id', user.id)
        .single();

      // If no profile with this ID, check if one exists with this email (for pre-registered or migrating users)
      let migratedProfile = null;
      if (!existingProfile && user.email) {
        const { data: emailProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', user.email)
          .single();

        if (emailProfile) {
          // Check if this is a pre-registered profile
          if (emailProfile.is_pre_registered) {
            console.log(
              `Found pre-registered profile for ${user.email}, linking to Google auth`
            );

            // Update the pre-registered profile with the Google auth user ID
            const { error: updateError } = await supabase
              .from('profiles')
              .update({
                id: user.id,
                is_pre_registered: false,
                profile_completed: true,
                updated_at: new Date().toISOString()
              })
              .eq('id', emailProfile.id);

            if (!updateError) {
              // Delete the old placeholder profile
              await supabase
                .from('profiles')
                .delete()
                .eq('id', emailProfile.id);

              // Create the profile with correct Google auth ID
              const { error: insertError } = await supabase
                .from('profiles')
                .insert({
                  id: user.id,
                  email: emailProfile.email,
                  full_name: emailProfile.full_name,
                  role: emailProfile.role,
                  phone_number: emailProfile.phone_number,
                  institution_id: emailProfile.institution_id,
                  profile_completed: true,
                  is_active: emailProfile.is_active,
                  is_pre_registered: false,
                  created_at: emailProfile.created_at,
                  updated_at: new Date().toISOString()
                });

              if (!insertError) {
                migratedProfile = {
                  ...emailProfile,
                  id: user.id,
                  is_pre_registered: false
                };

                console.log(
                  `Successfully linked pre-registered profile for ${user.email} to Google auth`
                );
              } else {
                console.error(
                  `Failed to create Google-linked profile for ${user.email}:`,
                  insertError
                );
              }
            } else {
              console.error(
                `Failed to update pre-registered profile for ${user.email}:`,
                updateError
              );
            }
          } else {
            // This is a legacy profile that needs migration
            console.log(
              `Found existing profile by email for ${user.email}, migrating to Google auth`
            );

            // Create a new profile with the Google auth user ID, copying data from the old profile
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                id: user.id,
                email: emailProfile.email,
                full_name: emailProfile.full_name,
                role: emailProfile.role,
                phone_number: emailProfile.phone_number,
                institution_id: emailProfile.institution_id,
                profile_completed: emailProfile.profile_completed,
                is_active: emailProfile.is_active,
                is_pre_registered: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });

            if (!insertError) {
              // Instead of deleting, mark the old profile as inactive
              // This prevents foreign key constraint issues
              const { error: updateOldProfileError } = await supabase
                .from('profiles')
                .update({ 
                  is_active: false,
                  updated_at: new Date().toISOString()
                })
                .eq('id', emailProfile.id);

              if (updateOldProfileError) {
                console.error(
                  `Failed to deactivate old profile:`,
                  updateOldProfileError
                );
              }

              migratedProfile = {
                ...emailProfile,
                id: user.id
              };

              console.log(
                `Successfully migrated profile for ${user.email} to Google auth`
              );
            } else {
              console.error(
                `Failed to migrate profile for ${user.email}:`,
                insertError
              );
            }
          }
        }
      }

      const actualProfile = existingProfile || migratedProfile;

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
              first_login: !actualProfile
            },
            institutionId: profile?.institution_id,
            statusCode: 200
          });
        } catch (error) {
          // Don't throw - login should continue even if activity logging fails
        }
      };

      // If no profile exists, create one
      if (!actualProfile) {
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
      if (actualProfile.is_active === false) {
        // Sign out the user immediately
        await supabase.auth.signOut();

        // Redirect to unauthorized page with specific message
        return NextResponse.redirect(
          new URL('/unauthorized?reason=inactive', origin)
        );
      }

      // Log login activity for existing user
      await logLoginActivity(actualProfile);

      // If profile exists but not completed
      if (!actualProfile.profile_completed) {
        return NextResponse.redirect(new URL('/auth/complete-profile', origin));
      }

      // If profile exists and is completed, redirect based on role
      let destination = '/';
      if (actualProfile.role === 'guest') {
        destination = '/guest';
      } else if (actualProfile.role === 'student') {
        destination = '/auth/login?reason=student_redirect';
      } else if (actualProfile.role === 'driver') {
        destination = '/driver';
      }

      return NextResponse.redirect(new URL(destination, origin));
    } catch (dbError) {
      return NextResponse.redirect(new URL('/auth/complete-profile', origin));
    }
  } catch (error) {
    return NextResponse.redirect(new URL(`/auth/login?error=general`, origin));
  }
}
