/**
 * Server-side data fetching for Maturity Dashboard
 */

import { createClient } from '@/lib/supabase/server';
import type {
  MaturityDashboardData,
  MaturityStage,
  MaturityDimensionName
} from '@/types/maturity-assessment';

export async function getDashboardData(
  institutionId: string
): Promise<MaturityDashboardData> {
  const supabase = await createClient();

  // Get latest approved assessments
  const { data: assessments, error: assessmentError } = await supabase
    .from('maturity_assessments')
    .select(
      `
      *,
      department:departments(id, department_name)
    `
    )
    .eq('institution_id', institutionId)
    .eq('status', 'approved')
    .order('assessment_date', { ascending: false });

  if (assessmentError) {
    console.error('[getDashboardData] Error:', assessmentError);
    throw new Error(`Failed to fetch dashboard data: ${assessmentError.message}`);
  }

  // Calculate by department (latest only)
  const byDepartment: Record<string, MaturityStage> = {};
  const seenDepts = new Set<string>();

  assessments?.forEach((a) => {
    const deptId = a.department_id || 'institution';
    if (!seenDepts.has(deptId)) {
      seenDepts.add(deptId);
      const deptName =
        (a.department as { name: string } | null)?.name || 'Institution-wide';
      byDepartment[deptName] = a.overall_stage as MaturityStage;
    }
  });

  // Calculate by dimension (average of latest assessments)
  const byDimension: Record<MaturityDimensionName, number> = {
    Leadership: 0,
    Strategy: 0,
    People: 0,
    Processes: 0,
    Resources: 0,
    Results: 0
  };
  const dimensionCounts: Record<string, number> = {};

  assessments?.slice(0, 10).forEach((a) => {
    const scores = a.dimension_scores as Record<string, number>;
    Object.entries(scores).forEach(([dim, score]) => {
      if (byDimension[dim as MaturityDimensionName] !== undefined) {
        byDimension[dim as MaturityDimensionName] += score;
        dimensionCounts[dim] = (dimensionCounts[dim] || 0) + 1;
      }
    });
  });

  Object.keys(byDimension).forEach((dim) => {
    if (dimensionCounts[dim]) {
      byDimension[dim as MaturityDimensionName] /= dimensionCounts[dim];
    }
  });

  // Calculate overall
  const overallScores = assessments?.map((a) => a.overall_stage) || [1];
  const institutionOverall = Math.round(
    overallScores.reduce((a, b) => a + b, 0) / overallScores.length
  ) as MaturityStage;

  // Trend
  const trend =
    assessments
      ?.slice(0, 12)
      .map((a) => ({
        date: a.assessment_date,
        stage: a.overall_stage,
        department: (a.department as { name: string } | null)?.name
      }))
      .reverse() || [];

  // Progress items summary
  const assessmentIds = assessments?.map((a) => a.id) || [];
  let progressSummary = {
    total: 0,
    completed: 0,
    in_progress: 0,
    pending: 0,
    blocked: 0,
    overdue: 0
  };

  if (assessmentIds.length > 0) {
    const { data: progressItems } = await supabase
      .from('maturity_progress')
      .select('status, due_date')
      .in('assessment_id', assessmentIds);

    const now = new Date();
    progressSummary = {
      total: progressItems?.length || 0,
      completed:
        progressItems?.filter((p) => p.status === 'completed').length || 0,
      in_progress:
        progressItems?.filter((p) => p.status === 'in_progress').length || 0,
      pending: progressItems?.filter((p) => p.status === 'pending').length || 0,
      blocked: progressItems?.filter((p) => p.status === 'blocked').length || 0,
      overdue:
        progressItems?.filter(
          (p) =>
            p.status !== 'completed' && p.due_date && new Date(p.due_date) < now
        ).length || 0
    };
  }

  return {
    institution_overall: institutionOverall,
    by_department: byDepartment,
    by_dimension: byDimension,
    trend,
    improvement_items: progressSummary,
    latest_assessments: assessments?.slice(0, 5) || []
  };
}
