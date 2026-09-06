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
  /** Which identity the id belongs to. Absent means 'profile' — the only kind
   *  that existed before guest speakers, so every existing caller stays valid. */
  kind?: 'profile' | 'guest';
}

/** An outside speaker with no JKKN login account. Saved once and reused across
 *  colleges (Director decision D11), which is why the counts below span the
 *  whole cluster rather than one institution — they are what lets a coordinator
 *  tell two similarly-named guests apart. */
export interface GuestSpeakerRow {
  guest_id: string;
  guest_name: string;
  guest_designation: string | null;
  guest_organization: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  sessions_count: number;
  last_session_at: string | null;
  last_event_name: string | null;
  colleges_label: string | null;
}

export interface GuestSpeakerInput {
  full_name: string;
  designation?: string | null;
  organization?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** One-line "who is this" for a guest chip / result row. */
export function guestSubtitle(g: {
  guest_designation?: string | null;
  guest_organization?: string | null;
}): string | null {
  return [g.guest_designation, g.guest_organization].filter(Boolean).join(', ') || null;
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

  /** Saved outside speakers with no login account, for REUSE rather than retyping
   *  (D11). Each row carries where that guest has already spoken, cluster-wide. */
  static async searchGuestSpeakers(query?: string): Promise<GuestSpeakerRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_guest_speakers_directory', {
      p_query: query?.trim() || null,
      p_limit: 25,
    });
    if (error) throw error;
    return (data as GuestSpeakerRow[]) ?? [];
  }

  /** Save a NEW outside speaker. Cluster-wide by design, so no institution is
   *  written; the RLS insert policy requires induction.manage. */
  static async createGuestSpeaker(input: GuestSpeakerInput): Promise<GuestSpeakerRow> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('event_guest_speakers')
      .insert({
        full_name: input.full_name.trim(),
        designation: input.designation?.trim() || null,
        organization: input.organization?.trim() || null,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
      })
      .select('id, full_name, designation, organization, email, phone')
      .single();
    if (error) throw error;
    const r = data as any;
    return {
      guest_id: r.id,
      guest_name: r.full_name,
      guest_designation: r.designation,
      guest_organization: r.organization,
      guest_email: r.email,
      guest_phone: r.phone,
      sessions_count: 0,
      last_session_at: null,
      last_event_name: null,
      colleges_label: null,
    };
  }

  /** A guest row rendered in the same shape as an account-holder, so every
   *  existing consumer of DirectoryUser keeps working unchanged. */
  private static guestAsUser(g: any): DirectoryUser {
    return {
      id: g.id,
      full_name: g.full_name,
      email: g.email ?? null,
      role: [g.designation, g.organization].filter(Boolean).join(', ') || 'Guest',
      kind: 'guest',
    };
  }

  /** The people currently linked as a session's resource persons (for edit-load).
   *  Returns account-holders AND guests — an id from either identity is accepted
   *  back by setSessionSpeakers, which routes it server-side. */
  static async getSessionSpeakers(sessionId: string): Promise<DirectoryUser[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('event_session_speakers')
      .select(
        'profile_id, guest_speaker_id, profiles(id, full_name, role, email), ' +
          'event_guest_speakers(id, full_name, designation, organization, email)',
      )
      .eq('session_id', sessionId);
    if (error) throw error;
    const out: DirectoryUser[] = [];
    for (const r of (data as any[]) ?? []) {
      if (r.profiles) out.push({ ...(r.profiles as DirectoryUser), kind: 'profile' });
      else if (r.event_guest_speakers) out.push(this.guestAsUser(r.event_guest_speakers));
    }
    return out;
  }

  /** Linked resource persons for MANY sessions at once (session-list display).
   *  One .in() query instead of a per-session loop; RLS scopes what's visible
   *  (admins/view-holders: all; a resource person: all speakers of their event). */
  static async getSpeakersBySession(sessionIds: string[]): Promise<Record<string, DirectoryUser[]>> {
    if (!sessionIds.length) return {};
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('event_session_speakers')
      .select(
        'session_id, profiles(id, full_name, role, email), ' +
          'event_guest_speakers(id, full_name, designation, organization, email)',
      )
      .in('session_id', sessionIds);
    if (error) throw error;
    const map: Record<string, DirectoryUser[]> = {};
    for (const r of (data as any[]) ?? []) {
      if (r.profiles) (map[r.session_id] ??= []).push({ ...(r.profiles as DirectoryUser), kind: 'profile' });
      else if (r.event_guest_speakers) (map[r.session_id] ??= []).push(this.guestAsUser(r.event_guest_speakers));
    }
    return map;
  }

  /** Replace the session's linked resource persons with this exact set. The ids
   *  may mix account-holders and saved guests; the RPC routes each one to the
   *  identity space it belongs to, so callers need not separate them. */
  static async setSessionSpeakers(sessionId: string, speakerIds: string[]): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_set_session_speakers', {
      p_session_id: sessionId,
      p_profile_ids: speakerIds,
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
