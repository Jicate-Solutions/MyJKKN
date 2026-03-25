// lib/validations/profile-change-request.ts
import { z } from 'zod';
import { EDITABLE_PROFILE_FIELDS } from '@/types/learner-profile-change';

const phoneRegex = /^[6-9]\d{9}$/; // Indian mobile format
const pincodeRegex = /^\d{6}$/;

/**
 * Schema for validating profile change request fields
 * Only editable fields are allowed
 */
export const profileChangeSchema = z.object({
  // Academic Marks
  tenth_marks: z.any().optional(),
  twelfth_marks: z.any().optional(),
  engineering_cutoff_marks: z.any().optional(),
  medical_cutoff_marks: z.any().optional(),
  neet_roll_number: z.string().optional(),
  neet_score: z.any().optional(),
  counseling_applied: z.boolean().optional(),
  counseling_number: z.string().optional(),
  scholarship_type: z.string().optional(),
  last_school: z.string().optional(),
  board_of_study: z.string().optional(),

  // Contact Details
  student_mobile: z
    .string()
    .regex(phoneRegex, 'Invalid mobile format. Must be 10 digits starting with 6-9')
    .optional(),
  student_email: z
    .string()
    .email('Invalid email format')
    .optional(),
  alternate_mobile: z
    .string()
    .regex(phoneRegex, 'Invalid mobile format. Must be 10 digits starting with 6-9')
    .optional(),

  // Parent/Guardian Information
  father_name: z
    .string()
    .min(2, 'Minimum 2 characters')
    .optional(),
  father_mobile: z
    .string()
    .regex(phoneRegex, 'Invalid mobile format')
    .optional(),
  father_occupation: z.string().optional(),

  mother_name: z
    .string()
    .min(2, 'Minimum 2 characters')
    .optional(),
  mother_mobile: z
    .string()
    .regex(phoneRegex, 'Invalid mobile format')
    .optional(),
  mother_occupation: z.string().optional(),

  guardian_name: z.string().optional(),
  guardian_mobile: z
    .string()
    .regex(phoneRegex, 'Invalid mobile format')
    .optional(),
  guardian_occupation: z.string().optional(),

  annual_income: z.string().optional(),

  // Address Information
  permanent_address: z.string().min(5, 'Minimum 5 characters').optional(),
  permanent_city: z.string().optional(),
  permanent_state: z.string().optional(),
  permanent_pincode: z
    .string()
    .regex(pincodeRegex, 'Invalid pincode. Must be 6 digits')
    .optional(),

  present_address: z.string().min(5, 'Minimum 5 characters').optional(),
  present_city: z.string().optional(),
  present_state: z.string().optional(),
  present_pincode: z
    .string()
    .regex(pincodeRegex, 'Invalid pincode. Must be 6 digits')
    .optional(),

  // Other Personal Details
  blood_group: z
    .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], {
      errorMap: () => ({ message: 'Invalid blood group' }),
    })
    .optional(),
  religion: z.string().optional(),
  community: z.string().optional(),
  caste: z.string().optional(),
  hostel_required: z.boolean().optional(),
  transport_required: z.boolean().optional(),
  accommodation_type: z.string().optional(),
})
  .refine(
    (data) => {
      // At least one field must be changed
      const changedFields = Object.keys(data).filter(
        key => data[key as keyof typeof data] !== undefined
      );
      return changedFields.length > 0;
    },
    { message: 'At least one field must be changed' }
  )
  .refine(
    (data) => {
      // Ensure only editable fields are present
      const invalidFields = Object.keys(data).filter(
        key => !EDITABLE_PROFILE_FIELDS.includes(key as any)
      );
      return invalidFields.length === 0;
    },
    { message: 'Cannot edit read-only fields' }
  );

export type ProfileChangeFormValues = z.infer<typeof profileChangeSchema>;

/**
 * Helper function to validate if a field is editable
 */
export function isEditableField(fieldName: string): boolean {
  return EDITABLE_PROFILE_FIELDS.includes(fieldName as any);
}

/**
 * Helper function to get changed fields between two objects
 */
export function getChangedFields<T extends Record<string, any>>(
  newData: T,
  currentData: T
): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {};

  Object.keys(newData).forEach((key) => {
    // Only process editable fields
    if (!isEditableField(key)) return;

    const newValue = newData[key];
    const oldValue = currentData[key];

    // Check if value actually changed
    if (newValue !== oldValue && newValue !== undefined) {
      changes[key] = {
        old: oldValue ?? null,
        new: newValue,
      };
    }
  });

  return changes;
}

/**
 * Helper function to format field names for display
 */
export function formatFieldLabel(fieldName: string): string {
  const labels: Record<string, string> = {
    // Academic Marks
    tenth_marks: '10th Marks',
    twelfth_marks: '12th Marks',
    engineering_cutoff_marks: 'Engineering Cutoff',
    medical_cutoff_marks: 'Medical Cutoff',
    neet_roll_number: 'NEET Roll Number',
    neet_score: 'NEET Score',
    counseling_applied: 'Counseling Applied',
    counseling_number: 'Counseling Number',
    scholarship_type: 'Scholarship Type',
    last_school: 'Last School',
    board_of_study: 'Board of Study',

    student_mobile: 'Student Mobile',
    student_email: 'Student Email',
    alternate_mobile: 'Alternate Mobile',
    father_name: "Father's Name",
    father_mobile: "Father's Mobile",
    father_occupation: "Father's Occupation",
    mother_name: "Mother's Name",
    mother_mobile: "Mother's Mobile",
    mother_occupation: "Mother's Occupation",
    guardian_name: "Guardian's Name",
    guardian_mobile: "Guardian's Mobile",
    guardian_occupation: "Guardian's Occupation",
    annual_income: 'Annual Income',
    permanent_address: 'Permanent Address',
    permanent_city: 'Permanent City',
    permanent_state: 'Permanent State',
    permanent_pincode: 'Permanent Pincode',
    present_address: 'Present Address',
    present_city: 'Present City',
    present_state: 'Present State',
    present_pincode: 'Present Pincode',
    blood_group: 'Blood Group',
    religion: 'Religion',
    community: 'Community',
    caste: 'Caste',
    hostel_required: 'Hostel Required',
    transport_required: 'Transport Required',
    accommodation_type: 'Accommodation Type',
  };

  return labels[fieldName] || fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
