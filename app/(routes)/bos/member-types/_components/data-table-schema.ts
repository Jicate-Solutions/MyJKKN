import { z } from 'zod';

export const memberTypeSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Member-type-specific filters
  baseType: z
    .enum([
      'principal', 'chairman', 'hod', 'facilitator', 'university_nominee',
      'subject_expert', 'academic_expert', 'internal_member', 'industry_expert',
      'alumni', 'startup', 'member_secretary', 'student', 'faculty_member',
    ])
    .optional(),
  is_active: z.enum(['true', 'false']).optional(),
  institutionsId: z.string().optional(),
});

export type MemberTypeSearchParams = z.infer<typeof memberTypeSearchParamsSchema>;
