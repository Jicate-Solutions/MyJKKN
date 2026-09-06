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
import { bookingEventTitle } from './booking-event-title';
import { formatVenueDirections } from './venue-directions';
import { resolveVenuePlan, createVenueReservation } from './venue-reservation';
import { GoogleCalendarService } from '@/lib/services/integrations/google-calendar-service';
import { createZoomMeeting, isZoomConfigured } from '@/lib/services/integrations/zoom-service';
import { createTeamsMeeting, isTeamsConfigured } from '@/lib/services/integrations/teams-service';
import { BookingCrmBridge } from '@/lib/services/meetings/booking-crm-bridge-service';
import {
  computeSlots,
  groupSlotsByDate,
  applyGroupCapacity,
  intersectCollectiveSlots,
  pickRoundRobinHost,
  type EngineOverride,
  type EngineWindow,
  type GroupSlotUsage,
  type MeetingKind,
  type RoundRobinCandidate,
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
  /** PR1: linked "Spaces & Venues" room (in-person directions source). */
  location_resource_id?: string | null;
  // ── Wave-3 variants + lifecycle (migration 20260619000100). The columns are
  //    not in types/supabase.ts yet — getMeetingType reads them via select('*'). ──
  /** solo (default) | group | collective | round_robin. */
  kind: MeetingKind;
  /** group only: seats per slot. NULL → treated as 1. */
  capacity: number | null;
  /** round_robin only: pool of interchangeable host profile ids. */
  host_pool: string[] | null;
  /** lifecycle: post-booking redirect target. NULL = default confirmation. */
  redirect_url: string | null;
  /** lifecycle: free-text message shown on the cancel page. */
  cancellation_policy: string | null;
  // ── Wave-3 (B): paid bookings (migration 20260619100000). ───────────────────
  /** when true, an attendee must pay a Razorpay deposit before confirming. */
  requires_deposit: boolean;
  /** deposit to collect, in paise (e.g. ₹500 → 50000). NULL when no deposit. */
  deposit_amount_paise: number | null;
}

// The title itself lives in its own module so a CLI can import it without
// booting this file's Resend / Supabase / ActivityService import chain.
// Re-exported here because this is where every existing caller looks for it.
export { bookingEventTitle } from './booking-event-title';

/**
 * Why a meeting that had ALREADY ENDED is being given a new time.
 * 'missed' moves the meeting itself; the other two leave it closed and create a
 * successor that points back at it via follows_booking_id.
 */
export type PastRescheduleReason = 'missed' | 'repeat' | 'follow_up';

export interface NativeBookingInput {
  meetingTypeId: string;
  /** ISO instant — must be a slot the engine currently offers. */
  start: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string | null;
  /**
   * When the booker is a signed-in MyJKKN user, their profile id. Binds the
   * booking to a real identity (vs an anonymous guest) — the key that lets
   * downstream features (e.g. an auto-built meeting brief) pull the attendee's
   * own MyJKKN data. null = genuine external guest.
   */
  attendeeProfileId?: string | null;
  answers?: Record<string, string>;
  source?: string;
  /**
   * Wave-3 (B): a VERIFIED Razorpay deposit. The caller (book route) creates
   * the order, opens Checkout, and verifies the signature server-side BEFORE
   * passing this in — the service trusts it and stamps payment_status='paid'.
   * Absent → free booking (payment_status='none').
   */
  payment?: { orderId: string; paymentId: string };
}

export type NativeBookingResult =
  | {
      success: true;
      uid: string;
      start: string;
      end: string;
      hostName: string | null;
      /**
       * PR2: room state for this booking. null = no room reservation (walk-in /
       * custom / online); 'confirmed' = room held; 'pending' = room held but
       * awaiting caretaker approval (the meeting time is booked either way).
       */
      venueStatus: 'pending' | 'confirmed' | null;
    }
  | {
      success: false;
      // VENUE_TAKEN (PR2): the meeting type's room is already reserved for this slot.
      error: 'SLOT_TAKEN' | 'VENUE_TAKEN' | 'NOT_FOUND' | 'INVALID_SLOT' | 'INTERNAL';
    };

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
    if (!data) return null;
    // Wave-3 columns degrade to solo defaults if the migration is not yet applied.
    const row = data as Record<string, unknown> & NativeMeetingType;
    const kind = (row.kind as MeetingKind | undefined) ?? 'solo';
    return {
      ...row,
      kind: ['solo', 'group', 'collective', 'round_robin'].includes(kind) ? kind : 'solo',
      capacity: (row.capacity as number | null | undefined) ?? null,
      host_pool: (row.host_pool as string[] | null | undefined) ?? null,
      redirect_url: (row.redirect_url as string | null | undefined) ?? null,
      cancellation_policy: (row.cancellation_policy as string | null | undefined) ?? null,
      // Wave-3 (B): degrade to "no deposit" if the migration is not yet applied.
      requires_deposit: (row.requires_deposit as boolean | undefined) ?? false,
      deposit_amount_paise: (row.deposit_amount_paise as number | null | undefined) ?? null,
    };
  }

  /**
   * Wave-3 (A): which video provider mints the join link for an online meeting
   * type, per the host's meeting_host_integration_prefs row. Defaults to
   * 'google' when the host has no row (back-compat with the U1 substrate).
   * The pref table is not in generated types → cast untyped.
   */
  private static async resolveVideoProvider(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<'google' | 'zoom' | 'teams'> {
    const { data } = await (supabase as any)
      .from('meeting_host_integration_prefs')
      .select('video_provider')
      .eq('host_profile_id', hostProfileId)
      .maybeSingle();
    const p = (data?.video_provider as string | undefined) ?? 'google';
    return p === 'zoom' || p === 'teams' ? p : 'google';
  }

  /**
   * Whether this host wants the guest's discussion note echoed in the calendar
   * event TITLE as well as the body. Opt-in, default false: the Google event is
   * shared with the guest, so the title shows on their lock screen — the body is
   * the safe place, the title is a deliberate choice.
   *
   * Read on its own (NOT folded into resolveVideoProvider) so that a database
   * without the show_note_in_title column — the migration is Director-gated —
   * fails only this flag to false and never disturbs provider resolution.
   */
  private static async resolveShowNoteInTitle(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<boolean> {
    const { data } = await (supabase as any)
      .from('meeting_host_integration_prefs')
      .select('show_note_in_title')
      .eq('host_profile_id', hostProfileId)
      .maybeSingle();
    return (data?.show_note_in_title as boolean | undefined) === true;
  }

  /**
   * Wave-3 (A): mint a join URL from a platform-level provider (Zoom / Teams).
   * Reads the host's provider identity from meeting_host_integration_prefs
   * (zoom → host email; teams → informational only). Each service is env-gated
   * and returns null when unconfigured/failed — this returns null too, and the
   * caller treats that as "no link this time" (NEVER blocks the booking).
   */
  private static async mintProviderVideoUrl(
    supabase: SupabaseClient,
    hostProfileId: string,
    provider: 'zoom' | 'teams',
    meeting: { topic: string; startIso: string; durationMin: number; timezone: string },
  ): Promise<string | null> {
    // The host's provider identity (zoom user email / teams organizer hint).
    const { data: pref } = await (supabase as any)
      .from('meeting_host_integration_prefs')
      .select('provider_host_identity')
      .eq('host_profile_id', hostProfileId)
      .maybeSingle();
    const identity = (pref?.provider_host_identity as string | null | undefined) ?? null;

    if (provider === 'zoom') {
      if (!isZoomConfigured()) return null;
      // Zoom needs a host user; with no per-host identity fall back to the
      // token's own user ('me').
      const created = await createZoomMeeting({
        topic: meeting.topic,
        startIso: meeting.startIso,
        durationMin: meeting.durationMin,
        hostEmail: identity ?? 'me',
        timezone: meeting.timezone,
      });
      return created?.joinUrl ?? null;
    }
    // teams
    if (!isTeamsConfigured()) return null;
    const created = await createTeamsMeeting({
      topic: meeting.topic,
      startIso: meeting.startIso,
      durationMin: meeting.durationMin,
      hostEmail: identity ?? undefined,
    });
    return created?.joinUrl ?? null;
  }

  /**
   * Required co-hosts for a COLLECTIVE meeting type (the host themselves plus
   * every meeting_type_cohosts row). Always includes the owning host first.
   * Deduplicated.
   */
  private static async loadCollectiveHosts(
    supabase: SupabaseClient,
    mt: NativeMeetingType,
  ): Promise<string[]> {
    const { data, error } = await supabase
      .from('meeting_type_cohosts')
      .select('cohost_profile_id')
      .eq('meeting_type_id', mt.id);
    if (error) {
      console.error(`${LOG_PREFIX} cohost load failed:`, error.message);
      // fail closed: with an unknown co-host set we cannot safely intersect,
      // so behave as if only the host is required (no over-offering of slots).
      return [mt.host_profile_id];
    }
    const ids = new Set<string>([mt.host_profile_id]);
    for (const r of data ?? []) ids.add(r.cohost_profile_id as string);
    return [...ids];
  }

  /**
   * Confirmed booking counts per slot start for a GROUP meeting type — the
   * input applyGroupCapacity needs. Counts confirmed bookings of THIS meeting
   * type over the window so each slot knows its remaining seats.
   */
  private static async loadGroupUsage(
    supabase: SupabaseClient,
    meetingTypeId: string,
    fromIso: string,
    toIso: string,
  ): Promise<GroupSlotUsage[] | null> {
    const { data, error } = await supabase
      .from('meeting_bookings')
      .select('start_time')
      .eq('meeting_type_id', meetingTypeId)
      .eq('status', 'confirmed')
      .gte('start_time', fromIso)
      .lt('start_time', toIso);
    if (error) {
      console.error(`${LOG_PREFIX} group usage load failed:`, error.message);
      // fail closed: null signals "cannot verify seats" → caller drops slots /
      // refuses the booking rather than over-selling.
      return null;
    }
    const counts = new Map<string, number>();
    for (const b of data ?? []) {
      const key = new Date(b.start_time as string).toISOString();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].map(([start, count]) => ({ start, count }));
  }

  /**
   * Round-robin candidate inputs: each pool host's most-recent confirmed
   * booking time (null = never booked → highest priority). Used by
   * pickRoundRobinHost to load-balance.
   */
  private static async roundRobinCandidates(
    supabase: SupabaseClient,
    hostIds: string[],
  ): Promise<RoundRobinCandidate[]> {
    if (!hostIds.length) return [];
    const { data, error } = await supabase
      .from('meeting_bookings')
      .select('host_profile_id, start_time')
      .in('host_profile_id', hostIds)
      .eq('status', 'confirmed')
      .order('start_time', { ascending: false });
    if (error) {
      console.error(`${LOG_PREFIX} round-robin candidate load failed:`, error.message);
      // degrade gracefully: treat all as never-booked (selection still deterministic).
      return hostIds.map((h) => ({ hostProfileId: h, lastBookedAt: null }));
    }
    const lastByHost = new Map<string, string>();
    for (const b of data ?? []) {
      const h = b.host_profile_id as string;
      if (!lastByHost.has(h)) lastByHost.set(h, b.start_time as string); // first = latest (desc)
    }
    return hostIds.map((h) => ({ hostProfileId: h, lastBookedAt: lastByHost.get(h) ?? null }));
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
    // True when we already landed on the host's DEFAULT schedule, so the
    // empty-hours fallback below has nothing left to fall back to.
    let usedDefault = false;

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
      usedDefault = true;
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

    let windowRows = windows ?? [];

    // ── EMPTY HOURS → the host's normal hours (Director ruling, 2026-08-21) ──
    // A type pinned to a schedule with no weekly windows used to render a BLANK
    // calendar with no explanation, because a pinned type never fell back. It
    // now borrows the host's DEFAULT schedule's weekly windows instead.
    //
    // TIMEZONE: unchanged on purpose — the schedule the type actually points at
    // still wins. A schedule with no windows says nothing about WHEN the host
    // works, but its timezone is still the host's deliberate choice for this
    // kind of meeting, and swapping it would silently move every slot. Date
    // overrides also stay with the pinned schedule: an override is an exception
    // the host wrote against THAT schedule.
    //
    // NO LOOP: the default is read at most once, and only when we did not
    // already resolve through it. If the default is itself empty the windows
    // stay empty — the same as today.
    if (!usedDefault && windowRows.length === 0) {
      const { data: fallback } = await supabase
        .from('meeting_host_schedules')
        .select('id')
        .eq('host_profile_id', mt.host_profile_id)
        .eq('is_default', true)
        .maybeSingle();
      if (fallback && fallback.id !== scheduleId) {
        const { data: defaultWindows, error: dErr } = await supabase
          .from('meeting_schedule_windows')
          .select('weekday, start_minute, end_minute')
          .eq('schedule_id', fallback.id);
        if (dErr) {
          console.error(`${LOG_PREFIX} default-hours fallback failed:`, dErr.message);
        } else {
          windowRows = defaultWindows ?? [];
        }
      }
    }

    return {
      timezone,
      windows: windowRows.map((w) => ({
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
   * Compute one host's structural slots for a meeting type over a date range.
   * `excludeOwnGroupBookings = true` keeps a GROUP type's own confirmed
   * bookings OUT of the busy set so a partly-filled slot is still generated
   * (capacity is then applied separately); for solo/collective/round_robin the
   * host's own bookings DO block (one seat).
   */
  private static async computeHostSlots(
    supabase: SupabaseClient,
    hostProfileId: string,
    mt: NativeMeetingType,
    sched: { timezone: string; windows: EngineWindow[]; overrides: EngineOverride[] },
    fromDate: string,
    toDate: string,
    now: Date,
    fromIso: string,
    toIso: string,
    excludeOwnGroupBookings: boolean,
  ): Promise<Slot[]> {
    let busy = await this.loadBusy(supabase, hostProfileId, fromIso, toIso);
    if (excludeOwnGroupBookings) {
      // Drop this meeting type's own confirmed bookings from the busy set —
      // a group slot must remain offerable until its seats are full.
      const { data: own } = await supabase
        .from('meeting_bookings')
        .select('start_time, end_time')
        .eq('meeting_type_id', mt.id)
        .eq('status', 'confirmed')
        .lt('start_time', toIso)
        .gt('end_time', fromIso);
      const ownSet = new Set((own ?? []).map((b) => `${b.start_time}|${b.end_time}`));
      busy = busy.filter((b) => !ownSet.has(`${b.start}|${b.end}`));
    }
    return computeSlots({
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
  }

  /**
   * Available slots for a meeting type over the next `days` calendar days
   * (clamped to the type's max_days_ahead), grouped by IST date for display.
   *
   * Variant-aware (Wave-3):
   *   * solo        — host's own slots (unchanged).
   *   * group       — host's slots minus this type's own bookings, then capacity
   *                   filtered; `seatsByStart` carries remaining seats per slot.
   *   * collective  — intersection of every required host's slots.
   *   * round_robin — UNION of the pool's slots (a slot is offerable if ANY
   *                   pool host is free; the specific host is chosen at booking).
   */
  static async listSlots(
    supabase: SupabaseClient,
    meetingTypeId: string,
    opts: { days?: number; now?: Date; displayTimeZone?: string } = {},
  ): Promise<{
    days: Record<string, Slot[]>;
    durationMin: number;
    kind: MeetingKind;
    seatsByStart?: Record<string, number>;
  } | null> {
    const mt = await this.getMeetingType(supabase, meetingTypeId);
    if (!mt) return null;
    const sched = await this.loadSchedule(supabase, mt);
    if (!sched) return { days: {}, durationMin: mt.duration_min, kind: mt.kind };

    const now = opts.now ?? new Date();
    const horizon = Math.min(opts.days ?? 7, mt.max_days_ahead);

    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: sched.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const fromDate = fmt.format(now);
    const toDate = fmt.format(new Date(now.getTime() + horizon * 86_400_000));
    const fromIso = new Date(now.getTime() - 86_400_000).toISOString();
    const toIso = new Date(now.getTime() + (horizon + 2) * 86_400_000).toISOString();
    const displayTz = opts.displayTimeZone ?? 'Asia/Kolkata';

    // ── COLLECTIVE: intersect every required host's availability ──────────────
    if (mt.kind === 'collective') {
      const hosts = await this.loadCollectiveHosts(supabase, mt);
      const perHost = await Promise.all(
        hosts.map((h) =>
          this.computeHostSlots(supabase, h, mt, sched, fromDate, toDate, now, fromIso, toIso, false),
        ),
      );
      const slots = intersectCollectiveSlots(perHost);
      return { days: groupSlotsByDate(slots, displayTz), durationMin: mt.duration_min, kind: mt.kind };
    }

    // ── ROUND-ROBIN: a slot is offerable if ANY pool host is free ─────────────
    if (mt.kind === 'round_robin') {
      const pool = (mt.host_pool ?? []).filter(Boolean);
      const hosts = pool.length ? pool : [mt.host_profile_id];
      const perHost = await Promise.all(
        hosts.map((h) =>
          this.computeHostSlots(supabase, h, mt, sched, fromDate, toDate, now, fromIso, toIso, false),
        ),
      );
      const union = new Map<string, Slot>();
      for (const list of perHost) for (const s of list) union.set(s.start, s);
      const slots = [...union.values()].sort((a, b) => a.start.localeCompare(b.start));
      return { days: groupSlotsByDate(slots, displayTz), durationMin: mt.duration_min, kind: mt.kind };
    }

    // ── GROUP: host slots (minus own bookings) + capacity filter ──────────────
    if (mt.kind === 'group') {
      const structural = await this.computeHostSlots(
        supabase, mt.host_profile_id, mt, sched, fromDate, toDate, now, fromIso, toIso, true,
      );
      const usage = await this.loadGroupUsage(supabase, mt.id, fromIso, toIso);
      if (usage === null) {
        // cannot verify seats → offer nothing rather than over-sell.
        return { days: {}, durationMin: mt.duration_min, kind: mt.kind, seatsByStart: {} };
      }
      const withSeats = applyGroupCapacity(structural, mt.capacity ?? 1, usage);
      const seatsByStart: Record<string, number> = {};
      for (const s of withSeats) seatsByStart[s.start] = s.seatsLeft;
      const slots: Slot[] = withSeats.map((s) => ({ start: s.start }));
      return {
        days: groupSlotsByDate(slots, displayTz),
        durationMin: mt.duration_min,
        kind: mt.kind,
        seatsByStart,
      };
    }

    // ── SOLO (default): unchanged ─────────────────────────────────────────────
    const slots = await this.computeHostSlots(
      supabase, mt.host_profile_id, mt, sched, fromDate, toDate, now, fromIso, toIso, false,
    );
    return { days: groupSlotsByDate(slots, displayTz), durationMin: mt.duration_min, kind: mt.kind };
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

    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: sched.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const candidateDate = fmt.format(startDate);
    const startIso = startDate.toISOString();
    const candFrom = new Date(startDate.getTime() - 86_400_000).toISOString();
    const candTo = new Date(startDate.getTime() + 86_400_000).toISOString();

    /** Re-derive this start's validity against ONE host's live availability. */
    const hostOffersStart = async (
      hostId: string,
      excludeOwnGroup: boolean,
    ): Promise<boolean> => {
      const offered = await this.computeHostSlots(
        supabase, hostId, mt, sched, candidateDate, candidateDate, now, candFrom, candTo, excludeOwnGroup,
      );
      return offered.some((s) => s.start === startIso);
    };

    // ── Resolve the host(s) this booking must block, variant by variant ──────
    //   primaryHost  = the row's host_profile_id (the one we book against).
    //   blockHosts   = every host that must get a confirmed booking row
    //                  (collective books ALL required hosts; others book one).
    //   seatIndex    = which group seat this booking claims (0 for non-group;
    //                  current confirmed seat count for group — see mb_no_double_booking).
    let primaryHost = mt.host_profile_id;
    let blockHosts: string[] = [mt.host_profile_id];
    let seatIndex = 0;

    if (mt.kind === 'collective') {
      const hosts = await this.loadCollectiveHosts(supabase, mt);
      // EVERY required host must currently offer the slot.
      for (const h of hosts) {
        if (!(await hostOffersStart(h, false))) {
          return { success: false, error: 'INVALID_SLOT' };
        }
      }
      primaryHost = mt.host_profile_id;
      blockHosts = hosts;
    } else if (mt.kind === 'round_robin') {
      // Pick the least-recently-booked FREE host from the pool.
      const pool = (mt.host_pool ?? []).filter(Boolean);
      const candidatePool = pool.length ? pool : [mt.host_profile_id];
      const freeHosts: string[] = [];
      for (const h of candidatePool) {
        if (await hostOffersStart(h, false)) freeHosts.push(h);
      }
      if (freeHosts.length === 0) return { success: false, error: 'INVALID_SLOT' };
      const candidates = await this.roundRobinCandidates(supabase, freeHosts);
      primaryHost = pickRoundRobinHost(candidates) ?? freeHosts[0];
      blockHosts = [primaryHost];
    } else if (mt.kind === 'group') {
      // Capacity gate: the slot must still have a free seat AND the host's
      // structure (minus this type's own bookings) must offer it.
      if (!(await hostOffersStart(mt.host_profile_id, true))) {
        return { success: false, error: 'INVALID_SLOT' };
      }
      const usage = await this.loadGroupUsage(supabase, mt.id, candFrom, candTo);
      if (usage === null) return { success: false, error: 'INTERNAL' };
      const used = usage.find((u) => new Date(u.start).toISOString() === startIso)?.count ?? 0;
      const cap = mt.capacity && mt.capacity > 0 ? mt.capacity : 1;
      if (used >= cap) return { success: false, error: 'SLOT_TAKEN' };
      // Claim the next seat. Two concurrent requests that read the same `used`
      // pick the same seat_index and collide at mb_no_double_booking (23P01 →
      // SLOT_TAKEN) — the DB arbitrates, no over-selling.
      seatIndex = used;
      primaryHost = mt.host_profile_id;
      blockHosts = [mt.host_profile_id];
    } else {
      // solo
      if (!(await hostOffersStart(mt.host_profile_id, false))) {
        return { success: false, error: 'INVALID_SLOT' };
      }
    }

    const endIso = new Date(startDate.getTime() + mt.duration_min * 60_000).toISOString();
    const uid = crypto.randomBytes(16).toString('base64url');

    // ── PR2: venue hold ──────────────────────────────────────────────────────
    // For an in-person type linked to a registry room, hold the room too. The
    // check runs BEFORE the booking insert so a clash returns without creating
    // an orphan booking; the reservation row is created AFTER the insert
    // succeeds (best-effort, never undoes a committed booking). Walk-in rooms
    // and custom/online types resolve to { kind: 'none' } and skip all of this.
    let venuePlan: Awaited<ReturnType<typeof resolveVenuePlan>> = { kind: 'none' };
    let venueStatus: 'pending' | 'confirmed' | null = null;
    if (mt.location_mode === 'in_person' && mt.location_resource_id) {
      venuePlan = await resolveVenuePlan(supabase, mt.location_resource_id, startIso, endIso);
      if (venuePlan.kind === 'taken') return { success: false, error: 'VENUE_TAKEN' };
      if (venuePlan.kind === 'reserve') {
        venueStatus = venuePlan.requiresApproval ? 'pending' : 'confirmed';
      }
    }

    // .select() reads back the DB-generated cancel_token for the attendee's
    // self-service cancel link (Phase N3a) — service-role only; the token
    // never reaches host-facing reads. Cast untyped: seat_index + payment_*
    // columns aren't in generated types yet.
    const { data: inserted, error } = await (supabase as any)
      .from('meeting_bookings')
      .insert({
        uid,
        meeting_type_id: mt.id,
        host_profile_id: primaryHost,
        institution_id: mt.institution_id,
        attendee_name: input.attendeeName,
        attendee_email: input.attendeeEmail,
        attendee_phone: input.attendeePhone ?? null,
        attendee_profile_id: input.attendeeProfileId ?? null,
        answers: input.answers ?? {},
        start_time: startIso,
        end_time: endIso,
        status: 'confirmed',
        // PR2: room state (null unless this type holds a registry room).
        venue_status: venueStatus,
        source: input.source ?? 'direct',
        seat_index: seatIndex,
        // Deposit bookings carry their verified payment handles (the route
        // verifies the Razorpay signature BEFORE calling createBooking).
        payment_order_id: input.payment?.orderId ?? null,
        payment_id: input.payment?.paymentId ?? null,
        payment_status: input.payment ? 'paid' : 'none',
      })
      .select('cancel_token')
      .single();

    if (error) {
      // 23P01 = exclusion_violation: a concurrent booking won the slot.
      // GROUP NOTE: a second seat on the same host+range also trips this
      // constraint today — see NEEDS.md (meeting_bookings needs a group-aware
      // exclusion before group capacity > 1 can fully persist).
      if (error.code === '23P01') return { success: false, error: 'SLOT_TAKEN' };
      console.error(`${LOG_PREFIX} booking insert failed:`, error.message);
      return { success: false, error: 'INTERNAL' };
    }

    // ── COLLECTIVE: place a matching confirmed booking on every OTHER required
    //    host so the slot is blocked on all their calendars too. Best-effort
    //    per row; a co-host collision rolls the whole booking back to keep the
    //    "all hosts free" guarantee honest. ─────────────────────────────────────
    if (mt.kind === 'collective' && blockHosts.length > 1) {
      const others = blockHosts.filter((h) => h !== primaryHost);
      // Deterministic co-host uids — also what we roll back by (exact match,
      // no fragile JSON-key filter; see feedback_postgrest_dotted_json_key_filter_fails).
      const cohostUid = (h: string, i: number) => `${uid}-c${i}-${h.slice(0, 8)}`;
      const insertedCohostUids: string[] = [];
      for (let i = 0; i < others.length; i++) {
        const h = others[i];
        const thisUid = cohostUid(h, i);
        const { error: coErr } = await supabase.from('meeting_bookings').insert({
          uid: thisUid,
          meeting_type_id: mt.id,
          host_profile_id: h,
          institution_id: mt.institution_id,
          attendee_name: input.attendeeName,
          attendee_email: input.attendeeEmail,
          attendee_phone: input.attendeePhone ?? null,
          attendee_profile_id: input.attendeeProfileId ?? null,
          answers: { ...(input.answers ?? {}), collective_primary_uid: uid },
          start_time: startIso,
          end_time: endIso,
          status: 'confirmed',
          source: input.source ?? 'direct',
        });
        if (coErr) {
          // A co-host just got booked elsewhere — undo the whole collective by
          // the exact uids we created (primary + every co-host inserted so far).
          await supabase
            .from('meeting_bookings')
            .delete()
            .in('uid', [uid, ...insertedCohostUids]);
          if (coErr.code === '23P01') return { success: false, error: 'SLOT_TAKEN' };
          console.error(`${LOG_PREFIX} collective co-host insert failed:`, coErr.message);
          return { success: false, error: 'INTERNAL' };
        }
        insertedCohostUids.push(thisUid);
      }
    }

    // ── PR2: hold the room now the booking is committed ──────────────────────
    // Best-effort, like the calendar/email side-effects: a reservation failure
    // leaves the meeting booked with venue_status already set (availability was
    // checked above). The reservation is owned by the HOST — the public booker
    // is anonymous. Approval-required rooms create a 'pending' reservation +
    // approval chain (caretaker resolves it in PR3); others are 'approved'.
    if (venuePlan.kind === 'reserve' && mt.location_resource_id) {
      const venueReservationId = await createVenueReservation(supabase, {
        resourceId: mt.location_resource_id,
        hostId: primaryHost,
        purpose: `${mt.title} — ${input.attendeeName}`,
        startIso,
        endIso,
        requiresApproval: venuePlan.requiresApproval,
        approvers: venuePlan.approvers,
      });
      if (venueReservationId) {
        await (supabase as any)
          .from('meeting_bookings')
          .update({ venue_reservation_id: venueReservationId })
          .eq('uid', uid);
      }
    }

    // Notifications + calendar follow the booked host (primaryHost) — for
    // round_robin this is the auto-assigned pool member, not necessarily the
    // meeting type's nominal owner.
    const { data: host } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', primaryHost)
      .maybeSingle();

    // Self-service cancel/reschedule links — the same ones the confirmation
    // email carries — so they're reachable from the calendar event too (the
    // Calendly behaviour the Director relied on). cancel_token came back from
    // the insert above; it never reaches host-facing reads.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const cancelToken = (inserted as { cancel_token?: string } | null)?.cancel_token;
    const cancelUrl =
      appUrl && cancelToken ? `${appUrl}/book/cancel/${uid}?token=${cancelToken}` : undefined;
    const rescheduleUrl =
      appUrl && cancelToken ? `${appUrl}/book/reschedule/${uid}?token=${cancelToken}` : undefined;

    // U2 (D12) + Wave-3 (A): video link by the host's chosen provider, plus a
    // Google Calendar event for busy-sync where a Google connection exists.
    // Best effort throughout — a provider failure never fails the committed
    // booking; an online type that yields no link simply has no link this time.
    let videoUrl: string | null = null;
    let googleEventId: string | null = null;
    const wantsVideo = mt.location_mode === 'online';
    const provider = wantsVideo ? await this.resolveVideoProvider(supabase, primaryHost) : 'google';

    // Venue-from-resource PR1: for an in-person type linked to a room, resolve
    // its directions so the calendar event location + confirmation email tell
    // the attendee exactly where to go. Best-effort: a lookup miss falls back to
    // the type's free-text location. (supabase here is service-role.)
    let venueDirections: string | null = null;
    if (mt.location_mode === 'in_person' && mt.location_resource_id) {
      const { data: room, error: roomErr } = await supabase
        .from('resources')
        .select('name, building_number, block_number, floor_number, room_number, location_notes')
        .eq('id', mt.location_resource_id)
        .maybeSingle();
      if (roomErr) {
        console.error('[native-scheduling] venue lookup failed:', roomErr.message);
      } else {
        venueDirections = formatVenueDirections(room as Record<string, string | null> | null);
      }
    }
    // What the attendee sees as the place (room directions, else custom text).
    const venueForAttendee =
      mt.location_mode === 'in_person' ? venueDirections ?? mt.location_text : null;

    // A Google Calendar event always blocks the host's calendar + invites the
    // attendee when a connection exists. We only ask Google for a Meet link when
    // the host's provider is 'google'; for zoom/teams the event still rides (no
    // Meet link) and the video link comes from the chosen provider below.
    const conn = await GoogleCalendarService.getConnection(supabase, primaryHost);
    if (conn?.status === 'active') {
      // What the guest said the meeting is about. It was captured at booking
      // and shown nowhere, so the host walked in blind. It always rides in the
      // event body; the title is per-host opt-in (default off) because the
      // guest is an attendee and the title is their lock-screen surface.
      const discussionNote = (input.answers?.note ?? '').trim();
      const noteInTitle = discussionNote
        ? await this.resolveShowNoteInTitle(supabase, primaryHost)
        : false;

      const event = await GoogleCalendarService.createEvent(supabase, primaryHost, {
        summary: bookingEventTitle({
          attendeeName: input.attendeeName,
          typeTitle: mt.title,
          note: discussionNote,
          showNote: noteInTitle,
        }),
        description: [
          `Booked via JKKN (${input.source ?? 'direct'}). Reference: ${uid}`,
          discussionNote ? `Discussion note: ${discussionNote}` : '',
          input.attendeePhone ? `Attendee phone: ${input.attendeePhone}` : '',
          cancelUrl || rescheduleUrl ? '\nNeed to make changes to this meeting?' : '',
          cancelUrl ? `Cancel: ${cancelUrl}` : '',
          rescheduleUrl ? `Reschedule: ${rescheduleUrl}` : '',
        ].filter(Boolean).join('\n'),
        startIso,
        endIso,
        timezone: sched.timezone,
        attendees: [{ email: input.attendeeEmail, displayName: input.attendeeName }],
        withMeet: wantsVideo && provider === 'google',
        location: venueForAttendee ?? undefined,
      });
      if (event) {
        googleEventId = event.eventId;
        if (provider === 'google') videoUrl = event.meetUrl;
      }
    }

    // Zoom / Teams: mint the join URL from the platform-level service. Each is
    // env-gated and returns null when unconfigured/failed — fall through to "no
    // link this time" rather than blocking the booking.
    if (wantsVideo && !videoUrl && (provider === 'zoom' || provider === 'teams')) {
      videoUrl = await this.mintProviderVideoUrl(supabase, primaryHost, provider, {
        topic: bookingEventTitle({ attendeeName: input.attendeeName, typeTitle: mt.title }),
        startIso,
        durationMin: mt.duration_min,
        timezone: sched.timezone,
      });
    }

    if (videoUrl || googleEventId) {
      await (supabase as any)
        .from('meeting_bookings')
        .update({ video_url: videoUrl, google_event_id: googleEventId })
        .eq('uid', uid);
    }

    // Phase N3a: confirmation emails to attendee + host. The booking is
    // already committed — the email service is non-throwing and skips when
    // RESEND_API_KEY is unset, so notification failure never fails a booking.
    // (cancelUrl/rescheduleUrl computed above — shared with the calendar event.)
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
      // PR1: prefer resolved room directions; fall back to the type's free text.
      locationText: venueForAttendee ?? mt.location_text,
      videoUrl,
      cancelUrl,
      rescheduleUrl,
    });

    // Wave 3 (CRM bridge) — best effort, awaited so it actually completes in
    // serverless (un-awaited promises are frozen when the response is sent).
    // Service is non-throwing internally; .catch() is belt-and-suspenders.
    await BookingCrmBridge.recordBookingActivity(supabase, {
      uid,
      attendeeEmail: input.attendeeEmail,
      attendeePhone: input.attendeePhone ?? null,
      institutionId: mt.institution_id,
      meetingTitle: mt.title,
      startIso,
      hostName: (host?.full_name as string | undefined) ?? (host?.email as string | undefined) ?? null,
    }).catch((err) =>
      console.error(`${LOG_PREFIX} CRM bridge failed for booking ${uid}:`, err instanceof Error ? err.message : String(err))
    );

    return {
      success: true,
      uid,
      start: startIso,
      end: endIso,
      hostName: (host?.full_name as string | undefined) ?? host?.email ?? null,
      venueStatus,
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
        'id, host_profile_id, cancel_token, status, attendee_name, attendee_email, start_time, end_time, meeting_type_id, google_event_id, venue_reservation_id',
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

    // PR3: free the held room. The booking is now cancelled, so the venue-sync
    // trigger leaves its venue_status alone (its status='confirmed' guard); the
    // reservation is simply released for others. Best-effort — a reservation
    // hiccup never un-cancels the committed booking.
    const venueReservationId = (booking as { venue_reservation_id?: string | null })
      .venue_reservation_id;
    if (venueReservationId) {
      const { error: rErr } = await (supabase as any)
        .from('resource_reservations')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: 'Meeting cancelled',
        })
        .eq('id', venueReservationId)
        .neq('status', 'cancelled');
      if (rErr) console.error(`${LOG_PREFIX} venue reservation cancel failed:`, rErr.message);
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
    // Keep the cancelled event on the host's calendar, renamed ("Cancelled: …")
    // and freed, for record-keeping (Director request) — mirrors Calendly,
    // instead of deleting it. sendUpdates=all still notifies the attendee; the
    // cancellation email is sent below as well.
    if (booking.google_event_id) {
      const originalSummary =
        `${(mtRow?.title as string | undefined) ?? 'Meeting'} — ${booking.attendee_name ?? ''}`.trim();
      await GoogleCalendarService.markEventCancelled(
        supabase,
        booking.host_profile_id,
        booking.google_event_id as string,
        `Cancelled: ${originalSummary}`,
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
  /**
   * Resolve the schedule timezone for a meeting type and — when `newStartIso`
   * is supplied — re-validate that instant against the LIVE slot engine.
   *
   * Extracted for the mode-switch path (meeting-mode-switch-service.ts), which
   * needs the timezone even when it is NOT moving the meeting, and needs the
   * exact same engine re-validation when it is. `exclude` drops the booking's
   * own current slot from the busy set so a meeting cannot block its own move.
   *
   * rescheduleBooking below still carries its own copy of this validation on
   * purpose: it is a live, shipped path with no direct test coverage, and an
   * "exact extraction" that turns out not to be exact is how a silent
   * scheduling regression ships. Folding the two together is a follow-up that
   * wants tests around rescheduleBooking first.
   *
   * Flat result, not a discriminated union — `strictNullChecks` is off
   * repo-wide (tsconfig.json), which defeats narrowing on a boolean tag.
   */
  static async resolveMoveContext(
    supabase: SupabaseClient,
    mt: NativeMeetingType,
    opts: {
      newStartIso?: string | null;
      exclude?: { start: string; end: string } | null;
      now?: Date;
    } = {},
  ): Promise<{
    ok: boolean;
    timezone?: string;
    startIso?: string;
    endIso?: string;
    error?: 'NO_SCHEDULE' | 'INVALID_SLOT';
  }> {
    const sched = await this.loadSchedule(supabase, mt);
    if (!sched) return { ok: false, error: 'NO_SCHEDULE' };
    if (!opts.newStartIso) return { ok: true, timezone: sched.timezone };

    const now = opts.now ?? new Date();
    const startDate = new Date(opts.newStartIso);
    if (Number.isNaN(startDate.getTime())) {
      return { ok: false, timezone: sched.timezone, error: 'INVALID_SLOT' };
    }

    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: sched.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const candidateDate = fmt.format(startDate);
    const exclude = opts.exclude ?? null;
    const busy = (
      await this.loadBusy(
        supabase,
        mt.host_profile_id,
        new Date(startDate.getTime() - 86_400_000).toISOString(),
        new Date(startDate.getTime() + 86_400_000).toISOString(),
      )
    ).filter((b) => !(exclude && b.start === exclude.start && b.end === exclude.end));

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
      return { ok: false, timezone: sched.timezone, error: 'INVALID_SLOT' };
    }
    return {
      ok: true,
      timezone: sched.timezone,
      startIso,
      endIso: new Date(startDate.getTime() + mt.duration_min * 60_000).toISOString(),
    };
  }

  /**
   * Move a booking to a new time — or, when the meeting has already ended,
   * continue it.
   *
   * `opts.reason` is supplied ONLY for a meeting whose end time has passed
   * (Director ruling 2026-08-21). It decides which of two different things
   * happens, because the three reasons are not the same action:
   *
   *   'missed'    the meeting never happened  → THIS booking moves to the new
   *                                             time, exactly like an ordinary
   *                                             reschedule.
   *   'repeat'    it happened, do it again    → this booking is left alone and a
   *   'follow_up' it happened, more to say    → NEW booking is created at the new
   *                                             time, carrying follows_booking_id
   *                                             back to this one.
   *
   * Without a reason the behaviour is unchanged: confirmed bookings only, which
   * is what every existing caller (the public reschedule route, the host button
   * before this change) relies on.
   */
  static async rescheduleBooking(
    supabase: SupabaseClient,
    uid: string,
    auth: { cancelToken?: string; actorProfileId?: string },
    newStart: string,
    opts: { now?: Date; reason?: PastRescheduleReason } = {},
  ): Promise<NativeBookingResult> {
    const { data: booking, error } = await supabase
      .from('meeting_bookings')
      .select(
        'id, host_profile_id, cancel_token, status, attendee_name, attendee_email, attendee_phone, start_time, end_time, meeting_type_id, google_event_id, reschedule_count, venue_reservation_id, venue_status',
      )
      .eq('uid', uid)
      .maybeSingle();
    if (error || !booking) return { success: false, error: 'NOT_FOUND' };
    // A reason is the caller stating "this meeting has already ended and I mean
    // to act on it anyway", so a completed / cancelled / no_show booking is
    // reachable. Without one the original rule stands.
    if (!opts.reason && booking.status !== 'confirmed') {
      return { success: false, error: 'NOT_FOUND' };
    }

    const byToken = !!auth.cancelToken && auth.cancelToken === booking.cancel_token;
    const byHost = !!auth.actorProfileId && auth.actorProfileId === booking.host_profile_id;
    if (!byToken && !byHost) return { success: false, error: 'NOT_FOUND' };

    // ── repeat / follow_up: the meeting DID happen ─────────────────────────
    // Nothing about the original changes. createBooking is reused rather than
    // hand-rolling an insert so the successor gets the same slot re-validation,
    // Google event, room hold and confirmation mail every other booking gets.
    if (opts.reason === 'repeat' || opts.reason === 'follow_up') {
      const created = await this.createBooking(
        supabase,
        {
          meetingTypeId: booking.meeting_type_id as string,
          start: newStart,
          attendeeName: (booking.attendee_name as string) ?? '',
          attendeeEmail: (booking.attendee_email as string) ?? '',
          attendeePhone: (booking.attendee_phone as string | null) ?? null,
          source: `meetings:${opts.reason}`,
        },
        { now: opts.now },
      );
      if (!created.success) return created;

      // Stamp the link AFTER creation: createBooking owns the insert, and a
      // failure here must not lose the booking it just made — the successor is
      // still a real, valid meeting, only its back-reference is missing.
      const { error: linkErr } = await supabase
        .from('meeting_bookings')
        .update({
          reschedule_reason: opts.reason,
          follows_booking_id: booking.id,
        })
        .eq('uid', created.uid);
      if (linkErr) {
        console.error(`${LOG_PREFIX} follow-up link failed:`, linkErr.message);
      }
      return created;
    }

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

    // 'missed' means the meeting never happened, so the booking itself moves.
    // A booking that had been closed (completed / cancelled / no_show) comes
    // back to 'confirmed' — it is a live meeting again and must reappear in
    // every list, reminder and calendar sync that filters on that status.
    const movePatch: Record<string, unknown> = {
      start_time: startIso,
      end_time: endIso,
      previous_start_time: booking.start_time,
      rescheduled_at: new Date().toISOString(),
      reschedule_count: ((booking.reschedule_count as number | null) ?? 0) + 1,
    };
    if (opts.reason) {
      movePatch.reschedule_reason = opts.reason;
      if (booking.status !== 'confirmed') movePatch.status = 'confirmed';
    }

    const { data: moved, error: upErr } = await supabase
      .from('meeting_bookings')
      .update(movePatch)
      .eq('id', booking.id)
      // Compare-and-swap on the status we actually read, not a hardcoded
      // 'confirmed' — otherwise reviving a completed booking could never match.
      .eq('status', booking.status as string)
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

    // PR3: move the held room to the new slot. The meeting time is already
    // moved; this keeps the room reservation's window in step. Best-effort and
    // status-preserving — a confirmed room stays confirmed, a pending one stays
    // pending at the new time (re-approval-on-move is a later refinement).
    const venueReservationId = (booking as { venue_reservation_id?: string | null })
      .venue_reservation_id;
    if (venueReservationId) {
      const { error: rErr } = await (supabase as any)
        .from('resource_reservations')
        .update({ start_time: startIso, end_time: endIso, updated_at: new Date().toISOString() })
        .eq('id', venueReservationId)
        .neq('status', 'cancelled');
      if (rErr) console.error(`${LOG_PREFIX} venue reservation move failed:`, rErr.message);
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

    return {
      success: true,
      uid,
      start: startIso,
      end: endIso,
      hostName: hostName || null,
      // The room's status is PRESERVED across a move (see the reservation
      // update above), so the value read before the move is still correct.
      venueStatus:
        ((booking as { venue_status?: 'pending' | 'confirmed' | null }).venue_status) ?? null,
    };
  }
}
