// lib/services/startup-studio/sf100-service.ts
// Complete service for the Solve for 100 module — programs, enrollments,
// check-ins, paid-user tracking, phase engine, stall detection, leaderboard,
// graduation, interviews, pivots, roster changes, notifications, and export.

import { BaseService, type BaseListResponse } from '../base-service';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  SF100Program,
  SF100Enrollment,
  SF100CheckIn,
  SF100PaidUser,
  SF100Notification,
  SF100CustomerInterview,
  SF100Pivot,
  SF100RosterChange,
  SF100Phase,
  SF100EnrollmentStatus,
  CreateProgramDto,
  UpdateProgramDto,
  CreateCheckInDto,
  CreatePaidUserDto,
  ChurnDto,
  CreateInterviewDto,
  CreatePivotDto,
  CreateRosterChangeDto,
  PhaseAdvanceResult,
  BulkAdvanceResult,
  StallCheckResult,
  LeaderboardEntry,
  LeaderboardData,
  PublicStats,
  GraduationResult,
} from '@/types/startup-studio/sf100';

// Re-import NIF service for graduation integration
import { NifPipelineService } from './nif-pipeline-service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENROLLMENT_SELECT = `
  *,
  registration:event_registrations(
    team_name,
    team_code,
    institution_id,
    owner_id,
    institution:institutions(name)
  )
`;

const ENROLLMENT_DETAIL_SELECT = `
  *,
  registration:event_registrations(
    team_name,
    team_code,
    institution_id,
    owner_id,
    institution:institutions(name),
    team_members:event_team_members(profile_id, full_name, email, is_leader, status),
    submission:event_submissions(app_name, live_app_url, paying_users_count, mrr_amount, active_users_count)
  )
`;

/** Ordered phase list for display (highest first). */
const PHASE_ORDER: SF100Phase[] = [
  'graduated',
  'hundred_users',
  'growth',
  'first_users',
  'problem_solution_fit',
  'setup',
];

const PHASE_LABELS: Record<SF100Phase, string> = {
  graduated: 'Graduated',
  hundred_users: '100 Users',
  growth: 'Growth (25+)',
  first_users: 'First Users (5+)',
  problem_solution_fit: 'Problem-Solution Fit',
  setup: 'Setup',
};

/** Milestone thresholds that trigger notifications. */
const MILESTONES = [1, 10, 25, 50, 100] as const;

const MILESTONE_NOTIFICATION_MAP: Record<number, string> = {
  1: 'milestone_first_sale',
  10: 'milestone_10_users',
  25: 'milestone_25_users',
  50: 'milestone_50_users',
  100: 'milestone_100_users',
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SF100Service extends BaseService {
  // =========================================================================
  // Group 1 — Programs CRUD
  // =========================================================================

  /**
   * Create a new Solve for 100 program.
   */
  static async createProgram(
    data: CreateProgramDto,
    createdBy: string
  ): Promise<SF100Program> {
    const { data: program, error } = await this.supabase
      .from('sf100_programs')
      .insert({
        ...data,
        created_by: createdBy,
        status: 'draft',
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to create program: ' + error.message);
    return program as SF100Program;
  }

  /**
   * Get a single program by ID.
   */
  static async getProgram(programId: string): Promise<SF100Program | null> {
    const { data, error } = await this.supabase
      .from('sf100_programs')
      .select('*')
      .eq('id', programId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error('Failed to fetch program: ' + error.message);
    }
    return data as SF100Program;
  }

  /**
   * List programs with optional filters and pagination.
   */
  static async listPrograms(
    filters?: {
      status?: string;
      institution_id?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<BaseListResponse<SF100Program>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('sf100_programs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error('Failed to list programs: ' + error.message);

    const total = count || 0;
    return {
      data: (data || []) as SF100Program[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  /**
   * Update an existing program.
   */
  static async updateProgram(
    programId: string,
    data: UpdateProgramDto
  ): Promise<SF100Program> {
    const { data: program, error } = await this.supabase
      .from('sf100_programs')
      .update(data)
      .eq('id', programId)
      .select('*')
      .single();

    if (error) throw new Error('Failed to update program: ' + error.message);
    return program as SF100Program;
  }

  // =========================================================================
  // Group 2 — Enrollments
  // =========================================================================

  /**
   * Enroll a team into a Solve for 100 program.
   *
   * This is the most complex method:
   * 1. Read seed data from event_submissions.
   * 2. Determine starting phase from seed paying users.
   * 3. INSERT enrollment with seed data.
   * 4. INSERT initial phase_history record.
   * 5. Return enrollment with auto_advanced flag.
   */
  static async enrollTeam(
    programId: string,
    registrationId: string,
    enrolledBy: string
  ): Promise<SF100Enrollment & { auto_advanced: boolean; seed_data: any }> {
    // 1. Read seed data from event_submissions
    const { data: submission } = await this.supabase
      .from('event_submissions')
      .select('paying_users_count, mrr_amount, active_users_count')
      .eq('registration_id', registrationId)
      .single();

    const seedPayingUsers = submission?.paying_users_count ?? 0;
    const seedMrr = submission?.mrr_amount ?? 0;
    const seedActiveUsers = submission?.active_users_count ?? 0;

    // 2. Determine starting phase based on seed data
    let startingPhase: SF100Phase = 'setup';
    if (seedPayingUsers >= 100) {
      startingPhase = 'hundred_users';
    } else if (seedPayingUsers >= 25) {
      startingPhase = 'growth';
    } else if (seedPayingUsers >= 5) {
      startingPhase = 'first_users';
    } else if (seedPayingUsers > 0) {
      startingPhase = 'problem_solution_fit';
    }

    const autoAdvanced = startingPhase !== 'setup';
    const now = new Date().toISOString();

    // 3. INSERT enrollment
    const { data: enrollment, error } = await this.supabase
      .from('sf100_enrollments')
      .insert({
        program_id: programId,
        registration_id: registrationId,
        current_phase: startingPhase,
        phase_entered_at: now,
        status: 'active' as SF100EnrollmentStatus,
        status_changed_at: now,
        cumulative_paid_users: 0,
        active_paid_users: 0,
        internal_paid_users: 0,
        total_revenue: 0,
        seed_paying_users: seedPayingUsers,
        seed_mrr: seedMrr,
        seed_active_users: seedActiveUsers,
        enrolled_at: now,
        enrolled_by: enrolledBy,
      })
      .select(ENROLLMENT_SELECT)
      .single();

    if (error) throw new Error('Failed to enroll team: ' + error.message);

    // 4. INSERT initial phase_history record
    const { error: historyError } = await this.supabase
      .from('sf100_phase_history')
      .insert({
        enrollment_id: enrollment.id,
        from_phase: null,
        to_phase: startingPhase,
        triggered_by: autoAdvanced ? 'auto_advance' : 'system',
        triggered_by_user: enrolledBy,
        evidence: {
          seed_paying_users: seedPayingUsers,
          seed_mrr: seedMrr,
          seed_active_users: seedActiveUsers,
        },
        notes: autoAdvanced
          ? `Auto-advanced to '${startingPhase}' based on ${seedPayingUsers} seed paying users from Appathon.`
          : 'Initial enrollment at Setup phase.',
      });

    if (historyError) {
      console.error('[sf100_phase_history] Error creating initial history:', historyError);
    }

    return {
      ...(enrollment as SF100Enrollment),
      auto_advanced: autoAdvanced,
      seed_data: {
        paying_users_count: seedPayingUsers,
        mrr_amount: seedMrr,
        active_users_count: seedActiveUsers,
      },
    };
  }

  /**
   * Get a single enrollment with full joined details.
   */
  static async getEnrollment(enrollmentId: string): Promise<SF100Enrollment | null> {
    const { data, error } = await this.supabase
      .from('sf100_enrollments')
      .select(ENROLLMENT_DETAIL_SELECT)
      .eq('id', enrollmentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error('Failed to fetch enrollment: ' + error.message);
    }
    return data as SF100Enrollment;
  }

  /**
   * Find a user's enrollment in a given program via their team membership.
   */
  static async getMyEnrollment(
    profileId: string,
    programId: string
  ): Promise<SF100Enrollment | null> {
    // Step 1: Get all registration_ids this profile belongs to
    const { data: memberships, error: memberError } = await this.supabase
      .from('event_team_members')
      .select('registration_id')
      .eq('profile_id', profileId);

    if (memberError) throw new Error('Failed to look up team memberships: ' + memberError.message);
    if (!memberships || memberships.length === 0) return null;

    const registrationIds = memberships.map((m: any) => m.registration_id);

    // Step 2: Find enrollment matching one of those registrations AND the program
    const { data, error } = await this.supabase
      .from('sf100_enrollments')
      .select(ENROLLMENT_DETAIL_SELECT)
      .eq('program_id', programId)
      .in('registration_id', registrationIds)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error('Failed to fetch my enrollment: ' + error.message);
    }
    return data as SF100Enrollment;
  }

  /**
   * List enrollments for a program with filters and pagination.
   */
  static async listEnrollments(
    programId: string,
    filters?: {
      phase?: string;
      status?: string;
      institution_id?: string;
      search?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<BaseListResponse<SF100Enrollment>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('sf100_enrollments')
      .select(ENROLLMENT_SELECT, { count: 'exact' })
      .eq('program_id', programId)
      .order('enrolled_at', { ascending: false });

    if (filters?.phase) {
      query = query.eq('current_phase', filters.phase);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.institution_id) {
      // Filter via the joined registration -> institution_id
      query = query.eq('registration.institution_id', filters.institution_id);
    }
    if (filters?.search) {
      const escaped = sanitizeSearch(filters.search);
      query = query.ilike('registration.team_name', `%${escaped}%`);
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error('Failed to list enrollments: ' + error.message);

    const total = count || 0;
    return {
      data: (data || []) as SF100Enrollment[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  /**
   * Update enrollment status (admin action).
   */
  static async updateEnrollmentStatus(
    enrollmentId: string,
    status: string,
    reason?: string,
    updatedBy?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      status,
      status_changed_at: now,
    };
    if (reason !== undefined) {
      updatePayload.status_reason = reason;
    }
    if (status === 'removed') {
      updatePayload.removed_at = now;
      updatePayload.removed_by = updatedBy || 'system';
    }

    const { error } = await this.supabase
      .from('sf100_enrollments')
      .update(updatePayload)
      .eq('id', enrollmentId);

    if (error) throw new Error('Failed to update enrollment status: ' + error.message);
  }

  /**
   * Withdraw an enrollment (team self-withdrawal).
   */
  static async withdrawEnrollment(enrollmentId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.supabase
      .from('sf100_enrollments')
      .update({
        status: 'withdrawn' as SF100EnrollmentStatus,
        status_changed_at: now,
        status_reason: 'Team withdrew from the program.',
      })
      .eq('id', enrollmentId);

    if (error) throw new Error('Failed to withdraw enrollment: ' + error.message);
  }

  // =========================================================================
  // Group 3 — Check-ins
  // =========================================================================

  /**
   * Submit a weekly or micro check-in.
   * Resets stall escalation (warning -> active, probation -> warning).
   */
  static async submitCheckIn(
    enrollmentId: string,
    data: CreateCheckInDto,
    submittedBy: string
  ): Promise<SF100CheckIn> {
    const now = new Date().toISOString();

    // INSERT check-in
    const { data: checkIn, error } = await this.supabase
      .from('sf100_check_ins')
      .insert({
        enrollment_id: enrollmentId,
        submitted_by: submittedBy,
        type: data.type,
        what_did_you_do: data.what_did_you_do || null,
        blockers: data.blockers || null,
        next_steps: data.next_steps || null,
        wins: data.wins || null,
        micro_update: data.micro_update || null,
        metric_snapshot: data.metric_snapshot || {},
        submitted_at: now,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to submit check-in: ' + error.message);

    // UPDATE enrollment.last_check_in_at
    // Also reset stall status: warning -> active, probation -> warning
    const { data: enrollment } = await this.supabase
      .from('sf100_enrollments')
      .select('status')
      .eq('id', enrollmentId)
      .single();

    const updatePayload: Record<string, any> = {
      last_check_in_at: now,
    };

    if (enrollment?.status === 'warning') {
      updatePayload.status = 'active';
      updatePayload.status_changed_at = now;
      updatePayload.status_reason = 'Check-in submitted; stall warning cleared.';
      updatePayload.warning_sent_at = null;
    } else if (enrollment?.status === 'probation') {
      updatePayload.status = 'warning';
      updatePayload.status_changed_at = now;
      updatePayload.status_reason = 'Check-in submitted during probation; downgraded to warning.';
      updatePayload.probation_sent_at = null;
    }

    const { error: updateError } = await this.supabase
      .from('sf100_enrollments')
      .update(updatePayload)
      .eq('id', enrollmentId);

    if (updateError) {
      console.error('[sf100_enrollments] Error updating last_check_in_at:', updateError);
    }

    return checkIn as SF100CheckIn;
  }

  /**
   * List check-ins for an enrollment.
   */
  static async listCheckIns(
    enrollmentId: string,
    filters?: { type?: string; page?: number; limit?: number }
  ): Promise<BaseListResponse<SF100CheckIn>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('sf100_check_ins')
      .select('*', { count: 'exact' })
      .eq('enrollment_id', enrollmentId)
      .order('submitted_at', { ascending: false });

    if (filters?.type) {
      query = query.eq('type', filters.type);
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error('Failed to list check-ins: ' + error.message);

    const total = count || 0;
    return {
      data: (data || []) as SF100CheckIn[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  /**
   * Add mentor feedback to a check-in.
   */
  static async addMentorFeedback(
    checkInId: string,
    feedback: string,
    mentorId: string
  ): Promise<void> {
    const now = new Date().toISOString();

    const { data: checkIn, error: fetchError } = await this.supabase
      .from('sf100_check_ins')
      .select('enrollment_id')
      .eq('id', checkInId)
      .single();

    if (fetchError) throw new Error('Failed to fetch check-in for feedback: ' + fetchError.message);

    const { error } = await this.supabase
      .from('sf100_check_ins')
      .update({
        mentor_feedback: feedback,
        mentor_feedback_by: mentorId,
        mentor_feedback_at: now,
      })
      .eq('id', checkInId);

    if (error) throw new Error('Failed to add mentor feedback: ' + error.message);

    // Notify team members about mentor feedback
    // Find the team leader via the enrollment -> registration -> team_members
    const { data: enrollment } = await this.supabase
      .from('sf100_enrollments')
      .select('id, registration:event_registrations(owner_id)')
      .eq('id', checkIn.enrollment_id)
      .single();

    if (enrollment?.registration?.owner_id) {
      await this.createNotification({
        enrollment_id: checkIn.enrollment_id,
        recipient_id: enrollment.registration.owner_id,
        type: 'mentor_feedback',
        title: 'New Mentor Feedback',
        body: 'Your mentor has reviewed your latest check-in and left feedback.',
        metadata: { check_in_id: checkInId, mentor_id: mentorId },
      });
    }
  }

  // =========================================================================
  // Group 4 — Paid Users
  // =========================================================================

  /**
   * Log a new paid user.
   * Auto-verifies if payment_gateway is 'razorpay_jicate'.
   * Recalculates metrics, checks auto-advance, and checks milestones.
   */
  static async logPaidUser(
    enrollmentId: string,
    data: CreatePaidUserDto,
    reportedBy: string
  ): Promise<SF100PaidUser> {
    const autoVerify = data.payment_gateway === 'razorpay_jicate';
    const now = new Date().toISOString();

    const { data: paidUser, error } = await this.supabase
      .from('sf100_paid_users')
      .insert({
        enrollment_id: enrollmentId,
        user_identifier: data.user_identifier,
        user_name: data.user_name || null,
        is_internal: data.is_internal,
        amount: data.amount,
        currency: data.currency || 'INR',
        payment_gateway: data.payment_gateway || null,
        transaction_id: data.transaction_id || null,
        transaction_date: data.transaction_date,
        is_recurring: data.is_recurring || false,
        subscription_id: data.subscription_id || null,
        status: autoVerify ? 'auto_verified' : 'pending_verification',
        proof_url: data.proof_url || null,
        proof_description: data.proof_description || null,
        verified_by: autoVerify ? 'system' : null,
        verified_at: autoVerify ? now : null,
        is_active: true,
        reported_by: reportedBy,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to log paid user: ' + error.message);

    // Recalculate metrics, then check auto-advance, then check milestones
    await this.recalculateMetrics(enrollmentId);
    await this.checkAutoAdvance(enrollmentId);

    // Get new count for milestone check
    const { data: enrollment } = await this.supabase
      .from('sf100_enrollments')
      .select('cumulative_paid_users')
      .eq('id', enrollmentId)
      .single();

    if (enrollment) {
      await this.checkMilestone(enrollmentId, enrollment.cumulative_paid_users);
    }

    return paidUser as SF100PaidUser;
  }

  /**
   * List paid users for an enrollment.
   */
  static async listPaidUsers(
    enrollmentId: string,
    filters?: {
      status?: string;
      is_active?: boolean;
      page?: number;
      limit?: number;
    }
  ): Promise<BaseListResponse<SF100PaidUser>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('sf100_paid_users')
      .select('*', { count: 'exact' })
      .eq('enrollment_id', enrollmentId)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error('Failed to list paid users: ' + error.message);

    const total = count || 0;
    return {
      data: (data || []) as SF100PaidUser[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  /**
   * Verify or reject a paid user record.
   */
  static async verifyPaidUser(
    paidUserId: string,
    status: 'verified' | 'rejected',
    verifiedBy: string,
    reason?: string
  ): Promise<void> {
    const now = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      status,
      verified_by: verifiedBy,
      verified_at: now,
    };
    if (status === 'rejected' && reason) {
      updatePayload.rejection_reason = reason;
    }

    // Get enrollment_id before updating
    const { data: paidUser, error: fetchError } = await this.supabase
      .from('sf100_paid_users')
      .select('enrollment_id')
      .eq('id', paidUserId)
      .single();

    if (fetchError) throw new Error('Failed to fetch paid user for verification: ' + fetchError.message);

    const { error } = await this.supabase
      .from('sf100_paid_users')
      .update(updatePayload)
      .eq('id', paidUserId);

    if (error) throw new Error('Failed to verify paid user: ' + error.message);

    // Recalculate metrics and check auto-advance
    await this.recalculateMetrics(paidUser.enrollment_id);
    await this.checkAutoAdvance(paidUser.enrollment_id);
  }

  /**
   * Mark a paid user as churned (no longer active).
   */
  static async markChurned(
    paidUserId: string,
    data: ChurnDto
  ): Promise<void> {
    const now = new Date().toISOString();

    // Get enrollment_id before updating
    const { data: paidUser, error: fetchError } = await this.supabase
      .from('sf100_paid_users')
      .select('enrollment_id')
      .eq('id', paidUserId)
      .single();

    if (fetchError) throw new Error('Failed to fetch paid user for churn: ' + fetchError.message);

    const { error } = await this.supabase
      .from('sf100_paid_users')
      .update({
        is_active: false,
        churned_at: now,
        churn_reason: data.churn_reason || null,
        refund_amount: data.refund_amount || null,
        refund_date: data.refund_date || null,
      })
      .eq('id', paidUserId);

    if (error) throw new Error('Failed to mark paid user as churned: ' + error.message);

    // Recalculate metrics (active count will decrease)
    await this.recalculateMetrics(paidUser.enrollment_id);
  }

  /**
   * Get the verification queue for a program (paid users pending verification).
   */
  static async getVerificationQueue(
    programId: string,
    filters?: { page?: number; limit?: number }
  ): Promise<BaseListResponse<SF100PaidUser>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    // We need to join through enrollments to filter by program_id
    // Supabase doesn't support direct JOINs in the query builder for filtering,
    // so we first get enrollment_ids for the program, then query paid_users.
    const { data: enrollments, error: enrollmentError } = await this.supabase
      .from('sf100_enrollments')
      .select('id')
      .eq('program_id', programId)
      .not('status', 'in', '("removed","withdrawn")');

    if (enrollmentError) throw new Error('Failed to fetch enrollments for verification queue: ' + enrollmentError.message);

    const enrollmentIds = (enrollments || []).map((e: any) => e.id);
    if (enrollmentIds.length === 0) {
      return {
        data: [],
        metadata: { total: 0, page, limit, totalPages: 0 },
      };
    }

    let query = this.supabase
      .from('sf100_paid_users')
      .select('*', { count: 'exact' })
      .in('enrollment_id', enrollmentIds)
      .eq('status', 'pending_verification')
      .order('created_at', { ascending: true });

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error('Failed to fetch verification queue: ' + error.message);

    const total = count || 0;
    return {
      data: (data || []) as SF100PaidUser[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  // =========================================================================
  // Group 5 — Phase Engine
  // =========================================================================

  /**
   * Check if an enrollment qualifies for automatic phase advancement.
   *
   * Phase thresholds (checked against verified paid users in sf100_paid_users):
   * - setup -> problem_solution_fit: has value declaration + at least 1 interview
   * - problem_solution_fit -> first_users: 5+ verified users
   * - first_users -> growth: 25+ verified users
   * - growth -> hundred_users: 100+ verified users
   * - hundred_users -> graduated: manual only (admin)
   *
   * Returns null if no advancement is warranted.
   */
  static async checkAutoAdvance(
    enrollmentId: string
  ): Promise<PhaseAdvanceResult | null> {
    // Fetch enrollment with program config
    const { data: enrollment, error: enrollError } = await this.supabase
      .from('sf100_enrollments')
      .select('*, program:sf100_programs(max_internal_user_pct)')
      .eq('id', enrollmentId)
      .single();

    if (enrollError) throw new Error('Failed to fetch enrollment for auto-advance: ' + enrollError.message);
    if (!enrollment) return null;

    const currentPhase = enrollment.current_phase as SF100Phase;
    const maxInternalPct = enrollment.program?.max_internal_user_pct ?? 20;

    // Terminal or non-advanceable phases
    if (currentPhase === 'graduated' || currentPhase === 'hundred_users') {
      return null;
    }

    // Count verified users
    const { data: verifiedUsers, error: countError } = await this.supabase
      .from('sf100_paid_users')
      .select('is_internal')
      .eq('enrollment_id', enrollmentId)
      .in('status', ['verified', 'auto_verified']);

    if (countError) throw new Error('Failed to count verified users: ' + countError.message);

    const totalVerified = verifiedUsers?.length ?? 0;
    const internalCount = verifiedUsers?.filter((u: any) => u.is_internal).length ?? 0;
    const internalPct = totalVerified > 0 ? (internalCount / totalVerified) * 100 : 0;

    // Block advancement if too many internal users
    if (internalPct > maxInternalPct && totalVerified > 0) {
      return null;
    }

    let toPhase: SF100Phase | null = null;
    let reason = '';

    switch (currentPhase) {
      case 'setup': {
        // Check for value declaration (problem_domain, target_segment, pricing_model)
        const hasValueDeclaration =
          enrollment.problem_domain &&
          enrollment.target_segment &&
          enrollment.pricing_model;

        // Check for at least one customer interview
        const { count: interviewCount } = await this.supabase
          .from('sf100_customer_interviews')
          .select('id', { count: 'exact', head: true })
          .eq('enrollment_id', enrollmentId);

        const hasInterview = (interviewCount ?? 0) > 0;

        if (hasValueDeclaration && hasInterview) {
          toPhase = 'problem_solution_fit';
          reason = 'Value declaration completed and at least 1 customer interview logged.';
        }
        break;
      }
      case 'problem_solution_fit': {
        if (totalVerified >= 5) {
          toPhase = 'first_users';
          reason = `Reached ${totalVerified} verified paid users (threshold: 5).`;
        }
        break;
      }
      case 'first_users': {
        if (totalVerified >= 25) {
          toPhase = 'growth';
          reason = `Reached ${totalVerified} verified paid users (threshold: 25).`;
        }
        break;
      }
      case 'growth': {
        if (totalVerified >= 100) {
          toPhase = 'hundred_users';
          reason = `Reached ${totalVerified} verified paid users (threshold: 100).`;
        }
        break;
      }
    }

    if (!toPhase) return null;

    // Perform the advance
    await this.advancePhase(enrollmentId, toPhase, 'auto_advance', undefined, {
      total_verified: totalVerified,
      internal_count: internalCount,
      internal_pct: internalPct,
    });

    return {
      advanced: true,
      from_phase: currentPhase,
      to_phase: toPhase,
      reason,
    };
  }

  /**
   * Run auto-advance check on all active enrollments in a program.
   */
  static async bulkAutoAdvance(programId: string): Promise<BulkAdvanceResult> {
    const { data: enrollments, error } = await this.supabase
      .from('sf100_enrollments')
      .select('id, registration:event_registrations(team_name), current_phase')
      .eq('program_id', programId)
      .eq('status', 'active');

    if (error) throw new Error('Failed to fetch enrollments for bulk auto-advance: ' + error.message);

    const result: BulkAdvanceResult = {
      total_checked: enrollments?.length ?? 0,
      advanced: 0,
      details: [],
    };

    for (const enrollment of enrollments || []) {
      const advanceResult = await this.checkAutoAdvance(enrollment.id);
      if (advanceResult && advanceResult.advanced) {
        result.advanced += 1;
        result.details.push({
          enrollment_id: enrollment.id,
          team_name: enrollment.registration?.team_name || 'Unknown',
          from_phase: advanceResult.from_phase as SF100Phase,
          to_phase: advanceResult.to_phase,
        });
      }
    }

    return result;
  }

  /**
   * Manually override an enrollment's phase (admin action).
   */
  static async manualPhaseChange(
    enrollmentId: string,
    toPhase: string,
    adminId: string,
    notes?: string
  ): Promise<void> {
    // Get current phase
    const { data: enrollment, error: fetchError } = await this.supabase
      .from('sf100_enrollments')
      .select('current_phase')
      .eq('id', enrollmentId)
      .single();

    if (fetchError) throw new Error('Failed to fetch enrollment for phase change: ' + fetchError.message);

    await this.advancePhase(
      enrollmentId,
      toPhase as SF100Phase,
      'admin',
      adminId,
      { manual_override: true, notes, from_phase: enrollment.current_phase }
    );
  }

  /**
   * Internal helper to advance a phase.
   * Updates the enrollment, inserts phase_history, and creates a notification.
   */
  private static async advancePhase(
    enrollmentId: string,
    toPhase: SF100Phase,
    triggeredBy: 'system' | 'admin' | 'auto_advance',
    userId?: string,
    evidence?: Record<string, unknown>
  ): Promise<void> {
    const now = new Date().toISOString();

    // Get current phase
    const { data: enrollment, error: fetchError } = await this.supabase
      .from('sf100_enrollments')
      .select('current_phase, registration:event_registrations(owner_id)')
      .eq('id', enrollmentId)
      .single();

    if (fetchError) throw new Error('Failed to fetch enrollment for phase advance: ' + fetchError.message);

    const fromPhase = enrollment.current_phase as SF100Phase;

    // UPDATE enrollment
    const updatePayload: Record<string, any> = {
      current_phase: toPhase,
      phase_entered_at: now,
    };
    if (toPhase === 'graduated') {
      updatePayload.graduated_at = now;
      updatePayload.status = 'graduated';
      updatePayload.status_changed_at = now;
    }

    const { error: updateError } = await this.supabase
      .from('sf100_enrollments')
      .update(updatePayload)
      .eq('id', enrollmentId);

    if (updateError) throw new Error('Failed to advance phase: ' + updateError.message);

    // INSERT phase_history
    const { error: historyError } = await this.supabase
      .from('sf100_phase_history')
      .insert({
        enrollment_id: enrollmentId,
        from_phase: fromPhase,
        to_phase: toPhase,
        triggered_by: triggeredBy,
        triggered_by_user: userId || null,
        evidence: evidence || {},
        notes: `Phase advanced from '${fromPhase}' to '${toPhase}'.`,
      });

    if (historyError) {
      console.error('[sf100_phase_history] Error recording phase advance:', historyError);
    }

    // Create phase_advance notification for team leader
    if (enrollment.registration?.owner_id) {
      await this.createNotification({
        enrollment_id: enrollmentId,
        recipient_id: enrollment.registration.owner_id,
        type: 'phase_advance',
        title: `Phase Advanced: ${PHASE_LABELS[toPhase] || toPhase}`,
        body: `Your team has advanced from "${PHASE_LABELS[fromPhase] || fromPhase}" to "${PHASE_LABELS[toPhase] || toPhase}".`,
        metadata: { from_phase: fromPhase, to_phase: toPhase, triggered_by: triggeredBy },
      });
    }
  }

  // =========================================================================
  // Group 6 — Stall Detection
  // =========================================================================

  /**
   * Run stall detection across all active/warning/probation enrollments in a program.
   *
   * Escalation ladder:
   * - active -> warning (at stall_warning_days)
   * - warning -> probation (at stall_probation_days)
   * - probation -> removed (at stall_removal_days)
   */
  static async runStallCheck(programId: string): Promise<StallCheckResult> {
    // Get program config
    const { data: program, error: progError } = await this.supabase
      .from('sf100_programs')
      .select('stall_warning_days, stall_probation_days, stall_removal_days')
      .eq('id', programId)
      .single();

    if (progError) throw new Error('Failed to fetch program for stall check: ' + progError.message);

    const warningDays = program.stall_warning_days;
    const probationDays = program.stall_probation_days;
    const removalDays = program.stall_removal_days;

    // Fetch all non-terminal enrollments
    const { data: enrollments, error } = await this.supabase
      .from('sf100_enrollments')
      .select('id, status, last_check_in_at, enrolled_at, registration:event_registrations(team_name, owner_id)')
      .eq('program_id', programId)
      .in('status', ['active', 'warning', 'probation']);

    if (error) throw new Error('Failed to fetch enrollments for stall check: ' + error.message);

    const now = new Date();
    const result: StallCheckResult = {
      total_checked: enrollments?.length ?? 0,
      newly_warned: 0,
      newly_on_probation: 0,
      newly_removed: 0,
      details: [],
    };

    for (const enrollment of enrollments || []) {
      const lastActivity = enrollment.last_check_in_at || enrollment.enrolled_at;
      const daysSinceCheckIn = Math.floor(
        (now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
      );

      const currentStatus = enrollment.status as SF100EnrollmentStatus;
      let newStatus: SF100EnrollmentStatus | null = null;
      let notificationType: string | null = null;

      if (currentStatus === 'active' && daysSinceCheckIn >= warningDays) {
        newStatus = 'warning';
        notificationType = 'stall_warning';
        result.newly_warned += 1;
      } else if (currentStatus === 'warning' && daysSinceCheckIn >= probationDays) {
        newStatus = 'probation';
        notificationType = 'stall_probation';
        result.newly_on_probation += 1;
      } else if (currentStatus === 'probation' && daysSinceCheckIn >= removalDays) {
        newStatus = 'removed';
        notificationType = 'stall_removal';
        result.newly_removed += 1;
      }

      if (newStatus) {
        const nowIso = now.toISOString();
        const updatePayload: Record<string, any> = {
          status: newStatus,
          status_changed_at: nowIso,
          status_reason: `Stall escalation: ${daysSinceCheckIn} days since last check-in.`,
        };

        if (newStatus === 'warning') {
          updatePayload.warning_sent_at = nowIso;
        } else if (newStatus === 'probation') {
          updatePayload.probation_sent_at = nowIso;
        } else if (newStatus === 'removed') {
          updatePayload.removed_at = nowIso;
          updatePayload.removed_by = 'system';
        }

        const { error: updateError } = await this.supabase
          .from('sf100_enrollments')
          .update(updatePayload)
          .eq('id', enrollment.id);

        if (updateError) {
          console.error(`[sf100_enrollments] Stall update error for ${enrollment.id}:`, updateError);
          continue;
        }

        // Send notification
        if (notificationType && enrollment.registration?.owner_id) {
          await this.createNotification({
            enrollment_id: enrollment.id,
            recipient_id: enrollment.registration.owner_id,
            type: notificationType,
            title: `Stall Alert: ${newStatus === 'removed' ? 'Removed from Program' : newStatus === 'probation' ? 'On Probation' : 'Warning'}`,
            body: `Your team has been inactive for ${daysSinceCheckIn} days. ${
              newStatus === 'removed'
                ? 'Your team has been removed from the program.'
                : newStatus === 'probation'
                  ? 'Submit a check-in to return to warning status.'
                  : 'Submit a check-in to return to active status.'
            }`,
            metadata: { days_since_checkin: daysSinceCheckIn, previous_status: currentStatus },
          });
        }

        result.details.push({
          enrollment_id: enrollment.id,
          team_name: enrollment.registration?.team_name || 'Unknown',
          previous_status: currentStatus,
          new_status: newStatus,
          days_since_checkin: daysSinceCheckIn,
        });
      }
    }

    return result;
  }

  // =========================================================================
  // Group 7 — Leaderboard
  // =========================================================================

  /**
   * Get the public leaderboard for a program.
   * Teams grouped by phase, ranked by cumulative_paid_users DESC, enrolled_at ASC.
   * Only returns public-safe fields.
   */
  static async getPublicLeaderboard(programId: string): Promise<LeaderboardData> {
    // Use the SQL from spec Section 9C, implemented via Supabase query
    const { data: rows, error } = await this.supabase
      .from('sf100_enrollments')
      .select(`
        id,
        current_phase,
        cumulative_paid_users,
        enrolled_at,
        registration:event_registrations(team_name, institution:institutions(name))
      `)
      .eq('program_id', programId)
      .not('status', 'in', '("removed","withdrawn")')
      .order('cumulative_paid_users', { ascending: false })
      .order('enrolled_at', { ascending: true });

    if (error) throw new Error('Failed to fetch leaderboard: ' + error.message);

    // Group by phase, compute rank within each phase
    const phaseGroups: Record<string, LeaderboardEntry[]> = {};

    for (const row of rows || []) {
      const phase = row.current_phase as SF100Phase;
      if (!phaseGroups[phase]) {
        phaseGroups[phase] = [];
      }
      phaseGroups[phase].push({
        enrollment_id: row.id,
        team_name: row.registration?.team_name || 'Unknown',
        institution_name: row.registration?.institution?.name || 'Unknown',
        current_phase: phase,
        cumulative_paid_users: row.cumulative_paid_users,
        phase_rank: 0, // will be set below
      });
    }

    // Set rank within each phase group
    for (const entries of Object.values(phaseGroups)) {
      entries.forEach((entry, index) => {
        entry.phase_rank = index + 1;
      });
    }

    // Build ordered phase list
    const phases = PHASE_ORDER
      .filter((p) => phaseGroups[p] && phaseGroups[p].length > 0)
      .map((p) => ({
        phase: p,
        phase_label: PHASE_LABELS[p],
        teams: phaseGroups[p],
      }));

    const allTeams = (rows || []);
    const totalPaidUsers = allTeams.reduce(
      (sum: number, r: any) => sum + (r.cumulative_paid_users || 0),
      0
    );
    const totalGraduated = (phaseGroups['graduated'] || []).length;

    return {
      phases,
      total_teams: allTeams.length,
      total_paid_users: totalPaidUsers,
      total_graduated: totalGraduated,
    };
  }

  /**
   * Get aggregate public stats for a program.
   */
  static async getPublicStats(programId: string): Promise<PublicStats> {
    const { data: enrollments, error } = await this.supabase
      .from('sf100_enrollments')
      .select('current_phase, cumulative_paid_users, enrolled_at')
      .eq('program_id', programId)
      .not('status', 'in', '("removed","withdrawn")');

    if (error) throw new Error('Failed to fetch public stats: ' + error.message);

    const rows = enrollments || [];
    const totalTeams = rows.length;
    const totalPaidUsers = rows.reduce(
      (sum: number, r: any) => sum + (r.cumulative_paid_users || 0),
      0
    );
    const totalGraduated = rows.filter(
      (r: any) => r.current_phase === 'graduated'
    ).length;

    // Calculate avg days to first sale
    // For teams with at least 1 paid user, compute days from enrolled_at to their first paid user transaction
    let avgDaysToFirstSale: number | null = null;

    const teamsWithUsers = rows.filter((r: any) => r.cumulative_paid_users > 0);
    if (teamsWithUsers.length > 0) {
      let totalDays = 0;
      let countValid = 0;

      for (const team of teamsWithUsers) {
        const { data: firstUser } = await this.supabase
          .from('sf100_paid_users')
          .select('transaction_date')
          .eq('enrollment_id', team.id)
          .in('status', ['verified', 'auto_verified'])
          .order('transaction_date', { ascending: true })
          .limit(1)
          .single();

        if (firstUser) {
          const enrolledDate = new Date(team.enrolled_at);
          const firstSaleDate = new Date(firstUser.transaction_date);
          const days = Math.floor(
            (firstSaleDate.getTime() - enrolledDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (days >= 0) {
            totalDays += days;
            countValid += 1;
          }
        }
      }

      avgDaysToFirstSale = countValid > 0 ? Math.round(totalDays / countValid) : null;
    }

    return {
      total_teams: totalTeams,
      total_paid_users: totalPaidUsers,
      total_graduated: totalGraduated,
      avg_days_to_first_sale: avgDaysToFirstSale,
    };
  }

  // =========================================================================
  // Group 8 — Graduation
  // =========================================================================

  /**
   * Initiate graduation for a team that has reached 100+ users.
   * Advances the enrollment to 'graduated' and creates an NIF pipeline candidate.
   */
  static async initiateGraduation(
    enrollmentId: string,
    adminId: string
  ): Promise<GraduationResult> {
    // Fetch full enrollment details for NIF candidate creation
    const { data: enrollment, error: fetchError } = await this.supabase
      .from('sf100_enrollments')
      .select(`
        *,
        registration:event_registrations(
          team_name,
          institution_id,
          owner_id,
          team_members:event_team_members(profile_id, full_name, email, is_leader, status),
          submission:event_submissions(app_name, live_app_url, problem_statement)
        )
      `)
      .eq('id', enrollmentId)
      .single();

    if (fetchError) throw new Error('Failed to fetch enrollment for graduation: ' + fetchError.message);

    // Advance to graduated phase
    await this.advancePhase(enrollmentId, 'graduated', 'admin', adminId, {
      cumulative_paid_users: enrollment.cumulative_paid_users,
      total_revenue: enrollment.total_revenue,
    });

    // Create NIF candidate
    // First, try to find problem_id from problem_bank that matches this team's problem statement
    let problemId: string | null = null;
    const problemStatement = enrollment.registration?.submission?.problem_statement;
    if (problemStatement) {
      const { data: problem } = await this.supabase
        .from('ss_problem_bank')
        .select('id')
        .ilike('problem_statement', `%${sanitizeSearch(problemStatement.substring(0, 50))}%`)
        .limit(1)
        .single();

      if (problem) {
        problemId = problem.id;
      }
    }

    // If no matching problem found, we need a problem_id for NIF — create a minimal problem bank entry
    if (!problemId) {
      const { data: newProblem } = await this.supabase
        .from('ss_problem_bank')
        .insert({
          title: `${enrollment.registration?.team_name || 'Unknown'} — Solve for 100 Graduate`,
          problem_statement: problemStatement || 'Problem statement from Appathon submission.',
          theme: 'other',
          source_type: 'sf100_graduation',
          status: 'solved',
          submitted_by: adminId,
        })
        .select('id')
        .single();

      if (newProblem) {
        problemId = newProblem.id;
      }
    }

    if (!problemId) {
      throw new Error('Failed to resolve or create a problem bank entry for NIF candidate.');
    }

    // Build team_members array for NIF candidate
    const teamMembers = (enrollment.registration?.team_members || []).map((m: any) => ({
      profile_id: m.profile_id,
      name: m.full_name,
      email: m.email,
      is_leader: m.is_leader,
    }));

    const nifCandidate = await NifPipelineService.createCandidate({
      problem_id: problemId,
      identified_by: adminId,
      decision_notes: `Auto-created on Solve for 100 graduation. Team: ${enrollment.registration?.team_name || 'Unknown'}. Cumulative paid users: ${enrollment.cumulative_paid_users}. Total revenue: ${enrollment.total_revenue}.`,
    });

    // Enrich NIF candidate with startup data
    await NifPipelineService.updateCandidate(nifCandidate.id, {
      startup_name: enrollment.registration?.team_name || null,
      startup_status: 'launched',
      startup_website: enrollment.registration?.submission?.live_app_url || null,
      team_members: teamMembers,
      revenue_generated: enrollment.total_revenue || 0,
    });

    return {
      enrollment_id: enrollmentId,
      nif_candidate_id: nifCandidate.id,
      message: `Team graduated and NIF candidate created. Enrollment ${enrollmentId} -> NIF ${nifCandidate.id}.`,
    };
  }

  // =========================================================================
  // Group 9 — P1 Features (Interviews, Pivots, Roster Changes, Notifications)
  // =========================================================================

  /**
   * Log a customer interview.
   */
  static async logInterview(
    enrollmentId: string,
    data: CreateInterviewDto,
    conductedBy: string
  ): Promise<SF100CustomerInterview> {
    const { data: interview, error } = await this.supabase
      .from('sf100_customer_interviews')
      .insert({
        enrollment_id: enrollmentId,
        customer_name: data.customer_name,
        customer_role: data.customer_role || null,
        customer_segment: data.customer_segment || null,
        key_quote: data.key_quote || null,
        pain_level: data.pain_level ?? null,
        willingness_to_pay: data.willingness_to_pay ?? null,
        follow_up_needed: data.follow_up_needed ?? false,
        follow_up_notes: data.follow_up_notes || null,
        interview_date: data.interview_date || new Date().toISOString().split('T')[0],
        conducted_by: conductedBy,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to log interview: ' + error.message);
    return interview as SF100CustomerInterview;
  }

  /**
   * List customer interviews for an enrollment.
   */
  static async listInterviews(
    enrollmentId: string
  ): Promise<SF100CustomerInterview[]> {
    const { data, error } = await this.supabase
      .from('sf100_customer_interviews')
      .select('*')
      .eq('enrollment_id', enrollmentId)
      .order('interview_date', { ascending: false });

    if (error) throw new Error('Failed to list interviews: ' + error.message);
    return (data || []) as SF100CustomerInterview[];
  }

  /**
   * Log a pivot event.
   */
  static async logPivot(
    enrollmentId: string,
    data: CreatePivotDto,
    loggedBy: string
  ): Promise<SF100Pivot> {
    const { data: pivot, error } = await this.supabase
      .from('sf100_pivots')
      .insert({
        enrollment_id: enrollmentId,
        pivot_type: data.pivot_type,
        before_description: data.before_description,
        after_description: data.after_description,
        reasoning: data.reasoning,
        evidence: data.evidence || null,
        pivot_date: data.pivot_date || new Date().toISOString().split('T')[0],
        logged_by: loggedBy,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to log pivot: ' + error.message);
    return pivot as SF100Pivot;
  }

  /**
   * List pivot events for an enrollment.
   */
  static async listPivots(enrollmentId: string): Promise<SF100Pivot[]> {
    const { data, error } = await this.supabase
      .from('sf100_pivots')
      .select('*')
      .eq('enrollment_id', enrollmentId)
      .order('pivot_date', { ascending: false });

    if (error) throw new Error('Failed to list pivots: ' + error.message);
    return (data || []) as SF100Pivot[];
  }

  /**
   * Request a team roster change (add or remove a member).
   */
  static async requestRosterChange(
    enrollmentId: string,
    data: CreateRosterChangeDto,
    requestedBy: string
  ): Promise<SF100RosterChange> {
    // Check if the member is an original team member
    const { data: existingMember } = await this.supabase
      .from('event_team_members')
      .select('id')
      .eq('registration_id', (
        await this.supabase
          .from('sf100_enrollments')
          .select('registration_id')
          .eq('id', enrollmentId)
          .single()
      ).data?.registration_id)
      .eq('email', data.email)
      .single();

    const { data: change, error } = await this.supabase
      .from('sf100_roster_changes')
      .insert({
        enrollment_id: enrollmentId,
        action: data.action,
        profile_id: data.profile_id || null,
        learner_id: data.learner_id || null,
        email: data.email,
        full_name: data.full_name || null,
        is_original_member: !!existingMember,
        status: 'pending',
        reason: data.reason || null,
        requested_by: requestedBy,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to request roster change: ' + error.message);
    return change as SF100RosterChange;
  }

  /**
   * Review (approve/reject) a roster change request.
   */
  static async reviewRosterChange(
    changeId: string,
    approved: boolean,
    reviewedBy: string,
    notes?: string
  ): Promise<void> {
    const now = new Date().toISOString();

    // Get the roster change to send notification
    const { data: change, error: fetchError } = await this.supabase
      .from('sf100_roster_changes')
      .select('enrollment_id, requested_by, action, full_name, email')
      .eq('id', changeId)
      .single();

    if (fetchError) throw new Error('Failed to fetch roster change: ' + fetchError.message);

    const { error } = await this.supabase
      .from('sf100_roster_changes')
      .update({
        status: approved ? 'approved' : 'rejected',
        reviewed_by: reviewedBy,
        reviewed_at: now,
        review_notes: notes || null,
      })
      .eq('id', changeId);

    if (error) throw new Error('Failed to review roster change: ' + error.message);

    // Notify the requester
    const notificationType = approved ? 'roster_change_approved' : 'roster_change_rejected';
    await this.createNotification({
      enrollment_id: change.enrollment_id,
      recipient_id: change.requested_by,
      type: notificationType,
      title: `Roster Change ${approved ? 'Approved' : 'Rejected'}`,
      body: `Your request to ${change.action} ${change.full_name || change.email} has been ${approved ? 'approved' : 'rejected'}.${notes ? ' Notes: ' + notes : ''}`,
      metadata: { change_id: changeId, action: change.action, approved },
    });
  }

  /**
   * Get notifications for a user.
   */
  static async getMyNotifications(
    profileId: string,
    unreadOnly?: boolean
  ): Promise<SF100Notification[]> {
    let query = this.supabase
      .from('sf100_notifications')
      .select('*')
      .eq('recipient_id', profileId)
      .order('created_at', { ascending: false });

    if (unreadOnly) {
      query = query.is('read_at', null);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch notifications: ' + error.message);
    return (data || []) as SF100Notification[];
  }

  /**
   * Mark a single notification as read.
   */
  static async markRead(notificationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('sf100_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (error) throw new Error('Failed to mark notification as read: ' + error.message);
  }

  /**
   * Mark all of a user's notifications as read.
   */
  static async markAllRead(profileId: string): Promise<void> {
    const { error } = await this.supabase
      .from('sf100_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', profileId)
      .is('read_at', null);

    if (error) throw new Error('Failed to mark all notifications as read: ' + error.message);
  }

  // =========================================================================
  // Group 10 — Admin / Export
  // =========================================================================

  /**
   * Get the phase funnel for a program (count of teams in each phase).
   */
  static async getPhaseFunnel(
    programId: string
  ): Promise<Array<{ phase: string; count: number }>> {
    const { data: enrollments, error } = await this.supabase
      .from('sf100_enrollments')
      .select('current_phase')
      .eq('program_id', programId)
      .not('status', 'in', '("removed","withdrawn")');

    if (error) throw new Error('Failed to fetch phase funnel: ' + error.message);

    // Count by phase
    const counts: Record<string, number> = {};
    for (const row of enrollments || []) {
      counts[row.current_phase] = (counts[row.current_phase] || 0) + 1;
    }

    // Return in phase order
    return PHASE_ORDER.map((phase) => ({
      phase,
      count: counts[phase] || 0,
    }));
  }

  /**
   * Get all stalled teams (status is warning or probation) for a program.
   */
  static async getStalledTeams(programId: string): Promise<SF100Enrollment[]> {
    const { data, error } = await this.supabase
      .from('sf100_enrollments')
      .select(ENROLLMENT_SELECT)
      .eq('program_id', programId)
      .in('status', ['warning', 'probation'])
      .order('status_changed_at', { ascending: true });

    if (error) throw new Error('Failed to fetch stalled teams: ' + error.message);
    return (data || []) as SF100Enrollment[];
  }

  /**
   * Export all enrollments for a program as CSV.
   */
  static async exportProgramCSV(programId: string): Promise<string> {
    const { data: enrollments, error } = await this.supabase
      .from('sf100_enrollments')
      .select(`
        *,
        registration:event_registrations(
          team_name,
          team_code,
          institution_id,
          institution:institutions(name)
        )
      `)
      .eq('program_id', programId)
      .order('enrolled_at', { ascending: true });

    if (error) throw new Error('Failed to fetch enrollments for CSV export: ' + error.message);

    // Build CSV header
    const headers = [
      'enrollment_id',
      'team_name',
      'team_code',
      'institution',
      'current_phase',
      'status',
      'cumulative_paid_users',
      'active_paid_users',
      'internal_paid_users',
      'total_revenue',
      'problem_domain',
      'target_segment',
      'pricing_model',
      'seed_paying_users',
      'seed_mrr',
      'seed_active_users',
      'enrolled_at',
      'last_check_in_at',
      'graduated_at',
    ];

    const rows: string[] = [headers.join(',')];

    for (const e of enrollments || []) {
      const escapeCsv = (val: any): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      rows.push(
        [
          escapeCsv(e.id),
          escapeCsv(e.registration?.team_name),
          escapeCsv(e.registration?.team_code),
          escapeCsv(e.registration?.institution?.name),
          escapeCsv(e.current_phase),
          escapeCsv(e.status),
          escapeCsv(e.cumulative_paid_users),
          escapeCsv(e.active_paid_users),
          escapeCsv(e.internal_paid_users),
          escapeCsv(e.total_revenue),
          escapeCsv(e.problem_domain),
          escapeCsv(e.target_segment),
          escapeCsv(e.pricing_model),
          escapeCsv(e.seed_paying_users),
          escapeCsv(e.seed_mrr),
          escapeCsv(e.seed_active_users),
          escapeCsv(e.enrolled_at),
          escapeCsv(e.last_check_in_at),
          escapeCsv(e.graduated_at),
        ].join(',')
      );
    }

    return rows.join('\n');
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Recalculate paid-user metrics on an enrollment from sf100_paid_users.
   */
  private static async recalculateMetrics(enrollmentId: string): Promise<void> {
    // Fetch all paid users for this enrollment
    const { data: paidUsers, error } = await this.supabase
      .from('sf100_paid_users')
      .select('status, is_active, is_internal, amount')
      .eq('enrollment_id', enrollmentId)
      .in('status', ['verified', 'auto_verified']);

    if (error) {
      console.error('[sf100_paid_users] Error fetching for recalculation:', error);
      return;
    }

    const users = paidUsers || [];
    const cumulative = users.length;
    const active = users.filter((u: any) => u.is_active).length;
    const internal = users.filter((u: any) => u.is_internal).length;
    const totalRevenue = users.reduce((sum: number, u: any) => sum + (u.amount || 0), 0);

    const { error: updateError } = await this.supabase
      .from('sf100_enrollments')
      .update({
        cumulative_paid_users: cumulative,
        active_paid_users: active,
        internal_paid_users: internal,
        total_revenue: totalRevenue,
      })
      .eq('id', enrollmentId);

    if (updateError) {
      console.error('[sf100_enrollments] Error updating metrics:', updateError);
    }
  }

  /**
   * Check if a milestone threshold has been crossed and send a notification.
   */
  private static async checkMilestone(
    enrollmentId: string,
    newCount: number
  ): Promise<void> {
    // Determine which milestones have been crossed
    for (const milestone of MILESTONES) {
      if (newCount >= milestone) {
        // Check if we already sent this milestone notification
        const notificationType = MILESTONE_NOTIFICATION_MAP[milestone];
        if (!notificationType) continue;

        const { data: existing } = await this.supabase
          .from('sf100_notifications')
          .select('id')
          .eq('enrollment_id', enrollmentId)
          .eq('type', notificationType)
          .limit(1)
          .single();

        // If notification already sent, skip
        if (existing) continue;

        // Get team leader for notification
        const { data: enrollment } = await this.supabase
          .from('sf100_enrollments')
          .select('registration:event_registrations(owner_id)')
          .eq('id', enrollmentId)
          .single();

        if (enrollment?.registration?.owner_id) {
          await this.createNotification({
            enrollment_id: enrollmentId,
            recipient_id: enrollment.registration.owner_id,
            type: notificationType,
            title: milestone === 1
              ? 'First Paid User!'
              : `${milestone} Paid Users Milestone!`,
            body: milestone === 1
              ? 'Congratulations! You have logged your first verified paid user.'
              : `Your team has reached ${milestone} cumulative paid users. Keep going!`,
            metadata: { milestone, current_count: newCount },
          });
        }
      }
    }
  }

  /**
   * Create a notification in the sf100_notifications table.
   */
  private static async createNotification(params: {
    enrollment_id?: string;
    recipient_id: string;
    type: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.supabase
      .from('sf100_notifications')
      .insert({
        enrollment_id: params.enrollment_id || null,
        recipient_id: params.recipient_id,
        type: params.type,
        title: params.title,
        body: params.body,
        metadata: params.metadata || {},
      });

    if (error) {
      console.error('[sf100_notifications] Error creating notification:', error);
    }
  }
}
