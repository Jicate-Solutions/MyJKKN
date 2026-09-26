'use server';

/**
 * Awaiting Payment export — the whole filtered tab, not the visible page.
 *
 * Authorization is the loader's: getOnboardingLearners runs on the caller's
 * request-scoped client, so learners_profiles RLS and the visibility predicate
 * inside fn_onboarding_payment_progress decide the rows. A user can therefore
 * only ever export what the tab already shows them — no new permission key,
 * and deliberately no service-role client.
 */

import { getOnboardingLearners } from '../_data/get-onboarding-learners';
import {
  parseOnboardingParams,
  type OnboardingSearchParamsRecord
} from '../_data/parse-onboarding-params';
import { buildReport, type AwaitingPaymentReport } from '@/lib/learners/onboarding/awaiting-payment-report';
import { BLOCKED_REASON_LABELS } from '@/types/learner-onboarding';

/** Same cap the loader's scan uses; far above the real tab (~170). */
const EXPORT_LIMIT = 5000;

export async function exportAwaitingPaymentReport(
  searchParams: OnboardingSearchParamsRecord
): Promise<AwaitingPaymentReport> {
  const params = parseOnboardingParams(searchParams, 'awaiting_payment');

  const { data, paymentSummary } = await getOnboardingLearners({
    ...params,
    page: 1,
    limit: EXPORT_LIMIT
  });

  const filters: string[] = [];
  if (params.lifecycle_status) filters.push(`Status: ${params.lifecycle_status}`);
  if (params.blocked_reason) filters.push(`Blocked at: ${BLOCKED_REASON_LABELS[params.blocked_reason]}`);
  if (params.institution_id && data[0]) {
    filters.push(`Institution: ${(data[0] as any).institution?.name ?? params.institution_id}`);
  }
  if (params.program_id && data[0]) {
    filters.push(`Program: ${(data[0] as any).program?.program_name ?? params.program_id}`);
  }
  if (params.admission_year) filters.push(`Admission year: ${params.admission_year}`);
  if (params.search) filters.push(`Search: "${params.search}"`);
  if (params.gender) filters.push(`Gender: ${params.gender}`);
  if (params.missing_field) filters.push(`Missing: ${params.missing_field}`);
  if (
    params.degree_id ||
    params.department_id ||
    params.semester_id ||
    params.section_id ||
    params.academic_year_id ||
    params.accommodation_type_id
  ) {
    filters.push('Further academic filters applied (see screen)');
  }

  return buildReport(data, paymentSummary, filters, new Date().toISOString());
}
