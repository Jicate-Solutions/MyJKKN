import { z } from 'zod';

export const graduatedSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Custom filters for graduated/exited students
  // Supports single status or comma-separated statuses (e.g., "graduated,exited")
  status: z.string().default('graduated,exited'),

  // Advanced filters
  institution_id: z.string().optional(),
  degree_id: z.string().optional(),
  department_id: z.string().optional(),
  program_id: z.string().optional(),
  semester_id: z.string().optional(),
  section_id: z.string().optional(),
  academic_year_id: z.string().optional()
});

export type GraduatedSearchParams = z.infer<typeof graduatedSearchParamsSchema>;
