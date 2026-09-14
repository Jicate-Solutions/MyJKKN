/**
 * What's New highlights — two claims, proved at the route.
 *
 *   1. AN UNAPPROVED DRAFT REACHES NOBODY. Not "the strip hides it" — it is
 *      absent from the answer.
 *   2. ROLE SCOPING HOLDS. A highlight never surfaces a module whose plain-list
 *      entries are withheld from the same reader.
 *
 * The fake database below deliberately does NOT simulate the RLS on
 * changelog_highlights. That policy is the real boundary
 * (20261203120000_changelog_highlights.sql, `status = 'approved' AND EXISTS (…
 * visible, not hidden …)`), and a test that reproduced it would be testing the
 * fake. Here the highlights table hands back EVERY row, approved or not, for
 * every module — so these tests pass only if the route is a second, independent
 * wall. Belt tested with the braces removed.
 *
 * It does apply `.in()` and `.gte()` for changelog_entries, exactly as PostgREST
 * would, because that is the filter the route itself writes and the one that
 * would be silently ineffective if it were dropped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { weekStart } from '@/lib/changelog/highlights';

/** A date inside the current IST week — the window the route computes for itself. */
const IST_TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const THIS_WEEK = weekStart(IST_TODAY);

const ALL_MODULES = [
  { key: 'billing', label: 'Billing', perm: ['billing'], href: '/billing' },
  { key: 'administration', label: 'Administration', perm: ['admin'], href: '/admin' },
];

const ALL_ENTRIES = [
  {
    sha: 'b1', app_key: 'myjkkn', entry_date: IST_TODAY, kind: 'new', module_key: 'billing',
    subject: 'Invoice split', author: 'A', pr_number: 1, breaking: false, ordinal: 1,
  },
  {
    sha: 'b2', app_key: 'myjkkn', entry_date: IST_TODAY, kind: 'fixed', module_key: 'billing',
    subject: 'Receipt total', author: 'A', pr_number: 2, breaking: false, ordinal: 2,
  },
  {
    sha: 'a1', app_key: 'myjkkn', entry_date: IST_TODAY, kind: 'security', module_key: 'administration',
    subject: 'Token scope', author: 'B', pr_number: 3, breaking: false, ordinal: 3,
  },
];

/** Every row the table holds — approved, draft and skipped, across both modules. */
const ALL_HIGHLIGHTS = [
  {
    app_key: 'myjkkn', sha: 'b1', status: 'approved', selection_reason: 'r',
    headline: 'Split an invoice without raising a new one.',
    affects: 'Anyone who works in Billing.',
    action: 'Open Billing → Invoices and use Split.',
  },
  {
    app_key: 'myjkkn', sha: 'b2', status: 'draft', selection_reason: 'r',
    headline: 'HALF WRITTEN — MUST NOT SHIP', affects: null, action: null,
  },
  {
    app_key: 'myjkkn', sha: 'a1', status: 'approved', selection_reason: 'r',
    headline: 'Administration token scope tightened.',
    affects: 'Administrators.',
    action: 'Nothing to do.',
  },
];

/** A builder that behaves like PostgREST for the operators this route uses. */
function table(rows: any[]) {
  let out = [...rows];
  const result = () => ({ data: out, error: null });
  const b: any = {
    select: () => b,
    in: (col: string, vals: string[]) => {
      out = out.filter((r) => vals.includes(r[col]));
      return b;
    },
    gte: (col: string, v: string) => {
      out = out.filter((r) => r[col] >= v);
      return b;
    },
    order: () => b,
    range: async () => result(),
    // Supabase builders are thenable; the highlights and modules reads await
    // the builder directly rather than ending on .range().
    then: (resolve: any) => Promise.resolve(result()).then(resolve),
  };
  return b;
}

function makeClient(opts: { visible: string[]; canManage?: boolean; user?: { id: string } | null }) {
  const { visible, canManage = false, user = { id: 'u-1' } } = opts;
  return {
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'no session' } }) },
    rpc: async (name: string) => {
      if (name === 'fn_changelog_visible_modules') return { data: visible, error: null };
      if (name === 'user_has_permission') return { data: canManage, error: null };
      return { data: null, error: null };
    },
    from: (t: string) =>
      t === 'changelog_entries'
        ? table(ALL_ENTRIES)
        : t === 'changelog_highlights'
          ? table(ALL_HIGHLIGHTS)
          : table(ALL_MODULES),
  };
}

let client: any;
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));

const URL_STRIP = 'https://x.test/api/whats-new/highlights';
const URL_QUEUE = 'https://x.test/api/whats-new/highlights?queue=1';

async function get(url: string) {
  const { GET } = await import('@/app/api/whats-new/highlights/route');
  return GET(new Request(url));
}

beforeEach(() => vi.resetModules());

describe("What's New highlights — the strip", () => {
  it('serves an approved highlight to a reader who may see its module', async () => {
    client = makeClient({ visible: ['billing'] });
    const body = await (await get(URL_STRIP)).json();
    expect(body.highlights.map((h: any) => h.sha)).toEqual(['b1']);
    expect(body.weekFrom).toBe(THIS_WEEK);
  });

  it('withholds an UNAPPROVED draft even when the table hands it over', async () => {
    client = makeClient({ visible: ['billing'] });
    const body = await (await get(URL_STRIP)).json();
    const text = JSON.stringify(body);
    expect(text).not.toContain('HALF WRITTEN');
    expect(body.highlights.map((h: any) => h.sha)).not.toContain('b2');
  });

  it('withholds a highlight whose module the reader may not see', async () => {
    client = makeClient({ visible: ['billing'] });
    const body = await (await get(URL_STRIP)).json();
    // 'a1' is approved and complete. It is withheld solely because this reader
    // is not scoped to Administration — the same boundary the plain list uses.
    expect(body.highlights.map((h: any) => h.sha)).not.toContain('a1');
    expect(JSON.stringify(body)).not.toContain('Token scope tightened');
  });

  it('a wider role receives MORE highlights than a narrower one', async () => {
    client = makeClient({ visible: ['billing'] });
    const narrow = await (await get(URL_STRIP)).json();

    client = makeClient({ visible: ['billing', 'administration'] });
    const wide = await (await get(URL_STRIP)).json();

    expect(narrow.highlights.length).toBeLessThan(wide.highlights.length);
    expect(wide.highlights.map((h: any) => h.sha)).toContain('a1');
  });

  it('returns an empty list — not an error — for a reader scoped to nothing', async () => {
    client = makeClient({ visible: [] });
    const res = await get(URL_STRIP);
    expect(res.status).toBe(200);
    expect((await res.json()).highlights).toEqual([]);
  });

  it('refuses a caller with no session', async () => {
    client = makeClient({ visible: ['billing'], user: null });
    expect((await get(URL_STRIP)).status).toBe(401);
  });
});

describe("What's New highlights — the approver's queue", () => {
  it('refuses, in words, a caller without the manage permission', async () => {
    client = makeClient({ visible: ['billing'], canManage: false });
    const res = await get(URL_QUEUE);
    expect(res.status).toBe(403);
    // An explicit refusal, never a silent empty 200 (CLAUDE.md #27).
    expect((await res.json()).error).toContain('whats_new.highlights.manage');
  });

  it('offers candidates, each carrying the sentence that explains the pick', async () => {
    client = makeClient({ visible: ['billing', 'administration'], canManage: true });
    const body = await (await get(URL_QUEUE)).json();
    expect(body.candidates.length).toBeGreaterThan(0);
    for (const c of body.candidates) {
      expect(typeof c.reason).toBe('string');
      expect(c.reason.length).toBeGreaterThan(0);
    }
  });

  it('keeps the queue inside the reader’s own module scope too', async () => {
    client = makeClient({ visible: ['billing'], canManage: true });
    const body = await (await get(URL_QUEUE)).json();
    expect(body.candidates.map((c: any) => c.module_key)).not.toContain('administration');
  });
});
