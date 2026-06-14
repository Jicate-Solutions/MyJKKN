/**
 * EKSAQ RCLTP — Assessments domain service (Phase B)
 * ----------------------------------------------------------------------------
 * Tables: rcltp_assessments (§3.3), rcltp_part_a_recordings (§3.4),
 *         rcltp_part_b_responses (§3.5).
 *
 * Follows the canonical rcltp pattern (see passages-service.ts):
 *   - class with `static` methods + a singleton `createClientSupabaseClient()`
 *   - `(this.supabase as any).from('rcltp_*')` (generated Database type lacks
 *     rcltp_ tables; the cast is the MyJKKN convention)
 *   - tenant scoping by institution_id (all three tables are institution_id
 *     NOT NULL — no global-row .or(...is.null) trick, unlike the library tables)
 *   - READS + STAFF/ADMIN writes go through the client (RLS §6.4–6.6 allow them)
 *   - STUDENT-affecting writes (start/submit/upload/responses) are stubs →
 *     server-side service-role routes (migration §6: no student write policy)
 *   - engine scoring is a stub → server-side (writes integrity fields)
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  RcltpAssessment,
  RcltpPartARecording,
  RcltpPartBResponse,
  RcltpAssessmentFilters,
  RcltpPartARecordingFilters,
  RcltpPartBResponseFilters,
  RcltpListResponse,
  CreateRcltpAssessmentDto,
  UpdateRcltpAssessmentDto,
  UpdateRcltpRecordingReviewDto,
} from '@/types/rcltp';
import {
  rcltpRange,
  rcltpMetadata,
  rcltpServerWriteRequired,
} from './rcltp-helpers';

export class RcltpAssessmentsService {
  private static supabase = createClientSupabaseClient();

  // -------------------------------------------------------------------------
  // ASSESSMENTS — reads (RLS-scoped: staff read institution; student reads own)
  // -------------------------------------------------------------------------

  static async getAssessments(
    filters: RcltpAssessmentFilters = {}
  ): Promise<RcltpListResponse<RcltpAssessment>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_assessments')
        .select('*', { count: 'exact' });

      if (filters.institution_id)
        query = query.eq('institution_id', filters.institution_id);
      if (filters.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters.academic_year_id)
        query = query.eq('academic_year_id', filters.academic_year_id);
      if (filters.section_id) query = query.eq('section_id', filters.section_id);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.assessment_type)
        query = query.eq('assessment_type', filters.assessment_type);
      if (filters.cycle_no !== undefined)
        query = query.eq('cycle_no', filters.cycle_no);
      if (filters.is_official !== undefined)
        query = query.eq('is_official', filters.is_official);

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpAssessment[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpAssessmentsService.getAssessments error:', error);
      throw error;
    }
  }

  static async getAssessmentById(id: string): Promise<RcltpAssessment> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_assessments')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    if (!data) throw new Error('Assessment not found');
    return data as RcltpAssessment;
  }

  // -------------------------------------------------------------------------
  // ASSESSMENTS — staff/admin writes (RLS: rcltp.assessment.manage)
  // "Open assessment for class" — student start/submit are server-side stubs.
  // -------------------------------------------------------------------------

  static async createAssessment(
    input: CreateRcltpAssessmentDto
  ): Promise<RcltpAssessment> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_assessments')
      .insert([{ language: 'en', ...input }])
      .select()
      .single();
    if (error) throw error;
    toast.success('Assessment created');
    return data as RcltpAssessment;
  }

  static async updateAssessment(
    id: string,
    input: UpdateRcltpAssessmentDto
  ): Promise<RcltpAssessment> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_assessments')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    toast.success('Assessment updated');
    return data as RcltpAssessment;
  }

  static async deleteAssessment(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('rcltp_assessments')
      .delete()
      .eq('id', id);
    if (error) throw error;
    toast.success('Assessment deleted');
  }

  // -------------------------------------------------------------------------
  // PART A RECORDINGS — reads (RLS-scoped via parent assessment)
  // -------------------------------------------------------------------------

  static async getRecordings(
    filters: RcltpPartARecordingFilters = {}
  ): Promise<RcltpListResponse<RcltpPartARecording>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_part_a_recordings')
        .select('*', { count: 'exact' });

      if (filters.assessment_id)
        query = query.eq('assessment_id', filters.assessment_id);
      if (filters.institution_id)
        query = query.eq('institution_id', filters.institution_id);
      if (filters.scoring_status)
        query = query.eq('scoring_status', filters.scoring_status);
      if (filters.sync_status)
        query = query.eq('sync_status', filters.sync_status);

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpPartARecording[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpAssessmentsService.getRecordings error:', error);
      throw error;
    }
  }

  static async getRecordingById(id: string): Promise<RcltpPartARecording> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_part_a_recordings')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    if (!data) throw new Error('Recording not found');
    return data as RcltpPartARecording;
  }

  // -------------------------------------------------------------------------
  // PART A RECORDINGS — staff write (RLS: rcltp.review UPDATE only)
  // Reviewers may UPDATE review fields; they cannot INSERT recordings.
  // -------------------------------------------------------------------------

  static async reviewRecording(
    id: string,
    input: UpdateRcltpRecordingReviewDto
  ): Promise<RcltpPartARecording> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_part_a_recordings')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    toast.success('Recording review saved');
    return data as RcltpPartARecording;
  }

  // -------------------------------------------------------------------------
  // PART B RESPONSES — reads (RLS-scoped via parent assessment)
  // -------------------------------------------------------------------------

  static async getResponses(
    filters: RcltpPartBResponseFilters = {}
  ): Promise<RcltpListResponse<RcltpPartBResponse>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_part_b_responses')
        .select('*', { count: 'exact' });

      if (filters.assessment_id)
        query = query.eq('assessment_id', filters.assessment_id);
      if (filters.question_id)
        query = query.eq('question_id', filters.question_id);
      if (filters.institution_id)
        query = query.eq('institution_id', filters.institution_id);

      query = query.range(from, to).order('created_at', { ascending: true });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpPartBResponse[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpAssessmentsService.getResponses error:', error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // DEFERRED — student-affecting writes → server-side service-role routes
  // (migration §6: students have NO write policy on any rcltp_ table).
  // -------------------------------------------------------------------------

  /** Student opens a scheduled sitting (status transition). Server-side only. */
  static async startAssessment(_assessmentId: string): Promise<RcltpAssessment> {
    return rcltpServerWriteRequired('POST /api/rcltp/assessments/:id/start');
  }

  /** Student submits a sitting (status + submitted_at transition). Server-side only. */
  static async submitAssessment(_assessmentId: string): Promise<RcltpAssessment> {
    return rcltpServerWriteRequired('POST /api/rcltp/assessments/:id/submit');
  }

  /** Student uploads Part A audio (creates a recording row). Server-side only. */
  static async uploadRecording(
    _assessmentId: string,
    _audio?: unknown
  ): Promise<RcltpPartARecording> {
    return rcltpServerWriteRequired('POST /api/rcltp/assessments/:id/recording');
  }

  /** Student records Part B answers (is_correct/score set server-side). Server-side only. */
  static async recordResponses(
    _assessmentId: string,
    _responses?: unknown
  ): Promise<void> {
    return rcltpServerWriteRequired('POST /api/rcltp/assessments/:id/responses');
  }

  // -------------------------------------------------------------------------
  // DEFERRED — voice/engine scoring → server-side (writes integrity fields)
  // -------------------------------------------------------------------------

  /** Run the voice-scoring engine over a recording and persist engine scores. Server-side only. */
  static async scoreRecording(
    _recordingId: string
  ): Promise<RcltpPartARecording> {
    return rcltpServerWriteRequired('POST /api/rcltp/recordings/:id/score');
  }
}
