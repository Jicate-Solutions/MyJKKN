'use server';

// app/(routes)/meetings/[uid]/interview-actions.ts
//
// Say that a meeting was an interview, for a named candidate and (optionally) a
// named post.
//
// WHY A PERSON HAS TO SAY IT. A transcript can tell you what was discussed. It
// cannot tell you which requisition the conversation was against, and guessing
// would attach somebody's interview to the wrong post — a mistake that is
// invisible until an offer is prepared from it. Measured on production
// 2026-09-15: 27 bookings are hiring conversations and every one of them
// carries that fact only in free text a visitor typed. So it is asked once,
// here, by a human.
//
// AUTH. Unlike agenda-actions.ts, these writes go through the SESSION client on
// purpose, so the existing RLS policies on hr_recruitment_interviews are the
// gate: select/insert/update require hr.recruitment.view / .create / .edit
// (or admin). Reaching for the service role here would mean re-implementing
// that policy in TypeScript, which is how a permission check drifts from the
// one the database actually enforces.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export interface InterviewLinkResult {
  success: boolean;
  error?: string;
}

/**
 * The booking, or why it could not be read.
 *
 * `failed` and a null row are NOT the same thing and must not share a message.
 * Until 16 Sep 2026 this selected `location_mode`, which lives on
 * meeting_types and has never existed on meeting_bookings — PostgREST answered
 * 42703, the error was discarded, and every Link attempt told the host "This
 * meeting no longer exists." about a booking that was on the screen in front of
 * them. A column name is a query bug; a missing row is a deleted booking. One
 * of those is worth retrying and the other is not, so they are reported apart.
 */
async function loadBooking(uid: string) {
  const supabase = await createClient();
  const { data: booking, error } = await supabase
    .from('meeting_bookings')
    .select('id, start_time, end_time, video_url')
    .eq('uid', uid)
    .maybeSingle();
  if (error) {
    console.error(`[meetings/interview] booking read failed for ${uid}:`, error.message);
  }
  return { supabase, booking: booking as Record<string, unknown> | null, failed: !!error };
}

export async function linkMeetingToInterview(
  uid: string,
  candidateId: string,
  jobId: string | null,
): Promise<InterviewLinkResult> {
  if (!candidateId) return { success: false, error: 'Choose a candidate first.' };

  const { supabase, booking, failed } = await loadBooking(uid);
  if (failed) {
    return { success: false, error: 'Could not read this meeting just now. Please try again.' };
  }
  if (!booking) return { success: false, error: 'This meeting no longer exists.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Please sign in again.' };

  // Which round is this for that candidate? Counted rather than assumed, so a
  // second conversation with the same person reads as round 2.
  const { count } = await supabase
    .from('hr_recruitment_interviews')
    .select('id', { count: 'exact', head: true })
    .eq('candidate_id', candidateId);

  const start = booking.start_time as string | null;
  const end = booking.end_time as string | null;
  // scheduled_at is NOT NULL. A confirmed booking always has a start; saying so
  // plainly beats letting the database refuse it as a generic failure.
  if (!start) {
    return { success: false, error: 'This meeting has no start time, so it cannot be recorded as an interview.' };
  }
  const durationMinutes =
    end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) : null;

  const { error } = await supabase.from('hr_recruitment_interviews').insert({
    candidate_id: candidateId,
    job_id: jobId || null,
    booking_id: booking.id as string,
    round_number: (count ?? 0) + 1,
    round_name: `Round ${(count ?? 0) + 1} — scheduled in MyJKKN`,
    scheduled_at: start,
    // Omitted rather than sent as null when the booking has no end time: the
    // column is NOT NULL with a default of 30, and an explicit null is refused.
    ...(durationMinutes && durationMinutes > 0 ? { duration_minutes: durationMinutes } : {}),
    mode: booking.video_url ? 'video' : 'in_person',
    location_or_link: (booking.video_url as string | null) ?? null,
    // THE PANEL. NOT NULL, and CHECK (array_length(panel_member_ids, 1) > 0) —
    // this insert never set it, so every Link since the feature shipped failed
    // with 23502 and was reported as "Could not link this meeting. Please try
    // again.", which is untrue and unactionable. The person linking the meeting
    // is the person who was in it, so they are the panel until someone edits it
    // in Recruitment. It also makes the row visible to them: the table's SELECT
    // policy admits anyone listed here.
    panel_member_ids: [user.id],
    status: 'scheduled',
    created_by: user.id,
  });

  if (error) {
    // 42501 is RLS refusing the write. Say which permission is missing rather
    // than "something went wrong", because the reader can act on the first and
    // not on the second.
    if (error.code === '42501') {
      return {
        success: false,
        error: 'You do not have permission to record interviews. Ask an administrator for recruitment access.',
      };
    }
    if (error.code === '23505') {
      return { success: false, error: 'This meeting is already linked to an interview.' };
    }
    if (error.code === '23503') {
      // A foreign key: the candidate or the post no longer exists.
      return {
        success: false,
        error: 'That candidate or post no longer exists. Reload the page and pick again.',
      };
    }
    // Anything else is a defect, not a user error. It gets logged with its code,
    // because the previous version of this line returned "please try again" for
    // a NOT NULL violation that could never succeed however often it was tried.
    console.error(
      `[meetings/interview] link failed for ${uid}: ${error.code ?? 'no code'} ${error.message}`,
    );
    return {
      success: false,
      error: 'Could not link this meeting. The reason has been logged for the team.',
    };
  }

  revalidatePath(`/meetings/${uid}`);
  return { success: true };
}

export async function unlinkMeetingFromInterview(uid: string): Promise<InterviewLinkResult> {
  const { supabase, booking, failed } = await loadBooking(uid);
  if (failed) {
    return { success: false, error: 'Could not read this meeting just now. Please try again.' };
  }
  if (!booking) return { success: false, error: 'This meeting no longer exists.' };

  // Clears the link only. The interview record itself survives, because it may
  // already carry an outcome somebody wrote, and a mis-click must not delete
  // that.
  const { error } = await supabase
    .from('hr_recruitment_interviews')
    .update({ booking_id: null })
    .eq('booking_id', booking.id as string);

  if (error) {
    if (error.code === '42501') {
      return {
        success: false,
        error: 'You do not have permission to change interview records.',
      };
    }
    return { success: false, error: 'Could not unlink this meeting. Please try again.' };
  }

  revalidatePath(`/meetings/${uid}`);
  return { success: true };
}
