// lib/services/startup-studio/graduation-service.ts
// CRUD operations for ss_graduation_criteria, ss_graduation_evaluations,
// ss_exit_procedures, and ss_alumni_tracking

import { BaseService } from '../base-service';
import { NifPipelineService } from './nif-pipeline-service';
import type {
  SSGraduationCriteria,
  SSGraduationEvaluation,
  SSExitProcedure,
  SSAlumniTracking,
  CreateGraduationCriteriaInput,
  CreateExitProcedureInput,
  TrackAlumniInput,
  AlumniMetrics,
} from '@/types/startup-studio';

const CRITERIA_SELECT = '*';

const EXIT_SELECT = '*';

const ALUMNI_SELECT = `
  *,
  candidate:ss_nif_candidates(id, startup_name, stage)
`;

export class GraduationService extends BaseService {
  // ============================================
  // CRITERIA
  // ============================================

  /**
   * List active graduation criteria, optionally filtered by institution
   */
  static async getCriteria(institutionId?: string): Promise<SSGraduationCriteria[]> {
    let query = this.supabase
      .from('ss_graduation_criteria')
      .select(CRITERIA_SELECT)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch graduation criteria: ' + error.message);
    return (data || []) as SSGraduationCriteria[];
  }

  /**
   * Create a new graduation criterion
   */
  static async createCriteria(input: CreateGraduationCriteriaInput): Promise<SSGraduationCriteria> {
    const { data, error } = await this.supabase
      .from('ss_graduation_criteria')
      .insert({
        name: input.name,
        description: input.description || null,
        criteria_type: input.criteria_type,
        threshold_value: input.threshold_value ?? null,
        threshold_unit: input.threshold_unit ?? null,
        is_active: input.is_active ?? true,
        min_criteria_to_graduate: input.min_criteria_to_graduate ?? 0,
        institution_id: input.institution_id ?? null,
      })
      .select(CRITERIA_SELECT)
      .single();

    if (error) throw new Error('Failed to create graduation criteria: ' + error.message);
    return data as SSGraduationCriteria;
  }

  // ============================================
  // EVALUATION / READINESS
  // ============================================

  /**
   * Evaluate graduation readiness for a candidate.
   * Fetches all active criteria + candidate data, computes which are met.
   */
  static async evaluateReadiness(candidateId: string): Promise<{
    criteria: SSGraduationCriteria[];
    candidate: any;
    criteria_results: Array<{ criteria_id: string; criteria_name: string; met: boolean; value?: number }>;
    criteria_met_count: number;
    min_criteria_to_graduate: number;
    is_graduation_ready: boolean;
  }> {
    // Fetch candidate
    const { data: candidate, error: candidateError } = await this.supabase
      .from('ss_nif_candidates')
      .select('*, problem:ss_problem_bank(id, title, theme)')
      .eq('id', candidateId)
      .single();

    if (candidateError) throw new Error('Failed to fetch candidate: ' + candidateError.message);

    // Fetch active criteria
    const { data: criteria, error: criteriaError } = await this.supabase
      .from('ss_graduation_criteria')
      .select(CRITERIA_SELECT)
      .eq('is_active', true);

    if (criteriaError) throw new Error('Failed to fetch criteria: ' + criteriaError.message);

    const allCriteria = (criteria || []) as SSGraduationCriteria[];

    // Compute which criteria are met based on criteria_type matching candidate fields
    const results = allCriteria.map((c) => {
      let met = false;
      let value: number | undefined;

      switch (c.criteria_type) {
        case 'revenue':
          value = candidate.revenue_generated ?? 0;
          met = c.threshold_value != null ? value >= c.threshold_value : value > 0;
          break;
        case 'customers':
          value = candidate.customer_count ?? 0;
          met = c.threshold_value != null ? value >= c.threshold_value : value > 0;
          break;
        case 'jobs_created':
          value = candidate.jobs_created ?? 0;
          met = c.threshold_value != null ? value >= c.threshold_value : value > 0;
          break;
        case 'trl_level':
          value = candidate.current_trl ?? 0;
          met = c.threshold_value != null ? value >= c.threshold_value : value >= 7;
          break;
        case 'patents':
          value = (candidate.patents_filed ?? 0) + (candidate.patents_granted ?? 0);
          met = c.threshold_value != null ? value >= c.threshold_value : value > 0;
          break;
        case 'funding':
          value = candidate.funding_amount ?? 0;
          met = c.threshold_value != null ? value >= c.threshold_value : value > 0;
          break;
        case 'incubation_months': {
          if (candidate.incubation_started_at) {
            const months = Math.floor(
              (Date.now() - new Date(candidate.incubation_started_at).getTime()) /
              (1000 * 60 * 60 * 24 * 30)
            );
            value = months;
            met = c.threshold_value != null ? months >= c.threshold_value : months >= 12;
          }
          break;
        }
        case 'legal_registration':
          met = !!candidate.legal_structure && candidate.legal_structure !== 'none';
          break;
        case 'kyc_verified':
          met = candidate.kyc_status === 'verified';
          break;
        default:
          // Unknown criteria type — mark as not met
          met = false;
      }

      return {
        criteria_id: c.id,
        criteria_name: c.name,
        met,
        value,
      };
    });

    const criteriaMet = results.filter((r) => r.met).length;
    // Use the max of min_criteria_to_graduate across all criteria, or default to allCriteria.length
    const minRequired = allCriteria.length > 0
      ? Math.max(...allCriteria.map((c) => c.min_criteria_to_graduate || 0), 1)
      : 0;

    return {
      criteria: allCriteria,
      candidate,
      criteria_results: results,
      criteria_met_count: criteriaMet,
      min_criteria_to_graduate: minRequired,
      is_graduation_ready: criteriaMet >= minRequired && minRequired > 0,
    };
  }

  /**
   * Create a graduation evaluation record.
   * If decision='graduate', also advances the NIF pipeline stage.
   */
  static async createEvaluation(
    candidateId: string,
    data: {
      criteria_results: Array<{ criteria_id: string; criteria_name: string; met: boolean; evidence?: string; value?: number }>;
      criteria_met_count: number;
      is_graduation_ready: boolean;
      decision?: 'graduate' | 'extend' | 'exit_non_performance' | 'defer' | null;
      decision_notes?: string;
      decision_by?: string;
      extension_months?: number;
      extension_conditions?: string;
      graduation_type?: 'successful' | 'time_limit' | 'capacity' | 'acquisition' | null;
      evaluated_by?: string;
    }
  ): Promise<SSGraduationEvaluation> {
    const { data: evaluation, error } = await this.supabase
      .from('ss_graduation_evaluations')
      .insert({
        candidate_id: candidateId,
        evaluation_date: new Date().toISOString(),
        evaluated_by: data.evaluated_by || null,
        criteria_results: data.criteria_results,
        criteria_met_count: data.criteria_met_count,
        is_graduation_ready: data.is_graduation_ready,
        decision: data.decision || null,
        decision_notes: data.decision_notes || null,
        decision_by: data.decision_by || null,
        extension_months: data.extension_months || null,
        extension_conditions: data.extension_conditions || null,
        graduation_type: data.graduation_type || null,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to create graduation evaluation: ' + error.message);

    // If decision is 'graduate', advance NIF stage
    if (data.decision === 'graduate') {
      try {
        await NifPipelineService.advanceStage(
          candidateId,
          'graduated',
          data.decision_by,
          `Graduation evaluation: ${data.graduation_type || 'successful'}`
        );
      } catch (err) {
        console.error('[graduation] Error advancing to graduated stage:', err);
      }
    }

    return evaluation as SSGraduationEvaluation;
  }

  // ============================================
  // EXIT PROCEDURES
  // ============================================

  /**
   * Get exit procedure for a candidate
   */
  static async getExitProcedure(candidateId: string): Promise<SSExitProcedure | null> {
    const { data, error } = await this.supabase
      .from('ss_exit_procedures')
      .select(EXIT_SELECT)
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error('Failed to fetch exit procedure: ' + error.message);
    return data as SSExitProcedure | null;
  }

  /**
   * Initiate an exit procedure for a candidate
   */
  static async initiateExit(input: CreateExitProcedureInput): Promise<SSExitProcedure> {
    const { data, error } = await this.supabase
      .from('ss_exit_procedures')
      .insert({
        candidate_id: input.candidate_id,
        exit_type: input.exit_type,
        notice_period_days: input.notice_period_days ?? 30,
        fees_outstanding: input.fees_outstanding ?? 0,
        fees_reconciled: false,
        deposit_returned: false,
        exit_interview_completed: false,
        exit_interview_notes: null,
        ip_agreements_settled: false,
        nda_status: 'pending',
        equipment_returned: false,
        access_revoked: false,
        alumni_network_joined: false,
        testimonial_provided: false,
        exit_initiated_at: new Date().toISOString(),
        exit_completed_at: null,
        processed_by: null,
      })
      .select(EXIT_SELECT)
      .single();

    if (error) throw new Error('Failed to initiate exit procedure: ' + error.message);
    return data as SSExitProcedure;
  }

  /**
   * Update exit progress checklist items
   */
  static async updateExitProgress(
    exitId: string,
    updates: Partial<SSExitProcedure>
  ): Promise<SSExitProcedure> {
    // Strip protected fields
    const { id: _id, candidate_id: _cid, created_at: _ca, ...safeUpdates } = updates as any;

    const { data, error } = await this.supabase
      .from('ss_exit_procedures')
      .update(safeUpdates)
      .eq('id', exitId)
      .select(EXIT_SELECT)
      .single();

    if (error) throw new Error('Failed to update exit progress: ' + error.message);
    return data as SSExitProcedure;
  }

  /**
   * Complete exit — set exit_completed_at, advance NIF stage if graduation
   */
  static async completeExit(exitId: string, processedBy?: string): Promise<SSExitProcedure> {
    // Fetch the exit record first
    const { data: exitRecord, error: fetchError } = await this.supabase
      .from('ss_exit_procedures')
      .select('*')
      .eq('id', exitId)
      .single();

    if (fetchError) throw new Error('Failed to fetch exit for completion: ' + fetchError.message);

    const { data, error } = await this.supabase
      .from('ss_exit_procedures')
      .update({
        exit_completed_at: new Date().toISOString(),
        processed_by: processedBy || null,
      })
      .eq('id', exitId)
      .select(EXIT_SELECT)
      .single();

    if (error) throw new Error('Failed to complete exit: ' + error.message);

    // If this was a graduation exit, advance NIF stage
    if (exitRecord.exit_type === 'graduation') {
      try {
        await NifPipelineService.advanceStage(
          exitRecord.candidate_id,
          'graduated',
          processedBy,
          'Exit completed — graduation'
        );
      } catch (err) {
        console.error('[graduation] Error advancing stage on exit completion:', err);
      }
    }

    return data as SSExitProcedure;
  }

  // ============================================
  // ALUMNI TRACKING
  // ============================================

  /**
   * Upsert alumni tracking record (one per candidate per year)
   */
  static async trackAlumni(input: TrackAlumniInput): Promise<SSAlumniTracking> {
    const { data, error } = await this.supabase
      .from('ss_alumni_tracking')
      .upsert(
        {
          candidate_id: input.candidate_id,
          tracking_year: input.tracking_year,
          tracking_date: new Date().toISOString(),
          is_operational: input.is_operational ?? true,
          pivot_description: input.pivot_description ?? null,
          annual_revenue: input.annual_revenue ?? null,
          revenue_currency: 'INR',
          revenue_growth_pct: input.revenue_growth_pct ?? null,
          total_funding_raised: input.total_funding_raised ?? null,
          latest_funding_round: input.latest_funding_round ?? null,
          latest_valuation: input.latest_valuation ?? null,
          employees_count: input.employees_count ?? 0,
          jobs_created_this_year: input.jobs_created_this_year ?? 0,
          customers_count: input.customers_count ?? 0,
          patents_filed: input.patents_filed ?? 0,
          patents_granted: input.patents_granted ?? 0,
          awards: input.awards ?? [],
          media_mentions: 0,
          is_mentor_back: input.is_mentor_back ?? false,
          is_investor_back: input.is_investor_back ?? false,
          referred_startups: input.referred_startups ?? 0,
          incubator_helpfulness_rating: input.incubator_helpfulness_rating ?? null,
          most_valuable_support: input.most_valuable_support ?? null,
          improvement_suggestion: input.improvement_suggestion ?? null,
          recorded_by: input.recorded_by ?? null,
        },
        { onConflict: 'candidate_id,tracking_year' }
      )
      .select(ALUMNI_SELECT)
      .single();

    if (error) throw new Error('Failed to track alumni: ' + error.message);
    return data as SSAlumniTracking;
  }

  /**
   * Aggregate alumni metrics for a given year (or all years if not specified)
   */
  static async getAlumniMetrics(year?: number): Promise<AlumniMetrics> {
    let query = this.supabase
      .from('ss_alumni_tracking')
      .select('*');

    if (year) {
      query = query.eq('tracking_year', year);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch alumni metrics: ' + error.message);

    const records = data || [];
    const total = records.length;
    const operational = records.filter((r: any) => r.is_operational);

    const totalRevenue = records.reduce((sum: number, r: any) => sum + (r.annual_revenue || 0), 0);
    const totalJobs = records.reduce((sum: number, r: any) => sum + (r.jobs_created_this_year || 0), 0);
    const totalFunding = records.reduce((sum: number, r: any) => sum + (r.total_funding_raised || 0), 0);
    const mentorBack = records.filter((r: any) => r.is_mentor_back).length;
    const investorBack = records.filter((r: any) => r.is_investor_back).length;

    const helpfulnessRatings = records
      .filter((r: any) => r.incubator_helpfulness_rating != null)
      .map((r: any) => r.incubator_helpfulness_rating as number);
    const avgHelpfulness = helpfulnessRatings.length > 0
      ? Math.round((helpfulnessRatings.reduce((s: number, v: number) => s + v, 0) / helpfulnessRatings.length) * 10) / 10
      : null;

    return {
      total_alumni: total,
      operational_count: operational.length,
      operational_pct: total > 0 ? Math.round((operational.length / total) * 100) : 0,
      total_revenue: totalRevenue,
      total_jobs: totalJobs,
      total_funding: totalFunding,
      give_back_mentors: mentorBack,
      give_back_investors: investorBack,
      avg_helpfulness_rating: avgHelpfulness,
    };
  }

  /**
   * Get alumni directory — graduated candidates with latest tracking
   */
  static async getAlumniDirectory(): Promise<SSAlumniTracking[]> {
    const { data, error } = await this.supabase
      .from('ss_alumni_tracking')
      .select(ALUMNI_SELECT)
      .order('tracking_year', { ascending: false })
      .order('tracking_date', { ascending: false });

    if (error) throw new Error('Failed to fetch alumni directory: ' + error.message);
    return (data || []) as SSAlumniTracking[];
  }
}

export const graduationService = {
  getCriteria: GraduationService.getCriteria.bind(GraduationService),
  createCriteria: GraduationService.createCriteria.bind(GraduationService),
  evaluateReadiness: GraduationService.evaluateReadiness.bind(GraduationService),
  createEvaluation: GraduationService.createEvaluation.bind(GraduationService),
  getExitProcedure: GraduationService.getExitProcedure.bind(GraduationService),
  initiateExit: GraduationService.initiateExit.bind(GraduationService),
  updateExitProgress: GraduationService.updateExitProgress.bind(GraduationService),
  completeExit: GraduationService.completeExit.bind(GraduationService),
  trackAlumni: GraduationService.trackAlumni.bind(GraduationService),
  getAlumniMetrics: GraduationService.getAlumniMetrics.bind(GraduationService),
  getAlumniDirectory: GraduationService.getAlumniDirectory.bind(GraduationService),
};
