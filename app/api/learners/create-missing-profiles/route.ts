import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
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

export async function POST() {
  try {
    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized'
        },
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
        {
          success: false,
          error: 'Failed to fetch user profile'
        },
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
        {
          success: false,
          error: 'Failed to fetch role permissions'
        },
        { status: 500 }
      );
    }

    const rolePermissions = roleData as {
      permissions: Record<string, boolean>;
    } | null;

    // Check for learners.profiles.sync permission or super admin
    const permissions = rolePermissions?.permissions || {};
    const hasPermission =
      permissions['all'] === true ||
      permissions['learners.profiles.sync'] === true ||
      profile.is_super_admin;

    if (!hasPermission) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to sync learner profiles'
        },
        { status: 403 }
      );
    }

    // 3. Use database function to get truly missing profiles (same as check endpoint)
    const { data: missingProfiles, error: missingError } = await supabaseAdmin
      .rpc('get_learners_missing_profiles');

    if (missingError) {
      throw new Error(`Failed to fetch missing profiles: ${missingError.message}`);
    }

    const learnersToCreate = missingProfiles;

    if (!learnersToCreate || learnersToCreate.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No missing profiles to create.',
        created_count: 0,
        failed_count: 0,
        created_profiles: [],
        failed_profiles: []
      });
    }

    const createdProfiles = [];
    const failedProfiles = [];

    // 2. The function already returns the needed data (learner_id, email, names)
    // But we need full learner details for institution_id and mobile
    const learnerIds = learnersToCreate.map((l: any) => l.learner_id);
    const { data: learners, error: learnersError } = await supabaseAdmin
      .from('learners_profiles')
      .select('*')
      .in('id', learnerIds);

    if (learnersError) {
      throw new Error(
        `Failed to fetch learner details: ${learnersError.message}`
      );
    }

    // 3. Loop through and create each user and profile
    for (const learner of learners) {
      try {
        const tempPassword = generateTemporaryPassword();
        const fullName = `${learner.first_name} ${learner.last_name || ''}`.trim();

        // Create auth user
        const { data: authUser, error: authError } =
          await supabaseAdmin.auth.admin.createUser({
            email: learner.college_email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
              full_name: fullName,
              role: 'student'
            }
          });

        if (authError) {
          throw new Error(
            `Failed to create auth user for ${learner.college_email}: ${authError.message}`
          );
        }

        // Create profile
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: authUser.user.id,
            email: learner.college_email,
            full_name: fullName,
            phone_number: learner.mobile,
            role: 'student',
            institution_id: learner.institution_id,
            profile_completed: true,
            is_active: true
          });

        if (profileError) {
          // Clean up by deleting the auth user if profile creation fails
          await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
          throw new Error(
            `Failed to create profile for ${learner.college_email}: ${profileError.message}`
          );
        }

        createdProfiles.push({
          learner_id: learner.id,
          name: fullName,
          email: learner.college_email,
          temp_password: tempPassword
        });
      } catch (error) {
        failedProfiles.push({
          learner_id: learner.id,
          name: `${learner.first_name} ${learner.last_name || ''}`.trim(),
          email: learner.college_email,
          error: (error as Error).message
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Missing profile creation process completed.',
      created_count: createdProfiles.length,
      failed_count: failedProfiles.length,
      created_profiles: createdProfiles,
      failed_profiles: failedProfiles
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
