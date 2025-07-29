import { z } from 'zod';

/**
 * Schema for validating the search parameters for the semesters table.
 */
export const semestersSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Custom filters for semesters
  program_id: z.string().optional(),
  semester_type: z.enum(['odd', 'even']).optional(),
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

export type SemestersSearchParams = z.infer<typeof semestersSearchParamsSchema>;