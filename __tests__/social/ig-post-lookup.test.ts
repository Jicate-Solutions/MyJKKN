// __tests__/social/ig-post-lookup.test.ts
//
// Two silent Instagram read bugs, asserted on what the database client
// actually receives (no live database here — the live behaviour of the
// escaped LIKE is NOT proven by this file, only the filter we send):
//
//   1. A shortcode lookup used `.ilike('permalink', '%/C_ab/%')`. `_` is a
//      LIKE wildcard and ilike ignores case, so `C_ab` also matched `cXab` —
//      a different post. The lookup must be an exact, case-sensitive `.like`
//      with `_`, `%` and `\` escaped.
//   2. Latest metrics were read with one `.in('post_id', ids)` over a table
//      holding ~627 snapshots a post. PostgREST caps a read at 1,000 rows, so
//      past two posts whole posts silently lost their metrics. Each post must
//      now be read on its own, newest first, one row.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  escapeLike,
  fetchLatestPostMetrics,
  igPermalinkLikePattern,
} from '@/lib/services/social/ig-post-lookup';

type Call = { table: string; method: string; args: unknown[] };

/**
 * A chainable Supabase stand-in. Every builder call is recorded; awaiting a
 * chain (or calling maybeSingle) resolves to `resolve(table, calls)`.
 */
function fakeClient(
  resolve: (table: string, calls: Call[]) => { data: unknown; error: unknown }
) {
  const log: Call[] = [];
  const from = (table: string) => {
    const mine: Call[] = [];
    const chain: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            const result = resolve(table, mine);
            return (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
          }
          if (prop === 'maybeSingle' || prop === 'single') {
            return () => Promise.resolve(resolve(table, mine));
          }
          return (...args: unknown[]) => {
            const c = { table, method: prop, args };
            mine.push(c);
            log.push(c);
            return chain;
          };
        },
      }
    );
    return chain;
  };
  return { client: { from }, log };
}

describe('igPermalinkLikePattern — exact shortcode match', () => {
  it('escapes the LIKE wildcard in a shortcode that contains _', () => {
    expect(igPermalinkLikePattern('C_ab')).toBe('%/C\\_ab/%');
  });

  it('escapes % and backslash too', () => {
    expect(escapeLike('a%b\\c_d')).toBe('a\\%b\\\\c\\_d');
  });

  it('leaves ordinary shortcodes untouched and keeps both slashes', () => {
    expect(igPermalinkLikePattern('ABC123-x')).toBe('%/ABC123-x/%');
  });
});

describe('fetchLatestPostMetrics — newest snapshot per post, never a capped bulk read', () => {
  // 3 posts × 700 snapshots = 2,100 rows: a single bulk read would be capped.
  const SNAPS = 700;
  const snapshots = (postId: string) =>
    Array.from({ length: SNAPS }, (_, i) => ({
      post_id: postId,
      snapshot_at: new Date(Date.UTC(2026, 8, 1) + i * 3_600_000).toISOString(),
      reach: i,
    }));
  const table: Record<string, ReturnType<typeof snapshots>> = {
    p1: snapshots('p1'),
    p2: snapshots('p2'),
    p3: snapshots('p3'),
  };

  /** Honour eq / order / limit, and the 1,000-row cap, like PostgREST. */
  const resolve = (_t: string, calls: Call[]) => {
    const eq = calls.find((c) => c.method === 'eq');
    const inn = calls.find((c) => c.method === 'in');
    const order = calls.find((c) => c.method === 'order');
    const limit = calls.find((c) => c.method === 'limit');
    let rows = eq
      ? [...table[eq.args[1] as string]]
      : (inn!.args[1] as string[]).flatMap((id) => table[id]);
    if (order) {
      const asc = (order.args[1] as { ascending: boolean }).ascending;
      rows.sort((a, b) =>
        asc ? a.snapshot_at.localeCompare(b.snapshot_at) : b.snapshot_at.localeCompare(a.snapshot_at)
      );
    }
    rows = rows.slice(0, Math.min(1000, (limit?.args[0] as number) ?? 1000));
    return { data: rows, error: null };
  };

  it('returns the latest snapshot for every post, however many snapshots exist', async () => {
    const { client } = fakeClient(resolve);
    const { latest, error } = await fetchLatestPostMetrics<{ post_id: string; reach: number }>(
      client,
      ['p1', 'p2', 'p3'],
      'post_id, snapshot_at, reach'
    );
    expect(error).toBeNull();
    expect([...latest.keys()].sort()).toEqual(['p1', 'p2', 'p3']);
    for (const m of latest.values()) expect(m.reach).toBe(SNAPS - 1);
  });

  it('reads each post with order(snapshot_at desc).limit(1) and never .in()', async () => {
    const { client, log } = fakeClient(resolve);
    await fetchLatestPostMetrics(client, ['p1', 'p2', 'p3', 'p1'], 'post_id, reach');
    const metricCalls = log.filter((c) => c.table === 'ig_post_metrics');
    expect(metricCalls.some((c) => c.method === 'in')).toBe(false);
    const eqs = metricCalls.filter((c) => c.method === 'eq');
    expect(eqs.map((c) => c.args)).toEqual([
      ['post_id', 'p1'],
      ['post_id', 'p2'],
      ['post_id', 'p3'],
    ]);
    const orders = metricCalls.filter((c) => c.method === 'order');
    expect(orders).toHaveLength(3);
    for (const o of orders) expect(o.args).toEqual(['snapshot_at', { ascending: false, nullsFirst: false }]);
    const limits = metricCalls.filter((c) => c.method === 'limit');
    expect(limits.map((c) => c.args[0])).toEqual([1, 1, 1]);
  });

  it('reports the first read error without throwing', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: 'boom' } }));
    const { latest, error } = await fetchLatestPostMetrics(client, ['p1'], 'post_id');
    expect(latest.size).toBe(0);
    expect(error).toEqual({ message: 'boom' });
  });
});

// ---------------------------------------------------------------------------
// The events route sends the escaped, case-sensitive filter
// ---------------------------------------------------------------------------

const igPostsCalls: Call[][] = [];

vi.mock('@/lib/supabase/server', () => ({
  getAuthUser: async () => ({ user: { id: 'user-1' }, error: null }),
  createServerSupabaseClient: async () =>
    fakeClient((table) =>
      table === 'events'
        ? { data: { id: 'ev-1', name: 'Fest', institution_id: 'inst-1' }, error: null }
        : { data: null, error: null }
    ).client,
  createServiceRoleClient: () =>
    fakeClient((table, calls) => {
      if (table === 'ig_posts') igPostsCalls.push(calls);
      return { data: null, error: null };
    }).client,
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { error: () => {}, warn: () => {}, dev: () => {} },
}));

describe('POST /api/events/[eventId]/instagram — exact shortcode lookup', () => {
  beforeEach(() => {
    igPostsCalls.length = 0;
  });

  it('matches a shortcode containing _ with an escaped .like, never .ilike', async () => {
    const { POST } = await import('@/app/api/events/[eventId]/instagram/route');
    const res = await POST(
      new NextRequest('https://example.test/api/events/ev-1/instagram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ig_url: 'https://www.instagram.com/p/C_ab/' }),
      }),
      { params: Promise.resolve({ eventId: 'ev-1' }) }
    );
    // No post in the fake table → the route says it is not tracked.
    expect(res.status).toBe(422);
    expect(igPostsCalls).toHaveLength(1);
    const calls = igPostsCalls[0];
    expect(calls.some((c) => c.method === 'ilike')).toBe(false);
    const like = calls.find((c) => c.method === 'like');
    expect(like?.args).toEqual(['permalink', '%/C\\_ab/%']);
  });
});
