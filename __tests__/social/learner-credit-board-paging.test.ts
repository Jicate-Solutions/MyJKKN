/**
 * /api/social/learner-credit GET — the board must count EVERY claim.
 *
 * WHY THIS TEST EXISTS: PostgREST caps a single read at 1,000 rows and says
 * nothing when it does. The board used to read ig_learner_post_claims in one
 * select, so once there were more than 1,000 claims it silently undercounted.
 * The fake client below enforces that same 1,000-row cap, so a single unpaged
 * read can only ever see the first 1,000 claims.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const CAP = 1000;

type Claim = { id: string; learner_id: string; ig_post_id: string; status: string; institution_id: string };
type Op = [string, ...unknown[]];

let claimsTable: Claim[] = [];
let claimReads: Op[][] = [];
/** Page index (0-based) whose read fails, or null. */
let failOnPage: number | null = null;
/** When true, every claims read hangs until its abort signal fires. */
let hangClaims = false;

function claimsQuery() {
  const ops: Op[] = [];
  claimReads.push(ops);
  const b: Record<string, unknown> = {};
  let signal: AbortSignal | undefined;
  for (const m of ['select', 'eq', 'gt', 'order', 'range', 'limit', 'in']) {
    b[m] = (...args: unknown[]) => {
      ops.push([m, ...args]);
      return b;
    };
  }
  b.abortSignal = (sig: AbortSignal) => {
    signal = sig;
    ops.push(['abortSignal']);
    return b;
  };
  b.then = (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => {
    if (hangClaims) {
      // A PostgREST call that never answers; supabase-js reports an aborted
      // fetch as an error, not a throw.
      return new Promise((resolve) => {
        signal?.addEventListener('abort', () =>
          resolve({ data: null, error: { message: 'AbortError: The operation was aborted.', code: '' } })
        );
      }).then(ok, bad);
    }
    const pageIndex = claimReads.indexOf(ops);
    if (failOnPage === pageIndex) {
      return Promise.resolve({ data: null, error: { message: 'boom', code: 'XX000' } }).then(ok, bad);
    }
    let rows = [...claimsTable];
    for (const o of ops) {
      if (o[0] === 'eq') rows = rows.filter((r) => r[o[1] as keyof Claim] === o[2]);
      if (o[0] === 'gt') rows = rows.filter((r) => String(r[o[1] as keyof Claim]) > String(o[2]));
    }
    if (ops.some((o) => o[0] === 'order')) rows.sort((a, b2) => a.id.localeCompare(b2.id));
    const range = ops.find((o) => o[0] === 'range');
    if (range) rows = rows.slice(range[1] as number, (range[2] as number) + 1);
    const limit = ops.find((o) => o[0] === 'limit');
    if (limit) rows = rows.slice(0, limit[1] as number);
    // PostgREST's silent cap: never more than 1,000 rows, whatever was asked.
    rows = rows.slice(0, CAP);
    return Promise.resolve({ data: rows, error: null }).then(ok, bad);
  };
  return b;
}

/** When true, the id-keyed tables answer one row per id (capped at 1,000,
 *  like PostgREST); when false they answer an empty list. */
let richTables = false;
/** Largest id list any single .in() read was given. */
let largestIn = 0;

function idKeyedQuery(table: string) {
  let ids: string[] = [];
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gt', 'order', 'range', 'limit', 'abortSignal']) b[m] = () => b;
  b.in = (_col: string, list: string[]) => {
    ids = list;
    largestIn = Math.max(largestIn, list.length);
    return b;
  };
  b.then = (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => {
    if (!richTables) return Promise.resolve({ data: [], error: null }).then(ok, bad);
    const make: Record<string, (id: string) => Record<string, unknown>> = {
      ig_posts: (id) => ({ id, account_id: 'A1' }),
      v_ig_post_latest_metrics: (id) => ({
        post_id: id, snapshot_at: '2026-10-07T00:00:00Z', saves: 1, shares: 0, comments: 0, likes: 0, reach: 0,
      }),
      learners_profiles: (id) => ({ id, first_name: 'Learner', last_name: id, institution_id: 'I1' }),
      ig_accounts: (id) => ({ id, metrics_source: 'graph' }),
    };
    // PostgREST's silent cap applies here too.
    const rows = (make[table] ? ids.map(make[table]) : []).slice(0, CAP);
    return Promise.resolve({ data: rows, error: null }).then(ok, bad);
  };
  return b;
}

const fakeClient = () => ({
  from: (table: string) => (table === 'ig_learner_post_claims' ? claimsQuery() : idKeyedQuery(table)),
});

vi.mock('@/lib/supabase/server', () => ({
  getAuthUser: async () => ({ user: { id: 'U1' }, error: null }),
  createServerSupabaseClient: async () => fakeClient(),
  createServiceRoleClient: () => fakeClient(),
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { error: () => {}, warn: () => {}, dev: () => {} },
}));

const get = (query = '') =>
  new NextRequest(`https://example.test/api/social/learner-credit${query}`, { method: 'GET' });

/** n confirmed claims spread over learners of 10 posts each. */
function makeClaims(n: number, institution = 'I1'): Claim[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `C${String(i).padStart(6, '0')}`,
    learner_id: `L${Math.floor(i / 10)}`,
    ig_post_id: `P${i}`,
    status: 'confirmed',
    institution_id: institution,
  }));
}

type Row = { learner_id: string; confirmed_posts: number };

beforeEach(() => {
  claimsTable = [];
  claimReads = [];
  failOnPage = null;
  richTables = false;
  largestIn = 0;
  hangClaims = false;
  vi.resetModules();
});

describe('the board pages past the 1,000-row cap', () => {
  it('counts all 2,300 claims, not the first 1,000', async () => {
    claimsTable = makeClaims(2300);
    const { GET } = await import('@/app/api/social/learner-credit/route');
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();

    const total = (body.rows as Row[]).reduce((n, r) => n + r.confirmed_posts, 0);
    expect(total).toBe(2300);
    expect(body.rows).toHaveLength(230);

    // Three pages, each ordered by id, each starting after the last id of the
    // page before (keyset paging, never offsets).
    expect(claimReads).toHaveLength(3);
    claimReads.forEach((ops, i) => {
      expect(ops).toContainEqual(['order', 'id', { ascending: true }]);
      expect(ops).toContainEqual(['limit', 1000]);
      expect(ops.some((o) => o[0] === 'range')).toBe(false);
      if (i === 0) expect(ops.some((o) => o[0] === 'gt')).toBe(false);
      else expect(ops).toContainEqual(['gt', 'id', `C${String(i * 1000 - 1).padStart(6, '0')}`]);
    });
  });

  it('keeps the institution filter on every page', async () => {
    claimsTable = [...makeClaims(1500, 'I1'), ...makeClaims(1200, 'I2').map((c) => ({ ...c, id: `D${c.id}` }))];
    const { GET } = await import('@/app/api/social/learner-credit/route');
    const body = await (await GET(get('?institution_id=I2'))).json();
    const total = (body.rows as Row[]).reduce((n, r) => n + r.confirmed_posts, 0);
    expect(total).toBe(1200);
    for (const ops of claimReads) expect(ops).toContainEqual(['eq', 'institution_id', 'I2']);
  });

  it('a failed page answers 500, not a partial board', async () => {
    claimsTable = makeClaims(2300);
    failOnPage = 1;
    const { GET } = await import('@/app/api/social/learner-credit/route');
    const res = await GET(get());
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it('stops at the page limit with a clear 500 instead of a partial board', async () => {
    claimsTable = makeClaims(50 * 1000 + 1);
    const { GET } = await import('@/app/api/social/learner-credit/route');
    const res = await GET(get());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/cannot be shown in full/i);
    expect(claimReads).toHaveLength(51); // 50 full pages + one probe
  });

  it('past the limit for one chosen institution, it does not say to choose one institution', async () => {
    claimsTable = makeClaims(50 * 1000 + 1, 'I2');
    const { GET } = await import('@/app/api/social/learner-credit/route');
    const res = await GET(get('?institution_id=I2'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/This institution has more than/);
    expect(body.error).not.toMatch(/Choose one institution/);
  });

  it('exactly 50,000 claims is the limit, not past it: the board is shown', async () => {
    claimsTable = makeClaims(50 * 1000);
    const { GET } = await import('@/app/api/social/learner-credit/route');
    const res = await GET(get());
    expect(res.status).toBe(200);
    const total = ((await res.json()).rows as Row[]).reduce((n, r) => n + r.confirmed_posts, 0);
    expect(total).toBe(50000);
  });

  it('a claim filed between two page reads is not counted twice', async () => {
    claimsTable = makeClaims(1500);
    const { GET } = await import('@/app/api/social/learner-credit/route');
    // After the first page is read, a claim sorting BEFORE the cursor arrives.
    // Offset paging would shift every row by one and count C000999 twice.
    const origPush = claimReads.push.bind(claimReads);
    claimReads.push = (...items: Op[][]) => {
      if (claimReads.length === 1) {
        claimsTable.push({ id: 'C000000a', learner_id: 'LNEW', ig_post_id: 'PNEW', status: 'confirmed', institution_id: 'I1' });
      }
      return origPush(...items);
    };
    const body = await (await GET(get())).json();
    const counted = (body.rows as Row[]).reduce((n, r) => n + r.confirmed_posts, 0);
    expect(counted).toBe(1500);
  });

  it('measures every post and names every learner past 1,000 distinct posts', async () => {
    claimsTable = makeClaims(2300); // 2,300 distinct posts, 230 learners
    richTables = true;
    const { GET } = await import('@/app/api/social/learner-credit/route');
    const res = await GET(get());
    expect(res.status).toBe(200);
    const rows = (await res.json()).rows as Array<{
      learner_name: string; confirmed_posts: number; posts_not_yet_measured: number; real_signal: number;
    }>;
    expect(rows).toHaveLength(230);
    expect(rows.every((r) => !/not visible/i.test(r.learner_name))).toBe(true);
    expect(rows.reduce((n, r) => n + r.posts_not_yet_measured, 0)).toBe(0);
    expect(rows.reduce((n, r) => n + r.real_signal, 0)).toBe(2300); // one save per post
    expect(largestIn).toBeLessThanOrEqual(200);
  });

  it('a learner whose profile is hidden keeps the first institution of their claims, not the last', async () => {
    claimsTable = [
      { id: 'C000001', learner_id: 'LX', ig_post_id: 'P1', status: 'confirmed', institution_id: 'I1' },
      { id: 'C000002', learner_id: 'LX', ig_post_id: 'P2', status: 'confirmed', institution_id: 'I2' },
    ];
    const { GET } = await import('@/app/api/social/learner-credit/route');
    const rows = (await (await GET(get())).json()).rows as Array<{ learner_id: string; institution_id: string }>;
    expect(rows.find((r) => r.learner_id === 'LX')!.institution_id).toBe('I1');
  });

  it('a single hung read is cut at the time budget with a clear 500', async () => {
    claimsTable = makeClaims(10);
    hangClaims = true;
    const controller = new AbortController();
    const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    try {
      const { GET } = await import('@/app/api/social/learner-credit/route');
      const pending = GET(get());
      setTimeout(() => controller.abort(), 10); // the budget runs out
      const res = await pending;
      expect(res.status).toBe(500);
      const msg = (await res.json()).error as string;
      expect(msg).toMatch(/took too long/i);
      expect(msg).toMatch(/Choose one institution/);
      expect(claimReads[0]).toContainEqual(['abortSignal']);
    } finally {
      spy.mockRestore();
    }
  });

  it('the time-budget message does not tell a caller who chose an institution to choose one', async () => {
    claimsTable = makeClaims(10, 'I2');
    hangClaims = true;
    const controller = new AbortController();
    const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    try {
      const { GET } = await import('@/app/api/social/learner-credit/route');
      const pending = GET(get('?institution_id=I2'));
      setTimeout(() => controller.abort(), 10);
      const res = await pending;
      expect(res.status).toBe(500);
      const msg = (await res.json()).error as string;
      expect(msg).toMatch(/for this institution took too long/i);
      expect(msg).not.toMatch(/Choose one institution/);
    } finally {
      spy.mockRestore();
    }
  });
});
