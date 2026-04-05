export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/assessments/lesson/[lessonId]
// Get assessment(s) for a specific lesson. Used by lesson viewer to show "Take Assessment" button.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessonId } = await params;

    const { data: assessments, error } = await (supabase as any)
      .from('pde_assessments')
      .select('id, title, assessment_type, max_attempts, time_limit_minutes, is_active, created_at')
      .eq('lesson_id', lessonId)
      .eq('is_active', true)
      .order('created_at');

    if (error) throw error;

    // Optionally fetch the learner's submission status for each assessment
    const searchParams = request.nextUrl.searchParams;
    const learnerId = searchParams.get('learnerId');

    if (learnerId && assessments && assessments.length > 0) {
      const assessmentIds = assessments.map((a: any) => a.id);

      const { data: submissions } = await (supabase as any)
        .from('pde_submissions')
        .select('assessment_id, id, attempt_number, score_pct, completed_at')
        .eq('learner_id', learnerId)
        .in('assessment_id', assessmentIds)
        .order('attempt_number', { ascending: false });

      // Attach latest submission to each assessment
      const submissionMap = new Map<string, any>();
      (submissions || []).forEach((s: any) => {
        if (!submissionMap.has(s.assessment_id)) {
          submissionMap.set(s.assessment_id, s);
        }
      });

      const enriched = assessments.map((a: any) => ({
        ...a,
        latest_submission: submissionMap.get(a.id) || null,
        has_attempted: submissionMap.has(a.id),
      }));

      return NextResponse.json({ data: enriched });
    }

    return NextResponse.json({ data: assessments || [] });
  } catch (error: any) {
    console.error('Error fetching lesson assessments:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
