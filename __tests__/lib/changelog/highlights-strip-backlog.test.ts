/**
 * What's New — the strip reaches the backlog, and the module boundary survives
 * the reach.
 *
 * THE BUG THESE TESTS PIN DOWN. The strip read `weekStart(istToday())` and
 * rendered only write-ups whose change landed in the CURRENT week, while ruling
 * 1 (2026-09-13) pointed the writer at a MONTH of backlog. Measured on
 * production 2026-09-14: 199 approved write-ups existed, 6 fell in the current
 * week, and the other 193 could never be displayed — most were already outside
 * any future week the moment they were written. Every one had cost a model run.
 *
 * So the first claim below is deliberately the one that USED to fail: a period
 * with no write-ups of its own still renders recent ones.
 *
 * THE SECOND CLAIM IS THE ONE THAT MUST NOT REGRESS. Widening a reader's window
 * is exactly the kind of change that quietly widens what they may SEE, so the
 * module boundary is re-proved here against the wider window rather than
 * assumed from the narrower one it was proved against before.
 *
 * As in highlights-route-scope.test.ts, the fake database does NOT simulate the
 * RLS on changelog_highlights. That policy is the real boundary
 * (20261203120000_changelog_highlights.sql); a fake that reproduced it would be
 * testing the fake. Here the highlights table hands back EVERY row, approved or
 * not, for every module — so these pass only if the route is a second,
 * independent wall. Belt tested with the braces removed.
 *
 * It DOES apply `.in()`, `.gte()` and `.range()` for changelog_entries exactly
 * as PostgREST would, because those three are what the route itself writes: the
 * module filter, the backlog floor, and the page window the walk depends on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { weekStart, STRIP_CAP, WRITEUP_BACKLOG_FLOOR } from '@/lib/changelog/highlights';

/** Shift a YYYY-MM-DD by whole days, in UTC — the same arithmetic weekStart uses. */
function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

const IST_TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const THIS_WEEK = weekStart(IST_TODAY);

/**
 * Three days inside the week BEFORE this one. Two properties make these the
 * right fixture dates, and both hold no matter when the suite runs:
 *   • they are never in the current week, so a week-bound strip shows nothing;
 *   • they are always after the fixed backlog floor, because "last week" only
 *     moves forward while WRITEUP_BACKLOG_FLOOR does not.
 * Asserted below rather than assumed, so a moved floor fails loudly here
 * instead of quietly turning these tests into no-ops.
 */
const LAST_WEEK_OLDEST = shiftDays(THIS_WEEK, -6);
const LAST_WEEK_MIDDLE = shiftDays(THIS_WEEK, -4);
const LAST_WEEK_NEWEST = shiftDays(THIS_WEEK, -2);

const ALL_MODULES = [
  { key: 'billing', label: 'Billing', perm: ['billing'], href: '/billing' },
  { key: 'administration', label: 'Administration', perm: ['admin'], href: '/admin' },
];

/**
 * Newest first, and NOT ONE OF THEM IS IN THE CURRENT WEEK — the fixture is the
 * shape of the bug. `order()` is a no-op in the fake, so this array order is
 * the order the route receives, exactly as PostgREST's
 * (entry_date desc, ordinal asc) would deliver it.
 */
const BACKLOG_ENTRIES = [
  {
    sha: 'b-new', app_key: 'myjkkn', entry_date: LAST_WEEK_NEWEST, kind: 'new',
    module_key: 'billing', subject: 'Invoice split', author: 'A', pr_number: 1, breaking: false,
  },
  {
    sha: 'a-mid', app_key: 'myjkkn', entry_date: LAST_WEEK_MIDDLE, kind: 'security',
    module_key: 'administration', subject: 'Token scope', author: 'B', pr_number: 2, breaking: false,
  },
  {
    sha: 'b-old', app_key: 'myjkkn', entry_date: LAST_WEEK_OLDEST, kind: 'fixed',
    module_key: 'billing', subject: 'Receipt total', author: 'A', pr_number: 3, breaking: false,
  },
];

const BACKLOG_HIGHLIGHTS = [
  {
    app_key: 'myjkkn', sha: 'b-new', status: 'approved', selection_reason: 'r', source: 'ai',
    headline: 'Split an invoice without raising a new one.',
    affects: 'Anyone who works in Billing.',
    action: 'Open Billing → Invoices and use Split.',
  },
  {
    app_key: 'myjkkn', sha: 'a-mid', status: 'approved', selection_reason: 'r', source: 'ai',
    headline: 'Administration token scope tightened.',
    affects: 'Administrators.',
    action: 'Nothing to do.',
  },
  {
    app_key: 'myjkkn', sha: 'b-old', status: 'approved', selection_reason: 'r', source: 'ai',
    headline: 'Receipt totals add up again.',
    affects: 'Anyone who works in Billing.',
    action: 'Reopen any receipt raised last week.',
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
    // The page window the strip's walk depends on. Honoured, not ignored:
    // a fake that returned every row for every page would make a broken walk
    // look like a working one.
    range: async (from: number, to: number) => {
      out = out.slice(from, to + 1);
      return result();
    },
    then: (resolve: any) => Promise.resolve(result()).then(resolve),
  };
  return b;
}

function makeClient(opts: { visible: string[]; entries?: any[]; highlights?: any[] }) {
  const { visible, entries = BACKLOG_ENTRIES, highlights = BACKLOG_HIGHLIGHTS } = opts;
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
    rpc: async (name: string) => {
      if (name === 'fn_changelog_visible_modules') return { data: visible, error: null };
      if (name === 'user_has_permission') return { data: false, error: null };
      return { data: null, error: null };
    },
    from: (t: string) =>
      t === 'changelog_entries'
        ? table(entries)
        : t === 'changelog_highlights'
          ? table(highlights)
          : t === 'changelog_highlight_reports'
            ? table([])
            : table(ALL_MODULES),
  };
}

let client: any;
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));

const URL_STRIP = 'https://x.test/api/whats-new/highlights';

async function strip(visible: string[], over: { entries?: any[]; highlights?: any[] } = {}) {
  client = makeClient({ visible, ...over });
  const { GET } = await import('@/app/api/whats-new/highlights/route');
  const res = await GET(new Request(URL_STRIP));
  return { res, body: await res.json() };
}

beforeEach(() => vi.resetModules());

describe('the fixture really is outside the current week', () => {
  it('sits before this week and on or after the backlog floor', () => {
    // If either stops holding, every test below silently stops testing the bug.
    for (const d of [LAST_WEEK_OLDEST, LAST_WEEK_MIDDLE, LAST_WEEK_NEWEST]) {
      expect(d < THIS_WEEK).toBe(true);
      expect(d >= WRITEUP_BACKLOG_FLOOR).toBe(true);
    }
  });
});

describe("What's New strip — a week with no write-ups of its own", () => {
  it('still renders the recent ones from the days before it', async () => {
    // THE REGRESSION TEST. Every entry is in last week; the current week holds
    // nothing at all. Before this change the answer here was an empty list and
    // the strip rendered nothing.
    const { body } = await strip(['billing', 'administration']);
    expect(body.highlights.length).toBe(3);
    expect(body.highlights.map((h: any) => h.sha)).toEqual(['b-new', 'a-mid', 'b-old']);
  });

  it('orders them newest-first on the entry’s own date', async () => {
    const { body } = await strip(['billing', 'administration']);
    const dates = body.highlights.map((h: any) => h.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(dates[0]).toBe(LAST_WEEK_NEWEST);
  });

  it('reports the backlog floor as the window it read, not a week', async () => {
    const { body } = await strip(['billing']);
    expect(body.from).toBe(WRITEUP_BACKLOG_FLOOR);
    // The old field name would have been a lie in the payload, not just a
    // stale name — the answer is no longer bounded by a week.
    expect(body.weekFrom).toBeUndefined();
  });

  it('walks past the first page to reach write-ups further back', async () => {
    // 250 changes in one week is not hypothetical: 222 landed in the seven days
    // to 2026-09-12. Here only the entries beyond the first page have been
    // written up, so a strip that reads one page and stops returns nothing.
    const many = Array.from({ length: 250 }, (_, i) => ({
      sha: `s${i}`, app_key: 'myjkkn', entry_date: LAST_WEEK_MIDDLE, kind: 'new',
      module_key: 'billing', subject: `change ${i}`, author: 'A', pr_number: i, breaking: false,
    }));
    const late = Array.from({ length: 12 }, (_, i) => ({
      app_key: 'myjkkn', sha: `s${210 + i}`, status: 'approved', selection_reason: 'r',
      source: 'ai', headline: `Headline ${i}`, affects: 'Billing.', action: 'Open Billing.',
    }));
    const { body } = await strip(['billing'], { entries: many, highlights: late });
    expect(body.highlights.length).toBe(STRIP_CAP);
    expect(body.highlights[0].sha).toBe('s210');
  });

  it('never renders more than the strip cap, however much backlog exists', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      sha: `m${i}`, app_key: 'myjkkn', entry_date: LAST_WEEK_MIDDLE, kind: 'new',
      module_key: 'billing', subject: `change ${i}`, author: 'A', pr_number: i, breaking: false,
    }));
    const all = many.map((e) => ({
      app_key: 'myjkkn', sha: e.sha, status: 'approved', selection_reason: 'r', source: 'ai',
      headline: 'A headline.', affects: 'Billing.', action: 'Open Billing.',
    }));
    const { body } = await strip(['billing'], { entries: many, highlights: all });
    expect(body.highlights.length).toBe(STRIP_CAP);
  });

  it('stays ABSENT — an empty list, never a placeholder row — when nothing is approved', async () => {
    // The component returns null for an empty list, and that behaviour is
    // deliberate. The route must therefore still be able to produce one.
    const { res, body } = await strip(['billing'], { highlights: [] });
    expect(res.status).toBe(200);
    expect(body.highlights).toEqual([]);
  });
});

describe("What's New strip — the module boundary, against the wider window", () => {
  it('withholds an approved write-up whose module the reader may not see', async () => {
    // 'a-mid' is approved and complete, and the fake hands it over. It is
    // withheld solely because this reader is not scoped to Administration —
    // the same boundary the plain list uses, now proved across weeks.
    const { body } = await strip(['billing']);
    expect(body.highlights.map((h: any) => h.sha)).not.toContain('a-mid');
    expect(JSON.stringify(body)).not.toContain('Token scope tightened');
  });

  it('a wider role receives MORE backlog highlights than a narrower one', async () => {
    const narrow = (await strip(['billing'])).body;
    const wide = (await strip(['billing', 'administration'])).body;
    expect(narrow.highlights.length).toBeLessThan(wide.highlights.length);
    expect(wide.highlights.map((h: any) => h.sha)).toContain('a-mid');
  });

  it('serves nothing at all to a reader scoped to no module', async () => {
    const { res, body } = await strip([]);
    expect(res.status).toBe(200);
    expect(body.highlights).toEqual([]);
  });

  it('withholds an UNAPPROVED draft from the backlog even when the table hands it over', async () => {
    const { body } = await strip(['billing'], {
      highlights: [
        {
          app_key: 'myjkkn', sha: 'b-new', status: 'draft', selection_reason: 'r', source: 'ai',
          headline: 'HALF WRITTEN — MUST NOT SHIP', affects: null, action: null,
        },
        {
          app_key: 'myjkkn', sha: 'b-old', status: 'skipped', selection_reason: 'r', source: 'ai',
          headline: 'HIDDEN ON PURPOSE — MUST NOT SHIP', affects: 'x', action: 'y',
        },
      ],
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain('HALF WRITTEN');
    expect(text).not.toContain('HIDDEN ON PURPOSE');
    expect(body.highlights).toEqual([]);
  });
});
