// lib/services/meetings/host-scheduling-service.ts
//
// HOST-INITIATED scheduling — the host picks a time and the people, instead of
// publishing a meeting type and waiting for someone to book it.
//
// Everything else in this module is pull: /meet/[handle] and /embed/[handle]
// let a guest choose a slot. There was no push, so a host who simply wanted to
// put a meeting in front of three people had to leave MyJKKN entirely. That is
// the gap this closes.
//
// It deliberately reuses the shape the accountability engine already proved in
// meeting-trigger-service.ts (~L3049-3230), which has been booking guest-less
// group meetings on production since 2026-08-13:
//
//   • meeting_bookings.meeting_type_id is NULLABLE, so a one-off meeting needs
//     no meeting type invented for it.
//   • A GROUP meeting stores its PRIMARY attendee on the row and the full
//     participant list in `answers` — every invitee still lands on the Google
//     event, so nobody is dropped.
//   • Google + email are BEST EFFORT and run after the row is committed. A
//     provider outage must never lose a meeting the host was told was booked.
//
// The one thing done differently: the trigger engine walks forward to the next
// free slot on a collision, because nobody chose its time. Here the HOST chose
// the time, so a collision is reported (SLOT_TAKEN) and never silently moved —
// quietly relocating someone's meeting is worse than telling them it clashed.

import crypto from 'crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { MeetingBookingEmailService } from '@/lib/services/email/meeting-booking-email-service';
import { GoogleCalendarService } from '@/lib/services/integrations/google-calendar-service';

const LOG_PREFIX = '[host-scheduling]';

/** Everything on this campus runs in one timezone. */
export const CAMPUS_TZ = 'Asia/Kolkata';

/** Marks these rows apart from 'meet-page' (guest) and 'trigger-engine' (auto). */
export const HOST_DIRECT_SOURCE = 'host-direct';

export type HostMeetingLocationMode = 'in_person' | 'phone' | 'online';

export interface ScheduleAttendee {
  email: string;
  name: string;
  /** Set when the attendee is a known MyJKKN person; null for a typed address. */
  profileId?: string | null;
}

export interface ScheduleDirectInput {
  hostProfileId: string;
  title: string;
  /** ISO instant the meeting starts. */
  startIso: string;
  durationMin: number;
  locationMode: HostMeetingLocationMode;
  /** Where, for an in-person meeting. Ignored for phone/online. */
  locationText?: string | null;
  /** Free text the host wants the invitees to see in the invitation. */
  note?: string | null;
  attendees: ScheduleAttendee[];
  timezone?: string;
  /**
   * The personal key that booked this through the outside-AI door, if any.
   * Stamped into answers.booked_via_key_id so that key (and only that key) can
   * later cancel or move this meeting. The Schedule page never sets it.
   */
  bookedViaKeyId?: string | null;
}

export interface ScheduleDirectResult {
  uid: string;
  bookingId: string;
  startIso: string;
  endIso: string;
  videoUrl: string | null;
  googleEventId: string | null;
  /**
   * Set when the meeting IS booked but the calendar/invite step did not fully
   * succeed. The caller must surface this — a silent partial success is how a
   * host ends up believing invitations went out when they did not.
   */
  warning: string | null;
}

export type ScheduleFailureCode = 'SLOT_TAKEN' | 'VALIDATION' | 'UNKNOWN';

export interface ScheduleDirectFailure {
  code: ScheduleFailureCode;
  message: string;
}

/**
 * Flat optional-field shape, NOT a discriminated union — the repo compiles with
 * `strictNullChecks: false`, under which TypeScript will not narrow `ok: true |
 * false` and every `res.data` access after an `if (res.ok)` guard errors. Same
 * reasoning (and same shape) as ActionResult in meetings/manage/actions.ts.
 */
export interface ScheduleDirectOutcome {
  ok: boolean;
  data?: ScheduleDirectResult;
  error?: ScheduleDirectFailure;
}

/** Same shape the rest of the module uses; deliberately permissive. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateScheduleInput(
  input: ScheduleDirectInput,
): ScheduleDirectFailure | null {
  if (!input.title?.trim()) {
    return { code: 'VALIDATION', message: 'Give the meeting a title.' };
  }
  if (!Number.isFinite(input.durationMin) || input.durationMin <= 0) {
    return { code: 'VALIDATION', message: 'Choose how long the meeting runs.' };
  }
  const start = new Date(input.startIso);
  if (Number.isNaN(start.getTime())) {
    return { code: 'VALIDATION', message: 'That date and time could not be read.' };
  }
  if (!input.attendees?.length) {
    return { code: 'VALIDATION', message: 'Add at least one person to meet.' };
  }

  const seen = new Set<string>();
  for (const a of input.attendees) {
    const email = (a.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return {
        code: 'VALIDATION',
        message: `"${a.email}" does not look like an email address.`,
      };
    }
    // A duplicate address would invite the same person twice and make the
    // participant count on the row disagree with the calendar invite.
    if (seen.has(email)) {
      return { code: 'VALIDATION', message: `${email} is on the list twice.` };
    }
    seen.add(email);
  }

  // An in-person meeting with no place tells the invitee to go nowhere.
  if (input.locationMode === 'in_person' && !input.locationText?.trim()) {
    return { code: 'VALIDATION', message: 'Say where the meeting happens.' };
  }
  return null;
}

/** Dedupe + normalise, preserving the order the host entered people in. */
function normaliseAttendees(attendees: ScheduleAttendee[]): ScheduleAttendee[] {
  const seen = new Set<string>();
  const out: ScheduleAttendee[] = [];
  for (const a of attendees) {
    const email = (a.email ?? '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: (a.name ?? '').trim() || email, profileId: a.profileId ?? null });
  }
  return out;
}

export interface MoveDirectInput {
  uid: string;
  /** Must be the meeting's host; the caller has proven it is the signed-in owner. */
  hostProfileId: string;
  startIso: string;
  durationMin: number;
  /**
   * The start and end the caller validated against. When given, the move
   * happens only if the meeting is still exactly there, so a concurrent change
   * (another move, or an end dragged in Google) cannot slip past the caller's
   * checks.
   */
  expectedStartIso?: string;
  expectedEndIso?: string;
}

export type MoveFailureCode =
  | 'NOT_FOUND'
  | 'SLOT_TAKEN'
  | 'CALENDAR_FAILED'
  | 'CANCELLED_MEANWHILE'
  | 'CHANGED_MEANWHILE'
  | 'UNKNOWN';

/** Flat shape for the same strictNullChecks reason as ScheduleDirectOutcome. */
export interface MoveDirectOutcome {
  ok: boolean;
  data?: { uid: string; startIso: string; endIso: string; previousStartIso: string; videoUrl: string | null };
  error?: { code: MoveFailureCode; message: string };
  /** Set when the meeting moved but a follow-on step (the old time could not be restored) needs a person. */
  warning?: string | null;
  /**
   * On an UNKNOWN failure: true when the move's update may have reached the
   * database (its answer was lost), so the caller must not treat it as
   * "nothing changed".
   */
  mayHaveChanged?: boolean;
}

export class HostSchedulingService {
  /**
   * Book a meeting the HOST initiated.
   *
   * `supabase` must be a SERVICE-ROLE client: this writes meeting_bookings for
   * the host and reads profiles for attendees the host may not otherwise be
   * able to select. The caller is responsible for having proven the signed-in
   * user IS `hostProfileId` — this method never re-checks that.
   */
  static async scheduleDirect(
    supabase: SupabaseClient,
    input: ScheduleDirectInput,
  ): Promise<ScheduleDirectOutcome> {
    const invalid = validateScheduleInput(input);
    if (invalid) return { ok: false, error: invalid };

    const attendees = normaliseAttendees(input.attendees);
    const timezone = input.timezone || CAMPUS_TZ;
    const startIso = new Date(input.startIso).toISOString();
    const endIso = new Date(
      new Date(startIso).getTime() + input.durationMin * 60_000,
    ).toISOString();
    const uid = crypto.randomBytes(16).toString('base64url');

    // The host's institution scopes the row the same way a guest booking is
    // scoped. A host with no institution on their profile still books; the
    // column is nullable and a null is honest about what we know.
    const { data: hostProfile } = await supabase
      .from('profiles')
      .select('institution_id, full_name, email')
      .eq('id', input.hostProfileId)
      .maybeSingle();

    const primary = attendees[0];
    const others = attendees.slice(1);

    const { data: inserted, error: insErr } = await (supabase as any)
      .from('meeting_bookings')
      .insert({
        uid,
        // No meeting type: this meeting exists only as itself.
        meeting_type_id: null,
        host_profile_id: input.hostProfileId,
        institution_id: (hostProfile as any)?.institution_id ?? null,
        attendee_name: primary.name,
        attendee_email: primary.email,
        attendee_profile_id: primary.profileId ?? null,
        answers: {
          scheduled_by_host: true,
          title: input.title.trim(),
          note: input.note?.trim() || null,
          location_mode: input.locationMode,
          location_text:
            input.locationMode === 'in_person' ? input.locationText?.trim() || null : null,
          // EVERY invitee, primary included — the row's attendee_* columns hold
          // only one person, so this is the only complete record of who was
          // invited. Read this, not attendee_email, to answer "who was in it".
          participants: attendees.map((a) => ({
            email: a.email,
            name: a.name,
            profile_id: a.profileId ?? null,
          })),
          participant_profile_ids: attendees
            .map((a) => a.profileId)
            .filter((id): id is string => Boolean(id)),
          ...(input.bookedViaKeyId ? { booked_via_key_id: input.bookedViaKeyId } : {}),
        },
        start_time: startIso,
        end_time: endIso,
        status: 'confirmed',
        source: HOST_DIRECT_SOURCE,
      })
      .select('id')
      .single();

    if (insErr || !inserted) {
      const code = (insErr as any)?.code;
      // 23P01 = mb_no_double_booking (gist exclusion over host + time range).
      // 23505 covers any unique index that might be added later.
      if (code === '23P01' || code === '23505') {
        return {
          ok: false,
          error: {
            code: 'SLOT_TAKEN',
            message:
              'You already have a meeting at that time. Pick another slot, or cancel the existing one first.',
          },
        };
      }
      console.error(`${LOG_PREFIX} booking insert failed:`, insErr?.message);
      return {
        ok: false,
        error: {
          code: 'UNKNOWN',
          message: insErr?.message ?? 'The meeting could not be saved.',
        },
      };
    }

    const bookingId = (inserted as any).id as string;

    // ── Everything below is best effort: the meeting is already real. ────────
    let videoUrl: string | null = null;
    let googleEventId: string | null = null;
    let warning: string | null = null;

    const conn = await GoogleCalendarService.getConnection(supabase, input.hostProfileId);
    if (conn?.status !== 'active') {
      warning =
        input.locationMode === 'online'
          ? 'The meeting is saved, but your Google Calendar is not connected — no Meet link was created and no invitations were sent. Connect it under Availability, then reschedule to send them.'
          : 'The meeting is saved, but your Google Calendar is not connected, so no invitations were sent.';
    } else {
      try {
        const event = await GoogleCalendarService.createEvent(
          supabase,
          input.hostProfileId,
          {
            summary: input.title.trim(),
            description: [
              `Scheduled by ${(hostProfile as any)?.full_name ?? 'your host'} in MyJKKN. Reference: ${uid}`,
              input.note?.trim() ? `\n${input.note.trim()}` : '',
              others.length
                ? `\nAlso invited: ${others.map((a) => a.name || a.email).join(', ')}`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
            startIso,
            endIso,
            timezone,
            attendees: attendees.map((a) => ({ email: a.email, displayName: a.name })),
            // Only ask Google for a Meet link when the meeting is actually online.
            withMeet: input.locationMode === 'online',
            location:
              input.locationMode === 'in_person'
                ? input.locationText?.trim() || undefined
                : undefined,
          },
        );

        if (event) {
          googleEventId = event.eventId;
          videoUrl = event.meetUrl;
          if (input.locationMode === 'online' && !event.meetUrl) {
            // The invite went out, so this is not a failure — but the host must
            // know there is no link to join, rather than discover it at the hour.
            warning =
              'Invitations were sent, but Google did not return a Meet link. Open the event in Google Calendar and add one.';
          }
        } else {
          warning =
            'The meeting is saved, but the calendar invitation could not be created. Invite the attendees yourself, or reschedule to try again.';
        }
      } catch (err) {
        // Deliberately NOT retried: createEvent supplies no client-side event id,
        // so a retry can produce a DUPLICATE event on everyone's calendar. Same
        // reasoning as meeting-trigger-service.ts.
        console.error(`${LOG_PREFIX} google event failed for ${uid}:`, err);
        warning =
          'The meeting is saved, but the calendar invitation could not be created. Invite the attendees yourself.';
      }
    }

    if (videoUrl || googleEventId) {
      const { error: updErr } = await (supabase as any)
        .from('meeting_bookings')
        .update({ video_url: videoUrl, google_event_id: googleEventId })
        .eq('id', bookingId);
      if (updErr) {
        console.error(`${LOG_PREFIX} link write-back failed for ${uid}:`, updErr.message);
      }
    }

    // Confirmation email per attendee. Non-throwing, and a no-op without
    // RESEND_API_KEY, so this can never fail the booking.
    let hostTold = false;
    for (const a of attendees) {
      // The host's copy is sent once per meeting (see moveDirect), counted as
      // sent only when it really went.
      const hostEmailOnce = hostTold ? '' : (((hostProfile as any)?.email as string | undefined) ?? '');
      try {
        const sent = await MeetingBookingEmailService.sendBookingConfirmedEmails({
          uid,
          meetingTitle: input.title.trim(),
          durationMin: input.durationMin,
          timezone,
          startTime: startIso,
          hostName:
            ((hostProfile as any)?.full_name as string | undefined) ??
            ((hostProfile as any)?.email as string | undefined) ??
            '',
          hostEmail: hostEmailOnce,
          attendeeName: a.name,
          attendeeEmail: a.email,
          locationMode: input.locationMode,
          locationText:
            input.locationMode === 'in_person' ? input.locationText?.trim() || null : null,
          videoUrl,
        });
        if (hostEmailOnce && (sent?.host?.success || sent?.host?.skipped)) hostTold = true;
      } catch (err) {
        console.error(`${LOG_PREFIX} confirmation email failed for ${a.email}:`, err);
      }
    }

    return {
      ok: true,
      data: { uid, bookingId, startIso, endIso, videoUrl, googleEventId, warning },
    };
  }

  /**
   * Move a meeting the host scheduled directly (no meeting type) IN PLACE: the
   * same booking, the same uid and the same Google Meet link, at a new time
   * (Director, 9 Oct 2026: "Keep the same link"). rescheduleBooking cannot do
   * this — it re-validates against a meeting type's schedule, and these
   * meetings have none.
   *
   * The rule: the database's answer is final, and the reply says exactly what
   * happened.
   *   1. ONE conditional update moves the row (status 'confirmed' and still at
   *      the start/end the caller checked). Zero rows = nothing changed. A clash
   *      with another meeting = SLOT_TAKEN (the gist exclusion, the same guard
   *      booking relies on; neither checks Google busy times).
   *   2. Google is patched (sendUpdates=all). 'refused' (4xx / never sent) puts
   *      the row back: nothing changed. 'unknown' (5xx / no answer) keeps the
   *      move and warns — Google may already have told the invitees.
   *   3. A held room follows; failure is a warning.
   *   4. One "moved" email per invitee, one to the host.
   *   Before every side effect and once at the end, the row is re-read: if a
   *   cancel or another move has landed, this move stops and its reply says
   *   what it had already done (CANCELLED_MEANWHILE / CHANGED_MEANWHILE).
   *
   * Only a meeting the SERVER marked host-direct (source + no type) qualifies.
   * `supabase` must be a SERVICE-ROLE client; the caller has proven the
   * signed-in user is `hostProfileId`.
   */
  static async moveDirect(supabase: SupabaseClient, input: MoveDirectInput): Promise<MoveDirectOutcome> {
    const { data: booking, error: readErr } = await (supabase as any)
      .from('meeting_bookings')
      .select(
        'id, uid, host_profile_id, status, start_time, end_time, meeting_type_id, source, google_event_id, video_url, venue_reservation_id, reschedule_count, previous_start_time, rescheduled_at, attendee_email, attendee_name, answers',
      )
      .eq('uid', input.uid)
      .maybeSingle();
    if (readErr) return { ok: false, error: { code: 'UNKNOWN', message: 'Could not read the meeting.' } };
    if (
      !booking ||
      booking.host_profile_id !== input.hostProfileId ||
      booking.status !== 'confirmed' ||
      booking.meeting_type_id !== null ||
      booking.source !== HOST_DIRECT_SOURCE
    ) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'No meeting of yours with that reference can be moved here.' } };
    }

    const startIso = new Date(input.startIso).toISOString();
    const endIso = new Date(new Date(startIso).getTime() + input.durationMin * 60_000).toISOString();
    const oldStart = booking.start_time as string;
    const oldEnd = booking.end_time as string;
    const sameInstant = (a: string | null | undefined, b: string) =>
      !!a && new Date(a).getTime() === new Date(b).getTime();
    if (
      (input.expectedStartIso && !sameInstant(input.expectedStartIso, oldStart)) ||
      (input.expectedEndIso && !sameInstant(input.expectedEndIso, oldEnd))
    ) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'That meeting was changed or cancelled meanwhile.' } };
    }
    const newCount = ((booking.reschedule_count as number | null) ?? 0) + 1;

    // THE move: one conditional update. Zero rows back = nothing changed.
    const { data: moved, error: upErr } = await (supabase as any)
      .from('meeting_bookings')
      .update({
        start_time: startIso,
        end_time: endIso,
        previous_start_time: oldStart,
        rescheduled_at: new Date().toISOString(),
        reschedule_count: newCount,
      })
      .eq('id', booking.id)
      .eq('status', 'confirmed')
      .eq('start_time', oldStart)
      .eq('end_time', oldEnd)
      .select('id')
      .maybeSingle();
    if (upErr) {
      if (upErr.code === '23P01' || upErr.code === '23505') {
        return {
          ok: false,
          error: { code: 'SLOT_TAKEN', message: 'You already have a meeting at that time. Pick another slot.' },
        };
      }
      console.error(`${LOG_PREFIX} move failed for ${input.uid}:`, upErr.message);
      // The update was sent; its answer was an error. It may still have landed.
      return {
        ok: false,
        error: { code: 'UNKNOWN', message: 'MyJKKN could not confirm whether the meeting moved.' },
        mayHaveChanged: true,
      };
    }
    if (!moved) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'That meeting was changed or cancelled meanwhile.' } };
    }

    // From here the row HAS moved, so no reply below may say "nothing changed".
    //
    // Another request can still change the row after that update: a cancel (its
    // own path then owns the calendar and the emails) or a second move. Before
    // every side effect, and once more at the end, this move checks the row is
    // still confirmed AND still at the time it set; if not, it stops and says
    // exactly what it had already done. Only a status/time READ that shows a
    // change counts: a failed read is not evidence of one.
    const changedSince = async (): Promise<'cancelled' | 'moved-again' | null> => {
      const { data: now, error: nowErr } = await (supabase as any)
        .from('meeting_bookings')
        .select('status, start_time')
        .eq('id', booking.id)
        .maybeSingle();
      if (nowErr || !now) return null;
      const n = now as { status?: string; start_time?: string };
      if (typeof n.status === 'string' && n.status !== 'confirmed') return 'cancelled';
      if (typeof n.start_time === 'string' && !sameInstant(n.start_time, startIso)) return 'moved-again';
      return null;
    };
    let googleTold: 'no' | 'yes' | 'maybe' = 'no';
    let emailed = 0;
    const stopped = (why: 'cancelled' | 'moved-again'): MoveDirectOutcome => {
      const head =
        why === 'cancelled'
          ? 'The meeting was cancelled while it was being moved.'
          : 'The meeting was moved again by another change while this move ran; that later change stands.';
      const told =
        googleTold === 'yes'
          ? why === 'cancelled'
            ? ' Google Calendar had already sent the invitees the new time; the cancellation then won.'
            : ' Google Calendar had already sent the invitees this move\'s time before the later change.'
          : googleTold === 'maybe'
            ? why === 'cancelled'
              ? ' Google Calendar may already have sent the invitees the new time; the cancellation then won.'
              : ' Google Calendar may already have sent the invitees this move\'s time before the later change.'
            : emailed === 0
              ? why === 'cancelled'
                ? ' The cancellation stands; nobody was sent the new time.'
                : ' Nobody was sent this move\'s time.'
              : '';
      const mailed = emailed > 0 ? ` ${emailed} invitee(s) had already been emailed this move\'s new time.` : '';
      return {
        ok: false,
        error: { code: why === 'cancelled' ? 'CANCELLED_MEANWHILE' : 'CHANGED_MEANWHILE', message: `${head}${told}${mailed}` },
      };
    };

    const warnings: string[] = [];
    if (booking.google_event_id) {
      const c = await changedSince();
      if (c) return stopped(c);
      const outcome = await GoogleCalendarService.patchEventTimeOutcome(
        supabase,
        input.hostProfileId,
        booking.google_event_id as string,
        startIso,
        endIso,
        CAMPUS_TZ,
      );
      if (outcome === 'applied') {
        googleTold = 'yes';
      } else if (outcome === 'unknown') {
        // The PATCH was sent; Google may have applied it and told invitees.
        googleTold = 'maybe';
        warnings.push(
          'Google Calendar did not confirm the new time, so the invite may still show the old time. Check it.',
        );
      } else {
        // Google definitely did not apply it: put the row back.
        const { data: back, error: backErr } = await (supabase as any)
          .from('meeting_bookings')
          .update({
            start_time: oldStart,
            end_time: oldEnd,
            previous_start_time: booking.previous_start_time ?? null,
            rescheduled_at: booking.rescheduled_at ?? null,
            reschedule_count: (booking.reschedule_count as number | null) ?? 0,
          })
          .eq('id', booking.id)
          .eq('status', 'confirmed') // never rewrite a row cancelled meanwhile
          .eq('start_time', startIso) // nor one another change has moved
          .select('id')
          .maybeSingle();
        if (!backErr && back) {
          return {
            ok: false,
            error: {
              code: 'CALENDAR_FAILED',
              message: 'Google Calendar did not accept the new time, so nothing was changed.',
            },
          };
        }
        const c2 = await changedSince();
        if (c2) return stopped(c2);
        // 23P01 here = another booking took the freed old time meanwhile.
        console.error(
          `${LOG_PREFIX} move: calendar refused AND restore failed for ${input.uid}:`,
          (backErr as { code?: string } | null)?.code ?? 'no row',
        );
        warnings.push(
          'The meeting moved in MyJKKN, but its Google Calendar invite still shows the old time and could not be updated.',
        );
      }
    }

    // A held room follows the meeting (same rule as rescheduleBooking). If it
    // cannot (a clash or an error), the move is reported half-done.
    if (booking.venue_reservation_id) {
      const c = await changedSince();
      if (c) return stopped(c);
      const { error: rErr } = await (supabase as any)
        .from('resource_reservations')
        .update({ start_time: startIso, end_time: endIso, updated_at: new Date().toISOString() })
        .eq('id', booking.venue_reservation_id)
        .neq('status', 'cancelled');
      if (rErr) {
        console.error(`${LOG_PREFIX} venue reservation move failed:`, rErr.message);
        warnings.push('The room booked for this meeting is still held at the old time; it could not be moved.');
      }
    }

    // One "moved" email to every invitee (and one to the host), naming the
    // meeting and both times. Every invitee; when the list is empty, the one
    // attendee on the row (as cancelBooking does).
    const answers = (booking.answers ?? {}) as {
      title?: string;
      location_mode?: HostMeetingLocationMode;
      location_text?: string | null;
      participants?: { email?: string; name?: string }[];
    };
    const { data: host } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', input.hostProfileId)
      .maybeSingle();
    const listed = (answers.participants ?? []).filter((x) => x?.email);
    const recipients = listed.length
      ? listed
      : booking.attendee_email
        ? [{ email: booking.attendee_email as string, name: (booking.attendee_name as string | null) ?? undefined }]
        : [];
    let hostTold = false;
    const notEmailed: string[] = [];
    for (const p of recipients) {
      const c = await changedSince();
      if (c) return stopped(c);
      // The host's copy is sent ONCE (its key names only the meeting and this
      // move; a second send with a different payload would be a 409). It
      // counts as sent only when it really went: a failed first try is retried.
      const hostEmail = hostTold ? '' : (((host as any)?.email as string | undefined) ?? '');
      try {
        const sent = await MeetingBookingEmailService.sendBookingRescheduledEmails({
          uid: booking.uid as string,
          meetingTitle: answers.title?.trim() || 'Meeting',
          durationMin: input.durationMin,
          timezone: CAMPUS_TZ,
          startTime: startIso,
          previousStartTime: oldStart,
          rescheduledBy: 'host',
          // This move's number, so a later move back to the same time is a new email.
          sequence: newCount,
          hostName: ((host as any)?.full_name as string | undefined) ?? ((host as any)?.email as string | undefined) ?? '',
          hostEmail,
          attendeeName: p.name || (p.email as string),
          attendeeEmail: p.email as string,
          locationMode: answers.location_mode ?? null,
          locationText: answers.location_text ?? null,
          videoUrl: (booking.video_url as string | null) ?? null,
        });
        if (sent?.attendee?.success) emailed += 1;
        else if (!sent?.attendee?.skipped) notEmailed.push(p.email as string);
        if (hostEmail && (sent?.host?.success || sent?.host?.skipped)) hostTold = true;
      } catch (err) {
        console.error(`${LOG_PREFIX} moved email failed for ${p.email}:`, err);
        notEmailed.push(p.email as string);
      }
    }
    if (notEmailed.length) {
      warnings.push(`The "moved" email could not be sent to: ${notEmailed.join(', ')}.`);
    }
    // A change that landed during the last send still decides the reply.
    const cEnd = await changedSince();
    if (cEnd) return stopped(cEnd);

    return {
      ok: true,
      data: {
        uid: booking.uid as string,
        startIso,
        endIso,
        previousStartIso: oldStart,
        videoUrl: (booking.video_url as string | null) ?? null,
      },
      warning: warnings.length ? warnings.join(' ') : null,
    };
  }
}
