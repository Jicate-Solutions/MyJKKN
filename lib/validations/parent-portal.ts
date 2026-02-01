// lib/validations/parent-portal.ts

import { z } from 'zod';

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
  user_id: z.string().uuid('Invalid user ID'),
  institution_id: z.string().uuid('Invalid institution ID'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(255),
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number')
    .optional(),
  email: z.string().email('Invalid email address').optional(),
  relationship: z.enum(RELATIONSHIP_VALUES).optional(),
});

export const updateParentProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(255).optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number')
    .optional()
    .nullable(),
  email: z.string().email('Invalid email address').optional().nullable(),
  relationship: z.enum(RELATIONSHIP_VALUES).optional().nullable(),
  avatar_url: z.string().url('Invalid URL').optional().nullable(),
});

// ============================================================================
// PARENT-LEARNER LINK SCHEMAS
// ============================================================================

export const linkLearnerSchema = z.object({
  parent_id: z.string().uuid('Invalid parent ID'),
  learner_id: z.string().uuid('Invalid learner ID'),
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
  name: z.string().min(1),
  url: z.string().url(),
  type: z.string().min(1),
  size: z.number().min(0),
});

export const createCommunicationSchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  parent_id: z.string().uuid('Invalid parent ID').optional(),
  learner_id: z.string().uuid('Invalid learner ID').optional(),
  type: z.enum(COMMUNICATION_TYPE_VALUES, {
    required_error: 'Communication type is required',
  }),
  subject: z.string().min(1, 'Subject is required').max(255),
  content: z.string().min(1, 'Content is required'),
  priority: z.enum(PRIORITY_VALUES).default('normal'),
  sender_id: z.string().uuid('Invalid sender ID').optional(),
  attachments: z.array(attachmentSchema).default([]),
});

export const updateCommunicationSchema = z.object({
  read_at: z.string().datetime().optional(),
});

// ============================================================================
// ACTIVITY LOG SCHEMAS
// ============================================================================

export const logActivitySchema = z.object({
  parent_id: z.string().uuid('Invalid parent ID'),
  activity_type: z.enum(ACTIVITY_TYPE_VALUES, {
    required_error: 'Activity type is required',
  }),
  description: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).default({}),
  ip_address: z.string().ip().optional(),
  user_agent: z.string().max(500).optional(),
});

// ============================================================================
// OTP AUTHENTICATION SCHEMAS
// ============================================================================

export const requestOTPSchema = z.object({
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number format'),
  institution_id: z.string().uuid('Invalid institution ID'),
});

export const verifyOTPSchema = z.object({
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number format'),
  otp: z
    .string()
    .length(6, 'OTP must be 6 digits')
    .regex(/^[0-9]+$/, 'OTP must contain only numbers'),
  institution_id: z.string().uuid('Invalid institution ID'),
});

// ============================================================================
// REGISTRATION SCHEMAS
// ============================================================================

export const parentRegistrationSchema = z.object({
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number format'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(255),
  email: z.string().email('Invalid email address').optional(),
  relationship: z.enum(RELATIONSHIP_VALUES, {
    required_error: 'Relationship is required',
  }),
  learner_enrollment_number: z
    .string()
    .min(1, 'Enrollment number is required')
    .max(50),
  institution_id: z.string().uuid('Invalid institution ID'),
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
