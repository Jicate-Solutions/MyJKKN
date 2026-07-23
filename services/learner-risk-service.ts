// services/learner-risk-service.ts
// ============================================
// LEARNER RISK SERVICE
// ============================================
// Created: 2026-05-25
// Purpose: Service layer for learner risk assessments and interventions
// Override note: Spec placed service at services/ (root) not lib/services/.
//   This follows the spec's designated file list. @/services/ resolves via tsconfig.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js';

// Inline types — will be replaced by import from types/learner-risk.ts
export type RiskTier = 'critical' | 'high' | 'moderate' | 'low' | 'healthy';
export type TrendDirection = 'improving' | 'stable' | 'worsening';
export type InterventionType =
  | 'call'
  | 'meeting'
  | 'referral_counselor'
  | 'referral_hod'
  | 'parent_contact'
  | 'other';
export type InterventionOutcome =
  | 'pending'
  | 'resolved'
  | 'escalated'
  | 'no_response';

export interface LearnerRiskAssessment {
  id: string;
  learner_id: string;
  institution_id: string;
  assessment_date: string;
  composite_risk_score: number;
  risk_tier: RiskTier;
  confidence: string;
  dimension_scores: Record<string, number>;
  risk_factors: string[];
  recommended_actions: string[];
  previous_risk_score: number | null;
  trend_direction: TrendDirection | null;
  created_at: string;
}

export interface LearnerIntervention {
  id: string;
  learner_id: string;
  institution_id: string;
  intervener_id: string;
  intervention_type: InterventionType;
  notes: string | null;
  risk_score_at_time: number | null;
  outcome: InterventionOutcome;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearnerRiskWithProfile extends LearnerRiskAssessment {
  learner: {
    id: string;
    first_name: string;
    last_name: string | null;
    roll_number: string | null;
    department_id: string | null;
    section_id: string | null;
    program_id: string | null;
  } | null;
}

export interface RiskSummary {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  healthy: number;
  total: number;
}

export interface RiskHistoryPoint {
  date: string;
  score: number;
  tier: string;
}

interface GetRiskAssessmentsFilters {
  institution_id: string;
  department_id?: string;
  section_id?: string;
  risk_tier?: RiskTier[];
  date?: string;
  page?: number;
  page_size?: number;
}

interface CreateInterventionData {
  learner_id: string;
  institution_id: string;
  intervener_id: string;
  intervention_type: InterventionType;
  notes?: string;
  risk_score_at_time?: number;
  follow_up_date?: string;
}

export class LearnerRiskService {
  /**
   * Get paginated risk assessments with learner profile data.
   * Ordered by composite_risk_score DESC (worst first).
   */
  static async getRiskAssessments(
    supabase: SupabaseClient,
    filters: GetRiskAssessmentsFilters
  ): Promise<{ data: LearnerRiskWithProfile[]; count: number }> {
    const {
      institution_id,
      department_id,
      section_id,
      risk_tier,
      date,
      page = 1,
      page_size = 50,
    } = filters;

    const from = (page - 1) * page_size;
    const to = from + page_size - 1;

    // Build query with !inner join to learners_profiles so we only get
    // assessments whose learner matches the department/section filter
    let query = supabase
      .from('learner_risk_assessments')
      .select(
        `
        *,
        learner:learners_profiles!inner(
          id, first_name, last_name, roll_number,
          department_id, section_id, program_id
        )
      `,
        { count: 'exact' }
      )
      .eq('institution_id', institution_id)
      .order('composite_risk_score', { ascending: false })
      .range(from, to);

    // Date filter — default to today
    if (date) {
      query = query.eq('assessment_date', date);
    } else {
      query = query.eq(
        'assessment_date',
        new Date().toISOString().split('T')[0]
      );
    }

    // Optional tier filter
    if (risk_tier && risk_tier.length > 0) {
      query = query.in('risk_tier', risk_tier);
    }

    // Scope by department (filter on the joined learner)
    if (department_id) {
      query = query.eq('learner.department_id', department_id);
    }

    // Scope by section
    if (section_id) {
      query = query.eq('learner.section_id', section_id);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('[learner-risk] getRiskAssessments error:', error);
      throw error;
    }

    return {
      data: (data ?? []) as unknown as LearnerRiskWithProfile[],
      count: count ?? 0,
    };
  }

  /**
   * Get risk tier counts for summary bar.
   * Counts grouped by risk_tier for today's assessments.
   */
  static async getRiskSummary(
    supabase: SupabaseClient,
    institution_id: string,
    department_id?: string,
    section_id?: string
  ): Promise<RiskSummary> {
    const today = new Date().toISOString().split('T')[0];

    // Build a query that pulls risk_tier for counting.
    // If we need department/section filtering, use !inner join.
    const needsJoin = !!department_id || !!section_id;

    let query = supabase
      .from('learner_risk_assessments')
      .select(
        needsJoin
          ? 'risk_tier, learner:learners_profiles!inner(department_id, section_id)'
          : 'risk_tier'
      )
      .eq('institution_id', institution_id)
      .eq('assessment_date', today);

    if (department_id) {
      query = query.eq('learner.department_id', department_id);
    }
    if (section_id) {
      query = query.eq('learner.section_id', section_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[learner-risk] getRiskSummary error:', error);
      throw error;
    }

    const summary: RiskSummary = {
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      healthy: 0,
      total: 0,
    };

    for (const row of (data ?? []) as unknown as { risk_tier: RiskTier }[]) {
      const tier = row.risk_tier;
      if (tier in summary) {
        summary[tier]++;
      }
      summary.total++;
    }

    return summary;
  }

  /**
   * Get risk score history for a learner over the last N days.
   * Used for trend sparklines.
   */
  static async getRiskHistory(
    supabase: SupabaseClient,
    learner_id: string,
    days: number = 30
  ): Promise<RiskHistoryPoint[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('learner_risk_assessments')
      .select('assessment_date, composite_risk_score, risk_tier')
      .eq('learner_id', learner_id)
      .gte('assessment_date', cutoffStr)
      .order('assessment_date', { ascending: true });

    if (error) {
      console.error('[learner-risk] getRiskHistory error:', error);
      throw error;
    }

    return (data ?? []).map((row) => ({
      date: row.assessment_date,
      score: row.composite_risk_score,
      tier: row.risk_tier,
    }));
  }

  /**
   * Create a new intervention record.
   */
  static async createIntervention(
    supabase: SupabaseClient,
    data: CreateInterventionData
  ): Promise<LearnerIntervention> {
    const { data: intervention, error } = await supabase
      .from('learner_interventions')
      .insert({
        learner_id: data.learner_id,
        institution_id: data.institution_id,
        intervener_id: data.intervener_id,
        intervention_type: data.intervention_type,
        notes: data.notes ?? null,
        risk_score_at_time: data.risk_score_at_time ?? null,
        follow_up_date: data.follow_up_date ?? null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[learner-risk] createIntervention error:', error);
      throw error;
    }

    return intervention as LearnerIntervention;
  }

  /**
   * Get all interventions for a learner, newest first.
   */
  static async getInterventions(
    supabase: SupabaseClient,
    learner_id: string
  ): Promise<LearnerIntervention[]> {
    const { data, error } = await supabase
      .from('learner_interventions')
      .select('*')
      .eq('learner_id', learner_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[learner-risk] getInterventions error:', error);
      throw error;
    }

    return (data ?? []) as LearnerIntervention[];
  }
}
