import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
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

// Helper function to generate a random password
function generateTemporaryPassword(length = 12): string {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0, n = charset.length; i < length; ++i) {
    password += charset.charAt(Math.floor(Math.random() * n));
  }
  if (!/\d/.test(password)) {
    password += Math.floor(Math.random() * 10);
  }
  if (!/[A-Z]/.test(password)) {
    password += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }
  return password.slice(0, length);
}

export async function POST(request: Request) {
  try {
    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
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

    const currentProfile = profileData as {
      id: string;
      role: string;
      is_super_admin: boolean | null;
    };

    const { data: roleData, error: roleError } = await supabase
      .from('custom_roles')
      .select('permissions')
      .eq('role_key', currentProfile.role)
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
      currentProfile.is_super_admin;

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to sync learner profiles' },
        { status: 403 }
      );
    }

    // 3. Get selected learner IDs from request body (optional - if not provided, sync all)
    const body = await request.json().catch(() => ({}));
    const selectedLearnerIds: string[] | undefined = body.learner_ids;

    // 4. Get all active learners with college emails
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

    // 5. Get existing profiles for comparison
    const { data: existingProfiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, institution_id, department_id, learner_id, full_name, phone_number, gender, is_active');

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    // Build profile map by lowercase email
    const profilesByEmail = new Map<string, typeof existingProfiles[0]>();
    for (const p of existingProfiles) {
      if (p.email) {
        profilesByEmail.set(p.email.toLowerCase(), p);
      }
    }

    // 6. Categorize learners
    const learnersNeedingNewProfiles: typeof allLearners = [];
    const learnersNeedingProfileUpdates: any[] = [];

    for (const learner of allLearners) {
      const profile = profilesByEmail.get(learner.college_email.toLowerCase());

      if (!profile) {
        learnersNeedingNewProfiles.push(learner);
      } else {
        const expectedFullName = `${learner.first_name} ${learner.last_name || ''}`.trim();
        const hasCorrectRole = profile.role === 'student';
        const hasCorrectInstitution = profile.institution_id === learner.institution_id;
        const hasCorrectDepartment = profile.department_id === learner.department_id;
        const hasLearnerId = profile.learner_id === learner.id;
        const hasCorrectName = profile.full_name === expectedFullName;
        const hasCorrectPhone = profile.phone_number === learner.student_mobile;
        const hasCorrectGender = learner.gender
          ? (profile.gender || '').toUpperCase() === learner.gender.toUpperCase()
          : true;
        const hasCorrectActive = profile.is_active === true;

        if (
          !hasCorrectRole ||
          !hasCorrectInstitution ||
          !hasCorrectDepartment ||
          !hasLearnerId ||
          !hasCorrectName ||
          !hasCorrectPhone ||
          !hasCorrectGender ||
          !hasCorrectActive
        ) {
          learnersNeedingProfileUpdates.push({
            ...learner,
            profile_id: profile.id,
            current_role: profile.role,
            has_correct_role: hasCorrectRole
          });
        }
      }
    }

    // 7. Filter by selected learner IDs if provided
    let filteredNewProfiles = learnersNeedingNewProfiles;
    let filteredUpdates = learnersNeedingProfileUpdates;

    if (selectedLearnerIds && selectedLearnerIds.length > 0) {
      const selectedIdsSet = new Set(selectedLearnerIds);
      filteredNewProfiles = learnersNeedingNewProfiles.filter((l) =>
        selectedIdsSet.has(l.id)
      );
      filteredUpdates = learnersNeedingProfileUpdates.filter((l: any) =>
        selectedIdsSet.has(l.id)
      );

      console.log(
        `[learner-sync] Processing only ${selectedLearnerIds.length} selected learners`
      );
    }

    console.log(
      `[learner-sync] Found ${filteredUpdates.length} learners needing profile UPDATES`
    );
    console.log(
      `[learner-sync] Found ${filteredNewProfiles.length} learners needing NEW profiles`
    );

    const results: any[] = [];
    const errors: any[] = [];
    let createdCount = 0;
    let updatedCount = 0;

    // 8. Process profile UPDATES first (fix existing incomplete profiles)
    for (const learner of filteredUpdates) {
      try {
        const fullName = `${learner.first_name} ${learner.last_name || ''}`.trim();
        const profileId = learner.profile_id;

        if (!profileId) {
          throw new Error(`Profile ID not found for ${learner.college_email}`);
        }

        // Build update object
        const updateData: Record<string, any> = {
          role: 'student',
          institution_id: learner.institution_id,
          department_id: learner.department_id,
          learner_id: learner.id,
          full_name: fullName,
          phone_number: learner.student_mobile,
          gender: learner.gender || undefined,
          is_active: true,
          updated_at: new Date().toISOString()
        };

        // Remove undefined values (don't overwrite with null if learner has no gender)
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) delete updateData[key];
        });

        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update(updateData)
          .eq('id', profileId);

        if (updateError) {
          console.error(
            `[learner-sync] Profile update error for ${learner.college_email}:`,
            updateError
          );
          throw updateError;
        }

        updatedCount++;
        results.push({
          learner_id: learner.id,
          email: learner.college_email,
          full_name: fullName,
          user_id: profileId,
          action: 'updated',
          temp_password: 'Profile updated - existing auth',
          success: true
        });
      } catch (error) {
        console.error(
          `[learner-sync] Error updating profile for ${learner.college_email}:`,
          error
        );
        errors.push({
          learner_id: learner.id,
          email: learner.college_email,
          full_name: `${learner.first_name} ${learner.last_name || ''}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false
        });
      }
    }

    // 9. Process NEW profile creation (auth user + profile)
    for (const learner of filteredNewProfiles) {
      try {
        const fullName = `${learner.first_name} ${learner.last_name || ''}`.trim();

        // Double-check if profile already exists (real-time check)
        const { data: existingProfileCheck } = await supabaseAdmin
          .from('profiles')
          .select('id, email, role, institution_id, department_id, learner_id')
          .ilike('email', learner.college_email)
          .maybeSingle();

        if (existingProfileCheck) {
          // Profile was created between check and create - update it instead
          const needsUpdate =
            existingProfileCheck.role !== 'student' ||
            existingProfileCheck.institution_id !== learner.institution_id ||
            existingProfileCheck.department_id !== learner.department_id ||
            existingProfileCheck.learner_id !== learner.id;

          if (needsUpdate) {
            const fallbackUpdate: Record<string, any> = {
              role: 'student',
              institution_id: learner.institution_id,
              department_id: learner.department_id,
              learner_id: learner.id,
              full_name: fullName,
              phone_number: learner.student_mobile,
              is_active: true,
              updated_at: new Date().toISOString()
            };
            if (learner.gender) fallbackUpdate.gender = learner.gender;

            const { error: updateError } = await supabaseAdmin
              .from('profiles')
              .update(fallbackUpdate)
              .eq('id', existingProfileCheck.id);

            if (updateError) throw updateError;

            updatedCount++;
            results.push({
              learner_id: learner.id,
              email: learner.college_email,
              full_name: fullName,
              user_id: existingProfileCheck.id,
              action: 'updated',
              temp_password: 'Profile updated',
              success: true
            });
          } else {
            results.push({
              learner_id: learner.id,
              email: learner.college_email,
              full_name: fullName,
              user_id: existingProfileCheck.id,
              action: 'skipped',
              temp_password: 'Profile already correct',
              success: true
            });
          }
          continue;
        }

        // Create auth user
        const tempPassword = generateTemporaryPassword();
        const { data: authUser, error: authCreateError } =
          await supabaseAdmin.auth.admin.createUser({
            email: learner.college_email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
              full_name: fullName,
              role: 'student'
            }
          });

        if (authCreateError) {
          throw new Error(
            `Failed to create auth user for ${learner.college_email}: ${authCreateError.message}`
          );
        }

        // Create profile
        const newProfileData: Record<string, any> = {
          id: authUser.user.id,
          email: learner.college_email,
          full_name: fullName,
          phone_number: learner.student_mobile,
          role: 'student',
          institution_id: learner.institution_id,
          department_id: learner.department_id,
          learner_id: learner.id,
          profile_completed: true,
          is_active: true
        };
        if (learner.gender) newProfileData.gender = learner.gender;

        const { error: profileInsertError } = await supabaseAdmin
          .from('profiles')
          .insert(newProfileData);

        if (profileInsertError) {
          // Clean up auth user on profile failure
          await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
          throw new Error(
            `Failed to create profile for ${learner.college_email}: ${profileInsertError.message}`
          );
        }

        createdCount++;
        results.push({
          learner_id: learner.id,
          email: learner.college_email,
          full_name: fullName,
          user_id: authUser.user.id,
          action: 'created',
          temp_password: tempPassword,
          success: true
        });
      } catch (error) {
        console.error(
          `[learner-sync] Error creating profile for ${learner.college_email}:`,
          error
        );
        errors.push({
          learner_id: learner.id,
          email: learner.college_email,
          full_name: `${learner.first_name} ${learner.last_name || ''}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false
        });
      }
    }

    const totalProcessed = filteredNewProfiles.length + filteredUpdates.length;

    return NextResponse.json({
      success: true,
      message: `Processed ${totalProcessed} learners (${createdCount} created, ${updatedCount} updated)`,
      results: {
        total_processed: totalProcessed,
        successful: results.length,
        failed: errors.length,
        created_count: createdCount,
        updated_count: updatedCount,
        created_profiles: results,
        errors: errors
      }
    });
  } catch (error) {
    console.error('[api/learners/create-missing-profiles] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An internal server error occurred.'
      },
      { status: 500 }
    );
  }
}
