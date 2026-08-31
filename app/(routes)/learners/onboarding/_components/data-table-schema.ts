// ============================================
// ONBOARDING DATA TABLE SCHEMA
// ============================================
// Created: 2026-05-13
// Purpose: Search params validation for the Learner Onboarding page.
// Mirrors profilesSearchParamsSchema but adds `tier` and `missing_field`.
// ============================================

import { z } from 'zod';

export const onboardingTierSchema = z
  .enum([
    'all',
    'critical',
    'needs_work',
    'almost',
    'ready_to_activate',
    'awaiting_payment'
  ])
  .optional()
  .catch('all');

/**
 * Which pre-active status to show. Omitted = both.
 * `.catch(undefined)` matters: a tampered ?lifecycle_status=active must fall
 * back to "both" rather than reaching `.in()` and matching zero rows.
 */
export const onboardingStatusSchema = z
  .enum(['reserved', 'admitted'])
  .optional()
  .catch(undefined);

/**
 * Admission cohort, as the INTEGER year — never `admission_year_id`.
 *
 * `admission_years` holds one row per (institution, year), so cohort 2026 is 7
 * distinct uuids across the institutions represented on this page. A uuid
 * filter would therefore match a fraction of the cohort whenever the page is in
 * its default "All Institutions" mode. The integer is identical in every
 * institution, so it composes with any institution scope.
 */
export const onboardingAdmissionYearSchema = z.coerce
  .number()
  .int()
  .positive()
  // Bounded so an absurd ?admission_year= cannot reach Postgres as an int4
  // overflow — that comes back as a query error, i.e. an empty table plus a
  // console error, where "no such cohort" is the honest answer.
  .lte(9999)
  .optional()
  .catch(undefined);

export const onboardingMissingFieldSchema = z
  .enum(['college_email', 'academic_year_id', 'semester_id', 'section_id'])
  .optional()
  .catch(undefined);

export const onboardingSearchParamsSchema = z.object({
  // Pagination
  page: z.coerce.number().catch(1),
  pageSize: z.coerce.number().catch(50),

  // Search
  search: z.string().optional().catch(undefined),
  search_case_sensitive: z.string().optional().catch(undefined),
  search_exact_match: z.string().optional().catch(undefined),
  search_fields: z.string().optional().catch(undefined),

  // Tier filter (also driven by tab selection)
  tier: onboardingTierSchema,
  missing_field: onboardingMissingFieldSchema,
  lifecycle_status: onboardingStatusSchema,

  // Cascading filters
  institution_id: z.string().uuid().optional().catch(undefined),
  degree_id: z.string().uuid().optional().catch(undefined),
  department_id: z.string().uuid().optional().catch(undefined),
  program_id: z.string().uuid().optional().catch(undefined),
  semester_id: z.string().uuid().optional().catch(undefined),
  section_id: z.string().uuid().optional().catch(undefined),
  academic_year_id: z.string().uuid().optional().catch(undefined),
  admission_year: onboardingAdmissionYearSchema,
  gender: z.string().optional().catch(undefined),
  // FK to the global accommodation_types lookup (4 active rows, not
  // institution-scoped), mirroring /learners/profiles. NOT the retired
  // learners_profiles.accommodation_type TEXT column.
  accommodation_type_id: z.string().uuid().optional().catch(undefined),

  // Sorting
  sort_by: z.string().optional().catch(undefined),
  sort_order: z.enum(['asc', 'desc']).optional().catch(undefined)
});

export type OnboardingSearchParams = z.infer<typeof onboardingSearchParamsSchema>;
