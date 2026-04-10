import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  CASETrack,
  CASETrackWithPrerequisite,
  CASETrackEnrollment,
  CASETrackEnrollmentWithTrack,
  CASEBatch,
  CASELearnerProgress,
  CASEAlert,
  CASEGraduationRequirement,
  CASEBatchFilters,
  CASEAlertFilters,
  CreateCASEBatchInput,
  UpdateCASEBatchInput,
  UpdateCASETrackInput,
  PlacementResult,
  TrackCompletionStats,
  RiskDistribution,
  AtRiskLearner,
  CASEDashboardStats,
  CASEGraduationReadiness,
  CASERiskCalculation,
} from '@/types/case';
import { PLACEMENT_QUESTIONS } from '@/lib/data/case-placement-questions';

// ================================================================================
// CASEService — Graduation Tracker (CASE Module)
// Handles tracks, enrollments, placement, graduation, batches, alerts, analytics
// ================================================================================

export class CASEService {
  // Cast to any — CASE tables exist in DB but aren't in generated Supabase types yet
  private static supabase = createClientSupabaseClient() as any;

  // ── TRACKS ──────────────────────────────────────────────────────────────────

  /**
   * Get all active tracks ordered by sequence_order, with prerequisite track name
   */
  static async getTracks(): Promise<CASETrackWithPrerequisite[]> {
    const { data, error } = await this.supabase
      .from('case_tracks')
      .select('*, prerequisite_track:case_tracks!case_tracks_prerequisite_track_id_fkey(*)')
      .eq('is_active', true)
      .order('sequence_order', { ascending: true });

    if (error) {
      console.error('[vac/case] Failed to fetch tracks:', error);
      throw new Error(`Failed to fetch CASE tracks: ${error.message}`);
    }

    return (data ?? []) as CASETrackWithPrerequisite[];
  }

  /**
   * Get a single track by ID with prerequisite info
   */
  static async getTrackById(id: string): Promise<CASETrackWithPrerequisite | null> {
    const { data, error } = await this.supabase
      .from('case_tracks')
      .select('*, prerequisite_track:case_tracks!case_tracks_prerequisite_track_id_fkey(*)')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[vac/case] Failed to fetch track:', error);
      throw new Error(`Failed to fetch CASE track: ${error.message}`);
    }

    return data as CASETrackWithPrerequisite;
  }

  /**
   * Update track configuration (thresholds, description, active status)
   */
  static async updateTrack(id: string, input: UpdateCASETrackInput): Promise<CASETrack> {
    const { data, error } = await this.supabase
      .from('case_tracks')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[vac/case] Failed to update track:', error);
      throw new Error(`Failed to update CASE track: ${error.message}`);
    }

    return data as CASETrack;
  }

  // ── TRACK ENROLLMENTS ───────────────────────────────────────────────────────

  /**
   * Enroll a user in a track, optionally linked to a course and batch
   */
  static async enrollInTrack(
    userId: string,
    trackId: string,
    courseId?: string,
    batchId?: string
  ): Promise<CASETrackEnrollment> {
    const { data, error } = await this.supabase
      .from('case_track_enrollments')
      .insert({
        user_id: userId,
        track_id: trackId,
        course_id: courseId ?? null,
        batch_id: batchId ?? null,
        status: 'enrolled',
        attendance_percentage: 0,
        grader_score_average: 0,
        project_submitted: false,
        project_score: null,
        completion_gate_attendance: false,
        completion_gate_grader: false,
        completion_gate_project: false,
        retry_count: 0,
        placement_start_week: 1,
      })
      .select()
      .single();

    if (error) {
      console.error('[vac/case] Failed to enroll in track:', error);
      throw new Error(`Failed to enroll in track: ${error.message}`);
    }

    return data as CASETrackEnrollment;
  }

  /**
   * Get all track enrollments for a user, including track details
   */
  static async getMyTrackEnrollments(userId: string): Promise<CASETrackEnrollmentWithTrack[]> {
    const { data, error } = await this.supabase
      .from('case_track_enrollments')
      .select('*, case_tracks(*)')
      .eq('user_id', userId)
      .order('enrolled_at', { ascending: false });

    if (error) {
      console.error('[vac/case] Failed to fetch track enrollments:', error);
      throw new Error(`Failed to fetch track enrollments: ${error.message}`);
    }

    return (data ?? []) as CASETrackEnrollmentWithTrack[];
  }

  /**
   * Update a track enrollment (gates, scores, status)
   */
  static async updateTrackEnrollment(
    id: string,
    updates: Partial<CASETrackEnrollment>
  ): Promise<CASETrackEnrollment> {
    const { data, error } = await this.supabase
      .from('case_track_enrollments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[vac/case] Failed to update track enrollment:', error);
      throw new Error(`Failed to update track enrollment: ${error.message}`);
    }

    return data as CASETrackEnrollment;
  }

  /**
   * Check if a user meets the prerequisite for a given track
   */
  static async checkPrerequisite(
    userId: string,
    trackId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Fetch the track to see if it has a prerequisite
    const track = await this.getTrackById(trackId);
    if (!track) {
      return { allowed: false, reason: 'Track not found' };
    }

    // No prerequisite means allowed
    if (!track.prerequisite_track_id) {
      return { allowed: true };
    }

    // Check if user has completed the prerequisite track
    const { data, error } = await this.supabase
      .from('case_track_enrollments')
      .select('id, status')
      .eq('user_id', userId)
      .eq('track_id', track.prerequisite_track_id)
      .eq('status', 'completed')
      .limit(1);

    if (error) {
      console.error('[vac/case] Failed to check prerequisite:', error);
      throw new Error(`Failed to check prerequisite: ${error.message}`);
    }

    if (!data || data.length === 0) {
      const prereqName = track.prerequisite_track?.track_name ?? 'the prerequisite track';
      return {
        allowed: false,
        reason: `You must complete "${prereqName}" before enrolling in "${track.track_name}"`,
      };
    }

    return { allowed: true };
  }

  // ── PLACEMENT ───────────────────────────────────────────────────────────────

  /**
   * Get placement questions filtered by track code
   */
  static getPlacementQuestions(trackCode: string) {
    return PLACEMENT_QUESTIONS.filter((q) => q.track_code === trackCode);
  }

  /**
   * Submit placement test answers, calculate score, determine start week, create enrollment
   *
   * Score mapping:
   *   0-30%  → start at week 1 (beginner)
   *   31-60% → start at week 2 (intermediate)
   *   61-100% → start at week 3 (advanced)
   */
  static async submitPlacement(
    userId: string,
    trackId: string,
    answers: { question_id: string; selected_answer: string }[]
  ): Promise<{ enrollment: CASETrackEnrollment; placement: PlacementResult }> {
    // Fetch the track to get its code
    const track = await this.getTrackById(trackId);
    if (!track) {
      throw new Error('Track not found');
    }

    // Get questions for this track
    const questions = this.getPlacementQuestions(track.track_code);
    if (questions.length === 0) {
      throw new Error(`No placement questions found for track "${track.track_code}"`);
    }

    // Calculate score
    let correctCount = 0;
    for (const answer of answers) {
      const question = questions.find((q) => q.id === answer.question_id);
      if (question && question.correct_answer === answer.selected_answer) {
        correctCount++;
      }
    }

    const totalQuestions = questions.length;
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    // Determine start week based on score
    let startWeek: number;
    if (score <= 30) {
      startWeek = 1;
    } else if (score <= 60) {
      startWeek = 2;
    } else {
      startWeek = 3;
    }

    const placementResult: PlacementResult = {
      score,
      start_week: startWeek,
      total_questions: totalQuestions,
      correct_count: correctCount,
    };

    // Create enrollment with placement data
    const { data, error } = await this.supabase
      .from('case_track_enrollments')
      .insert({
        user_id: userId,
        track_id: trackId,
        status: 'enrolled',
        attendance_percentage: 0,
        grader_score_average: 0,
        project_submitted: false,
        project_score: null,
        completion_gate_attendance: false,
        completion_gate_grader: false,
        completion_gate_project: false,
        retry_count: 0,
        placement_score: score,
        placement_start_week: startWeek,
        placement_taken_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[vac/case] Failed to submit placement:', error);
      throw new Error(`Failed to submit placement: ${error.message}`);
    }

    return {
      enrollment: data as CASETrackEnrollment,
      placement: placementResult,
    };
  }

  // ── GRADUATION & PROGRESS ──────────────────────────────────────────────────

  /**
   * Get learner progress record for a user
   */
  static async getLearnerProgress(userId: string): Promise<CASELearnerProgress | null> {
    const { data, error } = await this.supabase
      .from('case_learner_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[vac/case] Failed to fetch learner progress:', error);
      throw new Error(`Failed to fetch learner progress: ${error.message}`);
    }

    return data as CASELearnerProgress;
  }

  /**
   * Get graduation readiness stats from the materialized view
   */
  static async getGraduationReadiness(
    institutionId: string
  ): Promise<CASEGraduationReadiness[]> {
    const { data, error } = await this.supabase
      .from('case_graduation_readiness')
      .select('*')
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[vac/case] Failed to fetch graduation readiness:', error);
      throw new Error(`Failed to fetch graduation readiness: ${error.message}`);
    }

    return (data ?? []) as CASEGraduationReadiness[];
  }

  /**
   * Get at-risk learners from the risk calculator view, joined with profile names
   */
  static async getAtRiskLearners(institutionId: string): Promise<AtRiskLearner[]> {
    const { data, error } = await this.supabase
      .from('case_risk_calculator')
      .select('*, profiles:user_id(full_name, email)')
      .eq('institution_id', institutionId)
      .in('calculated_risk_level', ['at_risk', 'critical', 'overdue']);

    if (error) {
      console.error('[vac/case] Failed to fetch at-risk learners:', error);
      throw new Error(`Failed to fetch at-risk learners: ${error.message}`);
    }

    // Map the joined profile data into flat AtRiskLearner shape
    return (data ?? []).map((row: any) => ({
      user_id: row.user_id,
      user_name: row.profiles?.full_name ?? 'Unknown',
      user_email: row.profiles?.email ?? '',
      programme_name: row.programme_name ?? '',
      current_semester: row.current_semester,
      tracks_completed: row.tracks_completed,
      tracks_remaining: row.tracks_remaining,
      risk_level: row.calculated_risk_level,
      semesters_remaining: row.semesters_remaining,
      tracks_per_semester_needed: row.tracks_per_semester_needed,
      last_alert_sent_at: row.last_alert_sent_at ?? null,
    })) as AtRiskLearner[];
  }

  /**
   * Get graduation requirements config for a programme at an institution
   */
  static async getGraduationRequirements(
    programmeId: string,
    institutionId: string
  ): Promise<CASEGraduationRequirement | null> {
    const { data, error } = await this.supabase
      .from('case_graduation_requirements')
      .select('*')
      .eq('programme_id', programmeId)
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[vac/case] Failed to fetch graduation requirements:', error);
      throw new Error(`Failed to fetch graduation requirements: ${error.message}`);
    }

    return data as CASEGraduationRequirement;
  }

  // ── BATCHES ─────────────────────────────────────────────────────────────────

  /**
   * List batches with optional filtering, joined with track name
   */
  static async getBatches(filters: CASEBatchFilters = {}): Promise<{
    data: (CASEBatch & { case_tracks: Pick<CASETrack, 'track_name' | 'track_code'> })[];
    count: number;
  }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('case_batches')
      .select('*, case_tracks(track_name, track_code)', { count: 'exact' });

    if (filters.track_id) {
      query = query.eq('track_id', filters.track_id);
    }
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[vac/case] Failed to fetch batches:', error);
      throw new Error(`Failed to fetch batches: ${error.message}`);
    }

    return {
      data: (data ?? []) as (CASEBatch & { case_tracks: Pick<CASETrack, 'track_name' | 'track_code'> })[],
      count: count ?? 0,
    };
  }

  /**
   * Get a single batch by ID
   */
  static async getBatchById(id: string): Promise<CASEBatch | null> {
    const { data, error } = await this.supabase
      .from('case_batches')
      .select('*, case_tracks(track_name, track_code)')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[vac/case] Failed to fetch batch:', error);
      throw new Error(`Failed to fetch batch: ${error.message}`);
    }

    return data as CASEBatch;
  }

  /**
   * Create a new batch
   */
  static async createBatch(input: CreateCASEBatchInput): Promise<CASEBatch> {
    const { data, error } = await this.supabase
      .from('case_batches')
      .insert({
        track_id: input.track_id,
        institution_id: input.institution_id,
        batch_code: input.batch_code ?? null,
        delivery_format: input.delivery_format ?? 'moderate',
        start_date: input.start_date,
        end_date: input.end_date,
        schedule_json: input.schedule_json ?? null,
        max_capacity: input.max_capacity ?? 40,
        facilitator_id: input.facilitator_id ?? null,
        status: 'planned',
        current_enrollment: 0,
        is_auto_suggested: false,
      })
      .select()
      .single();

    if (error) {
      console.error('[vac/case] Failed to create batch:', error);
      throw new Error(`Failed to create batch: ${error.message}`);
    }

    return data as CASEBatch;
  }

  /**
   * Update an existing batch
   */
  static async updateBatch(id: string, input: UpdateCASEBatchInput): Promise<CASEBatch> {
    const { data, error } = await this.supabase
      .from('case_batches')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[vac/case] Failed to update batch:', error);
      throw new Error(`Failed to update batch: ${error.message}`);
    }

    return data as CASEBatch;
  }

  // ── ALERTS ──────────────────────────────────────────────────────────────────

  /**
   * Get alerts for a user with optional filtering
   */
  static async getAlerts(
    userId: string,
    filters: CASEAlertFilters = {}
  ): Promise<{ data: CASEAlert[]; count: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('case_alerts')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (filters.alert_type) {
      query = query.eq('alert_type', filters.alert_type);
    }
    if (filters.unread_only) {
      query = query.is('read_at', null);
    }

    query = query.order('sent_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[vac/case] Failed to fetch alerts:', error);
      throw new Error(`Failed to fetch alerts: ${error.message}`);
    }

    return {
      data: (data ?? []) as CASEAlert[],
      count: count ?? 0,
    };
  }

  /**
   * Mark a single alert as read
   */
  static async markAlertRead(alertId: string): Promise<void> {
    const { error } = await this.supabase
      .from('case_alerts')
      .update({ read_at: new Date().toISOString() })
      .eq('id', alertId);

    if (error) {
      console.error('[vac/case] Failed to mark alert read:', error);
      throw new Error(`Failed to mark alert read: ${error.message}`);
    }
  }

  /**
   * Get count of unread alerts for a user
   */
  static async getUnreadAlertCount(userId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('case_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) {
      console.error('[vac/case] Failed to fetch unread alert count:', error);
      throw new Error(`Failed to fetch unread alert count: ${error.message}`);
    }

    return count ?? 0;
  }

  // ── ANALYTICS ───────────────────────────────────────────────────────────────

  /**
   * Get per-track enrollment and completion statistics for an institution
   */
  static async getTrackCompletionStats(
    institutionId: string
  ): Promise<TrackCompletionStats[]> {
    // Get all active tracks
    const { data: tracks, error: tracksError } = await this.supabase
      .from('case_tracks')
      .select('id, track_code, track_name, track_type')
      .eq('is_active', true)
      .order('sequence_order', { ascending: true });

    if (tracksError) {
      console.error('[vac/case] Failed to fetch tracks for stats:', tracksError);
      throw new Error(`Failed to fetch track stats: ${tracksError.message}`);
    }

    if (!tracks || tracks.length === 0) return [];

    // Get all enrollments for this institution's batches (or all if no batch constraint)
    // We query enrollments and join via batch to filter by institution
    const { data: enrollments, error: enrollError } = await this.supabase
      .from('case_track_enrollments')
      .select('track_id, status, attendance_percentage, grader_score_average, batch_id, case_batches!left(institution_id)')
      .not('batch_id', 'is', null);

    if (enrollError) {
      console.error('[vac/case] Failed to fetch enrollments for stats:', enrollError);
      throw new Error(`Failed to fetch enrollment stats: ${enrollError.message}`);
    }

    // Also get enrollments without batch (direct enrollments) — these need institution
    // context from learner_progress
    const { data: directEnrollments, error: directError } = await this.supabase
      .from('case_track_enrollments')
      .select('track_id, status, attendance_percentage, grader_score_average, user_id')
      .is('batch_id', null);

    if (directError) {
      console.error('[vac/case] Failed to fetch direct enrollments:', directError);
      throw new Error(`Failed to fetch direct enrollments: ${directError.message}`);
    }

    // Filter batch-based enrollments by institution
    const institutionEnrollments = (enrollments ?? []).filter(
      (e: any) => e.case_batches?.institution_id === institutionId
    );

    // For direct enrollments, check learner_progress for institution match
    const directUserIds = (directEnrollments ?? []).map((e: any) => e.user_id);
    let institutionDirectEnrollments: any[] = [];

    if (directUserIds.length > 0) {
      const { data: progressData } = await this.supabase
        .from('case_learner_progress')
        .select('user_id')
        .eq('institution_id', institutionId)
        .in('user_id', directUserIds);

      const validUserIds = new Set((progressData ?? []).map((p: any) => p.user_id));
      institutionDirectEnrollments = (directEnrollments ?? []).filter(
        (e: any) => validUserIds.has(e.user_id)
      );
    }

    // Combine all enrollments
    const allEnrollments = [...institutionEnrollments, ...institutionDirectEnrollments];

    // Compute per-track stats
    return tracks.map((track) => {
      const trackEnrollments = allEnrollments.filter((e: any) => e.track_id === track.id);
      const totalEnrolled = trackEnrollments.length;
      const completedCount = trackEnrollments.filter((e: any) => e.status === 'completed').length;
      const inProgressCount = trackEnrollments.filter(
        (e: any) => e.status === 'in_progress' || e.status === 'enrolled'
      ).length;

      const avgAttendance =
        totalEnrolled > 0
          ? Math.round(
              trackEnrollments.reduce((sum: number, e: any) => sum + (e.attendance_percentage ?? 0), 0) /
                totalEnrolled
            )
          : 0;

      const avgGraderScore =
        totalEnrolled > 0
          ? Math.round(
              trackEnrollments.reduce((sum: number, e: any) => sum + (e.grader_score_average ?? 0), 0) /
                totalEnrolled
            )
          : 0;

      return {
        track_id: track.id,
        track_code: track.track_code,
        track_name: track.track_name,
        track_type: track.track_type,
        total_enrolled: totalEnrolled,
        completed_count: completedCount,
        in_progress_count: inProgressCount,
        completion_rate: totalEnrolled > 0 ? Math.round((completedCount / totalEnrolled) * 100) : 0,
        avg_attendance: avgAttendance,
        avg_grader_score: avgGraderScore,
      } as TrackCompletionStats;
    });
  }

  /**
   * Get risk distribution counts for an institution
   */
  static async getRiskDistribution(institutionId: string): Promise<RiskDistribution> {
    const { data, error } = await this.supabase
      .from('case_learner_progress')
      .select('risk_level')
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[vac/case] Failed to fetch risk distribution:', error);
      throw new Error(`Failed to fetch risk distribution: ${error.message}`);
    }

    const distribution: RiskDistribution = {
      on_track: 0,
      at_risk: 0,
      critical: 0,
      overdue: 0,
      completed: 0,
      total: 0,
    };

    for (const row of data ?? []) {
      distribution.total++;
      const level = row.risk_level as keyof Omit<RiskDistribution, 'total'>;
      if (level in distribution) {
        distribution[level]++;
      }
    }

    return distribution;
  }

  /**
   * Get combined dashboard stats for CASE admin dashboard
   */
  static async getDashboardStats(institutionId: string): Promise<CASEDashboardStats> {
    // Run graduation readiness and track completion in parallel
    const [readinessData, trackStats, riskDist] = await Promise.all([
      this.getGraduationReadiness(institutionId),
      this.getTrackCompletionStats(institutionId),
      this.getRiskDistribution(institutionId),
    ]);

    // Aggregate readiness across all programmes
    const totalLearners = readinessData.reduce((sum, r) => sum + r.total_learners, 0);
    const graduationReadyCount = readinessData.reduce((sum, r) => sum + r.graduation_ready_count, 0);
    const avgTracksCompleted =
      readinessData.length > 0
        ? Math.round(
            (readinessData.reduce((sum, r) => sum + r.avg_tracks_completed, 0) / readinessData.length) * 10
          ) / 10
        : 0;
    const avgHoursCompleted =
      readinessData.length > 0
        ? Math.round(
            (readinessData.reduce((sum, r) => sum + r.avg_hours_completed, 0) / readinessData.length) * 10
          ) / 10
        : 0;

    return {
      total_learners: totalLearners,
      graduation_ready_count: graduationReadyCount,
      at_risk_count: riskDist.at_risk,
      critical_count: riskDist.critical,
      overdue_count: riskDist.overdue,
      avg_tracks_completed: avgTracksCompleted,
      avg_hours_completed: avgHoursCompleted,
      track_completion_rates: trackStats,
    };
  }
}
