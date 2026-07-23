// __tests__/meetings/calendar-sync-service.test.ts
//
// Guards the INBOUND reconcile decision logic (the part that writes
// cancellations to live bookings). The cardinal rule under test: a booking is
// cancelled ONLY on a definitive 'gone' signal — a transient failure (null)
// must change NOTHING. Also covers reschedule-on-move and unmatched-event noop.
//
// Strategy: mock GoogleCalendarService (the network) and drive safetyReconcile
// with a minimal chainable Supabase stub that records every .update() payload.

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── mock the Google network layer ────────────────────────────────────────────
const getEvent = vi.fn();
vi.mock('@/lib/services/integrations/google-calendar-service', () => ({
  GoogleCalendarService: {
    getEvent: (...args: unknown[]) => getEvent(...args),
  },
}));

import { CalendarSyncService } from '@/lib/services/meetings/calendar-sync-service';

// ── a tiny chainable Supabase stub ───────────────────────────────────────────
// Every builder method returns `this`; the builder is thenable AND exposes
// maybeSingle() — both resolve the next queued response. update() payloads are
// captured so tests can assert exactly what was written.
function makeSupabase(responses: Array<{ data: unknown; error?: unknown }>) {
  const updates: Array<Record<string, unknown>> = [];
  let i = 0;
  const next = () => responses[i++] ?? { data: null, error: null };
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'eq', 'not', 'in', 'gte', 'lte', 'limit', 'order'];
  for (const m of passthrough) builder[m] = () => builder;
  builder.update = (payload: Record<string, unknown>) => {
    updates.push(payload);
    return builder;
  };
  builder.maybeSingle = () => Promise.resolve(next());
  // thenable: `await builder` (chains ending in .limit()) resolves next response
  builder.then = (resolve: (v: unknown) => unknown) => resolve(next());
  return {
    from: () => builder,
    __updates: updates,
  } as never;
}

const booking = {
  id: 'b1',
  uid: 'UID1',
  google_event_id: 'gev1',
  start_time: '2026-06-22T05:15:00+00:00',
  end_time: '2026-06-22T05:30:00+00:00',
};

beforeEach(() => {
  getEvent.mockReset();
});

describe('CalendarSyncService.safetyReconcile', () => {
  it('cancels a confirmed booking when Google says the event is gone', async () => {
    getEvent.mockResolvedValue('gone');
    const supabase = makeSupabase([
      { data: [booking] }, // bookings fetch
      { data: { id: 'b1' }, error: null }, // cancel update
    ]);
    const r = await CalendarSyncService.safetyReconcile(supabase, 'host1');
    expect(r).toMatchObject({ ok: true, cancelled: 1, rescheduled: 0 });
    const upd = (supabase as unknown as { __updates: Record<string, unknown>[] }).__updates;
    expect(upd[0]).toMatchObject({
      status: 'cancelled',
      cancelled_by: 'system',
      cancellation_reason: 'Cancelled in Google Calendar',
    });
    expect(upd[0].synced_from_google_at).toBeTruthy();
  });

  it('does NOTHING on a transient getEvent failure (null) — never cancels on uncertainty', async () => {
    getEvent.mockResolvedValue(null);
    const supabase = makeSupabase([{ data: [booking] }]);
    const r = await CalendarSyncService.safetyReconcile(supabase, 'host1');
    expect(r).toMatchObject({ ok: true, cancelled: 0, rescheduled: 0 });
    expect((supabase as unknown as { __updates: unknown[] }).__updates).toHaveLength(0);
  });

  it('reschedules when the Google event moved to a new time', async () => {
    getEvent.mockResolvedValue({
      startIso: '2026-06-22T06:15:00+00:00', // moved +1h
      endIso: '2026-06-22T06:30:00+00:00',
    });
    const supabase = makeSupabase([
      { data: [booking] }, // bookings fetch
      { data: { reschedule_count: 0 } }, // read current count
      { data: { id: 'b1' }, error: null }, // reschedule update
    ]);
    const r = await CalendarSyncService.safetyReconcile(supabase, 'host1');
    expect(r).toMatchObject({ ok: true, cancelled: 0, rescheduled: 1 });
    const upd = (supabase as unknown as { __updates: Record<string, unknown>[] }).__updates;
    const move = upd.find((u) => u.start_time);
    expect(move).toMatchObject({
      start_time: '2026-06-22T06:15:00+00:00',
      reschedule_count: 1,
      previous_start_time: booking.start_time,
    });
  });

  it('leaves a booking untouched when the Google event is unchanged', async () => {
    getEvent.mockResolvedValue({
      startIso: booking.start_time,
      endIso: booking.end_time,
    });
    const supabase = makeSupabase([{ data: [booking] }]);
    const r = await CalendarSyncService.safetyReconcile(supabase, 'host1');
    expect(r).toMatchObject({ ok: true, cancelled: 0, rescheduled: 0 });
    expect((supabase as unknown as { __updates: unknown[] }).__updates).toHaveLength(0);
  });
});
