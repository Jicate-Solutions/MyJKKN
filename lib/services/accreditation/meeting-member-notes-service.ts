// lib/services/accreditation/meeting-member-notes-service.ts
// ============================================================================
// Each IQAC committee member's OWN account of a sitting.
//
// Substrate: accreditation_meeting_member_notes, added by
// supabase/migrations/20260809101600_iqac_meeting_member_notes.sql
// (FILE ONLY — not applied; see that header and supabase/SQL_FILE_INDEX.md).
//
// Access is decided entirely by RLS on the browser (anon-key, session-scoped)
// client — there is no service key on this path:
//   * SELECT  — your own note, always; every note on the sitting if you are the
//               committee Chairman / Coordinator, an admin, or hold
//               accreditation.naac.committees.meetings.manage for that college.
//   * INSERT / UPDATE — your own note only, and only on a sitting of a
//               committee you are an ACTIVE member of.
// author_user_id is never accepted from a caller: it is read from the live
// session here and re-checked against auth.uid() by the policy.
//
// ⚠️ RLS denial is silent — a reader who cannot see other members' notes gets
// zero rows and error === null, exactly like a sitting nobody has written up.
// Callers MUST NOT render an empty list as "nobody wrote anything" unless they
// have independently established that the viewer is allowed to see all of them.
//
// ⚠️ A note OUTLIVES its author (20260809102500). When a departing member's
// profile row is deleted the FK sets author_user_id to NULL and the note stays.
// Attribution therefore comes from the author_name / author_email SNAPSHOT
// written at save time — never from joining profiles at read time, because
// after the departure there is nothing there to join to.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface MeetingMemberNote {
  id: string;
  meeting_id: string;
  /** NULL once the author has left the platform and their profile was deleted. */
  author_user_id: string | null;
  /** Snapshot of the author's name at save time. Survives their departure. */
  author_name: string | null;
  /** Snapshot of the author's email at save time. The fallback label. */
  author_email: string | null;
  note_text: string;
  institution_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * How a note is attributed. The snapshot comes FIRST and on purpose: it is the
 * only source that still exists after the author's profile row is gone, and
 * preferring a live profile here would reintroduce exactly the read-time join
 * this design removes. Returns null when the note carries no snapshot at all
 * (rows written before 20260809102500 whose backfill found no profile), which
 * lets the caller fall back to something it knows and never print an empty name.
 */
export function noteAuthorSnapshotLabel(
  note: Pick<MeetingMemberNote, 'author_name' | 'author_email'>,
): string | null {
  return note.author_name?.trim() || note.author_email?.trim() || null;
}

/** True when the author's profile is gone — the note survived them. */
export function isFormerMemberNote(
  note: Pick<MeetingMemberNote, 'author_user_id'>,
): boolean {
  return note.author_user_id === null;
}

export class MeetingMemberNotesService {
  private static supabase = createClientSupabaseClient();

  private static async currentUserId(): Promise<string | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  }

  /**
   * Every note on this sitting that RLS lets the caller see. For an ordinary
   * member that is exactly their own row (or none yet); for the Chairman /
   * Coordinator it is all of them.
   */
  static async listForMeeting(meetingId: string): Promise<MeetingMemberNote[]> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_meeting_member_notes')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as MeetingMemberNote[];
  }

  /**
   * Write (or revise) the caller's OWN account. The conflict target is the
   * UNIQUE (meeting_id, author_user_id) constraint declared in the migration —
   * these two must stay identical or PostgreSQL raises 42P10 at runtime.
   *
   * institution_id is deliberately NOT sent, and neither are author_name /
   * author_email: the same BEFORE trigger derives all three — institution_id
   * from the parent meeting, the author snapshot from the author's profile — so
   * a client can neither file an account under a college it does not belong to
   * nor sign it with somebody else's name.
   */
  static async saveMyNote(
    meetingId: string,
    noteText: string,
  ): Promise<MeetingMemberNote> {
    const authorUserId = await this.currentUserId();
    if (!authorUserId) {
      throw new Error(
        'Your session has expired. Sign in again to save your account of this meeting.',
      );
    }

    const { data, error } = await (this.supabase as any)
      .from('accreditation_meeting_member_notes')
      .upsert(
        {
          meeting_id: meetingId,
          author_user_id: authorUserId,
          note_text: noteText,
        },
        { onConflict: 'meeting_id,author_user_id' },
      )
      .select('*')
      .single();
    if (error) throw error;
    return data as MeetingMemberNote;
  }
}
