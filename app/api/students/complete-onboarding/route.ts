import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { CookieOptions } from '@supabase/ssr';
import { CreateUserRequest } from '@/types/users';
import { logActivity, ActivityTemplates } from '@/lib/utils/activity-logger';
import { RESOURCE_TYPES } from '@/types/activity';

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

export async function POST(request: NextRequest) {
  const { student_id } = await request.json();

  if (!student_id) {
    return NextResponse.json(
      { error: 'Student ID is required' },
      { status: 400 }
    );
  }

  try {
    // 1. Verify the student record exists and is ready for promotion.
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select(
        'id, first_name, last_name, college_email, student_mobile, institution_id, department_id, is_profile_complete'
      )
      .eq('id', student_id)
      .single();

    if (studentError || !student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // 2. Security Check: Ensure the profile is actually complete.
    if (!student.is_profile_complete) {
      return NextResponse.json(
        { error: 'Student profile is not complete. Cannot create user.' },
        { status: 400 }
      );
    }

    if (!student.college_email) {
      return NextResponse.json(
        { error: 'Student does not have a college email.' },
        { status: 400 }
      );
    }

    // 3. Check if a user or profile already exists to prevent duplicates.
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', student.college_email)
      .maybeSingle();

    if (existingProfile) {
      console.warn(
        `A profile for ${student.college_email} already exists. Aborting user creation.`
      );
      return NextResponse.json(
        { error: 'A user with this email already has a profile.' },
        { status: 409 }
      );
    }

    // 4. Create the auth user.
    const tempPassword = generateTemporaryPassword();
    let authUserResponse = await supabaseAdmin.auth.admin.createUser({
      email: student.college_email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: `${student.first_name} ${student.last_name || ''}`.trim(),
        role: 'student'
      }
    });

    if (authUserResponse.error) {
      // Check for the "User already exists" specific error
      if (authUserResponse.error.message.includes('already exists')) {
        console.warn(
          `Auth user for ${student.college_email} already exists. Attempting to retrieve and use existing user.`
        );

        // Fetch the first page of users and find the one with the matching email.
        // NOTE: This may not find the user if you have more than 50 users in total.
        const {
          data: { users },
          error: listError
        } = await supabaseAdmin.auth.admin.listUsers();

        if (listError) {
          return NextResponse.json(
            { error: 'Failed to retrieve user list.' },
            { status: 500 }
          );
        }

        const existingUser = users.find(
          (u) => u.email === student.college_email
        );

        if (!existingUser) {
          return NextResponse.json(
            { error: 'User exists but could not be found.' },
            { status: 500 }
          );
        }

        // Re-assign the result to use the existing user for profile creation.
        authUserResponse = { data: { user: existingUser }, error: null };
      } else {
        return NextResponse.json(
          {
            error: `Failed to create auth user: ${authUserResponse.error.message}`
          },
          { status: 500 }
        );
      }
    }

    const authUser = authUserResponse.data;

    if (!authUser || !authUser.user) {
      return NextResponse.json(
        { error: 'User creation failed unexpectedly.' },
        { status: 500 }
      );
    }

    // 5. Create the profile.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authUser.user.id,
        email: student.college_email,
        full_name: `${student.first_name} ${student.last_name || ''}`.trim(),
        phone_number: student.student_mobile,
        role: 'student',
        institution_id: student.institution_id,
        department_id: student.department_id,
        profile_completed: true,
        is_active: true
      });

    if (profileError) {
      // If profile creation fails, we should delete the auth user we just made to keep things clean.
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json(
        { error: `Failed to create profile: ${profileError.message}` },
        { status: 500 }
      );
    }

    // 6. Log activity and return success.
    // Note: We can't easily get the actor's name here since we are using the service key.
    // This could be enhanced later if needed.
    const activityLog = ActivityTemplates.userCreated(
      'System',
      student.first_name + ' ' + student.last_name,
      'student'
    );
    await logActivity({
      ...activityLog,
      userId: authUser.user.id
    });

    return NextResponse.json({
      success: true,
      message: 'Student user account created successfully.'
    });
  } catch (error) {
    console.error('Error in complete-onboarding endpoint:', error);
    return NextResponse.json(
      { error: 'An internal error occurred.' },
      { status: 500 }
    );
  }
}
