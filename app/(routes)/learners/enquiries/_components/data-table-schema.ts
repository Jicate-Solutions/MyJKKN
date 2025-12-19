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
export const enquiriesSearchParamsSchema = z.object({
  // Pagination
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(50),

  // Search
  search: z.string().optional(),

  // Filters
  institution_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  program_id: z.string().uuid().optional(),
  lifecycle_status: z.string().optional(), // 'enquiry' or 'pending'

  // Date range
  from_date: z.string().optional(),
  to_date: z.string().optional(),

  // Sorting
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
});

export type EnquiriesSearchParams = z.infer<typeof enquiriesSearchParamsSchema>;
