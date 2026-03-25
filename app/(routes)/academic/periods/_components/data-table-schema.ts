import { z } from 'zod';

/**
 * Schema for validating the search parameters for the periods table.
 */
export const periodsSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Custom filters for periods
  institution_id: z.string().optional(),
  is_break: z.enum(['true', 'false']).optional(),

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

export type PeriodsSearchParams = z.infer<typeof periodsSearchParamsSchema>;
