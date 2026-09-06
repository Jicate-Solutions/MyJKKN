/**
 * app/api/cron/improvement-rank-ideas — the Gemba official-lapse sweep rides
 * this job's DAILY pass.
 *
 * Two things have to be true, and neither is provable by reading the diff:
 *
 *  1. THE DISCRIMINATOR, BOTH WAYS. The same route is scheduled twice in
 *     vercel.json — "43 4 * * *" (the daily default path) and
 *     "17,47 * * * *" with ?mode=collect (every 30 minutes). The sweep must
 *     fire on the first and NEVER on the second. Asserting only that the daily
 *     path fires it cannot fail on the flood risk, which is the whole point:
 *     48 lapse announcements a day is exactly what this feature exists to end.
 *
 *  2. THE ISOLATION. Idea ranking is this job's primary purpose and has run for
 *     weeks. A lapse failure must not take it down — the run still answers
 *     ok:true, still enqueues the ranking job, and reports the lapse failure
 *     separately in `lapse_error` so an operator can see which half broke.
 *
 * Everything below the route's own decisions is mocked; the route's branching
 * is the subject under test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const CRON_SECRET = 'lapse-wiring-secret';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------
type Row = Record<string, any>;
let ideaRows: Row[] = [];

function makeAdmin() {
  function from(_table: string) {
    const self: any = {
      select: () => self,
      in: () => self,
      order: () => self,
      insert: () => Promise.resolve({ error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [...ideaRows], error: null }).then(res, rej),
    };
    return self;
  }
  return {
    from,
    // the escalation RPC — healthy in every test here
    rpc: vi.fn(async () => ({ data: [], error: null })),
  };
}

vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => makeAdmin() }));

const enqueueJobsLane = vi.fn(async () => ({ ok: true }) as any);
const collectJobsLane = vi.fn(async () => [] as any[]);
vi.mock('@/lib/services/platform/ai-jobs-lane', () => ({
  enqueueJobsLane: (...args: any[]) => enqueueJobsLane(...(args as [])),
  collectJobsLane: (...args: any[]) => collectJobsLane(...(args as [])),
}));

const runOfficialLapseSweep = vi.fn(async () => ({
  limit: 50,
  announced: 2,
  notified: 7,
  lapses: [],
}));
vi.mock('@/lib/services/gemba/official-lapse-sweep', () => ({
  OFFICIAL_LAPSE_DEFAULT_LIMIT: 50,
  runOfficialLapseSweep: (...args: any[]) => runOfficialLapseSweep(...(args as [])),
}));

import { GET } from '@/app/api/cron/improvement-rank-ideas/route';
import { GET as STANDALONE_GET } from '@/app/api/cron/gemba-official-lapse/route';

async function run(query: string): Promise<any> {
  const res = await GET(
    new NextRequest(
      `https://example.test/api/cron/improvement-rank-ideas?secret=${CRON_SECRET}${query}`
    )
  );
  return res.json();
}

/** Two open ideas for one institution — enough for the ranking to submit. */
function seedRankableIdeas() {
  ideaRows = [
    {
      id: 'idea-1',
      institution_id: 'inst-1',
      area_id: null,
      title: 'Shorten the equipment booking queue',
      problem: 'Bookings pile up on Monday.',
      proposed_fix: 'Open a second slot.',
      expected_impact: 'Shorter wait.',
      evidence: null,
      is_urgent: false,
    },
    {
      id: 'idea-2',
      institution_id: 'inst-1',
      area_id: null,
      title: 'Publish the corrections list weekly',
      problem: 'Nobody sees what changed.',
      proposed_fix: 'Weekly digest.',
      expected_impact: 'Fewer repeats.',
      evidence: null,
      is_urgent: false,
    },
  ];
}

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  vi.clearAllMocks();
  runOfficialLapseSweep.mockResolvedValue({
    limit: 50,
    announced: 2,
    notified: 7,
    lapses: [],
  });
  enqueueJobsLane.mockResolvedValue({ ok: true } as any);
  collectJobsLane.mockResolvedValue([]);
  seedRankableIdeas();
});

// ===========================================================================
// 1. The discriminator — both branches
// ===========================================================================
describe('which schedule runs the lapse sweep', () => {
  it('DAILY path (43 4 * * *, no mode) runs the sweep exactly once', async () => {
    const body = await run('');

    expect(body.mode).toBe('submit');
    expect(runOfficialLapseSweep).toHaveBeenCalledTimes(1);
    expect(body.lapse_announced).toBe(2);
    expect(body.lapse_notified).toBe(7);
    expect(body.lapse_error).toBeNull();
  });

  it('COLLECT path (17,47 * * * *, ?mode=collect) NEVER runs the sweep', async () => {
    const body = await run('&mode=collect');

    expect(body.mode).toBe('collect');
    // The flood guard. ?mode=collect fires 48x a day; if the sweep were reachable
    // from here, every lapse would be announced 48 times over.
    expect(runOfficialLapseSweep).not.toHaveBeenCalled();
    // …and the collect reply says nothing about a lapse, because none was run.
    expect(body).not.toHaveProperty('lapse_announced');
    expect(body).not.toHaveProperty('lapse_error');
  });

  it('runs the sweep once per daily pass even across repeated collect ticks', async () => {
    await run('&mode=collect');
    await run('&mode=collect');
    await run('&mode=collect');
    expect(runOfficialLapseSweep).not.toHaveBeenCalled();

    await run('');
    expect(runOfficialLapseSweep).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 2. The isolation — a broken sweep must not break the ranking
// ===========================================================================
describe('a failing lapse sweep', () => {
  it('does not stop the idea ranking from running and reporting success', async () => {
    runOfficialLapseSweep.mockRejectedValue(
      new Error('fn_gemba_official_lapse_notify does not exist')
    );

    const body = await run('');

    // The ranking half ran to completion.
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('submit');
    expect(enqueueJobsLane).toHaveBeenCalledTimes(1);
    expect(body.institutions_considered).toBe(1);
    expect(body.enqueued).toBe(1);
    expect(body.submit_error).toBeNull();

    // …and the lapse half owned up, distinctly, rather than hiding inside it.
    expect(body.lapse_error).toBe('fn_gemba_official_lapse_notify does not exist');
    expect(body.lapse_announced).toBe(0);
    expect(body.lapse_notified).toBe(0);
  });

  it('reports a non-Error throw rather than swallowing it', async () => {
    runOfficialLapseSweep.mockRejectedValue('connection reset');

    const body = await run('');

    expect(body.ok).toBe(true);
    expect(body.enqueued).toBe(1);
    expect(body.lapse_error).toBe('lapse sweep threw');
  });

  it('a healthy sweep does not mask a ranking problem either', async () => {
    // Both halves report themselves; neither result stands in for the other.
    enqueueJobsLane.mockResolvedValue({ ok: false, reason: 'in_flight' } as any);

    const body = await run('');

    expect(body.lapse_announced).toBe(2);
    expect(body.lapse_error).toBeNull();
    expect(body.enqueued).toBe(0);
    expect(body.skipped_in_flight).toBe(1);
  });
});

// ===========================================================================
// 3. One sweep, two doors — the standalone route was kept, not duplicated
// ===========================================================================
describe('the standalone /api/cron/gemba-official-lapse route', () => {
  async function runStandalone(query = ''): Promise<any> {
    const res = await STANDALONE_GET(
      new NextRequest(
        `https://example.test/api/cron/gemba-official-lapse?secret=${CRON_SECRET}${query}`
      )
    );
    return { status: res.status, body: await res.json() };
  }

  it('runs the SAME sweep the daily job runs, not a second copy of it', async () => {
    const { status, body } = await runStandalone();

    expect(status).toBe(200);
    expect(runOfficialLapseSweep).toHaveBeenCalledTimes(1);
    expect(body.ok).toBe(true);
    expect(body.announced).toBe(2);
    expect(body.notified).toBe(7);
  });

  it('still answers 500 when the sweep fails — a manual run must not look fine', async () => {
    runOfficialLapseSweep.mockRejectedValue(new Error('rpc exploded'));

    const { status, body } = await runStandalone();

    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('rpc exploded');
  });

  it('honours an explicit ?limit and otherwise passes the shared default', async () => {
    await runStandalone('&limit=7');
    expect(runOfficialLapseSweep).toHaveBeenLastCalledWith(expect.anything(), 7);

    await runStandalone();
    expect(runOfficialLapseSweep).toHaveBeenLastCalledWith(expect.anything(), 50);
  });
});
