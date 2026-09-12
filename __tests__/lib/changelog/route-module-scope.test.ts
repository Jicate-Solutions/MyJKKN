/**
 * What's New — the role scope is an ACCESS BOUNDARY, proved at the route.
 *
 * The thing being tested is NOT that the handler passes a filter along. It is
 * that a lesser role RECEIVES FEWER ENTRIES from GET(), which is the only claim
 * that distinguishes a boundary from the presentation rule this route used to
 * carry ("any signed-in user can request any part and receive the full set").
 *
 * So the fake database below actually APPLIES the filters it is given rather
 * than recording them: `.in('module_key', […])` narrows the fixture, exactly as
 * PostgREST would. A route that accepted the visible list and forgot to use it
 * would pass a spy-based test and fail this one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ALL_MODULES = [
  { key: 'billing', label: 'Billing', perm: ['billing'], href: '/billing' },
  { key: 'administration', label: 'Administration', perm: ['admin'], href: '/admin' },
  { key: 'platform', label: 'Platform', perm: null, href: null },
];

/** Today in IST, so every fixture lands inside the 90-day "recent" window. */
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const ALL_ENTRIES = [
  { sha: 'a1', entry_date: TODAY, kind: 'new',   module_key: 'billing',        subject: 'Invoice split',  author: 'A', pr_number: 1, breaking: false, ordinal: 1, app_key: 'myjkkn' },
  { sha: 'a2', entry_date: TODAY, kind: 'fixed', module_key: 'billing',        subject: 'Receipt total',  author: 'A', pr_number: 2, breaking: false, ordinal: 2, app_key: 'myjkkn' },
  { sha: 'b1', entry_date: TODAY, kind: 'new',   module_key: 'administration', subject: 'Role audit',     author: 'B', pr_number: 3, breaking: false, ordinal: 3, app_key: 'myjkkn' },
  { sha: 'b2', entry_date: TODAY, kind: 'security', module_key: 'administration', subject: 'Token scope', author: 'B', pr_number: 4, breaking: false, ordinal: 4, app_key: 'myjkkn' },
  { sha: 'c1', entry_date: TODAY, kind: 'faster', module_key: 'platform',      subject: 'Faster sign-in', author: 'C', pr_number: 5, breaking: false, ordinal: 5, app_key: 'myjkkn' },
];

/**
 * A query builder that behaves like PostgREST for the handful of operators this
 * route uses: `.in()` narrows, `.gte()/.lt()` bound the date window, and the
 * result resolves at `.range()` with an exact count — which is what fetchAll()
 * pages on.
 */
function table(rows: any[]) {
  let out = [...rows];
  const b: any = {
    select: () => b,
    in: (col: string, vals: string[]) => { out = out.filter((r) => vals.includes(r[col])); return b; },
    gte: (col: string, v: string) => { out = out.filter((r) => r[col] >= v); return b; },
    lt: (col: string, v: string) => { out = out.filter((r) => r[col] < v); return b; },
    eq: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: async () => ({ data: out[0] ?? null, error: null }),
    range: async (from: number, to: number) => ({
      data: out.slice(from, to + 1),
      error: null,
      count: out.length,
    }),
  };
  return b;
}

function makeClient(opts: {
  visible?: string[];
  user?: { id: string } | null;
  rpcError?: string;
}) {
  const { visible = [], user = { id: 'u-1' }, rpcError } = opts;
  return {
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : { message: 'no session' },
      }),
    },
    rpc: async (name: string) =>
      name === 'fn_changelog_visible_modules'
        ? rpcError
          ? { data: null, error: { message: rpcError } }
          : { data: visible, error: null }
        : { data: null, error: null },
    from: (t: string) =>
      t === 'changelog_entries'
        ? table(ALL_ENTRIES)
        : t === 'changelog_modules'
          ? table(ALL_MODULES)
          : table([{ last_synced_at: null, last_ref: null }]),
  };
}

let client: any;
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));

async function get(url: string) {
  const { GET } = await import('@/app/api/whats-new/route');
  return GET(new Request(url));
}

const RECENT = 'https://x.test/api/whats-new?part=recent';
const META = 'https://x.test/api/whats-new?part=meta';

beforeEach(() => vi.resetModules());

describe("What's New route — server-side module scope", () => {
  it('a lesser role receives FEWER entries than a wider one', async () => {
    client = makeClient({ visible: ['billing', 'platform'] });
    const lesser = await (await get(RECENT)).json();

    client = makeClient({ visible: ['billing', 'administration', 'platform'] });
    const wider = await (await get(RECENT)).json();

    expect(lesser.length).toBeLessThan(wider.length);
    expect(lesser).toHaveLength(3);
    expect(wider).toHaveLength(5);
  });

  it('withholds the entries of a module the caller may not see', async () => {
    client = makeClient({ visible: ['billing', 'platform'] });
    const body = await (await get(RECENT)).json();

    // Not "the page hid them" — they never left the database.
    expect(body.map((e: any) => e.m)).not.toContain('administration');
    expect(body.map((e: any) => e.s)).not.toContain('Token scope');
  });

  it('a caller with no visible module gets an empty list, not the full set', async () => {
    client = makeClient({ visible: [] });
    const res = await get(RECENT);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('meta counts and the areas dropdown describe only what the caller may read', async () => {
    client = makeClient({ visible: ['billing', 'platform'] });
    const meta = await (await get(META)).json();

    expect(meta.total).toBe(3);
    expect(Object.keys(meta.modules).sort()).toEqual(['billing', 'platform']);
    // The module list is part of the boundary: naming Administration while
    // serving none of its entries would leak the module list back out.
    expect(meta.modules).not.toHaveProperty('administration');
    expect(meta.contributors.map((c: any) => c.name)).not.toContain('B');
  });

  it('fails CLOSED when the permission lookup fails', async () => {
    client = makeClient({ visible: [], rpcError: 'permission denied' });
    const res = await get(RECENT);
    // 500, never a 200 carrying everything: an unanswerable permission question
    // must not resolve to "show them the lot".
    expect(res.status).toBe(500);
  });

  it('still refuses an unauthenticated caller before any of this', async () => {
    client = makeClient({ user: null });
    expect((await get(RECENT)).status).toBe(401);
  });
});
