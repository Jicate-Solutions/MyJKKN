import { z } from 'zod';

// Search params schema for leaves page
export const leavesSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  scope_level: z.enum(['institution', 'department', 'semester', 'section']).optional(),
  leave_type_id: z.string().optional(),
  institution_id: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional()
});

export type LeavesSearchParams = z.infer<typeof leavesSearchParamsSchema>;
