import { z } from 'zod';

/**
 * Schema for validating the search parameters for the staff table.
 */
export const staffSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Custom filters for staff
  category_id: z.string().optional(),
  institution_id: z.string().optional(),
  department_id: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined))
});

export type StaffSearchParams = z.infer<typeof staffSearchParamsSchema>;
