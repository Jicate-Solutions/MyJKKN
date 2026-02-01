// lib/validations/maturity-assessment.ts

import * as z from 'zod';
import { MATURITY_DIMENSIONS } from '@/types/maturity-assessment';

// Maturity Stage Schema (1-4)
export const maturityStageSchema = z
  .number()
  .int()
  .min(1, 'Stage must be at least 1')
  .max(4, 'Stage cannot exceed 4');

// Assessment Status Schema
export const assessmentStatusSchema = z.enum([
  'draft',
  'submitted',
  'approved',
  'archived'
]);

// Progress Status Schema
export const progressStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'blocked'
]);

// Dimension Name Schema
export const dimensionNameSchema = z.enum([
  'Leadership',
  'Strategy',
  'People',
  'Processes',
  'Resources',
  'Results'
]);

// Dimension Scores Schema
export const dimensionScoresSchema = z.object({
  Leadership: maturityStageSchema,
  Strategy: maturityStageSchema,
  People: maturityStageSchema,
  Processes: maturityStageSchema,
  Resources: maturityStageSchema,
  Results: maturityStageSchema
});

// Dimension Definition Schema
export const maturityDimensionSchema = z.object({
  name: dimensionNameSchema,
  description: z.string().min(1, 'Description is required'),
  stage_1_criteria: z.string().min(1, 'Stage 1 criteria is required'),
  stage_2_criteria: z.string().min(1, 'Stage 2 criteria is required'),
  stage_3_criteria: z.string().min(1, 'Stage 3 criteria is required'),
  stage_4_criteria: z.string().min(1, 'Stage 4 criteria is required')
});

// ============================================================
// Framework Schemas
// ============================================================

export const createFrameworkSchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  name: z
    .string()
    .min(1, 'Framework name is required')
    .max(255, 'Name must be less than 255 characters')
    .default('Excellence Journey'),
  description: z.string().max(2000, 'Description must be less than 2000 characters').optional(),
  dimensions: z.array(maturityDimensionSchema).optional()
});

export const updateFrameworkSchema = z.object({
  name: z
    .string()
    .min(1, 'Framework name is required')
    .max(255, 'Name must be less than 255 characters')
    .optional(),
  description: z.string().max(2000, 'Description must be less than 2000 characters').optional(),
  dimensions: z.array(maturityDimensionSchema).optional(),
  is_active: z.boolean().optional()
});

// ============================================================
// Assessment Schemas
// ============================================================

// Coercing stage schema for API validation (returns number that matches MaturityStage)
const coercedStageSchema = z.coerce.number().int().min(1).max(4);

export const createAssessmentSchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  framework_id: z.string().uuid('Invalid framework ID'),
  department_id: z.string().uuid('Invalid department ID').nullable().optional(),
  assessment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
    .refine(
      (date) => {
        const d = new Date(date);
        return !isNaN(d.getTime());
      },
      { message: 'Invalid date' }
    ),
  assessor_id: z.string().uuid('Invalid assessor ID').optional(),
  dimension_scores: z.object({
    Leadership: coercedStageSchema,
    Strategy: coercedStageSchema,
    People: coercedStageSchema,
    Processes: coercedStageSchema,
    Resources: coercedStageSchema,
    Results: coercedStageSchema
  }),
  evidence: z.string().max(10000, 'Evidence must be less than 10000 characters').optional(),
  improvement_plan: z
    .string()
    .max(10000, 'Improvement plan must be less than 10000 characters')
    .optional(),
  target_stage: coercedStageSchema.optional(),
  target_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
    .optional()
    .nullable()
});

export const updateAssessmentSchema = z.object({
  department_id: z.string().uuid('Invalid department ID').nullable().optional(),
  assessment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
    .optional(),
  dimension_scores: dimensionScoresSchema.optional(),
  evidence: z.string().max(10000, 'Evidence must be less than 10000 characters').optional(),
  improvement_plan: z
    .string()
    .max(10000, 'Improvement plan must be less than 10000 characters')
    .optional(),
  target_stage: maturityStageSchema.nullable().optional(),
  target_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
    .nullable()
    .optional(),
  status: assessmentStatusSchema.optional()
});

export const submitAssessmentSchema = z.object({
  id: z.string().uuid('Invalid assessment ID')
});

export const approveAssessmentSchema = z.object({
  id: z.string().uuid('Invalid assessment ID'),
  reviewer_id: z.string().uuid('Invalid reviewer ID')
});

// ============================================================
// Progress Item Schemas
// ============================================================

export const createProgressItemSchema = z.object({
  assessment_id: z.string().uuid('Invalid assessment ID'),
  action_item: z
    .string()
    .min(1, 'Action item is required')
    .max(500, 'Action item must be less than 500 characters'),
  dimension: dimensionNameSchema,
  target_stage: z.coerce.number().int().min(1).max(4),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
    .optional()
    .nullable(),
  notes: z.string().max(2000, 'Notes must be less than 2000 characters').optional(),
  assigned_to: z.string().uuid('Invalid user ID').optional().nullable()
});

export const updateProgressItemSchema = z.object({
  action_item: z
    .string()
    .min(1, 'Action item is required')
    .max(500, 'Action item must be less than 500 characters')
    .optional(),
  dimension: dimensionNameSchema.optional(),
  target_stage: z.coerce.number().int().min(1).max(4).optional(),
  status: progressStatusSchema.optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
    .nullable()
    .optional(),
  completed_at: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000, 'Notes must be less than 2000 characters').optional().nullable(),
  assigned_to: z.string().uuid('Invalid user ID').optional().nullable()
});

// ============================================================
// Evidence Schemas
// ============================================================

export const createEvidenceSchema = z.object({
  assessment_id: z.string().uuid('Invalid assessment ID'),
  dimension: dimensionNameSchema,
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be less than 255 characters'),
  description: z.string().max(2000, 'Description must be less than 2000 characters').optional().nullable(),
  file_url: z.string().url('Invalid file URL').optional().nullable(),
  file_type: z.string().max(50, 'File type must be less than 50 characters').optional().nullable()
});

// ============================================================
// Filter Schemas
// ============================================================

export const assessmentFiltersSchema = z.object({
  institution_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  status: assessmentStatusSchema.optional(),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')
    .optional(),
  assessor_id: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(10),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional()
});

export const progressFiltersSchema = z.object({
  assessment_id: z.string().uuid().optional(),
  dimension: dimensionNameSchema.optional(),
  status: progressStatusSchema.optional(),
  assigned_to: z.string().uuid().optional(),
  overdue: z.boolean().optional(),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(10)
});

// ============================================================
// Form Schemas (for React Hook Form)
// ============================================================

export const assessmentFormSchema = z.object({
  framework_id: z.string().uuid('Please select a framework'),
  department_id: z.string().uuid().nullable().optional(),
  assessment_date: z.string().min(1, 'Assessment date is required'),
  dimension_scores: dimensionScoresSchema,
  evidence: z.string().optional(),
  improvement_plan: z.string().optional(),
  target_stage: z.coerce.number().min(1).max(4).optional(),
  target_date: z.string().optional().nullable()
});

export const progressItemFormSchema = z.object({
  action_item: z.string().min(1, 'Action item is required'),
  dimension: dimensionNameSchema,
  target_stage: z.coerce.number().min(1).max(4),
  due_date: z.string().optional().nullable(),
  notes: z.string().optional(),
  assigned_to: z.string().uuid().optional().nullable()
});

// ============================================================
// Type Exports
// ============================================================

export type CreateFrameworkInput = z.infer<typeof createFrameworkSchema>;
export type UpdateFrameworkInput = z.infer<typeof updateFrameworkSchema>;
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;
export type CreateProgressItemInput = z.infer<typeof createProgressItemSchema>;
export type UpdateProgressItemInput = z.infer<typeof updateProgressItemSchema>;
export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;
export type AssessmentFiltersInput = z.infer<typeof assessmentFiltersSchema>;
export type ProgressFiltersInput = z.infer<typeof progressFiltersSchema>;
export type AssessmentFormInput = z.infer<typeof assessmentFormSchema>;
export type ProgressItemFormInput = z.infer<typeof progressItemFormSchema>;
