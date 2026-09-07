/**
 * app/api/cron/improvement-rank-ideas — the untriaged-idea sweep rides this
 * job's DAILY pass, alongside the Gemba official-lapse sweep.
 *
 * WHY THIS SWEEP EXISTS AT ALL, since the diff alone does not say it:
 * measured on production 2026-08-10, improvement_ideas held 21 rows filed by 18
 * distinct authors and NOT ONE had ever moved out of 'logged'. The escalation
 * sweep that already existed watches 'approved' ideas whose fix is unapplied —
 * a state no idea on this project has reached — so it had nothing to find. The
 * queue where everything actually sits had no ageing at all.
 *
 * Three things have to be true, and none is provable by reading the diff:
 *
 *  1. THE DISCRIMINATOR, BOTH WAYS. The same route is scheduled twice in
 *     vercel.json — "43 4 * * *" (the daily default path) and
 *     "17,47 * * * *" with ?mode=collect (every 30 minutes). The sweep must
 *     fire on the first and NEVER on the second. 48 triage notices a day for
 *     the same idea is precisely the flood the ledger exists to prevent.
 *
 *  2. THE ISOLATION, THREE WAYS. Ranking is this job's primary purpose and has
 *     run for weeks; the lapse sweep landed before this one. A triage failure
 *     must take down neither, and must own up in `triage_error` rather than
 *     hiding inside somebody else's result.
 *
 *  3. THE NUMBER AN OPERATOR WATCHES. triage_longest_wait_days has to survive
 *     into the response — it is the only field that says how bad the neglect
 *     currently is, and a count of announcements does not.
 *
 * Everything below the route's own decisions is mocked; the route's branching
 * is the subject under test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const CRON_SECRET = 'untriaged-wiring-secret';

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

// The lapse sweep is healthy in every test here — it is the neighbour this
// change must not disturb, not the subject.
const runOfficialLapseSweep = vi.fn(async () => ({
  limit: 50,
  announced: 1,
  notified: 3,
  lapses: [],
}));
vi.mock('@/lib/services/gemba/official-lapse-sweep', () => ({
  OFFICIAL_LAPSE_DEFAULT_LIMIT: 50,
  runOfficialLapseSweep: (...args: any[]) => runOfficialLapseSweep(...(args as [])),
}));

const runUntriagedSweep = vi.fn(async () => ({
  limit: 50,
  announced: 4,
  notified: 6,
  longestWaitDays: 11,
  ideas: [],
}));
vi.mock('@/lib/services/improvement/untriaged-sweep', () => ({
  UNTRIAGED_DEFAULT_LIMIT: 50,
  runUntriagedSweep: (...args: any[]) => runUntriagedSweep(...(args as [])),
}));

import { GET } from '@/app/api/cron/improvement-rank-ideas/route';

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
    announced: 1,
    notified: 3,
    lapses: [],
  });
  runUntriagedSweep.mockResolvedValue({
    limit: 50,
    announced: 4,
    notified: 6,
    longestWaitDays: 11,
    ideas: [],
  });
  enqueueJobsLane.mockResolvedValue({ ok: true } as any);
  collectJobsLane.mockResolvedValue([]);
  seedRankableIdeas();
});

// ===========================================================================
// 1. The discriminator — both branches
// ===========================================================================
describe('which schedule runs the untriaged sweep', () => {
  it('DAILY path (43 4 * * *, no mode) runs the sweep exactly once', async () => {
    const body = await run('');

    expect(body.mode).toBe('submit');
    expect(runUntriagedSweep).toHaveBeenCalledTimes(1);
    expect(body.triage_announced).toBe(4);
    expect(body.triage_notified).toBe(6);
    expect(body.triage_error).toBeNull();
  });

  it('COLLECT path (17,47 * * * *, ?mode=collect) NEVER runs the sweep', async () => {
    const body = await run('&mode=collect');

    expect(body.mode).toBe('collect');
    // The flood guard. ?mode=collect fires 48x a day; the ledger would stop the
    // duplicate notifications, but the sweep would still hammer the database 48
    // times for nothing.
    expect(runUntriagedSweep).not.toHaveBeenCalled();
    expect(body).not.toHaveProperty('triage_announced');
    expect(body).not.toHaveProperty('triage_error');
  });

  it('stays unrun across repeated collect ticks, then runs once on the daily pass', async () => {
    await run('&mode=collect');
    await run('&mode=collect');
    await run('&mode=collect');
    expect(runUntriagedSweep).not.toHaveBeenCalled();

    await run('');
    expect(runUntriagedSweep).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 2. The number an operator actually watches
// ===========================================================================
describe('the reported wait', () => {
  it('surfaces the longest wait, not just how many were announced', async () => {
    const body = await run('');
    // Four notices could mean four ideas one day late or one idea a fortnight
    // late. Only this field tells them apart.
    expect(body.triage_longest_wait_days).toBe(11);
  });

  it('reports zero rather than undefined when nothing was announced', async () => {
    runUntriagedSweep.mockResolvedValue({
      limit: 50,
      announced: 0,
      notified: 0,
      longestWaitDays: 0,
      ideas: [],
    });

    const body = await run('');

    expect(body.triage_announced).toBe(0);
    expect(body.triage_longest_wait_days).toBe(0);
    expect(body.triage_error).toBeNull();
  });
});

// ===========================================================================
// 3. The isolation — a broken sweep must not break its two neighbours
// ===========================================================================
describe('a failing untriaged sweep', () => {
  it('does not stop the idea ranking from running and reporting success', async () => {
    runUntriagedSweep.mockRejectedValue(
      new Error('fn_improvement_untriaged_notify does not exist')
    );

    const body = await run('');

    expect(body.ok).toBe(true);
    expect(body.mode).toBe('submit');
    expect(enqueueJobsLane).toHaveBeenCalledTimes(1);
    expect(body.enqueued).toBe(1);
    expect(body.submit_error).toBeNull();

    expect(body.triage_error).toBe('fn_improvement_untriaged_notify does not exist');
    expect(body.triage_announced).toBe(0);
    expect(body.triage_longest_wait_days).toBe(0);
  });

  it('does not stop the lapse sweep either — the two are independent', async () => {
    runUntriagedSweep.mockRejectedValue(new Error('triage exploded'));

    const body = await run('');

    // The neighbour that shipped first still reports its own result truthfully.
    expect(runOfficialLapseSweep).toHaveBeenCalledTimes(1);
    expect(body.lapse_announced).toBe(1);
    expect(body.lapse_notified).toBe(3);
    expect(body.lapse_error).toBeNull();
    expect(body.triage_error).toBe('triage exploded');
  });

  it('survives the lapse sweep failing instead — neither hides behind the other', async () => {
    runOfficialLapseSweep.mockRejectedValue(new Error('lapse exploded'));

    const body = await run('');

    expect(body.lapse_error).toBe('lapse exploded');
    expect(body.triage_announced).toBe(4);
    expect(body.triage_error).toBeNull();
    expect(body.enqueued).toBe(1);
  });

  it('reports a non-Error throw rather than swallowing it', async () => {
    runUntriagedSweep.mockRejectedValue('connection reset');

    const body = await run('');

    expect(body.ok).toBe(true);
    expect(body.enqueued).toBe(1);
    expect(body.triage_error).toBe('untriaged sweep threw');
  });
});
