// lib/services/case-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  CaseTrack, CaseLearnerProgress, CaseTrackEnrollment,
  CaseBatch, CaseRiskCalculation, CaseGraduationReadiness,
  CaseLearnerDashboard, CaseAtRiskLearner
} from '@/types/case';

export class CaseService {
  private static getClient() {
    return createClientSupabaseClient();
  }

  // ---- TRACKS ----

  static async getTracks(): Promise<CaseTrack[]> {
    const { data, error } = await this.getClient()
      .from('case_tracks')
      .select('*')
      .eq('is_active', true)
      .order('track_type')
      .order('sequence_order');
    if (error) throw error;
    return data || [];
  }

  static async getTrackByCode(code: string): Promise<CaseTrack | null> {
    const { data, error } = await this.getClient()
      .from('case_tracks')
      .select('*')
      .eq('track_code', code)
      .single();
    if (error) return null;
    return data;
  }

  // ---- LEARNER PROGRESS ----

  static async getLearnerProgress(userId: string): Promise<CaseLearnerProgress | null> {
    const { data, error } = await this.getClient()
      .from('case_learner_progress')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) return null;
    return data;
  }

  static async getLearnerDashboard(userId: string): Promise<CaseLearnerDashboard> {
    const [tracks, progress, enrollments] = await Promise.all([
      this.getTracks(),
      this.getLearnerProgress(userId),
      this.getLearnerEnrollments(userId),
    ]);

    // Calculate which tracks are available next
    const completedTrackIds = new Set(
      enrollments.filter(e => e.status === 'completed').map(e => e.track_id)
    );
    const next_available_tracks = tracks.filter(t => {
      if (completedTrackIds.has(t.id)) return false;
      if (enrollments.some(e => e.track_id === t.id && e.status !== 'incomplete')) return false;
      if (t.prerequisite_track_id && !completedTrackIds.has(t.prerequisite_track_id)) return false;
      return true;
    });

    let risk: CaseRiskCalculation | null = null;
    if (progress) {
      const { data } = await this.getClient()
        .from('case_risk_calculator')
        .select('*')
        .eq('user_id', userId)
        .single();
      risk = data;
    }

    return {
      progress: progress || {
        id: '', user_id: userId, programme_id: '', institution_id: '',
        admission_semester: 1, current_semester: 1, tracks_completed: 0,
        total_hours_completed: 0, graduation_ready: false,
        estimated_exam_date: null, risk_level: 'on_track' as const
      },
      enrollments,
      tracks,
      risk,
      next_available_tracks,
    };
  }

  // ---- ENROLLMENTS ----

  static async getLearnerEnrollments(userId: string): Promise<CaseTrackEnrollment[]> {
    const { data, error } = await this.getClient()
      .from('case_track_enrollments')
      .select('*, track:case_tracks(*)')
      .eq('user_id', userId)
      .order('created_at');
    if (error) throw error;
    return data || [];
  }

  static async enrollInTrack(userId: string, trackId: string, courseId?: string, batchId?: string) {
    const { data, error } = await this.getClient()
      .from('case_track_enrollments')
      .insert({
        user_id: userId,
        track_id: trackId,
        course_id: courseId || null,
        batch_id: batchId || null,
        status: 'enrolled',
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ---- BATCHES ----

  static async getBatches(filters?: {
    trackId?: string;
    institutionId?: string;
    status?: string;
  }): Promise<CaseBatch[]> {
    let query = this.getClient()
      .from('case_batches')
      .select('*, track:case_tracks(*)');

    if (filters?.trackId) query = query.eq('track_id', filters.trackId);
    if (filters?.institutionId) query = query.eq('institution_id', filters.institutionId);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query.order('start_date', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async createBatch(batch: Partial<CaseBatch>) {
    const { data, error } = await this.getClient()
      .from('case_batches')
      .insert(batch)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ---- RISK & ADMIN ----

  static async getAtRiskLearners(institutionId?: string): Promise<CaseRiskCalculation[]> {
    let query = this.getClient()
      .from('case_risk_calculator')
      .select('*')
      .in('calculated_risk_level', ['at_risk', 'critical', 'overdue']);

    if (institutionId) query = query.eq('institution_id', institutionId);

    const { data, error } = await query.order('calculated_risk_level');
    if (error) throw error;
    return data || [];
  }

  static async getGraduationReadiness(): Promise<CaseGraduationReadiness[]> {
    const { data, error } = await this.getClient()
      .from('case_graduation_readiness')
      .select('*')
      .order('readiness_percentage', { ascending: true });
    if (error) throw error;
    return data || [];
  }
}
