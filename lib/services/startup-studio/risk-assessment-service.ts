// lib/services/startup-studio/risk-assessment-service.ts
// CRUD + analytics for 4M Risk Assessments (Magic, Market, Management, Money)

import { BaseService } from '../base-service';
import type {
  SSRiskAssessment,
  CreateRiskAssessmentInput,
  RiskHeatmapEntry,
} from '@/types/startup-studio';

export class RiskAssessmentService extends BaseService {
  /**
   * Get all risk assessments for a candidate, most recent first
   */
  static async getAssessments(candidateId: string): Promise<SSRiskAssessment[]> {
    const { data, error } = await this.supabase
      .from('ss_risk_assessments')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('assessment_date', { ascending: false });

    if (error) throw new Error('Failed to fetch risk assessments: ' + error.message);
    return (data || []) as SSRiskAssessment[];
  }

  /**
   * Create a new risk assessment
   */
  static async createAssessment(input: CreateRiskAssessmentInput): Promise<SSRiskAssessment> {
    const { data, error } = await this.supabase
      .from('ss_risk_assessments')
      .insert({
        ...input,
        assessment_date: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to create risk assessment: ' + error.message);
    return data as SSRiskAssessment;
  }

  /**
   * Build a risk heatmap: latest risk assessment per candidate joined with candidate info.
   * Returns one entry per candidate that has at least one risk assessment.
   */
  static async getHeatmap(): Promise<RiskHeatmapEntry[]> {
    // Step 1: Fetch all risk assessments ordered by date desc
    const { data: assessments, error: assessmentsError } = await this.supabase
      .from('ss_risk_assessments')
      .select('candidate_id, magic_score, market_score, management_score, money_score, overall_risk_score, overall_risk_level, assessment_date')
      .order('assessment_date', { ascending: false });

    if (assessmentsError) throw new Error('Failed to fetch risk assessments for heatmap: ' + assessmentsError.message);

    if (!assessments || assessments.length === 0) return [];

    // Step 2: Keep only the latest assessment per candidate
    const latestByCandidate = new Map<string, (typeof assessments)[0]>();
    for (const a of assessments) {
      if (!latestByCandidate.has(a.candidate_id)) {
        latestByCandidate.set(a.candidate_id, a);
      }
    }

    const candidateIds = Array.from(latestByCandidate.keys());

    // Step 3: Fetch candidate info for those IDs
    const { data: candidates, error: candidatesError } = await this.supabase
      .from('ss_nif_candidates')
      .select('id, startup_name, stage')
      .in('id', candidateIds);

    if (candidatesError) throw new Error('Failed to fetch candidates for heatmap: ' + candidatesError.message);

    const candidateMap = new Map<string, { startup_name: string | null; stage: string }>();
    for (const c of candidates || []) {
      candidateMap.set(c.id, { startup_name: c.startup_name, stage: c.stage });
    }

    // Step 4: Combine into RiskHeatmapEntry[]
    const heatmap: RiskHeatmapEntry[] = [];
    for (const [candidateId, assessment] of latestByCandidate) {
      const candidate = candidateMap.get(candidateId);
      if (!candidate) continue;

      heatmap.push({
        candidate_id: candidateId,
        startup_name: candidate.startup_name,
        stage: candidate.stage as RiskHeatmapEntry['stage'],
        magic_score: assessment.magic_score,
        market_score: assessment.market_score,
        management_score: assessment.management_score,
        money_score: assessment.money_score,
        overall_risk_score: assessment.overall_risk_score,
        overall_risk_level: assessment.overall_risk_level,
      });
    }

    return heatmap;
  }

  /**
   * Get startups where any of the 4M scores in the latest assessment falls below a threshold.
   * Default threshold is 4 (out of 10).
   */
  static async getHighRiskStartups(threshold: number = 4): Promise<RiskHeatmapEntry[]> {
    const heatmap = await this.getHeatmap();

    return heatmap.filter(
      (entry) =>
        entry.magic_score < threshold ||
        entry.market_score < threshold ||
        entry.management_score < threshold ||
        entry.money_score < threshold
    );
  }
}

export const riskAssessmentService = {
  getAssessments: RiskAssessmentService.getAssessments.bind(RiskAssessmentService),
  createAssessment: RiskAssessmentService.createAssessment.bind(RiskAssessmentService),
  getHeatmap: RiskAssessmentService.getHeatmap.bind(RiskAssessmentService),
  getHighRiskStartups: RiskAssessmentService.getHighRiskStartups.bind(RiskAssessmentService),
};
