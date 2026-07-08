// lib/services/induction/induction-volunteer-service.ts
// Fresher Induction — PR2 peer-mentor SCALE layer (client service).
//
// Separate from InductionService so the two PRs compose without touching one
// shared file. Same pattern: static methods over the browser supabase client;
// every privileged op flows through a SECURITY DEFINER, anon-revoked RPC defined
// in 20260701094000_induction_volunteer_feedback_rpcs.sql (which depends on PR1's
// capture_method / submitted_by columns).
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = (): any => createClientSupabaseClient();

/** A senior student appointable as a peer mentor. */
export interface AssignablePeerMentor {
  learner_id: string;
  full_name: string;
  register_number: string | null;
}

/** A peer mentor on an event + their live coverage + training state. */
export interface FeedbackVolunteer {
  learner_id: string;
  full_name: string;
  register_number: string | null;
  capacity: number;
  is_active: boolean;
  group_size: number;
  captured: number;
  guide_read: boolean;
  self_ack: boolean;
  admin_trained: boolean;
  is_trained: boolean;
}

/** A mentor's own per-event training progress (drives the mentor-page lock). */
export interface MyTrainingStatus {
  event_id: string;
  guide_read: boolean;
  self_ack: boolean;
  admin_trained: boolean;
  is_trained: boolean;
}

/** A scheduled Senior Peer Mentor training session. */
export interface TrainingSession {
  id: string;
  title: string;
  scheduled_at: string | null;
  venue: string | null;
}

/** One session a mentor covers, with their progress on it. */
export interface MyVolunteerSession {
  event_id: string;
  event_name: string;
  institution_name: string | null;
  session_id: string;
  session_title: string;
  day_number: number | null;
  start_at: string | null;
  end_at: string | null;
  group_size: number;
  captured: number;
}

/** One assigned fresher in a mentor's group for a session. */
export interface FeedbackGroupMember {
  learner_id: string;
  name: string;
  register_number: string | null;
  batch_label: string | null;
  has_account: boolean;
  captured: boolean;
  capture_method: 'phone' | 'volunteer_kiosk' | null;
}

/** A 1–5 rating the fresher tapped (on the mentor's phone). */
export interface VolunteerFeedbackMark {
  learner_id: string;
  rating: number;
  comment?: string | null;
}

/** A present/absent mark a Senior Peer Mentor records for a fresher in their group. */
export interface AttendanceMark {
  learner_id: string;
  status: 'present' | 'absent' | 'excused' | 'od';
}

/** Result of an auto-balance — surfaces the coverage truth (unassigned > 0 = capacity too low). */
export interface AutobalanceResult {
  enrolled: number;
  assigned: number;
  unassigned: number;
}

/** One assigned fresher (mentee) under a mentor, for the admin console. */
export interface MentorMentee {
  mentor_learner_id: string;
  fresher_learner_id: string;
  fresher_name: string;
  fresher_register: string | null;
  has_feedback: boolean;
}

/** A fresher enrolled in the induction but not yet assigned to any mentor. */
export interface UnassignedFresher {
  fresher_learner_id: string;
  fresher_name: string;
  fresher_register: string | null;
}

export class InductionVolunteerService {
  // ── Manage (Induction Lead / college coordinator) ──────────────────────────

  /** True if I coordinate ANY induction event. Used only to let an appointed event
   *  coordinator (who may lack the induction.view permission) into the induction module
   *  UI; per-event authorization stays enforced by every RPC's can_manage_training gate. */
  static async isAnyEventCoordinator(): Promise<boolean> {
    const { data, error } = await getSupabase().rpc('fn_induction_is_any_event_coordinator');
    if (error) throw error;
    return Boolean(data);
  }

  /** Search senior students of the event's college appointable as peer mentors. */
  static async assignablePeerMentors(eventId: string, query: string): Promise<AssignablePeerMentor[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_assignable_peer_mentors', {
      p_event_id: eventId,
      p_query: query || null,
    });
    if (error) throw error;
    return (data as AssignablePeerMentor[]) ?? [];
  }

  /** Appoint a peer mentor (idempotent; re-appoint reactivates + updates capacity). */
  static async appointVolunteer(eventId: string, learnerId: string, capacity = 20): Promise<string> {
    const { data, error } = await getSupabase().rpc('fn_induction_appoint_feedback_volunteer', {
      p_event_id: eventId,
      p_learner_id: learnerId,
      p_capacity: capacity,
    });
    if (error) throw error;
    return data as string;
  }

  /** Remove a peer mentor (cascades their group — those freshers become unassigned). */
  static async removeVolunteer(eventId: string, learnerId: string): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_remove_feedback_volunteer', {
      p_event_id: eventId,
      p_learner_id: learnerId,
    });
    if (error) throw error;
  }

  /** List peer mentors + coverage (group size vs freshers captured). */
  static async listVolunteers(eventId: string): Promise<FeedbackVolunteer[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_list_feedback_volunteers', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as FeedbackVolunteer[]) ?? [];
  }

  /** Auto-balance every enrolled fresher across active mentors (no-account first,
   *  capacity-capped per mentor). Returns {enrolled, assigned, unassigned} so the UI
   *  can warn when capacity is too low to cover everyone. */
  static async autobalanceVolunteers(eventId: string, capacity = 20): Promise<AutobalanceResult> {
    const { data, error } = await getSupabase().rpc('fn_induction_autobalance_feedback_volunteers', {
      p_event_id: eventId,
      p_capacity: capacity,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) ?? {};
    return {
      enrolled: row?.enrolled ?? 0,
      assigned: row?.assigned ?? 0,
      unassigned: row?.unassigned ?? 0,
    };
  }

  // ── Mentor (a senior student on their phone) ────────────────────────────────

  /** The sessions I cover (across my events) + my progress. Empty for non-mentors. */
  static async myVolunteerSessions(): Promise<MyVolunteerSession[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_my_volunteer_sessions');
    if (error) throw error;
    return (data as MyVolunteerSession[]) ?? [];
  }

  /** My assigned freshers for one session (silent / no-account first). */
  static async myFeedbackGroup(sessionId: string): Promise<FeedbackGroupMember[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_my_feedback_group', {
      p_session_id: sessionId,
    });
    if (error) throw error;
    return (data as FeedbackGroupMember[]) ?? [];
  }

  /** Write 1–5 (+ comment) for freshers in MY group only. Returns rows written
   *  (skips any fresher who already self-rated on their own login). */
  static async submitFeedback(sessionId: string, marks: VolunteerFeedbackMark[]): Promise<number> {
    const { data, error } = await getSupabase().rpc('fn_induction_volunteer_submit_feedback', {
      p_session_id: sessionId,
      p_marks: marks,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  /** Attendance check-in: mark present/absent for freshers in MY group only, for one
   *  session. Returns rows written. Scoped + anti-clobber server-side — a mentor can
   *  never touch a fresher outside their group, nor overwrite a staff mark
   *  (fn_induction_volunteer_mark_attendance). */
  static async markAttendance(sessionId: string, marks: AttendanceMark[]): Promise<number> {
    const { data, error } = await getSupabase().rpc('fn_induction_volunteer_mark_attendance', {
      p_session_id: sessionId,
      p_marks: marks,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  /** Attendance ALREADY saved for MY group on one session — so the attendance dialog can
   *  seed prior marks instead of resetting everyone to Present (which would clobber the
   *  mentor's own earlier absentees on a re-save). Self-scoped server-side. */
  static async mySessionAttendance(sessionId: string): Promise<{ learner_id: string; status: string }[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_my_session_attendance', {
      p_session_id: sessionId,
    });
    if (error) throw error;
    return (data as { learner_id: string; status: string }[]) ?? [];
  }

  // ── Training (mentor self-steps + read) ─────────────────────────────────────

  /** My per-event training progress. Empty for non-mentors. */
  static async myTrainingStatus(): Promise<MyTrainingStatus[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_my_training_status');
    if (error) throw error;
    return (data as MyTrainingStatus[]) ?? [];
  }

  /** Mentor: mark the guide read + 'I understand' in one step. */
  static async completeSelfTraining(eventId: string): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_mentor_complete_self_training', {
      p_event_id: eventId,
    });
    if (error) throw error;
  }

  // ── Training (admin: mark trained + sessions) ───────────────────────────────

  /** Admin: mark a mentor trained (or clear it). */
  static async adminSetTrained(eventId: string, learnerId: string, trained: boolean): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_admin_set_mentor_trained', {
      p_event_id: eventId,
      p_learner_id: learnerId,
      p_trained: trained,
    });
    if (error) throw error;
  }

  static async listTrainingSessions(eventId: string): Promise<TrainingSession[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_list_training_sessions', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as TrainingSession[]) ?? [];
  }

  static async createTrainingSession(
    eventId: string, title: string, scheduledAt: string | null, venue: string | null,
  ): Promise<string> {
    const { data, error } = await getSupabase().rpc('fn_induction_create_training_session', {
      p_event_id: eventId,
      p_title: title,
      p_scheduled_at: scheduledAt,
      p_venue: venue,
    });
    if (error) throw error;
    return data as string;
  }

  /** Admin: mark a set of mentors as having attended a session (sets them trained). */
  static async markTrainingAttended(sessionId: string, learnerIds: string[]): Promise<number> {
    const { data, error } = await getSupabase().rpc('fn_induction_training_mark_attended', {
      p_session_id: sessionId,
      p_learner_ids: learnerIds,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  // ── Year-round mentoring (P2c-2): monthly check-ins ─────────────────────────

  /** How many monthly check-ins are already scheduled for this induction. */
  static async countMonthlyCheckins(eventId: string): Promise<number> {
    const { data, error } = await getSupabase().rpc('fn_induction_count_monthly_checkins', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  /** Admin: create a monthly check-in for each month from after induction to the
   *  freshers' first-year end. Idempotent — returns how many NEW ones were made. */
  static async generateMonthlyCheckins(eventId: string): Promise<number> {
    const { data, error } = await getSupabase().rpc('fn_induction_generate_monthly_checkins', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  // ── Admin console: manage each mentor's mentee-freshers ──────────────────────

  /** Every mentor's assigned freshers (one row per mentor↔fresher). */
  static async adminMentorMentees(eventId: string): Promise<MentorMentee[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_admin_mentor_mentees', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as MentorMentee[]) ?? [];
  }

  /** Freshers enrolled in the induction but not assigned to any mentor. */
  static async adminUnassignedFreshers(eventId: string): Promise<UnassignedFresher[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_admin_unassigned_freshers', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as UnassignedFresher[]) ?? [];
  }

  /** Assign (or move) a fresher to a mentor. */
  static async adminAssignFresher(eventId: string, mentorLearnerId: string, fresherLearnerId: string): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_admin_assign_fresher', {
      p_event_id: eventId,
      p_mentor_learner_id: mentorLearnerId,
      p_fresher_learner_id: fresherLearnerId,
    });
    if (error) throw error;
  }

  /** Remove a fresher from their mentor's group (back to the unassigned pool). */
  static async adminUnassignFresher(eventId: string, fresherLearnerId: string): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_admin_unassign_fresher', {
      p_event_id: eventId,
      p_fresher_learner_id: fresherLearnerId,
    });
    if (error) throw error;
  }
}
