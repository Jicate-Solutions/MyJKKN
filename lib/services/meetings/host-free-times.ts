// lib/services/meetings/host-free-times.ts
//
// 'That time is taken — here are the next free ones.' Used by the outside-AI
// booking door when a requested time clashes (Director, 9 Oct 2026: 'Offer my
// next free times').
//
// A host-direct meeting has no meeting type, so a type's published hours do
// not apply. It uses the HOST any-time rule instead (host-any-time.ts:
// 07:00–22:00 India time, no notice window) — the same rule the host is offered
// when moving their own meeting. Confirmed meetings and Google Calendar busy
// times block (NativeSchedulingService.hostBusy, which fails CLOSED: if busy
// times cannot be read, nothing is offered).

import type { SupabaseClient } from '@supabase/supabase-js';
import { CAMPUS_TZ } from '@/lib/services/meetings/host-scheduling-service';
import { hostAnyTimeSlotInput } from '@/lib/services/meetings/host-any-time';
import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';
import { computeSlots } from '@/lib/services/meetings/native-slot-engine';

/** Candidate starts are on the half hour. */
export const FREE_TIME_STEP_MIN = 30;
/** How far ahead to look for free times. */
export const FREE_TIME_DAYS = 7;

function indiaDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMPUS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Up to `count` free start instants (ISO, UTC) for a meeting of `durationMin`
 * on the host's calendar, at or after `afterIso`, within FREE_TIME_DAYS.
 * Returns [] when nothing is free or busy times cannot be verified.
 */
export async function nextFreeTimes(
  supabase: SupabaseClient,
  hostProfileId: string,
  opts: { afterIso: string; durationMin: number; count?: number; now?: Date },
): Promise<string[]> {
  const now = opts.now ?? new Date();
  const count = opts.count ?? 3;
  const after = new Date(
    Math.max(new Date(opts.afterIso).getTime(), now.getTime()),
  );
  const until = new Date(after.getTime() + FREE_TIME_DAYS * 86_400_000);

  const busy = await NativeSchedulingService.hostBusy(
    supabase,
    hostProfileId,
    after.toISOString(),
    until.toISOString(),
  );
  const slots = computeSlots({
    timezone: CAMPUS_TZ,
    durationMin: opts.durationMin,
    bookings: busy,
    slotIntervalMin: FREE_TIME_STEP_MIN,
    fromDate: indiaDate(after),
    toDate: indiaDate(until),
    now,
    ...hostAnyTimeSlotInput(),
  });
  return slots
    .map((s) => s.start)
    // Only times whose whole length lies inside the range busy times were
    // read for — the last day's slots run past `until` and are unverified.
    .filter((start) => {
      const t = new Date(start).getTime();
      return t >= after.getTime() && t + opts.durationMin * 60_000 <= until.getTime();
    })
    .slice(0, count);
}
