import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse , connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { Database } from '@/types/supabase';
import { logActivity, ActivityTemplates } from '@/lib/utils/activity-logger';
import { Profile } from '@/types/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import { SessionTrackingService } from '@/lib/services/analytics/session-tracking-service';


export async function GET(request: NextRequest) {
  await connection();
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const origin = requestUrl.origin;

    // SAML SP-initiated SSO resume (Option B, 2026-04-09).
    // When the login was initiated by /api/saml/sso the login page threads
    // a samlReqId through the Google OAuth redirect_uri. If present, after
    // a successful code exchange we must bypass all role-based routing and
    // redirect straight back to /api/saml/sso?samlReqId=... which will load
    // the persisted AuthnRequest and emit the SAMLResponse to the SP ACS.
    const samlReqId = requestUrl.searchParams.get('samlReqId');

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

    // SAML resume short-circuit — see comment at top of handler.
    // Skip role-based routing and hand control back to /api/saml/sso which
    // will load the persisted AuthnRequest, build the assertion and POST
    // it to the SP ACS. We still want the Supabase session cookies set by
    // exchangeCodeForSession above to stick, which they will because this
    // redirect is same-origin.
    if (samlReqId) {
      console.log('[Auth Callback] 🔁 Resuming SAML flow with samlReqId:', samlReqId);
      const resumeUrl = new URL('/api/saml/sso', origin);
      resumeUrl.searchParams.set('samlReqId', samlReqId);
      return NextResponse.redirect(resumeUrl);
    }

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
              // Delegate the swap to migrate_pre_registered_profile_to_auth.
              // The RPC handles staff.profile_id (FK NO ACTION blocks naive delete),
              // user_roles (CASCADE-deleted on profile delete), and the
              // trg_sync_staff_to_profiles trigger that would otherwise auto-re-resolve
              // staff.profile_id back to the orphan profile during detach.
              const { error: rpcError } = await adminClient.rpc(
                'migrate_pre_registered_profile_to_auth',
                {
                  p_old_profile_id: emailProfile.id,
                  p_new_auth_id: user.id
                } as any
              );

              if (rpcError) {
                console.error('Migration RPC failed:', rpcError);
                throw rpcError;
              }

              // Re-fetch the freshly inserted profile (RPC writes with auth.users id)
              const { data: newProfile } = (await adminClient
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle()) as { data: Profile | null; error: any };

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
              const oldProfileId = emailProfile.id;

              // Step 1: Detach NO ACTION FK references before deleting old profile.
              // These tables reference profiles.id with ON DELETE NO ACTION which blocks deletion.

              // 1a. Delete bug_report_participants (participation log - safe to lose on migration)
              const { error: brrError } = await adminClient
                .from('bug_report_participants')
                .delete()
                .eq('user_id', oldProfileId);
              if (brrError) console.warn(`[Auth Migration] Could not delete bug_report_participants:`, brrError);

              // 1b. Null out event_registrations.owner_id (preserve the registration, just unlink)
              const { data: affectedRegs } = await adminClient
                .from('event_registrations')
                .select('id')
                .eq('owner_id', oldProfileId);
              if (affectedRegs && affectedRegs.length > 0) {
                await adminClient
                  .from('event_registrations')
                  .update({ owner_id: null } as any)
                  .eq('owner_id', oldProfileId);
              }

              // 1c. Null out event_team_members.profile_id (preserve membership, just unlink)
              const { data: affectedMembers } = await adminClient
                .from('event_team_members')
                .select('id')
                .eq('profile_id', oldProfileId);
              if (affectedMembers && affectedMembers.length > 0) {
                await adminClient
                  .from('event_team_members')
                  .update({ profile_id: null } as any)
                  .eq('profile_id', oldProfileId);
              }

              // Step 2: Delete the old profile (CASCADE drops user_roles, activity_logs, etc.)
              console.log(`[Auth Migration] Deleting old profile: ${oldProfileId}`);
              const { error: deleteError } = await adminClient
                .from('profiles')
                .delete()
                .eq('id', oldProfileId);

              if (deleteError) {
                console.error('[Auth Migration] Delete old profile failed:', deleteError);
                throw deleteError;
              }

              // Step 3: Create new profile with Google auth user ID (preserving all fields)
              // Note: learner_id included so trigger auto_assign_student_role fires correctly
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
                avatar_url: emailProfile.avatar_url ?? null,
                learner_id: (emailProfile as any).learner_id ?? null
              };

              console.log(`[Auth Migration] Creating new profile with auth ID: ${user.id}`);
              const { error: insertError } = await adminClient
                .from('profiles')
                .insert(legacyProfileData as any);

              if (insertError) {
                console.error('[Auth Migration] Insert new profile failed:', insertError);
                throw insertError;
              }

              // Step 4: Re-link event records to the new profile ID
              if (affectedRegs && affectedRegs.length > 0) {
                const regIds = affectedRegs.map((r: any) => r.id);
                await adminClient
                  .from('event_registrations')
                  .update({ owner_id: user.id } as any)
                  .in('id', regIds);
                console.log(`[Auth Migration] Re-linked ${regIds.length} event registration(s)`);
              }
              if (affectedMembers && affectedMembers.length > 0) {
                const memberIds = affectedMembers.map((m: any) => m.id);
                await adminClient
                  .from('event_team_members')
                  .update({ profile_id: user.id } as any)
                  .in('id', memberIds);
                console.log(`[Auth Migration] Re-linked ${memberIds.length} event team member(s)`);
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

      // INVITE-ONLY POLICY (2026-04-14, updated 2026-05-06):
      // If no profile exists, the user is not authorized. We no longer auto-create
      // 'guest' profiles. Legitimate onboarding paths are:
      //   (a) Pre-registered profile — migrated via the migrate_pre_registered_profile_to_auth
      //       RPC called above (line ~152). The auth.users INSERT trigger
      //       link_pre_registered_profile_trigger was dropped on 2026-05-06 because
      //       its naive DELETE+INSERT raised FK violations on staff.profile_id and
      //       210+ other blocking FKs to profiles(id), causing exchangeCodeForSession
      //       to roll back and the user to bounce. The RPC now uses dynamic FK
      //       detachment to handle every blocking reference.
      //   (b) Approved learner — has a row in learners_profiles with matching college_email
      //   (c) Admin-created profile — via /users/new
      // If none of these apply, we sign the user out, delete their auth.users row, and
      // redirect to /auth/access-denied.
      if (!actualProfile) {
        console.log('[Auth Callback] No profile found for user — checking approved learner path');

        // Check for an approved/active/graduated learner matching this email
        const { data: approvedLearner } = await adminClient
          .from('learners_profiles')
          .select('id, institution_id, department_id, lifecycle_status')
          .ilike('college_email', user.email ?? '')
          .in('lifecycle_status', ['approved', 'active', 'graduated'])
          .maybeSingle();

        if (!approvedLearner) {
          // UNKNOWN USER — delete the auth row and redirect to access denied.
          // No audit log kept: authorized users are created inside the app, so
          // any denied attempt is simply an unauthorized login we don't need to track.
          console.warn('[Auth Callback] Access denied — unknown user:', user.email);

          // Delete the auth.users row so the user can be re-provisioned cleanly if admin adds them
          try {
            await adminClient.auth.admin.deleteUser(user.id);
          } catch (deleteErr) {
            console.error('[Auth Callback] Failed to delete unauthorized auth user (non-blocking):', deleteErr);
          }

          // Clear the session cookie before redirect
          await supabase.auth.signOut();

          return NextResponse.redirect(
            new URL(
              `/auth/access-denied?email=${encodeURIComponent(user.email ?? '')}&reason=not_registered`,
              origin
            )
          );
        }

        // Approved learner path — create profile WITHOUT specifying role.
        // The DB default ('student') + auto_link_profile_to_approved_learner trigger
        // will populate role, learner_id, institution_id, department_id correctly.
        console.log('[Auth Callback] Approved learner found — creating student profile');
        const newProfile = {
          id: user.id,
          email: user.email,
          profile_completed: false,
          is_active: true
        };

        const { error: insertError } = await adminClient
          .from('profiles')
          .insert([newProfile]);

        if (insertError) {
          console.error('[Auth Callback] Profile creation for approved learner failed:', insertError);
          // Fail-safe: treat as unauthorized
          try {
            await adminClient.auth.admin.deleteUser(user.id);
          } catch (_) {}
          await supabase.auth.signOut();
          return NextResponse.redirect(new URL('/auth/access-denied?reason=profile_creation_failed', origin));
        }

        // Log login activity for new (legitimate) user
        await logLoginActivity({ ...newProfile, role: 'student' });

        // Create session tracking record
        try {
          const sessionInfo = await SessionTrackingService.createSession({
            userId: user.id,
            role: 'student',
            request
          });

          if (sessionInfo) {
            cookieStore.set('analytics_session_id', sessionInfo.sessionId, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 60 * 60 * 24
            });
          }
        } catch (sessionError) {
          console.error('[Auth Callback] Session tracking failed for new learner (non-blocking):', sessionError);
        }

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

      // Create session tracking record for engagement analytics
      console.log('[Auth Callback] 🎯 Attempting to create analytics session...');
      console.log('[Auth Callback] 👤 User ID:', user.id);
      console.log('[Auth Callback] 🎭 User role:', actualProfile.role);
      console.log('[Auth Callback] 🏢 Institution ID:', actualProfile.institution_id);

      try {
        const sessionInfo = await SessionTrackingService.createSession({
          userId: user.id,
          role: actualProfile.role || 'unknown',
          institutionId: actualProfile.institution_id || undefined,
          request
        });

        console.log('[Auth Callback] 📊 Session creation result:', sessionInfo);

        // Store session ID in cookie if session was created successfully
        if (sessionInfo) {
          cookieStore.set('analytics_session_id', sessionInfo.sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 // 24 hours
          });
          console.log('[Auth Callback] ✅ Analytics session created:', sessionInfo.sessionId);
          console.log('[Auth Callback] 🍪 Cookie set: analytics_session_id');
        } else {
          console.warn('[Auth Callback] ⚠️ Session creation returned null - check SessionTrackingService logs above');
        }
      } catch (sessionError) {
        // Don't block login if session tracking fails
        console.error('[Auth Callback] ❌ Session tracking failed (non-blocking):', sessionError);
        if (sessionError instanceof Error) {
          console.error('[Auth Callback] ❌ Error stack:', sessionError.stack);
        }
      }

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
