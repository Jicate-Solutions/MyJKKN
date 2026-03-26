// lib/services/startup-studio/trl-assessment-service.ts
// CRUD + analytics for TRL (Technology Readiness Level) assessments

import { BaseService } from '../base-service';
import type {
  SSTrlAssessment,
  CreateTrlAssessmentInput,
  TrlDistribution,
  SSNifCandidate,
} from '@/types/startup-studio';

export class TrlAssessmentService extends BaseService {
  /**
   * Get all TRL assessments for a candidate, most recent first
   */
  static async getAssessments(candidateId: string): Promise<SSTrlAssessment[]> {
    const { data, error } = await this.supabase
      .from('ss_trl_assessments')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('assessment_date', { ascending: false });

    if (error) throw new Error('Failed to fetch TRL assessments: ' + error.message);
    return (data || []) as SSTrlAssessment[];
  }

  /**
   * Create a new TRL assessment and update the candidate's current_trl + trl_assessed_at.
   * Captures previous_trl from candidate's current value before overwriting.
   */
  static async createAssessment(input: CreateTrlAssessmentInput): Promise<SSTrlAssessment> {
    // 1. Fetch candidate's current TRL so we can store it as previous_trl
    const { data: candidate, error: candidateError } = await this.supabase
      .from('ss_nif_candidates')
      .select('current_trl')
      .eq('id', input.candidate_id)
      .single();

    if (candidateError) {
      throw new Error('Failed to fetch candidate for TRL update: ' + candidateError.message);
    }

    const previousTrl = candidate?.current_trl ?? null;

    // 2. Insert the assessment with previous_trl
    const { data, error } = await this.supabase
      .from('ss_trl_assessments')
      .insert({
        ...input,
        previous_trl: previousTrl,
        assessment_date: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to create TRL assessment: ' + error.message);

    // 3. Update the candidate's current_trl and trl_assessed_at
    const { error: updateError } = await this.supabase
      .from('ss_nif_candidates')
      .update({
        current_trl: input.trl_level,
        trl_assessed_at: new Date().toISOString(),
      })
      .eq('id', input.candidate_id);

    if (updateError) {
      console.error('[ss_nif_candidates] Error updating current_trl:', updateError);
    }

    return data as SSTrlAssessment;
  }

  /**
   * Get TRL distribution across all candidates: { trl_level, count }[]
   */
  static async getDistribution(): Promise<TrlDistribution[]> {
    const { data, error } = await this.supabase
      .from('ss_nif_candidates')
      .select('current_trl')
      .not('current_trl', 'is', null);

    if (error) throw new Error('Failed to fetch TRL distribution: ' + error.message);

    // Group by current_trl and count
    const counts: Record<number, number> = {};
    for (const row of data || []) {
      const trl = row.current_trl as number;
      counts[trl] = (counts[trl] || 0) + 1;
    }

    return Object.entries(counts)
      .map(([trl, count]) => ({ trl_level: Number(trl), count }))
      .sort((a, b) => a.trl_level - b.trl_level);
  }

  /**
   * Get startups with stalled TRL progress (trl_assessed_at older than threshold
   * and stage is 'incubating').
   */
  static async getStalledStartups(monthsThreshold: number = 6): Promise<SSNifCandidate[]> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsThreshold);

    const { data, error } = await this.supabase
      .from('ss_nif_candidates')
      .select('*')
      .eq('stage', 'incubating')
      .not('trl_assessed_at', 'is', null)
      .lt('trl_assessed_at', cutoffDate.toISOString())
      .order('trl_assessed_at', { ascending: true });

    if (error) throw new Error('Failed to fetch stalled startups: ' + error.message);
    return (data || []) as SSNifCandidate[];
  }
}

export const trlAssessmentService = {
  getAssessments: TrlAssessmentService.getAssessments.bind(TrlAssessmentService),
  createAssessment: TrlAssessmentService.createAssessment.bind(TrlAssessmentService),
  getDistribution: TrlAssessmentService.getDistribution.bind(TrlAssessmentService),
  getStalledStartups: TrlAssessmentService.getStalledStartups.bind(TrlAssessmentService),
};
