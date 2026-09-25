/**
 * Meetings follow-up routine — the pure rules and the route's send decisions.
 *
 * Pure functions (lib/services/meetings/meeting-followup-routine.ts) are tested
 * directly. The route is tested against a fake Supabase client and a mocked
 * fanoutNotification, so "sends nothing" is asserted as zero fan-out calls, not
 * inferred from a count in the response.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  buildHostDigests,
  digestKey,
  digestTitle,
  effectiveFloor,
  isoWeekKey,
  recordReadyBody,
  recordReadyKey,
  recordReadyTitle,
  selectRecordReadyNotes,
  type AppliedNote,
} from '@/lib/services/meetings/meeting-followup-routine';

// ── fakes for the route ─────────────────────────────────────────────────────
type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = self;
  b.order = self;
  b.limit = self;
  b.not = (col: string) => {
    rows = rows.filter((r) => r[col] !== null && r[col] !== undefined);
    return b;
  };
  b.eq = (col: string, v: unknown) => {
    rows = rows.filter((r) => r[col] === v);
    return b;
  };
  b.in = (col: string, vs: unknown[]) => {
    rows = rows.filter((r) => vs.includes(r[col]));
    return b;
  };
  b.gte = (col: string, v: string) => {
    rows = rows.filter((r) => typeof r[col] === 'string' && (r[col] as string) >= v);
    return b;
  };
  b.lt = (col: string, v: string) => {
    rows = rows.filter((r) => typeof r[col] === 'string' && (r[col] as string) < v);
    return b;
  };
  b.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => builder(t) }),
}));

const fanout = vi.fn(async () => ({ notified: 1, notificationId: 'n1' }));
vi.mock('@/lib/services/_shared/notifications/notify', () => ({
  fanoutNotification: (...args: unknown[]) => fanout(...(args as [])),
}));

const SECRET = 'test-secret';

async function run(query = '') {
  const { GET } = await import('@/app/api/cron/meetings-followup-routine/route');
  const req = new NextRequest(`http://localhost/api/cron/meetings-followup-routine${query}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  });
  const res = await GET(req);
  return (await res.json()) as Record<string, unknown>;
}

const recent = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

// ── pure rules ──────────────────────────────────────────────────────────────
describe('floor filtering', () => {
  const floor = '2026-10-01T00:00:00.000Z';
  const notes: AppliedNote[] = [
    { id: 'old', booking_id: 'b1', title: 'x', action_items_applied_at: '2026-09-30T23:59:59.000Z' },
    { id: 'at', booking_id: 'b1', title: 'x', action_items_applied_at: floor },
    { id: 'new', booking_id: 'b2', title: 'x', action_items_applied_at: '2026-10-02T00:00:00.000Z' },
    { id: 'unmatched', booking_id: null, title: 'x', action_items_applied_at: '2026-10-02T00:00:00.000Z' },
    { id: 'unapplied', booking_id: 'b3', title: 'x', action_items_applied_at: null },
  ];

  it('keeps only matched, applied notes at or after the floor', () => {
    expect(selectRecordReadyNotes(notes, floor).map((n) => n.id)).toEqual(['at', 'new']);
  });

  it('the effective floor is the later of the routine floor and the 7-day lookback', () => {
    const now = new Date('2026-10-20T00:00:00.000Z');
    expect(effectiveFloor('2026-10-01T00:00:00.000Z', now)).toBe('2026-10-13T00:00:00.000Z');
    expect(effectiveFloor('2026-10-18T00:00:00.000Z', now)).toBe('2026-10-18T00:00:00.000Z');
  });
});

describe('record-ready wording', () => {
  it('adds the mark-whether-it-happened clause only while the meeting reads confirmed', () => {
    expect(recordReadyBody(3, 'confirmed')).toBe('3 follow-ups to confirm, and mark whether it happened');
    expect(recordReadyBody(3, 'completed')).toBe('3 follow-ups to confirm');
    expect(recordReadyBody(1, 'cancelled')).toBe('1 follow-up to confirm');
  });

  it('title names the note, with a fallback when the note has none', () => {
    expect(recordReadyTitle('Budget review')).toBe('Meeting record ready — Budget review');
    expect(recordReadyTitle(null)).toBe('Meeting record ready — your meeting');
  });

  it('key is per note', () => {
    expect(recordReadyKey('abc')).toBe('meetings:record-ready:abc');
  });
});

describe('ISO-week key', () => {
  it('reads the week on the IST calendar', () => {
    // Sunday 2026-09-27 20:00 UTC is already Monday 2026-09-28 01:30 IST.
    expect(isoWeekKey(new Date('2026-09-27T12:00:00.000Z'))).toBe('2026-W39');
    expect(isoWeekKey(new Date('2026-09-27T20:00:00.000Z'))).toBe('2026-W40');
  });

  it('handles the year boundary the ISO way', () => {
    // Thursday 2026-12-31 belongs to 2026-W53; Friday 2027-01-01 too.
    expect(isoWeekKey(new Date('2027-01-01T06:00:00.000Z'))).toBe('2026-W53');
    expect(isoWeekKey(new Date('2027-01-04T06:00:00.000Z'))).toBe('2027-W01');
  });

  it('digest key is host + week', () => {
    expect(digestKey('h1', new Date('2026-09-27T12:00:00.000Z'))).toBe('meetings:followups:h1:2026-W39');
  });
});

describe('weekly digest grouping', () => {
  it('counts only items older than 7 days and names the oldest meetings first', () => {
    const now = new Date('2026-10-20T00:00:00.000Z');
    const d = buildHostDigests(
      [
        { host_profile_id: 'h1', booking_id: 'bA', created_at: '2026-10-01T00:00:00.000Z' },
        { host_profile_id: 'h1', booking_id: 'bA', created_at: '2026-10-05T00:00:00.000Z' },
        { host_profile_id: 'h1', booking_id: 'bB', created_at: '2026-09-20T00:00:00.000Z' },
        { host_profile_id: 'h1', booking_id: 'bC', created_at: '2026-10-19T00:00:00.000Z' }, // fresh
        { host_profile_id: 'h2', booking_id: 'bD', created_at: '2026-10-18T00:00:00.000Z' }, // fresh
      ],
      now,
    );
    expect(d).toHaveLength(1);
    expect(d[0]).toEqual({
      hostId: 'h1',
      itemCount: 3,
      meetingCount: 2,
      oldestDays: 30,
      oldestBookingIds: ['bB', 'bA'],
    });
    expect(digestTitle(d[0])).toBe('3 open follow-ups across 2 meetings, oldest 30 days');
  });
});

// ── the route ───────────────────────────────────────────────────────────────
describe('route', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    fanout.mockClear();
    tables = {};
  });

  it('floor row missing → sends NOTHING and reports floorMissing', async () => {
    tables = {
      ai_routine_schedules: [],
      meeting_notes: [{ id: 'n1', booking_id: 'b1', title: 'T', action_items_applied_at: recent(1) }],
      meeting_bookings: [{ id: 'b1', uid: 'u1', host_profile_id: 'h1', status: 'confirmed' }],
      meeting_action_items: [{ host_profile_id: 'h1', booking_id: 'b1', status: 'open', created_at: recent(30) }],
      notifications: [],
    };
    const body = await run();
    expect(body.floorMissing).toBe(true);
    expect(fanout).not.toHaveBeenCalled();
  });

  it('one card per note, historical notes before the floor are not carded', async () => {
    tables = {
      ai_routine_schedules: [{ routine_id: 'meetings-followup-routine', created_at: recent(3), enabled: true }],
      meeting_notes: [
        { id: 'before', booking_id: 'b1', title: 'Old', action_items_applied_at: recent(5) },
        { id: 'n1', booking_id: 'b1', title: 'Budget', action_items_applied_at: recent(1) },
        { id: 'n2', booking_id: 'b2', title: 'Hiring', action_items_applied_at: recent(1) },
      ],
      meeting_bookings: [
        { id: 'b1', uid: 'u1', host_profile_id: 'h1', status: 'confirmed', attendee_name: 'A' },
        { id: 'b2', uid: 'u2', host_profile_id: 'h1', status: 'completed', attendee_name: 'B' },
      ],
      meeting_action_items: [
        { host_profile_id: 'h1', booking_id: 'b1', status: 'open', created_at: recent(1) },
        { host_profile_id: 'h1', booking_id: 'b1', status: 'open', created_at: recent(1) },
        { host_profile_id: 'h1', booking_id: 'b2', status: 'done', created_at: recent(1) },
      ],
      notifications: [],
    };
    const body = await run();
    expect(body.carded).toBe(2);
    expect(body.digests).toBe(0);
    const calls = fanout.mock.calls.map((c) => (c as unknown[])[1] as Record<string, unknown>);
    expect(calls.map((c) => c.idempotencyKey)).toEqual([
      'meetings:record-ready:n1',
      'meetings:record-ready:n2',
    ]);
    expect(calls[0].body).toBe('2 follow-ups to confirm, and mark whether it happened');
    expect(calls[0].userIds).toEqual(['h1']);
    expect(calls[0].url).toBe('/meetings/u1');
    expect(calls[1].body).toBe('No open follow-ups to confirm');
  });

  it('an already-sent note counts as duplicate and is not re-sent', async () => {
    tables = {
      ai_routine_schedules: [{ routine_id: 'meetings-followup-routine', created_at: recent(3), enabled: true }],
      meeting_notes: [{ id: 'n1', booking_id: 'b1', title: 'T', action_items_applied_at: recent(1) }],
      meeting_bookings: [{ id: 'b1', uid: 'u1', host_profile_id: 'h1', status: 'confirmed' }],
      meeting_action_items: [],
      notifications: [{ idempotency_key: 'meetings:record-ready:n1' }],
    };
    const body = await run();
    expect(body.duplicate).toBe(1);
    expect(fanout).not.toHaveBeenCalled();
  });

  it('a disabled schedule row, or ?dry=1, writes nothing', async () => {
    const base = {
      meeting_notes: [{ id: 'n1', booking_id: 'b1', title: 'T', action_items_applied_at: recent(1) }],
      meeting_bookings: [{ id: 'b1', uid: 'u1', host_profile_id: 'h1', status: 'confirmed' }],
      meeting_action_items: [],
      notifications: [],
    };
    tables = {
      ...base,
      ai_routine_schedules: [{ routine_id: 'meetings-followup-routine', created_at: recent(3), enabled: false }],
    };
    const off = await run();
    expect(off.wrote).toBe(false);
    expect(off.carded).toBe(1);
    tables = {
      ...base,
      ai_routine_schedules: [{ routine_id: 'meetings-followup-routine', created_at: recent(3), enabled: true }],
    };
    const dry = await run('?dry=1');
    expect(dry.wrote).toBe(false);
    expect(fanout).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', async () => {
    const { GET } = await import('@/app/api/cron/meetings-followup-routine/route');
    const res = await GET(
      new NextRequest('http://localhost/api/cron/meetings-followup-routine', {
        headers: { authorization: 'Bearer nope' },
      }),
    );
    expect(res.status).toBe(401);
  });
});
