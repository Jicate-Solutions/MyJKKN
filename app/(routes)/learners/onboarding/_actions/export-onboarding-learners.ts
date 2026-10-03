'use server';

/**
 * Every row of one onboarding tier under the current filters — the data behind
 * the table's "Export All" action.
 *
 * The table's own fetchDataFn only ever holds the server-rendered page, so
 * paging through it would export page N copies of the same rows. This goes
 * back to the fetcher instead, which already loads the whole tier (capped at
 * its 5000-row scanLimit) before slicing a page — so asking for one page as
 * big as the scan costs no extra query.
 *
 * Runs on the caller's session client: RLS scopes the export exactly as it
 * scopes the table.
 */

import { getOnboardingLearners } from '../_data/get-onboarding-learners';
import {
  onboardingQueryFromParams,
  type OnboardingRawSearchParams
} from '../_data/onboarding-query-from-params';
import type { OnboardingProfileRow, OnboardingTier } from '@/types/learner-onboarding';
import { onboardingTierSchema } from '../_components/data-table-schema';

const EXPORT_LIMIT = 5000;

export async function exportOnboardingLearners(
  searchParams: OnboardingRawSearchParams,
  tier: OnboardingTier
): Promise<OnboardingProfileRow[]> {
  const { data } = await getOnboardingLearners({
    ...onboardingQueryFromParams(searchParams),
    tier: onboardingTierSchema.parse(tier) ?? 'all',
    page: 1,
    limit: EXPORT_LIMIT,
    scanLimit: EXPORT_LIMIT
  });
  return data;
}
