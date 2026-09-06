// lib/services/meetings/meeting-mode-switch-service.ts
//
// Turn a face-to-face booking into a Google Meet WITHOUT cancelling it.
// Director-approved 2026-08-19.
//
// Before this, a booking's mode was fixed by its meeting type and no code path
// anywhere wrote meeting_bookings.meeting_type_id — so "make it online" meant
// cancel + rebook, which sent the visitor a cancellation and then a fresh
// invite with a new link. Here the mode is a property of the BOOKING
// (location_mode_override), which is what makes it work for all 110 hosts who
// have an in-person type rather than only the single account that owns all 14
// online types.
//
// SECURITY MODEL (same as NativeSchedulingService): callers are server actions
// / API routes holding a SERVICE-ROLE client. No new SECURITY DEFINER function
// is introduced — meeting_bookings deliberately has no UPDATE policy for
// `authenticated` (20260611190000_native_scheduling_engine.sql:246-247), so
// authorization is enforced HERE, in front of the service-role write:
//   • host path    — the caller's profile id must BE the booking's host, or the
//                    caller must be a super admin. Checked, not recorded.
//   • visitor path — the booking's cancel_token and nothing else. Never a
//                    caller-supplied user id.
// The visitor path can only ever create a PENDING request; it never mutates
// the booking (decision 4).
//
// ALL-OR-NOTHING (decision 6). The order below is deliberate:
//   1. authorise, then check status / notice / calendar connection
//   2. re-validate the new slot against the live engine (only if moving)
//   3. CLAIM the row with the same concurrent-move guard rescheduleBooking
//      uses (.eq('start_time', …) + 23P01 → SLOT_TAKEN). This is the race
//      arbiter, and it happens before Google so we never notify attendees
//      about a booking someone else just moved or cancelled.
//   4. patch Google (conferencing + the new time in ONE call)
//   5. on any failure — including Google returning no Meet link — restore the
//      row to the exact values captured in step 3, AND undo Google whenever the
//      PATCH already landed. Which of the two systems changed decides the
//      rollback: a PATCH that never applied leaves Google untouched, so the row
//      alone is restored; a PATCH that applied has also already emailed the
//      visitor, so Google is reverted FIRST and the row second (revertBoth).
// Two inconsistencies remain, both bounded and named:
//   • the window between 3 and 5 — server-side, sub-second, and a reader in it
//     sees "online, link pending" rather than anything destructive;
//   • a rollback whose Google half ALSO fails — the booking reads in-person
//     while the calendar event may still carry conferencing. That one is
//     logged with the uid and google_event_id and reported to the host as
//     GOOGLE_OUT_OF_SYNC, never as a clean "nothing was changed".
//
// 2026-08-21 — two Director rulings widen this file:
//   1. PHONE is a switchable source, exactly like in person. It was excluded on
//      2026-08-19 as "never decided"; it is now decided, and it is the larger
//      population (95 live phone types / 95 hosts, against 141 in-person types
//      / 110 hosts; only 14 online types with a single host).
//   2. The switch is no longer one-way: switchBackFromOnline turns a video
//      meeting back into a face-to-face or phone one. It is HOST ONLY — the
//      person who owns the room and the calendar decides. A visitor keeps the
//      existing "may we go online?" request path and gains nothing here.
//      Turning back CLEARS location_mode_override, which the column's CHECK
//      already allows (NULL or 'online'), so no migration is involved.
//
// 2026-08-31 — WHOSE HOURS DOES A SWITCHED MEETING KEEP?
//   Because the switch deliberately never touches meeting_type_id (that single
//   flag is what makes it work for all 110 hosts), every availability question
//   below used to be answered by the ORIGINAL, in-person type — so a meeting
//   that had just become a video call was still being validated against the
//   host's face-to-face hours. Those hours genuinely differ: the 14 live online
//   types sit on 2 schedules and NONE of them on a host default, while 108 of
//   the 141 in-person types sit on the default.
//   Availability for a booking whose EFFECTIVE mode is online is now resolved
//   against the host's ONLINE schedule instead — derived structurally by
//   pickOnlineScheduleId, since meeting_host_schedules has no mode column. The
//   meeting type itself is still untouched: only the schedule_id handed to the
//   slot engine changes, and only for the online direction. A host with no
//   online type at all resolves to null and keeps today's behaviour exactly.

import type { SupabaseClient } from '@supabase/supabase-js';
import { GoogleCalendarService } from '@/lib/services/integrations/google-calendar-service';
import { MeetingBookingEmailService } from '@/lib/services/email/meeting-booking-email-service';
import {
  NativeSchedulingService,
  type NativeMeetingType,
} from '@/lib/services/meetings/native-scheduling-service';
import {
  effectiveLocationMode,
  isSwitchAllowedNow,
  pickOnlineScheduleId,
  resolvedRequestPatch,
  switchBackState,
  switchRequestState,
  switchSourceMode,
} from './meeting-mode-switch';

const LOG_PREFIX = '[meeting-mode-switch]';

// ============================================================================
// TYPES
// ============================================================================

export type ModeSwitchError =
  /** Unknown uid, wrong token, not the host, or no longer confirmed. */
  | 'NOT_FOUND'
  /** Signed in, but this is not your booking. */
  | 'FORBIDDEN'
  /** Already online — nothing to do. */
  | 'ALREADY_ONLINE'
  /**
   * The booking is in none of the modes this feature has been decided for.
   * Since 2026-08-21 that no longer includes phone, which switches exactly as
   * in person does — this is now only an unrecognised or future mode.
   * Deliberately NOT reported as ALREADY_ONLINE, which would be a plain lie.
   */
  | 'UNSUPPORTED_SOURCE_MODE'
  /** Asked to switch BACK a booking that is not a video call at all. */
  | 'NOT_ONLINE'
  /**
   * Asked to switch BACK a booking whose MEETING TYPE is online. The override
   * column can only say 'online' or nothing, so one booking cannot be pulled
   * out of an online type — the type itself has to change.
   */
  | 'ONLINE_BY_TYPE'
  /** Inside the meeting type's min_notice_min window (decision 8). */
  | 'TOO_LATE'
  /** Decision 7: no usable Google Calendar connection, named as the real reason. */
  | 'CALENDAR_NOT_CONNECTED'
  /** The booking was never given a Google event, so there is nothing to upgrade. */
  | 'NO_CALENDAR_EVENT'
  /** The requested new time is not a slot the engine offers. */
  | 'INVALID_SLOT'
  /** Someone moved or cancelled the booking underneath us. */
  | 'SLOT_TAKEN'
  /** Google accepted the patch but produced no Meet link (decision D). */
  | 'NO_MEET_LINK'
  /** The Google patch itself failed (outage, token refused after the check). */
  | 'GOOGLE_FAILED'
  /**
   * The switch failed AFTER Google had already been changed, and undoing it on
   * Google failed too. The booking is back to in-person but the calendar event
   * may still show a video call — a named inconsistency, logged, needing a
   * human look. Never reported as a clean rollback.
   */
  | 'GOOGLE_OUT_OF_SYNC'
  /** Approve/decline with no live request to act on. */
  | 'NO_REQUEST'
  | 'INTERNAL';

export interface ModeSwitchData {
  uid: string;
  start: string;
  end: string;
  /** Present on a completed switch; absent when only a request was recorded. */
  videoUrl?: string | null;
  /** True when the switch also moved the meeting. */
  timeMoved?: boolean;
  /** True when a pending visitor request was recorded rather than applied. */
  pending?: boolean;
  /**
   * The switch kept the meeting's time, and that time is NOT one the host's
   * ONLINE schedule offers.
   *
   * A WARNING, never a failure and never a silent move. Craft decision A says a
   * mode-only switch must not touch reschedule_count / rescheduled_at /
   * previous_start_time, so this path deliberately skips slot re-validation and
   * the meeting stays exactly where it was. That is still the right behaviour —
   * but before this flag the host was never told that their newly-online
   * meeting sits outside the hours they keep for online meetings. Now they are.
   *
   * Absent (undefined) whenever the question does not arise: the meeting moved
   * and was therefore already validated, or the host has no online schedule to
   * compare against, or the online schedule is the one the type already used.
   */
  outsideOnlineHours?: boolean;
}

/**
 * Flat result — NOT a discriminated union. `strictNullChecks` is off repo-wide
 * (tsconfig.json), which defeats narrowing on a boolean tag; the existing
 * callers of NativeBookingResult already hit that and work around it locally.
 */
export interface ModeSwitchResult {
  ok: boolean;
  data?: ModeSwitchData;
  error?: ModeSwitchError;
}

/** The booking columns this service reads. */
const BOOKING_COLUMNS =
  'id, uid, host_profile_id, cancel_token, status, attendee_name, attendee_email, ' +
  'start_time, end_time, meeting_type_id, google_event_id, video_url, ' +
  'reschedule_count, rescheduled_at, previous_start_time, ' +
  'location_mode_override, mode_switch_requested_by, mode_switch_requested_at, ' +
  'mode_switch_requested_start, mode_switch_request_status';

interface BookingRow {
  id: string;
  uid: string;
  host_profile_id: string;
  cancel_token: string;
  status: string;
  attendee_name: string | null;
  attendee_email: string | null;
  start_time: string;
  end_time: string;
  meeting_type_id: string;
  google_event_id: string | null;
  video_url: string | null;
  reschedule_count: number | null;
  rescheduled_at: string | null;
  previous_start_time: string | null;
  location_mode_override: string | null;
  mode_switch_requested_by: string | null;
  mode_switch_requested_at: string | null;
  mode_switch_requested_start: string | null;
  mode_switch_request_status: string | null;
}

// ============================================================================
// SERVICE
// ============================================================================

export class MeetingModeSwitchService {
  // ── shared preamble ───────────────────────────────────────────────────────

  private static async loadBooking(
    supabase: SupabaseClient,
    uid: string,
  ): Promise<BookingRow | null> {
    const { data, error } = await supabase
      .from('meeting_bookings')
      .select(BOOKING_COLUMNS)
      .eq('uid', uid)
      .maybeSingle();
    if (error) {
      console.error(`${LOG_PREFIX} booking load failed:`, error.message);
      return null;
    }
    return (data as unknown as BookingRow | null) ?? null;
  }

  /**
   * Is this caller the booking's host? Super admins pass too.
   *
   * The super-admin read only runs when the caller is NOT the host, so the
   * common path costs nothing extra. This is a GATE — its answer decides
   * whether the write happens; it is never merely recorded.
   */
  private static async callerIsHost(
    supabase: SupabaseClient,
    booking: BookingRow,
    actorProfileId: string | null | undefined,
  ): Promise<boolean> {
    if (!actorProfileId) return false;
    if (actorProfileId === booking.host_profile_id) return true;
    const { data } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', actorProfileId)
      .maybeSingle();
    return (data as { is_super_admin?: boolean } | null)?.is_super_admin === true;
  }

  /**
   * The id of the schedule this host keeps their ONLINE hours in, or null.
   *
   * Structural, not by name: `meeting_host_schedules` has no mode column, so a
   * schedule is identified as the online one only by the fact that the host's
   * own online meeting types point at it (see pickOnlineScheduleId for the rule
   * and for why a name match would be wrong).
   *
   * Only ACTIVE types are counted, matching getMeetingType's own filter — an
   * archived online type's schedule is not evidence about the hours the host
   * keeps today.
   *
   * FALLS BACK, NEVER FAILS. Any error, and any host with no online type,
   * yields null, and every caller then behaves exactly as it did before this
   * existed. Most of the 110 hosts with an in-person type are in that state and
   * they must go on switching meetings to online as they do today.
   */
  private static async resolveOnlineScheduleId(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('meeting_types')
        .select('schedule_id')
        .eq('host_profile_id', hostProfileId)
        .eq('location_mode', 'online')
        .eq('is_active', true);
      if (error) {
        console.warn(`${LOG_PREFIX} online schedule lookup failed:`, error.message);
        return null;
      }
      return pickOnlineScheduleId((data ?? []) as Array<{ schedule_id?: string | null }>);
    } catch (err) {
      console.warn(`${LOG_PREFIX} online schedule lookup threw for ${hostProfileId}:`, err);
      return null;
    }
  }

  /**
   * The meeting type to resolve AVAILABILITY with when the booking is becoming
   * (or already is) a video call.
   *
   * A copy of the real type with one field swapped: `schedule_id` points at the
   * host's online schedule. Nothing is written — meeting_type_id on the booking
   * is untouched, which is the whole design — and every other property the slot
   * engine reads (duration, buffers, notice, interval) still comes from the
   * type the visitor actually booked.
   *
   * Returns the type UNCHANGED when there is no online schedule to move to, or
   * when the type already sits on it. Both mean "today's behaviour", and the
   * identity of the returned object is what callers use to tell that apart.
   */
  private static async onlineAvailabilityType(
    supabase: SupabaseClient,
    mt: NativeMeetingType,
  ): Promise<NativeMeetingType> {
    const scheduleId = await this.resolveOnlineScheduleId(supabase, mt.host_profile_id);
    if (!scheduleId || scheduleId === mt.schedule_id) return mt;
    return { ...mt, schedule_id: scheduleId };
  }

  /** Decision 7: block on a missing/broken connection and NAME the reason. */
  private static async connectionIsUsable(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<boolean> {
    const conn = await GoogleCalendarService.getConnection(supabase, hostProfileId);
    return conn?.status === 'active';
  }

  // ── (A) host switches directly ────────────────────────────────────────────

  /**
   * The host turns their own face-to-face booking into a Google Meet, and may
   * move it at the same time (decision 5).
   *
   * @param auth.actorProfileId the SIGNED-IN user, resolved server-side by the
   *   caller. Never accepted from a request body.
   */
  static async switchToOnline(
    supabase: SupabaseClient,
    uid: string,
    auth: { actorProfileId?: string | null },
    opts: { newStart?: string | null; now?: Date } = {},
  ): Promise<ModeSwitchResult> {
    const booking = await this.loadBooking(supabase, uid);
    if (!booking) return { ok: false, error: 'NOT_FOUND' };

    if (!(await this.callerIsHost(supabase, booking, auth.actorProfileId))) {
      return { ok: false, error: 'FORBIDDEN' };
    }
    return this.applySwitch(supabase, booking, {
      newStart: opts.newStart ?? null,
      now: opts.now,
      switchedBy: 'host',
    });
  }

  // ── (B) visitor asks; the host must approve ───────────────────────────────

  /**
   * A visitor asks for the meeting to become online. Decision 4: this NEVER
   * takes effect on its own — it only records a pending request.
   *
   * Authorisation is the booking's cancel_token and nothing else, exactly like
   * the existing public reschedule route. Deliberately no writes to
   * location_mode_override, start_time, end_time or video_url here.
   */
  static async requestSwitchToOnline(
    supabase: SupabaseClient,
    uid: string,
    cancelToken: string,
    opts: { newStart?: string | null; now?: Date } = {},
  ): Promise<ModeSwitchResult> {
    const booking = await this.loadBooking(supabase, uid);
    // Same opaque answer for unknown uid and wrong token — a distinguishable
    // error would confirm a uid exists to someone holding neither.
    if (!booking || !cancelToken || booking.cancel_token !== cancelToken) {
      return { ok: false, error: 'NOT_FOUND' };
    }
    if (booking.status !== 'confirmed') return { ok: false, error: 'NOT_FOUND' };

    const mt = await NativeSchedulingService.getMeetingType(supabase, booking.meeting_type_id);
    if (!mt) return { ok: false, error: 'NOT_FOUND' };

    const source = switchSourceMode(mt.location_mode, booking.location_mode_override);
    if (source === 'online') return { ok: false, error: 'ALREADY_ONLINE' };
    if (source !== 'switchable') return { ok: false, error: 'UNSUPPORTED_SOURCE_MODE' };

    const now = opts.now ?? new Date();
    // Decision C, first of the two checks. The second runs at approval.
    if (!isSwitchAllowedNow(booking.start_time, mt.min_notice_min, now)) {
      return { ok: false, error: 'TOO_LATE' };
    }

    // Decision 7 is checked here too, so a visitor is told the real reason at
    // the moment they ask rather than after a host approval that cannot land.
    if (!(await this.connectionIsUsable(supabase, booking.host_profile_id))) {
      return { ok: false, error: 'CALENDAR_NOT_CONNECTED' };
    }

    let requestedStart: string | null = null;
    if (opts.newStart) {
      // What the visitor is asking for is an ONLINE meeting, so the time they
      // pick has to be one the host's online hours offer — not one their
      // face-to-face hours do. Checking it here as well as at approval means a
      // visitor is refused at the moment they ask rather than after a host
      // approval that could not land.
      const availabilityType = await this.onlineAvailabilityType(supabase, mt);
      const ctx = await NativeSchedulingService.resolveMoveContext(supabase, availabilityType, {
        newStartIso: opts.newStart,
        exclude: { start: booking.start_time, end: booking.end_time },
        now,
      });
      if (!ctx.ok) return { ok: false, error: 'INVALID_SLOT' };
      requestedStart = ctx.startIso ?? null;
    }

    const { error: upErr } = await supabase
      .from('meeting_bookings')
      .update({
        mode_switch_requested_by: 'attendee',
        mode_switch_requested_at: now.toISOString(),
        mode_switch_requested_start: requestedStart,
        mode_switch_request_status: 'pending',
      })
      .eq('id', booking.id)
      .eq('status', 'confirmed');
    if (upErr) {
      console.error(`${LOG_PREFIX} request write failed:`, upErr.message);
      return { ok: false, error: 'INTERNAL' };
    }

    return {
      ok: true,
      data: {
        uid,
        start: booking.start_time,
        end: booking.end_time,
        pending: true,
      },
    };
  }

  /**
   * The host approves or declines a visitor's pending request.
   *
   * Approval re-runs the notice check against the CURRENT clock (decision C):
   * a request made on Monday and approved on Thursday must not move a Tuesday
   * meeting. An already-expired request is refused as NO_REQUEST — decision B
   * says an expired request reads as declined, so approving one is a no-op.
   */
  static async resolveSwitchRequest(
    supabase: SupabaseClient,
    uid: string,
    auth: { actorProfileId?: string | null },
    decision: 'approve' | 'decline',
    opts: { now?: Date } = {},
  ): Promise<ModeSwitchResult> {
    const booking = await this.loadBooking(supabase, uid);
    if (!booking) return { ok: false, error: 'NOT_FOUND' };
    if (!(await this.callerIsHost(supabase, booking, auth.actorProfileId))) {
      return { ok: false, error: 'FORBIDDEN' };
    }

    const mt = await NativeSchedulingService.getMeetingType(supabase, booking.meeting_type_id);
    if (!mt) return { ok: false, error: 'NOT_FOUND' };

    const now = opts.now ?? new Date();
    const state = switchRequestState(booking, mt.min_notice_min, now);

    if (decision === 'decline') {
      // An expired request is declined-by-reading already; writing the same
      // outcome makes it explicit and is safe either way.
      if (state === 'none') return { ok: false, error: 'NO_REQUEST' };
      const { error } = await supabase
        .from('meeting_bookings')
        .update(resolvedRequestPatch('declined'))
        .eq('id', booking.id);
      if (error) {
        console.error(`${LOG_PREFIX} decline write failed:`, error.message);
        return { ok: false, error: 'INTERNAL' };
      }
      return { ok: true, data: { uid, start: booking.start_time, end: booking.end_time } };
    }

    if (state !== 'pending') return { ok: false, error: 'NO_REQUEST' };

    return this.applySwitch(supabase, booking, {
      newStart: booking.mode_switch_requested_start,
      now,
      switchedBy: 'attendee',
      fromRequest: true,
    });
  }

  // ── (C) host turns a video meeting back ───────────────────────────────────

  /**
   * The host turns their own video meeting back into a face-to-face or phone
   * one (ruling 2, 2026-08-21).
   *
   * HOST ONLY, and that is the whole point of the ruling: the person who owns
   * the room and the calendar decides. A visitor may still ASK to go online
   * (requestSwitchToOnline) but has no path in here at all — there is
   * deliberately no cancel_token overload on this method, so a visitor has
   * nothing to call.
   *
   * Turning back means CLEARING location_mode_override; the column's CHECK
   * already admits NULL, so no migration is involved. A booking that is online
   * because its TYPE is online cannot be pulled out one booking at a time and
   * is refused with ONLINE_BY_TYPE rather than a misleading failure.
   *
   * The meeting is never MOVED by this: switching back is mode-only, so
   * reschedule_count, rescheduled_at and previous_start_time are untouched
   * (craft decision A, in this direction too).
   *
   * All-or-nothing, same discipline as the forward switch and the same order —
   * claim the row first (it is the race arbiter), then Google. If Google
   * refuses, the row is put back exactly as it was and nothing was changed. If
   * that restore ALSO fails, the caller is told GOOGLE_OUT_OF_SYNC rather than
   * "nothing was changed", which would not be true: the booking would read
   * face-to-face while the calendar event still carries the video call.
   */
  static async switchBackFromOnline(
    supabase: SupabaseClient,
    uid: string,
    auth: { actorProfileId?: string | null },
    opts: { now?: Date } = {},
  ): Promise<ModeSwitchResult> {
    const booking = await this.loadBooking(supabase, uid);
    if (!booking) return { ok: false, error: 'NOT_FOUND' };

    if (!(await this.callerIsHost(supabase, booking, auth.actorProfileId))) {
      return { ok: false, error: 'FORBIDDEN' };
    }
    if (booking.status !== 'confirmed') return { ok: false, error: 'NOT_FOUND' };

    const mt = await NativeSchedulingService.getMeetingType(supabase, booking.meeting_type_id);
    if (!mt) return { ok: false, error: 'NOT_FOUND' };

    const state = switchBackState(mt.location_mode, booking.location_mode_override);
    if (state === 'online_by_type') return { ok: false, error: 'ONLINE_BY_TYPE' };
    if (state !== 'switchable') return { ok: false, error: 'NOT_ONLINE' };

    const now = opts.now ?? new Date();
    // The same cut-off as going online (decision 8), and it matters MORE in
    // this direction: someone told an hour beforehand that a video call is now
    // in person may have to travel to it.
    if (!isSwitchAllowedNow(booking.start_time, mt.min_notice_min, now)) {
      return { ok: false, error: 'TOO_LATE' };
    }

    // Decision 7 again: without a live connection the conferencing cannot be
    // stripped, so the two systems would disagree the moment the row cleared.
    // Name the real reason instead.
    if (!(await this.connectionIsUsable(supabase, booking.host_profile_id))) {
      return { ok: false, error: 'CALENDAR_NOT_CONNECTED' };
    }

    // No move here, so this call only resolves the timezone the email renders
    // its times in — the same use the forward path makes of it.
    //
    // Deliberately the ORIGINAL type, NOT the online schedule the forward
    // switch used. This booking is going back to the mode its type describes,
    // so the hours (and the timezone the visitor is written to about) are that
    // type's own again. Reading the online schedule here would render the times
    // in the zone of a meeting that is no longer happening online.
    const ctx = await NativeSchedulingService.resolveMoveContext(supabase, mt, {
      newStartIso: null,
      exclude: { start: booking.start_time, end: booking.end_time },
      now,
    });
    if (!ctx.ok) return { ok: false, error: 'INTERNAL' };
    const timezone = ctx.timezone ?? 'Asia/Kolkata';

    // ── claim the row ───────────────────────────────────────────────────────
    // Only the two columns the forward switch wrote. The concurrent-move guard
    // is the same one rescheduleBooking and applySwitch use.
    const { data: claimed, error: claimErr } = await supabase
      .from('meeting_bookings')
      .update({ location_mode_override: null, video_url: null })
      .eq('id', booking.id)
      .eq('status', 'confirmed')
      .eq('start_time', booking.start_time)
      .select('id')
      .maybeSingle();
    if (claimErr) {
      console.error(`${LOG_PREFIX} switch-back claim failed:`, claimErr.message);
      return { ok: false, error: 'INTERNAL' };
    }
    if (!claimed) return { ok: false, error: 'SLOT_TAKEN' };

    // ── Google: strip the conferencing back off ─────────────────────────────
    // A booking with no google_event_id has nothing that can go out of sync, so
    // the Google half is a no-op success — the same reading revertBoth takes.
    let stripped: boolean;
    try {
      stripped = booking.google_event_id
        ? await GoogleCalendarService.revertEventFromOnline(
            supabase,
            booking.host_profile_id,
            booking.google_event_id,
          )
        : true;
    } catch (err) {
      console.error(`${LOG_PREFIX} google revert threw for ${booking.uid}:`, err);
      stripped = false;
    }

    if (!stripped) {
      // The PATCH never applied, so Google is unchanged and putting the row
      // back makes the two systems agree again.
      const restored = await this.restoreOnline(supabase, booking);
      return { ok: false, error: restored ? 'GOOGLE_FAILED' : 'GOOGLE_OUT_OF_SYNC' };
    }

    // ── notify ──────────────────────────────────────────────────────────────
    // One email, exactly as decision 9 promises in the other direction. The
    // visitor's calendar entry was already corrected in place by sendUpdates=all
    // on the revert above, so this is not a cancellation and not a re-invite.
    const { data: host } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', booking.host_profile_id)
      .maybeSingle();
    const hostRow = (host ?? {}) as { full_name?: string; email?: string };

    // What it went BACK to is the type's own mode, read with the override gone.
    // switchBackState already ruled out an online TYPE, so 'online' is
    // unreachable here — narrowed rather than cast so the compiler agrees.
    const backTo =
      effectiveLocationMode(mt.location_mode, null) === 'phone' ? 'phone' : 'in_person';

    await MeetingBookingEmailService.sendBookingSwitchedBackEmails({
      uid: booking.uid,
      meetingTitle: mt.title,
      durationMin: mt.duration_min,
      timezone,
      startTime: booking.start_time,
      hostName: hostRow.full_name ?? hostRow.email ?? '',
      hostEmail: hostRow.email ?? '',
      attendeeName: booking.attendee_name ?? '',
      attendeeEmail: booking.attendee_email ?? '',
      attendeePhone: null,
      locationMode: backTo,
      locationText: mt.location_text,
      videoUrl: null,
    });

    return {
      ok: true,
      data: {
        uid: booking.uid,
        start: booking.start_time,
        end: booking.end_time,
        videoUrl: null,
        timeMoved: false,
      },
    };
  }

  // ── the switch itself ─────────────────────────────────────────────────────

  /**
   * Claim → Google → finalise-or-revert. See the file header for why this
   * order. `switchedBy` only labels the email; it never grants anything.
   */
  private static async applySwitch(
    supabase: SupabaseClient,
    booking: BookingRow,
    opts: {
      newStart: string | null;
      now?: Date;
      switchedBy: 'attendee' | 'host';
      fromRequest?: boolean;
    },
  ): Promise<ModeSwitchResult> {
    if (booking.status !== 'confirmed') return { ok: false, error: 'NOT_FOUND' };

    const mt = await NativeSchedulingService.getMeetingType(supabase, booking.meeting_type_id);
    if (!mt) return { ok: false, error: 'NOT_FOUND' };

    // In person OR phone -> online (ruling 1, 2026-08-21). A mode this feature
    // has never been decided for is still refused with its own code rather than
    // ALREADY_ONLINE, which would be untrue.
    const source = switchSourceMode(mt.location_mode, booking.location_mode_override);
    if (source === 'online') return { ok: false, error: 'ALREADY_ONLINE' };
    if (source !== 'switchable') return { ok: false, error: 'UNSUPPORTED_SOURCE_MODE' };

    const now = opts.now ?? new Date();
    if (!isSwitchAllowedNow(booking.start_time, mt.min_notice_min, now)) {
      return { ok: false, error: 'TOO_LATE' };
    }

    // Decision 7 — block, and name the real reason. Without a live connection
    // there is no way to mint a Meet link at all, so failing here is honest
    // rather than switching the mode and leaving the meeting unjoinable.
    if (!(await this.connectionIsUsable(supabase, booking.host_profile_id))) {
      return { ok: false, error: 'CALENDAR_NOT_CONNECTED' };
    }
    if (!booking.google_event_id) return { ok: false, error: 'NO_CALENDAR_EVENT' };

    // The meeting is BECOMING a video call, so both the timezone it is shown in
    // and the slot it is validated against belong to the host's online hours,
    // not to the in-person type it was booked under. Identical to `mt` for a
    // host who has no online schedule, which is most of them.
    const availabilityType = await this.onlineAvailabilityType(supabase, mt);

    // Resolve the timezone (always) and re-validate the new slot (only when
    // the switch also moves the meeting).
    const ctx = await NativeSchedulingService.resolveMoveContext(supabase, availabilityType, {
      newStartIso: opts.newStart ?? null,
      exclude: { start: booking.start_time, end: booking.end_time },
      now,
    });
    if (!ctx.ok) {
      return { ok: false, error: ctx.error === 'INVALID_SLOT' ? 'INVALID_SLOT' : 'INTERNAL' };
    }
    const timezone = ctx.timezone ?? 'Asia/Kolkata';

    // Compare INSTANTS, not strings: Postgres hands back '2026-09-01T04:30:00+00:00'
    // while resolveMoveContext returns '2026-09-01T04:30:00.000Z'. String-comparing
    // those would read an unchanged time as a move and wrongly bump reschedule_count.
    const timeMoved = !!(
      ctx.startIso && new Date(ctx.startIso).getTime() !== new Date(booking.start_time).getTime()
    );
    const startIso = timeMoved ? (ctx.startIso as string) : booking.start_time;
    const endIso = timeMoved ? (ctx.endIso as string) : booking.end_time;

    // ── the mode-only switch, and the one thing it cannot check for itself ──
    // A switch that keeps the time skips slot re-validation on purpose (craft
    // decision A, below): re-validating would mean moving, and moving would
    // wrongly bump reschedule_count for something that never moved. That gap
    // stays. What closes here is the SILENCE around it — a meeting can now
    // become online at a time the host's online hours do not offer, and the
    // host was never told. Ask the question, keep the meeting where it is, and
    // hand the answer back as a warning.
    //
    // Only asked when there is a different schedule to ask about; a host with
    // no online schedule has no online hours to fall outside of. INVALID_SLOT
    // is the only answer that warns — NO_SCHEDULE and a thrown lookup mean we
    // could not tell, and "we could not tell" must not be shown as "you are
    // outside your hours".
    let outsideOnlineHours: boolean | undefined;
    if (!timeMoved && availabilityType !== mt) {
      const check = await NativeSchedulingService.resolveMoveContext(supabase, availabilityType, {
        newStartIso: booking.start_time,
        exclude: { start: booking.start_time, end: booking.end_time },
        now,
      });
      if (!check.ok && check.error === 'INVALID_SLOT') outsideOnlineHours = true;
    }

    // ── step 3: claim the row ───────────────────────────────────────────────
    // A host who switches DIRECTLY while a visitor request is open has, in
    // effect, granted it — settling it here stops a pending badge outliving the
    // thing it asked for (the second attempt would be refused ALREADY_ONLINE,
    // so nothing else would ever clear it).
    const settlesRequest = opts.fromRequest || booking.mode_switch_request_status === 'pending';
    const patch: Record<string, unknown> = {
      location_mode_override: 'online',
      ...(settlesRequest ? resolvedRequestPatch('approved') : {}),
    };
    // Craft decision A: reschedule_count means "times the slot moved". A
    // mode-only switch must not touch it, rescheduled_at or previous_start_time.
    if (timeMoved) {
      patch.start_time = startIso;
      patch.end_time = endIso;
      patch.previous_start_time = booking.start_time;
      patch.rescheduled_at = now.toISOString();
      patch.reschedule_count = (booking.reschedule_count ?? 0) + 1;
    }

    const { data: claimed, error: claimErr } = await supabase
      .from('meeting_bookings')
      .update(patch)
      .eq('id', booking.id)
      .eq('status', 'confirmed')
      .eq('start_time', booking.start_time) // concurrent-move guard
      .select('id')
      .maybeSingle();
    if (claimErr) {
      // 23P01 = mb_no_double_booking, the gist exclusion constraint.
      if (claimErr.code === '23P01') return { ok: false, error: 'SLOT_TAKEN' };
      console.error(`${LOG_PREFIX} claim failed:`, claimErr.message);
      return { ok: false, error: 'INTERNAL' };
    }
    // Someone else moved or cancelled it between our read and our write.
    if (!claimed) return { ok: false, error: 'SLOT_TAKEN' };

    // ── step 4: Google, in one call ─────────────────────────────────────────
    let patched: { ok: boolean; meetUrl: string | null };
    try {
      patched = await GoogleCalendarService.patchEventToOnline(
        supabase,
        booking.host_profile_id,
        booking.google_event_id,
        timeMoved ? { startIso, endIso, timezone } : {},
      );
    } catch (err) {
      console.error(`${LOG_PREFIX} google patch threw for ${booking.uid}:`, err);
      patched = { ok: false, meetUrl: null };
    }

    // The two failure shapes are NOT the same and must not be handled together.
    //
    // (a) The PATCH failed. Google was never changed, so restoring the row puts
    //     the two systems back in agreement and nobody has been told anything.
    if (!patched.ok) {
      await this.revert(supabase, booking);
      return { ok: false, error: 'GOOGLE_FAILED' };
    }

    // (b) The PATCH SUCCEEDED but carried no Meet link. Google IS changed —
    //     the event now has conferencing and, when moving, the new time, and
    //     sendUpdates=all has already emailed the visitor. Reverting only the
    //     database here would leave Google online while the booking says
    //     in-person, with the visitor told about a change that did not happen.
    let meetUrl = patched.meetUrl;
    if (!meetUrl) {
      // Re-read once. Google routinely provisions conferenceData a moment after
      // the PATCH returns, so the commonest cause of an empty link is that we
      // asked too early — not that conferencing failed.
      const fresh = await GoogleCalendarService.getEvent(
        supabase,
        booking.host_profile_id,
        booking.google_event_id,
      );
      if (fresh && typeof fresh === 'object' && fresh.meetUrl) meetUrl = fresh.meetUrl;
    }

    if (!meetUrl) {
      // Decision D: no link is a FAILURE, and now the rollback must reach BOTH
      // systems, because Google is the one already carrying the change.
      const undone = await this.revertBoth(supabase, booking, timeMoved, timezone);
      return { ok: false, error: undone ? 'NO_MEET_LINK' : 'GOOGLE_OUT_OF_SYNC' };
    }

    // ── step 5: record the link ─────────────────────────────────────────────
    const { error: linkErr } = await supabase
      .from('meeting_bookings')
      .update({ video_url: meetUrl })
      .eq('id', booking.id);
    if (linkErr) {
      // Same shape as the no-link branch above: Google already has the
      // conferencing and the visitor already has the mail, so rolling back only
      // the row would leave the calendar online and the booking in-person.
      console.error(`${LOG_PREFIX} link write-back failed:`, linkErr.message);
      const undone = await this.revertBoth(supabase, booking, timeMoved, timezone);
      return { ok: false, error: undone ? 'INTERNAL' : 'GOOGLE_OUT_OF_SYNC' };
    }

    // ── notify ──────────────────────────────────────────────────────────────
    // Decision 9: the visitor's CALENDAR entry was already updated in place by
    // sendUpdates=all on the patch above. This is the ONE email — never a
    // cancellation followed by a reinvite.
    const { data: host } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', booking.host_profile_id)
      .maybeSingle();
    const hostRow = (host ?? {}) as { full_name?: string; email?: string };

    await MeetingBookingEmailService.sendBookingSwitchedToOnlineEmails({
      uid: booking.uid,
      meetingTitle: mt.title,
      durationMin: mt.duration_min,
      timezone,
      startTime: startIso,
      previousStartTime: timeMoved ? booking.start_time : null,
      hostName: hostRow.full_name ?? hostRow.email ?? '',
      hostEmail: hostRow.email ?? '',
      attendeeName: booking.attendee_name ?? '',
      attendeeEmail: booking.attendee_email ?? '',
      attendeePhone: null,
      locationMode: 'online',
      videoUrl: meetUrl,
      switchedBy: opts.switchedBy,
    });

    return {
      ok: true,
      data: {
        uid: booking.uid,
        start: startIso,
        end: endIso,
        videoUrl: meetUrl,
        timeMoved,
        outsideOnlineHours,
      },
    };
  }

  /**
   * Roll back BOTH systems after a Google PATCH that already landed.
   *
   * Order matters and is fixed here so no caller can get it wrong: Google is
   * undone FIRST, because it is the system already carrying the change (and the
   * one that has already emailed the visitor). The row is restored either way —
   * a booking left flagged online with no usable link is the exact state
   * decision 6 exists to prevent, so it is never the thing we keep.
   *
   * Returns whether Google could be reconciled. `false` means the two systems
   * now disagree in a known, logged way: the booking reads in-person while the
   * calendar event may still show a video call. The caller surfaces that as
   * GOOGLE_OUT_OF_SYNC so the host is told to check the event, rather than
   * being handed a "nothing was changed" message that is not true.
   */
  private static async revertBoth(
    supabase: SupabaseClient,
    booking: BookingRow,
    timeMoved: boolean,
    timezone: string,
  ): Promise<boolean> {
    const undone = booking.google_event_id
      ? await GoogleCalendarService.revertEventFromOnline(
          supabase,
          booking.host_profile_id,
          booking.google_event_id,
          timeMoved ? { startIso: booking.start_time, endIso: booking.end_time, timezone } : {},
        )
      : true;
    await this.revert(supabase, booking);
    if (!undone) {
      console.error(
        `${LOG_PREFIX} GOOGLE ROLLBACK FAILED for ${booking.uid}` +
          ` (google_event_id=${booking.google_event_id}) — the event may still carry` +
          ` conferencing while the booking reads in-person; needs manual attention`,
      );
    }
    return undone;
  }

  /**
   * Undo a switch-BACK claim: put the override and the Meet link back.
   *
   * Only the two columns switchBackFromOnline wrote, restored from the row read
   * before the claim. Unlike revert() below this RETURNS whether it worked,
   * because the caller has to tell the truth about the outcome: a failure here
   * leaves the booking reading face-to-face while the calendar event still
   * carries the video call, which is GOOGLE_OUT_OF_SYNC and not "nothing was
   * changed".
   */
  private static async restoreOnline(
    supabase: SupabaseClient,
    booking: BookingRow,
  ): Promise<boolean> {
    const { error } = await supabase
      .from('meeting_bookings')
      .update({
        location_mode_override: booking.location_mode_override,
        video_url: booking.video_url,
      })
      .eq('id', booking.id);
    if (error) {
      console.error(`${LOG_PREFIX} SWITCH-BACK ROLLBACK FAILED for ${booking.uid}:`, error.message);
      return false;
    }
    return true;
  }

  /**
   * Put the booking back exactly as it was (decision 6). Values come from the
   * row we read before the claim, so this restores rather than guesses —
   * including reschedule_count, which a mode-only switch never touched.
   */
  private static async revert(supabase: SupabaseClient, booking: BookingRow): Promise<void> {
    const { error } = await supabase
      .from('meeting_bookings')
      .update({
        location_mode_override: booking.location_mode_override,
        start_time: booking.start_time,
        end_time: booking.end_time,
        previous_start_time: booking.previous_start_time,
        rescheduled_at: booking.rescheduled_at,
        reschedule_count: booking.reschedule_count ?? 0,
        video_url: booking.video_url,
        mode_switch_request_status: booking.mode_switch_request_status,
        mode_switch_requested_start: booking.mode_switch_requested_start,
      })
      .eq('id', booking.id);
    if (error) {
      // Loud: the booking is now online-flagged with no Meet link, which is
      // precisely the state decision 6 exists to prevent.
      console.error(`${LOG_PREFIX} ROLLBACK FAILED for ${booking.uid}:`, error.message);
    }
  }
}

