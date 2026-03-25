import { z } from 'zod';

/**
 * Schema for validating the search parameters for the student billing search table.
 */
export const studentBillingSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Student search filters
  institution_id: z.string().optional(),
  academic_year_id: z.string().optional(),
  degree_id: z.string().optional(),
  department_id: z.string().optional(),
  program_id: z.string().optional(),
  semester_id: z.string().optional(),
  section_id: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  roll_number: z.string().optional(),
  mobile_number: z.string().optional(),
  is_profile_complete: z.boolean().optional(),
  student_email: z.string().optional(), // For filtering by student email (used for student role)
});

export type StudentBillingSearchParams = z.infer<typeof studentBillingSearchParamsSchema>;