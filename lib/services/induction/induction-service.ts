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
}

export class InductionService {
  /** Create the induction (events row event_type='induction' + satellite). Returns event_id. */
  static async createProgram(input: CreateInductionInput): Promise<string> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_create_program', {
      p_institution_id: input.institutionId,
      p_academic_year_id: input.academicYearId,
      p_name: input.name,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_venue_text: input.venueText ?? 'Campus',
      p_description: input.description ?? null,
    });
    if (error) throw error;
    return data as string;
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
}

export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'od';
export interface AttendanceMark { learner_id: string; status: AttendanceStatus; }
export interface RosterRow {
  learner_id: string;
  name: string;
  register_number: string | null;
  batch_label: string | null;
  status: AttendanceStatus | null;
}

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
  speaker_text: string | null;
  outcome_text: string | null;
  resource_links: ResourceLink[];
  status: string | null;
}

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
  speakerText?: string | null;
  outcomeText?: string | null;
  resourceLinks?: ResourceLink[];
  sessionOrder?: number | null;
}
