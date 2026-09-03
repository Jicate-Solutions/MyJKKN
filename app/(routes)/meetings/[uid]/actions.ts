'use server';

// app/(routes)/meetings/[uid]/actions.ts
//
// Host-side cancel for a native booking (Phase N2 — replaces the external
// "Cancel on jicate-booking" deep-link). Auth model: resolve the signed-in
// user with the session client, then perform the cancel through the
// service-role client via NativeSchedulingService.cancelBooking, which
// verifies the actor IS the booking's host (admins use the host path too —
// out of scope v1). meeting_bookings has no UPDATE policy for authenticated
// on purpose: all mutations flow through server actions like this one.
//
// Host-side RESCHEDULE follows the identical shape. It deliberately does NOT
// reuse the public /book/reschedule/[uid] flow: that one authenticates with
// the booking's cancel_token — the ATTENDEE's capability — and the RLS policy
// comment in 20260611190000_native_scheduling_engine.sql (lines 246-247)
// states that cancel/update go through service-role server actions precisely
// "so cancel_token never needs to reach the client". Putting that token in a
// host-facing URL would leak it into the host's address bar, history and
// referrer headers. The service already accepts an actorProfileId alternative
// (native-scheduling-service.ts:1090) and already attributes the resulting
// notification correctly (rescheduledBy: byToken ? 'attendee' : 'host'), so
// the guest is told the HOST moved the meeting.

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  NativeSchedulingService,
  type NativeBookingResult,
  type PastRescheduleReason,
} from '@/lib/services/meetings/native-scheduling-service';
import {
  MeetingModeSwitchService,
  type ModeSwitchError,
} from '@/lib/services/meetings/meeting-mode-switch-service';

export interface CancelResult {
  success: boolean;
  error?: string;
}

export async function cancelMyBooking(uid: string, reason?: string): Promise<CancelResult> {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You are signed out. Please sign in and try again.' };
  }
  if (!uid || typeof uid !== 'string') {
    return { success: false, error: 'Invalid booking reference.' };
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await NativeSchedulingService.cancelBooking(
    service,
    uid,
    { actorProfileId: user.id },
    reason?.trim() || 'Cancelled by host',
  );

  if (!result.success) {
    const message =
      result.error === 'FORBIDDEN'
        ? 'Only the meeting host can cancel this booking.'
        : result.error === 'NOT_CONFIRMED'
          ? 'This booking is not in a cancellable state.'
          : result.error === 'NOT_FOUND'
            ? 'Booking not found.'
            : 'Could not cancel the booking. Please try again.';
    return { success: false, error: message };
  }

  revalidatePath(`/meetings/${uid}`);
  revalidatePath('/meetings/inbox');
  return { success: true };
}

/** The only two outcomes that can be recorded. Mirrors the status CHECK. */
export type MeetingOutcome = 'completed' | 'no_show';

export interface MarkOutcomeResult extends CancelResult {
  /**
   * Which arm of the gate the caller came through — 'host' when they own the
   * booking, 'admin' when a super admin closed it for the host. Echoed from the
   * database rather than inferred here, so it always matches the row that was
   * actually written.
   */
  markedBy?: 'host' | 'admin';
}

/**
 * Record whether the meeting actually happened, AND who said so.
 *
 * Unlike cancel/reschedule above, this does NOT take the service-role path.
 * The authorization it needs is "are you this booking's host, or a super admin
 * acting for them", which fn_meeting_mark_outcome answers from auth.uid() and
 * is_super_admin() inside the database — so the SESSION client is both
 * sufficient and strictly safer here: no service-role key participates, and the
 * caller can change one booking in one direction. Cancel needs service-role for
 * a different reason (it also touches the attendee's cancel_token path and the
 * venue hold).
 *
 * WHO gets recorded is the whole point of 20260926010000. The actor is never
 * passed from here — it is taken from auth.uid() inside the function, so a
 * caller cannot claim to be someone else. The returned `markedBy` says which
 * arm of the gate the caller came through, which is what lets the confirmation
 * be honest when a super admin closes a meeting they do not host.
 *
 * Migrations 20260831010000 and 20260926010000 are FILE ONLY until the Director
 * applies them, so the RPC may not exist yet. That case is surfaced as an
 * explicit message rather than a generic failure — a silent "could not save"
 * here would look identical to the bug this exists to fix.
 */
export async function markMeetingOutcome(
  uid: string,
  outcome: MeetingOutcome,
): Promise<MarkOutcomeResult> {
  const session = (await createClient()) as unknown as SupabaseClient;
  const {
    data: { user },
    error: authError,
  } = await session.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You are signed out. Please sign in and try again.' };
  }
  if (!uid || typeof uid !== 'string') {
    return { success: false, error: 'Invalid booking reference.' };
  }
  if (outcome !== 'completed' && outcome !== 'no_show') {
    return { success: false, error: 'Pick either "it happened" or "no-show".' };
  }

  const { data, error } = await session.rpc('fn_meeting_mark_outcome', {
    p_uid: uid,
    p_outcome: outcome,
  });

  if (error) {
    // PGRST202 = the function is not in the schema cache, i.e. the migration
    // has not been applied to this environment yet.
    if (error.code === 'PGRST202') {
      return {
        success: false,
        error: 'Recording meeting outcomes is not switched on yet. Ask an administrator to apply the pending meetings migration.',
      };
    }
    return { success: false, error: 'Could not save the outcome. Please try again.' };
  }

  const result = (data ?? {}) as {
    success?: boolean;
    error_code?: string;
    message?: string;
    marked_by?: 'host' | 'admin';
  };
  if (!result.success) {
    const message =
      result.error_code === 'not_found'
        ? 'Booking not found.'
        : result.error_code === 'not_started'
          ? 'This meeting has not started yet.'
          : result.error_code === 'not_markable'
            ? (result.message ?? 'This booking can no longer be marked.')
            : 'Could not save the outcome. Please try again.';
    return { success: false, error: message };
  }

  revalidatePath(`/meetings/${uid}`);
  revalidatePath('/meetings/inbox');
  return { success: true, markedBy: result.marked_by };
}

export interface HostSlotsResult {
  success: boolean;
  error?: string;
  /** ISO-date (host timezone) → slot start instants, exactly as listSlots returns. */
  days?: Record<string, { start: string }[]>;
  durationMin?: number;
}

/**
 * Live slots the host can move THIS booking to.
 *
 * Ownership is checked HERE, not just inside the move: listSlots only needs a
 * meeting_type_id, so without this guard any signed-in user could enumerate any
 * host's free/busy pattern by guessing a booking uid.
 */
export async function getMyBookingSlots(uid: string): Promise<HostSlotsResult> {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You are signed out. Please sign in and try again.' };
  }
  if (!uid || typeof uid !== 'string') {
    return { success: false, error: 'Invalid booking reference.' };
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: booking } = await service
    .from('meeting_bookings')
    .select('host_profile_id, meeting_type_id, status')
    .eq('uid', uid)
    .maybeSingle();

  // Same opaque answer for "not found" and "not yours" — a distinguishable
  // error would confirm a uid exists to someone who is not the host.
  if (!booking || booking.host_profile_id !== user.id) {
    return { success: false, error: 'Booking not found.' };
  }
  if (booking.status !== 'confirmed') {
    return { success: false, error: 'Only a confirmed booking can be moved.' };
  }

  const slots = await NativeSchedulingService.listSlots(
    service,
    booking.meeting_type_id as string,
    { days: 14 },
  );
  if (!slots) return { success: false, error: 'Could not load available times.' };

  return { success: true, days: slots.days, durationMin: slots.durationMin };
}

/**
 * Move the booking to `startIso` as the host.
 *
 * The service re-validates the slot against the live engine, guards against a
 * concurrent move, patches the Google event, moves any held room, and emails
 * BOTH parties with rescheduledBy: 'host' — so the guest's mail names the host
 * as the person who changed the time rather than implying they did it.
 */
export async function rescheduleMyBooking(
  uid: string,
  startIso: string,
  /**
   * Only sent when the meeting being moved has ALREADY ENDED. The host picks it
   * in the UI: 'missed' moves this meeting, 'repeat' / 'follow_up' leave it
   * closed and create a successor linked back to it.
   */
  reason?: PastRescheduleReason,
): Promise<CancelResult> {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You are signed out. Please sign in and try again.' };
  }
  if (!uid || typeof uid !== 'string') {
    return { success: false, error: 'Invalid booking reference.' };
  }
  if (!startIso || Number.isNaN(new Date(startIso).getTime())) {
    return { success: false, error: 'Pick a valid time slot.' };
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  if (reason && !['missed', 'repeat', 'follow_up'].includes(reason)) {
    return { success: false, error: 'Pick a valid reason.' };
  }

  const result = await NativeSchedulingService.rescheduleBooking(
    service,
    uid,
    { actorProfileId: user.id },
    startIso,
    reason ? { reason } : {},
  );

  if (!result.success) {
    // `strictNullChecks` is off repo-wide (tsconfig.json), which defeats
    // discriminated-union narrowing on a boolean discriminant — the existing
    // public caller has the same unnarrowed access and reports TS2339 today
    // (app/api/public/booking/reschedule/[uid]/route.ts:108). Re-assert the
    // failure arm locally rather than widening the shared result type.
    const { error: code } = result as Extract<NativeBookingResult, { success: false }>;
    const message =
      code === 'SLOT_TAKEN'
        ? 'That time was just taken. Pick another slot.'
        : code === 'INVALID_SLOT'
          ? 'That time is no longer available. Pick another slot.'
          : code === 'NOT_FOUND'
            ? 'Booking not found, or it is no longer confirmed.'
            : 'Could not move the booking. Please try again.';
    return { success: false, error: message };
  }

  revalidatePath(`/meetings/${uid}`);
  revalidatePath('/meetings/inbox');
  return { success: true };
}


// ---------------------------------------------------------------------------
// Mode switch: turn a face-to-face booking into a Google Meet (2026-08-19)
// ---------------------------------------------------------------------------

/**
 * One plain-English sentence per failure. Decision 7 in particular: when the
 * host's Google Calendar is not connected the host is told THAT, not a generic
 * "could not switch" — the whole point of blocking is naming the real reason.
 */
function modeSwitchMessage(code: ModeSwitchError | undefined): string {
  switch (code) {
    case 'FORBIDDEN':
      return 'Only the meeting host can change this booking.';
    case 'ALREADY_ONLINE':
      return 'This meeting is already online.';
    case 'UNSUPPORTED_SOURCE_MODE':
      // Since 2026-08-21 a phone call CAN be moved online, so this no longer
      // names phone. It is now only reached by a mode nobody has decided about.
      return 'This meeting is not set up as an in-person or phone meeting, so it cannot be moved online.';
    case 'NOT_ONLINE':
      return 'This meeting is not a video call, so there is nothing to switch back.';
    case 'ONLINE_BY_TYPE':
      return 'This meeting type is online for everyone who books it, so this one booking cannot be switched back on its own. Change the meeting type, or cancel and rebook.';
    case 'TOO_LATE':
      // Reached from BOTH directions now, so it no longer says "online".
      return 'It is too close to the start time to change how this meeting happens.';
    case 'CALENDAR_NOT_CONNECTED':
      return 'Your Google Calendar is not connected, so the calendar event cannot be changed. Connect it under Availability, then try again.';
    case 'NO_CALENDAR_EVENT':
      return 'This booking has no Google Calendar event, so there is no meeting to add a link to.';
    case 'INVALID_SLOT':
      return 'That time is no longer available. Pick another slot.';
    case 'SLOT_TAKEN':
      return 'That time was just taken. Pick another slot.';
    case 'NO_MEET_LINK':
      return 'Google did not return a Meet link, so nothing was changed. Try again in a moment.';
    case 'GOOGLE_FAILED':
      return 'Google Calendar could not be updated, so nothing was changed. Try again in a moment.';
    case 'GOOGLE_OUT_OF_SYNC':
      // Deliberately NOT "nothing was changed" — that would be untrue. The
      // booking no longer reads as a video call but Google could not be put
      // back. Says "not a video call" rather than "in person" because a phone
      // booking can reach this too now.
      return 'The change did not complete, and this booking no longer shows as a video call — but the Google Calendar event may still show one. Please open it in Google Calendar and check.';
    case 'NO_REQUEST':
      return 'There is no pending request on this booking.';
    case 'NOT_FOUND':
      return 'Booking not found, or it is no longer confirmed.';
    default:
      return 'Could not change the booking. Please try again.';
  }
}

export interface ModeSwitchActionResult extends CancelResult {
  /** The Google Meet link, on success. */
  videoUrl?: string | null;
  /** True when the switch also moved the meeting. */
  timeMoved?: boolean;
  /**
   * The meeting kept its time and that time is not one the host's ONLINE hours
   * offer. The switch SUCCEEDED — this is a warning for the host to check, not
   * an error, and the meeting was deliberately not moved to fit.
   */
  outsideOnlineHours?: boolean;
}

/**
 * Host turns their own face-to-face booking into a Google Meet, optionally
 * moving it at the same time (decision 5).
 *
 * Service-role path for the same reason cancel/reschedule take it: the write
 * touches columns `authenticated` has no UPDATE policy for. Authorization is
 * NOT the service-role key — the service verifies the caller IS the booking's
 * host (or a super admin) before anything is written.
 */
export async function switchMyBookingToOnline(
  uid: string,
  startIso?: string,
): Promise<ModeSwitchActionResult> {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You are signed out. Please sign in and try again.' };
  }
  if (!uid || typeof uid !== 'string') {
    return { success: false, error: 'Invalid booking reference.' };
  }
  if (startIso && Number.isNaN(new Date(startIso).getTime())) {
    return { success: false, error: 'Pick a valid time slot.' };
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await MeetingModeSwitchService.switchToOnline(
    service,
    uid,
    { actorProfileId: user.id },
    { newStart: startIso ?? null },
  );
  if (!result.ok) return { success: false, error: modeSwitchMessage(result.error) };

  revalidatePath(`/meetings/${uid}`);
  revalidatePath('/meetings/inbox');
  return {
    success: true,
    videoUrl: result.data?.videoUrl,
    timeMoved: result.data?.timeMoved,
    outsideOnlineHours: result.data?.outsideOnlineHours,
  };
}

/**
 * Host turns their own video meeting back into a face-to-face or phone one
 * (Director ruling 2, 2026-08-21).
 *
 * HOST ONLY, and enforced HERE rather than by hiding the button: the page's
 * gate decides what is worth rendering, and this action would happily be POSTed
 * without it. MeetingModeSwitchService.switchBackFromOnline verifies the
 * signed-in user IS the booking's host (or a super admin) before anything is
 * written, and returns FORBIDDEN otherwise. There is deliberately no
 * cancel_token path: a visitor may ask to go ONLINE, never to come back off it.
 *
 * No startIso argument, and that is the point — switching back never moves the
 * meeting, so it cannot touch reschedule_count.
 */
export async function switchMyBookingBackFromOnline(
  uid: string,
): Promise<ModeSwitchActionResult> {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You are signed out. Please sign in and try again.' };
  }
  if (!uid || typeof uid !== 'string') {
    return { success: false, error: 'Invalid booking reference.' };
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await MeetingModeSwitchService.switchBackFromOnline(service, uid, {
    actorProfileId: user.id,
  });
  if (!result.ok) return { success: false, error: modeSwitchMessage(result.error) };

  revalidatePath(`/meetings/${uid}`);
  revalidatePath('/meetings/inbox');
  return { success: true, videoUrl: null, timeMoved: false };
}

/**
 * Host approves or declines a visitor's pending "can we make this online?"
 * request. Approving re-checks the notice window against the CURRENT clock,
 * so a request made days ago cannot move a meeting that is now imminent.
 */
export async function resolveBookingModeSwitchRequest(
  uid: string,
  decision: 'approve' | 'decline',
): Promise<ModeSwitchActionResult> {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You are signed out. Please sign in and try again.' };
  }
  if (!uid || typeof uid !== 'string') {
    return { success: false, error: 'Invalid booking reference.' };
  }
  if (decision !== 'approve' && decision !== 'decline') {
    return { success: false, error: 'Pick either approve or decline.' };
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await MeetingModeSwitchService.resolveSwitchRequest(
    service,
    uid,
    { actorProfileId: user.id },
    decision,
  );
  if (!result.ok) return { success: false, error: modeSwitchMessage(result.error) };

  revalidatePath(`/meetings/${uid}`);
  revalidatePath('/meetings/inbox');
  return {
    success: true,
    videoUrl: result.data?.videoUrl,
    timeMoved: result.data?.timeMoved,
    outsideOnlineHours: result.data?.outsideOnlineHours,
  };
}
