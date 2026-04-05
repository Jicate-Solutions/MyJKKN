export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/agency?learnerId=xxx&courseId=xxx
// Also supports mode=trends for historical data
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
    const mode = searchParams.get('mode');

    if (!learnerId) {
      return NextResponse.json(
        { error: 'learnerId query param is required' },
        { status: 400 }
      );
    }

    if (mode === 'trends') {
      // Return historical agency index snapshots
      let query = (supabase as any)
        .from('pde_agency_index')
        .select('*')
        .eq('learner_id', learnerId)
        .order('calculated_at', { ascending: true });

      if (courseId) query = query.eq('course_id', courseId);

      const { data, error } = await query;
      if (error) throw error;

      return NextResponse.json({ data: data || [] });
    }

    // Default: return latest agency index
    let query = (supabase as any)
      .from('pde_agency_index')
      .select('*')
      .eq('learner_id', learnerId)
      .order('calculated_at', { ascending: false })
      .limit(1);

    if (courseId) query = query.eq('course_id', courseId);

    const { data, error } = await query;
    if (error) throw error;

    const latest = data?.[0] || null;

    // If no existing index, compute a basic one from engagement data
    if (!latest) {
      const agencyIndex = await computeBasicAgencyIndex(supabase, learnerId, courseId);
      return NextResponse.json({ data: agencyIndex });
    }

    return NextResponse.json({ data: latest });
  } catch (error: any) {
    console.error('Error fetching agency index:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/pde/agency — trigger recalculation from engagement data
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { learnerId, courseId } = body;

    if (!learnerId) {
      return NextResponse.json(
        { error: 'learnerId is required' },
        { status: 400 }
      );
    }

    const agencyIndex = await computeBasicAgencyIndex(supabase, learnerId, courseId);

    // Store the calculated index
    const { data, error } = await (supabase as any)
      .from('pde_agency_index')
      .insert({
        learner_id: learnerId,
        course_id: courseId || null,
        ...agencyIndex,
        calculated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data: data || agencyIndex }, { status: 201 });
  } catch (error: any) {
    console.error('Error recalculating agency index:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Compute basic agency index from engagement data
async function computeBasicAgencyIndex(
  supabase: any,
  learnerId: string,
  courseId?: string | null
) {
  // Fetch engagement data
  let engQuery = (supabase as any)
    .from('pde_engagement_daily')
    .select('*')
    .eq('learner_id', learnerId);
  if (courseId) engQuery = engQuery.eq('course_id', courseId);

  const { data: engRows } = await engQuery;
  const engagement = engRows || [];

  // Calculate dimensions
  const totalDays = engagement.length;
  const totalTime = engagement.reduce((s: number, r: any) => s + (r.time_spent_minutes || 0), 0);
  const lessonsCompleted = engagement.reduce((s: number, r: any) => s + (r.lessons_completed || 0), 0);

  // Consistency: how regularly they engage (days active / total span)
  const consistency = totalDays > 1
    ? Math.min(100, Math.round((totalDays / 30) * 100))
    : totalDays > 0 ? 10 : 0;

  // Initiative: based on total time and self-directed actions
  const initiative = Math.min(100, Math.round(totalTime / 10));

  // Depth: based on lessons completed and time per lesson
  const avgTimePerLesson = lessonsCompleted > 0 ? totalTime / lessonsCompleted : 0;
  const depth = Math.min(100, Math.round(avgTimePerLesson * 2 + lessonsCompleted));

  // Overall agency index (weighted average)
  const overall = Math.round(consistency * 0.3 + initiative * 0.35 + depth * 0.35);

  return {
    overall_score: overall,
    consistency_score: consistency,
    initiative_score: initiative,
    depth_score: depth,
    total_days_active: totalDays,
    total_time_minutes: totalTime,
    lessons_completed: lessonsCompleted,
  };
}
