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
    // 1. Use database function to get truly missing profiles
    // This bypasses Supabase pagination limits and does case-insensitive comparison
    // at the database level using LEFT JOIN for accuracy
    const { data: missingProfiles, error: missingError } = await supabaseAdmin
      .rpc('get_students_missing_profiles');

    if (missingError) {
      throw new Error(`Failed to fetch missing profiles: ${missingError.message}`);
    }

    // 2. Get total count of students with complete profiles for summary
    const { count: totalStudents, error: countError } = await supabaseAdmin
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('is_profile_complete', true)
      .not('college_email', 'is', null);

    if (countError) {
      throw new Error(`Failed to count students: ${countError.message}`);
    }

    if (!totalStudents || totalStudents === 0) {
      return NextResponse.json({
        message: 'No students with complete profiles found.',
        count: 0,
        missing_profiles: []
      });
    }

    // Construct the response in the format expected by the frontend component
    const summaryMessage = `Found ${missingProfiles.length} students with complete profiles who are missing a user profile.`;

    return NextResponse.json({
      success: true,
      summary: summaryMessage,
      details: missingProfiles.map((s: any) => ({
        student_id: s.student_id,
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
