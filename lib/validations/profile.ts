// lib/validations/profile.ts
import * as z from 'zod';

export const phoneRegex = /^[0-9+][0-9\s-]{9,14}$/;

export const profileFormSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),

  phone_number: z
    .string()
    .regex(
      phoneRegex,
      'Invalid phone number format - should be 10 digits or include country code (e.g., +91)'
    )
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val))
    .nullable(),

  institution: z.enum(
    [
      'jkkn_dental',
      'jkkn_pharmacy',
      'jkkn_arts',
      'jkkn_engineering',
      'jkkn_nursing',
      'jkkn_education',
      'jkkn_allied_health_science',
      'jkkn_matriculation',
      'jkkn_NV'
    ],
    {
      required_error: 'Please select an institution'
    }
  ),

  department: z
    .string()
    .min(2, 'Department must be at least 2 characters')
    .max(100, 'Department must be less than 100 characters'),

  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).nullable(),

  designation: z
    .string()
    .max(100, 'Designation must be less than 100 characters')
    .nullable(),

  bio: z.string().max(500, 'Bio must be less than 500 characters').nullable()
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
