/**
 * MyJKKN RCLTP — Results domain service (Phase B)
 * ----------------------------------------------------------------------------
 * Tables: rcltp_assessment_results (§3.6), rcltp_student_journey (§3.8),
 *         rcltp_band_config (§3.7).
 *
 * Follows the canonical passages-service pattern:
 *   - class with `static` methods + a singleton `createClientSupabaseClient()`
 *   - `(this.supabase as any).from('rcltp_*')` (generated Database type lacks
 *     rcltp_ tables; the cast is the MyJKKN convention)
 *   - tenant scoping by institution_id (none of these are library tables, so no
 *     global-row .or(...is.null) trick)
 *   - READS + STAFF/ADMIN band-config writes go through the client (RLS allows)
 *   - STUDENT-affecting / formula-dependent logic is stubbed → awaiting MyJKKN
 *     (composite scoring + band placement, SLJ progression)
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  RcltpAssessmentResult,
  RcltpStudentJourney,
  RcltpBandConfig,
  RcltpResultFilters,
  RcltpStudentJourneyFilters,
  RcltpBandConfigFilters,
  RcltpListResponse,
  CreateRcltpBandConfigDto,
  UpdateRcltpBandConfigDto,
  RcltpSchoolDashboard,
} from '@/types/rcltp';
import {
  rcltpRange,
  rcltpMetadata,
  rcltpAwaitingValidationContent,
  rcltpPostJson,
} from './rcltp-helpers';

export class RcltpResultsService {
  private static supabase = createClientSupabaseClient();

  // -------------------------------------------------------------------------
  // RESULTS — reads (RLS: staff institution-scoped; own student reads own)
  // -------------------------------------------------------------------------

  static async getResults(
    filters: RcltpResultFilters = {}
  ): Promise<RcltpListResponse<RcltpAssessmentResult>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_assessment_results')
        .select('*', { count: 'exact' });

      if (filters.institution_id)
        query = query.eq('institution_id', filters.institution_id);
      if (filters.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters.assessment_id)
        query = query.eq('assessment_id', filters.assessment_id);

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpAssessmentResult[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpResultsService.getResults error:', error);
      throw error;
    }
  }

  /**
   * One result per assessment (assessment_id is UNIQUE). Returns null when no
   * result has been computed yet — does NOT throw, so callers can render a
   * "not scored yet" state.
   */
  static async getResultByAssessment(
    assessmentId: string
  ): Promise<RcltpAssessmentResult | null> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_assessment_results')
      .select('*')
      .eq('assessment_id', assessmentId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as RcltpAssessmentResult | null;
  }

  // -------------------------------------------------------------------------
  // SCHOOL-HEAD DASHBOARD — read-only aggregate RPC (Phase 4e)
  // -------------------------------------------------------------------------

  /**
   * Aggregate school-head (principal) dashboard data via
   * `fn_rcltp_school_dashboard(p_institution_id)`. Every array in the result
   * is empty until MyJKKN scoring produces `rcltp_assessment_results` rows —
   * the RPC always marks `provisional: true`. Callers MUST render the
   * "Provisional — pending MyJKKN validation" banner whenever any array is
   * non-empty (see PrincipalDashboard).
   */
  static async getSchoolDashboard(
    institutionId: string
  ): Promise<RcltpSchoolDashboard> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_rcltp_school_dashboard',
      { p_institution_id: institutionId }
    );
    if (error) throw error;
    return (
      (data as RcltpSchoolDashboard) ?? {
        provisional: true,
        totals: { scoredSittings: 0, learners: 0 },
        bandDistribution: [],
        cycleProgress: [],
        atRisk: [],
        sectionComparison: [],
      }
    );
  }

  // -------------------------------------------------------------------------
  // STUDENT JOURNEY — reads (RLS: staff institution-scoped; own student reads own)
  // -------------------------------------------------------------------------

  static async getJourney(
    filters: RcltpStudentJourneyFilters = {}
  ): Promise<RcltpListResponse<RcltpStudentJourney>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_student_journey')
        .select('*', { count: 'exact' });

      if (filters.institution_id)
        query = query.eq('institution_id', filters.institution_id);
      if (filters.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters.dimension) query = query.eq('dimension', filters.dimension);

      query = query.range(from, to).order('updated_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpStudentJourney[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpResultsService.getJourney error:', error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // BAND CONFIG — reads (RLS: staff institution-scoped)
  // -------------------------------------------------------------------------

  static async getBandConfigs(
    filters: RcltpBandConfigFilters = {}
  ): Promise<RcltpListResponse<RcltpBandConfig>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_band_config')
        .select('*', { count: 'exact' });

      if (filters.institution_id)
        query = query.eq('institution_id', filters.institution_id);
      if (filters.dimension) query = query.eq('dimension', filters.dimension);
      if (filters.band) query = query.eq('band', filters.band);
      if (filters.is_active !== undefined)
        query = query.eq('is_active', filters.is_active);

      query = query.range(from, to).order('dimension', { ascending: true });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpBandConfig[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpResultsService.getBandConfigs error:', error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // BAND CONFIG — staff/admin writes (RLS: rcltp.config.manage)
  // -------------------------------------------------------------------------

  static async createBandConfig(
    input: CreateRcltpBandConfigDto
  ): Promise<RcltpBandConfig> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_band_config')
      .insert([input])
      .select()
      .single();
    if (error) throw error;
    toast.success('Band config created');
    return data as RcltpBandConfig;
  }

  static async updateBandConfig(
    id: string,
    input: UpdateRcltpBandConfigDto
  ): Promise<RcltpBandConfig> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_band_config')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    toast.success('Band config updated');
    return data as RcltpBandConfig;
  }

  static async deleteBandConfig(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('rcltp_band_config')
      .delete()
      .eq('id', id);
    if (error) throw error;
    toast.success('Band config deleted');
  }

  // -------------------------------------------------------------------------
  // DEFERRED — content/formula-dependent logic → awaiting MyJKKN
  // -------------------------------------------------------------------------

  /**
   * PROVISIONAL scoring — run the composite engine for a sitting via the
   * service-role route `POST /api/rcltp/assessments/:id/score`. Auto-grades Part B,
   * combines with the teacher-entered Part A score, places bands from the tenant's
   * (or provisional) cutoffs, upserts `rcltp_assessment_results`, and advances the
   * learner journey server-side.
   *
   * ⚠️ Result bands/scores are PROVISIONAL — pending MyJKKN validation — and MUST be
   * rendered with the "Provisional — pending MyJKKN validation" banner.
   *
   * @param readingScore teacher-entered Part A (read-aloud) score 0–100; omit for a
   *   consent-driven Part-B-only sitting.
   */
  static async computeAndStoreResult(
    assessmentId: string,
    readingScore?: number | null
  ): Promise<RcltpAssessmentResult> {
    return rcltpPostJson<RcltpAssessmentResult>(
      `/api/rcltp/assessments/${assessmentId}/score`,
      readingScore != null ? { readingScore } : undefined
    );
  }

  /**
   * Advance the learner's Student Learning Journey (current band per dimension
   * + progression log) after a new result. Band progression rules are MyJKKN
   * content — deferred.
   */
  static async updateStudentJourney(
    _learnerId: string
  ): Promise<RcltpStudentJourney> {
    return rcltpAwaitingValidationContent('band progression / SLJ update');
  }
}
