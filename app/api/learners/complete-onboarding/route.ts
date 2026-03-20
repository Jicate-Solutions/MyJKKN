import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { logActivity, ActivityTemplates } from '@/lib/utils/activity-logger';

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
function generateTemporaryPassword(length = 12): string {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  // Ensure at least one digit and one uppercase
  if (!/\d/.test(password)) password += Math.floor(Math.random() * 10);
  if (!/[A-Z]/.test(password))
    password += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return password.slice(0, length);
}

export async function POST(request: NextRequest) {
  const { learner_id } = await request.json();

  if (!learner_id) {
    return NextResponse.json({ error: 'Learner ID is required' }, { status: 400 });
  }

  try {
    // 1. Fetch learner profile
    const { data: learner, error: learnerError } = await supabaseAdmin
      .from('learners_profiles')
      .select(
        'id, first_name, last_name, college_email, student_mobile, gender, student_photo_url, institution_id, department_id, is_profile_complete, lifecycle_status'
      )
      .eq('id', learner_id)
      .single();

    if (learnerError || !learner) {
      return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
    }

    // 2. Validate profile is complete and active
    if (!learner.is_profile_complete) {
      return NextResponse.json(
        { error: 'Learner profile is not complete. Cannot create user.' },
        { status: 400 }
      );
    }

    if (learner.lifecycle_status !== 'active') {
      return NextResponse.json(
        { error: 'Learner must be active to create user account' },
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
    // Convert gender from learner format (MALE/FEMALE/OTHER) to profile format (male/female/other)
    const genderMapping: Record<string, string> = {
      'MALE': 'male',
      'FEMALE': 'female',
      'OTHER': 'other'
    };
    const profileGender = learner.gender ? genderMapping[learner.gender.toUpperCase()] || 'other' : null;

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
