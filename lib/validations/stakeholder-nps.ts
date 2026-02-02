/**
 * Stakeholder NPS Validation Schemas
 * Zod schemas for form validation and API request validation
 */

import { z } from 'zod';

export const StakeholderTypeSchema = z.enum(['student', 'parent', 'staff', 'alumni']);

export const NPSScoreSchema = z.number().int().min(0).max(10);

export const SurveyStatusSchema = z.enum(['draft', 'active', 'closed', 'archived']);

export const createNPSSurveySchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  stakeholder_types: z.array(StakeholderTypeSchema).min(1, 'Select at least one stakeholder type'),
  question: z.string().min(10, 'Question must be at least 10 characters').max(500, 'Question too long').optional(),
  start_date: z.string().datetime('Invalid start date'),
  end_date: z.string().datetime('Invalid end date'),
  status: SurveyStatusSchema.optional()
}).refine(
  (data) => new Date(data.end_date) > new Date(data.start_date),
  {
    message: 'End date must be after start date',
    path: ['end_date']
  }
);

export const updateNPSSurveySchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(1000).optional(),
  stakeholder_types: z.array(StakeholderTypeSchema).min(1).optional(),
  question: z.string().min(10).max(500).optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  status: SurveyStatusSchema.optional()
}).refine(
  (data) => {
    if (data.start_date && data.end_date) {
      return new Date(data.end_date) > new Date(data.start_date);
    }
    return true;
  },
  {
    message: 'End date must be after start date',
    path: ['end_date']
  }
);

export const submitNPSResponseSchema = z.object({
  survey_id: z.string().uuid('Invalid survey ID'),
  stakeholder_type: StakeholderTypeSchema,
  stakeholder_id: z.string().uuid('Invalid stakeholder ID'),
  stakeholder_email: z.string().email('Invalid email').optional(),
  stakeholder_name: z.string().max(200).optional(),
  score: NPSScoreSchema,
  feedback: z.string().max(2000, 'Feedback too long').optional()
});

export const npsSurveyFiltersSchema = z.object({
  institution_id: z.string().uuid(),
  status: z.union([SurveyStatusSchema, z.array(SurveyStatusSchema)]).optional(),
  stakeholder_type: StakeholderTypeSchema.optional(),
  start_date_from: z.string().datetime().optional(),
  start_date_to: z.string().datetime().optional(),
  search: z.string().max(100).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional()
});

export const npsResponseFiltersSchema = z.object({
  survey_id: z.string().uuid().optional(),
  institution_id: z.string().uuid().optional(),
  stakeholder_type: StakeholderTypeSchema.optional(),
  sentiment: z.enum(['promoter', 'passive', 'detractor']).optional(),
  score_min: NPSScoreSchema.optional(),
  score_max: NPSScoreSchema.optional(),
  has_feedback: z.boolean().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional()
});

export const npsAnalyticsFiltersSchema = z.object({
  institution_id: z.string().uuid(),
  stakeholder_type: StakeholderTypeSchema.optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  survey_id: z.string().uuid().optional()
});

export type CreateNPSSurveyInput = z.infer<typeof createNPSSurveySchema>;
export type UpdateNPSSurveyInput = z.infer<typeof updateNPSSurveySchema>;
export type SubmitNPSResponseInput = z.infer<typeof submitNPSResponseSchema>;
export type NPSSurveyFiltersInput = z.infer<typeof npsSurveyFiltersSchema>;
export type NPSResponseFiltersInput = z.infer<typeof npsResponseFiltersSchema>;
export type NPSAnalyticsFiltersInput = z.infer<typeof npsAnalyticsFiltersSchema>;

// Question schema for survey form
export const questionSchema = z.object({
  id: z.string(),
  type: z.enum(['nps', 'rating', 'text', 'multiple_choice', 'yes_no']),
  question: z.string().min(1, 'Question is required'),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional()
});

// Extended create survey schema with questions and single stakeholder type (for form)
export const createSurveyFormSchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title too long'),
  description: z.string().max(1000, 'Description too long').optional().nullable(),
  stakeholder_type: z.enum(['student', 'parent', 'staff', 'alumni', 'learner', 'industry', 'employer', 'community']),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  program_id: z.string().uuid().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  questions: z.array(questionSchema).optional()
}).refine(
  (data) => new Date(data.end_date) > new Date(data.start_date),
  {
    message: 'End date must be after start date',
    path: ['end_date']
  }
);

export type CreateSurveyFormInput = z.infer<typeof createSurveyFormSchema>;
export type NPSQuestion = z.infer<typeof questionSchema>;

// Aliases for backward compatibility
export const createSurveySchema = createSurveyFormSchema;
export const updateSurveySchema = updateNPSSurveySchema;
export type CreateSurveyFormValues = CreateSurveyFormInput;
export type UpdateSurveyFormValues = UpdateNPSSurveyInput;
