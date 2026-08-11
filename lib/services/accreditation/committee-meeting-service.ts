// lib/services/accreditation/committee-meeting-service.ts
// ============================================================================
// CRUD service for accreditation_committee_meetings +
// accreditation_committee_resolutions (IQAC Meeting Loop, PR 2/3).
//
// The loop these tables implement (Director decision 2026-07-10):
//   Act:          a meeting passes resolutions (owner + due date).
//   Measure:      the NEXT meeting opens with the open-resolution review —
//                 each item marked done / carried / dropped.
//   Decide:       carried items increment carried_count (2+ = Director
//                 escalation flag); minutes become the Action-Taken Report.
//   Feed-forward: items left 'open' (carried) reappear at the next meeting.
//
// Carried semantics (deliberate): status STAYS 'open' so the item re-enters
// the next meeting's review queue; carried_count is the visible strike
// counter; reviewed_in_meeting_id records where it was last reviewed.
//
// RLS on production (migration 20260710060000, PR #1940):
//   - SELECT: accreditation.naac.committees.view + institution access
//   - ALL writes: accreditation.naac.committees.meetings.manage +
//     institution access (super-admin/admin bypass)
// Writes go through the browser anon client — RLS is the gate, no service key.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type MeetingStatus = 'scheduled' | 'held' | 'minuted' | 'cancelled';

/** 'carried' exists in the DB CHECK but the loop keeps carried items 'open'. */
export type ResolutionStatus = 'open' | 'done' | 'carried' | 'dropped';

export type ResolutionReviewAction = 'done' | 'carried' | 'dropped';

export interface CommitteeMeeting {
  id: string;
  committee_id: string;
  institution_id: string;
  meeting_no: number;
  scheduled_for: string | null; // date
  held_at: string | null; // timestamptz
  status: MeetingStatus;
  minutes_summary: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommitteeResolution {
  id: string;
  committee_id: string;
  meeting_id: string; // the meeting where it PASSED
  institution_id: string;
  resolution_text: string;
  owner_user_id: string | null;
  owner_label: string | null; // free-text owner fallback
  due_date: string | null; // date
  status: ResolutionStatus;
  carried_count: number;
  reviewed_in_meeting_id: string | null; // where last reviewed/closed
  outcome_note: string | null;
  closed_at: string | null;
  /**
   * C7 routing tag (two-spine weave): a cluster (CAC) resolution names the
   * colleges it touches; those colleges' IQAC briefs pick it up. Empty for
   * ordinary per-college resolutions.
   */
  affected_institution_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMeetingPayload {
  committee_id: string;
  institution_id: string;
  scheduled_for?: string | null; // date
  /** true = create AND mark held in one insert (held_at = now). */
  convene_now?: boolean;
}

/** Which desk-work document the AI drafted for a sitting. */
export type MeetingDraftKind = 'agenda' | 'minutes';

/**
 * One AI-drafted committee document (agenda papers or minutes prose), plus the
 * output of every deterministic gate that ran on it. A row is only ever written
 * by the SECDEF cron RPC; the table itself is SELECT-only to session clients.
 */
export interface MeetingAiDraft {
  id: string;
  committee_id: string;
  institution_id: string;
  meeting_id: string;
  draft_kind: MeetingDraftKind;
  body_md: string | null;
  /** The exact fact block the prompt was handed (the replay audit trail). */
  source_facts: Record<string, unknown>;
  grounding_verdict: 'grounded' | 'ungrounded' | null;
  ungrounded_tokens: string[];
  /** Scope-d hits: platform-readable figures found on an AGENDA. */
  forbidden_number_hits: Array<{
    token: string;
    line: string;
    lineNo: number;
    reason: string;
  }>;
  /** Scope-c hits: resolution ids the polished prose dropped. */
  omitted_resolution_ids: string[];
  model: string | null;
  ai_job_id: string | null;
  generated_at: string | null;
  status: 'ai_drafted' | 'convener_okayed' | 'discarded';
  okayed_at: string | null;
  okayed_by: string | null;
  revision_note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A proposed sitting awaiting the convener. Until status flips to
 * 'convener_confirmed' NO meeting row exists and nothing has reached anyone —
 * the date and the member list are computed from real rows (cadence policy +
 * active membership), never generated.
 */
export interface MeetingSittingProposal {
  id: string;
  committee_id: string;
  institution_id: string;
  proposed_for: string; // date
  proposed_member_ids: string[];
  rationale: string | null;
  status: 'ai_proposed' | 'convener_confirmed' | 'declined';
  created_meeting_id: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decline_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface PassResolutionPayload {
  committee_id: string;
  meeting_id: string;
  institution_id: string;
  resolution_text: string;
  owner_label?: string | null;
  owner_user_id?: string | null;
  due_date?: string | null;
  /** C7: optional affected-colleges routing tag (cluster/CAC resolutions). */
  affected_institution_ids?: string[];
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === '23505'
  );
}

// ----------------------------------------------------------------------------
// Service
// ----------------------------------------------------------------------------

export class CommitteeMeetingService {
  private static supabase = createClientSupabaseClient();

  private static async currentUserId(): Promise<string | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  }

  // --------------------------- Meetings -----------------------------------

  /** All meetings for a committee, newest (highest meeting_no) first. */
  static async listMeetings(committeeId: string): Promise<CommitteeMeeting[]> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committee_meetings')
      .select('*')
      .eq('committee_id', committeeId)
      .order('meeting_no', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CommitteeMeeting[];
  }

  /**
   * Create the next meeting. meeting_no = (max existing) + 1 computed
   * client-side; the UNIQUE(committee_id, meeting_no) constraint guards the
   * race — on 23505 we retry once with +1.
   */
  static async createMeeting(
    payload: CreateMeetingPayload,
  ): Promise<CommitteeMeeting> {
    const nextNo = await this.nextMeetingNo(payload.committee_id);
    try {
      return await this.insertMeeting(payload, nextNo);
    } catch (e) {
      if (isUniqueViolation(e)) {
        return await this.insertMeeting(payload, nextNo + 1);
      }
      throw e;
    }
  }

  private static async nextMeetingNo(committeeId: string): Promise<number> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committee_meetings')
      .select('meeting_no')
      .eq('committee_id', committeeId)
      .order('meeting_no', { ascending: false })
      .limit(1);
    if (error) throw error;
    const max = (data as Array<{ meeting_no: number }> | null)?.[0]?.meeting_no;
    return (max ?? 0) + 1;
  }

  private static async insertMeeting(
    payload: CreateMeetingPayload,
    meetingNo: number,
  ): Promise<CommitteeMeeting> {
    const conveneNow = payload.convene_now ?? false;
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committee_meetings')
      .insert({
        committee_id: payload.committee_id,
        institution_id: payload.institution_id,
        meeting_no: meetingNo,
        scheduled_for: payload.scheduled_for ?? (conveneNow ? today : null),
        held_at: conveneNow ? new Date().toISOString() : null,
        status: conveneNow ? 'held' : 'scheduled',
        created_by: await this.currentUserId(),
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as CommitteeMeeting;
  }

  /** Scheduled → held: the meeting is happening / happened. */
  static async markHeld(meetingId: string): Promise<CommitteeMeeting> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committee_meetings')
      .update({ status: 'held', held_at: new Date().toISOString() })
      .eq('id', meetingId)
      .select('*')
      .single();
    if (error) throw error;
    return data as CommitteeMeeting;
  }

  /**
   * Held → minuted: closes the meeting with the minutes text (the
   * Action-Taken Report). The 7.3.e evidence emitter (PR 3/3) reads these.
   */
  static async closeMeeting(
    meetingId: string,
    minutesSummary: string,
  ): Promise<CommitteeMeeting> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committee_meetings')
      .update({ status: 'minuted', minutes_summary: minutesSummary })
      .eq('id', meetingId)
      .select('*')
      .single();
    if (error) throw error;
    return data as CommitteeMeeting;
  }

  /**
   * Write minutes_summary WITHOUT touching status. Used when the Chairman /
   * Coordinator compiles the members' own accounts of a sitting into the
   * official minutes — which can happen while the meeting is still 'held', and
   * again after it is 'minuted'. closeMeeting stays the only writer that also
   * advances the status, so the loop's state machine is unchanged.
   *
   * The overwrite question ("this meeting already has minutes") is settled in
   * the UI before this is called — see lib/services/accreditation/
   * meeting-minutes-compiler.ts. This method writes exactly what it is given.
   */
  static async updateMinutesSummary(
    meetingId: string,
    minutesSummary: string,
  ): Promise<CommitteeMeeting> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committee_meetings')
      .update({ minutes_summary: minutesSummary })
      .eq('id', meetingId)
      .select('*')
      .single();
    if (error) throw error;
    return data as CommitteeMeeting;
  }

  static async cancelMeeting(meetingId: string): Promise<CommitteeMeeting> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committee_meetings')
      .update({ status: 'cancelled' })
      .eq('id', meetingId)
      .select('*')
      .single();
    if (error) throw error;
    return data as CommitteeMeeting;
  }

  // --------------------------- Resolutions --------------------------------

  /**
   * All still-open resolutions for a committee (passed in ANY meeting) —
   * the review queue for the next held meeting. Overdue first.
   */
  static async listOpenResolutions(
    committeeId: string,
  ): Promise<CommitteeResolution[]> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committee_resolutions')
      .select('*')
      .eq('committee_id', committeeId)
      .eq('status', 'open')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CommitteeResolution[];
  }

  /** Resolutions PASSED in a given meeting. */
  static async listResolutionsByMeeting(
    meetingId: string,
  ): Promise<CommitteeResolution[]> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committee_resolutions')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CommitteeResolution[];
  }

  /** Resolutions REVIEWED (done/carried/dropped) in a given meeting. */
  static async listReviewedInMeeting(
    meetingId: string,
  ): Promise<CommitteeResolution[]> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committee_resolutions')
      .select('*')
      .eq('reviewed_in_meeting_id', meetingId)
      .order('updated_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CommitteeResolution[];
  }

  /** Pass a new resolution in a meeting (Act). */
  static async passResolution(
    payload: PassResolutionPayload,
  ): Promise<CommitteeResolution> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_committee_resolutions')
      .insert({
        committee_id: payload.committee_id,
        meeting_id: payload.meeting_id,
        institution_id: payload.institution_id,
        resolution_text: payload.resolution_text,
        owner_user_id: payload.owner_user_id ?? null,
        owner_label: payload.owner_label ?? null,
        due_date: payload.due_date ?? null,
        status: 'open',
        // C7: only sent when tags are chosen — keeps plain IQAC resolution
        // writes working even before the Director-gated migration is applied
        // (the column defaults to '{}' once it exists).
        ...(payload.affected_institution_ids &&
        payload.affected_institution_ids.length > 0
          ? { affected_institution_ids: payload.affected_institution_ids }
          : {}),
        created_by: await this.currentUserId(),
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as CommitteeResolution;
  }

  /**
   * Review an open resolution at a later meeting (Measure/Decide).
   *   done:    status='done', closed_at=now
   *   carried: carried_count+1, status STAYS 'open' (reappears next meeting),
   *            reviewed_in_meeting_id records this review
   *   dropped: status='dropped', closed_at=now
   */
  static async reviewResolution(
    id: string,
    action: ResolutionReviewAction,
    reviewedInMeetingId: string,
    outcomeNote?: string | null,
  ): Promise<CommitteeResolution> {
    const sb = this.supabase as any;

    const patch: Record<string, unknown> = {
      reviewed_in_meeting_id: reviewedInMeetingId,
      outcome_note: outcomeNote?.trim() || null,
    };

    if (action === 'done') {
      patch.status = 'done';
      patch.closed_at = new Date().toISOString();
    } else if (action === 'dropped') {
      patch.status = 'dropped';
      patch.closed_at = new Date().toISOString();
    } else {
      // carried — read-modify-write on the strike counter is fine here:
      // reviews happen one committee secretary at a time.
      const { data: current, error: readError } = await sb
        .from('accreditation_committee_resolutions')
        .select('carried_count')
        .eq('id', id)
        .single();
      if (readError) throw readError;
      patch.carried_count =
        ((current as { carried_count: number | null })?.carried_count ?? 0) + 1;
      // status stays 'open' so the item re-enters the next meeting's queue.
    }

    const { data, error } = await sb
      .from('accreditation_committee_resolutions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as CommitteeResolution;
  }

  // ------------------- AI assistant drafts / proposals --------------------
  // READ-ONLY here. Both tables carry a SELECT-only RLS policy: every write
  // goes through the SECDEF RPCs (which own the state machine and the three
  // refusal gates), called from the server actions with the SESSION client.

  /** AI drafts (agenda + minutes prose) for a committee's meetings. */
  static async listMeetingDrafts(committeeId: string): Promise<MeetingAiDraft[]> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_meeting_drafts')
      .select('*')
      .eq('committee_id', committeeId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as MeetingAiDraft[];
  }

  /** The single sitting proposal still waiting on the convener, if any. */
  static async pendingProposal(
    committeeId: string,
  ): Promise<MeetingSittingProposal | null> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_meeting_proposals')
      .select('*')
      .eq('committee_id', committeeId)
      .eq('status', 'ai_proposed')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return ((data ?? [])[0] as MeetingSittingProposal) ?? null;
  }
}
