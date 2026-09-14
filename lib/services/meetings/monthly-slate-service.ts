// lib/services/meetings/monthly-slate-service.ts
//
// PIECE 4a of the Monthly Slate spec (artifacts/monthly-slate-spec-2026-08-25.html):
// the IMPURE half that monthly-slate-engine.ts deliberately omits.
//
// The engine is a pure function: give it series, rules and everyone's free
// slots and it returns a proposed month. It has no Supabase, no clock and no
// way of knowing when anyone is free. This file is the part that answers those
// questions from the database, hands them to the engine, and writes the result
// into the slate tables that shipped with PR #3726.
//
// ── WHAT THIS FILE DOES NOT DO ───────────────────────────────────────────────
//
// It does not book anything. It does not approve anything. It does not advance
// the rotation cursor — the engine returns `nextRotationCursor` for APPROVAL
// time, and persisting it on generation would drift the rotation every time the
// EAO pressed Regenerate. Approve / Reschedule / Drop / Try-again are piece 4b.
//
// ── FAIL CLOSED, ALWAYS ──────────────────────────────────────────────────────
//
// If a person's availability cannot be loaded we treat them as FULLY BUSY, never
// as free. Same posture as NativeSchedulingService.loadBusy() (fail CLOSED on a
// broken Google connection rather than offering slots we cannot verify). Here
// the consequence is visible rather than silent: the meeting lands in
// `unplaceable` with a reason the EAO can act on, which is exactly the spec's
// first rule — a silently missing meeting is the worst failure this system can
// have.
//
// ── WHY AVAILABILITY IS COMPUTED PER DURATION ────────────────────────────────
//
// Availability is duration-dependent: a 10:00 start is free for a 60-minute
// meeting and not free for a 120-minute one if something sits at 11:30. The
// engine matches availability on (profileId, durationMin), so this file computes
// one set of free starts per required person PER DISTINCT SERIES DURATION.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  computeSlots,
  type EngineOverride,
  type EngineWindow,
} from './native-slot-engine';
import {
  proposeMonthlySlate,
  type ProposedSlate,
  type SlateAvailability,
  type SlateBlockedPeriod,
  type SlateSeries,
} from './monthly-slate-engine';
import { isSeriesCadence, type CoverageMode } from './recurring-series-config';

const LOG_PREFIX = '[meetings/monthly-slate]';

/** The campus timezone. Every blocked-period date and preferred time is in it. */
export const CAMPUS_TZ = 'Asia/Kolkata';

/**
 * Candidate starts are generated on a 15-minute grid rather than on each
 * series' own duration.
 *
 * The reason is intersection, not granularity: computeSlots() walks a window
 * from ITS OWN start minute in steps of `slotIntervalMin`. Two people whose
 * working day starts at 09:00 and 09:30 would, on a 60-minute step, produce
 * 09:00/10:00 and 09:30/10:30 — grids that never meet, so a meeting requiring
 * both would be reported unplaceable when a shared time plainly exists. A fixed
 * fine grid makes the two grids commensurable.
 */
const SLOT_GRID_MIN = 15;

/** A fallback working day for someone who has recorded no schedule at all. */
const DEFAULT_WORK_DAY_START_MIN = 9 * 60; // 09:00
const DEFAULT_WORK_DAY_END_MIN = 17 * 60; // 17:00

// ============================================================================
// MONTH ARITHMETIC
// ============================================================================

export interface MonthRange {
  /** First calendar day of the month, "YYYY-MM-DD". */
  fromDate: string;
  /** Last calendar day of the month, "YYYY-MM-DD". */
  toDate: string;
  /** Start of the first day as a UTC instant, for the bookings overlap query. */
  fromIso: string;
  /** Start of the day AFTER the last day, exclusive upper bound. */
  toIsoExclusive: string;
}

/** "YYYY-MM" — the only month shape the slate tables accept. */
export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Days in a month, honouring the full Gregorian leap rule. */
export function daysInMonth(year: number, month1to12: number): number {
  if (month1to12 === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month1to12 - 1];
}

/**
 * The calendar range a month covers, plus the UTC instants that bracket it.
 *
 * The instants are deliberately WIDER than the campus month: a booking that
 * starts at 23:45 IST on the last day is 18:15Z the same day, but one that ends
 * at 00:30 IST on the first day began the previous UTC day. Padding by a day on
 * each side costs one extra day of rows and removes a whole class of
 * off-by-one-timezone bug from the busy query.
 */
export function monthDateRange(month: string): MonthRange {
  if (!isMonthKey(month)) {
    throw new Error(`Not a month: ${String(month)}`);
  }
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const last = daysInMonth(year, m);
  const pad = (n: number) => String(n).padStart(2, '0');

  return {
    fromDate: `${month}-01`,
    toDate: `${month}-${pad(last)}`,
    fromIso: new Date(Date.UTC(year, m - 1, 1) - 24 * 3600_000).toISOString(),
    toIsoExclusive: new Date(Date.UTC(year, m - 1, last) + 2 * 24 * 3600_000).toISOString(),
  };
}

/** The month AFTER today, in campus time — the month a slate is normally for. */
export function defaultSlateMonth(now: Date = new Date()): string {
  const label = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMPUS_TZ,
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  const year = Number(label.slice(0, 4));
  const m = Number(label.slice(5, 7));
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
}

/** Every distinct meeting length across the series, ascending. */
export function distinctDurations(series: readonly { durationMin: number }[]): number[] {
  const set = new Set<number>();
  for (const s of series) {
    if (Number.isFinite(s.durationMin) && s.durationMin > 0) set.add(s.durationMin);
  }
  return [...set].sort((a, b) => a - b);
}

// ============================================================================
// AVAILABILITY
// ============================================================================

/** One person's bookable shape, as read from their schedule rows. */
export interface PersonSchedule {
  timezone: string;
  windows: EngineWindow[];
  overrides: EngineOverride[];
}

export interface BuildAvailabilityInput {
  profileIds: readonly string[];
  /** One availability set is produced per person PER duration in this list. */
  durations: readonly number[];
  schedules: ReadonlyMap<string, PersonSchedule>;
  /** Confirmed bookings per person — the times they are already committed. */
  busyByProfile: ReadonlyMap<string, ReadonlyArray<{ start: string; end: string }>>;
  /**
   * People whose availability could NOT be established. They are returned with
   * no free starts at all — fully busy — never omitted and never assumed free.
   */
  unknownProfileIds?: ReadonlySet<string>;
  /** Starts the EAO already turned down; never offered again. */
  rejectedStarts?: ReadonlySet<string>;
  fromDate: string;
  toDate: string;
  now: Date;
}

/**
 * Free starts for every (person, duration) pair. Pure — every input is passed
 * in, so the fail-closed path and the per-duration grouping are directly
 * testable without a database.
 *
 * A person in `unknownProfileIds`, and a person with no schedule entry at all,
 * both come back with `freeStarts: []`. That is the fail-closed reading: an
 * empty list is an explicit "we could not find a time", which the engine turns
 * into an unplaceable row with a reason. Omitting the entry would look the same
 * to the engine but would lose the distinction in anything that inspects this
 * function's output, so the entry is always emitted.
 */
export function buildSlateAvailability(input: BuildAvailabilityInput): SlateAvailability[] {
  const out: SlateAvailability[] = [];
  const unknown = input.unknownProfileIds ?? new Set<string>();
  const rejected = input.rejectedStarts ?? new Set<string>();

  for (const profileId of input.profileIds) {
    const schedule = input.schedules.get(profileId);
    const isUnknown = unknown.has(profileId) || !schedule;

    for (const durationMin of input.durations) {
      if (isUnknown) {
        out.push({ profileId, durationMin, freeStarts: [] });
        continue;
      }

      let freeStarts: string[];
      try {
        freeStarts = computeSlots({
          timezone: schedule.timezone || CAMPUS_TZ,
          durationMin,
          windows: schedule.windows,
          overrides: schedule.overrides,
          bookings: (input.busyByProfile.get(profileId) ?? []) as Array<{
            start: string;
            end: string;
          }>,
          slotIntervalMin: SLOT_GRID_MIN,
          minNoticeMin: 0,
          fromDate: input.fromDate,
          toDate: input.toDate,
          now: input.now,
        }).map((s) => s.start);
      } catch (err: any) {
        // A throw here means the schedule rows are unusable. Fully busy, not
        // free — the same decision the catch-nothing path above makes.
        console.error(`${LOG_PREFIX} slot computation failed for ${profileId}:`, err?.message);
        freeStarts = [];
      }

      out.push({
        profileId,
        durationMin,
        freeStarts: rejected.size === 0 ? freeStarts : freeStarts.filter((s) => !rejected.has(s)),
      });
    }
  }

  return out;
}

// ============================================================================
// LOADING (impure)
// ============================================================================

interface LoadedConfig {
  series: SlateSeries[];
  allInstitutionIds: string[];
  rotationOrder: string[];
  blockedPeriods: SlateBlockedPeriod[];
}

/**
 * Active series with their coverage rows and required people, the active
 * institutions in display order, the rotation order and the blocked periods.
 *
 * Separate queries rather than PostgREST embeds, for the reason listSeries()
 * already documents: a child table filtered to nothing by RLS is indistinguishable
 * from a series that genuinely has no rows.
 */
async function loadConfig(supabase: SupabaseClient, month: string): Promise<LoadedConfig> {
  const range = monthDateRange(month);

  const [seriesRes, institutionsRes, rotationRes, blockedRes] = await Promise.all([
    supabase
      .from('meeting_recurring_series')
      .select(
        'id, name, host_profile_id, cadence, preferred_weekday, preferred_start_minute, ' +
          'duration_min, may_be_online, coverage_mode, priority, rotation_cursor',
      )
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('institutions')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('meeting_rotation_order')
      .select('institution_id, position')
      .order('position', { ascending: true }),
    supabase
      .from('meeting_blocked_periods')
      .select('institution_id, name, starts_on, ends_on')
      .eq('is_active', true)
      .lte('starts_on', range.toDate)
      .gte('ends_on', range.fromDate),
  ]);

  if (seriesRes.error) throw new Error(seriesRes.error.message);
  if (institutionsRes.error) throw new Error(institutionsRes.error.message);

  const seriesRows = (seriesRes.data ?? []) as any[];
  const ids = seriesRows.map((r) => r.id as string);

  let unitsRows: any[] = [];
  let attendeeRows: any[] = [];
  if (ids.length > 0) {
    const [unitsRes, attendeesRes] = await Promise.all([
      supabase
        .from('meeting_recurring_series_units')
        .select('series_id, institution_id, is_excluded')
        .in('series_id', ids),
      supabase
        .from('meeting_recurring_series_attendees')
        .select('series_id, profile_id, is_required')
        .in('series_id', ids),
    ]);
    if (unitsRes.error) throw new Error(unitsRes.error.message);
    if (attendeesRes.error) throw new Error(attendeesRes.error.message);
    unitsRows = (unitsRes.data ?? []) as any[];
    attendeeRows = (attendeesRes.data ?? []) as any[];
  }

  const unitsBySeries = new Map<string, Array<{ institutionId: string; isExcluded: boolean }>>();
  for (const u of unitsRows) {
    const list = unitsBySeries.get(u.series_id) ?? [];
    list.push({ institutionId: u.institution_id, isExcluded: Boolean(u.is_excluded) });
    unitsBySeries.set(u.series_id, list);
  }

  const attendeesBySeries = new Map<string, Array<{ profileId: string; isRequired: boolean }>>();
  for (const a of attendeeRows) {
    const list = attendeesBySeries.get(a.series_id) ?? [];
    list.push({ profileId: a.profile_id, isRequired: Boolean(a.is_required) });
    attendeesBySeries.set(a.series_id, list);
  }

  const series: SlateSeries[] = seriesRows.map((r) => ({
    id: r.id,
    name: r.name,
    hostProfileId: r.host_profile_id,
    cadence: isSeriesCadence(r.cadence) ? r.cadence : 'monthly',
    preferredWeekday: r.preferred_weekday ?? null,
    preferredStartMinute: r.preferred_start_minute ?? null,
    durationMin: Number(r.duration_min) || 60,
    mayBeOnline: Boolean(r.may_be_online),
    coverageMode: (r.coverage_mode as CoverageMode) ?? 'all_institutions',
    priority: Number(r.priority) || 100,
    rotationCursor: Number(r.rotation_cursor) || 0,
    units: unitsBySeries.get(r.id) ?? [],
    attendees: attendeesBySeries.get(r.id) ?? [],
  }));

  return {
    series,
    allInstitutionIds: ((institutionsRes.data ?? []) as any[]).map((i) => i.id as string),
    // A rotation row for a college that is no longer active is dropped here
    // rather than in the engine — the engine's "covered but not in rotation"
    // report is about missing positions, not about closed colleges.
    rotationOrder: ((rotationRes.data ?? []) as any[]).map((r) => r.institution_id as string),
    blockedPeriods: ((blockedRes.data ?? []) as any[]).map((b) => ({
      institutionId: b.institution_id ?? null,
      name: b.name,
      startsOn: b.starts_on,
      endsOn: b.ends_on,
    })),
  };
}

/**
 * Each person's schedule, from the SAME tables the public booking widget reads:
 * meeting_host_schedules -> meeting_schedule_windows / meeting_schedule_overrides.
 *
 * Returns the schedules it could establish, plus the ids it could NOT — the
 * caller treats those as fully busy. A person with no schedule row at all is a
 * different case from a person whose load errored: the former gets the campus
 * default working day (they have said nothing, and every staff member is
 * nominally available in office hours), the latter is unknown and fails closed.
 */
async function loadSchedules(
  supabase: SupabaseClient,
  profileIds: string[],
  fromDate: string,
  toDate: string,
): Promise<{ schedules: Map<string, PersonSchedule>; unknown: Set<string> }> {
  const schedules = new Map<string, PersonSchedule>();
  const unknown = new Set<string>();
  if (profileIds.length === 0) return { schedules, unknown };

  const defaultSchedule = (): PersonSchedule => ({
    timezone: CAMPUS_TZ,
    windows: [1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      startMinute: DEFAULT_WORK_DAY_START_MIN,
      endMinute: DEFAULT_WORK_DAY_END_MIN,
    })),
    overrides: [],
  });

  const { data: scheduleRows, error: scheduleErr } = await supabase
    .from('meeting_host_schedules')
    .select('id, host_profile_id, timezone, is_default, created_at')
    .in('host_profile_id', profileIds)
    // Deterministic pick when someone owns several schedules: the default one,
    // then the oldest, then by id.
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (scheduleErr) {
    // We cannot tell who is free. EVERY person fails closed rather than being
    // handed a default working day we have no evidence for.
    console.error(`${LOG_PREFIX} schedule load failed:`, scheduleErr.message);
    for (const pid of profileIds) unknown.add(pid);
    return { schedules, unknown };
  }

  const chosen = new Map<string, { id: string; timezone: string }>();
  for (const s of (scheduleRows ?? []) as any[]) {
    if (!s?.host_profile_id || chosen.has(s.host_profile_id)) continue;
    chosen.set(s.host_profile_id, { id: s.id, timezone: s.timezone || CAMPUS_TZ });
  }

  const scheduleIds = [...chosen.values()].map((s) => s.id);
  const windowsBySchedule = new Map<string, EngineWindow[]>();
  const overridesBySchedule = new Map<string, EngineOverride[]>();
  const schedulesWithWindowRows = new Set<string>();

  if (scheduleIds.length > 0) {
    const [winRes, ovRes] = await Promise.all([
      supabase
        .from('meeting_schedule_windows')
        .select('schedule_id, weekday, start_minute, end_minute')
        .in('schedule_id', scheduleIds),
      supabase
        .from('meeting_schedule_overrides')
        .select('schedule_id, date, start_minute, end_minute')
        .in('schedule_id', scheduleIds)
        .gte('date', fromDate)
        .lte('date', toDate),
    ]);

    if (winRes.error || ovRes.error) {
      console.error(
        `${LOG_PREFIX} window/override load failed:`,
        winRes.error?.message ?? ovRes.error?.message,
      );
      for (const pid of profileIds) unknown.add(pid);
      return { schedules, unknown };
    }

    for (const w of (winRes.data ?? []) as any[]) {
      schedulesWithWindowRows.add(w.schedule_id);
      const list = windowsBySchedule.get(w.schedule_id) ?? [];
      list.push({
        weekday: Number(w.weekday),
        startMinute: Number(w.start_minute),
        endMinute: Number(w.end_minute),
      });
      windowsBySchedule.set(w.schedule_id, list);
    }

    for (const o of (ovRes.data ?? []) as any[]) {
      const list = overridesBySchedule.get(o.schedule_id) ?? [];
      list.push({
        date: o.date,
        startMinute: o.start_minute == null ? null : Number(o.start_minute),
        endMinute: o.end_minute == null ? null : Number(o.end_minute),
      });
      overridesBySchedule.set(o.schedule_id, list);
    }
  }

  for (const pid of profileIds) {
    const sched = chosen.get(pid);
    if (!sched || !schedulesWithWindowRows.has(sched.id)) {
      // Said nothing about when they work → the campus default. NOT the same as
      // "their schedule could not be read", which is the unknown set above.
      schedules.set(pid, defaultSchedule());
      continue;
    }
    schedules.set(pid, {
      timezone: sched.timezone,
      windows: windowsBySchedule.get(sched.id) ?? [],
      overrides: overridesBySchedule.get(sched.id) ?? [],
    });
  }

  return { schedules, unknown };
}

/** Confirmed bookings per person over the month. Fail closed on error. */
async function loadBusy(
  supabase: SupabaseClient,
  profileIds: string[],
  fromIso: string,
  toIso: string,
): Promise<{
  busyByProfile: Map<string, Array<{ start: string; end: string }>>;
  unknown: Set<string>;
}> {
  const busyByProfile = new Map<string, Array<{ start: string; end: string }>>();
  const unknown = new Set<string>();
  if (profileIds.length === 0) return { busyByProfile, unknown };

  const { data, error } = await supabase
    .from('meeting_bookings')
    .select('host_profile_id, start_time, end_time')
    .in('host_profile_id', profileIds)
    .eq('status', 'confirmed')
    .lt('start_time', toIso)
    .gt('end_time', fromIso);

  if (error) {
    console.error(`${LOG_PREFIX} busy load failed:`, error.message);
    for (const pid of profileIds) unknown.add(pid);
    return { busyByProfile, unknown };
  }

  for (const b of (data ?? []) as any[]) {
    const list = busyByProfile.get(b.host_profile_id) ?? [];
    list.push({ start: b.start_time, end: b.end_time });
    busyByProfile.set(b.host_profile_id, list);
  }
  return { busyByProfile, unknown };
}

// ============================================================================
// THE STORED SLATE
// ============================================================================

export type SlateItemStatus =
  | 'proposed'
  | 'rescheduled'
  | 'dropped'
  | 'rejected'
  | 'booked'
  | 'unplaceable';

export interface SlateItem {
  id: string;
  seriesId: string | null;
  seriesName: string;
  institutionId: string | null;
  occurrence: number;
  startsAt: string | null;
  endsAt: string | null;
  durationMin: number;
  mode: 'in_person' | 'online';
  onlineBecause: string | null;
  status: SlateItemStatus;
  unplaceableReason: string | null;
  unplaceableDetail: string | null;
}

export interface StoredSlate {
  id: string;
  month: string;
  status: 'draft' | 'approved';
  hostProfileId: string;
  generatedAt: string;
  approvedAt: string | null;
  items: SlateItem[];
}

const SLATE_ITEM_COLUMNS =
  'id, series_id, series_name, institution_id, occurrence, starts_at, ends_at, ' +
  'duration_min, mode, online_because, status, unplaceable_reason, unplaceable_detail';

function toSlateItem(row: any): SlateItem {
  return {
    id: row.id,
    seriesId: row.series_id ?? null,
    seriesName: row.series_name,
    institutionId: row.institution_id ?? null,
    occurrence: Number(row.occurrence) || 0,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    durationMin: Number(row.duration_min) || 60,
    mode: row.mode === 'online' ? 'online' : 'in_person',
    onlineBecause: row.online_because ?? null,
    status: row.status,
    unplaceableReason: row.unplaceable_reason ?? null,
    unplaceableDetail: row.unplaceable_detail ?? null,
  };
}

/** The stored slate for a host and month, or null if none has been generated. */
export async function loadStoredSlate(
  supabase: SupabaseClient,
  hostProfileId: string,
  month: string,
): Promise<StoredSlate | null> {
  const { data: slate, error } = await supabase
    .from('meeting_slates')
    .select('id, month, status, host_profile_id, generated_at, approved_at')
    .eq('host_profile_id', hostProfileId)
    .eq('month', month)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!slate) return null;

  const { data: items, error: itemsErr } = await supabase
    .from('meeting_slate_items')
    .select(SLATE_ITEM_COLUMNS)
    .eq('slate_id', (slate as any).id)
    .order('starts_at', { ascending: true, nullsFirst: false })
    .order('series_name', { ascending: true });
  if (itemsErr) throw new Error(itemsErr.message);

  return {
    id: (slate as any).id,
    month: (slate as any).month,
    status: (slate as any).status,
    hostProfileId: (slate as any).host_profile_id,
    generatedAt: (slate as any).generated_at,
    approvedAt: (slate as any).approved_at ?? null,
    items: ((items ?? []) as any[]).map(toSlateItem),
  };
}

// ============================================================================
// GENERATION
// ============================================================================

export interface GenerateInput {
  month: string;
  /** Whose month this slate is. Defaults to the signed-in user. */
  hostProfileId: string;
  /** The person pressing the button — stamped on the slate. */
  actorProfileId: string;
  /** Injected for determinism in tests. */
  now?: Date;
}

/**
 * Propose a month and store it as a DRAFT.
 *
 * Regenerating replaces the draft's items. It never touches an APPROVED slate —
 * once a month is real, its record of what was booked must not be rewritten by
 * someone pressing the button again.
 */
export async function generateMonthlySlate(
  supabase: SupabaseClient,
  input: GenerateInput,
): Promise<StoredSlate> {
  if (!isMonthKey(input.month)) throw new Error('Pick a month first.');
  const now = input.now ?? new Date();
  const range = monthDateRange(input.month);

  const config = await loadConfig(supabase, input.month);
  if (config.series.length === 0) {
    throw new Error(
      'No active recurring series are configured yet, so there is nothing to propose.',
    );
  }

  // The slate row comes first: rejected slots hang off it, and the generator
  // has to subtract them before it proposes anything.
  const existing = await loadStoredSlate(supabase, input.hostProfileId, input.month);
  if (existing && existing.status === 'approved') {
    throw new Error(
      'This month has already been approved. An approved month is a record of what was booked and is not regenerated.',
    );
  }

  let slateId = existing?.id ?? null;
  if (!slateId) {
    const { data: created, error: createErr } = await supabase
      .from('meeting_slates')
      .insert({
        month: input.month,
        host_profile_id: input.hostProfileId,
        status: 'draft',
        generated_by: input.actorProfileId,
      })
      .select('id')
      .single();
    if (createErr) throw new Error(createErr.message);
    slateId = (created as any).id as string;
  }

  const { data: rejectedRows, error: rejectedErr } = await supabase
    .from('meeting_slate_rejected_slots')
    .select('rejected_start')
    .eq('slate_id', slateId);
  if (rejectedErr) throw new Error(rejectedErr.message);
  const rejectedStarts = new Set(
    ((rejectedRows ?? []) as any[]).map((r) => new Date(r.rejected_start).toISOString()),
  );

  // Everyone whose calendar has to be free: every series' host plus its
  // required attendees. Optional attendees are invited, not consulted, so
  // computing their slots would be work that changes no outcome.
  const profileIds = Array.from(
    new Set(
      config.series.flatMap((s) => [
        s.hostProfileId,
        ...s.attendees.filter((a) => a.isRequired).map((a) => a.profileId),
      ]),
    ),
  ).filter(Boolean);

  const [scheduleLoad, busyLoad] = await Promise.all([
    loadSchedules(supabase, profileIds, range.fromDate, range.toDate),
    loadBusy(supabase, profileIds, range.fromIso, range.toIsoExclusive),
  ]);

  const unknown = new Set<string>([...scheduleLoad.unknown, ...busyLoad.unknown]);

  const availability = buildSlateAvailability({
    profileIds,
    durations: distinctDurations(config.series),
    schedules: scheduleLoad.schedules,
    busyByProfile: busyLoad.busyByProfile,
    unknownProfileIds: unknown,
    rejectedStarts,
    fromDate: range.fromDate,
    toDate: range.toDate,
    now,
  });

  const proposed: ProposedSlate = proposeMonthlySlate({
    month: input.month,
    series: config.series,
    allInstitutionIds: config.allInstitutionIds,
    rotationOrder: config.rotationOrder,
    blockedPeriods: config.blockedPeriods,
    availability,
    timezone: CAMPUS_TZ,
  });

  // Replace the draft's items wholesale. A regenerated month is a new proposal,
  // not a patch of the old one — and the rotation cursor is deliberately NOT
  // advanced here (see nextRotationCursor's doc comment on the engine).
  const { error: clearErr } = await supabase
    .from('meeting_slate_items')
    .delete()
    .eq('slate_id', slateId);
  if (clearErr) throw new Error(clearErr.message);

  const rows = [
    ...proposed.placed.map((p) => ({
      slate_id: slateId,
      series_id: p.seriesId,
      series_name: p.seriesName,
      institution_id: p.institutionId,
      occurrence: p.occurrence,
      starts_at: p.start,
      ends_at: p.end,
      duration_min: p.durationMin,
      mode: p.mode,
      online_because: p.onlineBecause ?? null,
      status: 'proposed',
    })),
    ...proposed.unplaceable.map((u) => ({
      slate_id: slateId,
      series_id: u.seriesId,
      series_name: u.seriesName,
      institution_id: u.institutionId,
      occurrence: u.occurrence,
      starts_at: null,
      ends_at: null,
      duration_min:
        config.series.find((s) => s.id === u.seriesId)?.durationMin ?? 60,
      mode: 'in_person',
      status: 'unplaceable',
      unplaceable_reason: u.reason,
      unplaceable_detail: u.detail,
    })),
  ];

  if (rows.length > 0) {
    const { error: insertErr } = await supabase.from('meeting_slate_items').insert(rows);
    if (insertErr) throw new Error(insertErr.message);
  }

  const { error: stampErr } = await supabase
    .from('meeting_slates')
    .update({ generated_at: now.toISOString(), generated_by: input.actorProfileId })
    .eq('id', slateId);
  if (stampErr) throw new Error(stampErr.message);

  const stored = await loadStoredSlate(supabase, input.hostProfileId, input.month);
  if (!stored) throw new Error('The month was proposed but could not be read back.');
  return stored;
}
