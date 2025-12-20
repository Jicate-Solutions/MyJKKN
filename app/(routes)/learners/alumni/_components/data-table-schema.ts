// ============================================
// ALUMNI DATA TABLE SCHEMA
// ============================================
// Created: 2025-01-19
// Purpose: Search params validation for alumni and graduates list
// ============================================

import { z } from 'zod';

/**
 * Search params schema for alumni data table
 * Validates URL query parameters for filtering, sorting, and pagination
 */
export const alumniSearchParamsSchema = z.object({
  // Pagination
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(50),

  // Search
  search: z.string().optional(),

  // Filters
  institution_id: z.string().uuid().optional(),
  degree_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  program_id: z.string().uuid().optional(),
  semester_id: z.string().uuid().optional(),
  section_id: z.string().uuid().optional(),
  academic_year_id: z.string().uuid().optional(),
  lifecycle_status: z.string().optional(), // 'graduated' or 'alumni'
  gender: z.string().optional(),
  is_profile_complete: z.string().optional(),

  // Date range
  from_date: z.string().optional(),
  to_date: z.string().optional(),

  // Sorting
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
});

export type AlumniSearchParams = z.infer<typeof alumniSearchParamsSchema>;
