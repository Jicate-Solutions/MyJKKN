// lib/services/solutions/training-service.ts
// CRUD operations for sh_training_programs, sh_training_sessions

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  TrainingProgram,
  TrainingSession,
  SessionStatus,
  ProgramType,
  CohortTrack,
  LocationPreference,
  CohortAssignment,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export interface TrainingProgramWithDetails extends TrainingProgram {
  solution?: {
    id: string;
    title: string;
    solution_code: string;
    client?: {
      id: string;
      name: string;
    };
  };
}

export interface TrainingSessionWithDetails extends TrainingSession {
  program?: TrainingProgram & {
    solution?: {
      id: string;
      title: string;
      solution_code: string;
    };
  };
  assignments?: Array<
    CohortAssignment & {
      cohort_member?: {
        id: string;
        name: string;
        level: number;
      };
    }
  >;
}

export interface TrainingProgramFilters extends PaginationParams {
  program_type?: ProgramType;
  track?: CohortTrack;
  location_preference?: LocationPreference;
  solution_id?: string;
}

export interface TrainingSessionFilters extends PaginationParams {
  program_id?: string;
  status?: SessionStatus;
  from_date?: string;
  to_date?: string;
}

export interface CreateTrainingProgramInput {
  solution_id: string;
  program_type?: ProgramType;
  track?: CohortTrack;
  participant_count?: number;
  location?: string;
  location_preference?: LocationPreference;
  scheduled_start?: string;
  scheduled_end?: string;
}

export interface UpdateTrainingProgramInput {
  program_type?: ProgramType;
  track?: CohortTrack;
  participant_count?: number;
  location?: string;
  location_preference?: LocationPreference;
  scheduled_start?: string;
  scheduled_end?: string;
  actual_start?: string;
  actual_end?: string;
}

export interface CreateTrainingSessionInput {
  program_id: string;
  session_number?: number;
  title?: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  location?: string;
}

export interface UpdateTrainingSessionInput {
  session_number?: number;
  title?: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  location?: string;
  google_calendar_event_id?: string;
  status?: SessionStatus;
  attendance_count?: number;
  notes?: string;
}

// ============================================
// CONSTANTS
// ============================================

// Approval threshold for training sessions
const TRAINING_SELF_CLAIM_THRESHOLD = 200000; // 2 Lakh

export const PROGRAM_TYPE_LABELS: Record<ProgramType, string> = {
  workshop: 'Workshop',
  bootcamp: 'Bootcamp',
  certification: 'Certification',
  custom: 'Custom',
  faculty_development: 'Faculty Development',
  corporate: 'Corporate',
  academic: 'Academic',
};

export const TRACK_LABELS: Record<CohortTrack, string> = {
  track_a: 'Track A (Community)',
  track_b: 'Track B (Corporate)',
  both: 'Both Tracks',
};

export const LOCATION_PREFERENCE_LABELS: Record<LocationPreference, string> = {
  on_site: 'On-site',
  remote: 'Remote',
  hybrid: 'Hybrid',
};

export const SESSION_STATUS_INFO: Record<SessionStatus, { label: string; color: string }> = {
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  rescheduled: { label: 'Rescheduled', color: 'bg-yellow-100 text-yellow-800' },
};

// ============================================
// SERVICE CLASS
// ============================================

export class TrainingService extends BaseService {
  // ============================================
  // PROGRAM OPERATIONS
  // ============================================

  /**
   * Get all training programs with optional filters
   */
  static async getPrograms(
    filters?: TrainingProgramFilters
  ): Promise<BaseListResponse<TrainingProgramWithDetails>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_training_programs')
      .select(
        `
        *,
        solution:sh_solutions(
          id,
          title,
          solution_code,
          client:sh_clients(id, name)
        )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.program_type) {
      query = query.eq('program_type', filters.program_type);
    }

    if (filters?.track) {
      query = query.eq('track', filters.track);
    }

    if (filters?.location_preference) {
      query = query.eq('location_preference', filters.location_preference);
    }

    if (filters?.solution_id) {
      query = query.eq('solution_id', filters.solution_id);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch programs: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as TrainingProgramWithDetails[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single program by ID
   */
  static async getProgramById(id: string): Promise<TrainingProgramWithDetails | null> {
    const { data, error } = await (this.supabase as any).from('sh_training_programs')
      .select(
        `
        *,
        solution:sh_solutions(
          id,
          title,
          solution_code,
          client:sh_clients(id, name)
        )
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch program: ${error.message}`);
    }

    return data as TrainingProgramWithDetails;
  }

  /**
   * Get program by solution ID
   */
  static async getProgramBySolutionId(
    solutionId: string
  ): Promise<TrainingProgramWithDetails | null> {
    const { data, error } = await (this.supabase as any).from('sh_training_programs')
      .select(
        `
        *,
        solution:sh_solutions(
          id,
          title,
          solution_code,
          client:sh_clients(id, name)
        )
      `
      )
      .eq('solution_id', solutionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch program: ${error.message}`);
    }

    return data as TrainingProgramWithDetails;
  }

  /**
   * Create a new training program
   */
  static async createProgram(input: CreateTrainingProgramInput): Promise<TrainingProgram> {
    const { data, error } = await (this.supabase as any).from('sh_training_programs')
      .insert({
        solution_id: input.solution_id,
        program_type: input.program_type,
        track: input.track,
        participant_count: input.participant_count,
        location: input.location,
        location_preference: input.location_preference,
        scheduled_start: input.scheduled_start,
        scheduled_end: input.scheduled_end,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create program: ${error.message}`);
    return data as TrainingProgram;
  }

  /**
   * Update a training program
   */
  static async updateProgram(id: string, input: UpdateTrainingProgramInput): Promise<TrainingProgram> {
    const { data, error } = await (this.supabase as any).from('sh_training_programs')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update program: ${error.message}`);
    return data as TrainingProgram;
  }

  /**
   * Delete a training program
   */
  static async deleteProgram(id: string): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_training_programs').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete program: ${error.message}`);
  }

  // ============================================
  // SESSION OPERATIONS
  // ============================================

  /**
   * Get all training sessions with optional filters
   */
  static async getSessions(
    filters?: TrainingSessionFilters
  ): Promise<BaseListResponse<TrainingSessionWithDetails>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_training_sessions')
      .select(
        `
        *,
        program:sh_training_programs(
          *,
          solution:sh_solutions(id, title, solution_code)
        ),
        assignments:sh_cohort_assignments(
          *,
          cohort_member:sh_cohort_members(id, name, level)
        )
      `,
        { count: 'exact' }
      )
      .order('session_date', { ascending: true });

    // Apply filters
    if (filters?.program_id) {
      query = query.eq('program_id', filters.program_id);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.from_date) {
      query = query.gte('session_date', filters.from_date);
    }

    if (filters?.to_date) {
      query = query.lte('session_date', filters.to_date);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch sessions: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as TrainingSessionWithDetails[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single session by ID
   */
  static async getSessionById(id: string): Promise<TrainingSessionWithDetails | null> {
    const { data, error } = await (this.supabase as any).from('sh_training_sessions')
      .select(
        `
        *,
        program:sh_training_programs(
          *,
          solution:sh_solutions(id, title, solution_code)
        ),
        assignments:sh_cohort_assignments(
          *,
          cohort_member:sh_cohort_members(id, name, level)
        )
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch session: ${error.message}`);
    }

    return data as TrainingSessionWithDetails;
  }

  /**
   * Get sessions by program ID
   */
  static async getSessionsByProgramId(
    programId: string
  ): Promise<TrainingSessionWithDetails[]> {
    const { data, error } = await (this.supabase as any).from('sh_training_sessions')
      .select(
        `
        *,
        program:sh_training_programs(
          *,
          solution:sh_solutions(id, title, solution_code)
        ),
        assignments:sh_cohort_assignments(
          *,
          cohort_member:sh_cohort_members(id, name, level)
        )
      `
      )
      .eq('program_id', programId)
      .order('session_number', { ascending: true });

    if (error) throw new Error(`Failed to fetch sessions: ${error.message}`);
    return data as TrainingSessionWithDetails[];
  }

  /**
   * Create a training session
   */
  static async createSession(input: CreateTrainingSessionInput): Promise<TrainingSession> {
    // Get next session number if not provided
    let sessionNumber = input.session_number;
    if (!sessionNumber) {
      const { data: existing } = await (this.supabase as any).from('sh_training_sessions')
        .select('session_number')
        .eq('program_id', input.program_id)
        .order('session_number', { ascending: false })
        .limit(1);

      sessionNumber = existing && existing.length > 0 ? (existing[0].session_number || 0) + 1 : 1;
    }

    const { data, error } = await (this.supabase as any).from('sh_training_sessions')
      .insert({
        program_id: input.program_id,
        session_number: sessionNumber,
        title: input.title,
        session_date: input.session_date,
        start_time: input.start_time,
        end_time: input.end_time,
        duration_minutes: input.duration_minutes || 60,
        location: input.location,
        status: 'scheduled' as SessionStatus,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create session: ${error.message}`);
    return data as TrainingSession;
  }

  /**
   * Update a training session
   */
  static async updateSession(id: string, input: UpdateTrainingSessionInput): Promise<TrainingSession> {
    const { data, error } = await (this.supabase as any).from('sh_training_sessions')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update session: ${error.message}`);
    return data as TrainingSession;
  }

  /**
   * Delete a training session
   */
  static async deleteSession(id: string): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_training_sessions').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete session: ${error.message}`);
  }

  /**
   * Check if a session can be self-claimed based on solution value
   */
  static async canSelfClaimSession(sessionId: string): Promise<boolean> {
    const { data, error } = await (this.supabase as any).from('sh_training_sessions')
      .select(
        `
        program:sh_training_programs(
          solution:sh_solutions(final_price)
        )
      `
      )
      .eq('id', sessionId)
      .single();

    if (error) return false;

    const programData = Array.isArray(data?.program) ? data.program[0] : data?.program;
    const solutionData = Array.isArray(programData?.solution)
      ? programData.solution[0]
      : programData?.solution;
    const finalPrice = solutionData?.final_price || 0;
    return finalPrice <= TRAINING_SELF_CLAIM_THRESHOLD;
  }

  /**
   * Claim a session for a cohort member
   */
  static async claimSession(
    sessionId: string,
    cohortMemberId: string,
    role: 'observer' | 'co_lead' | 'lead' | 'support' = 'lead'
  ): Promise<CohortAssignment> {
    // Check if already assigned
    const { data: existing } = await (this.supabase as any).from('sh_cohort_assignments')
      .select('id')
      .eq('session_id', sessionId)
      .eq('cohort_member_id', cohortMemberId)
      .single();

    if (existing) {
      throw new Error('Already assigned to this session');
    }

    const { data, error } = await (this.supabase as any).from('sh_cohort_assignments')
      .insert({
        session_id: sessionId,
        cohort_member_id: cohortMemberId,
        role,
        assigned_by: null, // Self-claimed
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to claim session: ${error.message}`);
    return data as CohortAssignment;
  }

  /**
   * Assign a session to a cohort member (by HOD/MD)
   */
  static async assignSession(
    sessionId: string,
    cohortMemberId: string,
    assignedById: string,
    role: 'observer' | 'co_lead' | 'lead' | 'support' = 'lead'
  ): Promise<CohortAssignment> {
    // Check if already assigned
    const { data: existing } = await (this.supabase as any).from('sh_cohort_assignments')
      .select('id')
      .eq('session_id', sessionId)
      .eq('cohort_member_id', cohortMemberId)
      .single();

    if (existing) {
      throw new Error('Already assigned to this session');
    }

    const { data, error } = await (this.supabase as any).from('sh_cohort_assignments')
      .insert({
        session_id: sessionId,
        cohort_member_id: cohortMemberId,
        role,
        assigned_by: assignedById,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to assign session: ${error.message}`);
    return data as CohortAssignment;
  }

  /**
   * Remove assignment from session
   */
  static async removeAssignment(sessionId: string, cohortMemberId: string): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_cohort_assignments')
      .delete()
      .eq('session_id', sessionId)
      .eq('cohort_member_id', cohortMemberId);

    if (error) throw new Error(`Failed to remove assignment: ${error.message}`);
  }

  /**
   * Complete a session and update cohort member stats
   */
  static async completeSession(
    sessionId: string,
    attendanceCount?: number,
    notes?: string
  ): Promise<TrainingSession> {
    // Update session status
    const { data: session, error: sessionError } = await (this.supabase as any).from('sh_training_sessions')
      .update({
        status: 'completed' as SessionStatus,
        attendance_count: attendanceCount,
        notes,
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (sessionError) throw new Error(`Failed to complete session: ${sessionError.message}`);

    // Get assignments and update cohort member stats
    const { data: assignments } = await (this.supabase as any).from('sh_cohort_assignments')
      .select('cohort_member_id, role')
      .eq('session_id', sessionId);

    if (assignments && assignments.length > 0) {
      for (const assignment of assignments) {
        const updateField =
          assignment.role === 'observer'
            ? 'sessions_observed'
            : assignment.role === 'co_lead'
            ? 'sessions_co_led'
            : 'sessions_led';

        const { data: member } = await (this.supabase as any).from('sh_cohort_members')
          .select(updateField)
          .eq('id', assignment.cohort_member_id)
          .single();

        if (member) {
          const currentValue = (member as Record<string, number>)[updateField] || 0;
          await (this.supabase as any).from('sh_cohort_members')
            .update({
              [updateField]: currentValue + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', assignment.cohort_member_id);
        }

        // Mark assignment as completed
        await (this.supabase as any).from('sh_cohort_assignments')
          .update({
            completed_at: new Date().toISOString(),
          })
          .eq('session_id', sessionId)
          .eq('cohort_member_id', assignment.cohort_member_id);
      }
    }

    return session as TrainingSession;
  }

  /**
   * Get label helpers
   */
  static getProgramTypeLabel(type: ProgramType | null): string {
    if (!type) return 'Custom';
    return PROGRAM_TYPE_LABELS[type];
  }

  static getTrackLabel(track: CohortTrack | null): string {
    if (!track) return 'Not specified';
    return TRACK_LABELS[track];
  }

  static getLocationPreferenceLabel(preference: LocationPreference | null): string {
    if (!preference) return 'Not specified';
    return LOCATION_PREFERENCE_LABELS[preference];
  }

  static getSessionStatusInfo(status: SessionStatus): { label: string; color: string } {
    return SESSION_STATUS_INFO[status];
  }
}

// Export singleton instance methods
export const trainingService = {
  getPrograms: TrainingService.getPrograms.bind(TrainingService),
  getProgramById: TrainingService.getProgramById.bind(TrainingService),
  getProgramBySolutionId: TrainingService.getProgramBySolutionId.bind(TrainingService),
  createProgram: TrainingService.createProgram.bind(TrainingService),
  updateProgram: TrainingService.updateProgram.bind(TrainingService),
  deleteProgram: TrainingService.deleteProgram.bind(TrainingService),
  getSessions: TrainingService.getSessions.bind(TrainingService),
  getSessionById: TrainingService.getSessionById.bind(TrainingService),
  getSessionsByProgramId: TrainingService.getSessionsByProgramId.bind(TrainingService),
  createSession: TrainingService.createSession.bind(TrainingService),
  updateSession: TrainingService.updateSession.bind(TrainingService),
  deleteSession: TrainingService.deleteSession.bind(TrainingService),
  canSelfClaimSession: TrainingService.canSelfClaimSession.bind(TrainingService),
  claimSession: TrainingService.claimSession.bind(TrainingService),
  assignSession: TrainingService.assignSession.bind(TrainingService),
  removeAssignment: TrainingService.removeAssignment.bind(TrainingService),
  completeSession: TrainingService.completeSession.bind(TrainingService),
  getProgramTypeLabel: TrainingService.getProgramTypeLabel.bind(TrainingService),
  getTrackLabel: TrainingService.getTrackLabel.bind(TrainingService),
  getLocationPreferenceLabel: TrainingService.getLocationPreferenceLabel.bind(TrainingService),
  getSessionStatusInfo: TrainingService.getSessionStatusInfo.bind(TrainingService),
  PROGRAM_TYPE_LABELS,
  TRACK_LABELS,
  LOCATION_PREFERENCE_LABELS,
  SESSION_STATUS_INFO,
  TRAINING_SELF_CLAIM_THRESHOLD,
};
