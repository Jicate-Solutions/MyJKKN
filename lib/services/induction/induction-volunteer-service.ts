// lib/services/induction/induction-volunteer-service.ts
// Fresher Induction — PR2 peer-mentor SCALE layer (client service).
//
// Separate from InductionService so the two PRs compose without touching one
// shared file. Same pattern: static methods over the browser supabase client;
// every privileged op flows through a SECURITY DEFINER, anon-revoked RPC defined
// in 20260701094000_induction_volunteer_feedback_rpcs.sql (which depends on PR1's
// capture_method / submitted_by columns).
import { createClientSupabaseClient } from '@/lib/supabase/client';
// The registration desk reuses the coordinator console's roster row shape —
// same RPC, same columns, so the same dialog can render either source.
import type { RosterRow } from '@/lib/services/induction/induction-service';

const getSupabase = (): any => createClientSupabaseClient();

/** A senior student appointable as a peer mentor. */
export interface AssignablePeerMentor {
  learner_id: string;
  full_name: string;
  register_number: string | null;
  /** Programme display name (falls back to program_name) — shown in the picker. */
  program_name: string | null;
  department_name: string | null;
  section_name: string | null;
  /** 2 or higher — the eligibility band is "2nd year and above", uncapped. */
  year_of_study: number | null;
  college_email: string | null;
  student_email: string | null;
  student_mobile: string | null;
  /** Repeated on every row (count(*) OVER ()) — how many learners match BEFORE
   *  the limit. The picker needs it to say what it is hiding; without it a
   *  capped page reads as "there is nobody else". */
  total_matches: number;
}

/** Cascading academic filters for the picker. null / undefined = "Any" and is
 *  ignored server-side, so the five compose without a branch per combination.
 *  Institution is deliberately absent: the RPC resolves it from the event, since
 *  a mentor must share a college with their mentees. */
export interface PeerMentorFilters {
  degreeId?: string | null;
  departmentId?: string | null;
  programId?: string | null;
  semesterId?: string | null;
  sectionId?: string | null;
}

/** An option carrying its parent ids, so the client cascades in memory. */
export interface PeerMentorFilterOption {
  id: string;
  name: string;
  degree_id?: string | null;
  department_id?: string | null;
  program_id?: string | null;
  semester_id?: string | null;
  semester_order?: number | null;
}

/** Dropdown data for the picker, derived from the learners actually eligible for
 *  THIS event — so a filter value can never match zero people. */
export interface PeerMentorFilterOptions {
  /** Locked context: the event's college. Displayed, never sent. */
  institution: { id: string; name: string } | null;
  eligible_total: number;
  /** Active seniors in the year band with NO login in this college. They can
   *  never be offered; surfaced so it reads as a fixable data gap (create their
   *  account) rather than "not eligible". */
  without_login: number;
  degrees: PeerMentorFilterOption[];
  departments: PeerMentorFilterOption[];
  programs: PeerMentorFilterOption[];
  semesters: PeerMentorFilterOption[];
  sections: PeerMentorFilterOption[];
}

/** A peer mentor on an event + their live coverage + training state.
 *
 *  The identity/placement half mirrors what the appoint picker shows, so an
 *  admin who narrowed to one section can read back from the roster that the
 *  right person landed there. Every one of them is nullable: they come through
 *  LEFT joins precisely so a mentor with an unset section still appears. */
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
  roll_number: string | null;
  college_email: string | null;
  student_email: string | null;
  student_mobile: string | null;
  program_name: string | null;
  department_name: string | null;
  section_name: string | null;
  semester_name: string | null;
  semester_order: number | null;
  /** Derived server-side as ceil(semester_order / 2). */
  year_of_study: number | null;
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
  /** 'registration' = the fresher registration desk. A mentor works it for the
   *  WHOLE cohort (group_size is 0 there — nobody is assigned yet), so the page
   *  must not filter it out the way it filters ordinary sessions. */
  kind: string | null;
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
  /** Programme the fresher joined (learners_profiles.program_id -> programs).
   *  register_number is NULL for most freshers at induction time, so this is
   *  what actually separates two same-name freshers in a mentor's group —
   *  the same disambiguator the coordinator roster shows. NOT department:
   *  every engineering fresher sits in the shared first-year department. */
  program_name: string | null;
  /** How the mentor actually reaches this fresher. Scoped server-side to the
   *  mentor's OWN group, so a mentor can never enumerate the cohort. */
  student_mobile: string | null;
  father_mobile: string | null;
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

/** How an auto-balance run treats freshers who ALREADY have a mentor.
 *  'incremental' keeps every existing pair and only places the unassigned;
 *  'rebalance' tears up the whole cohort and re-deals it from scratch. */
export type AutobalanceMode = 'incremental' | 'rebalance';

/** Result of an auto-balance — surfaces the coverage truth (unassigned > 0 = capacity too low). */
export interface AutobalanceResult {
  enrolled: number;
  assigned: number;
  unassigned: number;
  /** Freshers placed by THIS run. 0 on a repeat incremental run — nothing pending. */
  newly_assigned: number;
  /** Existing mentor↔fresher pairs left untouched. Always 0 in rebalance mode. */
  kept: number;
  /** Stale assignments dropped: mentor no longer active, or fresher no longer enrolled. */
  released: number;
}

/** Result of a bulk reassign. `over_capacity` is reported, never enforced — an
 *  absent mentor's whole group often overflows the stand-in, and refusing the
 *  move would leave those freshers with nobody at all. */
export interface BulkReassignResult {
  moved: number;
  target_group_size: number;
  target_capacity: number;
  over_capacity: boolean;
}

/** One stand-in currently covering another mentor's freshers. */
export interface MentorCover {
  covering_learner_id: string;
  covering_name: string;
  original_learner_id: string;
  original_name: string;
  fresher_count: number;
  /** Last date (inclusive) the stand-in owns them. The nightly sweep reverts after it. */
  cover_until: string | null;
  cover_note: string | null;
}

/** One assigned fresher (mentee) under a mentor, for the admin console.
 *  Under a temporary cover, mentor_learner_id is the STAND-IN — who is actually
 *  walking them — and original_mentor_* is who they revert to. */
export interface MentorMentee {
  mentor_learner_id: string;
  fresher_learner_id: string;
  fresher_name: string;
  fresher_register: string | null;
  has_feedback: boolean;
  is_cover: boolean;
  cover_until: string | null;
  original_mentor_learner_id: string | null;
  original_mentor_name: string | null;
  /** Identity aids for the console. register_number is still NULL for most
   *  freshers at induction time, so without these a mentee row is just a name.
   *  program_name — NOT department — is what distinguishes EEE from CSE, since
   *  every engineering fresher shares the first-year department row. */
  program_name: string | null;
  student_mobile: string | null;
  father_mobile: string | null;
}

/** A fresher enrolled in the induction but not yet assigned to any mentor. */
export interface UnassignedFresher {
  fresher_learner_id: string;
  fresher_name: string;
  fresher_register: string | null;
}

/** One scheduled monthly Senior Peer Mentor check-in the fresher can rate
 *  ("did your mentor help you this month?"). Only appears once the check-in
 *  has actually come due; rating/comment are null until the fresher answers. */
export interface MentorCheckin {
  session_id: string;
  month_label: string;
  start_at: string | null;
  mentor_name: string | null;
  rating: number | null;
  comment: string | null;
}

/** Admin/coordinator honesty cross-check row: one mentor's group, one check-in
 *  month — the freshers' average helpfulness rating alongside whether that
 *  mentor actually performed the check-in. flagged = a good rating (avg >= 4)
 *  despite no recorded mentor activity that month — a fresher politely rating
 *  an absent mentor highly, surfaced instead of trusted. */
export interface MentorHelpfulnessCrosscheckRow {
  volunteer_id: string;
  mentor_name: string;
  session_id: string;
  month_label: string;
  start_at: string | null;
  group_size: number;
  rating_count: number;
  avg_rating: number | null;
  mentor_checked_in: boolean;
  flagged: boolean;
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

  /** Search senior students of the event's college appointable as peer mentors.
   *  Eligible band = 2nd year and above, with no upper bound — final-year
   *  students of a 4- or 5-year programme are appointable; only first-years are
   *  excluded. `query` matches name / register / roll number / college email /
   *  student email / mobile / programme as a case-insensitive %value%, and
   *  `filters` narrows by degree / department / programme / semester / section.
   *
   *  `?? null` throughout, not `||`: an id is either a uuid or absent, and `||`
   *  would also swallow a legitimately falsy value into the "Any" branch. */
  static async assignablePeerMentors(
    eventId: string,
    query: string,
    filters: PeerMentorFilters = {},
    limit = 50,
  ): Promise<AssignablePeerMentor[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_assignable_peer_mentors', {
      p_event_id: eventId,
      p_query: query?.trim() ? query : null,
      p_degree_id: filters.degreeId ?? null,
      p_department_id: filters.departmentId ?? null,
      p_program_id: filters.programId ?? null,
      p_semester_id: filters.semesterId ?? null,
      p_section_id: filters.sectionId ?? null,
      p_limit: limit,
    });
    if (error) throw error;
    return (data as AssignablePeerMentor[]) ?? [];
  }

  /** Dropdown data for the picker's cascading filters — one round trip, one
   *  jsonb payload, every list restricted to values that match a real eligible
   *  learner on this event. */
  static async peerMentorFilterOptions(eventId: string): Promise<PeerMentorFilterOptions> {
    const { data, error } = await getSupabase().rpc('fn_induction_peer_mentor_filter_options', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return data as PeerMentorFilterOptions;
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

  /**
   * Place enrolled freshers across active mentors (no-account first,
   * capacity-capped per mentor).
   *
   * DEFAULTS TO 'incremental': freshers who already have a mentor keep that
   * mentor, and only the unassigned — a later admission intake, or the freshers
   * of a mentor who has since been removed — are dealt, into the lightest-loaded
   * mentors first. Running it twice with nothing pending is a genuine no-op.
   *
   * 'rebalance' is the old destructive behaviour: the whole cohort is re-dealt
   * and every existing pair is broken. Only ever call it from a confirmed
   * action — it discards mentor↔fresher relationships that have been walked.
   */
  static async autobalanceVolunteers(
    eventId: string,
    capacity = 20,
    mode: AutobalanceMode = 'incremental',
  ): Promise<AutobalanceResult> {
    const { data, error } = await getSupabase().rpc('fn_induction_autobalance_feedback_volunteers', {
      p_event_id: eventId,
      p_capacity: capacity,
      p_mode: mode,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) ?? {};
    return {
      enrolled: row?.enrolled ?? 0,
      assigned: row?.assigned ?? 0,
      unassigned: row?.unassigned ?? 0,
      newly_assigned: row?.newly_assigned ?? 0,
      kept: row?.kept ?? 0,
      released: row?.released ?? 0,
    };
  }

  // ── Mentor (a senior student on their phone) ────────────────────────────────

  /** The sessions I cover (across my events) + my progress. Empty for non-mentors. */
  static async myVolunteerSessions(): Promise<MyVolunteerSession[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_my_volunteer_sessions');
    if (error) throw error;
    return (data as MyVolunteerSession[]) ?? [];
  }

  /** Full enrolled roster of a REGISTRATION session, for the mentor working the
   *  desk. Same DEFINER RPC the coordinator console uses; its gate admits an
   *  active mentor of the event only when the session's kind is 'registration',
   *  so calling it on any other session raises "not authorized". */
  static async registrationRoster(sessionId: string): Promise<RosterRow[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_session_roster', {
      p_session_id: sessionId,
    });
    if (error) throw error;
    return (data as RosterRow[]) ?? [];
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
   *  (fn_induction_volunteer_mark_attendance).
   *
   *  EXCEPTION — a 'registration' session: the same RPC accepts the whole enrolled
   *  cohort there (a desk checks in whoever arrives) and waives the training gate.
   *  Anti-clobber and the enrolled/batch test still apply. Pair it with
   *  `registrationRoster()` for the full list instead of `myFeedbackGroup()`. */
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

  /**
   * Move a mentor's freshers to another mentor in one action.
   *
   * coverUntil NULL  → PERMANENT: the target becomes the true owner.
   * coverUntil DATE  → TEMPORARY: the target stands in until that date
   *                    (inclusive), then the freshers revert automatically.
   * learnerIds NULL  → the whole group; otherwise only those freshers.
   *
   * The source mentor may be inactive — moving a stood-down mentor's freshers
   * somewhere safe is the emergency this exists for. Capacity is reported via
   * `over_capacity`, not enforced.
   */
  static async adminBulkReassignMentees(
    eventId: string,
    fromLearnerId: string,
    toLearnerId: string,
    opts: { coverUntil?: string | null; learnerIds?: string[] | null; note?: string | null } = {},
  ): Promise<BulkReassignResult> {
    const { data, error } = await getSupabase().rpc('fn_induction_admin_bulk_reassign_mentees', {
      p_event_id: eventId,
      p_from_learner_id: fromLearnerId,
      p_to_learner_id: toLearnerId,
      p_cover_until: opts.coverUntil ?? null,
      p_learner_ids: opts.learnerIds ?? null,
      p_note: opts.note ?? null,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) ?? {};
    return {
      moved: row?.moved ?? 0,
      target_group_size: row?.target_group_size ?? 0,
      target_capacity: row?.target_capacity ?? 0,
      over_capacity: Boolean(row?.over_capacity),
    };
  }

  /** End a cover early and hand the freshers back now. originalLearnerId NULL
   *  reverts every active cover on the event. */
  static async adminEndMentorCover(eventId: string, originalLearnerId?: string | null): Promise<number> {
    const { data, error } = await getSupabase().rpc('fn_induction_admin_end_mentor_cover', {
      p_event_id: eventId,
      p_original_learner_id: originalLearnerId ?? null,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  /** Covers currently in force — one row per (stand-in, original mentor) pair. */
  static async adminMentorCovers(eventId: string): Promise<MentorCover[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_admin_mentor_covers', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as MentorCover[]) ?? [];
  }

  /** Remove a fresher from their mentor's group (back to the unassigned pool). */
  static async adminUnassignFresher(eventId: string, fresherLearnerId: string): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_admin_unassign_fresher', {
      p_event_id: eventId,
      p_fresher_learner_id: fresherLearnerId,
    });
    if (error) throw error;
  }

  // ── Fresher: monthly mentor-helpfulness rating (self-report + honesty cross-check) ──

  /** My own scheduled monthly check-ins that have come due, with my current
   *  mentor's name and my existing rating (pre-fill). Empty until I have a
   *  mentor group assignment AND at least one check-in's date has passed. */
  static async myMentorCheckins(eventId: string): Promise<MentorCheckin[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_my_mentor_checkins', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as MentorCheckin[]) ?? [];
  }

  /** Rate how much my mentor helped me THIS month (1-5 + optional comment),
   *  tied to one scheduled check-in session. Upsert — I can revise it later. */
  static async submitMentorMonthFeedback(sessionId: string, rating: number, comment?: string | null): Promise<string> {
    const { data, error } = await getSupabase().rpc('fn_induction_submit_mentor_month_feedback', {
      p_session_id: sessionId,
      p_rating: rating,
      p_comment: comment ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  /** Admin/coordinator: the honesty cross-check — per mentor, per check-in
   *  month, the average fresher rating alongside whether that mentor actually
   *  performed the check-in (marked attendance for their group that session).
   *  flagged rows (good rating, no recorded mentor activity) sort first. */
  static async mentorHelpfulnessCrosscheck(eventId: string): Promise<MentorHelpfulnessCrosscheckRow[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_mentor_helpfulness_crosscheck', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as MentorHelpfulnessCrosscheckRow[]) ?? [];
  }
}
