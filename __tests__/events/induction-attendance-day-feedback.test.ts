// BUG-005859: the induction report's Day scope showed 0 feedback for an
// induction that runs with day feedback switched off (feedback_day_enabled =
// false) and collects SESSION feedback instead. In that case the day column
// must count session feedback given on that day's sessions.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Tables = Record<string, any[]>;
let tables: Tables = {};
// Tables whose reads return an error instead of data.
let failing: Set<string> = new Set();

// Minimal PostgREST-style fake: eq / in filters, order, range, maybeSingle,
// awaitable. Like real PostgREST it never returns more than 1,000 rows in one
// response, so an unpaged read of a big table is silently truncated.
const MAX_ROWS = 1000;
function from(table: string) {
  let rows = [...(tables[table] ?? [])];
  let slice: [number, number] | null = null;
  const err = () => (failing.has(table) ? { message: `boom: ${table}` } : null);
  const result = () => {
    if (err()) return { data: null, error: err() };
    const picked = slice ? rows.slice(slice[0], slice[1] + 1) : rows;
    return { data: picked.slice(0, MAX_ROWS), error: null };
  };
  const q: any = {
    select: () => q,
    eq: (col: string, val: any) => { rows = rows.filter((r) => r[col] === val); return q; },
    in: (col: string, vals: any[]) => { rows = rows.filter((r) => vals.includes(r[col])); return q; },
    order: (col: string) => { rows.sort((a, b) => String(a[col]).localeCompare(String(b[col]))); return q; },
    range: (a: number, b: number) => { slice = [a, b]; return q; },
    maybeSingle: async () => (err() ? { data: null, error: err() } : { data: rows[0] ?? null, error: null }),
    then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
  };
  return q;
}

let roster = [
  { learner_id: 'L1', name: 'One', status: 'present' },
  { learner_id: 'L2', name: 'Two', status: 'present' },
  { learner_id: 'L3', name: 'Three', status: 'absent' },
];

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    rpc: async (fn: string) =>
      fn === 'fn_induction_can_manage_event'
        ? { data: true, error: null }
        : { data: roster, error: null },
  }),
  createServiceRoleClient: () => ({ from }),
}));

import { GET } from '@/app/api/events/[eventId]/induction-attendance/route';

async function dayReport(day: number) {
  const req = new Request(`http://x/api/events/E1/induction-attendance?day=${day}`) as any;
  const res = await GET(req, { params: Promise.resolve({ eventId: 'E1' }) });
  const body = await res.json();
  return Object.fromEntries(body.rows.map((r: any) => [r.learner_id, r.feedback_submitted]));
}

async function rawDay(day: number) {
  const req = new Request(`http://x/api/events/E1/induction-attendance?day=${day}`) as any;
  return GET(req, { params: Promise.resolve({ eventId: 'E1' }) });
}

const baseRoster = roster;
let errSpy: any;
beforeEach(() => {
  roster = baseRoster;
  failing = new Set();
  errSpy?.mockRestore();
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  tables = {
    learners_profiles: [],
    event_sessions: [
      { id: 'S1', event_id: 'E1', day_number: 1 },
      { id: 'S2', event_id: 'E1', day_number: 1 },
      { id: 'S3', event_id: 'E1', day_number: 2 },
    ],
    event_session_feedback: [
      { id: 'f1', session_id: 'S1', learner_id: 'L1' },
      { id: 'f2', session_id: 'S2', learner_id: 'L1' },
      { id: 'f3', session_id: 'S2', learner_id: 'L2' },
      { id: 'f4', session_id: 'S3', learner_id: 'L3' }, // day 2 — must not count for day 1
    ],
    event_day_feedback: [],
  };
});

describe('induction attendance report — day-scope feedback', () => {
  it('counts session feedback on that day when day feedback is OFF', async () => {
    tables.induction_programs = [{ event_id: 'E1', feedback_day_enabled: false }];
    expect(await dayReport(1)).toEqual({ L1: true, L2: true, L3: false });
    expect(await dayReport(2)).toEqual({ L1: false, L2: false, L3: true });
  });

  it('keeps reading day feedback when day feedback is ON', async () => {
    tables.induction_programs = [{ event_id: 'E1', feedback_day_enabled: true }];
    tables.event_day_feedback = [{ id: 'd1', event_id: 'E1', day_number: 1, learner_id: 'L3' }];
    expect(await dayReport(1)).toEqual({ L1: false, L2: false, L3: true });
  });

  it('session scope is unchanged', async () => {
    const req = new Request('http://x/api/events/E1/induction-attendance?sessionId=S2') as any;
    const res = await GET(req, { params: Promise.resolve({ eventId: 'E1' }) });
    const body = await res.json();
    expect(Object.fromEntries(body.rows.map((r: any) => [r.learner_id, r.feedback_submitted])))
      .toEqual({ L1: true, L2: true, L3: false });
  });

  it('counts every learner when day feedback spans more than 1,000 rows (pages)', async () => {
    // 300 learners x 5 sessions = 1,500 rows. Rows are ordered so the LAST
    // 100 learners only appear past row 1,000 — an unpaged read misses them.
    const n = 300;
    roster = Array.from({ length: n }, (_, i) => ({
      learner_id: `P${String(i).padStart(3, '0')}`, name: `P${i}`, status: 'present',
    }));
    tables.induction_programs = [{ event_id: 'E1', feedback_day_enabled: false }];
    tables.event_sessions = Array.from({ length: 5 }, (_, s) => ({ id: `D${s}`, event_id: 'E1', day_number: 1 }));
    tables.event_session_feedback = [];
    let k = 0;
    for (const r of roster) for (let s = 0; s < 5; s++) {
      tables.event_session_feedback.push({
        id: `x${String(k++).padStart(5, '0')}`, session_id: `D${s}`, learner_id: r.learner_id,
      });
    }
    const out = await dayReport(1);
    expect(Object.keys(out)).toHaveLength(n);
    expect(Object.values(out).every(Boolean)).toBe(true);
  });

  it('returns 500 when the induction_programs lookup fails', async () => {
    tables.induction_programs = [{ event_id: 'E1', feedback_day_enabled: false }];
    failing.add('induction_programs');
    const res = await rawDay(1);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('boom');
  });

  it('a missing induction_programs row keeps the day-feedback path', async () => {
    tables.induction_programs = [];
    tables.event_day_feedback = [{ id: 'd1', event_id: 'E1', day_number: 1, learner_id: 'L2' }];
    expect(await dayReport(1)).toEqual({ L1: false, L2: true, L3: false });
  });

  it('returns 500 when the session feedback read fails', async () => {
    tables.induction_programs = [{ event_id: 'E1', feedback_day_enabled: false }];
    failing.add('event_session_feedback');
    const res = await rawDay(1);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('boom');
  });
});
