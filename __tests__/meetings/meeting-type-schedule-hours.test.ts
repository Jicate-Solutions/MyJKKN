// __tests__/meetings/meeting-type-schedule-hours.test.ts
//
// Which working hours a meeting kind uses — the picker, and the empty-hours
// fallback. Load-bearing guarantees, in the Director's order (2026-08-21):
//
//   1. A meeting kind pinned to a set of hours that is EMPTY must quietly use
//      the host's normal (default) hours. A visitor must never be shown a
//      blank calendar with no explanation. Production has exactly one such
//      schedule today ('Mid Month IQAC Review Meetings', 0 windows) with two
//      meeting kinds on it.
//   2. A kind pinned to hours that DO exist keeps its own hours — the fallback
//      must never leak the normal hours into a deliberately narrowed schedule.
//   3. A kind on 'My normal working hours' (schedule_id NULL) is unchanged.
//   4. The fallback must not loop: the pinned-but-empty schedule is looked up,
//      the default is read at most once more, and that is the end of it.
//   5. Auto-move is idempotent, and strictly scoped to the signed-in host's
//      own meeting kinds.
//
// The service's import chain builds a Resend client and a browser Supabase
// client eagerly, so those modules are mocked (same shape as
// meeting-mode-switch.test.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/services/email/meeting-booking-email-service', () => ({
  MeetingBookingEmailService: {
    sendBookingConfirmedEmails: vi.fn(),
    sendBookingCancelledEmails: vi.fn(),
    sendBookingRescheduledEmails: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(() => ({})),
  createClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/services/integrations/google-calendar-service', () => ({
  GoogleCalendarService: {
    busyForHost: vi.fn(async () => ({ status: 'none', busy: [] })),
    getConnection: vi.fn(),
  },
  isGoogleCalConfigured: () => true,
}));

let currentUser: string | null = 'host-1';
let db: FakeDb;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => db.client),
}));

// Imported AFTER the mocks are registered.
import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';
import {
  listMyScheduleChoices,
  moveOnlineMeetingsToOnlineHours,
  updateMyEventType,
} from '@/app/(routes)/meetings/manage/actions';

// ── a tiny table-backed Supabase stand-in ────────────────────────────────────
//
// Supports exactly the chains these code paths use: select/eq/is/in/order/limit
// then either `maybeSingle()`/`single()` or a direct await, plus update/insert/
// delete. Every `from(table)` is recorded so a test can prove a lookup happened
// once and not in a loop.

type Row = Record<string, any>;

interface FakeDb {
  client: any;
  tables: Record<string, Row[]>;
  calls: string[];
  countFrom: (table: string) => number;
}

function makeDb(tables: Record<string, Row[]>, userId: string | null = currentUser): FakeDb {
  const store: Record<string, Row[]> = { ...tables };
  const calls: string[] = [];

  function builder(table: string) {
    const rows = () => (store[table] ??= []);
    const filters: Array<(r: Row) => boolean> = [];
    let mode: 'select' | 'update' | 'delete' | 'insert' = 'select';
    let patch: Row = {};
    let inserted: Row[] = [];

    const matched = () => rows().filter((r) => filters.every((f) => f(r)));

    const settle = () => {
      if (mode === 'update') {
        const hit = matched();
        for (const r of hit) Object.assign(r, patch);
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      if (mode === 'delete') {
        const hit = matched();
        store[table] = rows().filter((r) => !hit.includes(r));
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      if (mode === 'insert') return { data: inserted.map((r) => ({ ...r })), error: null };
      return { data: matched().map((r) => ({ ...r })), error: null };
    };

    const q: any = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return q;
      },
      is: (col: string, val: unknown) => {
        filters.push((r) => (r[col] ?? null) === val);
        return q;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]));
        return q;
      },
      order: () => q,
      limit: () => q,
      update: (p: Row) => {
        mode = 'update';
        patch = p;
        return q;
      },
      delete: () => {
        mode = 'delete';
        return q;
      },
      insert: (p: Row | Row[]) => {
        mode = 'insert';
        inserted = Array.isArray(p) ? p : [p];
        for (const r of inserted) rows().push({ id: `${table}-${rows().length + 1}`, ...r });
        return q;
      },
      maybeSingle: async () => {
        const res = settle();
        return { data: res.data[0] ?? null, error: res.error };
      },
      single: async () => {
        const res = settle();
        return { data: res.data[0] ?? null, error: res.error };
      },
      then: (ok: any, bad: any) => Promise.resolve(settle()).then(ok, bad),
    };
    return q;
  }

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    },
    from: (table: string) => {
      calls.push(table);
      return builder(table);
    },
  };

  return { client, tables: store, calls, countFrom: (t) => calls.filter((c) => c === t).length };
}

/** Minimal meeting-type shape loadSchedule reads. */
function makeType(over: Row = {}): any {
  return {
    id: 'mt-1',
    host_profile_id: 'host-1',
    slug: 'intro-call',
    schedule_id: null,
    ...over,
  };
}

// Real uuids: the actions validate the SHAPE of a schedule id before checking
// ownership, so a readable placeholder would be rejected for the wrong reason
// and the ownership test would pass without ever running.
const OTHER_HOST_SCHEDULE_ID = '44444444-4444-4444-8444-444444444444';
const VIRTUAL_SCHEDULE_ID = '55555555-5555-4555-8555-555555555555';
const DELETED_SCHEDULE_ID = '66666666-6666-4666-8666-666666666666';

const DEFAULT_SCHEDULE = {
  id: '11111111-1111-4111-8111-111111111111',
  host_profile_id: 'host-1',
  name: 'Working Hours',
  timezone: 'Asia/Kolkata',
  is_default: true,
};
const EMPTY_SCHEDULE = {
  id: '22222222-2222-4222-8222-222222222222',
  host_profile_id: 'host-1',
  name: 'Mid Month IQAC Review Meetings',
  timezone: 'Asia/Kolkata',
  is_default: false,
};
const ONLINE_SCHEDULE = {
  id: '33333333-3333-4333-8333-333333333333',
  host_profile_id: 'host-1',
  name: 'Online Hours',
  timezone: 'Asia/Kolkata',
  is_default: false,
};

/** Mon–Fri 09:00–17:00 — the host's normal hours. */
const DEFAULT_WINDOWS = [1, 2, 3, 4, 5].map((weekday) => ({
  schedule_id: DEFAULT_SCHEDULE.id,
  weekday,
  start_minute: 540,
  end_minute: 1020,
}));

/** Saturday 10:00–12:00 only — a deliberately narrow, NON-empty schedule. */
const ONLINE_WINDOWS = [
  { schedule_id: ONLINE_SCHEDULE.id, weekday: 6, start_minute: 600, end_minute: 720 },
];

const loadSchedule = (client: any, mt: any) =>
  (NativeSchedulingService as any).loadSchedule(client, mt) as Promise<{
    timezone: string;
    windows: Array<{ weekday: number; startMinute: number; endMinute: number }>;
    overrides: Array<{ date: string; startMinute: number; endMinute: number }>;
  } | null>;

beforeEach(() => {
  currentUser = 'host-1';
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('empty working hours fall back to the host’s normal hours', () => {
  it('a kind pinned to a schedule with NO windows uses the default schedule’s windows', async () => {
    db = makeDb({
      meeting_host_schedules: [{ ...DEFAULT_SCHEDULE }, { ...EMPTY_SCHEDULE }],
      meeting_schedule_windows: DEFAULT_WINDOWS.map((w) => ({ ...w })),
      meeting_schedule_overrides: [],
    });

    const sched = await loadSchedule(db.client, makeType({ schedule_id: EMPTY_SCHEDULE.id }));

    expect(sched).not.toBeNull();
    expect(sched!.windows).toHaveLength(5);
    expect(sched!.windows.map((w) => w.weekday).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(sched!.windows[0]).toMatchObject({ startMinute: 540, endMinute: 1020 });
  });

  it('keeps the pinned schedule’s timezone — only the hours are borrowed', async () => {
    db = makeDb({
      meeting_host_schedules: [
        { ...DEFAULT_SCHEDULE, timezone: 'Asia/Kolkata' },
        { ...EMPTY_SCHEDULE, timezone: 'Asia/Dubai' },
      ],
      meeting_schedule_windows: DEFAULT_WINDOWS.map((w) => ({ ...w })),
      meeting_schedule_overrides: [],
    });

    const sched = await loadSchedule(db.client, makeType({ schedule_id: EMPTY_SCHEDULE.id }));

    expect(sched!.timezone).toBe('Asia/Dubai');
    expect(sched!.windows).toHaveLength(5);
  });

  it('a kind pinned to a schedule that HAS windows keeps its own — no accidental fallback', async () => {
    db = makeDb({
      meeting_host_schedules: [{ ...DEFAULT_SCHEDULE }, { ...ONLINE_SCHEDULE }],
      meeting_schedule_windows: [
        ...DEFAULT_WINDOWS.map((w) => ({ ...w })),
        ...ONLINE_WINDOWS.map((w) => ({ ...w })),
      ],
      meeting_schedule_overrides: [],
    });

    const sched = await loadSchedule(db.client, makeType({ schedule_id: ONLINE_SCHEDULE.id }));

    expect(sched!.windows).toHaveLength(1);
    expect(sched!.windows[0]).toMatchObject({ weekday: 6, startMinute: 600, endMinute: 720 });
  });

  it('a kind on "my normal working hours" (schedule_id NULL) is unchanged', async () => {
    db = makeDb({
      meeting_host_schedules: [{ ...DEFAULT_SCHEDULE }, { ...ONLINE_SCHEDULE }],
      meeting_schedule_windows: [
        ...DEFAULT_WINDOWS.map((w) => ({ ...w })),
        ...ONLINE_WINDOWS.map((w) => ({ ...w })),
      ],
      meeting_schedule_overrides: [],
    });

    const sched = await loadSchedule(db.client, makeType({ schedule_id: null }));

    expect(sched!.windows).toHaveLength(5);
    expect(sched!.timezone).toBe('Asia/Kolkata');
  });

  it('does not loop when the DEFAULT schedule is itself empty', async () => {
    db = makeDb({
      meeting_host_schedules: [{ ...DEFAULT_SCHEDULE }, { ...EMPTY_SCHEDULE }],
      meeting_schedule_windows: [],
      meeting_schedule_overrides: [],
    });

    const sched = await loadSchedule(db.client, makeType({ schedule_id: EMPTY_SCHEDULE.id }));

    expect(sched).not.toBeNull();
    expect(sched!.windows).toEqual([]);
    // pinned lookup + default lookup, and no more.
    expect(db.countFrom('meeting_schedule_windows')).toBeLessThanOrEqual(2);
    expect(db.countFrom('meeting_host_schedules')).toBeLessThanOrEqual(2);
  });

  it('does not re-read itself when the pinned schedule IS the default', async () => {
    db = makeDb({
      meeting_host_schedules: [{ ...DEFAULT_SCHEDULE }],
      meeting_schedule_windows: [],
      meeting_schedule_overrides: [],
    });

    const sched = await loadSchedule(db.client, makeType({ schedule_id: DEFAULT_SCHEDULE.id }));

    expect(sched!.windows).toEqual([]);
    expect(db.countFrom('meeting_schedule_windows')).toBe(1);
  });

  it('a kind pinned to a schedule that no longer exists still lands on the default', async () => {
    db = makeDb({
      meeting_host_schedules: [{ ...DEFAULT_SCHEDULE }],
      meeting_schedule_windows: DEFAULT_WINDOWS.map((w) => ({ ...w })),
      meeting_schedule_overrides: [],
    });

    const sched = await loadSchedule(db.client, makeType({ schedule_id: DELETED_SCHEDULE_ID }));

    expect(sched!.windows).toHaveLength(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('the picker writes which hours a meeting kind uses', () => {
  const BASE_INPUT = {
    title: 'Intro call',
    slug: 'intro-call',
    lengthInMinutes: 30,
    locationMode: 'online' as const,
  };

  function seedForUpdate() {
    return makeDb({
      meeting_types: [
        {
          id: 'mt-1',
          host_profile_id: 'host-1',
          title: 'Intro call',
          slug: 'intro-call',
          duration_min: 30,
          hidden: false,
          description: null,
          location_mode: 'online',
          location_text: null,
          schedule_id: null,
          is_active: true,
        },
      ],
      meeting_host_schedules: [{ ...DEFAULT_SCHEDULE }, { ...ONLINE_SCHEDULE }],
      meeting_schedule_windows: [],
      meeting_type_cohosts: [],
      meeting_type_locations: [],
      profiles: [],
      resources: [],
    });
  }

  it('stores the chosen schedule on the meeting kind', async () => {
    db = seedForUpdate();

    const res = await updateMyEventType('mt-1', {
      ...BASE_INPUT,
      scheduleId: ONLINE_SCHEDULE.id,
    });

    expect(res.success).toBe(true);
    expect(res.data!.scheduleId).toBe(ONLINE_SCHEDULE.id);
    expect(db.tables.meeting_types[0].schedule_id).toBe(ONLINE_SCHEDULE.id);
  });

  it('"my normal working hours" clears the pin back to NULL', async () => {
    db = seedForUpdate();
    db.tables.meeting_types[0].schedule_id = ONLINE_SCHEDULE.id;

    const res = await updateMyEventType('mt-1', { ...BASE_INPUT, scheduleId: null });

    expect(res.success).toBe(true);
    expect(db.tables.meeting_types[0].schedule_id).toBeNull();
  });

  it('refuses a schedule that belongs to someone else', async () => {
    db = seedForUpdate();
    db.tables.meeting_host_schedules.push({
      id: OTHER_HOST_SCHEDULE_ID,
      host_profile_id: 'host-2',
      name: 'Someone else’s hours',
      timezone: 'Asia/Kolkata',
      is_default: false,
    });

    const res = await updateMyEventType('mt-1', {
      ...BASE_INPUT,
      scheduleId: OTHER_HOST_SCHEDULE_ID,
    });

    expect(res.success).toBe(false);
    expect(db.tables.meeting_types[0].schedule_id).toBeNull();
  });

  it('refuses a malformed schedule reference outright', async () => {
    db = seedForUpdate();

    const res = await updateMyEventType('mt-1', { ...BASE_INPUT, scheduleId: 'not-a-uuid' });

    expect(res.success).toBe(false);
    expect(db.tables.meeting_types[0].schedule_id).toBeNull();
  });

  it('lists the host’s own schedules, default first, and never anyone else’s', async () => {
    db = makeDb({
      meeting_host_schedules: [
        { ...ONLINE_SCHEDULE },
        { ...DEFAULT_SCHEDULE },
        { id: OTHER_HOST_SCHEDULE_ID, host_profile_id: 'host-2', name: 'Nope', timezone: 'Asia/Kolkata', is_default: false },
      ],
      meeting_schedule_windows: ONLINE_WINDOWS.map((w) => ({ ...w })),
    });

    const res = await listMyScheduleChoices();

    expect(res.success).toBe(true);
    expect(res.data!.schedules.map((s) => s.id)).toEqual([DEFAULT_SCHEDULE.id, ONLINE_SCHEDULE.id]);
    expect(res.data!.schedules[0].isDefault).toBe(true);
    // The default has no windows in this fixture; the online one has one.
    expect(res.data!.schedules[0].hasHours).toBe(false);
    expect(res.data!.schedules[1].hasHours).toBe(true);
    expect(res.data!.onlineScheduleId).toBe(ONLINE_SCHEDULE.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('auto-move online meeting kinds onto the host’s online hours', () => {
  function seedForMove(extra: Row[] = []) {
    return makeDb({
      meeting_types: [
        { id: 'mt-online-1', host_profile_id: 'host-1', location_mode: 'online', schedule_id: null, is_active: true },
        { id: 'mt-online-2', host_profile_id: 'host-1', location_mode: 'online', schedule_id: null, is_active: true },
        { id: 'mt-inperson', host_profile_id: 'host-1', location_mode: 'in_person', schedule_id: null, is_active: true },
        { id: 'mt-pinned', host_profile_id: 'host-1', location_mode: 'online', schedule_id: DEFAULT_SCHEDULE.id, is_active: true },
        { id: 'mt-other-host', host_profile_id: 'host-2', location_mode: 'online', schedule_id: null, is_active: true },
        ...extra,
      ],
      meeting_host_schedules: [{ ...DEFAULT_SCHEDULE }, { ...ONLINE_SCHEDULE }],
      meeting_schedule_windows: [],
    });
  }

  it('moves the host’s online kinds that are still on normal hours', async () => {
    db = seedForMove();

    const res = await moveOnlineMeetingsToOnlineHours();

    expect(res.success).toBe(true);
    expect(res.data!.moved).toBe(2);
    expect(res.data!.scheduleName).toBe('Online Hours');
    const byId = Object.fromEntries(db.tables.meeting_types.map((t) => [t.id, t.schedule_id]));
    expect(byId['mt-online-1']).toBe(ONLINE_SCHEDULE.id);
    expect(byId['mt-online-2']).toBe(ONLINE_SCHEDULE.id);
  });

  it('is safe to run twice — the second run moves nothing', async () => {
    db = seedForMove();

    await moveOnlineMeetingsToOnlineHours();
    const second = await moveOnlineMeetingsToOnlineHours();

    expect(second.success).toBe(true);
    expect(second.data!.moved).toBe(0);
  });

  it('never touches in-person kinds, deliberately pinned kinds, or another host’s kinds', async () => {
    db = seedForMove();

    await moveOnlineMeetingsToOnlineHours();

    const byId = Object.fromEntries(db.tables.meeting_types.map((t) => [t.id, t.schedule_id]));
    expect(byId['mt-inperson']).toBeNull();
    expect(byId['mt-pinned']).toBe(DEFAULT_SCHEDULE.id);
    expect(byId['mt-other-host']).toBeNull();
  });

  it('does nothing when the host has no schedule that is clearly the online one', async () => {
    db = makeDb({
      meeting_types: [
        { id: 'mt-online-1', host_profile_id: 'host-1', location_mode: 'online', schedule_id: null, is_active: true },
      ],
      meeting_host_schedules: [{ ...DEFAULT_SCHEDULE }],
      meeting_schedule_windows: [],
    });

    const res = await moveOnlineMeetingsToOnlineHours();

    expect(res.success).toBe(true);
    expect(res.data!.moved).toBe(0);
    expect(res.data!.scheduleName).toBeNull();
    expect(db.tables.meeting_types[0].schedule_id).toBeNull();
  });

  it('does nothing when two schedules both look like the online one', async () => {
    db = makeDb({
      meeting_types: [
        { id: 'mt-online-1', host_profile_id: 'host-1', location_mode: 'online', schedule_id: null, is_active: true },
      ],
      meeting_host_schedules: [
        { ...DEFAULT_SCHEDULE },
        { ...ONLINE_SCHEDULE },
        { id: VIRTUAL_SCHEDULE_ID, host_profile_id: 'host-1', name: 'Virtual sessions', timezone: 'Asia/Kolkata', is_default: false },
      ],
      meeting_schedule_windows: [],
    });

    const res = await moveOnlineMeetingsToOnlineHours();

    expect(res.data!.moved).toBe(0);
    expect(res.data!.scheduleName).toBeNull();
    expect(db.tables.meeting_types[0].schedule_id).toBeNull();
  });
});
