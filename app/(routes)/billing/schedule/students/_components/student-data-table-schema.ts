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
  accommodation_type: z.string().optional(),
  // Unified operator search box (name OR roll no OR register no OR mobile).
  // Replaces the three separate first_name / roll_number / mobile_number
  // boxes on the UI; those keys stay in the schema because bookmarked URLs
  // and the bulk pages still carry them.
  q: z.string().optional(),
  // '1' when `q` came from the camera barcode scanner rather than the
  // keyboard. A scan identifies exactly one learner, so the results table
  // opens the bill popup for them automatically — nothing to click between
  // scanning a card and typing an amount. Typed searches never set this: a
  // half-typed name that happens to match one row must NOT pop a modal open
  // under the clerk's cursor.
  scan: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  roll_number: z.string().optional(),
  register_number: z.string().optional(),
  mobile_number: z.string().optional(),
  is_profile_complete: z.boolean().optional(),
  student_email: z.string().optional(), // For filtering by student email (used for student role)
});

export type StudentBillingSearchParams = z.infer<typeof studentBillingSearchParamsSchema>;