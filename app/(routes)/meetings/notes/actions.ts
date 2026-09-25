'use server';

// app/(routes)/meetings/notes/actions.ts
//
// The one write a human makes in this feature: attaching an UNMATCHED meeting
// note to the meeting it belongs to.
//
// ── WHY THIS GOES THROUGH AN RPC AND NOT AN UPDATE ──────────────────────────
// A direct `update(meeting_notes).eq('id', …)` cannot work here, and the way it
// fails is quiet. PostgreSQL checks the NEW row of an UPDATE against the SELECT
// policy as well as the UPDATE one. The instant a linker sets `booking_id`, the
// row stops being unmatched, so the `booking_id IS NULL AND
// user_has_permission('meetings.series.manage')` branch that admitted it no
// longer does — and unless that person happens to be on the invited set of the
// meeting they just linked to, Postgres refuses the write. So the authorization
// is carried explicitly by fn_link_meeting_note(), a SECURITY DEFINER function
// that does not require the caller to be able to read the result.
//
// ── WHY THE CALLER'S OWN CLIENT, NOT THE SERVICE ROLE ───────────────────────
// The RPC reads auth.uid() to decide whether the caller may link and to record
// `linked_by`. Calling it on the service-role client would make auth.uid() NULL
// — the permission check would fail, and if it did not, every link would be
// recorded as having been made by nobody.

import { revalidatePath } from 'next/cache';

import {
  applyNoteToBooking,
  noteFollowupInputFromStored,
} from '@/lib/services/meetings/meeting-note-followups';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export interface LinkNoteResult {
  success: boolean;
  error?: string;
}

const UNMATCHED_PATH = '/meetings/notes';

export async function linkMeetingNote(input: {
  noteId: string;
  bookingId: string;
}): Promise<LinkNoteResult> {
  const { noteId, bookingId } = input;

  if (!noteId || !bookingId) {
    return { success: false, error: 'Pick a meeting before linking.' };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You are signed out. Please sign in and try again.' };
  }

  // The gate lives in the function, not here. This call can only fail closed:
  // an unauthorised caller gets insufficient_privilege from Postgres.
  const { error } = await supabase.rpc('fn_link_meeting_note', {
    p_note_id: noteId,
    p_booking_id: bookingId,
  });

  if (error) {
    // fn_link_meeting_note raises sentences a non-technical admin can act on
    // ('this note is already linked to a meeting — unlink it first'), so the
    // message is shown rather than replaced with a generic failure.
    return { success: false, error: error.message };
  }

  await applyLinkedNote(noteId, bookingId);

  revalidatePath(UNMATCHED_PATH);
  return { success: true };
}

/**
 * A hand-linked note becomes follow-ups exactly as an auto-matched one does —
 * the same shared path, the same once-only stamp, so unlinking and linking
 * again never creates a second copy.
 *
 * This runs on the SERVICE-ROLE client, and only AFTER fn_link_meeting_note
 * succeeded: that function is the authorization. The linker usually cannot see
 * the note any more (see the header), let alone write the meeting's tasks.
 *
 * The link is already made and is the thing the person asked for; a failure
 * here is logged and the link still reports success.
 */
async function applyLinkedNote(noteId: string, bookingId: string): Promise<void> {
  try {
    const service = createServiceRoleClient();
    const { data: note, error } = await service
      .from('meeting_notes')
      .select('id, booking_id, title, summary, occurred_at, duration_minutes, raw')
      .eq('id', noteId)
      .maybeSingle();

    // Re-read, not assumed: apply only to the booking the note is on NOW.
    if (error || !note || note.booking_id !== bookingId) return;

    await applyNoteToBooking(service, noteId, bookingId, noteFollowupInputFromStored(note));
  } catch (error) {
    logger.warn('meetings/notes-link', 'Linked the note but could not create its follow-ups', {
      noteId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
