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
  DEFAULT_POLICIES,
  POLICY_KEYS,
  buildHostDigests,
  digestBody,
  digestKey,
  digestTitle,
  effectiveFloor,
  isoWeekKey,
  readPolicies,
  recordReadyBody,
  recordReadyKey,
  recordReadyTitle,
  selectRecordReadyNotes,
  type AppliedNote,
} from '@/lib/services/meetings/meeting-followup-routine';
import { MISC_AI_ROUTINES } from '@/lib/ai-routines/misc-ai';

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
  b.like = (col: string, pattern: string) => {
    const prefix = pattern.endsWith('%') ? pattern.slice(0, -1) : pattern;
    rows = rows.filter((r) => typeof r[col] === 'string' && (r[col] as string).startsWith(prefix));
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
    expect(effectiveFloor('2026-10-01T00:00:00.000Z', now, 7)).toBe('2026-10-13T00:00:00.000Z');
    expect(effectiveFloor('2026-10-18T00:00:00.000Z', now, 7)).toBe('2026-10-18T00:00:00.000Z');
  });

  it('the lookback window follows the configured number of days', () => {
    const now = new Date('2026-10-20T00:00:00.000Z');
    expect(effectiveFloor('2026-10-01T00:00:00.000Z', now, 3)).toBe('2026-10-17T00:00:00.000Z');
  });
});

describe('record-ready wording', () => {
  it('asks the host to review the open follow-ups on this meeting — never to "confirm" them', () => {
    expect(recordReadyBody(3, 'confirmed')).toBe(
      '3 open follow-ups to review on this meeting, and mark whether it happened',
    );
    expect(recordReadyBody(3, 'completed')).toBe('3 open follow-ups to review on this meeting');
    expect(recordReadyBody(1, 'cancelled')).toBe('1 open follow-up to review on this meeting');
    expect(recordReadyBody(0, 'completed')).toBe('No open follow-ups on this meeting');
    expect(recordReadyBody(0, 'confirmed')).toBe(
      'No open follow-ups on this meeting. Mark whether it happened',
    );
    for (const n of [0, 1, 4]) {
      for (const st of ['confirmed', 'completed', null]) {
        expect(recordReadyBody(n, st)).not.toMatch(/confirm\b/i);
      }
    }
  });

  it('the digest asks the host to mark finished follow-ups done, the action the meeting page offers', () => {
    expect(digestBody(['Budget', 'Hiring'])).toBe(
      'Oldest: Budget; Hiring. Open each meeting to review them and mark the finished ones done.',
    );
    expect(digestBody([])).toBe('Open each meeting to review them and mark the finished ones done.');
    expect(digestBody(['X'])).not.toMatch(/confirm/i);
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
      7,
    );
    expect(d).toHaveLength(1);
    expect(d[0]).toEqual({
      hostId: 'h1',
      itemCount: 3,
      meetingCount: 2,
      oldestDays: 30,
      oldestBookingIds: ['bB', 'bA'],
    });
    // The count is only the items past the stale window, so the title names it.
    expect(digestTitle(d[0], 7)).toBe('3 follow-ups open for more than 7 days across 2 meetings, oldest 30 days');
  });

  it('title singular and plural are each correct, and it names the stale window in use', () => {
    const one = { hostId: 'h1', itemCount: 1, meetingCount: 1, oldestDays: 1, oldestBookingIds: ['bA'] };
    expect(digestTitle(one, 1)).toBe('1 follow-up open for more than 1 day across 1 meeting, oldest 1 day');
    expect(digestTitle({ ...one, itemCount: 4, meetingCount: 2, oldestDays: 20 }, 14)).toBe(
      '4 follow-ups open for more than 14 days across 2 meetings, oldest 20 days',
    );
  });
});

describe('tunables (platform_policies rows)', () => {
  it('no rows → the defaults, nothing reported as ignored', () => {
    expect(readPolicies([])).toEqual({ policies: { ...DEFAULT_POLICIES }, ignored: [] });
    expect(DEFAULT_POLICIES).toEqual({
      staleDays: 7,
      recordReadyLookbackDays: 7,
      recordReadyExpiryDays: 7,
      digestExpiryDays: 8,
    });
  });

  it('an active row overrides its default; numeric strings count, other keys are ignored', () => {
    const { policies, ignored } = readPolicies([
      { policy_key: POLICY_KEYS.staleDays, value: 14, is_active: true },
      { policy_key: POLICY_KEYS.recordReadyLookbackDays, value: '3', is_active: null },
      { policy_key: POLICY_KEYS.digestExpiryDays, value: 10, is_active: true },
      { policy_key: 'meetings.followup_routine.something_else', value: 99, is_active: true },
    ]);
    expect(policies).toEqual({
      staleDays: 14,
      recordReadyLookbackDays: 3,
      recordReadyExpiryDays: 7,
      digestExpiryDays: 10,
    });
    expect(ignored).toEqual([]);
  });

  it('a switched-off row keeps the default silently; an unusable ACTIVE value keeps the default and is named', () => {
    const { policies, ignored } = readPolicies([
      { policy_key: POLICY_KEYS.staleDays, value: 30, is_active: false },
      { policy_key: POLICY_KEYS.recordReadyLookbackDays, value: 0, is_active: true },
      { policy_key: POLICY_KEYS.recordReadyExpiryDays, value: 'seven', is_active: true },
      { policy_key: POLICY_KEYS.digestExpiryDays, value: 1000, is_active: true },
    ]);
    expect(policies).toEqual({ ...DEFAULT_POLICIES });
    expect(ignored).toEqual([
      POLICY_KEYS.recordReadyLookbackDays,
      POLICY_KEYS.recordReadyExpiryDays,
      POLICY_KEYS.digestExpiryDays,
    ]);
  });

  it('accepts exactly what the policy rows\' descriptions say: above 0 and at most 365, part-days and numbers as text included', () => {
    const { policies, ignored } = readPolicies([
      { policy_key: POLICY_KEYS.staleDays, value: 0.5, is_active: true },
      { policy_key: POLICY_KEYS.recordReadyLookbackDays, value: '7', is_active: true },
      { policy_key: POLICY_KEYS.recordReadyExpiryDays, value: 365, is_active: true },
      { policy_key: POLICY_KEYS.digestExpiryDays, value: 365.5, is_active: true },
    ]);
    expect(policies).toEqual({
      staleDays: 0.5,
      recordReadyLookbackDays: 7,
      recordReadyExpiryDays: 365,
      digestExpiryDays: DEFAULT_POLICIES.digestExpiryDays,
    });
    expect(ignored).toEqual([POLICY_KEYS.digestExpiryDays]);
  });

  it('the routine catalog names all four keys and does not point at an editing page that does not exist', () => {
    const entry = MISC_AI_ROUTINES.find((r) => r.id === 'meetings-followup-routine');
    const knobs = entry?.configKnobs ?? '';
    for (const key of Object.values(POLICY_KEYS)) expect(knobs).toContain(key);
    expect(knobs).not.toMatch(/Platform Policies/i);
    expect(knobs).toContain('database update');
  });

  it('the stale window follows the configured number of days', () => {
    const now = new Date('2026-10-20T00:00:00.000Z');
    const items = [{ host_profile_id: 'h1', booking_id: 'bA', created_at: '2026-10-10T00:00:00.000Z' }];
    expect(buildHostDigests(items, now, 7)).toHaveLength(1); // 10 days old > 7
    expect(buildHostDigests(items, now, 14)).toHaveLength(0); // 10 days old < 14
  });
});

// ── the route ───────────────────────────────────────────────────────────────
const SCHEDULE_ON = [{ routine_id: 'meetings-followup-routine', created_at: recent(3), enabled: true }];
const SCHEDULE_OFF = [{ routine_id: 'meetings-followup-routine', created_at: recent(3), enabled: false }];
const policyRow = (key: string, value: unknown, is_active = true) => ({
  policy_key: key,
  scope_type: 'global',
  value,
  is_active,
});
const sentCalls = () => fanout.mock.calls.map((c) => (c as unknown[])[1] as Record<string, unknown>);

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
    expect(body.wrote).toBe(false);
    expect(body).not.toHaveProperty('carded');
    expect(body).not.toHaveProperty('digests');
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
    expect(body.wrote).toBe(true);
    expect(body.carded).toBe(2);
    expect(body.digests).toBe(0);
    expect(body).not.toHaveProperty('would_card');
    expect(body).not.toHaveProperty('would_digest');
    expect(body.skipped_no_host).toBe(0);
    expect(body.policies).toEqual({ ...DEFAULT_POLICIES });
    const calls = sentCalls();
    expect(calls.map((c) => c.idempotencyKey)).toEqual([
      'meetings:record-ready:n1',
      'meetings:record-ready:n2',
    ]);
    expect(calls[0].body).toBe('2 open follow-ups to review on this meeting, and mark whether it happened');
    expect(calls[0].userIds).toEqual(['h1']);
    expect(calls[0].url).toBe('/meetings/u1');
    expect(calls[1].body).toBe('No open follow-ups on this meeting');
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

  it('a note whose meeting is gone, or has no host, is counted as skipped_no_host — not dropped silently', async () => {
    tables = {
      ai_routine_schedules: SCHEDULE_ON,
      meeting_notes: [
        { id: 'gone', booking_id: 'b-missing', title: 'T', action_items_applied_at: recent(1) },
        { id: 'nohost', booking_id: 'b2', title: 'T', action_items_applied_at: recent(1) },
        { id: 'ok', booking_id: 'b3', title: 'T', action_items_applied_at: recent(1) },
      ],
      meeting_bookings: [
        { id: 'b2', uid: 'u2', host_profile_id: null, status: 'completed' },
        { id: 'b3', uid: 'u3', host_profile_id: 'h1', status: 'completed' },
      ],
      meeting_action_items: [],
      notifications: [],
    };
    const body = await run();
    expect(body.examined).toBe(3);
    expect(body.skipped_no_host).toBe(2);
    expect(body.carded).toBe(1);
    expect(sentCalls().map((c) => c.idempotencyKey)).toEqual(['meetings:record-ready:ok']);
  });

  it('a disabled schedule row, or ?dry=1, writes nothing and reports would_card / would_digest', async () => {
    const base = {
      meeting_notes: [
        { id: 'n1', booking_id: 'b1', title: 'T', action_items_applied_at: recent(1) },
        { id: 'n2', booking_id: 'b-missing', title: 'T', action_items_applied_at: recent(1) },
      ],
      meeting_bookings: [{ id: 'b1', uid: 'u1', host_profile_id: 'h1', status: 'confirmed' }],
      meeting_action_items: [
        { host_profile_id: 'h1', booking_id: 'b1', status: 'open', created_at: recent(30) },
      ],
      notifications: [],
    };
    tables = { ...base, ai_routine_schedules: SCHEDULE_OFF };
    const off = await run();
    expect(off.wrote).toBe(false);
    expect(off.would_card).toBe(1);
    expect(off.would_digest).toBe(1);
    expect(off.skipped_no_host).toBe(1);
    expect(off).not.toHaveProperty('carded');
    expect(off).not.toHaveProperty('digests');

    tables = { ...base, ai_routine_schedules: SCHEDULE_ON };
    const dry = await run('?dry=1');
    expect(dry.wrote).toBe(false);
    expect(dry.would_card).toBe(1);
    expect(dry.would_digest).toBe(1);
    expect(dry).not.toHaveProperty('carded');
    expect(dry).not.toHaveProperty('digests');
    expect(fanout).not.toHaveBeenCalled();
  });

  it('Pass B is NOT bounded by the floor: the first run digests every old open follow-up, one card per host', async () => {
    tables = {
      ai_routine_schedules: SCHEDULE_ON, // floor 3 days ago
      meeting_notes: [{ booking_id: 'bOld', title: 'Kick-off' }],
      meeting_bookings: [
        { id: 'bOld', uid: 'uOld', host_profile_id: 'h1', status: 'completed', attendee_name: 'A' },
        { id: 'bMid', uid: 'uMid', host_profile_id: 'h1', status: 'completed', attendee_name: 'Priya' },
      ],
      meeting_action_items: [
        { host_profile_id: 'h1', booking_id: 'bOld', status: 'open', created_at: recent(60) },
        { host_profile_id: 'h1', booking_id: 'bOld', status: 'open', created_at: recent(40) },
        { host_profile_id: 'h1', booking_id: 'bMid', status: 'open', created_at: recent(10) },
        { host_profile_id: 'h1', booking_id: 'bMid', status: 'done', created_at: recent(50) },
      ],
      notifications: [],
    };
    const body = await run();
    expect(body.digests).toBe(1);
    const calls = sentCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].title).toBe('3 follow-ups open for more than 7 days across 2 meetings, oldest 60 days');
    expect(calls[0].body).toBe(
      'Oldest: Kick-off; Meeting with Priya. Open each meeting to review them and mark the finished ones done.',
    );
    expect(calls[0].url).toBe('/meetings/uOld');
  });

  it('reads its tunables from platform_policies rows: stale window, lookback and both card lifetimes', async () => {
    const DAY = 86_400_000;
    tables = {
      ai_routine_schedules: [{ routine_id: 'meetings-followup-routine', created_at: recent(30), enabled: true }],
      platform_policies: [
        policyRow(POLICY_KEYS.staleDays, 20),
        policyRow(POLICY_KEYS.recordReadyLookbackDays, 2),
        policyRow(POLICY_KEYS.recordReadyExpiryDays, 3),
        policyRow(POLICY_KEYS.digestExpiryDays, 12),
        policyRow('learner_risk.notifications.expiry_hours', 1), // another module's row: not read
      ],
      meeting_notes: [
        { id: 'inside', booking_id: 'b1', title: 'T', action_items_applied_at: recent(1) },
        { id: 'outside', booking_id: 'b1', title: 'T', action_items_applied_at: recent(4) }, // past the 2-day lookback
      ],
      meeting_bookings: [{ id: 'b1', uid: 'u1', host_profile_id: 'h1', status: 'completed' }],
      meeting_action_items: [
        { host_profile_id: 'h1', booking_id: 'b1', status: 'open', created_at: recent(25) }, // > 20 days
        { host_profile_id: 'h1', booking_id: 'b1', status: 'open', created_at: recent(15) }, // < 20 days
      ],
      notifications: [],
    };
    const before = Date.now();
    const body = await run();
    expect(body.policies).toEqual({
      staleDays: 20,
      recordReadyLookbackDays: 2,
      recordReadyExpiryDays: 3,
      digestExpiryDays: 12,
    });
    expect(body).not.toHaveProperty('policy_ignored');
    const calls = sentCalls();
    expect(calls.map((c) => c.idempotencyKey)).toEqual([
      'meetings:record-ready:inside',
      expect.stringMatching(/^meetings:followups:h1:\d{4}-W\d{2}$/),
    ]);
    expect(calls[1].title).toBe('1 follow-up open for more than 20 days across 1 meeting, oldest 25 days');
    const expiresIn = (c: Record<string, unknown>) =>
      Date.parse((c.extraColumns as { expires_at: string }).expires_at) - before;
    expect(Math.round(expiresIn(calls[0]) / DAY)).toBe(3);
    expect(Math.round(expiresIn(calls[1]) / DAY)).toBe(12);
  });

  it('an unusable policy value falls back to the default and is named in policy_ignored', async () => {
    tables = {
      ai_routine_schedules: SCHEDULE_ON,
      platform_policies: [policyRow(POLICY_KEYS.staleDays, -3), policyRow(POLICY_KEYS.digestExpiryDays, 9, false)],
      meeting_notes: [],
      meeting_bookings: [],
      meeting_action_items: [],
      notifications: [],
    };
    const body = await run('?dry=1');
    expect(body.policies).toEqual({ ...DEFAULT_POLICIES });
    expect(body.policy_ignored).toEqual([POLICY_KEYS.staleDays]);
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
