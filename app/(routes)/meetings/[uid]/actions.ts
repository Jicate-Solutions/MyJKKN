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
} from '@/lib/services/meetings/native-scheduling-service';

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

/** The only two outcomes a host can record. Mirrors the status CHECK. */
export type MeetingOutcome = 'completed' | 'no_show';

/**
 * Record whether the meeting actually happened.
 *
 * Unlike cancel/reschedule above, this does NOT take the service-role path.
 * The authorization it needs is "are you this booking's host", which
 * fn_meeting_mark_outcome answers from auth.uid() inside the database — so the
 * SESSION client is both sufficient and strictly safer here: no service-role
 * key participates, and the caller can change one column in one direction on
 * one booking they host. Cancel needs service-role for a different reason
 * (it also touches the attendee's cancel_token path and the venue hold).
 *
 * Migration 20260831010000 is FILE ONLY until the Director applies it, so the
 * RPC may not exist yet. That case is surfaced as an explicit message rather
 * than a generic failure — a silent "could not save" here would look identical
 * to the bug this PR exists to fix.
 */
export async function markMeetingOutcome(
  uid: string,
  outcome: MeetingOutcome,
): Promise<CancelResult> {
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

  const result = (data ?? {}) as { success?: boolean; error_code?: string; message?: string };
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
  return { success: true };
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
export async function rescheduleMyBooking(uid: string, startIso: string): Promise<CancelResult> {
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

  const result = await NativeSchedulingService.rescheduleBooking(
    service,
    uid,
    { actorProfileId: user.id },
    startIso,
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
