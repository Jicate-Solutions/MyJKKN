import { z } from 'zod';

// Contact validation schema
export const contactSchema = z
  .object({
    contact_name: z.string().optional(),
    designation: z.string().optional(),
    email: z.string().email('Invalid email').optional(),
    mobile: z
      .string()
      .regex(/^\+?[0-9\s-()]{10,}$/, 'Invalid mobile number')
      .optional()
  })
  .optional();
