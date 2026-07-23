// lib/services/induction/induction-speakers-service.ts
// Induction session resource-persons → real MyJKKN users (staff + students).
// Kept in its OWN service (not appended to induction-service.ts) so this feature
// shares no file with the concurrent self-improving-loop work — both PRs stay
// independently mergeable. Browser supabase + RLS/DEFINER RPCs, same pattern as
// InductionService.
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = (): any => createClientSupabaseClient();

// Normalize an optional UUID filter coming from form state. An unselected Shadcn
// <Select> yields '' (not undefined), and `?? null` does NOT catch '' — so the
// empty string reaches a `uuid` RPC parameter and Postgres throws 22P02
// "invalid input syntax for type uuid". Coerce empty/whitespace → null.
const uuidOrNull = (v?: string | null): string | null => {
  const t = (v ?? '').trim();
  return t.length ? t : null;
};

export interface DirectoryUser {
  id: string;
  full_name: string | null;
  role: string | null;
  email: string | null;
}

/** One filtered, account-resolved resource-person candidate. `id` is the
 *  profiles.id that event_session_speakers links to. */
export interface ResourcePersonResult {
  id: string;
  full_name: string | null;
  email: string | null;
  sub_label: string | null; // staff_id (facilitator) or roll/register (learner)
}

export interface FacilitatorFilters {
  institutionId?: string | null;
  departmentId?: string | null;
  query?: string;
}

export interface LearnerSpeakerFilters {
  institutionId?: string | null;
  degreeId?: string | null;
  departmentId?: string | null;
  programId?: string | null;
  semesterId?: string | null;
  sectionId?: string | null;
  query?: string;
}

export interface DirectoryFilters {
  institutionId?: string | null;
  query?: string;
}

export interface SessionLedRow {
  session_id: string;
  event_id: string;
  event_name: string | null;
  title: string | null;
  day_number: number | null;
  start_at: string | null;
  venue_text: string | null;
}

/** A session I led, with its anonymous feedback summary (k>=3 floor). */
export interface MySessionFeedbackRow extends SessionLedRow {
  response_count: number;
  avg_rating: number | null; // NULL when suppressed (< 3 responses)
  suppressed: boolean;
}

/** One anonymized feedback comment on a session I led. */
export interface SessionCommentRow {
  rating: number;
  comment: string | null;
  created_at: string;
}

/** The AI improvement-tip JSON the loop generates for a weak topic. */
export interface SessionTipSuggestion {
  summary?: string;
  likelyCauses?: string[];
  improvements?: { title: string; how: string }[];
  watchNext?: string;
}

/** A session-effectiveness loop row: the tip for a weak topic + its honest
 *  (regression-to-the-mean-corrected) measured effect on re-run. */
export interface SessionLoopTip {
  topic_key: string;
  first_session_id: string | null;
  input_avg: number | null;
  input_responses: number | null;
  suggestion: SessionTipSuggestion | null;
  rerun_avg: number | null;
  raw_lift: number | null;
  rtm_expected_avg: number | null;
  net_effect: number | null;
  measure_status: 'pending' | 'measured' | 'insufficient_rtm_data';
}

export class InductionSpeakersService {
  /** Typeahead over the MyJKKN directory (staff + students). Email/role shown so
   *  the coordinator picks the RIGHT person among same-name users. RLS allows any
   *  authenticated user to read profiles. */
  static async searchUsers(query: string): Promise<DirectoryUser[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    // Strip PostgREST filter metachars (comma/paren/star/backslash) so a search
    // term can't inject extra .or() filter terms. Keep . @ _ - for name/email.
    const safe = q.replace(/[,()*\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (safe.length < 2) return [];
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, email')
      .or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`)
      .order('full_name')
      .limit(20);
    if (error) throw error;
    return (data as DirectoryUser[]) ?? [];
  }

  /** Facilitators = staff with a login account, filtered by institution + department + name. */
  static async searchFacilitators(f: FacilitatorFilters): Promise<ResourcePersonResult[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_search_facilitators', {
      p_institution_id: uuidOrNull(f.institutionId),
      p_department_id: uuidOrNull(f.departmentId),
      p_query: f.query?.trim() || null,
    });
    if (error) throw error;
    return ((data as any[]) ?? []).map((r) => ({
      id: r.profile_id, full_name: r.full_name, email: r.email, sub_label: r.sub_label,
    }));
  }

  /** Learners = learners_profiles with a login account, via the institution→section cascade + name. */
  static async searchLearnerSpeakers(f: LearnerSpeakerFilters): Promise<ResourcePersonResult[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_search_learner_speakers', {
      p_institution_id: uuidOrNull(f.institutionId),
      p_degree_id: uuidOrNull(f.degreeId),
      p_department_id: uuidOrNull(f.departmentId),
      p_program_id: uuidOrNull(f.programId),
      p_semester_id: uuidOrNull(f.semesterId),
      p_section_id: uuidOrNull(f.sectionId),
      p_query: f.query?.trim() || null,
    });
    if (error) throw error;
    return ((data as any[]) ?? []).map((r) => ({
      id: r.profile_id, full_name: r.full_name, email: r.email, sub_label: r.sub_label,
    }));
  }

  /** "Anyone" = the WHOLE profiles directory (staff + learners + admins +
   *  external), including users with NO institution. RLS lets any authenticated
   *  user read profiles, so this is a direct browser query — no DEFINER RPC.
   *  Requires a name/email query OR an institution filter so it never dumps the
   *  full directory. `id` is the profiles.id event_session_speakers links to. */
  static async searchDirectory(f: DirectoryFilters): Promise<ResourcePersonResult[]> {
    const supabase = getSupabase();
    const inst = uuidOrNull(f.institutionId);
    const q = (f.query ?? '').trim();
    // Strip PostgREST filter metachars so the term can't inject extra .or() terms.
    const safe = q.replace(/[,()*\\]/g, ' ').replace(/\s+/g, ' ').trim();
    // Guard: need a usable name query OR an institution — otherwise return nothing
    // rather than loading thousands of rows.
    if (safe.length < 2 && !inst) return [];

    let builder = supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .order('full_name')
      .limit(50);
    if (inst) builder = builder.eq('institution_id', inst);
    if (safe.length >= 2) builder = builder.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`);

    const { data, error } = await builder;
    if (error) throw error;
    return ((data as any[]) ?? []).map((r) => ({
      id: r.id, full_name: r.full_name, email: r.email, sub_label: r.role,
    }));
  }

  /** The user(s) currently linked as a session's resource persons (for edit-load). */
  static async getSessionSpeakers(sessionId: string): Promise<DirectoryUser[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('event_session_speakers')
      .select('profile_id, profiles(id, full_name, role, email)')
      .eq('session_id', sessionId);
    if (error) throw error;
    return ((data as any[]) ?? [])
      .map((r) => r.profiles)
      .filter(Boolean) as DirectoryUser[];
  }

  /** Linked resource persons for MANY sessions at once (session-list display).
   *  One .in() query instead of a per-session loop; RLS scopes what's visible
   *  (admins/view-holders: all; a resource person: all speakers of their event). */
  static async getSpeakersBySession(sessionIds: string[]): Promise<Record<string, DirectoryUser[]>> {
    if (!sessionIds.length) return {};
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('event_session_speakers')
      .select('session_id, profiles(id, full_name, role, email)')
      .in('session_id', sessionIds);
    if (error) throw error;
    const map: Record<string, DirectoryUser[]> = {};
    for (const r of (data as any[]) ?? []) {
      if (!r.profiles) continue;
      (map[r.session_id] ??= []).push(r.profiles as DirectoryUser);
    }
    return map;
  }

  /** Replace the session's linked resource persons with this exact set. */
  static async setSessionSpeakers(sessionId: string, profileIds: string[]): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_set_session_speakers', {
      p_session_id: sessionId,
      p_profile_ids: profileIds,
      p_source_label: null,
    });
    if (error) throw error;
    return data as number;
  }

  /** "Sessions I led" credit — defaults to the caller; super/admin may pass a profile id. */
  static async getSessionsLed(profileId?: string): Promise<SessionLedRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_sessions_led', {
      p_profile_id: profileId ?? null,
    });
    if (error) throw error;
    return (data as SessionLedRow[]) ?? [];
  }

  /** Sessions I led, each with its anonymous feedback summary (avg + count).
   *  Self-scoped to the caller's credited sessions; k>=3 floor suppresses the
   *  avg below 3 responses. Needs NO induction.view. */
  static async getMySessionsFeedback(): Promise<MySessionFeedbackRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_my_sessions_feedback');
    if (error) throw error;
    return (data as MySessionFeedbackRow[]) ?? [];
  }

  /** Anonymized comments for ONE of my sessions. Speakership-gated server-side;
   *  returns [] when fewer than 3 responses (anonymity floor). */
  static async getMySessionComments(sessionId: string): Promise<SessionCommentRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_my_session_comments', {
      p_session_id: sessionId,
    });
    if (error) throw error;
    return (data as SessionCommentRow[]) ?? [];
  }

  /** Session-effectiveness loop rows for an event (the AI tips for weak topics +
   *  their RTM-corrected net_effect). Server-gated: a resource person sees only
   *  rows for sessions they led; a coordinator/admin sees all. */
  static async getSessionLoopTips(eventId: string): Promise<SessionLoopTip[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_session_loop_summary', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as SessionLoopTip[]) ?? [];
  }
}
