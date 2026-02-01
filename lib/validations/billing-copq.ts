// lib/validations/billing-copq.ts
// Zod validation schemas for Billing COPQ

import { z } from 'zod';
import { InputValidator } from '@/lib/utils/input-validator';

// COPQ category enum for validation
export const copqCategorySchema = z.enum([
  'refund_processing',
  'late_payment_followup',
  'invoice_error',
  'payment_reconciliation',
  'discount_dispute',
  'collection_cost',
  'bad_debt',
  'reputation_impact',
  'process_rework',
  'other'
]);

// COPQ status enum for validation
export const copqStatusSchema = z.enum([
  'logged',
  'investigating',
  'resolved',
  'written_off'
]);

// Schema for creating a new COPQ incident
export const createCOPQIncidentSchema = z.object({
  institution_id: z.string().transform((val) => InputValidator.uuid(val, 'Institution ID')),
  bill_id: z.string()
    .transform((val) => InputValidator.uuid(val, 'Bill ID'))
    .nullable()
    .optional(),
  learner_id: z.string()
    .transform((val) => InputValidator.uuid(val, 'Learner ID'))
    .nullable()
    .optional(),
  incident_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .transform((val) => {
      const date = InputValidator.date(val, 'Incident date');
      return date.toISOString().split('T')[0];
    }),
  category: copqCategorySchema,
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description must be less than 2000 characters')
    .transform((val) => InputValidator.text(val, {
      minLength: 10,
      maxLength: 2000,
      fieldName: 'Description'
    })),
  visible_cost: z
    .number()
    .transform((val) => InputValidator.number(val, {
      min: 0,
      max: 999999999.99,
      fieldName: 'Visible cost'
    }))
    .refine(
      (val) => Number.isFinite(val) && Math.round(val * 100) === val * 100,
      'Visible cost must have at most 2 decimal places (paisa precision)'
    )
    .default(0),
  hidden_cost_estimate: z
    .number()
    .transform((val) => InputValidator.number(val, {
      min: 0,
      max: 999999999.99,
      fieldName: 'Hidden cost'
    }))
    .refine(
      (val) => Number.isFinite(val) && Math.round(val * 100) === val * 100,
      'Hidden cost must have at most 2 decimal places (paisa precision)'
    )
    .default(0),
  time_spent_hours: z
    .number()
    .transform((val) => InputValidator.number(val, {
      min: 0,
      max: 999.99,
      fieldName: 'Time spent'
    }))
    .nullable()
    .optional(),
  affected_stakeholders: z
    .number()
    .transform((val) => InputValidator.number(val, {
      min: 1,
      max: 10000,
      integer: true,
      fieldName: 'Affected stakeholders'
    }))
    .default(1),
  root_cause: z
    .string()
    .max(1000, 'Root cause must be less than 1000 characters')
    .transform((val) => InputValidator.text(val, {
      maxLength: 1000,
      fieldName: 'Root cause'
    }))
    .nullable()
    .optional(),
  preventive_action: z
    .string()
    .max(1000, 'Preventive action must be less than 1000 characters')
    .transform((val) => InputValidator.text(val, {
      maxLength: 1000,
      fieldName: 'Preventive action'
    }))
    .nullable()
    .optional()
});

// Schema for updating a COPQ incident
export const updateCOPQIncidentSchema = z.object({
  bill_id: z.string().uuid('Invalid bill ID').nullable().optional(),
  learner_id: z.string().uuid('Invalid learner ID').nullable().optional(),
  incident_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  category: copqCategorySchema.optional(),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description must be less than 2000 characters')
    .optional(),
  visible_cost: z
    .number()
    .min(0, 'Visible cost cannot be negative')
    .max(999999999.99, 'Visible cost exceeds maximum allowed value')
    .refine(
      (val) => Number.isFinite(val) && Math.round(val * 100) === val * 100,
      'Visible cost must have at most 2 decimal places (paisa precision)'
    )
    .optional(),
  hidden_cost_estimate: z
    .number()
    .min(0, 'Hidden cost cannot be negative')
    .max(999999999.99, 'Hidden cost exceeds maximum allowed value')
    .refine(
      (val) => Number.isFinite(val) && Math.round(val * 100) === val * 100,
      'Hidden cost must have at most 2 decimal places (paisa precision)'
    )
    .optional(),
  time_spent_hours: z
    .number()
    .min(0, 'Time spent cannot be negative')
    .max(999.99, 'Time spent cannot exceed 999.99 hours')
    .nullable()
    .optional(),
  affected_stakeholders: z
    .number()
    .int('Must be a whole number')
    .min(1, 'At least 1 stakeholder must be affected')
    .max(10000, 'Affected stakeholders cannot exceed 10000')
    .optional(),
  root_cause: z
    .string()
    .max(1000, 'Root cause must be less than 1000 characters')
    .nullable()
    .optional(),
  preventive_action: z
    .string()
    .max(1000, 'Preventive action must be less than 1000 characters')
    .nullable()
    .optional(),
  status: copqStatusSchema.optional(),
  resolved_at: z.string().datetime().nullable().optional()
});

// Schema for resolving an incident
export const resolveCOPQIncidentSchema = z.object({
  preventive_action: z
    .string()
    .min(10, 'Preventive action must be at least 10 characters')
    .max(1000, 'Preventive action must be less than 1000 characters')
    .optional()
});

// Schema for query filters
export const copqFiltersSchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'), // REQUIRED for security
  category: copqCategorySchema.optional(),
  status: copqStatusSchema.optional(),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  search: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(10)
});

// Schema for summary query
export const copqSummaryFiltersSchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  year: z
    .number()
    .int()
    .min(2020)
    .max(2100)
    .optional()
});

// Type exports
export type CreateCOPQIncidentInput = z.infer<typeof createCOPQIncidentSchema>;
export type UpdateCOPQIncidentInput = z.infer<typeof updateCOPQIncidentSchema>;
export type ResolveCOPQIncidentInput = z.infer<typeof resolveCOPQIncidentSchema>;
export type COPQFiltersInput = z.infer<typeof copqFiltersSchema>;
export type COPQSummaryFiltersInput = z.infer<typeof copqSummaryFiltersSchema>;
