// lib/services/startup-studio/portfolio-dashboard-service.ts
// Aggregated dashboard data for the Portfolio Intelligence view

import { BaseService } from '../base-service';
import type {
  PortfolioDashboardData,
  NifStage,
  SSNifCandidate,
  RiskLevel,
} from '@/types/startup-studio';

const ACTIVE_STAGES: NifStage[] = ['identified', 'screened', 'shortlisted', 'incubating'];

export class PortfolioDashboardService extends BaseService {
  /**
   * Assemble the full portfolio dashboard in a single call.
   * Fires multiple parallel queries then combines results.
   */
  static async getDashboardData(): Promise<PortfolioDashboardData> {
    const [
      candidates,
      riskAssessments,
    ] = await Promise.all([
      this.fetchAllCandidates(),
      this.fetchLatestRiskAssessments(),
    ]);

    // --- KPIs ---
    const activeCandidates = candidates.filter((c) => ACTIVE_STAGES.includes(c.stage as NifStage));
    const activeStartups = activeCandidates.length;

    const trlValues = candidates
      .filter((c) => c.current_trl !== null)
      .map((c) => c.current_trl as number);
    const avgTrl = trlValues.length > 0
      ? Math.round((trlValues.reduce((s, v) => s + v, 0) / trlValues.length) * 10) / 10
      : null;

    const riskScores = riskAssessments.map((r) => r.overall_risk_score);
    const avgRiskScore = riskScores.length > 0
      ? Math.round((riskScores.reduce((s, v) => s + v, 0) / riskScores.length) * 10) / 10
      : null;

    const atRiskCount = riskAssessments.filter(
      (r) => r.overall_risk_level === 'high' || r.overall_risk_level === 'critical'
    ).length;

    // --- TRL Distribution ---
    const trlCounts: Record<number, number> = {};
    for (const c of candidates) {
      if (c.current_trl !== null) {
        trlCounts[c.current_trl] = (trlCounts[c.current_trl] || 0) + 1;
      }
    }
    const trlDistribution = Object.entries(trlCounts)
      .map(([trl, count]) => ({ trl_level: Number(trl), count }))
      .sort((a, b) => a.trl_level - b.trl_level);

    // --- Risk Heatmap ---
    const candidateMap = new Map(candidates.map((c) => [c.id, c]));
    const riskHeatmap = riskAssessments
      .filter((r) => candidateMap.has(r.candidate_id))
      .map((r) => {
        const c = candidateMap.get(r.candidate_id)!;
        return {
          candidate_id: r.candidate_id,
          startup_name: c.startup_name,
          stage: c.stage as NifStage,
          magic_score: r.magic_score,
          market_score: r.market_score,
          management_score: r.management_score,
          money_score: r.money_score,
          overall_risk_score: r.overall_risk_score,
          overall_risk_level: r.overall_risk_level as RiskLevel,
        };
      });

    // --- Pipeline Funnel ---
    const pipelineFunnel: Record<string, number> = {};
    for (const c of candidates) {
      pipelineFunnel[c.stage] = (pipelineFunnel[c.stage] || 0) + 1;
    }

    // --- Attention Needed ---
    // Candidates that are high/critical risk OR have stalled TRL (>6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const riskByCandidate = new Map(
      riskAssessments.map((r) => [r.candidate_id, r])
    );

    const attentionNeeded: PortfolioDashboardData['attention_needed'] = [];

    for (const c of activeCandidates) {
      const risk = riskByCandidate.get(c.id);
      const isHighRisk = risk && (risk.overall_risk_level === 'high' || risk.overall_risk_level === 'critical');
      const isStalledTrl =
        c.stage === 'incubating' &&
        c.trl_assessed_at &&
        new Date(c.trl_assessed_at) < sixMonthsAgo;

      if (isHighRisk || isStalledTrl) {
        attentionNeeded.push({
          ...c,
          latest_risk_score: risk?.overall_risk_score,
          risk_level: risk?.overall_risk_level as RiskLevel | undefined,
        });
      }
    }

    return {
      kpis: {
        active_startups: activeStartups,
        avg_trl: avgTrl,
        avg_risk_score: avgRiskScore,
        at_risk_count: atRiskCount,
      },
      trl_distribution: trlDistribution,
      risk_heatmap: riskHeatmap,
      attention_needed: attentionNeeded,
      pipeline_funnel: pipelineFunnel as Record<NifStage, number>,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * Fetch all NIF candidates (no pagination — dashboard aggregation)
   */
  private static async fetchAllCandidates(): Promise<SSNifCandidate[]> {
    const { data, error } = await this.supabase
      .from('ss_nif_candidates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error('Failed to fetch candidates for dashboard: ' + error.message);
    return (data || []) as SSNifCandidate[];
  }

  /**
   * Fetch the latest risk assessment per candidate.
   * Retrieves all assessments ordered by date desc, then deduplicates in JS.
   */
  private static async fetchLatestRiskAssessments(): Promise<
    Array<{
      candidate_id: string;
      magic_score: number;
      market_score: number;
      management_score: number;
      money_score: number;
      overall_risk_score: number;
      overall_risk_level: string;
    }>
  > {
    const { data, error } = await this.supabase
      .from('ss_risk_assessments')
      .select('candidate_id, magic_score, market_score, management_score, money_score, overall_risk_score, overall_risk_level, assessment_date')
      .order('assessment_date', { ascending: false });

    if (error) throw new Error('Failed to fetch risk assessments for dashboard: ' + error.message);

    // Keep only the latest per candidate
    const seen = new Set<string>();
    const latest: typeof data = [];
    for (const row of data || []) {
      if (!seen.has(row.candidate_id)) {
        seen.add(row.candidate_id);
        latest.push(row);
      }
    }

    return latest;
  }
}

export const portfolioDashboardService = {
  getDashboardData: PortfolioDashboardService.getDashboardData.bind(PortfolioDashboardService),
};
