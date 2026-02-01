// lib/validations/process-excellence.ts
// Zod validation schemas for Process Excellence module

import { z } from 'zod';

// =============================================
// Enums
// =============================================

export const wasteCategorySchema = z.enum(['T', 'I', 'M', 'W', 'O1', 'O2', 'D', 'TU']);
export const processCategorySchema = z.enum(['admission', 'billing', 'academic', 'staff', 'grievance']);
export const slaStatusSchema = z.enum(['on_track', 'at_risk', 'breached']);
export const abcdRatingSchema = z.enum(['A', 'B', 'C', 'D']);
export const wasteStatusSchema = z.enum(['open', 'investigating', 'resolved', 'dismissed']);
export const auditStatusSchema = z.enum(['draft', 'in_review', 'finalized']);

// =============================================
// Process Stage Schema
// =============================================

export const processStageSchema = z.object({
  name: z.string()
    .min(1, 'Stage name is required')
    .max(100, 'Stage name must be less than 100 characters'),
  expected_duration_hours: z.number()
    .min(0, 'Duration must be non-negative')
    .max(8760, 'Duration cannot exceed 1 year (8760 hours)'),
  is_value_add: z.boolean(),
  description: z.string().max(500).optional(),
  order: z.number().int().min(0).optional()
});

// =============================================
// Process Definition Schemas
// =============================================

export const createProcessDefinitionSchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  name: z.string()
    .min(1, 'Process name is required')
    .max(255, 'Process name must be less than 255 characters')
    .regex(
      /^[a-zA-Z0-9\s\-_()]+$/,
      'Process name can only contain letters, numbers, spaces, hyphens, underscores, and parentheses'
    ),
  description: z.string().max(2000, 'Description must be less than 2000 characters').nullable().optional(),
  category: processCategorySchema,
  stages: z.array(processStageSchema)
    .min(1, 'At least one stage is required')
    .max(20, 'Maximum 20 stages allowed'),
  target_cycle_time_hours: z.number()
    .int()
    .min(1, 'Target cycle time must be at least 1 hour')
    .max(8760, 'Target cycle time cannot exceed 1 year')
    .nullable()
    .optional(),
  target_value_add_ratio: z.number()
    .min(0, 'Value-add ratio must be at least 0%')
    .max(100, 'Value-add ratio cannot exceed 100%')
    .nullable()
    .optional(),
  sla_hours: z.number()
    .int()
    .min(1, 'SLA must be at least 1 hour')
    .max(8760, 'SLA cannot exceed 1 year')
    .nullable()
    .optional(),
  is_active: z.boolean().optional().default(true)
});

export const updateProcessDefinitionSchema = z.object({
  name: z.string()
    .min(1, 'Process name is required')
    .max(255, 'Process name must be less than 255 characters')
    .regex(
      /^[a-zA-Z0-9\s\-_()]+$/,
      'Process name can only contain letters, numbers, spaces, hyphens, underscores, and parentheses'
    )
    .optional(),
  description: z.string().max(2000).nullable().optional(),
  category: processCategorySchema.optional(),
  stages: z.array(processStageSchema)
    .min(1, 'At least one stage is required')
    .max(20, 'Maximum 20 stages allowed')
    .optional(),
  target_cycle_time_hours: z.number().int().min(1).max(8760).nullable().optional(),
  target_value_add_ratio: z.number().min(0).max(100).nullable().optional(),
  sla_hours: z.number().int().min(1).max(8760).nullable().optional(),
  is_active: z.boolean().optional()
});

// =============================================
// Process Instance Schemas
// =============================================

export const startProcessInstanceSchema = z.object({
  process_id: z.string().uuid('Invalid process ID'),
  reference_type: z.string()
    .min(1, 'Reference type is required')
    .max(50, 'Reference type must be less than 50 characters'),
  reference_id: z.string().uuid('Invalid reference ID')
});

export const advanceStageSchema = z.object({
  new_stage: z.string()
    .min(1, 'Stage name is required')
    .max(100, 'Stage name must be less than 100 characters'),
  is_value_add: z.boolean().optional()
});

// =============================================
// Waste Incident Schemas
// =============================================

export const createWasteIncidentSchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  process_instance_id: z.string().uuid().nullable().optional(),
  process_id: z.string().uuid().nullable().optional(),
  waste_category: wasteCategorySchema,
  description: z.string()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description must be less than 2000 characters'),
  estimated_time_lost_hours: z.number()
    .min(0, 'Time lost must be non-negative')
    .max(1000, 'Time lost seems unreasonably high')
    .nullable()
    .optional(),
  estimated_cost_impact: z.number()
    .min(0, 'Cost impact must be non-negative')
    .max(10000000, 'Cost impact seems unreasonably high')
    .nullable()
    .optional(),
  root_cause: z.string().max(2000).nullable().optional(),
  corrective_action: z.string().max(2000).nullable().optional()
});

export const updateWasteIncidentSchema = z.object({
  waste_category: wasteCategorySchema.optional(),
  description: z.string()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description must be less than 2000 characters')
    .optional(),
  estimated_time_lost_hours: z.number().min(0).max(1000).nullable().optional(),
  estimated_cost_impact: z.number().min(0).max(10000000).nullable().optional(),
  root_cause: z.string().max(2000).nullable().optional(),
  corrective_action: z.string().max(2000).nullable().optional(),
  status: wasteStatusSchema.optional()
});

// =============================================
// Process Audit Schemas
// =============================================

export const createProcessAuditSchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  process_id: z.string().uuid('Invalid process ID'),
  audit_period_start: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  audit_period_end: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  auditor_id: z.string().uuid().nullable().optional(),
  findings: z.string().max(5000).nullable().optional(),
  recommendations: z.string().max(5000).nullable().optional()
}).refine(
  (data) => new Date(data.audit_period_end) >= new Date(data.audit_period_start),
  {
    message: 'End date must be on or after start date',
    path: ['audit_period_end']
  }
);

export const updateProcessAuditSchema = z.object({
  findings: z.string().max(5000).nullable().optional(),
  recommendations: z.string().max(5000).nullable().optional(),
  abcd_rating: abcdRatingSchema.nullable().optional(),
  status: auditStatusSchema.optional()
});

// =============================================
// Filter Schemas
// =============================================

export const processDefinitionFiltersSchema = z.object({
  search: z.string().optional(),
  institution_id: z.string().uuid().optional(),
  category: processCategorySchema.optional(),
  is_active: z.boolean().optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(10),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional()
});

export const processInstanceFiltersSchema = z.object({
  search: z.string().optional(),
  institution_id: z.string().uuid().optional(),
  process_id: z.string().uuid().optional(),
  reference_type: z.string().optional(),
  sla_status: slaStatusSchema.optional(),
  is_completed: z.boolean().optional(),
  started_from: z.string().optional(),
  started_to: z.string().optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(10),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional()
});

export const wasteIncidentFiltersSchema = z.object({
  search: z.string().optional(),
  institution_id: z.string().uuid().optional(),
  process_id: z.string().uuid().optional(),
  process_instance_id: z.string().uuid().optional(),
  waste_category: wasteCategorySchema.optional(),
  status: wasteStatusSchema.optional(),
  reported_from: z.string().optional(),
  reported_to: z.string().optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(10),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional()
});

export const processAuditFiltersSchema = z.object({
  search: z.string().optional(),
  institution_id: z.string().uuid().optional(),
  process_id: z.string().uuid().optional(),
  auditor_id: z.string().uuid().optional(),
  abcd_rating: abcdRatingSchema.optional(),
  status: auditStatusSchema.optional(),
  period_from: z.string().optional(),
  period_to: z.string().optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(10),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional()
});

export const processMetricsFiltersSchema = z.object({
  institution_id: z.string().uuid('Institution ID is required'),
  process_id: z.string().uuid().optional(),
  category: processCategorySchema.optional(),
  period_start: z.string().optional(),
  period_end: z.string().optional()
});

// =============================================
// Type exports from schemas
// =============================================

export type CreateProcessDefinitionInput = z.infer<typeof createProcessDefinitionSchema>;
export type UpdateProcessDefinitionInput = z.infer<typeof updateProcessDefinitionSchema>;
export type StartProcessInstanceInput = z.infer<typeof startProcessInstanceSchema>;
export type AdvanceStageInput = z.infer<typeof advanceStageSchema>;
export type CreateWasteIncidentInput = z.infer<typeof createWasteIncidentSchema>;
export type UpdateWasteIncidentInput = z.infer<typeof updateWasteIncidentSchema>;
export type CreateProcessAuditInput = z.infer<typeof createProcessAuditSchema>;
export type UpdateProcessAuditInput = z.infer<typeof updateProcessAuditSchema>;
export type ProcessDefinitionFiltersInput = z.infer<typeof processDefinitionFiltersSchema>;
export type ProcessInstanceFiltersInput = z.infer<typeof processInstanceFiltersSchema>;
export type WasteIncidentFiltersInput = z.infer<typeof wasteIncidentFiltersSchema>;
export type ProcessAuditFiltersInput = z.infer<typeof processAuditFiltersSchema>;
export type ProcessMetricsFiltersInput = z.infer<typeof processMetricsFiltersSchema>;
