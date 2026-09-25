/**
 * URL search params → getOnboardingLearners params.
 *
 * Shared by the tab (OnboardingContent) and the Awaiting Payment export so an
 * exported report is filtered, scoped and sorted exactly like the screen it was
 * exported from. Two copies of this parsing would drift, and a report that
 * quietly disagrees with the table is worse than no report.
 */

import { onboardingAdmissionYearSchema } from '../_components/data-table-schema';
import type { getOnboardingLearners } from './get-onboarding-learners';
import type { OnboardingTier, MissingField } from '@/types/learner-onboarding';
import { isBlockedReason, isOnboardingStatus } from '@/types/learner-onboarding';

export type OnboardingSearchParamsRecord = {
  [key: string]: string | string[] | undefined;
};

export type OnboardingLoaderParams = NonNullable<Parameters<typeof getOnboardingLearners>[0]>;

export function parseOnboardingParams(
  searchParams: OnboardingSearchParamsRecord,
  tier: OnboardingTier
): OnboardingLoaderParams {
  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.pageSize) || Number(searchParams.limit) || 25;
  const search = (searchParams.search as string) || undefined;
  const search_case_sensitive = searchParams.search_case_sensitive
    ? searchParams.search_case_sensitive === 'true'
    : undefined;
  const search_exact_match = searchParams.search_exact_match
    ? searchParams.search_exact_match === 'true'
    : undefined;
  const search_fields = (searchParams.search_fields as string | undefined)
    ? (searchParams.search_fields as string)
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)
    : undefined;

  // Parsed, not cast: a non-numeric ?admission_year= must mean "all cohorts",
  // never reach the id resolver as NaN and empty the table.
  const admission_year = onboardingAdmissionYearSchema.parse(searchParams.admission_year);
  // Guarded, not cast: an out-of-range ?lifecycle_status must mean "all",
  // never reach `.in()` verbatim and silently return an empty table.
  const rawStatus = searchParams.lifecycle_status;
  const lifecycle_status = isOnboardingStatus(rawStatus) ? rawStatus : undefined;
  // Only meaningful on Awaiting Payment; ignored elsewhere so a stale URL
  // param cannot empty another tab.
  const blocked_reason =
    tier === 'awaiting_payment' && isBlockedReason(searchParams.blocked_reason)
      ? searchParams.blocked_reason
      : undefined;

  return {
    page,
    limit,
    search,
    search_case_sensitive,
    search_exact_match,
    search_fields,
    tier,
    missing_field: (searchParams.missing_field as MissingField | undefined) || undefined,
    lifecycle_status,
    blocked_reason,
    institution_id: (searchParams.institution_id as string) || undefined,
    degree_id: (searchParams.degree_id as string) || undefined,
    department_id: (searchParams.department_id as string) || undefined,
    program_id: (searchParams.program_id as string) || undefined,
    semester_id: (searchParams.semester_id as string) || undefined,
    section_id: (searchParams.section_id as string) || undefined,
    academic_year_id: (searchParams.academic_year_id as string) || undefined,
    admission_year,
    gender: (searchParams.gender as string) || undefined,
    accommodation_type_id: (searchParams.accommodation_type_id as string) || undefined,
    // Passed through verbatim: the fetcher decides whether the key is a
    // database column or one of the fee keys it sorts in JS, and falls back
    // safely either way.
    sortBy: (searchParams.sort_by as string) || 'first_name',
    sortOrder: (searchParams.sort_order as 'asc' | 'desc') || 'asc'
  };
}
