import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Database } from '@/types/supabase';
import { logActivity, ActivityTemplates } from '@/lib/utils/activity-logger';
import { Profile } from '@/types/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';


export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const origin = requestUrl.origin;

    console.log('[Auth Callback] 🔐 Auth callback initiated');
    console.log('[Auth Callback] Request URL:', requestUrl.toString());
    console.log('[Auth Callback] Origin:', origin);
    console.log('[Auth Callback] Has code:', !!code);

    // Early return if no code
    if (!code) {
      console.log('[Auth Callback] ❌ No auth code provided, redirecting to login');
      return NextResponse.redirect(
        new URL(`/auth/login?error=no_code`, origin)
      );
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
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
    console.log('[Auth Callback] Exchanging code for session...');
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
      code
    );
    if (exchangeError) {
      console.log('[Auth Callback] ❌ Code exchange failed:', exchangeError);
      return NextResponse.redirect(
        new URL(`/auth/login?error=exchange`, origin)
      );
    }
    console.log('[Auth Callback] ✅ Code exchange successful');

    // Get user
    console.log('[Auth Callback] Getting user session...');
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) {
      console.log('[Auth Callback] ❌ Failed to get user:', userError);
      return NextResponse.redirect(
        new URL(`/auth/login?error=session`, origin)
      );
    }
    console.log('[Auth Callback] ✅ User authenticated:', user.id, user.email);

    try {
      // Use service role client to bypass RLS for profile check
      // Fixed: 2025-12-27 - Prevents duplicate profile creation due to RLS blocking SELECT
      const adminClient = createServiceRoleClient();

      // First check if a profile exists with this Google user ID
      const { data: existingProfile, error: profileCheckError } = (await adminClient
        .from('profiles')
        .select('profile_completed, full_name, role, institution_id, is_active')
        .eq('id', user.id)
        .maybeSingle()) as {
        data: {
          profile_completed: boolean | null;
          full_name: string | null;
          role: string | null;
          institution_id: string | null;
          is_active: boolean | null;
        } | null;
        error: any;
      };

      // Log for debugging
      if (profileCheckError) {
        console.error('[Auth Callback] Profile check error:', profileCheckError);
      }
      console.log('[Auth Callback] Profile found:', !!existingProfile, 'for user:', user.email);

      // If no profile with this ID, check if one exists with this email (for pre-registered or migrating users)
      let migratedProfile: Profile | null = null;
      if (!existingProfile && user.email) {
        // adminClient already created above

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

            try {
              // Step 1: Save user_roles for migration (if they exist)
              const { data: userRoles } = await adminClient
                .from('user_roles')
                .select('*')
                .eq('user_id', emailProfile.id);

              console.log(`Found ${userRoles?.length || 0} user role(s) to migrate`);

              // Step 2: Delete the old profile to avoid unique constraint violation
              // This will cascade delete user_roles due to foreign key constraint
              console.log(`Deleting old profile with ID: ${emailProfile.id}`);
              const { error: deleteError } = await adminClient
                .from('profiles')
                .delete()
                .eq('id', emailProfile.id);

              if (deleteError) {
                console.error('Delete old profile failed:', deleteError);
                throw deleteError;
              }

              // Step 3: Create new profile with Google auth user ID (preserving all fields)
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

              console.log(`Creating new profile with Google auth ID: ${user.id}`);
              const { error: insertError } = await adminClient
                .from('profiles')
                .insert(legacyProfileData as any);

              if (insertError) {
                console.error('Insert new profile failed:', insertError);
                throw insertError;
              }

              // Step 4: Recreate user_roles for new profile (if they existed)
              if (userRoles && userRoles.length > 0) {
                console.log(`Recreating ${userRoles.length} user role(s) for new profile`);

                const newUserRoles = userRoles.map((role: any) => ({
                  user_id: user.id, // New Google auth user ID
                  role_id: role.role_id,
                  is_primary: role.is_primary,
                  assigned_by: role.assigned_by,
                  assigned_at: role.assigned_at
                }));

                const { error: rolesInsertError } = await adminClient
                  .from('user_roles')
                  .insert(newUserRoles);

                if (rolesInsertError) {
                  console.error('Failed to recreate user_roles:', rolesInsertError);
                  // Don't fail the whole migration if roles fail
                }
              }

              migratedProfile = {
                ...emailProfile,
                id: user.id,
                is_pre_registered: false
              };

              console.log(
                `✓ Successfully migrated profile for ${user.email} to Google auth`
              );
            } catch (migrationError) {
              console.error(
                `❌ Profile migration failed for ${user.email}:`,
                migrationError
              );
              // Migration failed - user needs to complete profile manually
              migratedProfile = null;
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

      // If no profile exists, create one using admin client to bypass RLS
      // Fixed: 2025-12-27 - Use service role client to prevent RLS policy violations
      if (!actualProfile) {
        const newProfile = {
          id: user.id,
          email: user.email,
          role: 'guest',
          profile_completed: false,
          is_active: true
        };

        const { error: insertError } = await adminClient
          .from('profiles')
          .insert([newProfile]);
        if (insertError) {
          console.error('[Auth Callback] Profile creation failed:', insertError);
          throw insertError;
        }

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
      console.log('[Auth Callback] Profile role:', actualProfile.role, 'user:', user.id, 'email:', user.email);

      if (actualProfile.role === 'guest') {
        destination = '/guest';
        console.log('[Auth Callback] Guest role detected, redirecting to:', destination);
      } else if (actualProfile.role === 'student') {
        console.log('[Auth Callback] Student role detected');
        console.log('[Auth Callback] Student portal feature flag:', FEATURE_FLAGS.ENABLE_STUDENT_PORTAL);

        // Check student portal feature flag
        if (!FEATURE_FLAGS.ENABLE_STUDENT_PORTAL) {
          // Feature disabled - block students (original behavior)
          destination = '/auth/login?reason=student_redirect';
          console.log('[Auth Callback] Student portal disabled, blocking access');
        } else {
          console.log('[Auth Callback] Student portal enabled, validating access...');

          // Feature enabled - validate student lifecycle status
          const validation = await StudentValidationService.validateStudentAccess(user.id);

          console.log('[Auth Callback] Validation result:', {
            allowed: validation.allowed,
            reason: validation.reason,
            status: validation.status,
            isGraduated: validation.isGraduated
          });

          if (!validation.allowed) {
            // Student blocked due to lifecycle status - sign out and show error
            console.log('[Auth Callback] Student blocked, reason:', validation.reason);
            await supabase.auth.signOut();
            destination = `/auth/login?reason=${validation.reason}`;
            console.log('[Auth Callback] Signed out student, redirecting to:', destination);
          } else {
            // Student allowed - redirect to dashboard
            destination = '/';
            console.log('[Auth Callback] ✅ Student access GRANTED');
            console.log('[Auth Callback] Student status:', validation.status);
            console.log('[Auth Callback] Redirecting to dashboard:', destination);
          }
        }
      } else if (actualProfile.role === 'driver') {
        destination = '/driver';
        console.log('[Auth Callback] Driver role detected, redirecting to:', destination);
      } else {
        console.log('[Auth Callback] Other role detected:', actualProfile.role, 'redirecting to:', destination);
      }

      console.log('[Auth Callback] 🎯 Final redirect destination:', destination);
      console.log('[Auth Callback] Full redirect URL:', new URL(destination, origin).toString());
      return NextResponse.redirect(new URL(destination, origin));
    } catch (dbError) {
      return NextResponse.redirect(new URL('/auth/complete-profile', origin));
    }
  } catch (error) {
    return NextResponse.redirect(new URL(`/auth/login?error=general`, origin));
  }
}
