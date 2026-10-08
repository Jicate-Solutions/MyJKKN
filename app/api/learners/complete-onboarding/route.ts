export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logActivity, ActivityTemplates } from '@/lib/utils/activity-logger';
import { generateTemporaryPassword } from '@/lib/utils/temporary-password';
import { INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES } from '@/lib/constants/induction-access';
import { findDuplicateLearners, describeDuplicateLearner } from '@/lib/services/learner-duplicate-guard';

// Statuses eligible for a login here, not just 'active'. The induction-access
// spec (specs/pre-onboarding-induction-access-2026-06-29.md) already grants
// admitted/reserved/enquiry_submitted/enquiry/account learners restricted
// module access (My Induction, Service Requests, AI Pulse) and expects them
// to be able to log in for it — auto_link_profile_to_approved_learner links a
// profile for the same list on self-service OAuth sign-in. This route is the
// OTHER path (staff-triggered, temp password) and must grant the same
// eligibility, or a reserved/admitted learner who hasn't happened to sign in
// with OAuth yet has no way to get a login at all.
const ONBOARDING_ELIGIBLE_LIFECYCLE_STATUSES = [
  'active',
  ...INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES,
] as const;

// ============================================
// LEARNER ONBOARDING API
// ============================================
// Created: 2025-01-20
// Updated: 2025-01-21 - Added gender and avatar_url to profile creation
// Purpose: Auto-create user accounts for active learners
// Adapted from: app/api/students/complete-onboarding/route.ts
// ============================================

// Create admin client for user management
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Generate a random temporary password
 * Requirements: 12 chars, at least 1 digit, at least 1 uppercase
 */
// Who may create a learner's login: byte-for-byte the predicate in
// learners_profiles_update_policy, the same one fn_activate_learner_from_onboarding
// re-applies (20260810070549). Both callers of this route (activateIfReady and
// updateLearnerProfile in learner-profile-service) only reach it after that bar
// has already been met, so no legitimate caller loses access. This route uses
// the service role and bypasses RLS, so the bar is re-applied here by hand.
const LEARNER_EDIT_PERMISSIONS = [
  'learners.admissions.edit',
  'learners.profiles.edit',
  'learners.edit',
] as const;

function forbidden(error: string) {
  return NextResponse.json({ success: false, error }, { status: 403 });
}

function checkFailed() {
  return NextResponse.json(
    { success: false, error: 'Could not check your access. Please try again.' },
    { status: 500 }
  );
}

export async function POST(request: NextRequest) {
  await connection();

  try {
    // 0. Signed-in caller with learner-edit authority. A learner never reaches
    // this route for their own record: before sign-in they have no session,
    // and after it they already have a profile (409 below).
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // A failed check is a 500, never a 403: "the check could not run" must not
    // be reported as "you are not allowed".
    const [superRes, adminRes] = await Promise.all([
      supabase.rpc('is_super_admin'),
      supabase.rpc('is_admin'),
    ]);
    if (superRes.error || adminRes.error) {
      console.error('[learners/complete-onboarding] Admin check failed:', superRes.error || adminRes.error);
      return checkFailed();
    }
    const isAdminGrade = superRes.data === true || adminRes.data === true;

    if (!isAdminGrade) {
      const permResults = await Promise.all(
        LEARNER_EDIT_PERMISSIONS.map((permission_name) =>
          supabase.rpc('user_has_permission', { permission_name })
        )
      );
      const permError = permResults.find((r) => r.error)?.error;
      if (permError) {
        console.error('[learners/complete-onboarding] Permission check failed:', permError);
        return checkFailed();
      }
      if (!permResults.some((r) => r.data === true)) {
        return forbidden('You do not have permission to create learner logins');
      }
    }

    let learner_id: unknown;
    try {
      ({ learner_id } = await request.json());
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!learner_id || typeof learner_id !== 'string') {
      return NextResponse.json({ error: 'Learner ID is required' }, { status: 400 });
    }

    // 1. Fetch learner profile
    const { data: learner, error: learnerError } = await supabaseAdmin
      .from('learners_profiles')
      .select(
        'id, first_name, last_name, college_email, student_mobile, gender, student_photo_url, institution_id, department_id, admission_year_id, is_profile_complete, lifecycle_status'
      )
      .eq('id', learner_id)
      .single();

    if (learnerError || !learner) {
      return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
    }

    // Institution scope for everyone below admin grade.
    if (!isAdminGrade) {
      const { data: hasInstAccess, error: scopeError } = await supabase.rpc(
        'role_has_institution_access',
        { check_institution_id: learner.institution_id }
      );
      if (scopeError) {
        console.error('[learners/complete-onboarding] Institution check failed:', scopeError);
        return checkFailed();
      }
      if (hasInstAccess !== true) {
        return forbidden("You do not have access to this learner's institution");
      }
    }

    // 2. Validate profile is complete and active
    if (!learner.is_profile_complete) {
      return NextResponse.json(
        { error: 'Learner profile is not complete. Cannot create user.' },
        { status: 400 }
      );
    }

    if (!(ONBOARDING_ELIGIBLE_LIFECYCLE_STATUSES as readonly string[]).includes(learner.lifecycle_status)) {
      return NextResponse.json(
        { error: `Learner status '${learner.lifecycle_status}' is not eligible for a login account` },
        { status: 400 }
      );
    }

    if (!learner.college_email) {
      return NextResponse.json(
        { error: 'Learner does not have a college email' },
        { status: 400 }
      );
    }

    // 3. Check for existing profile
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', learner.college_email)
      .maybeSingle();

    if (existingProfile) {
      console.warn(
        `[learners/complete-onboarding] Profile for ${learner.college_email} already exists`
      );
      return NextResponse.json(
        { error: 'A user with this email already has a profile.' },
        { status: 409 }
      );
    }

    // 3b. Same person as another live learner? A login minted now forks the identity
    // (the …26pb@ / …26bp@ incident). A failed check lands in the catch → 500, so no
    // login is created blind.
    const duplicates = await findDuplicateLearners(supabaseAdmin, learner, learner.id);
    if (duplicates.length > 0) {
      return NextResponse.json(
        {
          error:
            `Possible duplicate learner: ${duplicates.map(describeDuplicateLearner).join('; ')}. ` +
            'Resolve the duplicate before creating a login.',
        },
        { status: 409 }
      );
    }

    // 4. Create auth user
    const tempPassword = generateTemporaryPassword();
    let authUserResponse = await supabaseAdmin.auth.admin.createUser({
      email: learner.college_email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: `${learner.first_name} ${learner.last_name || ''}`.trim(),
        role: 'student',
      },
    });

    // Handle existing auth user
    if (authUserResponse.error?.message.includes('already exists')) {
      console.warn(
        `[learners/complete-onboarding] Auth user for ${learner.college_email} already exists. Attempting to retrieve existing user.`
      );

      // Fetch users and find matching email
      const { data: { users }, error: listError } = (await supabaseAdmin.auth.admin.listUsers()) as { data: { users: any[] }; error: any };

      if (listError) {
        return NextResponse.json(
          { error: 'Failed to retrieve user list.' },
          { status: 500 }
        );
      }

      const existingUser = users.find((u: any) => u.email === learner.college_email);

      if (!existingUser) {
        return NextResponse.json(
          { error: 'User exists but could not be found.' },
          { status: 500 }
        );
      }

      // Use existing user for profile creation
      authUserResponse = { data: { user: existingUser }, error: null };
    } else if (authUserResponse.error) {
      return NextResponse.json(
        {
          error: `Failed to create auth user: ${authUserResponse.error.message}`,
        },
        { status: 500 }
      );
    }

    const authUser = authUserResponse.data.user;
    if (!authUser) {
      return NextResponse.json(
        { error: 'User creation failed unexpectedly.' },
        { status: 500 }
      );
    }

    // 5. Create profile
    // learners_profiles.gender and profiles.gender share ONE domain now
    // (Male | Female | Other, 20260820160000), so no mapping is needed - and the old one
    // defaulted anything unrecognised to 'other', quietly mislabelling people.
    // trg_normalize_gender_profiles re-canonicalises on the way in.
    const profileGender = learner.gender?.trim() || null;

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: authUser.id,
      email: learner.college_email,
      full_name: `${learner.first_name} ${learner.last_name || ''}`.trim(),
      phone_number: learner.student_mobile,
      gender: profileGender,
      avatar_url: learner.student_photo_url || null,
      role: 'student',
      institution_id: learner.institution_id,
      department_id: learner.department_id,
      learner_id: learner.id,
      profile_completed: true,
      is_active: true,
    });

    if (profileError) {
      // Rollback: delete auth user
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      return NextResponse.json(
        { error: `Failed to create profile: ${profileError.message}` },
        { status: 500 }
      );
    }

    // 6. Log activity
    const activityLog = ActivityTemplates.userCreated(
      'System',
      `${learner.first_name} ${learner.last_name || ''}`.trim(),
      'student'
    );
    await logActivity({
      ...activityLog,
      userId: authUser.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Learner user account created successfully.',
      user_id: authUser.id,
    });
  } catch (error) {
    console.error('[learners/complete-onboarding] Error:', error);
    return NextResponse.json(
      { error: 'An internal error occurred.' },
      { status: 500 }
    );
  }
}
