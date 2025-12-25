import { z } from 'zod';

/**
 * Schema for validating the search parameters for the staff categories table.
 */
export const staffCategoriesSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Custom filters for staff categories
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined))
});

export type StaffCategoriesSearchParams = z.infer<typeof staffCategoriesSearchParamsSchema>;
