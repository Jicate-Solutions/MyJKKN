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
  max_days_ahead: number;
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

  /** Host's confirmed bookings overlapping a UTC range (engine conflict input). */
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
    return (data ?? []).map((b) => ({ start: b.start_time, end: b.end_time }));
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

    const { error } = await supabase.from('meeting_bookings').insert({
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
    });

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
      .select('id, host_profile_id, cancel_token, status')
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
    return { success: true };
  }
}
