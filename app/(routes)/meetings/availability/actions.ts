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
 * Fetch the host's default schedule (creating Mon–Fri 09:00–17:00 IST on
 * first visit so the editor is never blank).
 */
export async function getMySchedule(): Promise<ActionResult<MyScheduleData>> {
  try {
    const userId = await getCurrentUserId();
    const supabase = await untypedClient();

    let { data: schedule } = await supabase
      .from('meeting_host_schedules')
      .select('id, name, timezone')
      .eq('host_profile_id', userId)
      .eq('is_default', true)
      .maybeSingle();

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

      const weekdayRows = [1, 2, 3, 4, 5].map((weekday) => ({
        schedule_id: created.id,
        weekday,
        start_minute: 9 * 60,
        end_minute: 17 * 60,
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
