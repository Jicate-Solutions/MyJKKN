/**
 * Server component that fetches the onboarding learner list for a given tier
 * and hands it to the client-side table for rendering + interaction.
 *
 * One instance is mounted per TabsContent boundary so each tier's data is
 * fetched in parallel via Suspense.
 */

import { OnboardingTableServer } from './onboarding-table-server';
import { getOnboardingLearners } from '../_data/get-onboarding-learners';
import {
  parseOnboardingParams,
  type OnboardingSearchParamsRecord
} from '../_data/parse-onboarding-params';
import type { OnboardingTier } from '@/types/learner-onboarding';

interface OnboardingContentProps {
  searchParams: OnboardingSearchParamsRecord;
  tier: OnboardingTier;
}

export async function OnboardingContent({ searchParams, tier }: OnboardingContentProps) {
  const { data, metadata, paymentSummary } = await getOnboardingLearners(
    parseOnboardingParams(searchParams, tier)
  );

  return (
    <OnboardingTableServer
      initialData={data}
      metadata={metadata}
      tier={tier}
      paymentSummary={paymentSummary}
    />
  );
}
