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
  gender: z.string().optional().catch(undefined),

  // Sorting
  sort_by: z.string().optional().catch(undefined),
  sort_order: z.enum(['asc', 'desc']).optional().catch(undefined)
});

export type OnboardingSearchParams = z.infer<typeof onboardingSearchParamsSchema>;
