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

export async function GET() {
  try {
    // 1. Get all students with complete profiles and a college email
    const { data: students, error: studentsError } = await supabaseAdmin
      .from('students')
      .select('id, college_email')
      .eq('is_profile_complete', true)
      .not('college_email', 'is', null);

    if (studentsError) {
      throw new Error(`Failed to fetch students: ${studentsError.message}`);
    }

    if (!students || students.length === 0) {
      return NextResponse.json({
        message: 'No students with complete profiles found.',
        count: 0,
        missing_profiles: []
      });
    }

    // 2. Get all existing profiles
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('email');

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    const existingProfileEmails = new Set(profiles.map((p) => p.email));

    // 3. Find students who are missing a profile
    const missingProfiles = students.filter(
      (student) => !existingProfileEmails.has(student.college_email!)
    );

    // Construct the response in the format expected by the frontend component
    const summaryMessage = `Found ${missingProfiles.length} students with complete profiles who are missing a user profile.`;

    return NextResponse.json({
      success: true,
      summary: summaryMessage,
      details: missingProfiles.map((s) => ({
        student_id: s.id,
        college_email: s.college_email
      }))
    });
  } catch (error) {
    console.error('Error checking for missing profiles:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}
