/**
 * MyJKKN RCLTP — Assessments domain service (Phase B)
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
  rcltpPostJson,
} from './rcltp-helpers';

/**
 * Response shape of POST /api/rcltp/recordings/upload-url — a service-role-minted
 * signed upload URL into the private rcltp-audio bucket. `path` is the
 * server-controlled storage key; `token` authorises the direct upload.
 */
export interface RcltpRecordingUploadUrl {
  path: string;
  signed_url: string;
  token: string;
  content_type: string;
}

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
  // STUDENT-AFFECTING WRITES — Phase 3: wired to the server-side service-role
  // routes. Students have NO write policy in RLS (§6); each route derives the
  // learner from the session, verifies ownership + institution, then writes via
  // service-role. The client never writes these tables directly.
  // -------------------------------------------------------------------------

  /** Student opens a scheduled sitting → POST /api/rcltp/assessments/:id/start. */
  static async startAssessment(assessmentId: string): Promise<RcltpAssessment> {
    return rcltpPostJson<RcltpAssessment>(`/api/rcltp/assessments/${assessmentId}/start`);
  }

  /** Student submits a sitting → POST /api/rcltp/assessments/:id/submit. */
  static async submitAssessment(assessmentId: string): Promise<RcltpAssessment> {
    return rcltpPostJson<RcltpAssessment>(`/api/rcltp/assessments/${assessmentId}/submit`);
  }

  /**
   * Mint a short-lived SIGNED UPLOAD URL for a Part A voice recording into the
   * private rcltp-audio bucket → POST /api/rcltp/recordings/upload-url. The SERVER
   * controls the storage path (institution/learner/assessment/…), so a student can
   * only ever write their OWN recording. Step 1 of the 3-step capture handshake:
   *   1. createRecordingUploadUrl → { path, signed_url, token }
   *   2. supabase.storage.from('rcltp-audio').uploadToSignedUrl(path, token, blob)
   *   3. uploadRecording(assessmentId, path) → creates the recording row
   */
  static async createRecordingUploadUrl(
    assessmentId: string,
    contentType: string = 'audio/webm'
  ): Promise<RcltpRecordingUploadUrl> {
    return rcltpPostJson<RcltpRecordingUploadUrl>('/api/rcltp/recordings/upload-url', {
      assessment_id: assessmentId,
      content_type: contentType,
    });
  }

  /** Student uploads Part A audio (creates a recording row) → POST .../recording. */
  static async uploadRecording(
    assessmentId: string,
    audio?: unknown
  ): Promise<RcltpPartARecording> {
    const audio_path = typeof audio === 'string' ? audio : undefined;
    return rcltpPostJson<RcltpPartARecording>(
      `/api/rcltp/assessments/${assessmentId}/recording`,
      { audio_path }
    );
  }

  /** Student records Part B answers (raw capture; grading is server-side) → .../responses. */
  static async recordResponses(
    assessmentId: string,
    responses?: unknown
  ): Promise<void> {
    await rcltpPostJson<unknown>(
      `/api/rcltp/assessments/${assessmentId}/responses`,
      { responses }
    );
  }

  // -------------------------------------------------------------------------
  // VOICE/ENGINE SCORING — Phase 3 route exists; the scoring engine + composite
  // formula are MyJKKN content, so the route returns an honest "awaiting MyJKKN" gate.
  // -------------------------------------------------------------------------

  /** Run the voice-scoring engine over a recording → POST /api/rcltp/recordings/:id/score. */
  static async scoreRecording(recordingId: string): Promise<RcltpPartARecording> {
    return rcltpPostJson<RcltpPartARecording>(`/api/rcltp/recordings/${recordingId}/score`);
  }
}
