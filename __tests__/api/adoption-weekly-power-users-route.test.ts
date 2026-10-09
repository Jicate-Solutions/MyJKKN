/**
 * Adoption — the weekly Power Users run (Director 2026-10-09).
 *
 *   GET /api/cron/adoption-weekly-power-users
 *
 * Who is counted, ranked or left out is fn_adoption_power_users's job and is
 * proved by supabase/tests/adoption/25_power_users.sql. Here, the route's own
 * promises:
 *   - no CRON_SECRET configured = 500; no, wrong or ?secret= secret = 401 (Bearer only), nothing read;
 *   - ?week= must be a Monday no later than the last completed IST week (400 otherwise), and is what the RPC receives;
 *   - ?dry_run=1 writes nothing and queues nothing, but shows the prompts;
 *   - a real run queues at most 10 agenda jobs, one per top person, with the
 *     dedupe key adoption-agenda:<week>:<user>, and stores the job ids;
 *   - a person's prompt holds only that person's data;
 *   - a re-run keeps people whose agenda job is queued or readable, found by dedupe key;
 *   - a job stuck over 24 h is cancelled and replaced (that run is a 500; a later ?week= re-run is a 200);
 *   - every 500 names the ?week= to re-run (the next scheduled run moves on to the next week);
 *   - an RPC error, or a run where ANY job failed to queue, is a 500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data: unknown; error: { message: string } | null };
type Call = { table: string; op: string; args: unknown[] };

let rpcResult: Result;
// A table's result, or a function of this query's own recorded calls (to answer
// two queries on one table differently).
let tableResults: Record<string, Result | ((ops: Call[]) => Result)>;
let calls: Call[];
const MERGE_FN = 'fn_adoption_power_user_weeks_merge_jobs';
const SUPERSEDE_FN = 'fn_adoption_agenda_supersede_stale';
let mergeResult: Result;
let supersedeResult: Result;
const rpc = vi.fn((name: string, _args?: Record<string, unknown>) =>
  Promise.resolve(name === MERGE_FN ? mergeResult : name === SUPERSEDE_FN ? supersedeResult : rpcResult)
);
/** The job ids the run merged into agenda_jobs (only the ones it changed). */
const merged = (): Record<string, string> | undefined =>
  (rpc.mock.calls.find((c) => c[0] === MERGE_FN)?.[1] as { p_jobs: Record<string, string> } | undefined)?.p_jobs;

function builder(table: string) {
  const record = (op: string, args: unknown[]) => calls.push({ table, op, args });
  // eq() filters array rows on columns the row actually has, like the database would.
  const eqs: Array<[string, unknown]> = [];
  const own: Call[] = [];
  const result = (): Result => {
    const entry = tableResults[table] ?? { data: null, error: null };
    const r = typeof entry === 'function' ? entry(own) : entry;
    if (!Array.isArray(r.data)) return r;
    const rows = (r.data as Array<Record<string, unknown>>).filter((row) =>
      eqs.every(([col, val]) => !(col in row) || row[col] === val)
    );
    return { ...r, data: rows };
  };
  const chain: Record<string, unknown> = {};
  for (const op of ['select', 'in', 'gte', 'lt', 'order', 'limit', 'eq', 'upsert', 'update']) {
    chain[op] = (...args: unknown[]) => {
      record(op, args);
      own.push({ table, op, args });
      if (op === 'eq') eqs.push([args[0] as string, args[1]]);
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
  extractJobResultText: (r: unknown) =>
    typeof r === 'string' ? r : ((r as { answer?: string } | null)?.answer ?? null),
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

const writes = () => [
  ...calls.filter((c) => c.op === 'upsert' || c.op === 'update'),
  ...rpc.mock.calls.filter((c) => c[0] === MERGE_FN),
];

beforeEach(() => {
  rpc.mockClear();
  from.mockClear();
  enqueueJobsLane.mockReset();
  let n = 0;
  enqueueJobsLane.mockImplementation(() => Promise.resolve({ ok: true, jobId: `job-${++n}` }));
  calls = [];
  rpcResult = { data: payload(10), error: null };
  mergeResult = { data: null, error: null };
  supersedeResult = { data: true, error: null };
  tableResults = {
    bug_reports: {
      data: [
        { reporter_user_id: 'u-01', status: 'open', module_name: 'Attendance', sub_module_name: null, description: 'Mr Kumar in Room 4 is rude', created_at: '2026-10-01' },
        { reporter_user_id: 'u-02', status: 'resolved', module_name: 'Someone else module', sub_module_name: null, description: 'x', created_at: '2026-10-01' },
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

  it('refuses the secret in the URL — Bearer only, so it never lands in request logs', async () => {
    const res = await GET(request({ query: `?secret=${SECRET}&dry_run=1` }));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('accepts the Bearer secret', async () => {
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}&dry_run=1` }));
    expect(res.status).toBe(200);
  });
});

describe('which week', () => {
  it('refuses a week that has not ended yet with 400 (it would hide the real report)', async () => {
    const res = await GET(request({ bearer: SECRET, query: '?week=2099-01-05' }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

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
    expect(calls.find((c) => c.op === 'update')).toBeUndefined(); // never a whole-map write
    expect(merged()?.['u-01']).toBe('job-1');
    expect(rpc.mock.calls.find((c) => c[0] === MERGE_FN)?.[1]).toMatchObject({ p_week_start: WEEK });
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
    expect(prompt).toContain('[open] Attendance');
    expect(prompt).not.toContain('Mr Kumar'); // a report's free text never reaches the model
    expect(prompt).not.toContain('Person 1'); // not even their own name
    expect(prompt).not.toContain('u-01');
    expect(prompt).not.toContain('College 2');
    expect(prompt).not.toContain('module-of-2');
    expect(prompt).not.toContain('Someone else module');
  });

  const agenda = JSON.stringify({ questions: ['q1', 'q2', 'q3'], topics: ['t1', 't2'] });
  const job = (user: string, id: string, status: string, result: unknown = null, requested_at: string | null = null) => ({
    id,
    status,
    result,
    requested_at,
    dedupe: `adoption-agenda:${WEEK}:${user}`,
  });

  it('keeps a queued job or a finished readable agenda; replaces an errored job', async () => {
    tableResults.ai_jobs = {
      data: [
        job('u-01', 'old-1', 'done', { answer: agenda }),
        job('u-02', 'old-2', 'error'),
        job('u-03', 'old-3', 'pending'),
      ],
      error: null,
    };
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    const body = await res.json();
    expect(body.kept).toBe(2);
    expect(body.enqueued).toBe(8);
    const users = enqueueJobsLane.mock.calls.map((c) => (c[1] as { context: { user_id: string } }).context.user_id);
    expect(users).not.toContain('u-01');
    expect(users).not.toContain('u-03');
    expect(users).toContain('u-02');
    const stored = merged() ?? {};
    expect(stored['u-01']).toBe('old-1');
    expect(stored['u-03']).toBe('old-3');
    expect(stored['u-02']).not.toBe('old-2');
  });

  it('finds a job whose id was never saved — even a finished one — so no second agenda is made', async () => {
    // agenda_jobs is empty: an earlier run queued the job, then failed to save its id
    tableResults.ai_jobs = { data: [job('u-01', 'lost-1', 'done', { answer: agenda })], error: null };
    await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    const lookup = calls.filter((c) => c.table === 'ai_jobs' && c.op === 'in');
    expect(lookup[0]?.args[0]).toBe('payload->>_dedupe');
    expect(lookup[0]?.args[1]).toContain(`adoption-agenda:${WEEK}:u-01`);
    const users = enqueueJobsLane.mock.calls.map((c) => (c[1] as { context: { user_id: string } }).context.user_id);
    expect(users).not.toContain('u-01');
    const stored = merged() ?? {};
    expect(stored['u-01']).toBe('lost-1');
  });

  it('replaces a finished job whose answer cannot be read as an agenda', async () => {
    tableResults.ai_jobs = { data: [job('u-01', 'bad-1', 'done', { answer: 'Sorry, I cannot help.' })], error: null };
    await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    const users = enqueueJobsLane.mock.calls.map((c) => (c[1] as { context: { user_id: string } }).context.user_id);
    expect(users).toContain('u-01');
  });

  it('uses only the newest job per person', async () => {
    tableResults.ai_jobs = {
      data: [job('u-01', 'new-err', 'error'), job('u-01', 'old-ok', 'done', { answer: agenda })],
      error: null,
    };
    await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    const users = enqueueJobsLane.mock.calls.map((c) => (c[1] as { context: { user_id: string } }).context.user_id);
    expect(users).toContain('u-01');
  });

  it('when the lookup fails, queues nobody (no doubled agenda) and answers 500 naming the ?week= to re-run', async () => {
    tableResults.adoption_power_user_weeks = { data: { agenda_jobs: { 'u-01': 'old-1' } }, error: null };
    tableResults.ai_jobs = { data: null, error: { message: 'boom' } };
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.kept).toBe(1);
    expect(body.enqueued).toBe(0);
    expect(body.failed).toBe(9);
    expect(enqueueJobsLane).not.toHaveBeenCalled();
  });

  it('is a 500 when a job lookup fails even if everyone already had a stored id', async () => {
    const all = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`u-${String(i + 1).padStart(2, '0')}`, `old-${i}`]));
    tableResults.adoption_power_user_weeks = { data: { agenda_jobs: all }, error: null };
    tableResults.ai_jobs = { data: null, error: { message: 'boom' } };
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.kept).toBe(10);
    expect(enqueueJobsLane).not.toHaveBeenCalled();
  });

  it('is a 500 when another run queued the job but its id cannot be read', async () => {
    enqueueJobsLane.mockImplementation(() => Promise.resolve({ ok: false, reason: 'in_flight' }));
    tableResults.ai_jobs = (ops) =>
      ops.some((o) => o.op === 'eq' && o.args[0] === 'payload->>_dedupe')
        ? { data: null, error: { message: 'timeout' } }
        : { data: [], error: null };
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(500);
    expect((await res.json()).failed).toBe(10);
  });

  it('records a job another run queued that has ALREADY finished (done)', async () => {
    enqueueJobsLane.mockImplementation(() => Promise.resolve({ ok: false, reason: 'in_flight' }));
    tableResults.ai_jobs = (ops) =>
      ops.some((o) => o.op === 'eq' && o.args[0] === 'payload->>_dedupe')
        ? { data: [{ id: 'done-1', status: 'done' }], error: null }
        : { data: [], error: null };
    await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    const statusFilter = calls.find((c) => c.table === 'ai_jobs' && c.op === 'in' && c.args[0] === 'status');
    expect(statusFilter?.args[1]).toContain('done');
    expect(merged()?.['u-01']).toBe('done-1');
  });

  it('replaces a job stuck in the queue for over a day: cancels it, queues a fresh one, and still reports it (500)', async () => {
    const old = new Date(Date.now() - 30 * 3600_000).toISOString();
    tableResults.ai_jobs = { data: [job('u-01', 'stuck-1', 'pending', null, old)], error: null };
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.failures.join(' ')).toContain('24 h');
    expect(body.stale_replaced).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.enqueued).toBe(10);
    expect(rpc).toHaveBeenCalledWith(SUPERSEDE_FN, { p_job_id: 'stuck-1' });
    const users = enqueueJobsLane.mock.calls.map((c) => (c[1] as { context: { user_id: string } }).context.user_id);
    expect(users).toContain('u-01');
    const stored = merged() ?? {};
    expect(stored['u-01']).toBeDefined();
    expect(stored['u-01']).not.toBe('stuck-1');
  });

  it('a later ?week= re-run after a stuck job was replaced succeeds (200): the fresh job is kept', async () => {
    // Run 1: u-01's job is stuck -> replaced.
    const old = new Date(Date.now() - 30 * 3600_000).toISOString();
    tableResults.ai_jobs = { data: [job('u-01', 'stuck-1', 'pending', null, old)], error: null };
    const first = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(first.status).toBe(500);
    const fresh = (merged() ?? {})['u-01'];
    expect(fresh).toBeDefined();
    expect(fresh).not.toBe('stuck-1');
    // Run 2: the lookup now finds the cancelled job and, newer, the fresh pending one.
    rpc.mockClear();
    enqueueJobsLane.mockClear();
    const now = new Date().toISOString();
    tableResults.ai_jobs = {
      data: [job('u-01', fresh, 'pending', null, now), job('u-01', 'stuck-1', 'canceled', null, old)],
      error: null,
    };
    const second = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.stale_replaced).toBe(0);
    expect(body.failed).toBe(0);
    expect(rpc).not.toHaveBeenCalledWith(SUPERSEDE_FN, expect.anything());
    const users = enqueueJobsLane.mock.calls.map((c) => (c[1] as { context: { user_id: string } }).context.user_id);
    expect(users).not.toContain('u-01');
  });

  it('keeps a stuck job and queues nothing for that person when it cannot be cancelled', async () => {
    const old = new Date(Date.now() - 30 * 3600_000).toISOString();
    tableResults.ai_jobs = { data: [job('u-01', 'stuck-1', 'pending', null, old)], error: null };
    supersedeResult = { data: false, error: null };
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.failed).toBe(1);
    expect(body.stale_replaced).toBe(0);
    const users = enqueueJobsLane.mock.calls.map((c) => (c[1] as { context: { user_id: string } }).context.user_id);
    expect(users).not.toContain('u-01');
  });

  it("reads problem reports from the 30 days that END with the reported week", async () => {
    await GET(request({ bearer: SECRET, query: `?week=${WEEK}&dry_run=1` }));
    const lt = calls.find((c) => c.table === 'bug_reports' && c.op === 'lt');
    const gte = calls.find((c) => c.table === 'bug_reports' && c.op === 'gte');
    expect(lt?.args[1]).toBe(new Date(Date.parse(`${WEEK}T00:00:00+05:30`) + 7 * 86400_000).toISOString());
    expect(gte?.args[1]).toBe(new Date(Date.parse(`${WEEK}T00:00:00+05:30`) + 7 * 86400_000 - 30 * 86400_000).toISOString());
  });

  it('records the id of a job another run queued at the same moment (in_flight)', async () => {
    enqueueJobsLane.mockImplementation(() => Promise.resolve({ ok: false, reason: 'in_flight' }));
    // the dedupe-key lookup before queueing sees nothing; the in_flight lookup finds the live job
    tableResults.ai_jobs = (ops) =>
      ops.some((o) => o.op === 'eq' && o.args[0] === 'payload->>_dedupe')
        ? { data: [{ id: 'live-1', status: 'pending' }], error: null }
        : { data: [], error: null };
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(200);
    expect(merged()?.['u-01']).toBe('live-1');
  });

  it("marks only the person whose problem-report read failed as 'could not be read'", async () => {
    tableResults.bug_reports = (ops) =>
      ops.some((o) => o.op === 'eq' && o.args[1] === 'u-02')
        ? { data: null, error: { message: 'timeout' } }
        : { data: [{ reporter_user_id: 'u-01', status: 'open', module_name: 'Attendance', sub_module_name: null, created_at: '2026-10-01' }], error: null };
    await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    const promptOf = (u: string) =>
      (enqueueJobsLane.mock.calls.find((c) => (c[1] as { context: { user_id: string } }).context.user_id === u)?.[1] as { prompt: string }).prompt;
    expect(promptOf('u-02')).toContain('(could not be read this week)');
    expect(promptOf('u-01')).not.toContain('(could not be read this week)');
    expect(promptOf('u-03')).toContain('(none)');
  });

  it('counts an already-queued job as in flight, not a failure, when its id can be read', async () => {
    enqueueJobsLane.mockImplementation(() => Promise.resolve({ ok: false, reason: 'in_flight' }));
    tableResults.ai_jobs = (ops) =>
      ops.some((o) => o.op === 'eq' && o.args[0] === 'payload->>_dedupe')
        ? { data: [{ id: 'live-x', status: 'running' }], error: null }
        : { data: [], error: null };
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.in_flight).toBe(10);
    expect(body.failed).toBe(0);
  });

  it("reads each person's own problem reports separately, so one busy reporter cannot crowd out the rest", async () => {
    await GET(request({ bearer: SECRET, query: `?week=${WEEK}&dry_run=1` }));
    const perPerson = calls.filter((c) => c.table === 'bug_reports' && c.op === 'eq');
    expect(perPerson).toHaveLength(10);
    expect(perPerson.every((c) => c.args[0] === 'reporter_user_id')).toBe(true);
  });

  it('only merges the ids this run changed — a stored id that did not change is not rewritten', async () => {
    tableResults.adoption_power_user_weeks = { data: { agenda_jobs: { 'u-01': 'old-1' } }, error: null };
    tableResults.ai_jobs = {
      data: [{ id: 'old-1', status: 'pending', result: null, dedupe: `adoption-agenda:${WEEK}:u-01` }],
      error: null,
    };
    await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(merged()).not.toHaveProperty('u-01');
    expect(Object.keys(merged() ?? {})).toHaveLength(9);
  });

  it('is a 500 when the job ids cannot be saved', async () => {
    mergeResult = { data: null, error: { message: 'boom' } };
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(500);
  });

  it('tells the operator which week to re-run — the next scheduled run never comes back to this week', async () => {
    enqueueJobsLane.mockImplementation(() => Promise.resolve({ ok: false, reason: 'no_seat', error: 'no seat owner configured' }));
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain(`re-run with ?week=${WEEK}`);
    const old = new Date(Date.now() - 30 * 3600_000).toISOString();
    enqueueJobsLane.mockReset();
    enqueueJobsLane.mockImplementation(() => Promise.resolve({ ok: true, jobId: 'job-fresh' }));
    tableResults.ai_jobs = { data: [job('u-01', 'stuck-1', 'pending', null, old)], error: null };
    const stale = await (await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }))).json();
    expect(stale.error).toContain(`?week=${WEEK}`);
  });

  it('does not replace a job requested long ago that the drain claimed a minute ago', async () => {
    const old = new Date(Date.now() - 72 * 3600_000).toISOString();
    tableResults.ai_jobs = {
      data: [{ ...job('u-01', 'busy-1', 'claimed', null, old), claimed_at: new Date(Date.now() - 60_000).toISOString() }],
      error: null,
    };
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kept).toBe(1);
    expect(body.stale_replaced).toBe(0);
    expect(rpc).not.toHaveBeenCalledWith(SUPERSEDE_FN, expect.anything());
  });

  it('is a 500 when SOME agenda jobs fail, after saving the ones that queued', async () => {
    let n = 0;
    enqueueJobsLane.mockImplementation(() =>
      Promise.resolve(++n % 2 === 0 ? { ok: false, reason: 'error', error: 'drain down' } : { ok: true, jobId: `job-${n}` })
    );
    const res = await GET(request({ bearer: SECRET, query: `?week=${WEEK}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.failed).toBe(5);
    expect(body.enqueued).toBe(5);
    expect(Object.keys(merged() ?? {})).toHaveLength(5); // the 5 that queued are kept
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
