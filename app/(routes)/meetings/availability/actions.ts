'use server';

// app/(routes)/meetings/availability/actions.ts
//
// Server actions for the native "My Availability" page — Phase N2: now backed
// by the IN-HOUSE scheduling engine (meeting_host_schedules + windows,
// migration 20260611190000) instead of Cal.com's API. No provisioning, no
// vaulted keys, no external service: the MyJKKN profile IS the booking
// identity, and RLS (mhs_host_all / msw_host_all) scopes every read/write to
// the signed-in host.
//
// The editor component's contract is preserved exactly:
//   getMySchedule(): ActionResult<MyScheduleData>
//   saveMySchedule(scheduleId, availability, timeZone)
// with availability as { days: DayName[], startTime: 'HH:mm', endTime: 'HH:mm' }
// (the CalComScheduleAvailability shape the editor still type-imports — that
// import is type-only; the cal client file stays until Phase N3 cleanup).
// scheduleId changed number → string (native uuid).

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isGoogleCalConfigured } from '@/lib/services/integrations/google-calendar-service';
import { createClient } from '@/lib/supabase/server';
import type {
  CalComDayOfWeek,
  CalComScheduleAvailability,
} from '@/lib/services/integrations/cal-com-api-client';

/**
 * The native scheduling tables (migration 20260611190000) are not yet in the
 * generated types/supabase.ts — the typed client errors on them (TS2589
 * class, see feedback memory). Cast to the untyped client until types are
 * regenerated.
 */
async function untypedClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

// NOTE: repo compiles with strictNullChecks:false — flat optional-field shape,
// not a discriminated union (see Phase-W actions for the why).
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface MyScheduleData {
  scheduleId: string;
  name: string;
  timeZone: string;
  availability: CalComScheduleAvailability[];
}

// ──────────────────────────────────────────────────────────────────────────
// day-name ↔ weekday-int mapping (0=Sunday…6=Saturday, DB convention)
// ──────────────────────────────────────────────────────────────────────────

const DAY_NAMES: CalComDayOfWeek[] = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];
const dayToInt = new Map(DAY_NAMES.map((d, i) => [d, i]));

const toHHmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Group window rows into the editor's {days[], startTime, endTime} shape. */
function rowsToAvailability(
  rows: Array<{ weekday: number; start_minute: number; end_minute: number }>,
): CalComScheduleAvailability[] {
  const byTimes = new Map<string, number[]>();
  for (const r of rows) {
    const key = `${r.start_minute}-${r.end_minute}`;
    (byTimes.get(key) ?? byTimes.set(key, []).get(key)!).push(r.weekday);
  }
  return [...byTimes.entries()].map(([key, weekdays]) => {
    const [start, end] = key.split('-').map(Number);
    return {
      days: weekdays.sort((a, b) => a - b).map((w) => DAY_NAMES[w]),
      startTime: toHHmm(start),
      endTime: toHHmm(end),
    };
  });
}

/**
 * The working hours a host gets when they have none yet: Mon–Fri 09:00–17:00.
 * Shared by first-visit creation (getMySchedule) and by createSchedule's
 * fallback, so "a new set copies your normal hours" and "your first set" can
 * never drift apart.
 */
const DEFAULT_WEEKDAY_WINDOWS: ReadonlyArray<{
  weekday: number;
  start_minute: number;
  end_minute: number;
}> = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  start_minute: 9 * 60,
  end_minute: 17 * 60,
}));

async function getCurrentUserId(): Promise<string> {
  const supabase = await untypedClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    // Explicit — never a silent redirect (rule #27).
    throw new Error('You are not signed in. Please sign in to MyJKKN and try again.');
  }
  return user.id;
}

// ──────────────────────────────────────────────────────────────────────────
// PUBLIC ACTIONS
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fetch one of the host's schedules (creating Mon–Fri 09:00–17:00 IST on
 * first visit so the editor is never blank).
 *
 * `scheduleId` picks WHICH set of working hours the editor edits — a host may
 * keep more than one (see listMySchedules below). Omitted, or naming a
 * schedule this host does not own, it returns the host's own default, exactly
 * as it always has. That fall-back is not a silent permission bounce: the
 * schedules card renders which set is selected, so the host sees they are on
 * their normal hours.
 */
export async function getMySchedule(scheduleId?: string): Promise<ActionResult<MyScheduleData>> {
  try {
    const userId = await getCurrentUserId();
    const supabase = await untypedClient();

    let schedule: { id: string; name: string; timezone: string } | null = null;

    if (scheduleId) {
      // host_profile_id is filtered HERE, not left to RLS — mhs_host_all also
      // admits is_admin(), which would otherwise expose another host's hours.
      const { data: picked } = await supabase
        .from('meeting_host_schedules')
        .select('id, name, timezone')
        .eq('id', scheduleId)
        .eq('host_profile_id', userId)
        .maybeSingle();
      schedule = picked ?? null;
    }

    if (!schedule) {
      const { data: fallbackDefault } = await supabase
        .from('meeting_host_schedules')
        .select('id, name, timezone')
        .eq('host_profile_id', userId)
        .eq('is_default', true)
        .maybeSingle();
      schedule = fallbackDefault ?? null;
    }

    if (!schedule) {
      // fall back to any schedule before creating one
      const { data: fallback } = await supabase
        .from('meeting_host_schedules')
        .select('id, name, timezone')
        .eq('host_profile_id', userId)
        .limit(1)
        .maybeSingle();
      schedule = fallback ?? null;
    }

    if (!schedule) {
      const { data: created, error: cErr } = await supabase
        .from('meeting_host_schedules')
        .insert({
          host_profile_id: userId,
          name: 'Working Hours',
          timezone: 'Asia/Kolkata',
          is_default: true,
        })
        .select('id, name, timezone')
        .single();
      if (cErr) throw new Error('Could not create your default schedule. Please try again.');
      schedule = created;

      const weekdayRows = DEFAULT_WEEKDAY_WINDOWS.map((w) => ({
        schedule_id: created.id,
        weekday: w.weekday,
        start_minute: w.start_minute,
        end_minute: w.end_minute,
      }));
      await supabase.from('meeting_schedule_windows').insert(weekdayRows);
    }

    const { data: windows, error: wErr } = await supabase
      .from('meeting_schedule_windows')
      .select('weekday, start_minute, end_minute')
      .eq('schedule_id', schedule.id);
    if (wErr) throw new Error('Could not load your availability windows.');

    return {
      success: true,
      data: {
        scheduleId: schedule.id,
        name: schedule.name,
        timeZone: schedule.timezone,
        availability: rowsToAvailability(windows ?? []),
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load your availability.',
    };
  }
}

/**
 * Save weekly availability + timezone. REPLACE semantics: the provided
 * windows fully replace the schedule's existing weekly rows (date overrides
 * are untouched). RLS guarantees the schedule belongs to the caller.
 */
export async function saveMySchedule(
  scheduleId: string,
  availability: CalComScheduleAvailability[],
  timeZone: string,
): Promise<ActionResult<MyScheduleData>> {
  try {
    if (!scheduleId || typeof scheduleId !== 'string') {
      return { success: false, error: 'Invalid schedule reference. Please reload the page.' };
    }
    if (!timeZone || typeof timeZone !== 'string') {
      return { success: false, error: 'Please choose a timezone before saving.' };
    }
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const w of availability) {
      if (!Array.isArray(w.days) || w.days.length === 0) {
        return { success: false, error: 'Each availability window must have at least one day.' };
      }
      if (!timeRe.test(w.startTime) || !timeRe.test(w.endTime)) {
        return { success: false, error: 'Times must be in 24-hour HH:mm format.' };
      }
      if (w.startTime >= w.endTime) {
        return {
          success: false,
          error: `A start time (${w.startTime}) must be before its end time (${w.endTime}).`,
        };
      }
    }

    const userId = await getCurrentUserId();
    const supabase = await untypedClient();

    // Ownership check (RLS enforces too; explicit check gives a clean error).
    const { data: schedule } = await supabase
      .from('meeting_host_schedules')
      .select('id, name')
      .eq('id', scheduleId)
      .eq('host_profile_id', userId)
      .maybeSingle();
    if (!schedule) {
      return { success: false, error: 'Schedule not found. Please reload the page.' };
    }

    const { error: tzErr } = await supabase
      .from('meeting_host_schedules')
      .update({ timezone: timeZone })
      .eq('id', scheduleId);
    if (tzErr) return { success: false, error: 'Could not save the timezone. Please try again.' };

    const { error: delErr } = await supabase
      .from('meeting_schedule_windows')
      .delete()
      .eq('schedule_id', scheduleId);
    if (delErr) return { success: false, error: 'Could not update your windows. Please try again.' };

    const rows = availability.flatMap((w) =>
      w.days
        .map((d) => dayToInt.get(d))
        .filter((wd): wd is number => wd != null)
        .map((weekday) => ({
          schedule_id: scheduleId,
          weekday,
          start_minute: toMinutes(w.startTime),
          end_minute: toMinutes(w.endTime),
        })),
    );
    if (rows.length) {
      const { error: insErr } = await supabase.from('meeting_schedule_windows').insert(rows);
      if (insErr) return { success: false, error: 'Could not save your windows. Please try again.' };
    }

    return {
      success: true,
      data: {
        scheduleId,
        name: schedule.name,
        timeZone,
        availability,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save your availability.',
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// MORE THAN ONE SET OF WORKING HOURS (2026-08-21)
//
// The database and the slot engine have always supported this: meeting_types
// .schedule_id FKs to meeting_host_schedules and native-scheduling-service
// resolves "the meeting kind's own schedule_id, else the host's default".
// Only the UI was missing — getMySchedule() was hard-wired to is_default and
// nothing could create a second schedule, so on 2026-08-21 exactly ONE of 313
// hosts had more than one, and those rows were made outside the app.
//
// Director rulings implemented here:
//   1. EVERY host may keep extra sets of hours — not a privileged subset.
//   2. A new set starts as a COPY of the host's normal hours, so they trim
//      rather than face a blank week (and never create an empty set by
//      accident).
//   3. Deleting a set that meeting kinds use WARNS FIRST, naming the count.
//      The database already does the safe thing — schedule_id is ON DELETE
//      SET NULL, windows and overrides CASCADE — so the count exists purely
//      so the host is not surprised.
//
// AUTHORIZATION: every action below filters host_profile_id = auth.uid()
// ITSELF. RLS is not sufficient here — mhs_host_all reads
// `is_super_admin() OR is_admin() OR host_profile_id = auth.uid()`, so relying
// on the policy alone would let any admin read, rename or delete ANY host's
// working hours.
// ──────────────────────────────────────────────────────────────────────────

export interface HostScheduleSummary {
  id: string;
  name: string;
  timeZone: string;
  /** The host's normal hours. Exactly one per host (uq_mhs_default_per_host). */
  isDefault: boolean;
  /** Weekly windows on this set — 0 means it offers no bookable time at all. */
  windowCount: number;
  /** How many of the host's meeting kinds point at this set. */
  meetingTypeCount: number;
}

const MAX_SCHEDULE_NAME_LENGTH = 60;

/** Trim + cap a set's name; null when the host left it blank. */
function cleanScheduleName(raw: string): string | null {
  const name = (raw ?? '').trim();
  return name ? name.slice(0, MAX_SCHEDULE_NAME_LENGTH) : null;
}

/** Every set of working hours this host keeps, normal hours first. */
export async function listMySchedules(): Promise<ActionResult<HostScheduleSummary[]>> {
  try {
    const userId = await getCurrentUserId();
    const supabase = await untypedClient();

    const { data: schedules, error } = await supabase
      .from('meeting_host_schedules')
      .select('id, name, timezone, is_default, created_at')
      .eq('host_profile_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[meetings/availability] schedule list failed:', error.message);
      return { success: false, error: 'Could not load your sets of working hours.' };
    }

    const ids = (schedules ?? []).map((s) => s.id as string);
    if (ids.length === 0) return { success: true, data: [] };

    // Two extra reads total, not one per schedule — tally in memory.
    const [{ data: windows }, { data: types }] = await Promise.all([
      supabase.from('meeting_schedule_windows').select('schedule_id').in('schedule_id', ids),
      supabase.from('meeting_types').select('schedule_id').eq('host_profile_id', userId),
    ]);

    const windowCounts = new Map<string, number>();
    for (const w of windows ?? []) {
      windowCounts.set(w.schedule_id, (windowCounts.get(w.schedule_id) ?? 0) + 1);
    }
    const typeCounts = new Map<string, number>();
    for (const t of types ?? []) {
      if (!t.schedule_id) continue; // null = uses the host's normal hours
      typeCounts.set(t.schedule_id, (typeCounts.get(t.schedule_id) ?? 0) + 1);
    }

    return {
      success: true,
      data: (schedules ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        timeZone: s.timezone,
        isDefault: Boolean(s.is_default),
        windowCount: windowCounts.get(s.id) ?? 0,
        meetingTypeCount: typeCounts.get(s.id) ?? 0,
      })),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not load your sets of working hours.',
    };
  }
}

/**
 * Add a set of working hours as a COPY of the host's normal hours (ruling 2).
 * With no normal hours yet it falls back to Mon–Fri 09:00–17:00 IST, the same
 * shape getMySchedule() creates on first visit.
 */
export async function createSchedule(name: string): Promise<ActionResult<HostScheduleSummary>> {
  try {
    const cleanName = cleanScheduleName(name);
    if (!cleanName) {
      return { success: false, error: 'Please give this set of working hours a name.' };
    }

    const userId = await getCurrentUserId();
    const supabase = await untypedClient();

    const { data: source } = await supabase
      .from('meeting_host_schedules')
      .select('id, timezone, institution_id')
      .eq('host_profile_id', userId)
      .eq('is_default', true)
      .maybeSingle();

    let sourceWindows: ReadonlyArray<{
      weekday: number;
      start_minute: number;
      end_minute: number;
    }> = [];
    if (source) {
      const { data: rows } = await supabase
        .from('meeting_schedule_windows')
        .select('weekday, start_minute, end_minute')
        .eq('schedule_id', source.id);
      sourceWindows = rows ?? [];
    }
    if (sourceWindows.length === 0) sourceWindows = DEFAULT_WEEKDAY_WINDOWS;

    const { data: created, error: cErr } = await supabase
      .from('meeting_host_schedules')
      .insert({
        host_profile_id: userId,
        institution_id: source?.institution_id ?? null,
        name: cleanName,
        timezone: source?.timezone ?? 'Asia/Kolkata',
        // Never a second default — uq_mhs_default_per_host allows exactly one.
        is_default: false,
      })
      .select('id, name, timezone')
      .single();
    if (cErr || !created) {
      console.error('[meetings/availability] schedule create failed:', cErr?.message);
      return { success: false, error: 'Could not add that set of working hours. Please try again.' };
    }

    const { error: wErr } = await supabase.from('meeting_schedule_windows').insert(
      sourceWindows.map((w) => ({
        schedule_id: created.id,
        weekday: w.weekday,
        start_minute: w.start_minute,
        end_minute: w.end_minute,
      })),
    );
    if (wErr) {
      // The set exists but is empty — say so rather than claim it was copied.
      console.error('[meetings/availability] schedule window copy failed:', wErr.message);
      return {
        success: false,
        error:
          'The new set was added but its hours could not be copied across. Open it and set the hours.',
      };
    }

    return {
      success: true,
      data: {
        id: created.id,
        name: created.name,
        timeZone: created.timezone,
        isDefault: false,
        windowCount: sourceWindows.length,
        meetingTypeCount: 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not add that set of working hours.',
    };
  }
}

/** Rename one of the host's OWN sets of working hours. */
export async function renameSchedule(
  scheduleId: string,
  name: string,
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    if (!scheduleId || typeof scheduleId !== 'string') {
      return { success: false, error: 'Invalid schedule reference. Please reload the page.' };
    }
    const cleanName = cleanScheduleName(name);
    if (!cleanName) {
      return { success: false, error: 'Please give this set of working hours a name.' };
    }

    const userId = await getCurrentUserId();
    const supabase = await untypedClient();

    const { data: updated, error } = await supabase
      .from('meeting_host_schedules')
      .update({ name: cleanName })
      .eq('id', scheduleId)
      .eq('host_profile_id', userId) // ownership in the action, not only in RLS
      .select('id, name')
      .single();
    if (error || !updated) {
      return {
        success: false,
        error: 'That set of working hours was not found. Please reload the page.',
      };
    }

    return { success: true, data: { id: updated.id, name: updated.name } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not rename that set of working hours.',
    };
  }
}

/**
 * How many of the host's meeting kinds point at this set — the number the
 * delete dialog names before the host confirms (ruling 3).
 */
export async function countTypesUsingSchedule(scheduleId: string): Promise<ActionResult<number>> {
  try {
    if (!scheduleId || typeof scheduleId !== 'string') {
      return { success: false, error: 'Invalid schedule reference. Please reload the page.' };
    }
    const userId = await getCurrentUserId();
    const supabase = await untypedClient();

    if (!(await ownedSchedule(supabase, scheduleId, userId))) {
      return {
        success: false,
        error: 'That set of working hours was not found. Please reload the page.',
      };
    }

    const { count, error } = await supabase
      .from('meeting_types')
      .select('id', { count: 'exact', head: true })
      .eq('host_profile_id', userId)
      .eq('schedule_id', scheduleId);
    if (error) {
      console.error('[meetings/availability] schedule usage count failed:', error.message);
      return { success: false, error: 'Could not check which meeting kinds use these hours.' };
    }

    return { success: true, data: count ?? 0 };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not check these working hours.',
    };
  }
}

/**
 * Delete one of the host's OWN non-default sets of working hours.
 *
 * The default set is REFUSED — every meeting kind with no schedule_id falls
 * back to it, so a host must always keep one. Meeting kinds pointing at the
 * deleted set move to the host's normal hours (schedule_id is ON DELETE SET
 * NULL); the returned count is what the dialog warned about.
 */
export async function deleteSchedule(
  scheduleId: string,
): Promise<ActionResult<{ affectedMeetingTypes: number }>> {
  try {
    if (!scheduleId || typeof scheduleId !== 'string') {
      return { success: false, error: 'Invalid schedule reference. Please reload the page.' };
    }
    const userId = await getCurrentUserId();
    const supabase = await untypedClient();

    const { data: schedule } = await supabase
      .from('meeting_host_schedules')
      .select('id, is_default')
      .eq('id', scheduleId)
      .eq('host_profile_id', userId) // ownership in the action, not only in RLS
      .maybeSingle();
    if (!schedule) {
      return {
        success: false,
        error: 'That set of working hours was not found. Please reload the page.',
      };
    }
    if (schedule.is_default) {
      return {
        success: false,
        error:
          'These are your normal working hours, so they cannot be deleted — every meeting kind falls back to them.',
      };
    }

    const { count } = await supabase
      .from('meeting_types')
      .select('id', { count: 'exact', head: true })
      .eq('host_profile_id', userId)
      .eq('schedule_id', scheduleId);

    const { error } = await supabase
      .from('meeting_host_schedules')
      .delete()
      .eq('id', scheduleId)
      .eq('host_profile_id', userId);
    if (error) {
      console.error('[meetings/availability] schedule delete failed:', error.message);
      return { success: false, error: 'Could not remove that set of working hours. Please try again.' };
    }

    return { success: true, data: { affectedMeetingTypes: count ?? 0 } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not remove that set of working hours.',
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// M2 — date-specific overrides (holidays / special hours)
//
// Semantics (engine: native-slot-engine.ts): if ANY override rows exist for a
// date they REPLACE that date's weekly windows. A single NULL/NULL row closes
// the whole day; one or more start/end rows define that date's open windows.
// All writes are scoped to the caller's OWN schedule (ownership re-checked here
// AND enforced by RLS mso_host_all).
// ──────────────────────────────────────────────────────────────────────────

export interface ScheduleOverride {
  id: string;
  /** "YYYY-MM-DD" (schedule timezone). */
  date: string;
  /** null = closed all day. */
  startMinute: number | null;
  endMinute: number | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Verify the schedule belongs to the signed-in host; returns it or null. */
async function ownedSchedule(
  supabase: SupabaseClient,
  scheduleId: string,
  userId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('meeting_host_schedules')
    .select('id')
    .eq('id', scheduleId)
    .eq('host_profile_id', userId)
    .maybeSingle();
  return data ?? null;
}

/** List a schedule's date overrides (future-first), for the holidays editor. */
export async function listScheduleOverrides(
  scheduleId: string,
): Promise<ActionResult<ScheduleOverride[]>> {
  try {
    if (!scheduleId || typeof scheduleId !== 'string') {
      return { success: false, error: 'Invalid schedule reference. Please reload the page.' };
    }
    const userId = await getCurrentUserId();
    const supabase = await untypedClient();
    if (!(await ownedSchedule(supabase, scheduleId, userId))) {
      return { success: false, error: 'Schedule not found. Please reload the page.' };
    }

    const { data, error } = await supabase
      .from('meeting_schedule_overrides')
      .select('id, date, start_minute, end_minute')
      .eq('schedule_id', scheduleId)
      .order('date', { ascending: true });
    if (error) {
      console.error('[meetings/availability] override list failed:', error.message);
      return { success: false, error: 'Could not load your date overrides. Please try again.' };
    }
    return {
      success: true,
      data: (data ?? []).map((r) => ({
        id: r.id,
        date: r.date,
        startMinute: r.start_minute,
        endMinute: r.end_minute,
      })),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not load your date overrides.',
    };
  }
}

export interface AddOverrideInput {
  scheduleId: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** true = closed all day (writes one NULL/NULL row). */
  closed: boolean;
  /** Required when !closed — "HH:mm". */
  startTime?: string;
  endTime?: string;
}

/**
 * Set a date's override. REPLACE semantics per date: any existing rows for that
 * date are removed first, then the new row(s) inserted — so toggling a day
 * between "closed" and "special hours" is clean and idempotent.
 */
export async function setScheduleOverride(
  input: AddOverrideInput,
): Promise<ActionResult<ScheduleOverride[]>> {
  try {
    const { scheduleId, date, closed } = input;
    if (!scheduleId || typeof scheduleId !== 'string') {
      return { success: false, error: 'Invalid schedule reference. Please reload the page.' };
    }
    if (!DATE_RE.test(date ?? '')) {
      return { success: false, error: 'Please choose a valid date.' };
    }

    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    let startMinute: number | null = null;
    let endMinute: number | null = null;
    if (!closed) {
      const s = input.startTime ?? '';
      const e = input.endTime ?? '';
      if (!timeRe.test(s) || !timeRe.test(e)) {
        return { success: false, error: 'Times must be in 24-hour HH:mm format.' };
      }
      if (s >= e) {
        return {
          success: false,
          error: `Start time (${s}) must be before end time (${e}).`,
        };
      }
      startMinute = toMinutes(s);
      endMinute = toMinutes(e);
    }

    const userId = await getCurrentUserId();
    const supabase = await untypedClient();
    if (!(await ownedSchedule(supabase, scheduleId, userId))) {
      return { success: false, error: 'Schedule not found. Please reload the page.' };
    }

    // REPLACE this date's rows.
    const { error: delErr } = await supabase
      .from('meeting_schedule_overrides')
      .delete()
      .eq('schedule_id', scheduleId)
      .eq('date', date);
    if (delErr) {
      console.error('[meetings/availability] override clear failed:', delErr.message);
      return { success: false, error: 'Could not save the override. Please try again.' };
    }

    const { error: insErr } = await supabase.from('meeting_schedule_overrides').insert({
      schedule_id: scheduleId,
      date,
      start_minute: startMinute,
      end_minute: endMinute,
    });
    if (insErr) {
      console.error('[meetings/availability] override insert failed:', insErr.message);
      return { success: false, error: 'Could not save the override. Please try again.' };
    }

    return listScheduleOverrides(scheduleId);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not save the override.',
    };
  }
}

/** Remove ALL override rows for a date (reverts the date to weekly hours). */
export async function deleteScheduleOverrideDate(
  scheduleId: string,
  date: string,
): Promise<ActionResult<ScheduleOverride[]>> {
  try {
    if (!scheduleId || typeof scheduleId !== 'string') {
      return { success: false, error: 'Invalid schedule reference. Please reload the page.' };
    }
    if (!DATE_RE.test(date ?? '')) {
      return { success: false, error: 'Invalid date.' };
    }
    const userId = await getCurrentUserId();
    const supabase = await untypedClient();
    if (!(await ownedSchedule(supabase, scheduleId, userId))) {
      return { success: false, error: 'Schedule not found. Please reload the page.' };
    }

    const { error } = await supabase
      .from('meeting_schedule_overrides')
      .delete()
      .eq('schedule_id', scheduleId)
      .eq('date', date);
    if (error) {
      console.error('[meetings/availability] override delete failed:', error.message);
      return { success: false, error: 'Could not remove the override. Please try again.' };
    }
    return listScheduleOverrides(scheduleId);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not remove the override.',
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// U3 — public booking page + Google connection state (Universal Booking)
// Spec: specs/universal-booking-module-2026-06-12.md (D1/D5/D19/D20)
// ──────────────────────────────────────────────────────────────────────────

export interface BookingPageState {
  /** null = integration env not provisioned yet (connect button disabled). */
  googleConfigured: boolean;
  connection: {
    status: 'active' | 'broken' | 'revoked';
    googleEmail: string;
    /**
     * Is every calendar this host owns checked for busy time, or only 'primary'?
     * null = not yet probed, false = primary only (they must reconnect to grant
     * the calendar-list scope). Connections made before 2026-08-05 cannot list
     * calendars at all, so a meeting kept on a second calendar is invisible to
     * the slot engine and that slot is still offered to strangers.
     */
    allCalendarsChecked: boolean | null;
  } | null;
  page: {
    handle: string;
    isPublic: boolean;
    autoHidden: boolean;
    autoHiddenReason: string | null;
    headline: string | null;
  } | null;
  /** Collision-free suggestion shown when the host has no page row yet. */
  suggestedHandle: string;
  appUrl: string;
}

/** Mirrors the DB CHECK on meeting_host_pages.handle (friendly errors first). */
const HANDLE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED_HANDLES = new Set([
  'admin', 'api', 'app', 'auth', 'book', 'cancel', 'directory', 'help', 'jkkn',
  'login', 'logout', 'mail', 'meet', 'meetings', 'new', 'privacy', 'reschedule',
  'settings', 'static', 'support', 'terms', 'www',
]);

function slugifyName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Suggestion-time collision check needs to see OTHER hosts' handles, which
 * RLS correctly forbids — service-role read of the handle column only.
 */
function serviceClient(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ) as unknown as SupabaseClient;
}

export async function getBookingPageState(): Promise<ActionResult<BookingPageState>> {
  try {
    const supabase = await untypedClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'You are signed out. Please sign in and try again.' };
    }

    const [{ data: conn }, { data: page }, { data: profile }] = await Promise.all([
      supabase
        .from('meeting_host_google_connections')
        .select('status, google_email, calendar_list_scope')
        .eq('host_profile_id', user.id)
        .maybeSingle(),
      supabase
        .from('meeting_host_pages')
        .select('handle, is_public, auto_hidden, auto_hidden_reason, headline')
        .eq('host_profile_id', user.id)
        .maybeSingle(),
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    ]);

    // Collision-free suggestion only matters before the row exists.
    let suggestedHandle = page?.handle ?? '';
    if (!page) {
      const base = slugifyName((profile?.full_name as string | undefined) ?? '') || 'my-page';
      const svc = serviceClient();
      const { data: taken } = await svc
        .from('meeting_host_pages')
        .select('handle')
        .like('handle', `${base}%`);
      const takenSet = new Set((taken ?? []).map((t: { handle: string }) => t.handle));
      suggestedHandle = base;
      for (let i = 2; takenSet.has(suggestedHandle) || RESERVED_HANDLES.has(suggestedHandle); i++) {
        suggestedHandle = `${base}-${i}`;
      }
    }

    return {
      success: true,
      data: {
        googleConfigured: isGoogleCalConfigured(),
        connection: conn
          ? {
            status: conn.status,
            googleEmail: conn.google_email,
            allCalendarsChecked: (conn as { calendar_list_scope?: boolean | null }).calendar_list_scope ?? null,
          }
          : null,
        page: page
          ? {
              handle: page.handle,
              isPublic: Boolean(page.is_public),
              autoHidden: Boolean(page.auto_hidden),
              autoHiddenReason: page.auto_hidden_reason ?? null,
              headline: page.headline ?? null,
            }
          : null,
        suggestedHandle,
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not load your booking page settings.',
    };
  }
}

export interface SavePublicPageInput {
  /** Required on first save; immutable afterwards (D5: editable once, at claim). */
  handle: string;
  headline?: string;
  isPublic: boolean;
}

export async function savePublicPage(
  input: SavePublicPageInput,
): Promise<ActionResult<BookingPageState['page']>> {
  try {
    const supabase = await untypedClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'You are signed out. Please sign in and try again.' };
    }

    const handle = (input.handle ?? '').toLowerCase().trim();
    if (!HANDLE_RE.test(handle) || handle.length < 3 || handle.length > 50) {
      return {
        success: false,
        error: 'Handle must be 3–50 characters: lowercase letters, numbers and single hyphens.',
      };
    }
    if (RESERVED_HANDLES.has(handle)) {
      return { success: false, error: 'That handle is reserved. Please pick another.' };
    }
    const headline = input.headline?.trim().slice(0, 200) || null;

    const { data: existing } = await supabase
      .from('meeting_host_pages')
      .select('id, handle, auto_hidden, is_public')
      .eq('host_profile_id', user.id)
      .maybeSingle();

    // D5 (relaxed 2026-06-21): the handle locks at PUBLISH time, not at first save.
    // A leader can rename a reserved/draft page freely until they switch it on; once
    // the page is public the link may already be shared, so further changes go
    // through admins. (Pre-created leadership pages ship as drafts, so they stay
    // renameable until each leader publishes.)
    if (existing && existing.is_public && existing.handle !== handle) {
      return {
        success: false,
        error: 'Your page is live, so its address is locked. Contact an administrator to change it.',
      };
    }

    // D20: a public page requires an ACTIVE Google connection — no exceptions.
    if (input.isPublic) {
      const { data: conn } = await supabase
        .from('meeting_host_google_connections')
        .select('status')
        .eq('host_profile_id', user.id)
        .maybeSingle();
      if (!conn || conn.status !== 'active') {
        return {
          success: false,
          error:
            'Connect your Google Calendar first — public pages require it so your real calendar protects you from double-booking.',
        };
      }
    }

    const row = {
      host_profile_id: user.id,
      handle,
      headline,
      is_public: input.isPublic,
      // A deliberate save clears a stale auto-hide (reconnect path also does).
      ...(existing?.auto_hidden && input.isPublic
        ? { auto_hidden: false, auto_hidden_reason: null }
        : {}),
    };

    const { data, error } = existing
      ? await supabase
          .from('meeting_host_pages')
          .update(row)
          .eq('id', existing.id)
          .select('handle, is_public, auto_hidden, auto_hidden_reason, headline')
          .single()
      : await supabase
          .from('meeting_host_pages')
          .insert(row)
          .select('handle, is_public, auto_hidden, auto_hidden_reason, headline')
          .single();

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'That handle is already taken. Please pick another.' };
      }
      if (error.code === '23514') {
        return { success: false, error: 'That handle is not allowed. Please pick another.' };
      }
      console.error('[meetings/availability] savePublicPage failed:', error.message);
      return { success: false, error: 'Could not save your booking page. Please try again.' };
    }

    return {
      success: true,
      data: {
        handle: data.handle,
        isPublic: Boolean(data.is_public),
        autoHidden: Boolean(data.auto_hidden),
        autoHiddenReason: data.auto_hidden_reason ?? null,
        headline: data.headline ?? null,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not save your booking page.',
    };
  }
}
