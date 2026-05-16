/**
 * Server-side stats fetcher for the Learner Onboarding KPI cards.
 *
 * Returns 4 tier counts + an overall completion-rate percentage.
 *
 * Implementation: 5 parallel `count: 'exact', head: true` queries. Each is a
 * single index scan over `learners_profiles`, no row data transferred.
 * Total wall-clock = max(queries), not sum, because of Promise.all.
 */

import { createClient } from '@/lib/supabase/server';
import type { OnboardingStats } from '@/types/learner-onboarding';

interface GetOnboardingStatsParams {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
}

const EMPTY_STATS: OnboardingStats = {
  total_incomplete: 0,
  critical: 0,
  needs_work: 0,
  almost: 0,
  completion_rate: 0
};

/**
 * Helper to apply the cascading academic filters to a count query.
 */
function applyFilters(query: any, params: GetOnboardingStatsParams) {
  if (params.institution_id) query = query.eq('institution_id', params.institution_id);
  if (params.degree_id) query = query.eq('degree_id', params.degree_id);
  if (params.department_id) query = query.eq('department_id', params.department_id);
  if (params.program_id) query = query.eq('program_id', params.program_id);
  if (params.semester_id) query = query.eq('semester_id', params.semester_id);
  if (params.section_id) query = query.eq('section_id', params.section_id);
  if (params.academic_year_id) query = query.eq('academic_year_id', params.academic_year_id);
  return query;
}

export async function getOnboardingStats(
  params: GetOnboardingStatsParams = {}
): Promise<OnboardingStats> {
  try {
    const supabase = await createClient();

    // Build 6 count queries — total, complete, and per-tier counts approximated
    // by counting incomplete profiles with N nullable academic fields missing.
    //
    // Counting tier-by-tier in pure PostgREST would require 15 OR-combos. For
    // a clean implementation we use one "incomplete with X field missing"
    // count and back-compute tier sizes from those. Trade-off: the 4 missing
    // field counts overlap (a profile with 3 missing fields contributes to 3
    // separate "field-missing" counts), so we use a different strategy.
    //
    // STRATEGY: Fetch only the 4 nullable columns for all incomplete rows
    // (small payload), then compute tiers in JS. Same approach as the listing
    // fetcher; trades 1 round trip for accurate tier math without a generated
    // column or SQL function.

    let dataQuery = supabase
      .from('learners_profiles')
      .select('college_email, academic_year_id, semester_id, section_id')
      .or('is_profile_complete.eq.false,is_profile_complete.is.null')
      .limit(10000); // safety cap — institutions should rarely exceed this

    dataQuery = applyFilters(dataQuery, params);

    let totalQuery = supabase
      .from('learners_profiles')
      .select('*', { count: 'exact', head: true });
    totalQuery = applyFilters(totalQuery, params);

    let completeQuery = supabase
      .from('learners_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_profile_complete', true);
    completeQuery = applyFilters(completeQuery, params);

    const [
      { data: incompleteRows, error: incErr },
      { count: totalCount, error: totErr },
      { count: completeCount, error: compErr }
    ] = await Promise.all([dataQuery, totalQuery, completeQuery]);

    if (incErr || totErr || compErr) {
      console.error('[getOnboardingStats] Query error:', incErr || totErr || compErr);
      return EMPTY_STATS;
    }

    let critical = 0;
    let needs_work = 0;
    let almost = 0;

    for (const row of incompleteRows || []) {
      let missing = 0;
      if (!row.college_email) missing++;
      if (!row.academic_year_id) missing++;
      if (!row.semester_id) missing++;
      if (!row.section_id) missing++;

      if (missing === 0) continue; // stale flag, not actually incomplete
      const filled = 4 - missing;
      if (filled <= 1) critical++;
      else if (filled === 2) needs_work++;
      else almost++;
    }

    const total_incomplete = critical + needs_work + almost;
    const completion_rate =
      totalCount && totalCount > 0
        ? Math.round(((completeCount || 0) / totalCount) * 100)
        : 0;

    return {
      total_incomplete,
      critical,
      needs_work,
      almost,
      completion_rate
    };
  } catch (error) {
    console.error('[getOnboardingStats] Unexpected error:', error);
    return EMPTY_STATS;
  }
}
