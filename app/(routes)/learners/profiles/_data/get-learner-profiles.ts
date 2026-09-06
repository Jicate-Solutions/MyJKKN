/**
 * Server-side data fetching for Learner Profiles
 *
 * This is a cached server function that fetches learner profiles data.
 * Used by the server component to pre-render data on the server.
 */

import { createClient } from '@/lib/supabase/server';
import { buildLearnerSearchConditions } from '@/lib/utils/learner-search';
import { resolveAdmissionYearIds } from '@/lib/utils/admission-year-filter';

import type { LearnerProfile, LifecycleStatus } from '@/types/learner-profile';

interface GetLearnerProfilesParams {
  page?: number;
  limit?: number;
  search?: string;
  search_case_sensitive?: boolean;
  search_exact_match?: boolean;
  search_fields?: string[];
  // An ARRAY on the "All Statuses" tab — that tab is the union of the other
  // tabs, not the absence of a status predicate. See lifecycleFilterForTab.
  lifecycle_status?: LifecycleStatus | LifecycleStatus[];
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
  /**
   * Calendar admission year (e.g. 2026), NOT an admission_years row id — that
   * table is institution-scoped and holds eleven separate "2026" rows.
   * Resolved to ids before the query runs; see resolveAdmissionYearIds.
   */
  admission_year?: number;
  gender?: string;
  is_profile_complete?: boolean;
  /** accommodation_types.id — the FK the row is actually stored against. */
  accommodation_type_id?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  learner_id?: string; // Added: Filter by specific learner ID (for students viewing own profile)
}

interface GetLearnerProfilesResult {
  data: LearnerProfile[];
  metadata: {
    total_items: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

// Whitelist of valid sortable columns to prevent DB errors from URL tampering
const VALID_SORT_COLUMNS = new Set([
  'first_name', 'last_name', 'roll_number', 'register_number',
  'college_email', 'student_email', 'created_at', 'updated_at',
]);

const EMPTY_RESULT: GetLearnerProfilesResult = {
  data: [],
  metadata: { total_items: 0, page: 1, limit: 10, total_pages: 0 },
};

// Only the relations `_components/columns.tsx` actually renders.
//
// Every embed is a per-row lookup that re-evaluates the joined table's own RLS
// policies, and those policies call SECURITY DEFINER functions (is_super_admin /
// is_admin / user_has_permission / api_key_has_permission) once per row rather
// than once per query. Measured at pageSize=50: the same query costs 75ms with
// RLS bypassed vs 1,920ms under RLS, and each embed adds ~140ms.
// degree / department / academic_year / regulation / batch were fetched but
// never rendered — the detail view (get-learner-profile.ts), the export dialog
// (LearnerProfileService) and the promotion page all fetch their own data, so
// nothing downstream reads them from this payload.
const LIST_SELECT = `
  *,
  institution:institutions(id, name, counselling_code),
  program:programs(id, program_name),
  semester:semesters(id, semester_name, semester_code),
  section:sections(id, section_name),
  admission_year_obj:admission_years!admission_year_id(id, admission_year_name, year)
`;

/**
 * Apply every filter to a query builder.
 *
 * Shared by the page query and the count fallback ON PURPOSE: these were two
 * hand-maintained copies of the same twelve predicates, which is exactly how a
 * filter silently stops applying to one of them. A previous copy-pasted version
 * omitted `learner_id`, which made a student's `total_items` count every profile
 * they could see instead of just their own row.
 */
function applyLearnerFilters<T>(
  query: T,
  params: GetLearnerProfilesParams,
  // Pre-resolved by the caller because this function is SYNCHRONOUS and is
  // shared with the count fallback — resolving inside it would either make it
  // async (rippling into both call sites) or run the lookup twice. `null` means
  // the filter is not active; an empty array means it is active and matched
  // nothing visible, which must still narrow the query to zero rows.
  admissionYearIds: string[] | null = null
): T {
  const {
    search,
    search_case_sensitive,
    search_exact_match,
    search_fields,
    lifecycle_status,
    institution_id,
    degree_id,
    department_id,
    program_id,
    semester_id,
    section_id,
    academic_year_id,
    gender,
    is_profile_complete,
    accommodation_type_id,
    learner_id,
  } = params;

  let q = query as any;

  if (search) {
    const searchConditions = buildLearnerSearchConditions(search, {
      caseSensitive: search_case_sensitive,
      exactMatch: search_exact_match,
      searchFields: search_fields,
    });
    if (searchConditions.length > 0) {
      q = q.or(searchConditions.join(','));
    }
  }

  if (lifecycle_status) {
    q = Array.isArray(lifecycle_status)
      ? q.in('lifecycle_status', lifecycle_status)
      : q.eq('lifecycle_status', lifecycle_status);
  }
  if (institution_id) q = q.eq('institution_id', institution_id);

  // Student self-view filter (highest priority - students can only see own profile)
  if (learner_id) q = q.eq('id', learner_id);

  if (degree_id) q = q.eq('degree_id', degree_id);
  if (department_id) q = q.eq('department_id', department_id);
  if (program_id) q = q.eq('program_id', program_id);
  if (semester_id) q = q.eq('semester_id', semester_id);
  if (section_id) q = q.eq('section_id', section_id);
  if (academic_year_id) q = q.eq('academic_year_id', academic_year_id);

  // Admission year (cohort). Distinct from academic_year_id above: that one is
  // the term the learner is enrolled in NOW, this one is the year they joined.
  // Matched against the full set of row ids for the chosen calendar year, so it
  // spans institutions instead of silently picking one.
  if (admissionYearIds) q = q.in('admission_year_id', admissionYearIds);

  // gender is stored upper-case ('MALE' / 'FEMALE') but has been written in
  // mixed case by older forms. Match case-insensitively so the filter can never
  // again silently return zero rows because the dropdown said 'Male'.
  // There is no index on gender and the table is ~4k rows, so ilike costs nothing.
  if (gender) q = q.ilike('gender', gender);

  // Matched on the FK, never on learners_profiles.accommodation_type. That TEXT
  // column is RETIRED: LearnerProfileService derives it back onto the row for
  // legacy readers via accommodationLegacyFromCode(), so it is a computed
  // display value here and not a stored one. Filtering on it would compare
  // against a column the database does not maintain — the silent-zero-rows
  // failure this page keeps producing (cf. the gender case-sensitivity note
  // directly above).
  if (accommodation_type_id) {
    q = q.eq('accommodation_type_id', accommodation_type_id);
  }

  if (is_profile_complete !== undefined) {
    if (is_profile_complete === false) {
      // Include both explicit false AND null values (treat null as incomplete)
      q = q.or('is_profile_complete.eq.false,is_profile_complete.is.null');
    } else {
      q = q.eq('is_profile_complete', true);
    }
  }

  return q as T;
}

/**
 * Get learner profiles with server-side caching
 *
 * Cache Strategy: WARM (5 minutes TTL)
 * - Student data changes moderately (several times per hour)
 * - Balance between freshness and performance
 * - Cache tags allow targeted invalidation when profiles are created/updated/deleted
 */
export async function getLearnerProfiles(
  params: GetLearnerProfilesParams = {}
): Promise<GetLearnerProfilesResult> {
  try {
    // Debug: Log all filter params received
    if (process.env.NODE_ENV === 'development') {
      const activeFilters = Object.entries(params).filter(
        ([_, v]) => v !== undefined && v !== null
      );
      console.log(
        '[getLearnerProfiles] Filters received:',
        Object.fromEntries(activeFilters)
      );
    }

    const supabase = await createClient();

    const {
      page = 1,
      limit = 10,
      sortBy: rawSortBy = 'first_name',
      sortOrder = 'asc',
    } = params;

    // Validate sortBy against whitelist to prevent DB errors from URL tampering
    const sortBy = VALID_SORT_COLUMNS.has(rawSortBy) ? rawSortBy : 'first_name';

    // Resolved ONCE, here, rather than inside applyLearnerFilters: that helper
    // is synchronous and is called again by the PGRST103 count fallback below,
    // so resolving inside it would run this lookup twice per request.
    const admissionYearIds = params.admission_year
      ? await resolveAdmissionYearIds(supabase, params.admission_year)
      : null;

    const pageQuery = (targetPage: number) =>
      applyLearnerFilters(
        supabase
          .from('learners_profiles')
          .select(LIST_SELECT, { count: 'exact' }),
        params,
        admissionYearIds
      )
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range((targetPage - 1) * limit, targetPage * limit - 1);

    let effectivePage = page;
    let { data, error, count } = await pageQuery(effectivePage);

    let total = count ?? 0;

    if (error) {
      // PGRST103: "Requested range not satisfiable" - happens when offset > total
      // rows, e.g. the user is on page 6 and a filter cuts the result to 1 page.
      // The row count does not come back with this error, so this is the ONE case
      // that still needs a dedicated count round-trip. The happy path uses the
      // count returned by the query above instead of re-counting every time.
      if (error.code === 'PGRST103') {
        const { count: fallbackCount, error: countError } =
          await applyLearnerFilters(
            supabase
              .from('learners_profiles')
              .select('id', { count: 'exact', head: true }),
            params,
            admissionYearIds
          );

        if (countError) {
          console.error('[getLearnerProfiles] Error fetching count:', countError);
        }
        total = fallbackCount ?? 0;

        // Clamp to the last page that actually exists and REFETCH, rather than
        // returning [] alongside a non-zero count. Returning both is what made
        // this look like a broken filter: the table rendered "No results" while
        // the pager underneath it read "435 items", so the user concluded the
        // filters had matched nothing when they had in fact matched 435 rows and
        // only the stale page offset was out of range.
        const lastPage = total > 0 ? Math.ceil(total / limit) : 1;
        if (total > 0 && effectivePage > lastPage) {
          console.warn(
            `[getLearnerProfiles] page ${effectivePage} exceeds ${lastPage} page(s) for the current filters; serving page ${lastPage}`
          );
          effectivePage = lastPage;
          const retry = await pageQuery(effectivePage);
          if (retry.error) {
            console.error(
              '[getLearnerProfiles] Clamped refetch failed:',
              retry.error
            );
          } else {
            data = retry.data;
            total = retry.count ?? total;
          }
        }
      } else {
        // Surface the Postgres/PostgREST code — Supabase errors are plain
        // objects, so a bare `error.message` drops the code that identifies the
        // failure (57014 timeout, 22P02 bad enum/uuid, 42501 RLS).
        console.error('[getLearnerProfiles] Error fetching profiles:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw new Error(
          `Failed to fetch learner profiles: ${error.message} (${error.code})`
        );
      }
    }

    return {
      data: (data as LearnerProfile[]) || [],
      metadata: {
        total_items: total,
        page: effectivePage,
        limit,
        total_pages: total ? Math.ceil(total / limit) : 0,
      },
    };
  } catch (error) {
    console.error(
      '[getLearnerProfiles] Unexpected error, returning empty result:',
      error
    );
    return EMPTY_RESULT;
  }
}
