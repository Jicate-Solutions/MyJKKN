/**
 * Server-side stats fetcher for the Learner Onboarding KPI cards.
 *
 * Returns the five tier counts, the reserved/admitted split, and an overall
 * completion-rate percentage across the pre-active cohort.
 *
 * Implementation: ONE query over the five columns tiering depends on, with the
 * buckets computed in JS by the same `resolveOnboardingTier` the listing uses.
 * Sharing that function is the point — it is what guarantees the KPI cards and
 * the tier tabs can never disagree.
 */

import { createClient } from '@/lib/supabase/server';
import type { OnboardingStats, OnboardingStatus } from '@/types/learner-onboarding';
import { ONBOARDING_STATUSES, resolveOnboardingTier } from '@/types/learner-onboarding';
import { resolveAdmissionYearIds } from './resolve-admission-year-ids';

interface GetOnboardingStatsParams {
  lifecycle_status?: OnboardingStatus;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
  accommodation_type_id?: string;
  /** Admission cohort as the integer year — expanded to ids before querying. */
  admission_year?: number;
}

const EMPTY_STATS: OnboardingStats = {
  total_incomplete: 0,
  critical: 0,
  needs_work: 0,
  almost: 0,
  ready_to_activate: 0,
  awaiting_payment: 0,
  completion_rate: 0,
  reserved_total: 0,
  admitted_total: 0
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
  if (params.accommodation_type_id)
    query = query.eq('accommodation_type_id', params.accommodation_type_id);
  return query;
}

export async function getOnboardingStats(
  params: GetOnboardingStatsParams = {}
): Promise<OnboardingStats> {
  try {
    const supabase = await createClient();

    // ONE query, five narrow columns, tiers computed in JS.
    //
    // This replaced three round trips (rows + two `count: 'exact', head: true`
    // queries). The counts had to go regardless: they were derived from
    // `is_profile_complete`, and the listing fetcher no longer trusts that flag,
    // so the cards and the tabs would have disagreed with each other whenever it
    // drifted. Deriving every number from the same four columns the listing uses
    // is what keeps the card totals equal to the tab totals.
    //
    // Payload is ~994 rows of five small columns; the safety cap is far above
    // the real cohort.
    let dataQuery = supabase
      .from('learners_profiles')
      .select('lifecycle_status, college_email, academic_year_id, semester_id, section_id')
      .in(
        'lifecycle_status',
        params.lifecycle_status ? [params.lifecycle_status] : [...ONBOARDING_STATUSES]
      )
      .limit(10000);

    dataQuery = applyFilters(dataQuery, params);

    // Cohort filter — one uuid per institution, so the year expands to an id
    // set. Cards must narrow with the same filters as the table below them, or
    // the totals contradict the rows they are supposed to summarise.
    if (params.admission_year) {
      const admissionYearIds = await resolveAdmissionYearIds(supabase, params.admission_year);
      if (admissionYearIds.length === 0) return EMPTY_STATS;
      dataQuery = dataQuery.in('admission_year_id', admissionYearIds);
    }

    const { data: rows, error } = await dataQuery;

    if (error) {
      console.error('[getOnboardingStats] Query error:', error);
      return EMPTY_STATS;
    }

    let critical = 0;
    let needs_work = 0;
    let almost = 0;
    let ready_to_activate = 0;
    let awaiting_payment = 0;
    let reserved_total = 0;
    let admitted_total = 0;

    for (const row of rows || []) {
      if (row.lifecycle_status === 'reserved') reserved_total++;
      else if (row.lifecycle_status === 'admitted') admitted_total++;

      let missing = 0;
      if (!row.college_email) missing++;
      if (!row.academic_year_id) missing++;
      if (!row.semester_id) missing++;
      if (!row.section_id) missing++;

      switch (resolveOnboardingTier(4 - missing, row.lifecycle_status)) {
        case 'critical': critical++; break;
        case 'needs_work': needs_work++; break;
        case 'almost': almost++; break;
        case 'ready_to_activate': ready_to_activate++; break;
        case 'awaiting_payment': awaiting_payment++; break;
      }
    }

    const total_incomplete = critical + needs_work + almost;
    const cohort = total_incomplete + ready_to_activate + awaiting_payment;
    const completion_rate =
      cohort > 0 ? Math.round(((ready_to_activate + awaiting_payment) / cohort) * 100) : 0;

    return {
      total_incomplete,
      critical,
      needs_work,
      almost,
      ready_to_activate,
      awaiting_payment,
      completion_rate,
      reserved_total,
      admitted_total
    };
  } catch (error) {
    console.error('[getOnboardingStats] Unexpected error:', error);
    return EMPTY_STATS;
  }
}
