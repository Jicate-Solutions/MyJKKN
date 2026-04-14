/**
 * Zod schemas for HR non-staff employees (guest / student_ta / vendor_monitored).
 * Full-time employees are managed via the staff module + hr_staff_details.
 */

import { z } from 'zod';

export const NonStaffEmploymentTypeEnum = z.enum(['guest', 'student_ta', 'vendor_monitored', 'unpaid_volunteer']);
export const EmploymentTypeEnum = z.enum(['full_time', 'guest', 'student_ta', 'vendor_monitored', 'unpaid_volunteer']);

export const CreateEmployeeSchema = z
  .object({
    hr_organization_id: z.string().uuid(),
    employment_type: NonStaffEmploymentTypeEnum,
    employee_code: z.string().min(1).max(64),
    first_name: z.string().min(1).max(120),
    last_name: z.string().max(120).optional().nullable(),
    email: z.string().email().optional().nullable(),
    phone: z.string().max(32).optional().nullable(),
    designation_id: z.string().uuid().optional().nullable(),
    cadre_id: z.string().uuid().optional().nullable(),
    reports_to_employee_id: z.string().uuid().optional().nullable(),
    learner_profile_id: z.string().uuid().optional().nullable(),
    vendor_name: z.string().max(256).optional().nullable(),
  })
  .refine(
    (v) => {
      switch (v.employment_type) {
        case 'student_ta':        return !!v.learner_profile_id;
        case 'unpaid_volunteer':  return !!v.learner_profile_id; // senior learner ambassadors
        case 'vendor_monitored':  return !!v.vendor_name;
        case 'guest':             return true;
        default:                  return false;
      }
    },
    {
      message: 'Polymorphic FK required: student_ta / unpaid_volunteer need learner_profile_id; vendor_monitored needs vendor_name.',
    }
  );

export const DeactivateEmployeeSchema = z.object({
  reason: z.string().min(5).max(500),
});

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
