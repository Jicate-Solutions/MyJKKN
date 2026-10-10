// BUG-005859: the induction report's Day scope showed 0 feedback for an
// induction that runs with day feedback switched off (feedback_day_enabled =
// false) and collects SESSION feedback instead. In that case the day column
// must count session feedback given on that day's sessions.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Tables = Record<string, any[]>;
let tables: Tables = {};

// Minimal PostgREST-style fake: eq / in filters, maybeSingle, awaitable.
function from(table: string) {
  let rows = [...(tables[table] ?? [])];
  const q: any = {
    select: () => q,
    eq: (col: string, val: any) => { rows = rows.filter((r) => r[col] === val); return q; },
    in: (col: string, vals: any[]) => { rows = rows.filter((r) => vals.includes(r[col])); return q; },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej),
  };
  return q;
}

const roster = [
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

beforeEach(() => {
  tables = {
    learners_profiles: [],
    event_sessions: [
      { id: 'S1', event_id: 'E1', day_number: 1 },
      { id: 'S2', event_id: 'E1', day_number: 1 },
      { id: 'S3', event_id: 'E1', day_number: 2 },
    ],
    event_session_feedback: [
      { session_id: 'S1', learner_id: 'L1' },
      { session_id: 'S2', learner_id: 'L1' },
      { session_id: 'S2', learner_id: 'L2' },
      { session_id: 'S3', learner_id: 'L3' }, // day 2 — must not count for day 1
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
    tables.event_day_feedback = [{ event_id: 'E1', day_number: 1, learner_id: 'L3' }];
    expect(await dayReport(1)).toEqual({ L1: false, L2: false, L3: true });
  });

  it('session scope is unchanged', async () => {
    const req = new Request('http://x/api/events/E1/induction-attendance?sessionId=S2') as any;
    const res = await GET(req, { params: Promise.resolve({ eventId: 'E1' }) });
    const body = await res.json();
    expect(Object.fromEntries(body.rows.map((r: any) => [r.learner_id, r.feedback_submitted])))
      .toEqual({ L1: true, L2: true, L3: false });
  });
});
