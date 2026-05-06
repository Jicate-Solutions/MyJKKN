import { z } from 'zod';

export const meetingSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  status: z
    .enum([
      'draft',
      'principal_approved',
      'noticed',
      'expert_invited',
      'completed',
      'minutes_drafted',
      'minutes_approved',
      'ratified',
    ])
    .optional(),
  board_id: z.string().optional(),
  academic_year: z.string().optional(),
  meeting_type: z.enum(['regular', 'special', 'emergency', 'online']).optional(),
  institutionsId: z.string().optional(),
});

export type MeetingSearchParams = z.infer<typeof meetingSearchParamsSchema>;
