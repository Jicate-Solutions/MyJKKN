import { z } from 'zod';

export const transferEnquirySchema = z.object({
  institution_id: z.string().uuid('Select the new institution'),
  degree_id: z.string().uuid('Select the new degree'),
  department_id: z.string().uuid('Select the new department'),
  program_id: z.string().uuid('Select the new program'),
  semester_id: z.string().uuid().optional().or(z.literal('')),
  section_id: z.string().uuid().optional().or(z.literal('')),
  academic_year_id: z.string().uuid().optional().or(z.literal('')),
  regulation_id: z.string().uuid().optional().or(z.literal('')),
  batch_id: z.string().uuid().optional().or(z.literal('')),
  reason: z
    .string()
    .trim()
    .min(10, 'Please provide a clear transfer reason (at least 10 characters)')
    .max(1000, 'Reason must be 1000 characters or fewer'),
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'Please acknowledge the Application ID will be regenerated' }),
  }),
});

export type TransferEnquiryInput = z.infer<typeof transferEnquirySchema>;
