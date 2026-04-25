import { z } from 'zod';

export const admissionYearsSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  institution_id: z.string().optional(),
  program_id: z.string().optional(),
  program_start_year: z.coerce.number().optional(),
  status: z.enum(['active', 'inactive']).optional()
});

export type AdmissionYearsSearchParams = z.infer<
  typeof admissionYearsSearchParamsSchema
>;
