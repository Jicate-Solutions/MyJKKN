export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/pde/engagement — log an engagement event via RPC
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { learner_id, event_type, course_id, lesson_id, metadata } = body;

    if (!learner_id || !event_type) {
      return NextResponse.json(
        { error: 'learner_id and event_type are required' },
        { status: 400 }
      );
    }

    // Try RPC first, fall back to direct insert
    let result;
    try {
      const { data, error } = await (supabase as any).rpc('pde_log_engagement', {
        p_learner_id: learner_id,
        p_event_type: event_type,
        p_course_id: course_id || null,
        p_lesson_id: lesson_id || null,
        p_metadata: metadata || {},
      });
      if (error) throw error;
      result = data;
    } catch {
      // RPC might not exist yet — direct insert fallback
      const { data, error } = await (supabase as any)
        .from('pde_engagement_events')
        .insert({
          learner_id,
          event_type,
          course_id: course_id || null,
          lesson_id: lesson_id || null,
          metadata: metadata || {},
        })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error: any) {
    console.error('Error logging engagement:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/pde/engagement?learnerId=xxx&courseId=xxx — engagement summary with streak
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const learnerId = searchParams.get('learnerId');
    const courseId = searchParams.get('courseId');

    if (!learnerId) {
      return NextResponse.json(
        { error: 'learnerId query param is required' },
        { status: 400 }
      );
    }

    // Fetch daily engagement records
    let query = (supabase as any)
      .from('pde_engagement_daily')
      .select('*')
      .eq('learner_id', learnerId);
    if (courseId) query = query.eq('course_id', courseId);
    query = query.order('date', { ascending: false });

    const { data: rows, error } = await query;
    if (error) throw error;

    const dailyRows = rows || [];
    const totalTime = dailyRows.reduce((s: number, r: any) => s + (r.time_spent_minutes || 0), 0);
    const lessonsCompleted = dailyRows.reduce((s: number, r: any) => s + (r.lessons_completed || 0), 0);

    // Calculate current streak from consecutive days
    let currentStreak = 0;
    if (dailyRows.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sortedDates = dailyRows
        .map((r: any) => new Date(r.date))
        .sort((a: Date, b: Date) => b.getTime() - a.getTime());

      for (let i = 0; i < sortedDates.length; i++) {
        const expectedDate = new Date(today);
        expectedDate.setDate(today.getDate() - i);
        expectedDate.setHours(0, 0, 0, 0);
        const rowDate = new Date(sortedDates[i]);
        rowDate.setHours(0, 0, 0, 0);

        if (rowDate.getTime() === expectedDate.getTime()) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    const engagementScore = Math.min(
      100,
      Math.round((totalTime / 60) * 10 + lessonsCompleted * 5)
    );

    return NextResponse.json({
      data: {
        total_events: dailyRows.length,
        total_time_minutes: totalTime,
        lessons_completed: lessonsCompleted,
        assessments_passed: 0,
        current_streak: currentStreak,
        engagement_score: engagementScore,
        daily: dailyRows,
      },
    });
  } catch (error: any) {
    console.error('Error fetching engagement:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
