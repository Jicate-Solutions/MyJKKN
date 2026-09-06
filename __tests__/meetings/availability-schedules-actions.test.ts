// __tests__/meetings/availability-schedules-actions.test.ts
//
// Contracts for MULTIPLE sets of working hours per host (the "schedules" card
// on /meetings/availability).
//
// Load-bearing guarantees under test:
//
//   1. A NEW set of hours starts as a COPY of the host's normal (default)
//      hours, so the host trims rather than facing a blank week. With no
//      default yet it falls back to Mon-Fri 09:00-17:00 IST — the same shape
//      getMySchedule() has always created on first visit.
//   2. The DEFAULT set can never be deleted. A host must always have one set
//      of working hours, because meeting kinds with no schedule_id fall back
//      to it (native-scheduling-service resolves 'own schedule_id, else the
//      host's default').
//   3. Deleting a set REPORTS how many meeting kinds pointed at it, so the UI
//      can warn the host first. The database already does the safe thing
//      (meeting_types_schedule_id_fkey is ON DELETE SET NULL) — the count
//      exists so the host is not surprised.
//   4. AUTHORIZATION IS IN THE ACTION, NOT ONLY IN RLS. The mhs_host_all
//      policy reads `is_super_admin() OR is_admin() OR host_profile_id =
//      auth.uid()`, so RLS alone lets any admin rename or delete ANY host's
//      schedule. Every action must filter host_profile_id = auth.uid() itself.
//      The fake database below applies .eq() filters for real, so dropping
//      that filter makes these tests fail rather than pass.
//
// @/lib/supabase/server and the env-gated Google module are mocked so the
// actions run with no cookies, no database and no credentials (same shape as
// the sibling integration-prefs-actions.test.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/services/integrations/google-calendar-service', () => ({
  isGoogleCalConfigured: () => true,
}));

type Row = Record<string, unknown>;

/**
 * A tiny in-memory stand-in for supabase-js's query builder. It genuinely
 * applies .eq()/.in() filters, which is the point: an action that forgets to
 * scope by host_profile_id will read another host's row and fail the test.
 */
class FakeQuery {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] = {};
  private filters: Array<[string, unknown]> = [];
  private ins: Array<[string, unknown[]]> = [];
  private orders: Array<[string, boolean]> = [];
  private wantCount = false;
  private headOnly = false;

  constructor(
    private store: Record<string, Row[]>,
    private table: string,
    private nextId: () => string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    this.wantCount = Boolean(opts?.count);
    this.headOnly = Boolean(opts?.head);
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.ins.push([col, vals]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push([col, opts?.ascending !== false]);
    return this;
  }
  limit() {
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }

  private rows(): Row[] {
    this.store[this.table] ??= [];
    return this.store[this.table];
  }
  private matched(): Row[] {
    const hit = this.rows().filter(
      (r) =>
        this.filters.every(([c, v]) => r[c] === v) &&
        this.ins.every(([c, vs]) => vs.includes(r[c])),
    );
    // Honour .order() for real so an action that returns rows in the wrong
    // order is caught here rather than only in production.
    for (const [col, asc] of [...this.orders].reverse()) {
      hit.sort((a, b) => {
        const av = a[col] as never;
        const bv = b[col] as never;
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    return hit;
  }

  private run(): { data: Row[] | null; error: null; count?: number } {
    if (this.op === 'insert') {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(
        (r) => ({ id: this.nextId(), ...r }),
      );
      this.rows().push(...incoming);
      return { data: incoming, error: null };
    }
    if (this.op === 'update') {
      const hit = this.matched();
      for (const r of hit) Object.assign(r, this.payload);
      return { data: hit, error: null };
    }
    if (this.op === 'delete') {
      const hit = this.matched();
      this.store[this.table] = this.rows().filter((r) => !hit.includes(r));
      return { data: hit, error: null };
    }
    const hit = this.matched();
    return {
      data: this.headOnly ? null : hit,
      error: null,
      ...(this.wantCount ? { count: hit.length } : {}),
    };
  }

  async maybeSingle() {
    const { data, error } = this.run();
    return { data: (data ?? [])[0] ?? null, error };
  }
  async single() {
    const { data, error } = this.run();
    const row = (data ?? [])[0] ?? null;
    return row
      ? { data: row, error }
      : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
  }
  then(res: (v: { data: Row[] | null; error: null; count?: number }) => unknown, rej?: (e: unknown) => unknown) {
    return Promise.resolve()
      .then(() => this.run())
      .then(res, rej);
  }
}

let store: Record<string, Row[]> = {};
let currentUser: string | null = 'host-1';
let seq = 0;

function makeSupabase() {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: currentUser ? { id: currentUser } : null },
        error: null,
      })),
    },
    from: (table: string) => new FakeQuery(store, table, () => `gen-${++seq}`),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeSupabase()),
}));

// Import AFTER the mocks are registered.
import {
  countTypesUsingSchedule,
  createSchedule,
  deleteSchedule,
  getMySchedule,
  listMySchedules,
  renameSchedule,
} from '@/app/(routes)/meetings/availability/actions';

/** Mon-Fri 09:00-17:00 on the host's default, plus a second, foreign host. */
function seed() {
  store = {
    meeting_host_schedules: [
      {
        id: 'sched-default',
        host_profile_id: 'host-1',
        institution_id: 'inst-1',
        name: 'Working Hours',
        timezone: 'Asia/Kolkata',
        is_default: true,
      },
      {
        id: 'sched-other-host',
        host_profile_id: 'host-2',
        institution_id: 'inst-1',
        name: 'Somebody Else Hours',
        timezone: 'Asia/Kolkata',
        is_default: true,
      },
    ],
    meeting_schedule_windows: [1, 2, 3, 4, 5].map((weekday) => ({
      id: `win-${weekday}`,
      schedule_id: 'sched-default',
      weekday,
      start_minute: 540,
      end_minute: 1020,
    })),
    meeting_types: [],
  };
}

beforeEach(() => {
  seq = 0;
  currentUser = 'host-1';
  seed();
});

// ── 1. a new set of hours copies the default ────────────────────────────────

describe('createSchedule — starts as a copy of the normal hours', () => {
  it('copies every weekly window from the host default schedule', async () => {
    const res = await createSchedule('Online Meeting Schedule');
    expect(res.success).toBe(true);

    const created = store.meeting_host_schedules.find(
      (s) => s.name === 'Online Meeting Schedule',
    );
    expect(created).toBeTruthy();
    expect(created!.is_default).toBe(false);
    expect(created!.host_profile_id).toBe('host-1');

    const copied = store.meeting_schedule_windows.filter(
      (w) => w.schedule_id === created!.id,
    );
    expect(copied).toHaveLength(5);
    expect(copied.map((w) => w.weekday).sort()).toEqual([1, 2, 3, 4, 5]);
    for (const w of copied) {
      expect(w.start_minute).toBe(540);
      expect(w.end_minute).toBe(1020);
    }
  });

  it('carries the default timezone and institution onto the copy', async () => {
    store.meeting_host_schedules[0].timezone = 'Asia/Dubai';
    const res = await createSchedule('Dubai trip hours');
    expect(res.success).toBe(true);
    const created = store.meeting_host_schedules.find((s) => s.name === 'Dubai trip hours');
    expect(created!.timezone).toBe('Asia/Dubai');
    expect(created!.institution_id).toBe('inst-1');
  });

  it('falls back to Mon-Fri 09:00-17:00 IST when the host has no default yet', async () => {
    store.meeting_host_schedules = store.meeting_host_schedules.filter(
      (s) => s.host_profile_id !== 'host-1',
    );
    store.meeting_schedule_windows = [];

    const res = await createSchedule('First extra hours');
    expect(res.success).toBe(true);

    const created = store.meeting_host_schedules.find(
      (s) => s.name === 'First extra hours',
    );
    expect(created!.timezone).toBe('Asia/Kolkata');
    const windows = store.meeting_schedule_windows.filter(
      (w) => w.schedule_id === created!.id,
    );
    expect(windows.map((w) => w.weekday).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(windows.every((w) => w.start_minute === 540 && w.end_minute === 1020)).toBe(true);
  });

  it('never creates a second default (the DB has one default per host)', async () => {
    await createSchedule('Second set');
    const defaults = store.meeting_host_schedules.filter(
      (s) => s.host_profile_id === 'host-1' && s.is_default === true,
    );
    expect(defaults).toHaveLength(1);
  });

  it('refuses a blank name and writes nothing', async () => {
    const before = store.meeting_host_schedules.length;
    const res = await createSchedule('   ');
    expect(res.success).toBe(false);
    expect(store.meeting_host_schedules).toHaveLength(before);
  });
});

// ── 2. the default set can never be deleted ─────────────────────────────────

describe('deleteSchedule — the normal hours are protected', () => {
  it('refuses to delete the default schedule', async () => {
    const res = await deleteSchedule('sched-default');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/normal working hours|default/i);
    expect(store.meeting_host_schedules.some((s) => s.id === 'sched-default')).toBe(true);
  });

  it('deletes a non-default schedule the host owns', async () => {
    await createSchedule('Disposable');
    const extra = store.meeting_host_schedules.find((s) => s.name === 'Disposable')!;
    const res = await deleteSchedule(extra.id as string);
    expect(res.success).toBe(true);
    expect(store.meeting_host_schedules.some((s) => s.id === extra.id)).toBe(false);
  });
});

// ── 3. delete reports the affected meeting-kind count ───────────────────────

describe('deleteSchedule / countTypesUsingSchedule — warn before you delete', () => {
  beforeEach(async () => {
    await createSchedule('Interview hours');
    const extra = store.meeting_host_schedules.find((s) => s.name === 'Interview hours')!;
    store.meeting_types = [
      { id: 'mt-1', host_profile_id: 'host-1', schedule_id: extra.id },
      { id: 'mt-2', host_profile_id: 'host-1', schedule_id: extra.id },
      { id: 'mt-3', host_profile_id: 'host-1', schedule_id: extra.id },
      { id: 'mt-4', host_profile_id: 'host-1', schedule_id: null },
      { id: 'mt-5', host_profile_id: 'host-2', schedule_id: 'sched-other-host' },
    ];
  });

  it('counts the meeting kinds pointing at a schedule before deleting', async () => {
    const extra = store.meeting_host_schedules.find((s) => s.name === 'Interview hours')!;
    const res = await countTypesUsingSchedule(extra.id as string);
    expect(res.success).toBe(true);
    expect(res.data).toBe(3);
  });

  it('returns the affected count from the delete itself', async () => {
    const extra = store.meeting_host_schedules.find((s) => s.name === 'Interview hours')!;
    const res = await deleteSchedule(extra.id as string);
    expect(res.success).toBe(true);
    expect(res.data?.affectedMeetingTypes).toBe(3);
  });
});

// ── 4. one host can never touch another host's schedule ─────────────────────

describe('authorization — host_profile_id is enforced in the action, not just RLS', () => {
  it('cannot RENAME another host schedule', async () => {
    const res = await renameSchedule('sched-other-host', 'Hijacked');
    expect(res.success).toBe(false);
    const victim = store.meeting_host_schedules.find((s) => s.id === 'sched-other-host')!;
    expect(victim.name).toBe('Somebody Else Hours');
  });

  it('cannot DELETE another host schedule', async () => {
    const res = await deleteSchedule('sched-other-host');
    expect(res.success).toBe(false);
    expect(store.meeting_host_schedules.some((s) => s.id === 'sched-other-host')).toBe(true);
  });

  it('cannot COUNT another host schedule usage', async () => {
    const res = await countTypesUsingSchedule('sched-other-host');
    expect(res.success).toBe(false);
  });

  it('cannot READ another host schedule through the editor selector', async () => {
    const res = await getMySchedule('sched-other-host');
    expect(res.success).toBe(true);
    // Falls back to the caller's OWN default rather than leaking the other host.
    expect(res.data?.scheduleId).toBe('sched-default');
  });

  it('lists only the caller own schedules', async () => {
    const res = await listMySchedules();
    expect(res.success).toBe(true);
    expect(res.data?.map((s) => s.id)).not.toContain('sched-other-host');
  });

  it('fails closed when signed out', async () => {
    currentUser = null;
    expect((await listMySchedules()).success).toBe(false);
    expect((await createSchedule('Nope')).success).toBe(false);
    expect((await renameSchedule('sched-default', 'Nope')).success).toBe(false);
    expect((await deleteSchedule('sched-default')).success).toBe(false);
  });
});

// ── 5. listing + selecting ──────────────────────────────────────────────────

describe('listMySchedules — what the card renders', () => {
  it('reports the window count and how many meeting kinds use each schedule', async () => {
    await createSchedule('Interview hours');
    const extra = store.meeting_host_schedules.find((s) => s.name === 'Interview hours')!;
    store.meeting_types = [
      { id: 'mt-1', host_profile_id: 'host-1', schedule_id: extra.id },
      { id: 'mt-2', host_profile_id: 'host-1', schedule_id: null },
    ];

    const res = await listMySchedules();
    expect(res.success).toBe(true);
    const byId = Object.fromEntries((res.data ?? []).map((s) => [s.id, s]));

    expect(byId['sched-default'].isDefault).toBe(true);
    expect(byId['sched-default'].windowCount).toBe(5);
    expect(byId['sched-default'].meetingTypeCount).toBe(0);

    expect(byId[extra.id as string].isDefault).toBe(false);
    expect(byId[extra.id as string].windowCount).toBe(5);
    expect(byId[extra.id as string].meetingTypeCount).toBe(1);
  });

  it('puts the default set first', async () => {
    await createSchedule('Extra');
    const res = await listMySchedules();
    expect(res.data?.[0]?.isDefault).toBe(true);
  });
});

describe('getMySchedule(scheduleId) — the editor edits the SELECTED set', () => {
  it('returns the requested schedule when the host owns it', async () => {
    await createSchedule('Interview hours');
    const extra = store.meeting_host_schedules.find((s) => s.name === 'Interview hours')!;
    const res = await getMySchedule(extra.id as string);
    expect(res.success).toBe(true);
    expect(res.data?.scheduleId).toBe(extra.id);
    expect(res.data?.name).toBe('Interview hours');
  });

  it('still returns the default when called with no argument (unchanged behaviour)', async () => {
    const res = await getMySchedule();
    expect(res.success).toBe(true);
    expect(res.data?.scheduleId).toBe('sched-default');
    expect(res.data?.availability?.[0]?.startTime).toBe('09:00');
  });
});

describe('renameSchedule', () => {
  it('renames a schedule the host owns', async () => {
    const res = await renameSchedule('sched-default', 'Term-time hours');
    expect(res.success).toBe(true);
    expect(store.meeting_host_schedules.find((s) => s.id === 'sched-default')!.name).toBe(
      'Term-time hours',
    );
  });

  it('refuses a blank name', async () => {
    const res = await renameSchedule('sched-default', '  ');
    expect(res.success).toBe(false);
    expect(store.meeting_host_schedules.find((s) => s.id === 'sched-default')!.name).toBe(
      'Working Hours',
    );
  });
});
