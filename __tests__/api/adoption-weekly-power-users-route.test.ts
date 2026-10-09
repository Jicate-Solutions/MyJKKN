/**
 * Adoption — the weekly Power Users run (Director 2026-10-09).
 *
 *   GET /api/cron/adoption-weekly-power-users
 *
 * Who is counted, ranked or left out is fn_adoption_power_users's job and is
 * proved by supabase/tests/adoption/25_power_users.sql. Here, the route's own
 * promises:
 *   - no CRON_SECRET configured = 500; no or wrong secret = 401, nothing read;
 *   - ?week= must be a Monday (400 otherwise), and is what the RPC receives;
 *   - ?dry_run=1 writes nothing and queues nothing, but shows the prompts;
 *   - a real run queues at most 10 agenda jobs, one per top person, with the
 *     dedupe key adoption-agenda:<week>:<user>, and stores the job ids;
 *   - a person's prompt holds only that person's data;
 *   - a re-run keeps people who already have an agenda job;
 *   - an RPC error, or a run where every job failed to queue, is a 500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data: unknown; error: { message: string } | null };
type Call = { table: string; op: string; args: unknown[] };

let rpcResult: Result;
let tableResults: Record<string, Result>;
let calls: Call[];
const rpc = vi.fn((_name: string, _args?: Record<string, unknown>) => Promise.resolve(rpcResult));

function builder(table: string) {
  const record = (op: string, args: unknown[]) => calls.push({ table, op, args });
  const result = () => tableResults[table] ?? { data: null, error: null };
  const chain: Record<string, unknown> = {};
  for (const op of ['select', 'in', 'gte', 'order', 'limit', 'eq', 'upsert', 'update']) {
    chain[op] = (...args: unknown[]) => {
      record(op, args);
      return chain;
    };
  }
  chain.maybeSingle = () => {
    record('maybeSingle', []);
    return Promise.resolve(result());
  };
  chain.then = (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return chain;
}
const from = vi.fn((table: string) => builder(table));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc, from }),
}));

const enqueueJobsLane = vi.fn();
vi.mock('@/lib/services/platform/ai-jobs-lane', () => ({
  enqueueJobsLane: (...args: unknown[]) => enqueueJobsLane(...args),
  extractJobResultText: () => null,
}));

import { GET } from '@/app/api/cron/adoption-weekly-power-users/route';
import { summarizeRoutineResult } from '@/lib/ai-routines/summarize-routine-result';

const SECRET = 'test-cron-secret';
const WEEK = '2026-09-28';

function person(i: number, extra: Record<string, unknown> = {}) {
  return {
    user_id: `u-${String(i).padStart(2, '0')}`,
    full_name: `Person ${i}`,
    role: 'hod',
    institution_id: 'c-1',
    institution_name: `College ${i}`,
    features_used: 20 - i,
    records_saved: i,
    active_days: 3,
    modules: [{ module: `module-of-${i}`, count: 7 }],
    ...extra,
  };
}

function payload(n: number) {
  return {
    week_start: WEEK,
    window: { start: 'x', end: 'y' },
    excluded_institution_ids: [],
    top: Array.from({ length: n }, (_, i) => person(i + 1)),
    one_day_staff: [person(90)],
    one_day_learners_by_college: [{ institution_id: 'c-1', institution_name: 'College 1', count: 4 }],
  };
}

function request(opts: { bearer?: string; query?: string } = {}) {
  return {
    headers: new Headers(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
    nextUrl: new URL(`http://localhost:3000/api/cron/adoption-weekly-power-users${opts.query ?? ''}`),
  } as never;
}

const writes = () => calls.filter((c) => c.op === 'upsert' || c.op === 'update');

beforeEach(() => {
  rpc.mockClear();
  from.mockClear();
  enqueueJobsLane.mockReset();
  let n = 0;
  enqueueJobsLane.mockImplementation(() => Promise.resolve({ ok: true, jobId: `job-${++n}` }));
  calls = [];
  rpcResult = { data: payload(10), error: null };
  tableResults = {
    bug_reports: {
      data: [
        { reporter_user_id: 'u-01', status: 'open', description: 'Attendance page   shows the wrong date', created_at: '2026-10-01' },
        { reporter_user_id: 'u-02', status: 'resolved', description: 'Someone else entirely', created_at: '2026-10-01' },
      ],
      error: null,
    },
    adoption_power_user_weeks: { data: null, error: null },
    ai_jobs: { data: [], error: null },
  };
  process.env.CRON_SECRET = SECRET;
});

describe('who can start the run', () => {
  it('refuses everything when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(request({ bearer: 'anything' }));
    expect(res.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a caller with no secret, and reads nothing', async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('refuses a wrong secret', async () => {
    const res = await GET(request({ bearer: 'nope', query: '?secret=nope' }));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('accepts the secret as ?secret= (the improvement-rank-ideas form)', async () => {
    const res = await GET(request({ query: `?secret=${SECRET}&dry_run=1` }));
    expect(res.status).toBe(200);
  });
});

describe('which week', () => {
  it('refuses a week that is not a Monday with 400, before reading anything', async () => {
    const res = await GET(request({ bearer: SECRET, query: '?week=2026-09-29' }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a malformed week', async () => {
    const res = await GET(request({ bearer: SECRET, query: '?week=yesterday' }));
    expect(res.status).toBe(400);
  });

  it('passes a Monday straight to the report function', async () => {
    await GET(request({ bearer: SECRET, query: `?week=${WEEK}&dry_run=1` }));
    expect(rpc).toHaveBeenCalledWith('fn_adoption_power_users', { p_week_start: WEEK });
  });

  it('defaults to the Monday of the previous IST week', async () => {
    await GET(request({ bearer: SECRET, query: '?dry_run=1' }));
    const sent = (rpc.mock.calls[0][1] as { p_week_start: string }).p_week_start;
    expect(new Date(`${sent}T00:00:00Z`).getUTCDay()).toBe(1);
  });
});

describe('dry run', () => {
  it('writes nothing and queues nothing, but returns the report and the prompts', async () => {
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}&dry_run=1` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dry_run).toBe(true);
    expect(body.result.top).toHaveLength(10);
    expect(body.prompts).toHaveLength(10);
    expect(enqueueJobsLane).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
    expect(calls.some((c) => c.table === 'adoption_power_user_weeks')).toBe(false);
  });
});

describe('a real run', () => {
  it('stores the week, queues one agenda job per top person with the right dedupe keys, and saves the ids', async () => {
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enqueued).toBe(10);
    expect(body.summary).toBe('top 10, one_day_staff 1, enqueued 10, in_flight 0, failed 0, kept 0');
    expect(JSON.stringify(body)).not.toContain('Person 1'); // no names on a real run

    expect(enqueueJobsLane).toHaveBeenCalledTimes(10);
    const keys = enqueueJobsLane.mock.calls.map((c) => (c[1] as { dedupeKey: string }).dedupeKey);
    expect(keys[0]).toBe(`adoption-agenda:${WEEK}:u-01`);
    expect(new Set(keys).size).toBe(10);
    for (const c of enqueueJobsLane.mock.calls) {
      expect((c[1] as { jobType: string }).jobType).toBe('adoption.chat_agenda');
    }

    const upsert = calls.find((c) => c.op === 'upsert');
    expect(upsert?.table).toBe('adoption_power_user_weeks');
    expect(upsert?.args[0]).not.toHaveProperty('agenda_jobs'); // a re-run keeps the stored ids
    const update = calls.find((c) => c.op === 'update');
    expect((update?.args[0] as { agenda_jobs: Record<string, string> }).agenda_jobs['u-01']).toBe('job-1');
  });

  it('never queues more than 10 jobs even if the report lists more people', async () => {
    rpcResult = { data: payload(14), error: null };
    await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(enqueueJobsLane).toHaveBeenCalledTimes(10);
  });

  it("puts only that person's own data in their prompt", async () => {
    await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    const prompt = (enqueueJobsLane.mock.calls[0][1] as { prompt: string }).prompt;
    expect(prompt).toContain('College 1');
    expect(prompt).toContain('module-of-1: 7');
    expect(prompt).toContain('[open] Attendance page shows the wrong date');
    expect(prompt).not.toContain('Person 1'); // not even their own name
    expect(prompt).not.toContain('u-01');
    expect(prompt).not.toContain('College 2');
    expect(prompt).not.toContain('module-of-2');
    expect(prompt).not.toContain('Someone else entirely');
  });

  it('keeps people who already have an agenda job this week, and retries one that ended in error', async () => {
    tableResults.adoption_power_user_weeks = {
      data: { agenda_jobs: { 'u-01': 'old-1', 'u-02': 'old-2' } },
      error: null,
    };
    tableResults.ai_jobs = {
      data: [
        { id: 'old-1', status: 'done' },
        { id: 'old-2', status: 'error' },
      ],
      error: null,
    };
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    const body = await res.json();
    expect(body.kept).toBe(1);
    expect(body.enqueued).toBe(9);
    const users = enqueueJobsLane.mock.calls.map((c) => (c[1] as { context: { user_id: string } }).context.user_id);
    expect(users).not.toContain('u-01');
    expect(users).toContain('u-02');
    const update = calls.find((c) => c.op === 'update');
    const stored = (update?.args[0] as { agenda_jobs: Record<string, string> }).agenda_jobs;
    expect(stored['u-01']).toBe('old-1');
    expect(stored['u-02']).not.toBe('old-2');
  });

  it('counts an already-queued job as in flight, not a failure', async () => {
    enqueueJobsLane.mockImplementation(() => Promise.resolve({ ok: false, reason: 'in_flight' }));
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.in_flight).toBe(10);
    expect(body.failed).toBe(0);
  });

  it('is a 500 when every agenda job fails to queue', async () => {
    enqueueJobsLane.mockImplementation(() =>
      Promise.resolve({ ok: false, reason: 'no_seat', error: 'no seat owner configured' })
    );
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('no_seat');
  });

  it('is a 500 when the report function fails', async () => {
    rpcResult = { data: null, error: { message: 'policy adoption.power_users.exclude_institution_ids is missing' } };
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(500);
    expect(enqueueJobsLane).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  it("gives the dispatcher a status line with the run's counts", async () => {
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    const line = summarizeRoutineResult(res.status, await res.json());
    expect(line).toContain('HTTP 200');
    expect(line).toContain('enqueued 10');
    expect(line).toContain('top 10');
  });
});
