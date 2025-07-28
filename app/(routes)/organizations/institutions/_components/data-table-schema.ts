import { z } from 'zod';

export const institutionsSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Custom filters for institutions
  status: z.enum(['active', 'inactive']).optional()
});

export type InstitutionsSearchParams = z.infer<
  typeof institutionsSearchParamsSchema
>;
