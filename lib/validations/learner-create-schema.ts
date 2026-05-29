// ============================================
// CREATE LEARNER FORM — STRICT VALIDATION SCHEMA
// ============================================
// Created: 2026-05-22
// Purpose: Mirror bulk-upload's required-field set for the
// /learners/profiles/create flow. Used by LearnerCreateForm
// AFTER EnquiryForm's formatFormDataForAPI has run, so values
// are already UPPERCASE / location-name-normalised.
// Spec: docs/superpowers/specs/2026-05-22-learners-create-form-design.md
// ============================================

import { z } from 'zod';
import {
  GENDER_VALUES,
  RELIGION_VALUES,
  COMMUNITY_VALUES,
  BLOOD_GROUP_VALUES,
  ENTRY_TYPE_VALUES,
  ACCOMMODATION_VALUES,
  QUOTA_VALUES,
  SCHOLARSHIP_TYPE_VALUES,
} from '@/lib/constants/learner-dropdown-values';

// Tuple-cast helpers for z.enum — the constants are readonly string arrays.
const asTuple = <T extends string>(arr: readonly T[]) =>
  arr as unknown as [T, ...T[]];

const MOBILE_RE = /^[0-9]{10}$/;
const PIN_RE = /^[0-9]{6}$/;
const JKKN_EMAIL_RE = /@jkkn\.ac\.in$/i;

export const createLearnerSchema = z
  .object({
    // ---- Required: Basic Details (7 fields)
    first_name: z.string().trim().min(2, 'First name must be at least 2 characters'),
    last_name: z.string().trim().min(1, 'Last name is required'),
    date_of_birth: z.string().min(1, 'Date of birth is required'),
    gender: z.enum(asTuple(GENDER_VALUES), {
      errorMap: () => ({ message: 'Select a valid gender' }),
    }),
    religion: z.enum(asTuple(RELIGION_VALUES), {
      errorMap: () => ({ message: 'Select a valid religion' }),
    }),
    community: z.enum(asTuple(COMMUNITY_VALUES), {
      errorMap: () => ({ message: 'Select a valid community' }),
    }),
    caste: z.string().trim().min(1, 'Caste is required'),

    // ---- Required: Parent / Guardian (4 fields)
    father_name: z.string().trim().min(1, 'Father name is required'),
    father_mobile: z.string().regex(MOBILE_RE, 'Father mobile must be 10 digits'),
    mother_name: z.string().trim().min(1, 'Mother name is required'),
    mother_mobile: z.string().regex(MOBILE_RE, 'Mother mobile must be 10 digits'),

    // ---- Required: Course Selection / Academic FKs (7 fields)
    institution_id: z.string().uuid('Institution is required'),
    degree_id: z.string().uuid('Degree is required'),
    department_id: z.string().uuid('Department is required'),
    program_id: z.string().uuid('Program is required'),
    semester_id: z.string().uuid('Semester is required'),
    section_id: z.string().uuid('Section is required'),
    academic_year_id: z.string().uuid('Academic year is required'),

    // ---- Required: Contact (2 fields)
    student_mobile: z.string().regex(MOBILE_RE, 'Student mobile must be 10 digits'),
    college_email: z
      .string()
      .email('Enter a valid email')
      .regex(JKKN_EMAIL_RE, 'College email must end with @jkkn.ac.in'),

    // ---- Required: Address (5 fields)
    permanent_address_street: z.string().trim().min(1, 'Street is required'),
    permanent_address_taluk: z.string().trim().min(1, 'Taluk is required'),
    permanent_address_district: z.string().trim().min(1, 'District is required'),
    permanent_address_pin_code: z.string().regex(PIN_RE, 'Pin code must be 6 digits'),
    permanent_address_state: z.string().trim().min(1, 'State is required'),

    // ---- Required: Entry / Scholarship / Accommodation (3 fields)
    entry_type: z.enum(asTuple(ENTRY_TYPE_VALUES), {
      errorMap: () => ({ message: 'Select a valid entry type' }),
    }),
    scholarship_type: z.enum(asTuple(SCHOLARSHIP_TYPE_VALUES), {
      errorMap: () => ({ message: 'Select a valid scholarship type' }),
    }),
    accommodation_type: z.enum(asTuple(ACCOMMODATION_VALUES), {
      errorMap: () => ({ message: 'Select a valid accommodation type' }),
    }),

    // ---- Optional: 35 bulk-upload optional fields (passthrough)
    aadhar_number: z.string().optional(),
    blood_group: z.enum(asTuple(BLOOD_GROUP_VALUES)).optional().or(z.literal('')),
    admission_year: z.string().optional(),
    father_occupation: z.string().optional(),
    mother_occupation: z.string().optional(),
    annual_income: z.union([z.string(), z.number()]).optional(),
    regulation_id: z.string().uuid().optional().or(z.literal('')),
    batch_id: z.string().uuid().optional().or(z.literal('')),
    admission_year_id: z.string().uuid().optional().or(z.literal('')),
    student_email: z.string().email().optional().or(z.literal('')),
    // Gender-scoped campus-living category FKs (optional). Accept uuid, ''
    // (unset dropdown), or null (normalized payload). Without these here the
    // strict z.object would strip them before the insert.
    hostel_category_id: z.string().uuid().nullable().optional().or(z.literal('')),
    mess_category_id: z.string().uuid().nullable().optional().or(z.literal('')),
    last_school: z.string().optional(),
    board_of_study: z.string().optional(),
    tenth_max_marks: z.union([z.string(), z.number()]).optional(),
    tenth_obtained_marks: z.union([z.string(), z.number()]).optional(),
    tenth_percentage: z.union([z.string(), z.number()]).optional(),
    twelfth_group: z.string().optional(),
    twelfth_max_marks: z.union([z.string(), z.number()]).optional(),
    twelfth_obtained_marks: z.union([z.string(), z.number()]).optional(),
    twelfth_percentage: z.union([z.string(), z.number()]).optional(),
    medical_cutoff_marks: z.string().optional(),
    engineering_cutoff_marks: z.string().optional(),
    neet_roll_number: z.string().optional(),
    neet_score: z.string().optional(),
    counseling_applied: z.union([z.boolean(), z.string()]).optional(),
    counseling_number: z.string().optional(),
    quota: z.enum(asTuple(QUOTA_VALUES)).optional().or(z.literal('')),
    reference_type: z.string().optional(),
    reference_name: z.string().optional(),
    reference_contact: z.string().optional(),
    roll_number: z.string().optional(),
    register_number: z.string().optional(),
    student_photo_url: z.string().optional(),
  });

export type CreateLearnerInput = z.infer<typeof createLearnerSchema>;

/**
 * Backfills the two DB-NOT-NULL columns that bulk upload treats as OPTIONAL
 * by submitting empty strings (per feedback_learners_profiles_community_not_null.md).
 * Call this AFTER createLearnerSchema.parse() and before handing to the service.
 */
export function createLearnerWithDefaults(
  parsed: CreateLearnerInput,
): CreateLearnerInput & { last_school: string; board_of_study: string } {
  return {
    ...parsed,
    last_school: parsed.last_school ?? '',
    board_of_study: parsed.board_of_study ?? '',
    // Blank uuid → null so the insert never sends '' for an FK (Postgres 22P02).
    hostel_category_id: parsed.hostel_category_id || null,
    mess_category_id: parsed.mess_category_id || null,
  };
}
