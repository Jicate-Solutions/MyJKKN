import { z } from 'zod';

export const compositionSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  board_id: z.string().optional(),
  academic_year: z.string().optional(),
  is_active: z.enum(['true', 'false']).optional(),
  institutionsId: z.string().optional(),
});

export type CompositionSearchParams = z.infer<typeof compositionSearchParamsSchema>;
