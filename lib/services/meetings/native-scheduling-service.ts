// lib/services/meetings/native-scheduling-service.ts
//
// DB-facing layer over the pure slot engine (native-slot-engine.ts) —
// Phase N1 of the native scheduling platform. Replaces the Cal.com API calls
// (fetchPublicSlots / createPublicBooking) with in-house Supabase reads and a
// constraint-guarded insert.
//
// SECURITY MODEL (same as MeetingRoutingService): callers are server actions /
// API routes holding a SERVICE-ROLE client. Public visitors never touch these
// tables directly; routes validate inputs before calling in. createBooking
// RE-COMPUTES slot validity server-side — a client cannot post an arbitrary
// start time and have it accepted just because the exclusion constraint is
// silent (constraint stops double-booking; the engine check stops
// outside-schedule bookings).
//
// Booking integrity: the gist exclusion constraint mb_no_double_booking is the
// final arbiter for races — a losing concurrent insert raises SQLSTATE 23P01,
// surfaced here as { error: 'SLOT_TAKEN' }.

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MeetingBookingEmailService } from '@/lib/services/email/meeting-booking-email-service';
import { GoogleCalendarService } from '@/lib/services/integrations/google-calendar-service';
import {
  computeSlots,
  groupSlotsByDate,
  type EngineOverride,
  type EngineWindow,
  type Slot,
} from './native-slot-engine';

const LOG_PREFIX = '[native-scheduling]';

// ============================================================================
// TYPES
// ============================================================================

export interface NativeMeetingType {
  id: string;
  host_profile_id: string;
  institution_id: string | null;
  title: string;
  slug: string;
  description: string | null;
  duration_min: number;
  schedule_id: string | null;
  hidden: boolean;
  is_active: boolean;
  min_notice_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  /** M2: step between candidate slot starts; null = use duration_min. */
  slot_interval_min: number | null;
  max_days_ahead: number;
  /** U1 (D4): where the meeting happens. */
  location_mode: 'in_person' | 'phone' | 'online';
  location_text: string | null;
}

export interface NativeBookingInput {
  meetingTypeId: string;
  /** ISO instant — must be a slot the engine currently offers. */
  start: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string | null;
  answers?: Record<string, string>;
  source?: string;
}

export type NativeBookingResult =
  | { success: true; uid: string; start: string; end: string; hostName: string | null }
  | { success: false; error: 'SLOT_TAKEN' | 'NOT_FOUND' | 'INVALID_SLOT' | 'INTERNAL' };

// ============================================================================
// SERVICE
// ============================================================================

export class NativeSchedulingService {
  /** Active meeting type by host + slug (the /meet/[host]/[slug] lookup). */
  static async getMeetingType(
    supabase: SupabaseClient,
    meetingTypeId: string,
  ): Promise<NativeMeetingType | null> {
    const { data, error } = await supabase
      .from('meeting_types')
      .select('*')
      .eq('id', meetingTypeId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) {
      console.error(`${LOG_PREFIX} meeting_type load failed:`, error.message);
      return null;
    }
    return data as NativeMeetingType | null;
  }

  /**
   * Resolve the schedule (windows + overrides + timezone) a meeting type uses:
   * its own schedule_id, else the host's default schedule.
   */
  private static async loadSchedule(
    supabase: SupabaseClient,
    mt: NativeMeetingType,
  ): Promise<{
    timezone: string;
    windows: EngineWindow[];
    overrides: EngineOverride[];
  } | null> {
    let scheduleId = mt.schedule_id;
    let timezone = 'Asia/Kolkata';

    if (scheduleId) {
      const { data } = await supabase
        .from('meeting_host_schedules')
        .select('id, timezone')
        .eq('id', scheduleId)
        .maybeSingle();
      if (!data) scheduleId = null;
      else timezone = data.timezone;
    }
    if (!scheduleId) {
      const { data } = await supabase
        .from('meeting_host_schedules')
        .select('id, timezone')
        .eq('host_profile_id', mt.host_profile_id)
        .eq('is_default', true)
        .maybeSingle();
      if (!data) {
        console.warn(`${LOG_PREFIX} host ${mt.host_profile_id} has no schedule for type ${mt.slug}`);
        return null;
      }
      scheduleId = data.id;
      timezone = data.timezone;
    }

    const [{ data: windows, error: wErr }, { data: overrides, error: oErr }] = await Promise.all([
      supabase
        .from('meeting_schedule_windows')
        .select('weekday, start_minute, end_minute')
        .eq('schedule_id', scheduleId),
      supabase
        .from('meeting_schedule_overrides')
        .select('date, start_minute, end_minute')
        .eq('schedule_id', scheduleId),
    ]);
    if (wErr || oErr) {
      console.error(`${LOG_PREFIX} schedule load failed:`, wErr?.message ?? oErr?.message);
      return null;
    }

    return {
      timezone,
      windows: (windows ?? []).map((w) => ({
        weekday: w.weekday,
        startMinute: w.start_minute,
        endMinute: w.end_minute,
      })),
      overrides: (overrides ?? []).map((o) => ({
        date: o.date,
        startMinute: o.start_minute,
        endMinute: o.end_minute,
      })),
    };
  }

  /**
   * Host's busy ranges over a UTC range (engine conflict input):
   * confirmed native bookings UNIONED with the host's real Google Calendar
   * (U2, D12) when a connection exists. Google 'failed' = fail CLOSED (D19) —
   * a host whose protection broke must not look free.
   */
  private static async loadBusy(
    supabase: SupabaseClient,
    hostProfileId: string,
    fromIso: string,
    toIso: string,
  ): Promise<Array<{ start: string; end: string }>> {
    const { data, error } = await supabase
      .from('meeting_bookings')
      .select('start_time, end_time')
      .eq('host_profile_id', hostProfileId)
      .eq('status', 'confirmed')
      .lt('start_time', toIso)
      .gt('end_time', fromIso);
    if (error) {
      console.error(`${LOG_PREFIX} busy load failed:`, error.message);
      // fail CLOSED: pretend fully busy rather than offering unverifiable slots
      return [{ start: fromIso, end: toIso }];
    }
    const busy = (data ?? []).map((b) => ({ start: b.start_time, end: b.end_time }));

    const google = await GoogleCalendarService.busyForHost(supabase, hostProfileId, fromIso, toIso);
    if (google.status === 'failed') {
      // markConnectionBroken has been (or will be) handled inside the service;
      // here we just refuse to serve slots we cannot verify.
      return [{ start: fromIso, end: toIso }];
    }
    if (google.status === 'ok') busy.push(...google.busy);
    return busy;
  }

  /**
   * Available slots for a meeting type over the next `days` calendar days
   * (clamped to the type's max_days_ahead), grouped by IST date for display.
   */
  static async listSlots(
    supabase: SupabaseClient,
    meetingTypeId: string,
    opts: { days?: number; now?: Date; displayTimeZone?: string } = {},
  ): Promise<{ days: Record<string, Slot[]>; durationMin: number } | null> {
    const mt = await this.getMeetingType(supabase, meetingTypeId);
    if (!mt) return null;
    const sched = await this.loadSchedule(supabase, mt);
    if (!sched) return { days: {}, durationMin: mt.duration_min };

    const now = opts.now ?? new Date();
    const horizon = Math.min(opts.days ?? 7, mt.max_days_ahead);

    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: sched.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const fromDate = fmt.format(now);
    const toDate = fmt.format(new Date(now.getTime() + horizon * 86_400_000));

    const busy = await this.loadBusy(
      supabase,
      mt.host_profile_id,
      new Date(now.getTime() - 86_400_000).toISOString(),
      new Date(now.getTime() + (horizon + 2) * 86_400_000).toISOString(),
    );

    const slots = computeSlots({
      timezone: sched.timezone,
      durationMin: mt.duration_min,
      windows: sched.windows,
      overrides: sched.overrides,
      bookings: busy,
      bufferBeforeMin: mt.buffer_before_min,
      bufferAfterMin: mt.buffer_after_min,
      minNoticeMin: mt.min_notice_min,
      slotIntervalMin: mt.slot_interval_min ?? undefined,
      fromDate,
      toDate,
      now,
    });

    return {
      days: groupSlotsByDate(slots, opts.displayTimeZone ?? 'Asia/Kolkata'),
      durationMin: mt.duration_min,
    };
  }

  /**
   * Create a booking. Validates the requested start against the engine
   * (outside-schedule times are rejected even though they would not violate
   * the exclusion constraint), then inserts; a 23P01 collision → SLOT_TAKEN.
   */
  static async createBooking(
    supabase: SupabaseClient,
    input: NativeBookingInput,
    opts: { now?: Date } = {},
  ): Promise<NativeBookingResult> {
    const mt = await this.getMeetingType(supabase, input.meetingTypeId);
    if (!mt) return { success: false, error: 'NOT_FOUND' };
    const sched = await this.loadSchedule(supabase, mt);
    if (!sched) return { success: false, error: 'INVALID_SLOT' };

    const now = opts.now ?? new Date();
    const startDate = new Date(input.start);
    if (Number.isNaN(startDate.getTime())) return { success: false, error: 'INVALID_SLOT' };

    // Re-derive validity: compute slots for just the candidate's local date.
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: sched.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const candidateDate = fmt.format(startDate);
    const busy = await this.loadBusy(
      supabase,
      mt.host_profile_id,
      new Date(startDate.getTime() - 86_400_000).toISOString(),
      new Date(startDate.getTime() + 86_400_000).toISOString(),
    );
    const offered = computeSlots({
      timezone: sched.timezone,
      durationMin: mt.duration_min,
      windows: sched.windows,
      overrides: sched.overrides,
      bookings: busy,
      bufferBeforeMin: mt.buffer_before_min,
      bufferAfterMin: mt.buffer_after_min,
      minNoticeMin: mt.min_notice_min,
      slotIntervalMin: mt.slot_interval_min ?? undefined,
      fromDate: candidateDate,
      toDate: candidateDate,
      now,
    });
    const startIso = startDate.toISOString();
    if (!offered.some((s) => s.start === startIso)) {
      return { success: false, error: 'INVALID_SLOT' };
    }

    const endIso = new Date(startDate.getTime() + mt.duration_min * 60_000).toISOString();
    const uid = crypto.randomBytes(16).toString('base64url');

    // .select() reads back the DB-generated cancel_token for the attendee's
    // self-service cancel link (Phase N3a) — service-role only; the token
    // never reaches host-facing reads.
    const { data: inserted, error } = await supabase
      .from('meeting_bookings')
      .insert({
        uid,
        meeting_type_id: mt.id,
        host_profile_id: mt.host_profile_id,
        institution_id: mt.institution_id,
        attendee_name: input.attendeeName,
        attendee_email: input.attendeeEmail,
        attendee_phone: input.attendeePhone ?? null,
        answers: input.answers ?? {},
        start_time: startIso,
        end_time: endIso,
        status: 'confirmed',
        source: input.source ?? 'direct',
      })
      .select('cancel_token')
      .single();

    if (error) {
      // 23P01 = exclusion_violation: a concurrent booking won the slot.
      if (error.code === '23P01') return { success: false, error: 'SLOT_TAKEN' };
      console.error(`${LOG_PREFIX} booking insert failed:`, error.message);
      return { success: false, error: 'INTERNAL' };
    }

    const { data: host } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', mt.host_profile_id)
      .maybeSingle();

    // U2 (D12): Google Calendar event BEFORE the emails so the Meet link can
    // ride the confirmation. Best effort — a Google failure never fails the
    // committed booking; the event also makes Google invite the attendee.
    let videoUrl: string | null = null;
    let googleEventId: string | null = null;
    const conn = await GoogleCalendarService.getConnection(supabase, mt.host_profile_id);
    if (conn?.status === 'active') {
      const event = await GoogleCalendarService.createEvent(supabase, mt.host_profile_id, {
        summary: `${mt.title} — ${input.attendeeName}`,
        description: [
          `Booked via JKKN (${input.source ?? 'direct'}). Reference: ${uid}`,
          input.attendeePhone ? `Attendee phone: ${input.attendeePhone}` : '',
        ].filter(Boolean).join('\n'),
        startIso,
        endIso,
        timezone: sched.timezone,
        attendees: [{ email: input.attendeeEmail, displayName: input.attendeeName }],
        withMeet: mt.location_mode === 'online',
      });
      if (event) {
        videoUrl = event.meetUrl;
        googleEventId = event.eventId;
        await supabase
          .from('meeting_bookings')
          .update({ video_url: videoUrl, google_event_id: googleEventId })
          .eq('uid', uid);
      }
    }

    // Phase N3a: confirmation emails to attendee + host. The booking is
    // already committed — the email service is non-throwing and skips when
    // RESEND_API_KEY is unset, so notification failure never fails a booking.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const cancelToken = (inserted as { cancel_token?: string } | null)?.cancel_token;
    await MeetingBookingEmailService.sendBookingConfirmedEmails({
      uid,
      meetingTitle: mt.title,
      durationMin: mt.duration_min,
      timezone: sched.timezone,
      startTime: startIso,
      hostName:
        (host?.full_name as string | undefined) ?? (host?.email as string | undefined) ?? '',
      hostEmail: (host?.email as string | undefined) ?? '',
      attendeeName: input.attendeeName,
      attendeeEmail: input.attendeeEmail,
      attendeePhone: input.attendeePhone ?? null,
      locationMode: mt.location_mode,
      locationText: mt.location_text,
      videoUrl,
      cancelUrl:
        appUrl && cancelToken
          ? `${appUrl}/book/cancel/${uid}?token=${cancelToken}`
          : undefined,
      rescheduleUrl:
        appUrl && cancelToken
          ? `${appUrl}/book/reschedule/${uid}?token=${cancelToken}`
          : undefined,
    });

    return {
      success: true,
      uid,
      start: startIso,
      end: endIso,
      hostName: (host?.full_name as string | undefined) ?? host?.email ?? null,
    };
  }

  /**
   * Cancel a booking. Authorisation = a valid attendee cancel_token OR an
   * explicit host/admin actor id (callers verify auth before passing it).
   */
  static async cancelBooking(
    supabase: SupabaseClient,
    uid: string,
    auth: { cancelToken?: string; actorProfileId?: string },
    reason?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const { data: booking, error } = await supabase
      .from('meeting_bookings')
      .select(
        'id, host_profile_id, cancel_token, status, attendee_name, attendee_email, start_time, end_time, meeting_type_id, google_event_id',
      )
      .eq('uid', uid)
      .maybeSingle();
    if (error || !booking) return { success: false, error: 'NOT_FOUND' };
    if (booking.status !== 'confirmed') return { success: false, error: 'NOT_CONFIRMED' };

    const byToken = !!auth.cancelToken && auth.cancelToken === booking.cancel_token;
    const byHost = !!auth.actorProfileId && auth.actorProfileId === booking.host_profile_id;
    if (!byToken && !byHost) return { success: false, error: 'FORBIDDEN' };

    const { error: upErr } = await supabase
      .from('meeting_bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: reason ?? null,
        cancelled_at: new Date().toISOString(),
        cancelled_by: byToken ? 'attendee' : 'host',
      })
      .eq('id', booking.id)
      .eq('status', 'confirmed');
    if (upErr) {
      console.error(`${LOG_PREFIX} cancel failed:`, upErr.message);
      return { success: false, error: 'INTERNAL' };
    }

    // Phase N3a: cancellation notices to both parties. The cancel is already
    // committed — the email service is non-throwing, so this can't undo it.
    const [{ data: mtRow }, { data: host }] = await Promise.all([
      supabase
        .from('meeting_types')
        .select('title, schedule_id')
        .eq('id', booking.meeting_type_id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', booking.host_profile_id)
        .maybeSingle(),
    ]);
    let timezone = 'Asia/Kolkata';
    if (mtRow?.schedule_id) {
      const { data: schedRow } = await supabase
        .from('meeting_host_schedules')
        .select('timezone')
        .eq('id', mtRow.schedule_id)
        .maybeSingle();
      if (schedRow?.timezone) timezone = schedRow.timezone;
    }
    const durationMin = Math.max(
      1,
      Math.round(
        (new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()) / 60_000,
      ),
    );
    // U2 (D12): remove the Google Calendar event (best effort — Google also
    // notifies the attendee via sendUpdates=all on the delete).
    if (booking.google_event_id) {
      await GoogleCalendarService.deleteEvent(
        supabase,
        booking.host_profile_id,
        booking.google_event_id as string,
      );
    }

    await MeetingBookingEmailService.sendBookingCancelledEmails({
      uid,
      meetingTitle: (mtRow?.title as string | undefined) ?? 'Meeting',
      durationMin,
      timezone,
      startTime: booking.start_time,
      hostName:
        (host?.full_name as string | undefined) ?? (host?.email as string | undefined) ?? '',
      hostEmail: (host?.email as string | undefined) ?? '',
      attendeeName: booking.attendee_name ?? '',
      attendeeEmail: booking.attendee_email ?? '',
      attendeePhone: null,
      cancelledBy: byToken ? 'attendee' : 'host',
      reason: reason ?? null,
    });

    return { success: true };
  }

  /**
   * True reschedule (U5, D16): move a confirmed booking to a new start.
   * Auth = attendee cancel_token (the same capability that authorises
   * cancel — one link family per booking) OR the host.
   *
   * Race safety, two layers:
   *   1. Concurrent reschedules of the SAME booking: the UPDATE is guarded
   *      by status='confirmed' AND start_time=<the start we loaded> — the
   *      second tab no-ops (NOT_FOUND-ish CONFLICT).
   *   2. Another booking owning the NEW slot: the UPDATE re-arbitrates
   *      against mb_no_double_booking → 23P01 → SLOT_TAKEN, original
   *      booking untouched.
   */
  static async rescheduleBooking(
    supabase: SupabaseClient,
    uid: string,
    auth: { cancelToken?: string; actorProfileId?: string },
    newStart: string,
    opts: { now?: Date } = {},
  ): Promise<NativeBookingResult> {
    const { data: booking, error } = await supabase
      .from('meeting_bookings')
      .select(
        'id, host_profile_id, cancel_token, status, attendee_name, attendee_email, attendee_phone, start_time, end_time, meeting_type_id, google_event_id, reschedule_count',
      )
      .eq('uid', uid)
      .maybeSingle();
    if (error || !booking) return { success: false, error: 'NOT_FOUND' };
    if (booking.status !== 'confirmed') return { success: false, error: 'NOT_FOUND' };

    const byToken = !!auth.cancelToken && auth.cancelToken === booking.cancel_token;
    const byHost = !!auth.actorProfileId && auth.actorProfileId === booking.host_profile_id;
    if (!byToken && !byHost) return { success: false, error: 'NOT_FOUND' };

    const mt = await this.getMeetingType(supabase, booking.meeting_type_id);
    if (!mt) return { success: false, error: 'NOT_FOUND' };
    const sched = await this.loadSchedule(supabase, mt);
    if (!sched) return { success: false, error: 'INVALID_SLOT' };

    const now = opts.now ?? new Date();
    const startDate = new Date(newStart);
    if (Number.isNaN(startDate.getTime())) return { success: false, error: 'INVALID_SLOT' };

    // Engine re-validation of the candidate, with THIS booking excluded from
    // the busy set (its own current slot must not block the move).
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: sched.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const candidateDate = fmt.format(startDate);
    const busy = (
      await this.loadBusy(
        supabase,
        mt.host_profile_id,
        new Date(startDate.getTime() - 86_400_000).toISOString(),
        new Date(startDate.getTime() + 86_400_000).toISOString(),
      )
    ).filter((b) => !(b.start === booking.start_time && b.end === booking.end_time));
    const offered = computeSlots({
      timezone: sched.timezone,
      durationMin: mt.duration_min,
      windows: sched.windows,
      overrides: sched.overrides,
      bookings: busy,
      bufferBeforeMin: mt.buffer_before_min,
      bufferAfterMin: mt.buffer_after_min,
      minNoticeMin: mt.min_notice_min,
      slotIntervalMin: mt.slot_interval_min ?? undefined,
      fromDate: candidateDate,
      toDate: candidateDate,
      now,
    });
    const startIso = startDate.toISOString();
    if (!offered.some((s) => s.start === startIso)) {
      return { success: false, error: 'INVALID_SLOT' };
    }
    const endIso = new Date(startDate.getTime() + mt.duration_min * 60_000).toISOString();

    const { data: moved, error: upErr } = await supabase
      .from('meeting_bookings')
      .update({
        start_time: startIso,
        end_time: endIso,
        previous_start_time: booking.start_time,
        rescheduled_at: new Date().toISOString(),
        reschedule_count: ((booking.reschedule_count as number | null) ?? 0) + 1,
      })
      .eq('id', booking.id)
      .eq('status', 'confirmed')
      .eq('start_time', booking.start_time) // concurrent-reschedule guard
      .select('id')
      .maybeSingle();
    if (upErr) {
      if (upErr.code === '23P01') return { success: false, error: 'SLOT_TAKEN' };
      console.error(`${LOG_PREFIX} reschedule failed:`, upErr.message);
      return { success: false, error: 'INTERNAL' };
    }
    if (!moved) {
      // Someone else moved/cancelled it between our read and write.
      return { success: false, error: 'SLOT_TAKEN' };
    }

    // Google event follows the booking (best effort — Google also re-notifies
    // the attendee via sendUpdates=all on the patch).
    if (booking.google_event_id) {
      await GoogleCalendarService.patchEventTime(
        supabase,
        booking.host_profile_id,
        booking.google_event_id as string,
        startIso,
        endIso,
        sched.timezone,
      );
    }

    const { data: host } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', mt.host_profile_id)
      .maybeSingle();
    const hostName =
      (host?.full_name as string | undefined) ?? (host?.email as string | undefined) ?? '';

    await MeetingBookingEmailService.sendBookingRescheduledEmails({
      uid,
      meetingTitle: mt.title,
      durationMin: mt.duration_min,
      timezone: sched.timezone,
      startTime: startIso,
      previousStartTime: booking.start_time,
      hostName,
      hostEmail: (host?.email as string | undefined) ?? '',
      attendeeName: booking.attendee_name ?? '',
      attendeeEmail: booking.attendee_email ?? '',
      attendeePhone: null,
      rescheduledBy: byToken ? 'attendee' : 'host',
    });

    return { success: true, uid, start: startIso, end: endIso, hostName: hostName || null };
  }
}
