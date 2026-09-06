/**
 * Learner Risk Intelligence — TypeScript types
 *
 * Matches the database substrate in:
 *   supabase/migrations/20260525200000_learner_risk_intelligence_substrate.sql
 *
 * Tables: learner_risk_assessments, learner_pulse_responses, learner_interventions
 * MV: mv_learner_attendance_summary
 * RPC: compute_learner_risk_assessment
 */

import { z } from 'zod';

// ────────────────────────────────────────────
// Enums / Unions
// ────────────────────────────────────────────

export type RiskTier = 'critical' | 'high' | 'moderate' | 'low' | 'healthy';

export type RiskConfidence = 'low' | 'medium' | 'high';

export type TrendDirection = 'improving' | 'stable' | 'worsening';

export type PulseType = 'belonging' | 'academic_fit' | 'wellbeing' | 'custom';

export type InterventionType =
  | 'call'
  | 'meeting'
  | 'referral_counselor'
  | 'referral_hod'
  | 'parent_contact'
  | 'other';

export type InterventionOutcome = 'pending' | 'resolved' | 'escalated' | 'no_response';

// ────────────────────────────────────────────
// Dimension Scores (typed JSONB shape)
// ────────────────────────────────────────────

export interface DimensionScores {
  engagement: number;
  attendance: number;
  fees: number;
  academic: number;
  wellness: number;
  hostel: number;
  belonging: number;
}

// ────────────────────────────────────────────
// learner_risk_assessments
// ────────────────────────────────────────────

export interface LearnerRiskAssessment {
  id: string;
  learner_id: string;
  institution_id: string;
  assessment_date: string; // DATE as ISO string
  composite_risk_score: number; // 0-100
  risk_tier: RiskTier;
  confidence: RiskConfidence;
  dimension_scores: DimensionScores;
  risk_factors: string[];
  recommended_actions: string[];
  previous_risk_score: number | null;
  trend_direction: TrendDirection | null;
  created_at: string;
}

// ────────────────────────────────────────────
// learner_pulse_responses
// ────────────────────────────────────────────

export interface PulseResponse {
  id: string;
  learner_id: string;
  institution_id: string;
  notification_id: string | null;
  pulse_type: PulseType;
  question_text: string;
  response_value: string;
  response_sentiment: -1 | 0 | 1 | null;
  responded_at: string;
  days_since_enrollment: number | null;
  created_at: string;
}

// ────────────────────────────────────────────
// learner_interventions
// ────────────────────────────────────────────

export interface LearnerIntervention {
  id: string;
  learner_id: string;
  institution_id: string;
  intervener_id: string;
  intervention_type: InterventionType;
  notes: string | null;
  risk_score_at_time: number | null;
  outcome: InterventionOutcome;
  follow_up_date: string | null; // DATE as ISO string
  created_at: string;
  updated_at: string;
}

// ────────────────────────────────────────────
// mv_learner_attendance_summary
// ────────────────────────────────────────────

export interface LearnerAttendanceSummary {
  learner_id: string;
  institution_id: string;
  section_id: string;
  total_classes_14d: number;
  total_present_14d: number;
  last_14d_pct: number | null;
  prior_14d_pct: number | null;
  delta_pct: number | null;
  last_absent_date: string | null;
  computed_at: string;
}

// ────────────────────────────────────────────
// Joined / Composite Types
// ────────────────────────────────────────────

/** Risk assessment joined with learner profile data for UI display */
export interface LearnerRiskWithProfile extends LearnerRiskAssessment {
  learner_name: string;
  roll_number: string | null;
  register_number: string | null;
  section_name: string | null;
  department_name: string | null;
  program_name: string | null;
  student_photo_url: string | null;
}

/** Dashboard header: count of learners by risk tier */
export interface LearnerRiskSummary {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  healthy: number;
  total: number;
  assessment_date: string;
  confidence_distribution: {
    low: number;
    medium: number;
    high: number;
  };
}

// ────────────────────────────────────────────
// Filters
// ────────────────────────────────────────────

export interface LearnerRiskAssessmentFilters {
  institution_id: string;
  department_id?: string;
  section_id?: string;
  risk_tier?: RiskTier | RiskTier[];
  confidence?: RiskConfidence;
  trend_direction?: TrendDirection;
  date_from?: string;
  date_to?: string;
  search?: string; // learner name / roll number
  page?: number;
  page_size?: number;
}

// ────────────────────────────────────────────
// Policy config types
// ────────────────────────────────────────────

export interface RiskWeights {
  engagement: number;
  attendance: number;
  fees: number;
  academic: number;
  wellness: number;
  hostel: number;
  belonging: number;
}

export interface TierThresholds {
  critical: number;
  high: number;
  moderate: number;
  low: number;
}

export interface PulseScheduleEntry {
  day: number;
  type: PulseType;
  question: string;
}

// ────────────────────────────────────────────
// RPC return type
// ────────────────────────────────────────────

export interface ComputeRiskResult {
  processed_count: number;
  critical_count: number;
  high_count: number;
}

// ────────────────────────────────────────────
// Zod schemas (API validation)
// ────────────────────────────────────────────

export const RiskTierSchema = z.enum(['critical', 'high', 'moderate', 'low', 'healthy']);
export const RiskConfidenceSchema = z.enum(['low', 'medium', 'high']);
export const TrendDirectionSchema = z.enum(['improving', 'stable', 'worsening']);
export const PulseTypeSchema = z.enum(['belonging', 'academic_fit', 'wellbeing', 'custom']);
export const InterventionTypeSchema = z.enum([
  'call',
  'meeting',
  'referral_counselor',
  'referral_hod',
  'parent_contact',
  'other',
]);
export const InterventionOutcomeSchema = z.enum([
  'pending',
  'resolved',
  'escalated',
  'no_response',
]);

export const DimensionScoresSchema = z.object({
  engagement: z.number().int().min(0).max(100),
  attendance: z.number().int().min(0).max(100),
  fees: z.number().int().min(0).max(100),
  academic: z.number().int().min(0).max(100),
  wellness: z.number().int().min(0).max(100),
  hostel: z.number().int().min(0).max(100),
  belonging: z.number().int().min(0).max(100),
});

export const LearnerRiskAssessmentFiltersSchema = z.object({
  institution_id: z.string().uuid(),
  department_id: z.string().uuid().optional(),
  section_id: z.string().uuid().optional(),
  risk_tier: z.union([RiskTierSchema, z.array(RiskTierSchema)]).optional(),
  confidence: RiskConfidenceSchema.optional(),
  trend_direction: TrendDirectionSchema.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).optional(),
  page_size: z.number().int().min(1).max(100).optional(),
});

export const CreatePulseResponseSchema = z.object({
  learner_id: z.string().uuid(),
  institution_id: z.string().uuid(),
  notification_id: z.string().uuid().optional().nullable(),
  pulse_type: PulseTypeSchema,
  question_text: z.string().min(1),
  response_value: z.string().min(1),
  response_sentiment: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional().nullable(),
  days_since_enrollment: z.number().int().optional().nullable(),
});

export const CreateInterventionSchema = z.object({
  learner_id: z.string().uuid(),
  institution_id: z.string().uuid(),
  intervention_type: InterventionTypeSchema,
  notes: z.string().optional().nullable(),
  risk_score_at_time: z.number().int().min(0).max(100).optional().nullable(),
  follow_up_date: z.string().optional().nullable(),
});

export const UpdateInterventionSchema = z.object({
  outcome: InterventionOutcomeSchema.optional(),
  notes: z.string().optional().nullable(),
  follow_up_date: z.string().optional().nullable(),
});

export const RiskWeightsSchema = z.object({
  engagement: z.number().int().min(0),
  attendance: z.number().int().min(0),
  fees: z.number().int().min(0),
  academic: z.number().int().min(0),
  wellness: z.number().int().min(0),
  hostel: z.number().int().min(0),
  belonging: z.number().int().min(0),
}).refine(
  (w) => w.engagement + w.attendance + w.fees + w.academic + w.wellness + w.hostel + w.belonging === 100,
  { message: 'Weights must sum to 100' }
);

export const TierThresholdsSchema = z.object({
  critical: z.number().int().min(0).max(100),
  high: z.number().int().min(0).max(100),
  moderate: z.number().int().min(0).max(100),
  low: z.number().int().min(0).max(100),
}).refine(
  (t) => t.critical > t.high && t.high > t.moderate && t.moderate > t.low,
  { message: 'Thresholds must be in descending order: critical > high > moderate > low' }
);
