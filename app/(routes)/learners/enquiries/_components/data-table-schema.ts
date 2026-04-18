// ============================================
// ENQUIRIES DATA TABLE SCHEMA
// ============================================
// Created: 2025-01-18
// Purpose: Search params validation for enquiries list
// ============================================

import { z } from 'zod';

/**
 * Search params schema for enquiries data table
 * Validates URL query parameters for filtering, sorting, and pagination
 */
// Accepts any string — if it's not a valid UUID, returns undefined instead of throwing.
// Prevents stale URL params (e.g. `?institution_id=all` or empty) from crashing the page.
const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .catch(undefined);

export const enquiriesSearchParamsSchema = z.object({
  // Pagination
  page: z.coerce.number().default(1).catch(1),
  pageSize: z.coerce.number().default(50).catch(50),

  // Search
  search: z.string().optional().catch(undefined),

  // Filters
  institution_id: optionalUuid,
  degree_id: optionalUuid,
  department_id: optionalUuid,
  program_id: optionalUuid,
  semester_id: optionalUuid,
  section_id: optionalUuid,
  academic_year_id: optionalUuid,
  lifecycle_status: z.string().optional().catch(undefined),

  // Date range
  from_date: z.string().optional().catch(undefined),
  to_date: z.string().optional().catch(undefined),

  // Sorting
  sort_by: z.string().optional().catch(undefined),
  sort_order: z.enum(['asc', 'desc']).optional().catch(undefined),
});

export type EnquiriesSearchParams = z.infer<typeof enquiriesSearchParamsSchema>;
