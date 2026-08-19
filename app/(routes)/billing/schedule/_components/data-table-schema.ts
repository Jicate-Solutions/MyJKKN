import { z } from 'zod';

/**
 * Schema for validating the search parameters for the billing schedule table.
 */
export const billingScheduleSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Custom filters for billing schedule
  institution_id: z.string().optional(),
  student_id: z.string().optional(),
  item_category_id: z.string().optional(),
  // Ownership of the fee (billing_categories.collection_type) — 'government'
  // fees are collected on behalf of a government body, not institution revenue.
  collection_type: z.enum(['management', 'government']).optional(),
  status: z.enum(['paid', 'unpaid', 'partially_paid', 'cancelled', 'overdue', 'refunded']).optional(),
  // Learner lifecycle status (learners_profiles.lifecycle_status). Free-form
  // string — the service eq()'s it against the embedded learner.
  lifecycle_status: z.string().optional(),
  is_recurring: z.enum(['true', 'false']).optional(),
  amount_from: z.coerce.number().optional(),
  amount_to: z.coerce.number().optional(),

  // Academic hierarchy filters
  academic_year_id: z.string().optional(),
  degree_id: z.string().optional(),
  department_id: z.string().optional(),
  program_id: z.string().optional(),
  semester_id: z.string().optional(),
  section_id: z.string().optional(),

  // Accommodation-type filter (accommodation_types.code)
  accommodation_type: z.string().optional(),

  // Admission-year filter — carries the year NAME ('2025-2026'), not an id,
  // because admission_years has one row per year PER INSTITUTION. The service
  // fans the name back out to every matching id.
  admission_year: z.string().optional(),

  // Date range filter for due_date
  dueDateRange: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      try {
        const parsed = JSON.parse(val);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'from' in parsed &&
          'to' in parsed
        ) {
          return {
            from: parsed.from ? new Date(parsed.from) : undefined,
            to: parsed.to ? new Date(parsed.to) : undefined
          };
        }
        return undefined;
      } catch {
        return undefined;
      }
    })
});

export type BillingScheduleSearchParams = z.infer<typeof billingScheduleSearchParamsSchema>;