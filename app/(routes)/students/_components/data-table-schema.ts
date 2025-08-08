import { z } from 'zod';

export const studentsSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Custom filters for students
  status: z
    .enum(['active', 'inactive', 'pending', 'exited', 'graduated'])
    .optional(),
  is_profile_complete: z.coerce.boolean().default(true),

  // Advanced filters
  institution_id: z.string().optional(),
  degree_id: z.string().optional(),
  department_id: z.string().optional(),
  program_id: z.string().optional(),
  semester_id: z.string().optional(),
  section_id: z.string().optional(),
  academic_year_id: z.string().optional()
});

export type StudentsSearchParams = z.infer<typeof studentsSearchParamsSchema>;
