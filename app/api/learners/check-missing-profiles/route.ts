import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';


// Create admin client for user management
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function GET() {
  try {
    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // 2. Check permissions
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profileData) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }

    const profile = profileData as {
      id: string;
      role: string;
      is_super_admin: boolean | null;
    };

    // Get user's role and permissions
    const { data: roleData, error: roleError } = await supabase
      .from('custom_roles')
      .select('permissions')
      .eq('role_key', profile.role)
      .single();

    if (roleError) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch role permissions' },
        { status: 500 }
      );
    }

    const rolePermissions = roleData as { permissions: Record<string, boolean> } | null;
    const permissions = rolePermissions?.permissions || {};
    const hasPermission =
      permissions['all'] === true ||
      permissions['learners.profiles.sync'] === true ||
      profile.is_super_admin;

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to sync learner profiles' },
        { status: 403 }
      );
    }

    // 3. Get all active learners with college emails
    const { data: allLearners, error: learnersError } = await supabaseAdmin
      .from('learners_profiles')
      .select(`
        id,
        first_name,
        last_name,
        college_email,
        student_mobile,
        institution_id,
        department_id,
        gender,
        lifecycle_status,
        is_profile_complete
      `)
      .eq('lifecycle_status', 'active')
      .eq('is_profile_complete', true)
      .not('college_email', 'is', null)
      .not('college_email', 'eq', '');

    if (learnersError) {
      throw new Error(`Failed to fetch learners: ${learnersError.message}`);
    }

    if (!allLearners || allLearners.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          total_learners: 0,
          with_complete_profiles: 0,
          with_incomplete_profiles: 0,
          without_profiles: 0,
          total_needing_sync: 0
        },
        details: {
          learners_with_complete_profiles: [],
          learners_with_incomplete_profiles: [],
          learners_without_profiles: []
        }
      });
    }

    // 4. Get existing profiles matching learner emails (case-insensitive via lowercase)
    const learnerEmails = allLearners.map((l) => l.college_email.toLowerCase());
    const { data: existingProfiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, institution_id, department_id, learner_id, full_name, phone_number, gender, is_active');

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    // Build a map of profiles by lowercase email for case-insensitive lookup
    const profilesByEmail = new Map<string, typeof existingProfiles[0]>();
    for (const p of existingProfiles) {
      if (p.email) {
        profilesByEmail.set(p.email.toLowerCase(), p);
      }
    }

    // 5. Categorize learners based on profile status
    const learnersWithCompleteProfiles: typeof allLearners = [];
    const learnersWithIncompleteProfiles: any[] = [];
    const learnersWithoutProfiles: typeof allLearners = [];

    for (const learner of allLearners) {
      const profile = profilesByEmail.get(learner.college_email.toLowerCase());

      if (!profile) {
        // No profile exists at all
        learnersWithoutProfiles.push(learner);
      } else {
        // Profile exists - check if all fields are correct
        const expectedFullName = `${learner.first_name} ${learner.last_name || ''}`.trim();
        const hasCorrectRole = profile.role === 'student';
        const hasCorrectInstitution = profile.institution_id === learner.institution_id;
        const hasCorrectDepartment = profile.department_id === learner.department_id;
        const hasLearnerId = profile.learner_id === learner.id;
        const hasCorrectName = profile.full_name === expectedFullName;
        const hasCorrectPhone = profile.phone_number === learner.student_mobile;
        const hasCorrectGender = learner.gender
          ? (profile.gender || '').toUpperCase() === learner.gender.toUpperCase()
          : true; // Skip if learner has no gender
        const hasCorrectActive = profile.is_active === true;

        if (
          hasCorrectRole &&
          hasCorrectInstitution &&
          hasCorrectDepartment &&
          hasLearnerId &&
          hasCorrectName &&
          hasCorrectPhone &&
          hasCorrectGender &&
          hasCorrectActive
        ) {
          learnersWithCompleteProfiles.push(learner);
        } else {
          learnersWithIncompleteProfiles.push({
            ...learner,
            profile_id: profile.id,
            current_role: profile.role,
            current_institution_id: profile.institution_id,
            current_department_id: profile.department_id,
            current_learner_id: profile.learner_id,
            current_full_name: profile.full_name,
            current_phone_number: profile.phone_number,
            current_gender: profile.gender,
            current_is_active: profile.is_active,
            // Track what's valid already
            has_correct_role: hasCorrectRole,
            has_learner_id: hasLearnerId,
            has_correct_gender: hasCorrectGender
          });
        }
      }
    }

    const totalNeedingSync =
      learnersWithoutProfiles.length + learnersWithIncompleteProfiles.length;

    return NextResponse.json({
      success: true,
      summary: {
        total_learners: allLearners.length,
        with_complete_profiles: learnersWithCompleteProfiles.length,
        with_incomplete_profiles: learnersWithIncompleteProfiles.length,
        without_profiles: learnersWithoutProfiles.length,
        total_needing_sync: totalNeedingSync
      },
      details: {
        learners_with_complete_profiles: learnersWithCompleteProfiles.map((l) => ({
          name: `${l.first_name} ${l.last_name || ''}`.trim(),
          email: l.college_email
        })),
        learners_with_incomplete_profiles: learnersWithIncompleteProfiles.map((l: any) => ({
          learner_id: l.id,
          name: `${l.first_name} ${l.last_name || ''}`.trim(),
          email: l.college_email,
          changes: {
            role: {
              current: l.current_role,
              new: 'student',
              changed: !l.has_correct_role
            },
            institution_id: {
              current: l.current_institution_id,
              new: l.institution_id,
              changed: l.current_institution_id !== l.institution_id
            },
            department_id: {
              current: l.current_department_id,
              new: l.department_id,
              changed: l.current_department_id !== l.department_id
            },
            learner_id: {
              current: l.current_learner_id,
              new: l.id,
              changed: l.current_learner_id !== l.id
            },
            full_name: {
              current: l.current_full_name,
              new: `${l.first_name} ${l.last_name || ''}`.trim(),
              changed: l.current_full_name !== `${l.first_name} ${l.last_name || ''}`.trim()
            },
            phone_number: {
              current: l.current_phone_number,
              new: l.student_mobile,
              changed: l.current_phone_number !== l.student_mobile
            },
            gender: {
              current: l.current_gender,
              new: l.gender,
              changed: !l.has_correct_gender
            },
            is_active: {
              current: l.current_is_active,
              new: true,
              changed: l.current_is_active !== true
            }
          },
          issues: {
            wrong_role: !l.has_correct_role,
            missing_learner_id: !l.has_learner_id,
            wrong_institution: l.current_institution_id !== l.institution_id,
            wrong_department: l.current_department_id !== l.department_id,
            wrong_name: l.current_full_name !== `${l.first_name} ${l.last_name || ''}`.trim(),
            wrong_phone: l.current_phone_number !== l.student_mobile,
            wrong_gender: !l.has_correct_gender,
            wrong_active: l.current_is_active !== true
          }
        })),
        learners_without_profiles: learnersWithoutProfiles.map((l) => ({
          learner_id: l.id,
          name: `${l.first_name} ${l.last_name || ''}`.trim(),
          email: l.college_email
        }))
      }
    });
  } catch (error) {
    console.error('[api/learners/check-missing-profiles] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An internal server error occurred.'
      },
      { status: 500 }
    );
  }
}
