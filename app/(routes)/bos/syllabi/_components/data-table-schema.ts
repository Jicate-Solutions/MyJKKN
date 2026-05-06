import { z } from 'zod';

export const syllabusSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  boardId: z.string().optional(),
  regulationId: z.string().optional(),
  stream: z.string().optional(),
  is_latest: z.enum(['true', 'false']).optional(),
  institutionsId: z.string().optional(),
});

export type SyllabusSearchParams = z.infer<typeof syllabusSearchParamsSchema>;
