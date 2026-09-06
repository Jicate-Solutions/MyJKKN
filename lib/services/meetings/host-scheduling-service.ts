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
    for (const a of attendees) {
      try {
        await MeetingBookingEmailService.sendBookingConfirmedEmails({
          uid,
          meetingTitle: input.title.trim(),
          durationMin: input.durationMin,
          timezone,
          startTime: startIso,
          hostName:
            ((hostProfile as any)?.full_name as string | undefined) ??
            ((hostProfile as any)?.email as string | undefined) ??
            '',
          hostEmail: ((hostProfile as any)?.email as string | undefined) ?? '',
          attendeeName: a.name,
          attendeeEmail: a.email,
          locationMode: input.locationMode,
          locationText:
            input.locationMode === 'in_person' ? input.locationText?.trim() || null : null,
          videoUrl,
        });
      } catch (err) {
        console.error(`${LOG_PREFIX} confirmation email failed for ${a.email}:`, err);
      }
    }

    return {
      ok: true,
      data: { uid, bookingId, startIso, endIso, videoUrl, googleEventId, warning },
    };
  }
}
