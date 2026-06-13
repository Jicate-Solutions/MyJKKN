/**
 * Server-side data fetching for the Learner Onboarding page.
 *
 * Returns incomplete-profile learners with missing-field metadata, optionally
 * narrowed by severity tier (critical / needs_work / almost) and the same
 * cascading filters as /learners/profiles.
 *
 * Strategy:
 *   1. SQL applies all filters EXCEPT tier (institution → section, gender, search).
 *   2. JS enriches each row with computed missing_fields + tier.
 *   3. JS applies the tier filter and paginates.
 *
 * Stale `is_profile_complete = false` flags (where all 4 fields are actually
 * present) are auto-corrected in the background, mirroring the analytics API
 * at app/api/learners/analytics/incomplete-profiles/route.ts:138-151.
 */

import { createClient } from '@/lib/supabase/server';
import { buildLearnerSearchConditions } from '@/lib/utils/learner-search';
import type { LearnerProfile } from '@/types/learner-profile';
import type {
  OnboardingProfileRow,
  OnboardingTier,
  MissingField
} from '@/types/learner-onboarding';
import {
  computeMissingFields,
  tierFromFilledCount,
  MISSING_FIELD_LABELS
} from '@/types/learner-onboarding';

interface GetOnboardingLearnersParams {
  page?: number;
  limit?: number;
  search?: string;
  search_case_sensitive?: boolean;
  search_exact_match?: boolean;
  search_fields?: string[];
  tier?: OnboardingTier;
  missing_field?: MissingField;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
  gender?: string;
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

const EMPTY_RESULT: GetOnboardingLearnersResult = {
  data: [],
  metadata: { total_items: 0, page: 1, limit: 10, total_pages: 0 }
};

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
      institution_id,
      degree_id,
      department_id,
      program_id,
      semester_id,
      section_id,
      academic_year_id,
      gender,
      sortBy: rawSortBy = 'first_name',
      sortOrder = 'asc',
      scanLimit = 5000
    } = params;

    const sortBy = VALID_SORT_COLUMNS.has(rawSortBy) ? rawSortBy : 'first_name';

    // 2026-05-20: Scope the onboarding workspace to learners who have crossed
    // the fees threshold (lifecycle_status='admitted'). They're the cohort that
    // needs academic-assignment fields filled before LearnerProfileService
    // auto-activates them to 'active'. Other statuses with stale completion
    // flags (legacy 'active' rows) are handled by the auto-correction at the
    // bottom of this function rather than surfacing in the triage workspace.
    let query = supabase
      .from('learners_profiles')
      .select(
        `
        *,
        institution:institutions(id, name, counselling_code),
        degree:degrees(id, degree_name, degree_id),
        department:departments(id, department_name),
        program:programs(id, program_name),
        semester:semesters(id, semester_name, semester_code),
        section:sections(id, section_name),
        academic_year:academic_years(id, academic_year_name, start_date, end_date, is_active),
        regulation:regulations(id, regulation_code, regulation_year),
        batch:batches(id, batch_name, batch_code),
        admission_year_obj:admission_years!admission_year_id(id, admission_year_name, year)
      `
      )
      .eq('lifecycle_status', 'admitted')
      .or('is_profile_complete.eq.false,is_profile_complete.is.null');

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

    const staleIds: string[] = [];
    const enriched: OnboardingProfileRow[] = [];

    for (const row of (data || []) as LearnerProfile[]) {
      const missing = computeMissingFields(row);
      if (missing.length === 0) {
        staleIds.push(row.id);
        continue;
      }
      const filled = 4 - missing.length;
      enriched.push({
        ...row,
        missing_fields: missing,
        missing_field_labels: missing.map((m) => MISSING_FIELD_LABELS[m]),
        missing_count: missing.length,
        filled_count: filled,
        completion_percent: Math.round((filled / 4) * 100),
        tier: tierFromFilledCount(filled)
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

    const tierFiltered = tier === 'all' ? enriched : enriched.filter((r) => r.tier === tier);

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
      }
    };
  } catch (error) {
    console.error('[getOnboardingLearners] Unexpected error:', error);
    return EMPTY_RESULT;
  }
}
