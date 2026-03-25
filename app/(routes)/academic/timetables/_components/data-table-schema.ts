import { z } from 'zod';

/**
 * Schema for validating the search parameters for the timetables table.
 */
export const timetablesSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Custom filters for timetables
  institution_id: z.string().optional(),
  academic_year_id: z.string().optional(),
  degree_id: z.string().optional(),
  program_id: z.string().optional(),
  department_id: z.string().optional(),
  semester: z.string().optional(),
  section: z.string().optional(),
  is_active: z.enum(['true', 'false']).optional(),
  is_template: z.enum(['true', 'false']).optional(),
  timetable_type: z.enum(['section', 'semester']).optional(), // Updated: 2025-10-13

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

export type TimetablesSearchParams = z.infer<
  typeof timetablesSearchParamsSchema
>;
