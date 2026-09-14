/**
 * app/api/cron/feedback-classify — the queue must be worked from BOTH ends.
 *
 * WHY THIS EXISTS, since the diff alone does not say it. Measured on
 * production 2026-09-14: feedback_events held 56,161 rows, 49,804 of them
 * unclassified, the oldest unprocessed reaching back to 18 June. Over the
 * preceding 30 days roughly 679 events arrived per day and roughly 82 were
 * classified — 12%. The job ordered strictly `occurred_at DESC` and took 25
 * rows a run, so every run re-served the newest arrivals and the older rows
 * were never fetched at all. They were not slow. They were unreachable, and
 * would have stayed unreachable for as long as intake outpaced throughput.
 *
 * Instagram comments, by contrast, were 1,493 of 1,493 processed — the spine
 * works; the ordering is what starved it.
 *
 * Three things must hold, and none is provable by reading the diff:
 *
 *  1. BOTH ENDS ADVANCE IN ONE RUN. Alternating chunks is the whole fix. A run
 *     that touches only the newest rows leaves June untouched forever, and a
 *     run that flips wholesale to oldest-first starves the fresh complaint the
 *     loop exists to answer. The test asserts the run drew from both ends.
 *
 *  2. POISON ROWS CANNOT EAT THE RUN. A row whose classify call throws keeps
 *     ai_processed_at NULL *by design*, so it is re-served by the next query.
 *     Without the in-run attempted-set, a handful of permanently failing rows
 *     at one end would be re-fetched by every chunk and the run would classify
 *     nothing while reporting healthy chunk counts. This is the same shape as
 *     the stories poller that logged 3,278 errors and 0 successes unnoticed.
 *
 *  3. A FAILURE IS COUNTED, NOT SWALLOWED. `failed` must reflect reality, and
 *     the row must stay unprocessed so a later run retries it.
 *
 * Everything under the route's own decisions is mocked; the route's branching
 * is the subject under test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const CRON_SECRET = 'feedback-drain-secret';

type Row = { id: string; content: string; occurred_at: string; ai_processed_at: string | null };

let rows: Row[] = [];
/** Ids whose classify call should throw, to model a poison row. */
let poison = new Set<string>();
/** Every id handed to the classifier, in order — the record the assertions read. */
let classified: string[] = [];

function makeDb() {
  function from(_table: string) {
    const q: any = {
      _asc: false,
      _limit: 25,
      _head: false,
      select(_c: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.head) q._head = true;
        return q;
      },
      is(_col: string, _v: null) { return q; },
      not(_col: string, _op: string, _v: unknown) { return q; },
      eq(_col: string, v: string) { q._eqId = v; return q; },
      order(_col: string, opts: { ascending: boolean }) { q._asc = opts.ascending; return q; },
      limit(n: number) { q._limit = n; return q; },
      // NOTE: the route calls .update({...}).eq('id', id) — update FIRST, then
      // eq. Applying the patch inside update() would look up an id that has not
      // been supplied yet, silently mark nothing, and leave the poison-row
      // assertions vacuous. The write belongs in eq().
      update(patch: Record<string, unknown>) {
        return {
          eq: (_col: string, id: string) => {
            const r = rows.find((x) => x.id === id);
            if (r) Object.assign(r, patch);
            return Promise.resolve({ error: null });
          },
        };
      },
      then(resolve: (v: unknown) => void) {
        const pending = rows.filter((r) => r.ai_processed_at === null);
        if (q._head) return resolve({ count: pending.length, error: null });
        const sorted = [...pending].sort((a, b) =>
          q._asc
            ? a.occurred_at.localeCompare(b.occurred_at)
            : b.occurred_at.localeCompare(a.occurred_at),
        );
        return resolve({ data: sorted.slice(0, q._limit), error: null });
      },
    };
    return q;
  }
  return { from };
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => makeDb(),
}));

vi.mock('@/lib/services/feedback/feedback-classify', () => ({
  classifyFeedback: async (content: string) => {
    const row = rows.find((r) => r.content === content);
    const id = row?.id ?? content;
    classified.push(id);
    if (poison.has(id)) throw new Error('classifier refused this row');
    return {
      sentiment: 'neutral',
      intent: 'inform',
      topic: 'test',
      draft_reply: '',
      model: 'test-model',
    };
  },
}));

function req(): Request {
  return new Request('https://example.test/api/cron/feedback-classify', {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

/** n rows spread one day apart, oldest first. */
function seed(n: number) {
  rows = Array.from({ length: n }, (_, i) => ({
    id: `row-${String(i).padStart(3, '0')}`,
    content: `content ${i}`,
    occurred_at: new Date(Date.UTC(2026, 5, 18 + i)).toISOString(),
    ai_processed_at: null,
  }));
}

describe('feedback-classify drains the queue from both ends', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    poison = new Set();
    classified = [];
    vi.resetModules();
  });

  it('refuses an unauthenticated caller', async () => {
    seed(10);
    const { GET } = await import('@/app/api/cron/feedback-classify/route');
    const res = await GET(new Request('https://example.test/api/cron/feedback-classify'));
    expect(res.status).toBe(401);
    expect(classified).toHaveLength(0);
  });

  it('reaches the OLDEST rows in the same run as the newest — the actual fix', async () => {
    seed(60);
    const oldest = rows[0].id;
    const newest = rows[rows.length - 1].id;

    const { GET } = await import('@/app/api/cron/feedback-classify/route');
    const body = await (await GET(req())).json();

    expect(body.success).toBe(true);
    // Both ends were drawn from — the property the old newest-first job could
    // never satisfy no matter how many times it ran.
    expect(body.from_newest).toBeGreaterThan(0);
    expect(body.from_oldest).toBeGreaterThan(0);
    expect(classified).toContain(newest);
    expect(classified).toContain(oldest);
  });

  it('classifies every row exactly once — no row is served twice in a run', async () => {
    seed(40);
    const { GET } = await import('@/app/api/cron/feedback-classify/route');
    await GET(req());
    expect(new Set(classified).size).toBe(classified.length);
  });

  it('a poison row cannot consume the run, and is counted as failed', async () => {
    seed(30);
    // The three newest always sort first: under the old job these would be
    // re-served forever and nothing else would ever be reached.
    poison = new Set([rows[29].id, rows[28].id, rows[27].id]);

    const { GET } = await import('@/app/api/cron/feedback-classify/route');
    const body = await (await GET(req())).json();

    expect(body.failed).toBe(3);
    expect(body.classified).toBe(27);
    // Each poison row was attempted once, not once per chunk.
    for (const id of poison) {
      expect(classified.filter((c) => c === id)).toHaveLength(1);
      // ...and stays unprocessed so a later run retries it.
      expect(rows.find((r) => r.id === id)!.ai_processed_at).toBeNull();
    }
  });

  it('reports what is still waiting, so a shortfall cannot hide', async () => {
    seed(12);
    const { GET } = await import('@/app/api/cron/feedback-classify/route');
    const body = await (await GET(req())).json();
    expect(body.remaining).toBe(0);
    expect(body.stopped_because).toBe('queue empty');
  });

  it('an empty queue is a clean no-op', async () => {
    seed(0);
    const { GET } = await import('@/app/api/cron/feedback-classify/route');
    const body = await (await GET(req())).json();
    expect(body.classified).toBe(0);
    expect(body.chunks).toBe(0);
    expect(body.stopped_because).toBe('queue empty');
  });
});
