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

// ──────────────────────────────────────────────────────────────────────────
// U3 — public booking page + Google connection state (Universal Booking)
// Spec: specs/universal-booking-module-2026-06-12.md (D1/D5/D19/D20)
// ──────────────────────────────────────────────────────────────────────────

export interface BookingPageState {
  /** null = integration env not provisioned yet (connect button disabled). */
  googleConfigured: boolean;
  connection: { status: 'active' | 'broken' | 'revoked'; googleEmail: string } | null;
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
        .select('status, google_email')
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
          ? { status: conn.status, googleEmail: conn.google_email }
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
      .select('id, handle, auto_hidden')
      .eq('host_profile_id', user.id)
      .maybeSingle();

    // D5: the handle locks at claim time — support changes go through admins.
    if (existing && existing.handle !== handle) {
      return {
        success: false,
        error: 'Your handle is already set and cannot be changed here. Contact an administrator.',
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
