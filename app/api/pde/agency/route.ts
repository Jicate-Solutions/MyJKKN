export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/agency?learnerId=xxx&courseId=yyy
// Returns the latest agency index for a learner, optionally filtered by course
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const learnerId = searchParams.get('learnerId') || user.id;
    const courseId = searchParams.get('courseId');
    const trends = searchParams.get('trends') === 'true';

    if (trends) {
      // Return all historical agency index records for this learner
      const { data, error } = await (supabase as any)
        .from('pde_agency_index')
        .select('*')
        .eq('learner_id', learnerId)
        .order('assessment_date', { ascending: true });
      if (error) throw error;
      return NextResponse.json({ data: data || [] });
    }

    // Return the latest agency index
    let query = (supabase as any)
      .from('pde_agency_index')
      .select('*')
      .eq('learner_id', learnerId);
    if (courseId) query = query.eq('course_id', courseId);

    const { data, error } = await query
      .order('assessment_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ data: data || null });
  } catch (error: any) {
    console.error('Error fetching agency index:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/pde/agency — trigger recalculation of agency index
// Body: { learnerId, courseId }
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

    if (!courseId) {
      return NextResponse.json(
        { error: 'courseId is required' },
        { status: 400 }
      );
    }

    const targetLearnerId = learnerId || user.id;

    // Fetch engagement data for computation
    const { data: engagementRows } = await (supabase as any)
      .from('pde_engagement_daily')
      .select('*')
      .eq('learner_id', targetLearnerId)
      .eq('course_id', courseId);
    const engagement = engagementRows || [];

    // Fetch build session data
    const { data: buildRows } = await (supabase as any)
      .from('pde_build_sessions')
      .select('ai_prompts_count, ai_outputs_modified, ai_outputs_blind')
      .eq('learner_id', targetLearnerId);
    const builds = buildRows || [];

    // Calculate dimensions
    const totalAiPrompts = engagement.reduce((s: number, r: any) => s + (r.ai_prompts_used || 0), 0);
    const totalLessonsViewed = engagement.reduce((s: number, r: any) => s + (r.lessons_viewed || 0), 0);
    const initiative = totalLessonsViewed > 0
      ? Math.min(100, Math.round((totalAiPrompts / Math.max(1, totalLessonsViewed)) * 50))
      : 0;

    const totalAiModified = engagement.reduce((s: number, r: any) => s + (r.ai_outputs_modified || 0), 0);
    const totalAiBlind = engagement.reduce((s: number, r: any) => s + (r.ai_outputs_accepted_blind || 0), 0);
    const totalAiOutputs = totalAiModified + totalAiBlind;
    const selfDirection = totalAiOutputs > 0
      ? Math.round((totalAiModified / totalAiOutputs) * 100)
      : 50;

    let toolMastery = 30;
    if (builds.length > 0) {
      const totalBuildPrompts = builds.reduce((s: number, b: any) => s + (b.ai_prompts_count || 0), 0);
      const totalBuildModified = builds.reduce((s: number, b: any) => s + (b.ai_outputs_modified || 0), 0);
      const modRatio = totalBuildPrompts > 0 ? totalBuildModified / totalBuildPrompts : 0;
      toolMastery = Math.min(100, Math.round(modRatio * 80 + Math.min(20, totalBuildPrompts * 2)));
    }

    const criticalEvaluation = totalAiOutputs > 0
      ? Math.round((totalAiModified / totalAiOutputs) * 100)
      : 50;

    const ethicalJudgment = totalAiOutputs > 0
      ? Math.max(0, Math.round(100 - (totalAiBlind / totalAiOutputs) * 100))
      : 50;

    const overall = Math.round(
      initiative * 0.2 +
      selfDirection * 0.2 +
      toolMastery * 0.2 +
      criticalEvaluation * 0.2 +
      ethicalJudgment * 0.2
    );

    let level = 'dependent';
    if (overall >= 80) level = 'principal';
    else if (overall >= 60) level = 'self_directed';
    else if (overall >= 40) level = 'independent';
    else if (overall >= 20) level = 'directed';

    const evidence = {
      total_ai_prompts: totalAiPrompts,
      total_ai_outputs: totalAiOutputs,
      total_ai_modified: totalAiModified,
      total_ai_blind: totalAiBlind,
      build_sessions_count: builds.length,
      engagement_days: engagement.length,
    };

    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await (supabase as any)
      .from('pde_agency_index')
      .upsert(
        {
          learner_id: targetLearnerId,
          course_id: courseId,
          assessment_date: today,
          initiative,
          self_direction: selfDirection,
          tool_mastery: toolMastery,
          critical_evaluation: criticalEvaluation,
          ethical_judgment: ethicalJudgment,
          overall,
          level,
          evidence,
        },
        { onConflict: 'learner_id,course_id,assessment_date' }
      )
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: any) {
    console.error('Error calculating agency index:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
