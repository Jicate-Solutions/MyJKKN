import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

import { HRMemoService, UNRESOLVABLE_EVENT_REASON, istDate } from '@/lib/services/hr/memo-service';
import {
  dueNudges,
  effectiveMode,
  parseMemoDetectorSettings,
  DEFAULT_MEMO_DETECTOR_SETTINGS,
  type MemoDetectorSettings,
} from '@/lib/services/hr/memo-detector-rules';

// ---------------------------------------------------------------------------
// In-memory Supabase stand-in. Supports exactly the builder calls the memo
// service makes, applies filters to rows, and logs every write so a test can
// prove a dry run wrote nothing but its run record.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

interface Write {
  table: string;
  op: 'insert' | 'update' | 'upsert';
  payload: unknown;
}

function field(r: Row, col: string): unknown {
  const m = col.match(/^(\w+)->>(\w+)$/);
  if (m) {
    const obj = r[m[1]] as Row | null | undefined;
    const v = obj?.[m[2]];
    return v == null ? v : String(v);
  }
  return r[col];
}

const NOW = new Date('2026-10-10T02:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

// Column defaults the real tables apply on insert.
const INSERT_DEFAULTS: Record<string, Row> = {
  hr_memo_eligibility_events: { is_dismissed: false, processed_into_memo_id: null },
  hr_memos: { issued_at: NOW.toISOString() },
};

let idSeq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`;

function makeFake(opts: {
  policy: unknown;
  tables?: Record<string, Row[]>;
  triggers?: Row;
  /** Tables whose inserts fail (to prove a claim is released). */
  failInsertOn?: string[];
}) {
  const tables: Record<string, Row[]> = {
    institution_leaves: [],
    hr_attendance_records: [],
    hr_memo_eligibility_events: [],
    hr_memos: [],
    hr_memo_state_transitions: [],
    hr_memo_nudges: [],
    hr_memo_detector_runs: [],
    staff: [],
    hr_staff_details: [],
    departments: [],
    profiles: [],
    notifications: [],
    user_notifications: [],
    ...(opts.tables ?? {}),
  };
  const writes: Write[] = [];
  const touched: string[] = [];

  class Builder {
    private filters: Filter[] = [];
    private op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    private payload: unknown = null;
    private returning = false;
    private lim: number | null = null;
    private rng: [number, number] | null = null;
    private orders: Array<{ col: string; asc: boolean }> = [];
    private mode: 'many' | 'single' | 'maybe' = 'many';
    constructor(private readonly table: string) {}

    select() {
      if (this.op !== 'select') this.returning = true;
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
    upsert(rows: Row | Row[]) {
      this.op = 'upsert';
      this.payload = rows;
      return this;
    }
    eq(c: string, v: unknown) {
      this.filters.push((r) => field(r, c) === v);
      return this;
    }
    in(c: string, vs: unknown[]) {
      this.filters.push((r) => vs.includes(field(r, c)));
      return this;
    }
    is(c: string, v: null) {
      this.filters.push((r) => (field(r, c) ?? null) === v);
      return this;
    }
    not(c: string, _op: 'is', _v: null) {
      this.filters.push((r) => field(r, c) != null);
      return this;
    }
    gte(c: string, v: string) {
      this.filters.push((r) => String(field(r, c)) >= v);
      return this;
    }
    lte(c: string, v: string) {
      this.filters.push((r) => String(field(r, c)) <= v);
      return this;
    }
    order(col: string, o?: { ascending?: boolean }) {
      this.orders.push({ col, asc: o?.ascending !== false });
      return this;
    }
    limit(n: number) {
      this.lim = n;
      return this;
    }
    range(from: number, to: number) {
      this.rng = [from, to];
      return this;
    }
    single() {
      this.mode = 'single';
      return this;
    }
    maybeSingle() {
      this.mode = 'maybe';
      return this;
    }

    private exec(): { data: unknown; error: { message: string; code?: string } | null; count?: number } {
      const rows = tables[this.table];
      if (!rows) return { data: null, error: { message: `relation ${this.table} does not exist` } };

      if (this.op === 'upsert') {
        // ON CONFLICT (notification_id, user_id) DO NOTHING
        const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
        const fresh = list.filter(
          (n) => !rows.some((r) => r.notification_id === n.notification_id && r.user_id === n.user_id),
        );
        rows.push(...fresh.map((r) => ({ id: newId(), ...r })));
        writes.push({ table: this.table, op: 'upsert', payload: list });
        return { data: null, error: null };
      }

      if (this.op === 'insert') {
        const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
        if (opts.failInsertOn?.includes(this.table)) {
          return { data: null, error: { message: `insert into ${this.table} refused (test)` } };
        }
        if (this.table === 'notifications') {
          for (const n of list) {
            if (n.idempotency_key != null && rows.some((r) => r.idempotency_key === n.idempotency_key)) {
              return { data: null, error: { message: 'duplicate key', code: '23505' } };
            }
          }
        }
        if (this.table === 'hr_memo_nudges') {
          for (const n of list) {
            if (rows.some((r) => r.memo_id === n.memo_id && r.nudge_kind === n.nudge_kind)) {
              return { data: null, error: { message: 'duplicate key', code: '23505' } };
            }
          }
        }
        const stored = list.map((r) => ({ id: newId(), ...(INSERT_DEFAULTS[this.table] ?? {}), ...r }));
        rows.push(...stored);
        writes.push({ table: this.table, op: 'insert', payload: list });
        const data = this.returning ? (this.mode === 'many' ? stored : stored[0]) : null;
        return { data, error: null, count: stored.length };
      }

      const matched = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === 'update') {
        for (const r of matched) Object.assign(r, this.payload as Row);
        writes.push({ table: this.table, op: 'update', payload: this.payload });
        return { data: this.returning ? matched.map((r) => ({ ...r })) : null, error: null };
      }

      if (this.orders.length > 0) {
        matched.sort((a, b) => {
          for (const o of this.orders) {
            const x = String(field(a, o.col) ?? '');
            const y = String(field(b, o.col) ?? '');
            if (x !== y) return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
          }
          return 0;
        });
      }
      let limited = this.rng ? matched.slice(this.rng[0], this.rng[1] + 1) : matched;
      if (this.lim != null) limited = limited.slice(0, this.lim);
      if (this.mode === 'many') return { data: limited.map((r) => ({ ...r })), error: null };
      return { data: limited[0] ? { ...limited[0] } : null, error: null };
    }

    then<T>(resolve: (v: ReturnType<Builder['exec']>) => T) {
      return Promise.resolve(this.exec()).then(resolve);
    }
  }

  const client = {
    from(table: string) {
      touched.push(table);
      return new Builder(table);
    },
    async rpc(name: string) {
      if (name === 'fn_get_policy') return { data: opts.policy, error: null };
      if (name === 'fn_get_hr_memo_triggers') {
        return {
          data: opts.triggers ?? {
            leave_before_approval_enabled: true,
            monthly_lop_threshold_count: 2,
            monthly_lop_threshold_enabled: false,
            unscheduled_absence_enabled: false,
            memos_for_termination_threshold: 3,
          },
          error: null,
        };
      }
      return { data: null, error: { message: `unknown rpc ${name}` } };
    },
  };

  return { client: client as unknown as SupabaseClient, tables, writes, touched };
}

const STAFF_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const STAFF_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const PROFILE_A = 'aaaaaaaa-1111-4000-8000-000000000001';
const PROFILE_B = 'bbbbbbbb-1111-4000-8000-000000000002';
const PROFILE_HOD = 'cccccccc-1111-4000-8000-000000000003';
const DEPT = 'dddddddd-0000-4000-8000-000000000004';
const RUN = '11111111-2222-4000-8000-000000000001';
const RUN2 = '11111111-2222-4000-8000-000000000002';

function scenario() {
  return {
    staff: [
      { id: STAFF_A, profile_id: PROFILE_A, first_name: 'Asha', last_name: 'R', department_id: DEPT },
      { id: STAFF_B, profile_id: PROFILE_B, first_name: 'Bala', last_name: 'K', department_id: DEPT },
    ],
    departments: [{ id: DEPT, head_of_department_id: PROFILE_HOD }],
    // One holiday approved after it started, declared by a PROFILE id (the
    // real-world shape), and one by a staff id so a memo is creatable.
    institution_leaves: [
      {
        id: 'leave-1',
        status: 'approved',
        requested_by: STAFF_A,
        start_date: '2026-10-01',
        approved_at: '2026-10-03T10:00:00Z',
        leave_name: 'Casual',
      },
      {
        id: 'leave-2',
        status: 'approved',
        requested_by: PROFILE_A,
        start_date: '2026-10-01',
        approved_at: '2026-10-04T10:00:00Z',
        leave_name: 'Holiday',
      },
    ],
    // An older manual memo nobody answered: reminder due now.
    hr_memos: [
      { id: 'memo-old', staff_id: STAFF_B, status: 'issued', issued_at: daysAgo(4) },
    ],
  };
}

const MESSAGING_TABLES = [
  'notifications',
  'user_notifications',
  'hr_memos',
  'hr_memo_eligibility_events',
  'hr_memo_state_transitions',
  'hr_memo_nudges',
];

// ---------------------------------------------------------------------------
describe('memo detector switch', () => {
  it('mode off does zero work: no table is touched and nothing is written', async () => {
    const fake = makeFake({ policy: { mode: 'off' }, tables: scenario() });
    const res = await new HRMemoService(fake.client).runDetection(RUN, { now: NOW });

    expect(res.mode).toBe('off');
    expect(fake.touched).toEqual([]);
    expect(fake.writes).toEqual([]);
  });

  it('a missing switch row reads as off (zero work)', async () => {
    const fake = makeFake({ policy: null, tables: scenario() });
    const res = await new HRMemoService(fake.client).runDetection(RUN, { now: NOW });

    expect(res.mode).toBe('off');
    expect(fake.touched).toEqual([]);
    expect(fake.writes).toEqual([]);
  });

  it('?dry_run cannot switch an off detector on', async () => {
    const fake = makeFake({ policy: { mode: 'off' }, tables: scenario() });
    const res = await new HRMemoService(fake.client).runDetection(RUN, {
      now: NOW,
      forceDryRun: true,
    });
    expect(res.mode).toBe('off');
    expect(fake.writes).toEqual([]);
  });
});

describe('memo detector dry run', () => {
  it('previews memos and nudges, sends nothing, writes only its run record', async () => {
    const fake = makeFake({ policy: { mode: 'dry_run' }, tables: scenario() });
    const res = await new HRMemoService(fake.client).runDetection(RUN, { now: NOW });

    expect(res.mode).toBe('dry_run');
    expect(res.memos_created).toBe(0);
    expect(res.notifications_sent).toBe(0);
    expect(res.nudges_sent).toBe(0);

    // What it WOULD do
    expect(res.preview.events).toHaveLength(2);
    expect(res.preview.memos).toEqual([
      expect.objectContaining({ staff_id: STAFF_A, staff_found: true, notify_count: 1 }),
      expect.objectContaining({ staff_id: PROFILE_A, staff_found: false, notify_count: 0 }),
    ]);
    expect(res.preview.nudges).toEqual([
      { memo_id: 'memo-old', kind: 'staff_reminder', recipient_count: 1, recipient_source: 'staff' },
    ]);

    // What it DID: one run row, nothing else
    expect(fake.writes.map((w) => w.table)).toEqual(['hr_memo_detector_runs']);
    for (const t of MESSAGING_TABLES) {
      expect(fake.writes.filter((w) => w.table === t)).toEqual([]);
    }
    expect(fake.tables.hr_memo_detector_runs[0]).toMatchObject({
      run_id: RUN,
      mode: 'dry_run',
      events_found: 2,
      memos_found: 2,
      nudges_found: 1,
      memos_created: 0,
      nudges_sent: 0,
    });
  });

  it('?dry_run lowers a live detector to a preview that sends nothing', async () => {
    const fake = makeFake({ policy: { mode: 'live' }, tables: scenario() });
    const res = await new HRMemoService(fake.client).runDetection(RUN, {
      now: NOW,
      forceDryRun: true,
    });

    expect(res.mode).toBe('dry_run');
    expect(fake.writes.map((w) => w.table)).toEqual(['hr_memo_detector_runs']);
  });
});

describe('memo detector live', () => {
  it('issues memos only to real team member records, sends the notice and ONE reminder, and is idempotent', async () => {
    const fake = makeFake({ policy: { mode: 'live' }, tables: scenario() });
    const svc = new HRMemoService(fake.client);

    const first = await svc.runDetection(RUN, { now: NOW });
    expect(first.mode).toBe('live');
    expect(first.events_written).toBe(2);
    expect(first.memos_created).toBe(1); // the PROFILE_A event is refused
    expect(fake.tables.hr_memos.filter((m) => m.auto_issued === true)).toHaveLength(1);
    expect(fake.tables.hr_memos.find((m) => m.staff_id === PROFILE_A)).toBeUndefined();
    expect(first.notifications_sent).toBe(1);
    expect(first.nudges_sent).toBe(1);
    expect(fake.tables.hr_memo_nudges).toEqual([
      expect.objectContaining({
        memo_id: 'memo-old',
        nudge_kind: 'staff_reminder',
        status: 'sent',
        recipient_profile_ids: [PROFILE_B],
      }),
    ]);
    const notices = fake.tables.notifications.length;

    // Second run the same day: no new memo, no second reminder, no new notice.
    const second = await svc.runDetection(RUN2, { now: NOW });
    expect(second.events_written).toBe(0);
    expect(second.memos_created).toBe(0);
    expect(second.nudges_sent).toBe(0);
    expect(fake.tables.hr_memo_nudges).toHaveLength(1);
    expect(fake.tables.notifications).toHaveLength(notices);
  });

  it('three days after the reminder, sends ONE notice to the department head', async () => {
    const tables = scenario();
    const fake = makeFake({
      policy: { mode: 'live' },
      tables: {
        ...tables,
        institution_leaves: [],
        hr_memos: [{ id: 'memo-old', staff_id: STAFF_B, status: 'issued', issued_at: daysAgo(7) }],
        hr_memo_nudges: [
          { id: 'n1', memo_id: 'memo-old', nudge_kind: 'staff_reminder', status: 'sent', recorded_at: daysAgo(3) },
        ],
      },
    });
    const svc = new HRMemoService(fake.client);
    const res = await svc.runDetection(RUN, { now: NOW });

    expect(res.nudges_sent).toBe(1);
    const hod = fake.tables.hr_memo_nudges.find((n) => n.nudge_kind === 'hod_notice');
    expect(hod).toMatchObject({
      status: 'sent',
      recipient_source: 'department_head',
      recipient_profile_ids: [PROFILE_HOD],
    });
    const link = fake.tables.user_notifications.at(-1);
    expect(link).toMatchObject({ user_id: PROFILE_HOD });

    // Never twice
    const again = await svc.runDetection(RUN2, { now: NOW });
    expect(again.nudges_sent).toBe(0);
    expect(fake.tables.hr_memo_nudges.filter((n) => n.nudge_kind === 'hod_notice')).toHaveLength(1);
  });

  it('records no_recipient when no reporting head can be found, and sends nothing', async () => {
    const fake = makeFake({
      policy: { mode: 'live' },
      tables: {
        staff: [
          {
            id: STAFF_B,
            profile_id: PROFILE_B,
            first_name: 'Bala',
            last_name: 'K',
            department_id: null,
          },
        ],
        hr_memos: [{ id: 'memo-old', staff_id: STAFF_B, status: 'issued', issued_at: daysAgo(8) }],
        hr_memo_nudges: [
          { id: 'n1', memo_id: 'memo-old', nudge_kind: 'staff_reminder', status: 'sent', recorded_at: daysAgo(4) },
        ],
      },
    });
    const res = await new HRMemoService(fake.client).runDetection(RUN, { now: NOW });

    expect(res.nudges_sent).toBe(0);
    expect(fake.tables.notifications).toEqual([]);
    expect(fake.tables.hr_memo_nudges.find((n) => n.nudge_kind === 'hod_notice')).toMatchObject({
      status: 'no_recipient',
      recipient_source: 'none',
    });
  });
});

// ---------------------------------------------------------------------------
describe('nudge windows (pure)', () => {
  const s: MemoDetectorSettings = { ...DEFAULT_MEMO_DETECTOR_SETTINGS, mode: 'live' };
  const memo = (id: string, age: number, status = 'issued') => ({ id, status, issued_at: daysAgo(age) });

  it('reminds at 3 days, not before', () => {
    expect(dueNudges([memo('m', 2.9)], [], NOW, s)).toEqual([]);
    expect(dueNudges([memo('m', 3)], [], NOW, s)).toEqual([{ memo_id: 'm', kind: 'staff_reminder' }]);
  });

  it('never nudges an acknowledged, disputed or resolved memo', () => {
    for (const st of ['acknowledged', 'disputed', 'resolved']) {
      expect(dueNudges([memo('m', 10, st)], [], NOW, s)).toEqual([]);
    }
  });

  it('does not start reminding memos older than the max age', () => {
    expect(dueNudges([memo('m', 31)], [], NOW, s)).toEqual([]);
  });

  it('notifies the head 3 days after the reminder, once', () => {
    const rem = { memo_id: 'm', nudge_kind: 'staff_reminder' as const, recorded_at: daysAgo(2) };
    expect(dueNudges([memo('m', 5)], [rem], NOW, s)).toEqual([]);
    const rem3 = { ...rem, recorded_at: daysAgo(3) };
    expect(dueNudges([memo('m', 6)], [rem3], NOW, s)).toEqual([
      { memo_id: 'm', kind: 'hod_notice', reminder_delivered: true },
    ]);
    const hod = { memo_id: 'm', nudge_kind: 'hod_notice' as const, recorded_at: daysAgo(1) };
    expect(dueNudges([memo('m', 40)], [rem3, hod], NOW, s)).toEqual([]);
  });

  it('parses the switch conservatively', () => {
    expect(parseMemoDetectorSettings(null).mode).toBe('off');
    expect(parseMemoDetectorSettings('live').mode).toBe('off');
    expect(parseMemoDetectorSettings({ mode: 'LIVE' }).mode).toBe('off');
    expect(parseMemoDetectorSettings({ mode: 'live', staff_reminder_after_days: -1 })).toMatchObject({
      mode: 'live',
      staff_reminder_after_days: 3,
    });
    expect(effectiveMode('off', true)).toBe('off');
    expect(effectiveMode('live', true)).toBe('dry_run');
    expect(effectiveMode('live', false)).toBe('live');
  });
});

// ---------------------------------------------------------------------------
describe('migration 20270613101223 seeds the detector switched off', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20270613101223_hr_memo_detector_schedule_disabled_with_dry_run.sql',
    ),
    'utf8',
  ).replace(/--[^\n]*/g, '');

  it('seeds the schedule row disabled', () => {
    expect(sql).toMatch(/\('hr-memo-auto-detector',\s*false,/);
    expect(sql).toMatch(/ON CONFLICT \(routine_id\) DO UPDATE\s+SET enabled\s*=\s*false/);
  });

  it('seeds the switch as dry_run, never live', () => {
    expect(sql).toMatch(/'\{"mode":"dry_run"/);
    expect(sql).not.toMatch(/"mode":"live"/);
  });
});

// ---------------------------------------------------------------------------
// Follow-up to the #4151 deep review (each test fails with its fix reverted)
// ---------------------------------------------------------------------------
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function liveWithMemo(nudges: Row[], extra: Partial<Record<string, Row[]>> = {}) {
  const tables = scenario();
  return makeFake({
    policy: { mode: 'live' },
    tables: {
      ...tables,
      institution_leaves: [],
      hr_memos: [{ id: 'memo-old', staff_id: STAFF_B, status: 'issued', issued_at: daysAgo(10) }],
      hr_memo_nudges: nudges,
      ...(extra as Record<string, Row[]>),
    },
  });
}

describe('review finding 1 — events for a non-team-member id never sit pending', () => {
  it('live: an event naming a profile id (a holiday declarer) is dismissed with the reason, and is not previewed again', async () => {
    const fake = makeFake({ policy: { mode: 'live' }, tables: scenario() });
    const svc = new HRMemoService(fake.client);
    await svc.runDetection(RUN, { now: NOW });

    const ev = fake.tables.hr_memo_eligibility_events.find((e) => e.staff_id === PROFILE_A);
    expect(ev).toMatchObject({ is_dismissed: true, dismissed_reason: UNRESOLVABLE_EVENT_REASON });
    expect(ev?.processed_into_memo_id ?? null).toBeNull();

    const second = await svc.runDetection(RUN2, { now: NOW });
    expect(second.preview.memos.find((m) => m.staff_id === PROFILE_A)).toBeUndefined();
  });

  it('live: the pending read takes the OLDEST events first, so a pile of newer rows cannot crowd out a real one', async () => {
    const junk: Row[] = Array.from({ length: 600 }, (_, i) => ({
      id: `junk-${String(i).padStart(4, '0')}`,
      staff_id: `ffffffff-0000-4000-8000-${String(i).padStart(12, '0')}`,
      event_type: 'leave_before_approval',
      event_detail: { leave_id: `x${i}` },
      detected_at: daysAgo(1),
      processed_into_memo_id: null,
      is_dismissed: false,
    }));
    const real: Row = {
      id: 'real-event',
      staff_id: STAFF_A,
      event_type: 'leave_before_approval',
      event_detail: { leave_id: 'leave-real', leave_name: 'Casual' },
      detected_at: daysAgo(5),
      processed_into_memo_id: null,
      is_dismissed: false,
    };
    const fake = makeFake({
      policy: { mode: 'live' },
      tables: { ...scenario(), institution_leaves: [], hr_memos: [], hr_memo_eligibility_events: [...junk, real] },
    });
    const res = await new HRMemoService(fake.client).runDetection(RUN, { now: NOW });

    expect(res.memos_created).toBe(1);
    expect(fake.tables.hr_memos.find((m) => m.triggered_by_event_id === 'real-event')).toBeDefined();
  });
});

describe('review finding 2 — the head is never told a reminder was sent when it was not', () => {
  const s: MemoDetectorSettings = { ...DEFAULT_MEMO_DETECTOR_SETTINGS, mode: 'live' };
  const memo = { id: 'm', status: 'issued', issued_at: daysAgo(10) };
  const rem = (status: string, recordedDaysAgo: number, createdDaysAgo = recordedDaysAgo) => ({
    id: 'r1',
    memo_id: 'm',
    nudge_kind: 'staff_reminder' as const,
    status,
    recorded_at: daysAgo(recordedDaysAgo),
    created_at: daysAgo(createdDaysAgo),
  });

  it('a reminder still being sent (fresh claim) starts no head notice', () => {
    const fresh = { ...rem('claimed', 0), recorded_at: hoursAgo(1), created_at: hoursAgo(1) };
    expect(dueNudges([memo], [fresh], NOW, s)).toEqual([]);
  });

  it('a failed reminder inside the retry window is retried, and no head notice goes out', () => {
    expect(dueNudges([memo], [rem('failed', 1)], NOW, s)).toEqual([
      { memo_id: 'm', kind: 'staff_reminder', retry_of: { id: 'r1', status: 'failed', recorded_at: daysAgo(1) } },
    ]);
  });

  it('a reminder with nobody to send it to tells the head it was NOT delivered', async () => {
    expect(dueNudges([memo], [rem('no_recipient', 3)], NOW, s)).toEqual([
      { memo_id: 'm', kind: 'hod_notice', reminder_delivered: false },
    ]);

    const fake = liveWithMemo([
      { id: 'n1', memo_id: 'memo-old', nudge_kind: 'staff_reminder', status: 'no_recipient', recorded_at: daysAgo(3), created_at: daysAgo(3) },
    ]);
    const res = await new HRMemoService(fake.client).runDetection(RUN, { now: NOW });
    expect(res.nudges_sent).toBe(1);
    const notice = fake.tables.notifications.at(-1) as Row;
    expect(String(notice.body)).toMatch(/could NOT be delivered/);
    expect(String(notice.body)).not.toMatch(/already been sent/);
  });

  it('a reminder that kept failing past the retry window also tells the head it was NOT delivered', () => {
    expect(dueNudges([memo], [rem('failed', 3, 5)], NOW, s)).toEqual([
      { memo_id: 'm', kind: 'hod_notice', reminder_delivered: false },
    ]);
  });
});

describe('review finding 4 — two overlapping runs issue ONE memo', () => {
  it('concurrent runs over the same pending event create one memo and one notice', async () => {
    const event: Row = {
      id: 'ev-1',
      staff_id: STAFF_A,
      event_type: 'leave_before_approval',
      event_detail: { leave_id: 'leave-x', leave_name: 'Casual' },
      detected_at: daysAgo(1),
      processed_into_memo_id: null,
      is_dismissed: false,
    };
    const fake = makeFake({
      policy: { mode: 'live' },
      tables: { ...scenario(), institution_leaves: [], hr_memos: [], hr_memo_eligibility_events: [event] },
    });
    const a = new HRMemoService(fake.client);
    const b = new HRMemoService(fake.client);
    const [r1, r2] = await Promise.all([a.runDetection(RUN, { now: NOW }), b.runDetection(RUN2, { now: NOW })]);

    expect(r1.memos_created + r2.memos_created).toBe(1);
    expect(fake.tables.hr_memos).toHaveLength(1);
    expect(fake.tables.notifications).toHaveLength(1);
    expect(fake.tables.hr_memo_eligibility_events[0].processed_into_memo_id).toBe(fake.tables.hr_memos[0].id);
  });

  it('a memo insert that fails releases the claim, so the next run can issue it', async () => {
    const event: Row = {
      id: 'ev-2',
      staff_id: STAFF_A,
      event_type: 'leave_before_approval',
      event_detail: { leave_id: 'leave-y' },
      detected_at: daysAgo(1),
      processed_into_memo_id: null,
      is_dismissed: false,
    };
    const fake = makeFake({
      policy: { mode: 'live' },
      tables: { ...scenario(), institution_leaves: [], hr_memos: [], hr_memo_eligibility_events: [event] },
      failInsertOn: ['hr_memos'],
    });
    const res = await new HRMemoService(fake.client).runDetection(RUN, { now: NOW });
    expect(res.memos_created).toBe(0);
    expect(res.errors.join(' ')).toMatch(/memo for event ev-2/);
    expect(fake.tables.hr_memo_eligibility_events[0].processed_into_memo_id).toBeNull();
  });
});

describe('review finding 5 — a failed or abandoned nudge is retried, within bounds', () => {
  it('a failed reminder from yesterday is re-claimed and sent', async () => {
    const fake = liveWithMemo([
      { id: 'n1', memo_id: 'memo-old', nudge_kind: 'staff_reminder', status: 'failed', recorded_at: daysAgo(1), created_at: daysAgo(1) },
    ]);
    const res = await new HRMemoService(fake.client).runDetection(RUN, { now: NOW });
    expect(res.nudges_sent).toBe(1);
    expect(fake.tables.hr_memo_nudges).toHaveLength(1);
    expect(fake.tables.hr_memo_nudges[0]).toMatchObject({ status: 'sent', run_id: RUN, recipient_profile_ids: [PROFILE_B] });
  });

  it('a claim abandoned by a crashed run (older than the stale limit) is retried', async () => {
    const fake = liveWithMemo([
      { id: 'n1', memo_id: 'memo-old', nudge_kind: 'staff_reminder', status: 'claimed', recorded_at: hoursAgo(12), created_at: hoursAgo(12) },
    ]);
    const res = await new HRMemoService(fake.client).runDetection(RUN, { now: NOW });
    expect(res.nudges_sent).toBe(1);
    expect(fake.tables.hr_memo_nudges[0]).toMatchObject({ status: 'sent' });
  });

  it('a retry after a crash that had already written the notice does not send it twice', async () => {
    const fake = liveWithMemo(
      [{ id: 'n1', memo_id: 'memo-old', nudge_kind: 'staff_reminder', status: 'claimed', recorded_at: hoursAgo(12), created_at: hoursAgo(12) }],
      {
        notifications: [{ id: 'notif-1', title: 't', body: 'b', idempotency_key: 'hr_memo_nudge:memo-old:staff_reminder' }],
        user_notifications: [],
      },
    );
    const res = await new HRMemoService(fake.client).runDetection(RUN, { now: NOW });
    expect(res.nudges_sent).toBe(1);
    expect(fake.tables.notifications).toHaveLength(1);
    expect(fake.tables.user_notifications).toEqual([expect.objectContaining({ notification_id: 'notif-1', user_id: PROFILE_B })]);
  });

  it('retries stop after the retry window', async () => {
    const fake = liveWithMemo([
      { id: 'n1', memo_id: 'memo-old', nudge_kind: 'staff_reminder', status: 'failed', recorded_at: daysAgo(1), created_at: daysAgo(3) },
    ]);
    const res = await new HRMemoService(fake.client).runDetection(RUN, { now: NOW });
    expect(res.nudges_sent).toBe(0);
    expect(fake.tables.hr_memo_nudges[0]).toMatchObject({ status: 'failed' });
  });
});

describe('review finding 8 — every open memo past the cutoff is read, not just the newest 1000', () => {
  it('the OLDEST of 1,001 open memos still gets its head notice', async () => {
    const memos: Row[] = Array.from({ length: 1001 }, (_, i) => ({
      id: `memo-${String(i).padStart(4, '0')}`,
      staff_id: STAFF_B,
      status: 'issued',
      issued_at: new Date(NOW.getTime() - (10 * 86_400_000 + i * 60_000)).toISOString(),
    }));
    const oldest = memos[1000].id as string;
    const nudges: Row[] = memos.flatMap((m) => {
      const rows: Row[] = [
        { id: `r-${m.id}`, memo_id: m.id, nudge_kind: 'staff_reminder', status: 'sent', recorded_at: daysAgo(4), created_at: daysAgo(4) },
      ];
      if (m.id !== oldest) {
        rows.push({ id: `h-${m.id}`, memo_id: m.id, nudge_kind: 'hod_notice', status: 'sent', recorded_at: daysAgo(1), created_at: daysAgo(1) });
      }
      return rows;
    });
    const fake = makeFake({
      policy: { mode: 'live' },
      tables: { ...scenario(), institution_leaves: [], hr_memos: memos, hr_memo_nudges: nudges },
    });
    const res = await new HRMemoService(fake.client).runDetection(RUN, { now: NOW });
    expect(res.nudges_sent).toBe(1);
    expect(fake.tables.hr_memo_nudges.find((n) => n.memo_id === oldest && n.nudge_kind === 'hod_notice')).toMatchObject({
      status: 'sent',
    });
  });
});

describe('review finding 9 — the issue date in a message is the Indian calendar date', () => {
  it('a memo issued at 01:30 IST is dated that day, not the UTC day before', async () => {
    expect(istDate('2026-10-05T20:00:00Z')).toBe('2026-10-06');
    const fake = liveWithMemo([], {
      hr_memos: [{ id: 'memo-old', staff_id: STAFF_B, status: 'issued', issued_at: '2026-10-05T20:00:00Z' }],
    });
    await new HRMemoService(fake.client).runDetection(RUN, { now: NOW });
    const notice = fake.tables.notifications.at(-1) as Row;
    expect(String(notice.body)).toContain('issued to you on 2026-10-06');
  });
});
