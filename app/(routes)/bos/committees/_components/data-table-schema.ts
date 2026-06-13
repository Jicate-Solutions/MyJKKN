import { z } from 'zod';

export const committeeSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Committee-specific filters
  is_active: z.enum(['true', 'false']).optional(),
  institutionsId: z.string().optional(),
});

export type CommitteeSearchParams = z.infer<typeof committeeSearchParamsSchema>;
