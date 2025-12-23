import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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
    // 1. Use database function to get truly missing profiles (same as check endpoint)
    const { data: missingProfiles, error: missingError } = await supabaseAdmin
      .rpc('get_students_missing_profiles');

    if (missingError) {
      throw new Error(`Failed to fetch missing profiles: ${missingError.message}`);
    }

    const studentsToCreate = missingProfiles;

    if (!studentsToCreate || studentsToCreate.length === 0) {
      return NextResponse.json({
        message: 'No missing profiles to create.'
      });
    }

    const createdProfiles = [];
    const failedProfiles = [];

    // 2. Fetch full student details for those missing profiles
    const studentIds = studentsToCreate.map((s: any) => s.student_id);
    const { data: students, error: studentsError } = await supabaseAdmin
      .from('students')
      .select('*')
      .in('id', studentIds);

    if (studentsError) {
      throw new Error(
        `Failed to fetch student details: ${studentsError.message}`
      );
    }

    // 3. Loop through and create each user and profile
    for (const student of students) {
      try {
        const tempPassword = generateTemporaryPassword();
        const { data: authUser, error: authError } =
          await supabaseAdmin.auth.admin.createUser({
            email: student.college_email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
              full_name: `${student.first_name} ${
                student.last_name || ''
              }`.trim(),
              role: 'student'
            }
          });

        if (authError) {
          throw new Error(
            `Failed to create auth user for ${student.college_email}: ${authError.message}`
          );
        }

        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: authUser.user.id,
            email: student.college_email,
            full_name: `${student.first_name} ${
              student.last_name || ''
            }`.trim(),
            phone_number: student.student_mobile,
            role: 'student',
            institution_id: student.institution_id,
            profile_completed: true,
            is_active: true
          });

        if (profileError) {
          // Clean up by deleting the auth user if profile creation fails
          await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
          throw new Error(
            `Failed to create profile for ${student.college_email}: ${profileError.message}`
          );
        }

        createdProfiles.push({
          student_id: student.id,
          email: student.college_email
        });
      } catch (error) {
        failedProfiles.push({
          student_id: student.id,
          email: student.college_email,
          error: (error as Error).message
        });
      }
    }

    return NextResponse.json({
      message: 'Missing profile creation process completed.',
      created_count: createdProfiles.length,
      failed_count: failedProfiles.length,
      created_profiles: createdProfiles,
      failed_profiles: failedProfiles
    });
  } catch (error) {
    console.error('Error creating missing profiles:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}
