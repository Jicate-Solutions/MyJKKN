import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Database } from '@/types/supabase';
import { logActivity, ActivityTemplates } from '@/lib/utils/activity-logger';
import { Profile } from '@/types/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

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
      let migratedProfile: Profile | null = null;
      if (!existingProfile && user.email) {
        // Use service role client to bypass RLS for profile migration
        const adminClient = createServiceRoleClient();

        const { data: emailProfile } = (await adminClient
          .from('profiles')
          .select('*')
          .eq('email', user.email)
          .maybeSingle()) as { data: Profile | null; error: any };

        if (emailProfile) {
          // Check if this is a pre-registered profile
          if (emailProfile.is_pre_registered) {
            console.log(
              `Found pre-registered profile for ${user.email}, linking to Google auth`
            );

            try {
              // First, delete the old pre-registered profile
              const { error: deleteError } = await adminClient
                .from('profiles')
                .delete()
                .eq('id', emailProfile.id);

              if (deleteError) {
                console.error('Delete failed:', deleteError);
                throw deleteError;
              }

              // Then create new profile with Google auth user ID (preserving all fields)
              const profileInsertData = {
                id: user.id,
                email: emailProfile.email ?? null,
                full_name: emailProfile.full_name ?? null,
                role: emailProfile.role,
                phone_number: emailProfile.phone_number ?? null,
                institution_id: emailProfile.institution_id ?? null,
                department_id: emailProfile.department_id ?? null,
                gender: emailProfile.gender ?? null,
                designation: emailProfile.designation ?? null,
                profile_completed: true,
                is_active: emailProfile.is_active ?? true,
                is_pre_registered: false,
                bio: emailProfile.bio ?? null,
                avatar_url: emailProfile.avatar_url ?? null
              };

              const { data: newProfile, error: insertError } =
                (await adminClient
                  .from('profiles')
                  .insert(profileInsertData as any)
                  .select()
                  .single()) as { data: Profile | null; error: any };

              if (insertError) {
                console.error('Insert failed:', insertError);
                throw insertError;
              }

              migratedProfile = newProfile;

              console.log(
                `✓ Successfully migrated pre-registered profile for ${user.email} to Google auth`
              );
            } catch (migrationError) {
              console.error(
                `❌ Profile migration failed for ${user.email}:`,
                migrationError
              );
              // Migration failed - user needs to complete profile manually
              migratedProfile = null;
            }
          } else {
            // This is a legacy profile that needs migration
            console.log(
              `Found existing profile by email for ${user.email}, migrating to Google auth`
            );

            // Create a new profile with the Google auth user ID using admin client (preserving all fields)
            const legacyProfileData = {
              id: user.id,
              email: emailProfile.email ?? null,
              full_name: emailProfile.full_name ?? null,
              role: emailProfile.role,
              phone_number: emailProfile.phone_number ?? null,
              institution_id: emailProfile.institution_id ?? null,
              department_id: emailProfile.department_id ?? null,
              gender: emailProfile.gender ?? null,
              designation: emailProfile.designation ?? null,
              profile_completed: emailProfile.profile_completed ?? false,
              is_active: emailProfile.is_active ?? true,
              is_pre_registered: false,
              bio: emailProfile.bio ?? null,
              avatar_url: emailProfile.avatar_url ?? null
            };

            const { error: insertError } = (await adminClient
              .from('profiles')
              .insert(legacyProfileData as any)) as { error: any };

            if (!insertError) {
              // Mark the old profile as inactive using admin client
              const { error: updateOldProfileError } = (await (
                adminClient as any
              )
                .from('profiles')
                .update({ is_active: false })
                .eq('id', emailProfile.id)) as { error: any };

              if (updateOldProfileError) {
                console.error(
                  `Failed to deactivate old profile:`,
                  updateOldProfileError
                );
              }

              migratedProfile = {
                ...emailProfile,
                id: user.id,
                is_pre_registered: false
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
      const logLoginActivity = async (profile: Partial<Profile> | null) => {
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
            institutionId: profile?.institution_id || undefined,
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
