export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/analytics — faculty analytics dashboard data
// Aggregates from multiple PDE tables
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

    // Run all queries in parallel for performance
    const [
      enrollmentsResult,
      engagementResult,
      questsResult,
      submissionsResult,
    ] = await Promise.all([
      // Total enrollments + active users
      (async () => {
        let query = (supabase as any)
          .from('pde_enrollments')
          .select('id, learner_id, status, progress_pct, enrolled_at', { count: 'exact' });
        if (courseId) query = query.eq('course_id', courseId);
        return query;
      })(),

      // Engagement data
      (async () => {
        let query = (supabase as any)
          .from('pde_engagement_daily')
          .select('learner_id, time_spent_minutes, lessons_completed, date');
        if (courseId) query = query.eq('course_id', courseId);
        // Last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query = query.gte('date', thirtyDaysAgo.toISOString().split('T')[0]);
        return query;
      })(),

      // Quest progress
      (async () => {
        let query = (supabase as any)
          .from('pde_quest_progress')
          .select('id, status, progress_pct');
        if (courseId) query = query.eq('course_id', courseId);
        return query;
      })(),

      // Assessment submissions
      (async () => {
        let query = (supabase as any)
          .from('pde_submissions')
          .select('id, score_pct, completed_at');
        if (courseId) {
          // Join through assessment to filter by course
          query = (supabase as any)
            .from('pde_submissions')
            .select('id, score_pct, completed_at, assessment:pde_assessments!inner(course_id)')
            .eq('assessment.course_id', courseId);
        }
        return query;
      })(),
    ]);

    // Process enrollments
    const enrollments = enrollmentsResult.data || [];
    const totalEnrollments = enrollments.length;
    const activeUsers = new Set(
      enrollments
        .filter((e: any) => e.status === 'active')
        .map((e: any) => e.learner_id)
    ).size;
    const avgCompletion = totalEnrollments > 0
      ? Math.round(
          enrollments.reduce((s: number, e: any) => s + (e.progress_pct || 0), 0) / totalEnrollments
        )
      : 0;

    // Process engagement
    const engagementRows = engagementResult.data || [];
    const uniqueEngagedLearners = new Set(engagementRows.map((r: any) => r.learner_id)).size;
    const totalTimeMinutes = engagementRows.reduce(
      (s: number, r: any) => s + (r.time_spent_minutes || 0), 0
    );
    const avgEngagementMinutes = uniqueEngagedLearners > 0
      ? Math.round(totalTimeMinutes / uniqueEngagedLearners)
      : 0;

    // Process quests
    const quests = questsResult.data || [];
    const questSummary = {
      total: quests.length,
      not_started: quests.filter((q: any) => q.status === 'not_started').length,
      in_progress: quests.filter((q: any) => q.status === 'in_progress').length,
      completed: quests.filter((q: any) => q.status === 'completed').length,
    };

    // Process submissions
    const submissions = submissionsResult.data || [];
    const completedSubmissions = submissions.filter((s: any) => s.completed_at && s.score_pct != null);
    const passRate = completedSubmissions.length > 0
      ? Math.round(
          (completedSubmissions.filter((s: any) => (s.score_pct || 0) >= 60).length /
            completedSubmissions.length) *
            100
        )
      : 0;

    // At-risk learners: enrolled but low engagement (< 2 days in last 30)
    const learnerEngagementDays = new Map<string, number>();
    engagementRows.forEach((r: any) => {
      const current = learnerEngagementDays.get(r.learner_id) || 0;
      learnerEngagementDays.set(r.learner_id, current + 1);
    });

    const enrolledLearnerIds = new Set(
      enrollments
        .filter((e: any) => e.status === 'active')
        .map((e: any) => e.learner_id)
    );

    let atRiskHigh = 0;
    let atRiskMedium = 0;
    let atRiskLow = 0;

    enrolledLearnerIds.forEach((lid) => {
      const days = learnerEngagementDays.get(lid as string) || 0;
      if (days === 0) atRiskHigh++;
      else if (days <= 2) atRiskMedium++;
      else if (days <= 5) atRiskLow++;
    });

    return NextResponse.json({
      data: {
        overview: {
          total_enrollments: totalEnrollments,
          active_users: activeUsers,
          avg_completion_pct: avgCompletion,
          avg_engagement_minutes: avgEngagementMinutes,
        },
        quests: questSummary,
        assessments: {
          total_submissions: submissions.length,
          completed_submissions: completedSubmissions.length,
          pass_rate_pct: passRate,
        },
        at_risk: {
          high: atRiskHigh,
          medium: atRiskMedium,
          low: atRiskLow,
          total: atRiskHigh + atRiskMedium + atRiskLow,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching PDE analytics:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
