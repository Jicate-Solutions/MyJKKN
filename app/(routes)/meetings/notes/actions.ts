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

import { createClient } from '@/lib/supabase/server';

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

  revalidatePath(UNMATCHED_PATH);
  return { success: true };
}
