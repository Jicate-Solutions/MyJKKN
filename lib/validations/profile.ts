// lib/validations/profile.ts
import * as z from 'zod';

export const phoneRegex = /^[0-9+][0-9\s-]{9,14}$/;

export const profileFormSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  phone_number: z
    .string()
    .regex(/^[0-9+][0-9\s-]{9,14}$/, 'Invalid phone number format')
    .optional()
    .or(z.literal('')),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  designation: z.string().optional(),
  bio: z.string().optional()
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const formatPhoneNumber = (phone: string) => {
  // Remove all non-digit characters first
  const cleaned = phone.replace(/\D/g, '');

  // Format as per Indian phone number if 10 digits
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  }

  // If includes country code (assuming +91 for India)
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return '+' + cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '$1-$2-$3-$4');
  }

  // Return as is if doesn't match known formats
  return phone;
};
