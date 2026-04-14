/**
 * Zod schemas for HR Employee create/update forms
 */

import { z } from 'zod';

export const EmploymentTypeEnum = z.enum(['full_time', 'guest', 'student_ta', 'vendor_monitored']);

export const CreateEmployeeSchema = z.object({
  hr_organization_id: z.string().uuid(),
  employment_type: EmploymentTypeEnum,
  employee_code: z.string().min(1).max(64),
  first_name: z.string().min(1).max(120),
  last_name: z.string().max(120).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(32).optional().nullable(),
  institution_email: z.string().email().optional().nullable(),
  designation_id: z.string().uuid().optional().nullable(),
  cadre_id: z.string().uuid().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  reports_to_employee_id: z.string().uuid().optional().nullable(),
  date_of_joining: z.string().optional().nullable(),
  work_location: z.string().max(256).optional().nullable(),
  staff_id: z.string().uuid().optional().nullable(),
  learner_profile_id: z.string().uuid().optional().nullable(),
  vendor_name: z.string().max(256).optional().nullable(),
}).refine(
  (v) => {
    switch (v.employment_type) {
      case 'full_time':        return !!v.staff_id;
      case 'student_ta':       return !!v.learner_profile_id;
      case 'vendor_monitored': return !!v.vendor_name;
      case 'guest':            return true;
      default:                 return false;
    }
  },
  {
    message: 'Polymorphic FK required: full_time needs staff_id, student_ta needs learner_profile_id, vendor_monitored needs vendor_name.',
  }
);

export const UpdateEmployeeSchema = CreateEmployeeSchema.innerType().partial();

export const DeactivateEmployeeSchema = z.object({
  reason: z.string().min(5).max(500),
});

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;
