// lib/validations/parent-portal.ts

import { z } from 'zod';
import { InputValidator } from '@/lib/utils/input-validator';

// ============================================================================
// CONSTANTS
// ============================================================================

const RELATIONSHIP_VALUES = ['father', 'mother', 'guardian', 'other'] as const;
const COMMUNICATION_TYPE_VALUES = ['announcement', 'message', 'alert'] as const;
const PRIORITY_VALUES = ['low', 'normal', 'high', 'urgent'] as const;
const ACTIVITY_TYPE_VALUES = [
  'login',
  'view_dashboard',
  'view_attendance',
  'view_fees',
  'view_grades',
  'read_message',
  'submit_survey',
  'logout',
] as const;

// ============================================================================
// PARENT PROFILE SCHEMAS
// ============================================================================

export const createParentProfileSchema = z.object({
  user_id: z.string().transform((val) => InputValidator.uuid(val, 'User ID')),
  institution_id: z.string().transform((val) => InputValidator.uuid(val, 'Institution ID')),
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(255, 'Name too long')
    .transform((val) => InputValidator.text(val, {
      minLength: 2,
      maxLength: 255,
      fieldName: 'Name'
    })),
  phone: z
    .string()
    .transform((val) => InputValidator.phoneNumber(val))
    .optional(),
  email: z.string()
    .transform((val) => InputValidator.email(val))
    .optional(),
  relationship: z.enum(RELATIONSHIP_VALUES).optional(),
});

export const updateParentProfileSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(255, 'Name too long')
    .transform((val) => InputValidator.text(val, {
      minLength: 2,
      maxLength: 255,
      fieldName: 'Name'
    }))
    .optional(),
  phone: z
    .string()
    .transform((val) => InputValidator.phoneNumber(val))
    .optional()
    .nullable(),
  email: z.string()
    .transform((val) => InputValidator.email(val))
    .optional()
    .nullable(),
  relationship: z.enum(RELATIONSHIP_VALUES).optional().nullable(),
  avatar_url: z.string()
    .transform((val) => InputValidator.url(val, { fieldName: 'Avatar URL' }))
    .optional()
    .nullable(),
});

// ============================================================================
// PARENT-LEARNER LINK SCHEMAS
// ============================================================================

export const linkLearnerSchema = z.object({
  parent_id: z.string().transform((val) => InputValidator.uuid(val, 'Parent ID')),
  learner_id: z.string().transform((val) => InputValidator.uuid(val, 'Learner ID')),
  relationship: z.enum(RELATIONSHIP_VALUES, {
    required_error: 'Relationship is required',
  }),
  is_primary: z.boolean().default(false),
});

export const verifyLinkSchema = z.object({
  link_id: z.string().uuid('Invalid link ID'),
  verified_by: z.string().uuid('Invalid verifier ID'),
});

// ============================================================================
// COMMUNICATION SCHEMAS
// ============================================================================

const attachmentSchema = z.object({
  name: z.string()
    .min(1, 'Attachment name is required')
    .max(255, 'Attachment name too long')
    .transform((val) => InputValidator.text(val, {
      maxLength: 255,
      fieldName: 'Attachment name'
    })),
  url: z.string().transform((val) => InputValidator.url(val, { fieldName: 'Attachment URL' })),
  type: z.string()
    .min(1, 'File type is required')
    .max(100, 'File type too long'),
  size: z.number()
    .transform((val) => InputValidator.number(val, {
      min: 0,
      max: 100 * 1024 * 1024, // 100 MB max
      fieldName: 'File size'
    })),
});

export const createCommunicationSchema = z.object({
  institution_id: z.string().transform((val) => InputValidator.uuid(val, 'Institution ID')),
  parent_id: z.string()
    .transform((val) => InputValidator.uuid(val, 'Parent ID'))
    .optional(),
  learner_id: z.string()
    .transform((val) => InputValidator.uuid(val, 'Learner ID'))
    .optional(),
  type: z.enum(COMMUNICATION_TYPE_VALUES, {
    required_error: 'Communication type is required',
  }),
  subject: z.string()
    .min(1, 'Subject is required')
    .max(255, 'Subject too long')
    .transform((val) => InputValidator.text(val, {
      minLength: 1,
      maxLength: 255,
      fieldName: 'Subject'
    })),
  content: z.string()
    .min(1, 'Content is required')
    .max(10000, 'Content too long')
    .transform((val) => InputValidator.text(val, {
      minLength: 1,
      maxLength: 10000,
      fieldName: 'Content'
    })),
  priority: z.enum(PRIORITY_VALUES).default('normal'),
  sender_id: z.string()
    .transform((val) => InputValidator.uuid(val, 'Sender ID'))
    .optional(),
  attachments: z.array(attachmentSchema)
    .max(10, 'Too many attachments (max 10)')
    .default([]),
});

export const updateCommunicationSchema = z.object({
  read_at: z.string().datetime().optional(),
});

// ============================================================================
// ACTIVITY LOG SCHEMAS
// ============================================================================

export const logActivitySchema = z.object({
  parent_id: z.string().transform((val) => InputValidator.uuid(val, 'Parent ID')),
  activity_type: z.enum(ACTIVITY_TYPE_VALUES, {
    required_error: 'Activity type is required',
  }),
  description: z.string()
    .max(500, 'Description too long')
    .transform((val) => InputValidator.text(val, {
      maxLength: 500,
      fieldName: 'Description'
    }))
    .optional(),
  metadata: z.record(z.unknown())
    .transform((val) => InputValidator.json(val, 50000))
    .default({}),
  ip_address: z.string().ip().optional(),
  user_agent: z.string()
    .max(500, 'User agent too long')
    .transform((val) => InputValidator.text(val, {
      maxLength: 500,
      fieldName: 'User agent'
    }))
    .optional(),
});

// ============================================================================
// OTP AUTHENTICATION SCHEMAS
// ============================================================================

export const requestOTPSchema = z.object({
  phone: z.string().transform((val) => InputValidator.phoneNumber(val)),
  institution_id: z.string().transform((val) => InputValidator.uuid(val, 'Institution ID')),
});

export const verifyOTPSchema = z.object({
  phone: z.string().transform((val) => InputValidator.phoneNumber(val)),
  otp: z
    .string()
    .length(6, 'OTP must be 6 digits')
    .regex(/^[0-9]+$/, 'OTP must contain only numbers')
    .transform((val) => InputValidator.text(val, {
      minLength: 6,
      maxLength: 6,
      allowedChars: /^[0-9]+$/,
      fieldName: 'OTP'
    })),
  institution_id: z.string().transform((val) => InputValidator.uuid(val, 'Institution ID')),
});

// ============================================================================
// REGISTRATION SCHEMAS
// ============================================================================

export const parentRegistrationSchema = z.object({
  phone: z.string().transform((val) => InputValidator.phoneNumber(val)),
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(255, 'Name too long')
    .transform((val) => InputValidator.text(val, {
      minLength: 2,
      maxLength: 255,
      fieldName: 'Name'
    })),
  email: z.string()
    .transform((val) => InputValidator.email(val))
    .optional(),
  relationship: z.enum(RELATIONSHIP_VALUES, {
    required_error: 'Relationship is required',
  }),
  learner_enrollment_number: z
    .string()
    .min(1, 'Enrollment number is required')
    .max(50, 'Enrollment number too long')
    .transform((val) => InputValidator.text(val, {
      minLength: 1,
      maxLength: 50,
      allowedChars: /^[A-Za-z0-9\-_]+$/,
      fieldName: 'Enrollment number'
    })),
  institution_id: z.string().transform((val) => InputValidator.uuid(val, 'Institution ID')),
});

// ============================================================================
// FILTER SCHEMAS
// ============================================================================

export const parentProfileFiltersSchema = z.object({
  institution_id: z.string().uuid().optional(),
  search: z.string().optional(),
  is_verified: z.boolean().optional(),
  relationship: z.enum(RELATIONSHIP_VALUES).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const communicationFiltersSchema = z.object({
  institution_id: z.string().uuid().optional(),
  parent_id: z.string().uuid().optional(),
  learner_id: z.string().uuid().optional(),
  type: z.enum(COMMUNICATION_TYPE_VALUES).optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  is_read: z.boolean().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const activityLogFiltersSchema = z.object({
  parent_id: z.string().uuid().optional(),
  activity_type: z.enum(ACTIVITY_TYPE_VALUES).optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type CreateParentProfileInput = z.infer<typeof createParentProfileSchema>;
export type UpdateParentProfileInput = z.infer<typeof updateParentProfileSchema>;
export type LinkLearnerInput = z.infer<typeof linkLearnerSchema>;
export type VerifyLinkInput = z.infer<typeof verifyLinkSchema>;
export type CreateCommunicationInput = z.infer<typeof createCommunicationSchema>;
export type UpdateCommunicationInput = z.infer<typeof updateCommunicationSchema>;
export type LogActivityInput = z.infer<typeof logActivitySchema>;
export type RequestOTPInput = z.infer<typeof requestOTPSchema>;
export type VerifyOTPInput = z.infer<typeof verifyOTPSchema>;
export type ParentRegistrationInput = z.infer<typeof parentRegistrationSchema>;
export type ParentProfileFiltersInput = z.infer<typeof parentProfileFiltersSchema>;
export type CommunicationFiltersInput = z.infer<typeof communicationFiltersSchema>;
export type ActivityLogFiltersInput = z.infer<typeof activityLogFiltersSchema>;
