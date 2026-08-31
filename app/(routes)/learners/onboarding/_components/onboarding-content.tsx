/**
 * Server component that fetches the onboarding learner list for a given tier
 * and hands it to the client-side table for rendering + interaction.
 *
 * One instance is mounted per TabsContent boundary so each tier's data is
 * fetched in parallel via Suspense.
 */

import { OnboardingTableServer } from './onboarding-table-server';
import { onboardingAdmissionYearSchema } from './data-table-schema';
import { getOnboardingLearners } from '../_data/get-onboarding-learners';
import type { OnboardingTier, MissingField } from '@/types/learner-onboarding';
import { isOnboardingStatus } from '@/types/learner-onboarding';

interface OnboardingContentProps {
  searchParams: {
    [key: string]: string | string[] | undefined;
  };
  tier: OnboardingTier;
}

export async function OnboardingContent({ searchParams, tier }: OnboardingContentProps) {
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

  const institution_id = (searchParams.institution_id as string) || undefined;
  const degree_id = (searchParams.degree_id as string) || undefined;
  const department_id = (searchParams.department_id as string) || undefined;
  const program_id = (searchParams.program_id as string) || undefined;
  const semester_id = (searchParams.semester_id as string) || undefined;
  const section_id = (searchParams.section_id as string) || undefined;
  const academic_year_id = (searchParams.academic_year_id as string) || undefined;
  // Parsed, not cast: a non-numeric ?admission_year= must mean "all cohorts",
  // never reach the id resolver as NaN and empty the table.
  const admission_year = onboardingAdmissionYearSchema.parse(searchParams.admission_year);
  const gender = (searchParams.gender as string) || undefined;
  const accommodation_type_id = (searchParams.accommodation_type_id as string) || undefined;
  const missing_field = (searchParams.missing_field as MissingField | undefined) || undefined;
  // Guarded, not cast: an out-of-range ?lifecycle_status must mean "both",
  // never reach `.in()` verbatim and silently return an empty table.
  const rawStatus = searchParams.lifecycle_status;
  const lifecycle_status = isOnboardingStatus(rawStatus) ? rawStatus : undefined;
  // Passed through verbatim: the fetcher decides whether the key is a database
  // column or one of the fee keys it sorts in JS, and falls back safely either
  // way. Filtering the allow-list here as well would mean two places to update.
  const sortBy = (searchParams.sort_by as string) || 'first_name';
  const sortOrder = (searchParams.sort_order as 'asc' | 'desc') || 'asc';

  const { data, metadata, paymentSummary } = await getOnboardingLearners({
    page,
    limit,
    search,
    search_case_sensitive,
    search_exact_match,
    search_fields,
    tier,
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
    sortBy,
    sortOrder
  });

  return (
    <OnboardingTableServer
      initialData={data}
      metadata={metadata}
      tier={tier}
      paymentSummary={paymentSummary}
    />
  );
}
