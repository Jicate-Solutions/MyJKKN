import { z } from 'zod';

/**
 * Schema for validating the search parameters for the sections table.
 */
export const sectionsSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Custom filters for sections - hierarchical order
  institution_id: z.string().optional(),
  degree_id: z.string().optional(),
  department_id: z.string().optional(),
  program_id: z.string().optional(),
  semester_id: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),

  // Date range filter is a stringified JSON in the URL
  dateRange: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      try {
        const parsed = JSON.parse(val);
        // Ensure the parsed object has the correct structure
        if (
          parsed &&
          typeof parsed.from_date === 'string' &&
          typeof parsed.to_date === 'string'
        ) {
          return parsed as { from_date: string; to_date: string };
        }
      } catch (e) {
        // Ignore parsing errors
        return undefined;
      }
      return undefined;
    })
});

export type SectionsSearchParams = z.infer<typeof sectionsSearchParamsSchema>;