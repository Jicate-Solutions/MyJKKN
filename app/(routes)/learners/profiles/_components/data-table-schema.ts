// ============================================
// PROFILES DATA TABLE SCHEMA
// ============================================
// Created: 2025-01-19
// Purpose: Search params validation for active learners profiles list
// ============================================

import { z } from 'zod';

/**
 * Search params schema for profiles data table
 * Validates URL query parameters for filtering, sorting, and pagination
 */
export const profilesSearchParamsSchema = z.object({
  // Pagination — .catch() ensures non-numeric or array values fall back to defaults
  page: z.coerce.number().catch(1),
  pageSize: z.coerce.number().catch(50),

  // Selected lifecycle tab — drives which (single) tab the server fetches
  tab: z.enum(['active', 'inactive', 'exited']).optional().catch(undefined),

  // Search
  search: z.string().optional().catch(undefined),
  search_case_sensitive: z.string().optional().catch(undefined),
  search_exact_match: z.string().optional().catch(undefined),
  search_fields: z.string().optional().catch(undefined),

  // Filters — UUID fields use .catch(undefined) so invalid/non-UUID values are silently dropped
  institution_id: z.string().uuid().optional().catch(undefined),
  degree_id: z.string().uuid().optional().catch(undefined),
  department_id: z.string().uuid().optional().catch(undefined),
  program_id: z.string().uuid().optional().catch(undefined),
  semester_id: z.string().uuid().optional().catch(undefined),
  section_id: z.string().uuid().optional().catch(undefined),
  academic_year_id: z.string().uuid().optional().catch(undefined),
  lifecycle_status: z.string().optional().catch(undefined),
  // Which lifecycle tab is open. Separate from `lifecycle_status`, which the
  // export dialog uses as an explicit filter value.
  status: z.string().optional().catch(undefined),
  gender: z.string().optional().catch(undefined),
  is_profile_complete: z.string().optional().catch(undefined),

  // Date range
  from_date: z.string().optional().catch(undefined),
  to_date: z.string().optional().catch(undefined),

  // Sorting — invalid sort_order values fall back to undefined
  sort_by: z.string().optional().catch(undefined),
  sort_order: z.enum(['asc', 'desc']).optional().catch(undefined),
});

export type ProfilesSearchParams = z.infer<typeof profilesSearchParamsSchema>;
