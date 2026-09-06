// lib/services/induction/induction-service.ts
// Fresher Induction — client-side service (browser supabase + RLS/RPC).
// Mirrors the SessionFeedbackService / PDEService pattern (static methods over
// getSupabase()). Privileged writes flow through the SECURITY DEFINER engine
// RPCs in 20260627170000_induction_phase1_engine_rpcs.sql (anon-revoked,
// auth+permission gated internally). Spec: specs/induction-program-module-2026-06-27.md
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = (): any => createClientSupabaseClient();

export interface CreateInductionInput {
  institutionId: string;
  academicYearId: string | null;
  name: string;
  startDate: string; // ISO
  endDate: string;   // ISO
  venueText?: string;
  description?: string | null;
  /** Cohort admission YEAR (e.g. 2026) — auto-enroll targets reserved/admitted/
   *  account learners of this admission year. */
  admissionYear?: number | null;
  /** 'group' enrolls freshers across ALL colleges (e.g. a Main-Office induction);
   *  'institution' (default) enrolls only this program's institution. */
  enrollScope?: 'institution' | 'group';
  /** Main venue picked from Resource Management (events.venue_resource_id). When
   *  set, venueText is the custom/off-campus fallback only. */
  venueResourceId?: string | null;
  /** Restrict the joining cohort by degree level: 'ug' / 'pg' / null (all degrees).
   *  e.g. an M.Pharm-only induction is 'pg' at the Pharmacy college. */
  degreeTypeFilter?: 'ug' | 'pg' | null;
  institutionIds?: string[];   // multi-target; when set, drives create + owning institution = [0]
  degreeIds?: string[];        // optional
  departmentIds?: string[];    // optional
}

/** Result of fn_induction_preview_enroll — who WOULD be enrolled (no insert). */
export interface PreviewEnrollResult {
  total: number;
  scope: 'institution' | 'group' | 'targeted';
  degree_type_filter: 'ug' | 'pg' | null;
  by_institution: Array<{ institution: string; count: number }>;
  by_program: Array<{ program: string; degree_type: string | null; count: number }>;
  by_department: { department: string; count: number }[];
  sample: Array<{ name: string; status: string }>;
}

/** A staff member who can be appointed as a coordinator. */
export interface AssignableStaff {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

/** An appointed coordinator of ONE induction. The only coordinator model. */
export interface EventCoordinator {
  user_id: string;
  full_name: string;
  email: string;
}

/** One row of the induction list table. */
export interface InductionListRow {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  /** Free-text venue. Only the fallback when venue_resource_id books a room. */
  venue_text: string | null;
  venue_resource_id: string | null;
  /** Decides who is offered Edit — mirrors events_auth_update (creator-owned). */
  created_by: string | null;
  institution_id: string;
  institution_name: string | null;
  coordinators: EventCoordinator[];
}

export class InductionService {
  /** Create the induction (events row event_type='induction' + satellite). Returns event_id. */
  static async createProgram(input: CreateInductionInput): Promise<string> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_create_program', {
      p_institution_id: input.institutionId ?? input.institutionIds?.[0] ?? null,
      p_academic_year_id: input.academicYearId,
      p_name: input.name,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_venue_text: input.venueText ?? null,
      p_description: input.description ?? null,
      p_admission_year: input.admissionYear ?? null,
      p_enroll_scope: input.enrollScope ?? 'institution',
      p_venue_resource_id: input.venueResourceId ?? null,
      p_degree_type_filter: input.degreeTypeFilter ?? null,
      p_institution_ids: input.institutionIds ?? null,
      p_degree_ids: input.degreeIds ?? null,
      p_department_ids: input.departmentIds ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  /** Preview the joining cohort for a scope WITHOUT enrolling — count + per-program
   *  / per-institution breakdown + name sample. The breakdown is the over-pull
   *  catcher: it surfaces a wrong scope (e.g. extra colleges or PG mixed into a UG
   *  induction) before any enroll INSERT. */
  static async previewEnroll(params: {
    institutionId: string;
    admissionYear: number;
    enrollScope?: 'institution' | 'group';
    degreeTypeFilter?: 'ug' | 'pg' | null;
    programIds?: string[] | null;
    institutionIds?: string[];
    degreeIds?: string[];
    departmentIds?: string[];
  }): Promise<PreviewEnrollResult> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_preview_enroll', {
      p_institution_id: params.institutionId ?? params.institutionIds?.[0] ?? null,
      p_admission_year: params.admissionYear,
      p_enroll_scope: params.enrollScope ?? 'institution',
      p_degree_type_filter: params.degreeTypeFilter ?? null,
      p_program_ids: params.programIds ?? null,
      p_institution_ids: params.institutionIds ?? null,
      p_degree_ids: params.degreeIds ?? null,
      p_department_ids: params.departmentIds ?? null,
    });
    if (error) throw error;
    return data as PreviewEnrollResult;
  }

  /** Auto-enroll the joining cohort (first-years + laterals). Returns count enrolled. */
  static async autoEnroll(eventId: string): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_auto_enroll', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  /** Auto-split enrollees into N batches by department. Returns learners assigned. */
  static async autoSplitBatches(eventId: string, numBatches = 2): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_auto_split_batches', {
      p_event_id: eventId,
      p_num_batches: numBatches,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  // ── The induction list (event rows + who coordinates each) ──────────────────

  /** Every induction the caller can see, newest first. RLS on `events` decides
   *  which rows come back — no institution filter here on purpose, so a
   *  scope='all' viewer sees the group and a scope='own' one sees their college. */
  static async listInductions(): Promise<InductionListRow[]> {
    const { data, error } = await getSupabase()
      .from('events')
      .select(
        'id,name,description,status,start_date,end_date,venue_text,venue_resource_id,created_by,institution_id,institutions(name)'
      )
      .eq('event_type', 'induction')
      .order('start_date', { ascending: false });
    if (error) throw error;
    return ((data as any[]) ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      status: r.status,
      start_date: r.start_date,
      end_date: r.end_date,
      venue_text: r.venue_text ?? null,
      venue_resource_id: r.venue_resource_id ?? null,
      created_by: r.created_by ?? null,
      institution_id: r.institution_id,
      institution_name: r.institutions?.name ?? null,
      coordinators: [],
    }));
  }

  /** Coordinators of EVERY induction the caller can see, in one RPC.
   *
   *  Not a table select: induction_event_coordinators is admin-only under RLS
   *  (so a Lead or a coordinator reads zero rows — silently) and carries two FKs
   *  to profiles, which makes a PostgREST embed ambiguous. Not
   *  listEventCoordinators() in a loop either: that one is Lead-gated and
   *  per-event, so the coordinators themselves would see nothing. */
  static async coordinatorsByEvent(): Promise<Map<string, EventCoordinator[]>> {
    const { data, error } = await getSupabase().rpc('fn_induction_coordinators_by_event');
    if (error) throw error;
    const map = new Map<string, EventCoordinator[]>();
    for (const row of (data as (EventCoordinator & { event_id: string })[]) ?? []) {
      const list = map.get(row.event_id) ?? [];
      list.push({ user_id: row.user_id, full_name: row.full_name, email: row.email });
      map.set(row.event_id, list);
    }
    return map;
  }

  // ── Per-event coordinators — the ONLY coordinator model ─────────────────────
  // A college-wide 'induction_coordinator' role used to be grantable from the
  // list page too; it was retired 2026-08-18 (see
  // 20260818091000_induction_retire_collegewide_coordinator_role.sql) because it
  // handed out induction.manage over every induction a college runs, while
  // *looking* like a per-college appointment. Coordinators are appointed here,
  // against one induction, and nowhere else.

  static async canManageEventCoordinators(eventId: string): Promise<boolean> {
    const { data, error } = await getSupabase().rpc('fn_induction_can_manage_event_coordinators', { p_event_id: eventId });
    if (error) return false;
    return !!data;
  }

  /** Is the CURRENT user a per-event coordinator of this induction? Used by the
   *  sessions section to decide manage-level UI (event coordinators may lack the
   *  global induction.manage permission). */
  static async isEventCoordinator(eventId: string): Promise<boolean> {
    const { data, error } = await getSupabase().rpc('fn_induction_is_event_coordinator', { p_event_id: eventId });
    if (error) return false;
    return !!data;
  }

  /** Server-truth event-level manage gate. Mirrors the privileged induction RPCs'
   *  auth check (admin OR induction.manage WITH access to THIS event's institution
   *  OR per-event coordinator). EXCLUDES per-session speakers — a resource person
   *  still gets per-row tools on their own sessions via the isMySession path. The
   *  sessions section uses this instead of a client-only permission check so the
   *  UI matches exactly what the server allows (no dead edit/delete/add buttons for
   *  a scope='own' person with no access to this event's institution). */
  static async canManageEvent(eventId: string): Promise<boolean> {
    const { data, error } = await getSupabase().rpc('fn_induction_can_manage_event', { p_event_id: eventId });
    if (error) return false;
    return !!data;
  }

  static async listEventCoordinators(eventId: string): Promise<EventCoordinator[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_list_event_coordinators', { p_event_id: eventId });
    if (error) throw error;
    return (data as EventCoordinator[]) ?? [];
  }

  static async assignableEventStaff(eventId: string, query: string): Promise<AssignableStaff[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_assignable_event_staff', {
      p_event_id: eventId,
      p_query: query || null,
    });
    if (error) throw error;
    return (data as AssignableStaff[]) ?? [];
  }

  static async assignEventCoordinator(eventId: string, userId: string): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_assign_event_coordinator', {
      p_event_id: eventId,
      p_user_id: userId,
    });
    if (error) throw error;
  }

  static async removeEventCoordinator(eventId: string, userId: string): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_remove_event_coordinator', {
      p_event_id: eventId,
      p_user_id: userId,
    });
    if (error) throw error;
  }

  // ── Session authoring (event_sessions, via gated DEFINER RPCs) ──────────────

  /** List sessions for an induction (coordinator: all; student: their batch + combined). */
  static async listSessions(eventId: string): Promise<InductionSessionRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_list_sessions', { p_event_id: eventId });
    if (error) throw error;
    return (data as InductionSessionRow[]) ?? [];
  }

  /** Insert (sessionId null) or update a session. Returns the session id. */
  static async upsertSession(input: UpsertSessionInput): Promise<string> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_upsert_session', {
      p_event_id: input.eventId,
      p_session_id: input.sessionId ?? null,
      p_day_number: input.dayNumber ?? null,
      p_batch_id: input.batchId ?? null,
      p_start_at: input.startAt,
      p_end_at: input.endAt,
      p_title: input.title,
      p_description: input.description ?? null,
      p_venue_text: input.venueText ?? null,
      p_speaker_text: input.speakerText ?? null,
      p_outcome_text: input.outcomeText ?? null,
      p_resource_links: input.resourceLinks ?? [],
      p_session_order: input.sessionOrder ?? 1,
      // STRICT venue: the chosen Resource Management room. The RPC derives
      // venue_text from this resource's name server-side (no free-text path).
      p_venue_resource_id: input.venueResourceId ?? null,
      // undefined → key omitted → the RPC's NULL default leaves kind as stored.
      ...(input.kind === undefined ? {} : { p_kind: input.kind }),
    });
    if (error) throw error;
    return data as string;
  }

  /** Delete a session. */
  static async deleteSession(sessionId: string): Promise<boolean> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_delete_session', { p_session_id: sessionId });
    if (error) throw error;
    return (data as boolean) ?? false;
  }

  // ── Attendance (roster marking + completion rollup, via gated DEFINER RPCs) ──

  /** Roster for a session — enrolled learners (of the session's batch) + current mark. */
  static async getSessionRoster(sessionId: string): Promise<RosterRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_session_roster', { p_session_id: sessionId });
    if (error) throw error;
    return (data as RosterRow[]) ?? [];
  }

  /** Bulk mark attendance; recomputes completion. Returns rows marked. */
  static async markAttendance(sessionId: string, marks: AttendanceMark[]): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_mark_attendance', {
      p_session_id: sessionId,
      p_marks: marks,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  // ── Day-level attendance (bulk mark, fans out to sessions) ──────────────────

  /** Roster for a whole day — everyone eligible for any session that day, with
   *  a uniform status pre-filled or is_mixed=true when their sessions differ. */
  static async getDayRoster(eventId: string, dayNumber: number): Promise<DayRosterRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_day_roster', {
      p_event_id: eventId,
      p_day_number: dayNumber,
    });
    if (error) throw error;
    return (data as DayRosterRow[]) ?? [];
  }

  /** Bulk mark attendance for every session under one day; recomputes completion.
   *  Returns count of learners marked, not session-rows written (a day can fan out to several sessions per learner). */
  static async markDayAttendance(eventId: string, dayNumber: number, marks: AttendanceMark[]): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_mark_day_attendance', {
      p_event_id: eventId,
      p_day_number: dayNumber,
      p_marks: marks,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  /** Per-day attendance coverage — how many of each day's PAST (ended) sessions
   *  are FULLY marked (every rostered learner has an attendance row; absentees
   *  count — marking writes a row per learner). Read-only; drives the
   *  coordinators' "back-mark pending days" nudge banner on the sessions page. */
  static async getAttendanceCoverage(eventId: string): Promise<AttendanceCoverageRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_attendance_coverage', { p_event_id: eventId });
    if (error) throw error;
    return (data as AttendanceCoverageRow[]) ?? [];
  }

  // ── Per-session feedback (value signal; student submit + coordinator summary) ──

  /** Student submits/updates their 1–5 rating (+ comment) for a session. Returns feedback id. */
  static async submitFeedback(sessionId: string, rating: number, comment?: string | null): Promise<string> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_submit_feedback', {
      p_session_id: sessionId,
      p_rating: rating,
      p_comment: comment ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  /** Coordinator: per-session avg rating + response count. */
  static async getSessionFeedbackSummary(eventId: string): Promise<SessionFeedbackSummary[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_session_feedback_summary', { p_event_id: eventId });
    if (error) throw error;
    return (data as SessionFeedbackSummary[]) ?? [];
  }

  /** Coordinator: the same per-session feedback, split by the college of the
   *  learner who submitted it. Pass a sessionId to narrow to one session.
   *  Once a session is shared across colleges (event_session_institutions) this
   *  is the only correct split — the stamped institution_id records the write
   *  path, not the learner. */
  static async getSessionFeedbackByCollege(
    eventId: string,
    sessionId?: string | null,
  ): Promise<SessionFeedbackByCollege[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_feedback_by_learner_college', {
      p_event_id: eventId,
      p_session_id: sessionId ?? null,
    });
    if (error) throw error;
    return (data as SessionFeedbackByCollege[]) ?? [];
  }

  /** Every individual feedback response for an induction — one row per
   *  (learner × session), carrying the learner's identity, the session it belongs
   *  to, the rating, the free-text comment and how it was captured. Pass a
   *  sessionId to narrow to one session; omit it for the whole induction.
   *
   *  Coordinator scope. This is DELIBERATELY narrower than getSessionFeedbackSummary
   *  (which session speakers may also call): these rows carry college email and
   *  mobile, so an assigned resource person is not admitted. Rows are responses
   *  ONLY — a fresher who never rated anything does not appear. */
  static async getSessionFeedbackDetail(
    eventId: string,
    sessionId?: string | null,
  ): Promise<SessionFeedbackDetailRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_session_feedback_detail', {
      p_event_id: eventId,
      p_session_id: sessionId ?? null,
    });
    if (error) throw error;
    return (data as SessionFeedbackDetailRow[]) ?? [];
  }

  // ── No-smartphone kiosk capture (volunteer/coordinator proxy on a shared device) ──

  /** Existing per-learner feedback for ONE session — powers the kiosk dialog's
   *  "rated" + "self — locked" badges (is_self = the fresher's own-login row). */
  static async getSessionFeedbackRoster(sessionId: string): Promise<SessionFeedbackRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_session_feedback_roster', { p_session_id: sessionId });
    if (error) throw error;
    return (data as SessionFeedbackRow[]) ?? [];
  }

  /** Coordinator/volunteer bulk-submits freshers' own ratings on a shared device.
   *  Never overwrites a fresher's own-login submission (the server silently skips
   *  it). Returns the number of rows written. */
  static async submitFeedbackProxy(sessionId: string, marks: ProxyFeedbackMark[]): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_submit_feedback_proxy', {
      p_session_id: sessionId,
      p_marks: marks,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  /** Coverage + method-mix for an induction (response rate, phone vs kiosk, the
   *  no-account ceiling, and a bias flag the loop reads to know its sample is thin
   *  or single-method). THROWS if the event has no induction program or the caller
   *  lacks induction.view (the RPC RAISEs); the null is only a defensive fallback. */
  static async getFeedbackMethodMix(eventId: string): Promise<FeedbackMethodMix | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_feedback_method_mix', { p_event_id: eventId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return (row as FeedbackMethodMix) ?? null;
  }

  // ── Day-level feedback (opt-in scope) ────────────────────────────────────────

  static async submitDayFeedback(eventId: string, dayNumber: number, rating: number, comment?: string | null): Promise<string> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_submit_day_feedback', {
      p_event_id: eventId,
      p_day_number: dayNumber,
      p_rating: rating,
      p_comment: comment ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  static async getDayFeedbackSummary(eventId: string): Promise<DayFeedbackSummary[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_day_feedback_summary', { p_event_id: eventId });
    if (error) throw error;
    return (data as DayFeedbackSummary[]) ?? [];
  }

  static async myDayFeedback(eventId: string): Promise<MyDayFeedback[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_my_day_feedback', { p_event_id: eventId });
    if (error) throw error;
    return (data as MyDayFeedback[]) ?? [];
  }

  // ── Whole-program feedback (opt-in scope) ────────────────────────────────────

  static async submitProgramFeedback(eventId: string, rating: number, comment?: string | null): Promise<string> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_submit_program_feedback', {
      p_event_id: eventId,
      p_rating: rating,
      p_comment: comment ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  static async getProgramFeedbackSummary(eventId: string): Promise<ProgramFeedbackSummary | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_program_feedback_summary', { p_event_id: eventId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return (row as ProgramFeedbackSummary) ?? null;
  }

  static async myProgramFeedback(eventId: string): Promise<MyProgramFeedback | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_my_program_feedback', { p_event_id: eventId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return (row as MyProgramFeedback) ?? null;
  }

  // ── Coordinator: which feedback scopes are on for this induction ────────────

  /** Read the two opt-in scope flags directly off induction_programs (RLS: induction_programs_view). */
  static async getFeedbackScopes(eventId: string): Promise<{ dayEnabled: boolean; programEnabled: boolean }> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('induction_programs')
      .select('feedback_day_enabled, feedback_program_enabled')
      .eq('event_id', eventId)
      .maybeSingle();
    if (error) throw error;
    return {
      dayEnabled: (data as any)?.feedback_day_enabled ?? false,
      programEnabled: (data as any)?.feedback_program_enabled ?? false,
    };
  }

  /** Flip the two scopes. Direct table write — induction_programs_manage RLS already
   *  gates this to induction.manage + institution access, same as coordinator writes
   *  elsewhere on this table (e.g. the detail page's own program reads). */
  static async setFeedbackScopes(eventId: string, dayEnabled: boolean, programEnabled: boolean): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('induction_programs')
      .update({ feedback_day_enabled: dayEnabled, feedback_program_enabled: programEnabled })
      .eq('event_id', eventId);
    if (error) throw error;
  }

  /** Cross-college session catalog (the curated "best sessions" reference library).
   *  Ranked server-side: value_score DESC (where a live run was rated) then adoption
   *  (distinct colleges that ran it). Optional theme/search filters. THROWS if the
   *  caller lacks induction.view (the RPC RAISEs). */
  static async getTopicCatalog(
    theme?: string | null,
    search?: string | null
  ): Promise<InductionTopicCatalogEntry[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_topic_catalog', {
      p_theme: theme ?? null,
      p_search: search ?? null,
    });
    if (error) throw error;
    return (data as InductionTopicCatalogEntry[]) ?? [];
  }

  // ── Student-facing reads (the fresher's "my induction") ─────────────────────

  /** The calling learner's induction enrollment(s) + completion rollup + profile
   *  snapshot. Empty when the caller isn't a learner / isn't enrolled. */
  static async myEnrollments(): Promise<MyInductionEnrollment[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_my_enrollments');
    if (error) throw error;
    return (data as MyInductionEnrollment[]) ?? [];
  }

  /** The caller's OWN prior per-session ratings for one induction (pre-fill). */
  static async myFeedback(eventId: string): Promise<MyInductionFeedback[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_my_feedback', { p_event_id: eventId });
    if (error) throw error;
    return (data as MyInductionFeedback[]) ?? [];
  }

  // ── Scorecard (coordinator/leadership funnel + joins-vs-vacancy; NAAC evidence) ──

  /** One induction's value→advocacy→referred→submitted→JOINED funnel, broken out
   *  by department + batch + a program total. Coordinator scope. `joined` is LIVE. */
  static async getScorecard(eventId: string): Promise<ScorecardRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_scorecard', { p_event_id: eventId });
    if (error) throw error;
    return (data as ScorecardRow[]) ?? [];
  }

  /** Cross-college funnel + joins-vs-vacancy for an academic year (one college,
   *  or all the caller may access when institutionId is omitted). Leadership scope. */
  static async getLeadershipScorecard(
    academicYearId: string,
    institutionId?: string | null,
  ): Promise<LeadershipScorecardRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_scorecard_leadership', {
      p_academic_year_id: academicYearId,
      p_institution_id: institutionId ?? null,
    });
    if (error) throw error;
    return (data as LeadershipScorecardRow[]) ?? [];
  }

  /** Record/refresh this induction as NAAC Criterion 5 + 7 evidence in the canonical
   *  quality_evidence_mappings junction (with the live rollup in metadata). Returns
   *  the number of evidence rows upserted (2). Coordinator action (induction.manage). */
  static async emitNaacEvidence(eventId: string): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_emit_naac_evidence', { p_event_id: eventId });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  // ── Phase 4: referral + advocacy (the value→advocacy→refer→join funnel) ──────

  /** Refer a prospect into the admission funnel (source='referral', referral_type
   *  ='learner', referred_by_id=me). Recomputes the effort gate. */
  static async submitReferral(eventId: string, input: ReferralInput): Promise<SubmitReferralResult> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_submit_referral', {
      p_event_id: eventId,
      p_first_name: input.firstName,
      p_phone: input.phone,
      p_last_name: input.lastName ?? null,
      p_email: input.email ?? null,
      p_program_id: input.programId ?? null,
      p_note: input.note ?? null,
    });
    if (error) throw error;
    return data as SubmitReferralResult;
  }

  /** The fresher's own referrals + live join status. */
  static async myReferrals(eventId: string): Promise<MyInductionReferral[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_my_referrals', { p_event_id: eventId });
    if (error) throw error;
    return (data as MyInductionReferral[]) ?? [];
  }

  /** End-of-induction advocacy / NPS (0–10) → induction_completion.advocacy_score. */
  static async submitAdvocacy(eventId: string, score: number): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_submit_advocacy', {
      p_event_id: eventId,
      p_score: score,
    });
    if (error) throw error;
    return data as number;
  }

  /**
   * The induction loop's current playbook for a cohort (+ its adoption verdict),
   * or null if the generator hasn't produced one yet. Browser read — RLS scopes
   * scf_ai_suggestions induction rows to super/admin/institution.
   */
  static async getLoopPlaybook(
    institutionId: string,
    academicYearId: string,
  ): Promise<InductionLoopPlaybook | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('scf_ai_suggestions')
      .select(
        'suggestion, human_verdict, input_avg_understood, outcome_avg_understood, outcome_lift, generated_at',
      )
      .eq('domain', 'induction')
      .eq('institution_id', institutionId)
      .eq('academic_year_id', academicYearId)
      .maybeSingle();
    if (error) throw error;
    return (data as InductionLoopPlaybook | null) ?? null;
  }

  /**
   * Record whether the coordinator ADOPTED / partially adopted / IGNORED the
   * cohort's playbook. This is the loop's counterfactual arm: ignored cohorts are
   * the control that lets the year-over-year lift be falsified (drift vs causal).
   * Manager-gated inside the SECURITY DEFINER RPC (induction.manage + inst access).
   */
  static async setPlaybookVerdict(
    institutionId: string,
    academicYearId: string,
    verdict: 'adopted' | 'partial' | 'ignored',
  ): Promise<boolean> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_set_playbook_verdict', {
      p_institution_id: institutionId,
      p_academic_year_id: academicYearId,
      p_verdict: verdict,
    });
    if (error) throw error;
    return data as boolean;
  }
}

export interface InductionLoopPlaybook {
  suggestion: Record<string, unknown> | null;
  human_verdict: 'adopted' | 'partial' | 'ignored' | null;
  input_avg_understood: number | null;
  outcome_avg_understood: number | null;
  outcome_lift: number | null;
  generated_at: string;
}

export interface SessionFeedbackSummary { session_id: string; avg_rating: number; response_count: number; }

/** One (session × college) cell of the feedback breakdown, where "college" is the
 *  college of the LEARNER who submitted — derived from learners_profiles, never
 *  from event_session_feedback.institution_id (that column records the write path
 *  and mis-attributes 30 live rows to JKKN Main Office). Director decision D5. */
export interface SessionFeedbackByCollege {
  feedback_session_id: string;
  learner_institution_id: string | null;
  learner_institution_name: string;
  response_count: number;
  avg_rating: number;
}

/** One picked fresher's rating in a kiosk batch (proxy writer payload row). */
export interface ProxyFeedbackMark { learner_id: string; rating: number; comment?: string | null; }

/** Existing feedback for one learner in a session (kiosk dialog pre-fill + badges).
 *  is_self = own-login submission (capture_method 'phone') — locked from overwrite. */
export interface SessionFeedbackRow {
  learner_id: string;
  rating: number;
  comment: string | null;
  capture_method: 'phone' | 'volunteer_kiosk';
  is_self: boolean;
}

/** One individual feedback response — (learner × session) with full learner
 *  identity, from fn_induction_session_feedback_detail. Powers the "Session
 *  feedback" browser and its XLSX export. Session/learner fields are nullable
 *  because the RPC LEFT-joins the dimensions: a response whose session or learner
 *  row was deleted still surfaces, unlabelled, rather than silently vanishing. */
export interface SessionFeedbackDetailRow {
  feedback_id: string;
  session_id: string;
  session_title: string | null;
  day_number: number | null;
  session_start: string | null;
  learner_id: string;
  register_number: string | null;
  roll_number: string | null;
  learner_name: string | null;
  gender: string | null;
  student_email: string | null;
  college_email: string | null;
  student_mobile: string | null;
  institution_name: string | null;
  degree_name: string | null;
  program_name: string | null;
  department_name: string | null;
  rating: number;
  comment: string | null;
  capture_method: 'phone' | 'volunteer_kiosk';
  is_self: boolean;
  submitted_by_name: string | null;
  submitted_at: string;
  updated_at: string;
}

/** Coverage + method-mix for an induction's feedback (bias awareness for the loop). */
export interface FeedbackMethodMix {
  enrolled: number;
  responders: number;
  response_rate: number;     // 0..1
  n_phone: number;
  n_volunteer_kiosk: number;
  no_account_enrolled: number;
  bias_flag: boolean;
}

/** One catalog topic (fn_induction_topic_catalog) — a reusable session idea with its
 *  cross-college adoption and, where a live run was rated, its fresher value score. */
export interface InductionTopicCatalogEntry {
  topic_id: string;
  canonical_title: string;
  theme: string;
  colleges: string[] | null;
  years: string | null;
  adoption: number;           // distinct colleges that have run it
  value_score: number | null; // avg fresher rating where a live run was rated; null = not yet rated
  score_responses: number;
  runs_rated: number;
  needs_review: boolean;
}

/** One row of fn_induction_scorecard — a funnel slice (total / a department / a batch). */
export interface ScorecardRow {
  dimension: 'total' | 'department' | 'batch';
  group_id: string | null;
  group_label: string;
  enrolled: number;
  value_rated: number;
  value_avg: number | null;
  advocacy_given: number;
  advocacy_avg: number | null;
  promoters: number;
  referred: number;
  referrals_submitted: number;
  referrals_joined: number;
}

/** One row of fn_induction_scorecard_leadership — a college's funnel + joins-vs-vacancy. */
export interface LeadershipScorecardRow {
  institution_id: string;
  institution_name: string;
  inductions: number;
  enrolled: number;
  value_avg: number | null;
  advocacy_avg: number | null;
  promoters: number;
  referred: number;
  referrals_submitted: number;
  referrals_joined: number;
  vacant_seats: number;
  joins_vs_vacancy_pct: number | null;
}

export interface MyInductionEnrollment {
  event_id: string;
  event_name: string;
  institution_id: string;
  institution_name: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  batch_id: string | null;
  batch_label: string | null;
  sessions_total: number;
  sessions_attended: number;
  attendance_pct: number;
  participation_complete: boolean;
  value_score_avg: number | null;
  advocacy_score: number | null;
  is_profile_complete: boolean;
  profile_fields_total: number;
  profile_fields_filled: number;
  feedback_day_enabled: boolean;
  feedback_program_enabled: boolean;
}

export interface MyInductionFeedback {
  session_id: string;
  rating: number;
  comment: string | null;
}

export interface ReferralInput {
  firstName: string;
  phone: string;
  lastName?: string | null;
  email?: string | null;
  programId?: string | null;
  note?: string | null;
}

export interface SubmitReferralResult {
  lead_id: string;
  action: 'created' | 'duplicate';
  referrals_submitted: number;
  outcome_complete: boolean;
}

export interface MyInductionReferral {
  lead_id: string;
  full_name: string | null;
  phone: string | null;
  program_id: string | null;
  funnel_stage: string | null;
  joined: boolean;
  submitted_at: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'od';
export interface AttendanceMark { learner_id: string; status: AttendanceStatus; }
export interface RosterRow {
  learner_id: string;
  name: string;
  register_number: string | null;
  batch_label: string | null;
  status: AttendanceStatus | null;
  /** Identity aids for the marker on a 200+ roster where register_number is
   *  still NULL pre-enrolment — displayed and searched in AttendanceDialog. */
  program_name: string | null;
  father_mobile: string | null;
  /** The learner's OWN college. On a session shared with other colleges this is
   *  what the roster groups by, so a visiting learner is never filed under the
   *  host. NULL when the learner has no institution recorded. */
  institution_name: string | null;
  /** The Senior Peer Mentor currently walking this fresher — the stand-in while
   *  a temporary cover is in force, since that is who is actually on the floor.
   *  NULL when no mentor is assigned, or their appointment is no longer active.
   *  Drives the mentor filter on AttendanceDialog. */
  mentor_learner_id: string | null;
  mentor_name: string | null;
}

export interface DayRosterRow {
  learner_id: string;
  name: string;
  register_number: string | null;
  batch_label: string | null;
  status: AttendanceStatus | null;
  is_mixed: boolean;
  /** Same identity aids as RosterRow — displayed and searched in DayAttendanceDialog. */
  program_name: string | null;
  father_mobile: string | null;
  /** See RosterRow.institution_name. */
  institution_name: string | null;
}

/** Per-day "past sessions vs FULLY-marked sessions" — drives the back-mark nudge.
 *  A session is fully marked when every rostered learner has an attendance row. */
export interface AttendanceCoverageRow {
  day_number: number | null; // NULL = the "Unscheduled" bucket (UI day 0)
  past_sessions: number;
  marked_sessions: number;
}

export interface DayFeedbackSummary { day_number: number; avg_rating: number; response_count: number; }
export interface MyDayFeedback { day_number: number; rating: number; comment: string | null; }
export interface ProgramFeedbackSummary { avg_rating: number; response_count: number; }
export interface MyProgramFeedback { rating: number; comment: string | null; }

export interface ResourceLink { label: string; url: string; }

export interface InductionSessionRow {
  id: string;
  day_number: number | null;
  session_order: number | null;
  batch_id: string | null;
  batch_label: string | null;
  start_at: string;
  end_at: string;
  title: string;
  description: string | null;
  venue_text: string | null;
  /** Resource Management room id (STRICT venue), or null for legacy/none. */
  venue_resource_id: string | null;
  speaker_text: string | null;
  outcome_text: string | null;
  resource_links: ResourceLink[];
  status: string | null;
  /** null = an ordinary session; 'registration' = the fresher registration desk
   *  (no resource person needed, Senior Peer Mentors may take its attendance);
   *  'mentor_checkin' = a monthly mentor check-in, authored elsewhere. */
  kind: SessionKind;
}

/** Values `event_sessions.kind` can carry in the induction module. */
export type SessionKind = null | 'registration' | 'mentor_checkin';

export interface UpsertSessionInput {
  eventId: string;
  sessionId?: string | null;
  dayNumber?: number | null;
  batchId?: string | null;
  startAt: string; // ISO
  endAt: string;   // ISO
  title: string;
  description?: string | null;
  venueText?: string | null;
  /** Chosen Resource Management room id (STRICT venue). The RPC derives
   *  venue_text from it server-side; pass null to clear the venue. */
  venueResourceId?: string | null;
  speakerText?: string | null;
  outcomeText?: string | null;
  resourceLinks?: ResourceLink[];
  sessionOrder?: number | null;
  /** 'registration' marks this as the registration desk; '' clears it back to an
   *  ordinary session. Omit (undefined) to leave the stored kind untouched — that
   *  is what keeps a 'mentor_checkin' row from being reclassified by an edit. */
  kind?: 'registration' | '';
}
