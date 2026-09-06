/**
 * Server-side data fetching for the Learner Onboarding page.
 *
 * Returns pre-active learners (reserved + admitted) with missing-field metadata,
 * optionally narrowed by tier and the same cascading filters as
 * /learners/profiles.
 *
 * Strategy:
 *   1. SQL applies all filters EXCEPT tier (status, institution → section,
 *      gender, search).
 *   2. JS enriches each row with computed missing_fields + tier + activation
 *      eligibility.
 *   3. JS applies the tier filter and paginates.
 *
 * Tier is derived from the four required columns on every request — never read
 * from `is_profile_complete`. Stale flags are repaired in the background
 * instead, mirroring the analytics API at
 * app/api/learners/analytics/incomplete-profiles/route.ts:138-151.
 */

import { createClient } from '@/lib/supabase/server';
import { buildLearnerSearchConditions } from '@/lib/utils/learner-search';
import type { LearnerProfile } from '@/types/learner-profile';
import type {
  OnboardingProfileRow,
  OnboardingTier,
  OnboardingStatus,
  OnboardingPaymentSummary,
  MissingField
} from '@/types/learner-onboarding';
import {
  computeMissingFields,
  resolveOnboardingTier,
  activationBlockedReason,
  summarisePaymentProgress,
  ONBOARDING_STATUSES,
  INCOMPLETE_TIERS,
  MISSING_FIELD_LABELS
} from '@/types/learner-onboarding';
import { getOnboardingPaymentProgress } from './get-onboarding-payment-progress';
import { resolveAdmissionYearIds } from './resolve-admission-year-ids';

interface GetOnboardingLearnersParams {
  page?: number;
  limit?: number;
  search?: string;
  search_case_sensitive?: boolean;
  search_exact_match?: boolean;
  search_fields?: string[];
  tier?: OnboardingTier;
  missing_field?: MissingField;
  /** Narrow to one onboarding status; omit to include both reserved + admitted. */
  lifecycle_status?: OnboardingStatus;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
  /** Admission cohort as the integer year — expanded to ids, see the note below. */
  admission_year?: number;
  gender?: string;
  accommodation_type_id?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /**
   * Hard cap on rows fetched before in-memory tier filtering. Prevents OOM if
   * an institution accidentally has tens of thousands of incomplete profiles.
   */
  scanLimit?: number;
}

interface GetOnboardingLearnersResult {
  data: OnboardingProfileRow[];
  metadata: {
    total_items: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  /**
   * Cohort fee position. Present only for the `awaiting_payment` tier, and
   * rolled up from the WHOLE tier rather than the current page — a banner that
   * silently reported page 1's totals would be read as the cohort's.
   */
  paymentSummary?: OnboardingPaymentSummary;
}

const VALID_SORT_COLUMNS = new Set([
  'first_name',
  'last_name',
  'roll_number',
  'register_number',
  'college_email',
  'student_email',
  'created_at',
  'updated_at'
]);

/**
 * Sort keys that live in the payment RPC, not in learners_profiles.
 *
 * These cannot go into the SQL ORDER BY, so they are applied in JS after the
 * fee data is attached — which is only possible because the fee fetch covers
 * the whole tier, not just the page. `amount_to_threshold` ascending is the
 * operationally useful one: it queues the learners closest to admission first.
 */
const PAYMENT_SORT_COLUMNS = new Set([
  'amount_to_threshold',
  'achieved_pct',
  'basis_balance'
]);

const EMPTY_RESULT: GetOnboardingLearnersResult = {
  data: [],
  metadata: { total_items: 0, page: 1, limit: 10, total_pages: 0 }
};

/**
 * Pull one payment sort key off a row, or null when fee data is unavailable.
 * Null (not 0) is deliberate — see the sort comparator's comment.
 */
function readPaymentSortValue(row: OnboardingProfileRow, key: string): number | null {
  const p = row.payment;
  if (!p) return null;
  switch (key) {
    case 'amount_to_threshold':
      return p.amount_to_threshold;
    case 'achieved_pct':
      return p.achieved_pct;
    case 'basis_balance':
      return p.basis_balance;
    default:
      return null;
  }
}

export async function getOnboardingLearners(
  params: GetOnboardingLearnersParams = {}
): Promise<GetOnboardingLearnersResult> {
  try {
    const supabase = await createClient();

    const {
      page = 1,
      limit = 10,
      search,
      search_case_sensitive,
      search_exact_match,
      search_fields,
      tier = 'all',
      missing_field,
      lifecycle_status,
      institution_id,
      degree_id,
      department_id,
      program_id,
      semester_id,
      section_id,
      academic_year_id,
      admission_year,
      gender,
      accommodation_type_id,
      sortBy: rawSortBy = 'first_name',
      sortOrder = 'asc',
      scanLimit = 5000
    } = params;

    // A payment sort key is legal but not a database column: fall back to a
    // stable SQL order and re-sort in JS once the fee data lands.
    const paymentSortBy = PAYMENT_SORT_COLUMNS.has(rawSortBy) ? rawSortBy : undefined;
    const sortBy = VALID_SORT_COLUMNS.has(rawSortBy) ? rawSortBy : 'first_name';

    // 2026-08-10: The workspace covers BOTH pre-active statuses.
    //
    //   'reserved' — universal fees (application + university) paid
    //   'admitted' — balance fees cleared the configured threshold
    //
    // It used to be 'admitted' alone, which hid 673 of the 761 learners who
    // actually need these fields filled. Widening the queue does NOT widen the
    // fee gate: only 'admitted' rows land in the `ready_to_activate` tier, and
    // LearnerProfileService.activateIfReady refuses 'reserved' outright.
    //
    // The `is_profile_complete` predicate is deliberately GONE. That flag drifts
    // (the staleIds auto-correction below exists because of it — ~20 reserved
    // rows are flagged incomplete while holding all four fields), and the two
    // terminal tiers need the complete rows anyway. Tier is now derived from the
    // four real columns every time, so the flag is an output, never an input.
    //
    // Embeds are limited to what columns.tsx renders (institution, program,
    // admission_year_obj). Each embed re-evaluates the joined table's RLS ONCE
    // PER ROW — measured at ~140ms per embed per 50 rows (see the note in
    // profiles/_data/get-learner-profiles.ts). The seven unused embeds that used
    // to be here cost nothing at 88 rows and would have been a timeout risk at
    // ~994.
    let query = supabase
      .from('learners_profiles')
      .select(
        `
        *,
        institution:institutions(id, name, counselling_code),
        program:programs(id, program_name),
        admission_year_obj:admission_years!admission_year_id(id, admission_year_name, year)
      `
      )
      .in('lifecycle_status', lifecycle_status ? [lifecycle_status] : [...ONBOARDING_STATUSES]);

    if (search) {
      const searchConditions = buildLearnerSearchConditions(search, {
        caseSensitive: search_case_sensitive,
        exactMatch: search_exact_match,
        searchFields: search_fields
      });
      if (searchConditions.length > 0) {
        query = query.or(searchConditions.join(','));
      }
    }

    if (institution_id) query = query.eq('institution_id', institution_id);
    if (degree_id) query = query.eq('degree_id', degree_id);
    if (department_id) query = query.eq('department_id', department_id);
    if (program_id) query = query.eq('program_id', program_id);
    if (semester_id) query = query.eq('semester_id', semester_id);
    if (section_id) query = query.eq('section_id', section_id);
    if (academic_year_id) query = query.eq('academic_year_id', academic_year_id);
    if (gender) query = query.eq('gender', gender);
    if (accommodation_type_id)
      query = query.eq('accommodation_type_id', accommodation_type_id);

    // Cohort filter. The year is one uuid PER INSTITUTION, so it is expanded to
    // the full id set and matched with `.in()`. Resolving to nothing means the
    // cohort is invisible to this role (or does not exist) — return empty
    // rather than silently dropping the filter and showing every cohort.
    if (admission_year) {
      const admissionYearIds = await resolveAdmissionYearIds(supabase, admission_year);
      if (admissionYearIds.length === 0) {
        return { data: [], metadata: { total_items: 0, page, limit, total_pages: 0 } };
      }
      query = query.in('admission_year_id', admissionYearIds);
    }

    if (missing_field === 'college_email') {
      query = query.or('college_email.is.null,college_email.eq.');
    } else if (missing_field) {
      query = query.is(missing_field, null);
    }

    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    query = query.limit(scanLimit);

    const { data, error } = await query;

    if (error) {
      console.error('[getOnboardingLearners] Query error:', error);
      return EMPTY_RESULT;
    }

    // Rows whose four fields are all set but whose flag still says otherwise.
    // They are NO LONGER dropped — they belong in a terminal tier — but the flag
    // is still repaired so every other consumer of is_profile_complete agrees.
    const staleIds: string[] = [];
    const enriched: OnboardingProfileRow[] = [];

    for (const row of (data || []) as LearnerProfile[]) {
      const missing = computeMissingFields(row);
      const filled = 4 - missing.length;

      if (missing.length === 0 && row.is_profile_complete !== true) {
        staleIds.push(row.id);
      }

      const blockedReason = activationBlockedReason(row, missing.length);
      enriched.push({
        ...row,
        missing_fields: missing,
        missing_field_labels: missing.map((m) => MISSING_FIELD_LABELS[m]),
        missing_count: missing.length,
        filled_count: filled,
        completion_percent: Math.round((filled / 4) * 100),
        tier: resolveOnboardingTier(filled, row.lifecycle_status),
        can_activate: !blockedReason,
        activation_blocked_reason: blockedReason
      });
    }

    if (staleIds.length > 0) {
      void supabase
        .from('learners_profiles')
        .update({ is_profile_complete: true, updated_at: new Date().toISOString() })
        .in('id', staleIds)
        .then(({ error: fixError }) => {
          if (fixError) {
            console.error('[getOnboardingLearners] auto-fix stale flags failed:', fixError);
          } else {
            console.log(`[getOnboardingLearners] auto-fixed ${staleIds.length} stale flags`);
          }
        });
    }

    // 'all' keeps its original meaning — the three INCOMPLETE tiers. The two
    // terminal tiers are reachable only by selecting them, so the default view
    // stays the triage queue it has always been.
    const tierFiltered =
      tier === 'all'
        ? enriched.filter((r) => (INCOMPLETE_TIERS as readonly string[]).includes(r.tier))
        : enriched.filter((r) => r.tier === tier);

    // ── Fee position, for the Awaiting Payment tier only ────────────────────
    //
    // Every row in that tier has all four fields and is 'reserved', i.e. money
    // is the ONLY thing still holding it back — so "Missing Fields" is always
    // blank there and "Completion" always 4/4. Those two columns are replaced
    // by the fee columns this block feeds. No other tier renders them, and
    // fetching there would buy a round trip for a number nothing displays.
    //
    // Fetched for the WHOLE tier, before pagination, for two reasons: the
    // banner must total the cohort rather than page 1, and sorting by "closest
    // to admission" is impossible on a page-sized slice. The RPC's predicate
    // pushes down to an index scan per learner, so ~207 ids costs single-digit
    // milliseconds.
    let paymentSummary: OnboardingPaymentSummary | undefined;

    if (tier === 'awaiting_payment' && tierFiltered.length > 0) {
      const progress = await getOnboardingPaymentProgress(tierFiltered.map((r) => r.id));

      for (const row of tierFiltered) {
        row.payment = progress.get(row.id);
      }

      paymentSummary = summarisePaymentProgress([...progress.values()]);

      if (paymentSortBy) {
        // Rows the RPC could not resolve (permission-filtered, or beyond the id
        // cap) sort last in both directions rather than colliding at 0 — a
        // learner with unknown fees is not a learner who owes nothing.
        const dir = sortOrder === 'desc' ? -1 : 1;
        tierFiltered.sort((a, b) => {
          const av = readPaymentSortValue(a, paymentSortBy);
          const bv = readPaymentSortValue(b, paymentSortBy);
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return (av - bv) * dir;
        });
      }
    }

    const total_items = tierFiltered.length;
    const total_pages = Math.ceil(total_items / limit);
    const from = (page - 1) * limit;
    const paginated = tierFiltered.slice(from, from + limit);

    return {
      data: paginated,
      metadata: {
        total_items,
        page,
        limit,
        total_pages
      },
      paymentSummary
    };
  } catch (error) {
    console.error('[getOnboardingLearners] Unexpected error:', error);
    return EMPTY_RESULT;
  }
}
