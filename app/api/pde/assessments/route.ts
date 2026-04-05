export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/assessments?courseId=xxx or ?lessonId=xxx
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const courseId = searchParams.get('courseId');
    const lessonId = searchParams.get('lessonId');

    if (!courseId && !lessonId) {
      return NextResponse.json(
        { error: 'Either courseId or lessonId query param is required' },
        { status: 400 }
      );
    }

    let query = (supabase as any)
      .from('pde_assessments')
      .select('*')
      .eq('is_active', true)
      .order('created_at');

    if (lessonId) {
      query = query.eq('lesson_id', lessonId);
    } else if (courseId) {
      query = query.eq('course_id', courseId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    console.error('Error fetching assessments:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/pde/assessments — create a new assessment
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { course_id, title, assessment_type, ...rest } = body;

    if (!course_id || !title || !assessment_type) {
      return NextResponse.json(
        { error: 'course_id, title, and assessment_type are required' },
        { status: 400 }
      );
    }

    const { data, error } = await (supabase as any)
      .from('pde_assessments')
      .insert({
        course_id,
        title,
        assessment_type,
        created_by: user.id,
        ...rest,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating assessment:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
