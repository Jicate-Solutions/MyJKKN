// lib/validations/grievance.ts
// F004: Grievance Ticketing System - Zod Validation Schemas

import * as z from 'zod';
import { InputValidator } from '@/lib/utils/input-validator';

// Enums as Zod schemas
export const grievancePrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const grievanceStatusSchema = z.enum(['open', 'in_progress', 'pending_info', 'resolved', 'closed', 'reopened']);
export const grievanceSLAStatusSchema = z.enum(['on_track', 'at_risk', 'breached']);
export const raiserTypeSchema = z.enum(['learner', 'parent', 'staff', 'alumni']);
export const commentAuthorTypeSchema = z.enum(['staff', 'learner', 'parent', 'system']);

// Attachment schema
export const attachmentSchema = z.object({
  name: z.string()
    .min(1, 'File name is required')
    .max(255, 'File name too long')
    .transform((val) => InputValidator.text(val, {
      minLength: 1,
      maxLength: 255,
      fieldName: 'File name'
    })),
  url: z.string().transform((val) => InputValidator.url(val, { fieldName: 'File URL' })),
  type: z.string()
    .min(1, 'File type is required')
    .max(100, 'File type too long'),
  size: z.number()
    .transform((val) => InputValidator.number(val, {
      min: 0,
      max: 100 * 1024 * 1024, // 100 MB max
      fieldName: 'File size'
    }))
});

// ============================================================================
// Category Schemas
// ============================================================================

export const createGrievanceCategorySchema = z.object({
  institution_id: z.string().transform((val) => InputValidator.uuid(val, 'Institution ID')),
  name: z
    .string()
    .min(1, 'Category name is required')
    .max(100, 'Category name must be less than 100 characters')
    .transform((val) => InputValidator.text(val, {
      minLength: 1,
      maxLength: 100,
      fieldName: 'Category name'
    })),
  description: z
    .string()
    .max(500, 'Description must be less than 500 characters')
    .transform((val) => InputValidator.text(val, {
      maxLength: 500,
      fieldName: 'Description'
    }))
    .optional()
    .nullable(),
  parent_id: z.string()
    .transform((val) => InputValidator.uuid(val, 'Parent category ID'))
    .optional()
    .nullable(),
  default_sla_hours: z
    .number()
    .transform((val) => InputValidator.number(val, {
      min: 1,
      max: 720,
      integer: true,
      fieldName: 'SLA hours'
    }))
    .optional()
    .default(48),
  default_assignee_role: z
    .string()
    .max(100, 'Role must be less than 100 characters')
    .transform((val) => InputValidator.text(val, {
      maxLength: 100,
      fieldName: 'Assignee role'
    }))
    .optional()
    .nullable(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number()
    .transform((val) => InputValidator.number(val, {
      min: 0,
      integer: true,
      fieldName: 'Sort order'
    }))
    .optional()
    .default(0)
});

export const updateGrievanceCategorySchema = createGrievanceCategorySchema.partial().omit({
  institution_id: true
});

export const categoryFiltersSchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  parent_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
  search: z.string().optional()
});

// ============================================================================
// Ticket Schemas
// ============================================================================

export const createGrievanceTicketSchema = z.object({
  institution_id: z.string().transform((val) => InputValidator.uuid(val, 'Institution ID')),
  category_id: z.string().transform((val) => InputValidator.uuid(val, 'Category ID')),
  subject: z
    .string()
    .min(3, 'Subject must be at least 3 characters')
    .max(255, 'Subject must be less than 255 characters')
    .transform((val) => InputValidator.text(val, {
      minLength: 3,
      maxLength: 255,
      fieldName: 'Subject'
    })),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(5000, 'Description must be less than 5000 characters')
    .transform((val) => InputValidator.text(val, {
      minLength: 10,
      maxLength: 5000,
      fieldName: 'Description'
    })),
  priority: grievancePrioritySchema.optional().default('medium'),
  raised_by_type: raiserTypeSchema,
  raised_by_id: z.string()
    .transform((val) => InputValidator.uuid(val, 'Raiser ID'))
    .optional()
    .nullable(),
  raised_by_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(255, 'Name must be less than 255 characters')
    .transform((val) => InputValidator.text(val, {
      minLength: 2,
      maxLength: 255,
      fieldName: 'Raiser name'
    })),
  raised_by_email: z
    .string()
    .transform((val) => val ? InputValidator.email(val) : val)
    .optional()
    .nullable()
    .or(z.literal('')),
  raised_by_phone: z
    .string()
    .transform((val) => val ? InputValidator.phoneNumber(val) : val)
    .optional()
    .nullable()
    .or(z.literal('')),
  attachments: z.array(attachmentSchema)
    .max(10, 'Too many attachments (max 10)')
    .optional()
    .default([]),
  metadata: z.record(z.unknown())
    .transform((val) => InputValidator.json(val, 100000))
    .optional()
    .default({})
});

export const updateGrievanceTicketSchema = z.object({
  category_id: z.string().uuid('Invalid category ID').optional(),
  subject: z
    .string()
    .min(3, 'Subject must be at least 3 characters')
    .max(255, 'Subject must be less than 255 characters')
    .optional(),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(5000, 'Description must be less than 5000 characters')
    .optional(),
  priority: grievancePrioritySchema.optional(),
  status: grievanceStatusSchema.optional(),
  assigned_to: z.string().uuid('Invalid assignee ID').optional().nullable(),
  department_id: z.string().uuid('Invalid department ID').optional().nullable(),
  resolution: z.string().max(5000, 'Resolution must be less than 5000 characters').optional().nullable(),
  attachments: z.array(attachmentSchema).optional(),
  metadata: z.record(z.unknown()).optional()
});

export const assignGrievanceTicketSchema = z.object({
  assignee_id: z.string().uuid('Invalid assignee ID'),
  department_id: z.string().uuid('Invalid department ID').optional().nullable()
});

export const resolveGrievanceTicketSchema = z.object({
  resolution: z
    .string()
    .min(10, 'Resolution must be at least 10 characters')
    .max(5000, 'Resolution must be less than 5000 characters')
});

export const rateSatisfactionSchema = z.object({
  rating: z
    .number()
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating cannot exceed 5'),
  feedback: z
    .string()
    .max(1000, 'Feedback must be less than 1000 characters')
    .optional()
    .nullable()
});

export const ticketFiltersSchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  status: grievanceStatusSchema.optional(),
  sla_status: grievanceSLAStatusSchema.optional(),
  priority: grievancePrioritySchema.optional(),
  assigned_to: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  raised_by_type: raiserTypeSchema.optional(),
  raised_by_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  search: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(10),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional()
});

// ============================================================================
// Comment Schemas
// ============================================================================

export const createGrievanceCommentSchema = z.object({
  author_id: z.string()
    .transform((val) => InputValidator.uuid(val, 'Author ID'))
    .optional()
    .nullable(),
  author_name: z
    .string()
    .min(2, 'Author name must be at least 2 characters')
    .max(255, 'Author name must be less than 255 characters')
    .transform((val) => InputValidator.text(val, {
      minLength: 2,
      maxLength: 255,
      fieldName: 'Author name'
    })),
  author_type: commentAuthorTypeSchema,
  content: z
    .string()
    .min(1, 'Comment content is required')
    .max(5000, 'Comment must be less than 5000 characters')
    .transform((val) => InputValidator.text(val, {
      minLength: 1,
      maxLength: 5000,
      fieldName: 'Comment content'
    })),
  is_internal: z.boolean().optional().default(false),
  attachments: z.array(attachmentSchema)
    .max(10, 'Too many attachments (max 10)')
    .optional()
    .default([])
});

// ============================================================================
// Export Types
// ============================================================================

export type CreateGrievanceCategoryInput = z.infer<typeof createGrievanceCategorySchema>;
export type UpdateGrievanceCategoryInput = z.infer<typeof updateGrievanceCategorySchema>;
export type CategoryFiltersInput = z.infer<typeof categoryFiltersSchema>;

export type CreateGrievanceTicketInput = z.infer<typeof createGrievanceTicketSchema>;
export type UpdateGrievanceTicketInput = z.infer<typeof updateGrievanceTicketSchema>;
export type AssignGrievanceTicketInput = z.infer<typeof assignGrievanceTicketSchema>;
export type ResolveGrievanceTicketInput = z.infer<typeof resolveGrievanceTicketSchema>;
export type RateSatisfactionInput = z.infer<typeof rateSatisfactionSchema>;
export type TicketFiltersInput = z.infer<typeof ticketFiltersSchema>;

export type CreateGrievanceCommentInput = z.infer<typeof createGrievanceCommentSchema>;
