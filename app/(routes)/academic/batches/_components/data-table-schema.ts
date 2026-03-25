import { z } from 'zod';

/**
 * Schema for validating the search parameters for the batches table.
 */
export const batchesSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Custom filters for batches
  institution_id: z.string().optional(),
  is_active: z.enum(['true', 'false']).optional(),
  batch_year: z.string().optional()
});

export type BatchesSearchParams = z.infer<typeof batchesSearchParamsSchema>;
