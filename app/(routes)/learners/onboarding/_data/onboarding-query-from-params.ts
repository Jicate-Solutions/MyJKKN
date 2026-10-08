/**
 * URL search params → getOnboardingLearners arguments.
 *
 * Shared by the tier table (OnboardingContent) and the export action so an
 * export always covers exactly the rows the table is showing — one parser, not
 * two that drift apart the first time a filter is added.
 */

import { onboardingAdmissionYearSchema } from '../_components/data-table-schema';
import type { MissingField } from '@/types/learner-onboarding';
import { isOnboardingStatus } from '@/types/learner-onboarding';

export type OnboardingRawSearchParams = {
  [key: string]: string | string[] | undefined;
};

export function onboardingQueryFromParams(searchParams: OnboardingRawSearchParams) {
  const search_fields = (searchParams.search_fields as string | undefined)
    ? (searchParams.search_fields as string)
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)
    : undefined;

  // Guarded, not cast: an out-of-range ?lifecycle_status must mean "both",
  // never reach `.in()` verbatim and silently return an empty table.
  const rawStatus = searchParams.lifecycle_status;

  return {
    page: Number(searchParams.page) || 1,
    limit: Number(searchParams.pageSize) || Number(searchParams.limit) || 25,
    search: (searchParams.search as string) || undefined,
    search_case_sensitive: searchParams.search_case_sensitive
      ? searchParams.search_case_sensitive === 'true'
      : undefined,
    search_exact_match: searchParams.search_exact_match
      ? searchParams.search_exact_match === 'true'
      : undefined,
    search_fields,
    missing_field: (searchParams.missing_field as MissingField | undefined) || undefined,
    lifecycle_status: isOnboardingStatus(rawStatus) ? rawStatus : undefined,
    institution_id: (searchParams.institution_id as string) || undefined,
    degree_id: (searchParams.degree_id as string) || undefined,
    department_id: (searchParams.department_id as string) || undefined,
    program_id: (searchParams.program_id as string) || undefined,
    semester_id: (searchParams.semester_id as string) || undefined,
    section_id: (searchParams.section_id as string) || undefined,
    academic_year_id: (searchParams.academic_year_id as string) || undefined,
    // Parsed, not cast: a non-numeric ?admission_year= must mean "all cohorts",
    // never reach the id resolver as NaN and empty the table.
    admission_year: onboardingAdmissionYearSchema.parse(searchParams.admission_year),
    gender: (searchParams.gender as string) || undefined,
    accommodation_type_id: (searchParams.accommodation_type_id as string) || undefined,
    // Passed through verbatim: the fetcher decides whether the key is a database
    // column or one of the fee keys it sorts in JS, and falls back safely either
    // way. Filtering the allow-list here as well would mean two places to update.
    sortBy: (searchParams.sort_by as string) || 'first_name',
    sortOrder: (searchParams.sort_order as 'asc' | 'desc') || 'asc'
  };
}
