import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

export async function GET() {
  try {
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

    // Check if user is admin
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: currentUser, error: userError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (userError || !currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['super_admin', 'administrator'].includes(currentUser.role)) {
      return NextResponse.json(
        {
          error: 'Only super admin and administrator can check missing profiles'
        },
        { status: 403 }
      );
    }

    // Get students with completed profiles and college emails
    // Only students with is_profile_complete = true should be considered for user account creation
    // Students with is_profile_complete = false are in onboarding process, not missing profiles
    const { data: allStudents, error: studentError } = await supabaseAdmin
      .from('students')
      .select(
        `
        id,
        student_name,
        college_email,
        student_mobile,
        institution_id,
        is_profile_complete
      `
      )
      .eq('is_profile_complete', true)
      .not('college_email', 'is', null)
      .not('college_email', 'eq', '');

    if (studentError) {
      throw studentError;
    }

    // Get existing profiles
    const { data: existingProfiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('email, id')
      .in(
        'email',
        allStudents.map((s) => s.college_email)
      );

    if (profilesError) {
      throw profilesError;
    }

    // Get existing auth users
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthEmails = new Set(
      authUsers.users.map((user) => user.email)
    );

    const existingProfileEmails = new Set(existingProfiles.map((p) => p.email));

    const studentsWithProfiles = allStudents.filter((student) =>
      existingProfileEmails.has(student.college_email)
    );

    const studentsWithoutProfiles = allStudents.filter(
      (student) => !existingProfileEmails.has(student.college_email)
    );

    const studentsWithAuthButNoProfile = studentsWithoutProfiles.filter(
      (student) => existingAuthEmails.has(student.college_email)
    );

    const studentsWithoutAuthOrProfile = studentsWithoutProfiles.filter(
      (student) => !existingAuthEmails.has(student.college_email)
    );

    return NextResponse.json({
      success: true,
      summary: {
        total_students: allStudents.length,
        with_profiles: studentsWithProfiles.length,
        without_profiles: studentsWithoutProfiles.length,
        with_auth_but_no_profile: studentsWithAuthButNoProfile.length,
        without_auth_or_profile: studentsWithoutAuthOrProfile.length
      },
      details: {
        students_with_profiles: studentsWithProfiles.map((s) => ({
          name: s.student_name,
          email: s.college_email
        })),
        students_without_profiles: studentsWithoutProfiles.map((s) => ({
          name: s.student_name,
          email: s.college_email,
          has_auth_user: existingAuthEmails.has(s.college_email)
        }))
      }
    });
  } catch (error) {
    console.error('Error in check-missing-profiles:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
