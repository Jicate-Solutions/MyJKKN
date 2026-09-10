/**
 * What's New — the READ PATH, which nothing has ever executed.
 *
 * Six test files sit under __tests__/lib/changelog/ and not one of them imports
 * app/api/whats-new/route.ts. So the three things most likely to break silently
 * were, until this file, unwatched:
 *
 *   PAGING          PostgREST caps a response at db-max-rows (1,000 by default)
 *                   and does it WITHOUT an error. A regression that stopped
 *                   paging would return the first 1,000 of ~4,800 entries and
 *                   drop months of history off the page with nothing to notice
 *                   — every assertion about "the page renders" would still pass.
 *
 *   THE 90-DAY SPLIT  recent and archive must partition the set: no entry in
 *                   both, none in neither. An off-by-one on the boundary date
 *                   renders a day twice or loses it, and only shows up on the
 *                   one day a year the fixture happens to straddle.
 *
 *   THE SESSION GATE  the reason this route exists at all (the public/*.json
 *                   exposure of 2026-09-06). Nothing asserted it.
 *
 * FORWARD-COMPATIBLE ON PURPOSE. The fake client answers
 * fn_changelog_visible_modules() with every module key, so these cases measure
 * paging and the split whether or not the server-side module scope of #3372 has
 * landed: before it, the RPC is never called; after it, it grants everything and
 * changes no count here. This file must not be the thing that makes that PR red.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Today in IST — the timezone the entry dates are recorded in. */
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

function daysAgo(n: number): string {
  const [y, m, d] = istToday().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

const MODULES = [{ key: 'platform', label: 'Platform', perm: null, href: null }];

/**
 * 2,400 entries — deliberately past two 1,000-row pages, so a route that reads
 * one page, or two, is caught. Half inside the 90-day window, half outside it.
 */
const ENTRIES = Array.from({ length: 2400 }, (_, i) => ({
  sha: `sha${i}`,
  entry_date: i < 1200 ? daysAgo(i % 89) : daysAgo(120 + (i % 200)),
  kind: 'new',
  module_key: 'platform',
  subject: `Change ${i}`,
  author: `Author ${i % 7}`,
  pr_number: i,
  breaking: false,
  ordinal: i,
}));

/** How many rows the fake server will return at most, whatever range is asked. */
let serverCap = 1000;

function table(rows: any[]) {
  let out = [...rows];
  const b: any = {
    select: () => b,
    in: (col: string, vals: string[]) => { out = out.filter((r) => vals.includes(r[col])); return b; },
    gte: (col: string, v: string) => { out = out.filter((r) => r[col] >= v); return b; },
    lt: (col: string, v: string) => { out = out.filter((r) => r[col] < v); return b; },
    order: () => b,
    limit: () => b,
    maybeSingle: async () => ({ data: out[0] ?? null, error: null }),
    range: async (from: number, to: number) => ({
      // The cap is applied to the WINDOW, exactly as PostgREST does: ask for
      // 1,000 and be handed fewer, with the true total still in `count`.
      data: out.slice(from, Math.min(to + 1, from + serverCap)),
      error: null,
      count: out.length,
    }),
  };
  return b;
}

let client: any;
let entryReads = 0;

function makeClient(user: { id: string } | null = { id: 'u-1' }, failEntries = false) {
  entryReads = 0;
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: user ? null : { message: 'no session' } }),
    },
    rpc: async (name: string) =>
      name === 'fn_changelog_visible_modules'
        ? { data: MODULES.map((m) => m.key), error: null }
        : { data: null, error: null },
    from: (t: string) => {
      if (t === 'changelog_entries') {
        entryReads++;
        if (failEntries) {
          return { select: () => ({ in: () => ({ gte: () => ({ order: () => ({ order: () => ({ order: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: 'boom' }, count: null }) }) }) }) }) }) }) }) } as any;
        }
        return table(ENTRIES);
      }
      if (t === 'changelog_modules') return table(MODULES);
      return table([{ last_synced_at: null, last_ref: null }]);
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));

async function get(url: string) {
  const { GET } = await import('@/app/api/whats-new/route');
  return GET(new Request(url));
}

const U = 'https://x.test/api/whats-new';

beforeEach(() => {
  vi.resetModules();
  serverCap = 1000;
  client = makeClient();
});

describe("What's New route — paging", () => {
  it('returns EVERY archive row, not the first 1,000 PostgREST hands back', async () => {
    const body = await (await get(`${U}?part=archive`)).json();
    const expected = ENTRIES.filter((e) => e.entry_date < daysAgo(90)).length;

    expect(expected).toBeGreaterThan(1000); // the fixture must actually test paging
    expect(body).toHaveLength(expected);
  });

  it('walks the whole table when the server caps pages BELOW the requested size', async () => {
    // A deployment with a lower db-max-rows. Advancing the offset by PAGE_ROWS
    // instead of by what was returned would skip rows here and still look fine.
    serverCap = 250;
    const body = await (await get(`${U}?part=archive`)).json();
    const expected = ENTRIES.filter((e) => e.entry_date < daysAgo(90)).length;
    expect(body).toHaveLength(expected);
  });

  it('returns no duplicate entries across pages', async () => {
    const body = await (await get(`${U}?part=archive`)).json();
    expect(new Set(body.map((e: any) => e.h)).size).toBe(body.length);
  });
});

describe("What's New route — the 90-day recent/archive split", () => {
  it('partitions the set: nothing in both windows, nothing in neither', async () => {
    const recent = await (await get(`${U}?part=recent`)).json();
    const archive = await (await get(`${U}?part=archive`)).json();

    const r = new Set(recent.map((e: any) => e.h));
    const a = new Set(archive.map((e: any) => e.h));

    expect([...r].filter((h) => a.has(h))).toEqual([]);      // no overlap
    expect(r.size + a.size).toBe(ENTRIES.length);            // no gap
  });

  it('honours a pinned ?before cutoff instead of recomputing it', async () => {
    // The reader echoes back the recentFrom they were given with meta. Without
    // this, someone who loads at 23:59 and pages at 00:01 gets one day in BOTH
    // lists and the page renders it twice.
    const pinned = daysAgo(30);
    const recent = await (await get(`${U}?part=recent&before=${pinned}`)).json();
    expect(recent.every((e: any) => e.d >= pinned)).toBe(true);
    expect(recent.length).toBeLessThan(
      (await (await get(`${U}?part=recent`)).json()).length
    );
  });

  it('ignores a malformed ?before rather than putting it in a query filter', async () => {
    const bad = await (await get(`${U}?part=recent&before=not-a-date`)).json();
    const plain = await (await get(`${U}?part=recent`)).json();
    expect(bad).toHaveLength(plain.length);
  });

  it("meta's counts agree with the two lists this same route serves", async () => {
    const meta = await (await get(`${U}?part=meta`)).json();
    const recent = await (await get(`${U}?part=recent`)).json();
    const archive = await (await get(`${U}?part=archive`)).json();

    expect(meta.total).toBe(ENTRIES.length);
    expect(meta.recentCount).toBe(recent.length);
    expect(meta.archiveCount).toBe(archive.length);
  });
});

describe("What's New route — the gate and the failure modes", () => {
  it('refuses an unauthenticated caller — the reason this route exists', async () => {
    client = makeClient(null);
    const res = await get(`${U}?part=recent`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('never reads the entries table at all without a session', async () => {
    client = makeClient(null);
    await get(`${U}?part=recent`);
    expect(entryReads).toBe(0);
  });

  it('rejects an unknown part with 400, naming the valid ones', async () => {
    const res = await get(`${U}?part=everything`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/meta, recent, archive/);
  });

  it('reports a failed read as 500, not as an empty changelog', async () => {
    // The two are indistinguishable from the page, and only one of them is a
    // reason to wake somebody.
    client = makeClient({ id: 'u-1' }, true);
    const res = await get(`${U}?part=recent`);
    expect(res.status).toBe(500);
    expect(await res.json()).not.toEqual([]);
  });

  it('marks the response private so no shared cache may hold it', async () => {
    const res = await get(`${U}?part=recent`);
    expect(res.headers.get('Cache-Control')).toContain('private');
  });
});
