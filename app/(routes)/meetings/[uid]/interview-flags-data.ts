// app/(routes)/meetings/[uid]/interview-flags-data.ts
//
// What the meeting page needs to show the interview flags card, and the one
// permission question both the page and the no-show actions ask.
//
// Kept out of interview-no-show-actions.ts on purpose: every export of a
// 'use server' file becomes an action a browser can call, and neither of these
// is meant to be one.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  getInterviewFlagsForBooking,
  type InterviewFlags,
} from '@/lib/services/hr/interview-booking-service';

/**
 * May this viewer change an interview row? The same three arms as the UPDATE
 * policy on hr_recruitment_interviews (super admin, admin, hr.recruitment.edit),
 * asked of the viewer's own session. The page uses it to decide whether the
 * no-show buttons are worth showing; the actions ask it again, because a hidden
 * button is not a security boundary.
 */
export async function viewerCanEditInterviews(session: SupabaseClient): Promise<boolean> {
  const [permission, superAdmin, admin] = await Promise.all([
    session.rpc('user_has_permission', { permission_name: 'hr.recruitment.edit' }),
    session.rpc('is_super_admin'),
    session.rpc('is_admin'),
  ]);
  return permission.data === true || superAdmin.data === true || admin.data === true;
}

export interface MeetingInterviewFlags {
  flags: InterviewFlags;
  canEdit: boolean;
}

/**
 * The flags for this booking's interview, or null when there is nothing the
 * viewer may see (#5, #6, #10, #15). The service gates on the viewer's session
 * and reads the facts with the service role — see its comment for why both.
 *
 * A failure here must never take the meeting page down with it: the flags are
 * an addition to the page, not the page. It is logged and the card is left out.
 */
export async function loadInterviewFlags(
  session: SupabaseClient,
  bookingId: string,
): Promise<MeetingInterviewFlags | null> {
  try {
    const flags = await getInterviewFlagsForBooking(session, createServiceRoleClient(), bookingId);
    if (!flags) return null;
    return { flags, canEdit: await viewerCanEditInterviews(session) };
  } catch (err) {
    console.error(
      `[meetings/interview-flags] could not load flags for booking ${bookingId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
