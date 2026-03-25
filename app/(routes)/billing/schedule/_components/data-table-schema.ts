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
  status: z.enum(['paid', 'unpaid', 'partially_paid', 'cancelled', 'overdue', 'refunded']).optional(),
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