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
  const durationMinutes =
    start && end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) : null;

  const { error } = await supabase.from('hr_recruitment_interviews').insert({
    candidate_id: candidateId,
    job_id: jobId || null,
    booking_id: booking.id as string,
    round_number: (count ?? 0) + 1,
    round_name: `Round ${(count ?? 0) + 1} — scheduled in MyJKKN`,
    scheduled_at: start,
    duration_minutes: durationMinutes,
    mode: booking.video_url ? 'video' : 'in_person',
    location_or_link: (booking.video_url as string | null) ?? null,
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
    return { success: false, error: 'Could not link this meeting. Please try again.' };
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
