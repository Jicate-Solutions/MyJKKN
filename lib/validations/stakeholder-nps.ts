// Stakeholder NPS Validations
// Zod schemas for form validation

import { z } from 'zod';
import type { StakeholderType, SurveyStatus, QuestionType } from '@/types/stakeholder-nps';

// Stakeholder type validation
export const stakeholderTypeSchema = z.enum(['parent', 'learner', 'alumni', 'industry', 'staff']);

// Survey status validation
export const surveyStatusSchema = z.enum(['draft', 'active', 'closed', 'archived']);

// Question type validation
export const questionTypeSchema = z.enum(['nps', 'text', 'rating', 'multiple_choice', 'yes_no']);

// NPS Question Schema
export const npsQuestionSchema = z.object({
  id: z.string().uuid('Question ID must be a valid UUID'),
  type: questionTypeSchema,
  question: z.string().min(5, 'Question must be at least 5 characters').max(500, 'Question must be less than 500 characters'),
  required: z.boolean().default(true),
  options: z.array(z.string()).optional(),
  min_value: z.number().optional(),
  max_value: z.number().optional()
}).refine((data) => {
  // If type is multiple_choice, options are required
  if (data.type === 'multiple_choice') {
    return data.options && data.options.length >= 2;
  }
  return true;
}, {
  message: 'Multiple choice questions require at least 2 options',
  path: ['options']
});

// Create Survey Schema
export const createSurveySchema = z.object({
  institution_id: z.string().uuid('Institution ID must be a valid UUID'),
  title: z.string()
    .min(3, 'Title must be at least 3 characters')
    .max(255, 'Title must be less than 255 characters'),
  description: z.string()
    .max(2000, 'Description must be less than 2000 characters')
    .optional()
    .nullable(),
  stakeholder_type: stakeholderTypeSchema,
  department_id: z.string().uuid('Department ID must be a valid UUID').optional().nullable(),
  program_id: z.string().uuid('Program ID must be a valid UUID').optional().nullable(),
  start_date: z.string().refine((date) => {
    return !isNaN(Date.parse(date));
  }, 'Start date must be a valid date'),
  end_date: z.string().refine((date) => {
    return !isNaN(Date.parse(date));
  }, 'End date must be a valid date'),
  questions: z.array(npsQuestionSchema).min(1, 'At least one question is required')
}).refine((data) => {
  const start = new Date(data.start_date);
  const end = new Date(data.end_date);
  return end >= start;
}, {
  message: 'End date must be after or equal to start date',
  path: ['end_date']
});

// Update Survey Schema
export const updateSurveySchema = z.object({
  title: z.string()
    .min(3, 'Title must be at least 3 characters')
    .max(255, 'Title must be less than 255 characters')
    .optional(),
  description: z.string()
    .max(2000, 'Description must be less than 2000 characters')
    .optional()
    .nullable(),
  department_id: z.string().uuid('Department ID must be a valid UUID').optional().nullable(),
  program_id: z.string().uuid('Program ID must be a valid UUID').optional().nullable(),
  start_date: z.string().refine((date) => {
    return !isNaN(Date.parse(date));
  }, 'Start date must be a valid date').optional(),
  end_date: z.string().refine((date) => {
    return !isNaN(Date.parse(date));
  }, 'End date must be a valid date').optional(),
  status: surveyStatusSchema.optional(),
  questions: z.array(npsQuestionSchema).min(1, 'At least one question is required').optional()
}).refine((data) => {
  if (data.start_date && data.end_date) {
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    return end >= start;
  }
  return true;
}, {
  message: 'End date must be after or equal to start date',
  path: ['end_date']
});

// Submit Response Schema
export const submitResponseSchema = z.object({
  survey_id: z.string().uuid('Survey ID must be a valid UUID'),
  respondent_id: z.string().uuid('Respondent ID must be a valid UUID').optional().nullable(),
  respondent_type: stakeholderTypeSchema,
  respondent_email: z.string().email('Invalid email address').optional().nullable(),
  respondent_name: z.string().max(255, 'Name must be less than 255 characters').optional().nullable(),
  nps_score: z.number()
    .int('Score must be a whole number')
    .min(0, 'Score must be at least 0')
    .max(10, 'Score must be at most 10'),
  additional_feedback: z.string()
    .max(5000, 'Feedback must be less than 5000 characters')
    .optional()
    .nullable(),
  question_responses: z.record(z.unknown()).optional().default({}),
  department_id: z.string().uuid('Department ID must be a valid UUID').optional().nullable()
});

// Survey Filters Schema
export const surveyFiltersSchema = z.object({
  institution_id: z.string().uuid().optional(),
  stakeholder_type: stakeholderTypeSchema.optional(),
  status: surveyStatusSchema.optional(),
  department_id: z.string().uuid().optional(),
  program_id: z.string().uuid().optional(),
  search: z.string().optional(),
  start_date_from: z.string().optional(),
  start_date_to: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(10),
  sortBy: z.string().optional().default('created_at'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('desc')
});

// Response Filters Schema
export const responseFiltersSchema = z.object({
  survey_id: z.string().uuid().optional(),
  nps_category: z.enum(['promoter', 'passive', 'detractor']).optional(),
  department_id: z.string().uuid().optional(),
  respondent_type: stakeholderTypeSchema.optional(),
  submitted_from: z.string().optional(),
  submitted_to: z.string().optional(),
  search: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(10),
  sortBy: z.string().optional().default('submitted_at'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('desc')
});

// Analytics Filters Schema
export const analyticsFiltersSchema = z.object({
  institution_id: z.string().uuid().optional(),
  stakeholder_type: stakeholderTypeSchema.optional(),
  department_id: z.string().uuid().optional(),
  period_start: z.string().optional(),
  period_end: z.string().optional()
});

// Type exports for form values
export type CreateSurveyFormValues = z.infer<typeof createSurveySchema>;
export type UpdateSurveyFormValues = z.infer<typeof updateSurveySchema>;
export type SubmitResponseFormValues = z.infer<typeof submitResponseSchema>;
export type SurveyFiltersFormValues = z.infer<typeof surveyFiltersSchema>;
export type ResponseFiltersFormValues = z.infer<typeof responseFiltersSchema>;
export type AnalyticsFiltersFormValues = z.infer<typeof analyticsFiltersSchema>;
