// lib/services/meetings/calendar-sync-service.ts
//
// Universal Booking — INBOUND reconcile: make meeting_bookings match Google
// Calendar after the host edits an event directly in Google.
//
// Two entry points:
//   • reconcileHostFromGoogle  — fast DELTA path (webhook). Reads the change
//     stream since the stored sync_token; applies cancel/reschedule.
//   • safetyReconcile          — thorough TARGETED path (cron). Re-checks every
//     confirmed future booking by id (events.get). Catches pings Google didn't
//     deliver AND bookings that predate the sync cursor (e.g. the smoke-test
//     booking that was already stale when the watch was first set up).
//
// CORRECTNESS RULES (this writes cancellations to live bookings):
//   • Only cancel on a DEFINITIVE signal — Google status='cancelled' or a 404/
//     410 'gone'. A transient API failure returns null and changes NOTHING.
//   • cancelled_by must be one of ('attendee','host','system') — we use
//     'system' and record the origin in cancellation_reason.
//   • A reschedule UPDATE re-arbitrates against mb_no_double_booking; a 23P01
//     overlap is caught and skipped, never thrown.

import type { SupabaseClient } from '@supabase/supabase-js';
import { GoogleCalendarService } from '@/lib/services/integrations/google-calendar-service';

const LOG_PREFIX = '[calendar-sync]';
const GOOGLE_CANCEL_REASON = 'Cancelled in Google Calendar';

export interface ReconcileResult {
  ok: boolean;
  cancelled: number;
  rescheduled: number;
  reason?: string;
}

interface BookingRow {
  id: string;
  uid: string;
  google_event_id: string;
  start_time: string;
  end_time: string;
}

export class CalendarSyncService {
  /**
   * DELTA reconcile for one host (webhook path). Reads changed events since the
   * stored sync_token, matches them to this host's confirmed bookings, and
   * applies cancel / reschedule. Persists the new sync_token on success.
   */
  static async reconcileHostFromGoogle(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<ReconcileResult> {
    const delta = await GoogleCalendarService.listEventChanges(supabase, hostProfileId);

    if (!delta) return { ok: false, cancelled: 0, rescheduled: 0, reason: 'list_failed' };
    if ('expired' in delta) {
      // sync token died → re-seed a fresh cursor, then fall back to a targeted
      // recheck so nothing is missed in the gap.
      await GoogleCalendarService.seedSyncToken(supabase, hostProfileId);
      return this.safetyReconcile(supabase, hostProfileId);
    }
    // delta is now { changes, nextSyncToken }

    const byId = new Map(delta.changes.map((c) => [c.id, c]));
    let cancelled = 0;
    let rescheduled = 0;

    if (byId.size > 0) {
      const { data: bookings } = await supabase
        .from('meeting_bookings')
        .select('id, uid, google_event_id, start_time, end_time')
        .eq('host_profile_id', hostProfileId)
        .eq('status', 'confirmed')
        .not('google_event_id', 'is', null)
        .in('google_event_id', [...byId.keys()]);

      for (const b of (bookings ?? []) as BookingRow[]) {
        const ev = byId.get(b.google_event_id);
        if (!ev) continue;
        if (ev.status === 'cancelled') {
          if (await this.cancelBookingFromGoogle(supabase, b)) cancelled++;
        } else if (this.timeChanged(ev.startIso, ev.endIso, b)) {
          if (await this.rescheduleBookingFromGoogle(supabase, b, ev.startIso!, ev.endIso!))
            rescheduled++;
        }
      }
    }

    if (delta.nextSyncToken) {
      await GoogleCalendarService.storeSyncToken(supabase, hostProfileId, delta.nextSyncToken);
    }
    return { ok: true, cancelled, rescheduled };
  }

  /**
   * TARGETED reconcile (cron safety net). For every confirmed future booking of
   * the host, re-check the Google event directly. Bounded by the host's open
   * booking count. This is what fixes a booking that was already stale before
   * the watch channel existed.
   */
  static async safetyReconcile(
    supabase: SupabaseClient,
    hostProfileId: string,
  ): Promise<ReconcileResult> {
    const nowIso = new Date().toISOString();
    const { data: bookings } = await supabase
      .from('meeting_bookings')
      .select('id, uid, google_event_id, start_time, end_time')
      .eq('host_profile_id', hostProfileId)
      .eq('status', 'confirmed')
      .not('google_event_id', 'is', null)
      .gte('end_time', nowIso)
      .limit(500);

    let cancelled = 0;
    let rescheduled = 0;
    for (const b of (bookings ?? []) as BookingRow[]) {
      const ev = await GoogleCalendarService.getEvent(supabase, hostProfileId, b.google_event_id);
      if (ev === null) continue; // transient — never act on uncertainty
      if (ev === 'gone') {
        if (await this.cancelBookingFromGoogle(supabase, b)) cancelled++;
      } else if (this.timeChanged(ev.startIso, ev.endIso, b)) {
        if (await this.rescheduleBookingFromGoogle(supabase, b, ev.startIso!, ev.endIso!))
          rescheduled++;
      }
    }
    return { ok: true, cancelled, rescheduled };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private static timeChanged(
    startIso: string | null,
    endIso: string | null,
    b: BookingRow,
  ): boolean {
    if (!startIso || !endIso) return false;
    return (
      new Date(startIso).getTime() !== new Date(b.start_time).getTime() ||
      new Date(endIso).getTime() !== new Date(b.end_time).getTime()
    );
  }

  /**
   * Flip a booking to cancelled because Google says the event is gone. Guarded
   * by status='confirmed' for idempotency (a duplicate ping no-ops). We do NOT
   * call Google deleteEvent (it's already gone) and do NOT send our own
   * cancellation email — Google already notified the attendee when the host
   * deleted/cancelled the event with sendUpdates.
   */
  private static async cancelBookingFromGoogle(
    supabase: SupabaseClient,
    b: BookingRow,
  ): Promise<boolean> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('meeting_bookings')
      .update({
        status: 'cancelled',
        cancelled_at: nowIso,
        cancelled_by: 'system',
        cancellation_reason: GOOGLE_CANCEL_REASON,
        synced_from_google_at: nowIso,
      })
      .eq('id', b.id)
      .eq('status', 'confirmed')
      .select('id')
      .maybeSingle();
    if (error) {
      console.error(`${LOG_PREFIX} cancel ${b.uid} failed:`, error.message);
      return false;
    }
    if (data) console.log(`${LOG_PREFIX} cancelled ${b.uid} (gone in Google Calendar)`);
    return !!data;
  }

  /**
   * Move a booking to match a Google-side reschedule. Guarded by
   * status='confirmed' AND start_time=<the start we loaded> (no-op if it
   * changed under us). A 23P01 (mb_no_double_booking overlap) is caught and
   * skipped — the Google move collided with another confirmed booking; we leave
   * ours as-is rather than crash the reconcile.
   */
  private static async rescheduleBookingFromGoogle(
    supabase: SupabaseClient,
    b: BookingRow,
    startIso: string,
    endIso: string,
  ): Promise<boolean> {
    const nowIso = new Date().toISOString();
    // reschedule_count is incremented via a read-modify-write; the count is
    // advisory (display only), so a lost increment under concurrency is benign.
    const { data: cur } = await supabase
      .from('meeting_bookings')
      .select('reschedule_count')
      .eq('id', b.id)
      .maybeSingle();
    const nextCount = ((cur?.reschedule_count as number | undefined) ?? 0) + 1;

    const { data, error } = await supabase
      .from('meeting_bookings')
      .update({
        start_time: startIso,
        end_time: endIso,
        rescheduled_at: nowIso,
        reschedule_count: nextCount,
        previous_start_time: b.start_time,
        synced_from_google_at: nowIso,
      })
      .eq('id', b.id)
      .eq('status', 'confirmed')
      .eq('start_time', b.start_time)
      .select('id')
      .maybeSingle();
    if (error) {
      // 23P01 = exclusion-constraint overlap → the new slot is taken; skip.
      if (error.code === '23P01') {
        console.warn(`${LOG_PREFIX} reschedule ${b.uid} skipped — new slot overlaps another booking`);
        return false;
      }
      console.error(`${LOG_PREFIX} reschedule ${b.uid} failed:`, error.message);
      return false;
    }
    if (data) console.log(`${LOG_PREFIX} rescheduled ${b.uid} to ${startIso} (moved in Google Calendar)`);
    return !!data;
  }
}
