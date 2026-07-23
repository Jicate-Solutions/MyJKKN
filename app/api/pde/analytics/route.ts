export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// Terminal enrollment states — mirrors lib/services/pde-bridge-service.ts (the
// authoritative consumer), which counts ['passed','completed','verified'] as
// completed. Kept as a local literal because the bridge service does not
// export it. Compared case-insensitively, matching the bridge's toLowerCase().
const COMPLETED_STATUSES = ['completed', 'passed', 'verified'];

// GET /api/pde/analytics — faculty analytics dashboard data
// Aggregates from the REAL quest-centric PDE schema.
//
// Schema-drift note (2026-07-06): this route was originally written against an
// imagined LMS/course model — tables `pde_enrollments` and `pde_quest_progress`
// and columns `progress_pct` / `score_pct` that were never created. That made
// every call a 500. It now reads the tables that actually exist:
//   - pde_quest_enrollments (quest_id, learner_id, status, started_at, completed_at)
//   - pde_engagement_daily   (learner_id, time_spent_minutes, lessons_completed, date)
//   - pde_submissions        (final_score, completed_at)
//
// The `courseId` filter was removed: "course" is not a concept in the quest
// model (pde_quests / pde_quest_enrollments have no course_id), so a
// course-scoped filter would silently match nothing. Course-scoped analytics
// would require the LMS/course-content model that does not exist in this schema
// — flagged as a follow-up, not built here.
export async function GET(_request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Platform-wide PDE analytics — restricted to super-admin / administrator.
    // This route aggregates across ALL learners (see below), which is only a
    // safe, coherent view for a GLOBAL-scoped admin. It is deliberately NOT
    // opened to the per-college `pde.faculty.analytics.view` permission: a
    // service-role read spans every institution, so gating it per-college would
    // leak College A's engagement/at-risk/pass-rate into College B's dashboard.
    // Correct per-institution faculty scoping is a flagged follow-up — it needs
    // a dedicated scoped RPC/view because these tables have no institution_id
    // and `learner_id` maps to a learner's institution differently across the
    // quest-enrollment (`profiles.id`) vs submission (`learners_profiles.id`)
    // pipelines. Global-only gating is the safe interim boundary.
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();
    const allowed =
      !!profile &&
      (profile.is_super_admin ||
        profile.role === 'super_admin' ||
        profile.role === 'administrator');
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // pde_quest_enrollments carries only per-learner (own-row) RLS — even a
    // super-admin's RLS-scoped client would see only their own enrollments — so
    // read the aggregate sources via the service-role client. This spans all
    // learners, consistent with the global (super-admin) audience gated above.
    const reader = createServiceRoleClient();

    // Last-30-days cutoff for engagement.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

    // Run all queries in parallel for performance.
    const [
      enrollmentsResult,
      engagementResult,
      submissionsResult,
    ] = await Promise.all([
      // Quest enrollments — status-based, not percentage-based.
      (reader as any)
        .from('pde_quest_enrollments')
        .select('id, learner_id, status, started_at, completed_at'),

      // Daily engagement (last 30 days).
      (reader as any)
        .from('pde_engagement_daily')
        .select('learner_id, time_spent_minutes, lessons_completed, date')
        .gte('date', cutoffDate),

      // Assessment submissions — real score column is `final_score`.
      (reader as any)
        .from('pde_submissions')
        .select('id, final_score, completed_at'),
    ]);

    // Fail LOUD on any read error. This route exists to end the silent
    // schema-drift failures where a bad query was coerced to [] and the
    // dashboard showed zeros with no signal — so surface any read error as a
    // structured 500 rather than swallowing it into an all-zeros payload.
    const readError =
      enrollmentsResult.error || engagementResult.error || submissionsResult.error;
    if (readError) {
      return NextResponse.json(
        { error: 'Failed to load analytics', detail: readError.message },
        { status: 500 }
      );
    }

    // Process enrollments. There is no per-enrollment progress %; "completion"
    // is the share of enrollments in a terminal state (COMPLETED_STATUSES).
    const enrollments = enrollmentsResult.data || [];
    const totalEnrollments = enrollments.length;
    const activeUsers = new Set(
      enrollments
        .filter((e: any) => e.status === 'active')
        .map((e: any) => e.learner_id)
    ).size;
    const completedEnrollments = enrollments.filter(
      (e: any) => COMPLETED_STATUSES.includes((e.status ?? '').toLowerCase())
    ).length;
    const avgCompletion = totalEnrollments > 0
      ? Math.round((completedEnrollments / totalEnrollments) * 100)
      : 0;

    // Process engagement.
    const engagementRows = engagementResult.data || [];
    const uniqueEngagedLearners = new Set(engagementRows.map((r: any) => r.learner_id)).size;
    const totalTimeMinutes = engagementRows.reduce(
      (s: number, r: any) => s + (r.time_spent_minutes || 0), 0
    );
    const avgEngagementMinutes = uniqueEngagedLearners > 0
      ? Math.round(totalTimeMinutes / uniqueEngagedLearners)
      : 0;

    // Quest progress distribution, derived from enrollment status.
    // Enrollment implies the quest was started, so there is no "not_started"
    // state; 'active' == in progress, terminal states (completed/passed/
    // verified, per COMPLETED_STATUSES) == done.
    const questSummary = {
      total: totalEnrollments,
      in_progress: enrollments.filter((e: any) => e.status === 'active').length,
      completed: completedEnrollments,
    };

    // Process submissions.
    const submissions = submissionsResult.data || [];
    const completedSubmissions = submissions.filter(
      (s: any) => s.completed_at && s.final_score != null
    );
    const passRate = completedSubmissions.length > 0
      ? Math.round(
          (completedSubmissions.filter((s: any) => (s.final_score || 0) >= 60).length /
            completedSubmissions.length) *
            100
        )
      : 0;

    // At-risk learners: active enrollees with low engagement in the last 30 days.
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
