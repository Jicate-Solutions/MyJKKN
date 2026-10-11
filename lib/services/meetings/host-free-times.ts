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
/** Gap kept before and after a busy time (the booking guard's 5-minute pad). */
export const FREE_TIME_GAP_MIN = 5;

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
  opts: {
    afterIso: string;
    durationMin: number;
    count?: number;
    now?: Date;
    /**
     * The meeting being moved. Every busy block with exactly its range is
     * dropped — the same meeting appears twice (the booking row, and its event
     * in Google busy times), so dropping one copy would keep blocking it. Its
     * own current start is never offered.
     */
    ignore?: { start: string; end: string };
  },
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
  const sameRange = (b: { start: string; end: string }, c: { start: string; end: string }) =>
    new Date(b.start).getTime() === new Date(c.start).getTime() &&
    new Date(b.end).getTime() === new Date(c.end).getTime();
  const counted = opts.ignore ? busy.filter((b) => !sameRange(b, opts.ignore!)) : busy;
  const slots = computeSlots({
    timezone: CAMPUS_TZ,
    durationMin: opts.durationMin,
    bookings: counted,
    // The booking guard keeps a 5-minute gap on both sides of a confirmed
    // meeting (mb_no_double_booking_padded). A suggestion that touches another
    // meeting would be refused as SLOT_TAKEN and suggested again, so the gap is
    // kept here too. Next to Google-only events it over-excludes by 5 minutes.
    bufferBeforeMin: FREE_TIME_GAP_MIN,
    bufferAfterMin: FREE_TIME_GAP_MIN,
    slotIntervalMin: FREE_TIME_STEP_MIN,
    fromDate: indiaDate(after),
    toDate: indiaDate(until),
    now,
    ...hostAnyTimeSlotInput(),
  });
  // The meeting's own current start is not a "new" time to offer.
  const ownStart = opts.ignore ? new Date(opts.ignore.start).getTime() : null;
  return slots
    .map((s) => s.start)
    .filter((start) => ownStart === null || new Date(start).getTime() !== ownStart)
    // Only times whose whole length lies inside the range busy times were
    // read for — the last day's slots run past `until` and are unverified.
    .filter((start) => {
      const t = new Date(start).getTime();
      return t >= after.getTime() && t + opts.durationMin * 60_000 <= until.getTime();
    })
    .slice(0, count);
}
