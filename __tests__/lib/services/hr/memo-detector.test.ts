import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

import { HRMemoService } from '@/lib/services/hr/memo-service';
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
  op: 'insert' | 'update';
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
    private op: 'select' | 'insert' | 'update' = 'select';
    private payload: unknown = null;
    private returning = false;
    private lim: number | null = null;
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
    order() {
      return this;
    }
    limit(n: number) {
      this.lim = n;
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

      if (this.op === 'insert') {
        const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
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
        return { data: null, error: null };
      }

      const limited = this.lim == null ? matched : matched.slice(0, this.lim);
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
    expect(dueNudges([memo('m', 6)], [rem3], NOW, s)).toEqual([{ memo_id: 'm', kind: 'hod_notice' }]);
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
