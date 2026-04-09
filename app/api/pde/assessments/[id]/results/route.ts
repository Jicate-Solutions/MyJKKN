export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/assessments/[id]/results?submissionId=xxx
// Returns graded answers + Fink's taxonomy breakdown
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: assessmentId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const submissionId = searchParams.get('submissionId');

    if (!submissionId) {
      return NextResponse.json(
        { error: 'submissionId query param is required' },
        { status: 400 }
      );
    }

    // Fetch submission
    const { data: submission, error: sErr } = await (supabase as any)
      .from('pde_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('assessment_id', assessmentId)
      .single();

    if (sErr || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Fetch questions for this assessment
    const { data: questions, error: qErr } = await (supabase as any)
      .from('pde_assessment_questions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('order_index');

    if (qErr) throw qErr;

    // Build graded answers: match submission answers with questions
    const answers = submission.answers || {};
    const gradedAnswers = (questions || []).map((q: any) => {
      const studentAnswer = answers[q.id] ?? answers[q.order_index] ?? null;
      const isCorrect = studentAnswer !== null &&
        String(studentAnswer).toLowerCase().trim() === String(q.correct_answer).toLowerCase().trim();

      return {
        question_id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        student_answer: studentAnswer,
        correct_answer: q.correct_answer,
        is_correct: isCorrect,
        points: isCorrect ? (q.points || 1) : 0,
        max_points: q.points || 1,
        fink_category: q.fink_category || null,
        explanation: q.explanation || null,
      };
    });

    // Calculate Fink's taxonomy breakdown
    const finkBreakdown: Record<string, { correct: number; total: number; pct: number }> = {};
    gradedAnswers.forEach((a: any) => {
      const category = a.fink_category || 'uncategorized';
      if (!finkBreakdown[category]) {
        finkBreakdown[category] = { correct: 0, total: 0, pct: 0 };
      }
      finkBreakdown[category].total++;
      if (a.is_correct) finkBreakdown[category].correct++;
    });

    // Calculate percentages
    Object.keys(finkBreakdown).forEach((cat) => {
      const entry = finkBreakdown[cat];
      entry.pct = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0;
    });

    const totalPoints = gradedAnswers.reduce((s: number, a: any) => s + a.points, 0);
    const maxPoints = gradedAnswers.reduce((s: number, a: any) => s + a.max_points, 0);

    return NextResponse.json({
      data: {
        submission_id: submission.id,
        assessment_id: assessmentId,
        learner_id: submission.learner_id,
        attempt_number: submission.attempt_number,
        score_pct: submission.score_pct ?? (maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0),
        total_points: totalPoints,
        max_points: maxPoints,
        time_spent_seconds: submission.time_spent_seconds,
        started_at: submission.started_at,
        completed_at: submission.completed_at,
        graded_answers: gradedAnswers,
        fink_breakdown: finkBreakdown,
      },
    });
  } catch (error: any) {
    console.error('Error fetching assessment results:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
