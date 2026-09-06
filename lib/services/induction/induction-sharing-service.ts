// lib/services/induction/induction-sharing-service.ts
// Cross-college session sharing — which OTHER colleges co-conduct a session.
// Director decisions D2 (share per session, not per programme) and D10 (the
// host college manages sharing; the joining college gets read-only).
//
// In its OWN service rather than appended to induction-service.ts, matching
// induction-speakers-service.ts: this is step 1 of a 4-step programme and must
// stay independently mergeable from the attendance/credit/reporting steps.
//
// NAMING: this module already uses "combined" for "all batches attend together"
// (sessions-section.tsx COMBINED = '__combined__'). Cross-college is SHARED, so
// a coordinator never has to disambiguate one word.
//
// SCOPE: labelling only. Sharing a session does NOT (yet) give the joining
// college's freshers attendance or completion credit — that is a later,
// separately-gated step, because the completion denominator drives both the
// attendance % and the feedback % and cannot be widened casually.
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = (): any => createClientSupabaseClient();

/** One (session → joining college) share, as returned for a whole event. */
export interface SessionShareRow {
  session_id: string;
  institution_id: string;
  institution_name: string;
  added_at: string;
}

/** A college this session can still be shared with (host and already-shared
 *  colleges are excluded server-side). */
export interface ShareableInstitution {
  institution_id: string;
  institution_name: string;
}

export class InductionSharingService {
  /** Every share across this event's sessions, in one call — the sessions list
   *  renders many rows, so a per-session round trip would be N+1. Readable by
   *  the host side AND by any college a session is shared with. */
  static async listEventShares(eventId: string): Promise<SessionShareRow[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_event_session_shares', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as SessionShareRow[]) ?? [];
  }

  /** Colleges this session can still be shared with. Deliberately NOT the
   *  useInstitutionsWithAccess hook: that returns only colleges the caller
   *  already administers, and sharing exists precisely to invite one you do
   *  not. Host, and any college already sharing, are excluded server-side. */
  static async listShareable(sessionId: string): Promise<ShareableInstitution[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_session_shareable_institutions', {
      p_session_id: sessionId,
    });
    if (error) throw error;
    return (data as ShareableInstitution[]) ?? [];
  }

  /** Share one session with one other college. Host-only (D10); the RPC raises
   *  if the caller is not on the host side, if the college already hosts this
   *  session, or if the college does not exist. Idempotent. */
  static async addShare(sessionId: string, institutionId: string): Promise<string> {
    const { data, error } = await getSupabase().rpc('fn_induction_session_share_add', {
      p_session_id: sessionId,
      p_institution_id: institutionId,
    });
    if (error) throw error;
    return data as string;
  }

  /** Stop sharing one session with one college. Host-only (D10). Returns the
   *  number of rows removed (0 when it was not shared — not an error). */
  static async removeShare(sessionId: string, institutionId: string): Promise<number> {
    const { data, error } = await getSupabase().rpc('fn_induction_session_share_remove', {
      p_session_id: sessionId,
      p_institution_id: institutionId,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  /** Group a flat share list by session id — what the sessions list needs to
   *  render a badge per row without re-querying. */
  static groupBySession(rows: SessionShareRow[]): Map<string, SessionShareRow[]> {
    const map = new Map<string, SessionShareRow[]>();
    for (const r of rows) {
      const list = map.get(r.session_id);
      if (list) list.push(r);
      else map.set(r.session_id, [r]);
    }
    return map;
  }
}
