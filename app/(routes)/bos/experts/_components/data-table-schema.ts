import { z } from 'zod';

export const expertSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Expert-specific filters
  category: z
    .enum(['university_nominee', 'subject_expert', 'industry_expert', 'alumni'])
    .optional(),
  is_active: z.enum(['true', 'false']).optional(),
});

export type ExpertSearchParams = z.infer<typeof expertSearchParamsSchema>;
