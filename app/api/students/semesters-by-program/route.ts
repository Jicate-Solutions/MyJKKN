import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const program_id = searchParams.get('program_id');

    if (!program_id) {
      return NextResponse.json(
        { error: 'program_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Fetch semesters that actually have students in the selected program
    const { data: semesters, error } = await supabase
      .from('students')
      .select(
        `
        semester_id,
        semesters!semester_id(
          id,
          semester_name,
          semester_code,
          is_active
        )
      `
      )
      .eq('program_id', program_id)
      .not('semester_id', 'is', null);

    if (error) {
      console.error('Error fetching semesters by program:', error);
      return NextResponse.json(
        { error: 'Failed to fetch semesters' },
        { status: 500 }
      );
    }

    // Extract unique semesters and format them
    const uniqueSemesters = new Map();

    semesters?.forEach((student: any) => {
      const semester = student.semesters;
      if (semester && semester.is_active && !uniqueSemesters.has(semester.id)) {
        uniqueSemesters.set(semester.id, {
          id: semester.id,
          semester_name: semester.semester_name,
          semester_code: semester.semester_code
        });
      }
    });

    const semesterList = Array.from(uniqueSemesters.values()).sort((a, b) =>
      a.semester_name.localeCompare(b.semester_name)
    );

    return NextResponse.json({ semesters: semesterList });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
