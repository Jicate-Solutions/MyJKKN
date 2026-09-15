/**
 * What's New — RENDERABLE IMPLIES REVIEWABLE.
 *
 * THE PROPERTY. Every write-up the reader's strip can render has a card in the
 * approver's queue, carrying its saved text, its Live badge and its report
 * tally. It is the withdrawal path for text the Max-lane writer publishes with
 * nobody reading it first (ruling 1, 2026-09-13), and the sibling report route
 * names it out loud: "the tally is a signal for a super admin, who already has
 * the queue and the Hide action."
 *
 * WHY IT NEEDS TESTS NOW. It used to hold by construction and by accident: the
 * strip read the current week and so did the queue, so anything renderable was
 * necessarily in the queue's list. Widening the strip to the backlog window
 * ended that — a month-old write-up rendered to every reader with no row on the
 * only screen that can edit it or set it back to draft. Nothing failed; the
 * cards simply were not there. So the property is asserted here rather than
 * inherited, and the first tests below fail against the route as it was when
 * the strip first reached the backlog.
 *
 * As in its two sibling suites, the fake database does NOT reproduce the RLS on
 * changelog_highlights — a fake that did would be testing the fake. It DOES
 * honour `.in()`, `.gte()` and `.range()` for changelog_entries, because those
 * three are what the route itself writes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { weekStart, WEEKLY_CAP, WRITEUP_BACKLOG_FLOOR } from '@/lib/changelog/highlights';

/** Shift a YYYY-MM-DD by whole days, in UTC — the arithmetic weekStart uses. */
function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

const IST_TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const THIS_WEEK = weekStart(IST_TODAY);

/** Two days last week — never in the current week, always after the fixed floor. */
const LAST_WEEK_NEWEST = shiftDays(THIS_WEEK, -2);
const LAST_WEEK_OLDEST = shiftDays(THIS_WEEK, -5);

const ALL_MODULES = [{ key: 'billing', label: 'Billing', perm: ['billing'], href: '/billing' }];

function entry(sha: string, date: string, over: Record<string, unknown> = {}) {
  return {
    sha,
    app_key: 'myjkkn',
    entry_date: date,
    kind: 'new',
    module_key: 'billing',
    subject: `change ${sha}`,
    author: 'A',
    pr_number: 1,
    breaking: false,
    ordinal: 1,
    ...over,
  };
}

function approved(sha: string, over: Record<string, unknown> = {}) {
  return {
    app_key: 'myjkkn',
    sha,
    status: 'approved',
    selection_reason: 'picked because r',
    source: 'ai',
    headline: `Headline ${sha}`,
    affects: 'Anyone who works in Billing.',
    action: 'Open Billing.',
    ...over,
  };
}

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
    range: async (from: number, to: number) => {
      out = out.slice(from, to + 1);
      return result();
    },
    then: (resolve: any) => Promise.resolve(result()).then(resolve),
  };
  return b;
}

interface ClientOpts {
  visible: string[];
  entries: any[];
  highlights: any[];
  reports?: any[];
  canManage?: boolean;
}

function makeClient(opts: ClientOpts) {
  const { visible, entries, highlights, reports = [], canManage = true } = opts;
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
    rpc: async (name: string) => {
      if (name === 'fn_changelog_visible_modules') return { data: visible, error: null };
      if (name === 'user_has_permission') return { data: canManage, error: null };
      return { data: null, error: null };
    },
    from: (t: string) =>
      t === 'changelog_entries'
        ? table(entries)
        : t === 'changelog_highlights'
          ? table(highlights)
          : t === 'changelog_highlight_reports'
            ? table(reports)
            : table(ALL_MODULES),
  };
}

let client: any;
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));

const BASE = 'https://x.test/api/whats-new/highlights';

async function call(path: string, opts: ClientOpts) {
  client = makeClient(opts);
  const { GET } = await import('@/app/api/whats-new/highlights/route');
  const res = await GET(new Request(path));
  return { res, body: await res.json() };
}

beforeEach(() => vi.resetModules());

describe('the fixture really is outside the current week', () => {
  it('sits before this week and on or after the backlog floor', () => {
    for (const d of [LAST_WEEK_NEWEST, LAST_WEEK_OLDEST]) {
      expect(d < THIS_WEEK).toBe(true);
      expect(d >= WRITEUP_BACKLOG_FLOOR).toBe(true);
    }
  });
});

describe('the queue covers every write-up the strip renders', () => {
  const entries = [entry('b-new', LAST_WEEK_NEWEST), entry('b-old', LAST_WEEK_OLDEST)];
  const highlights = [approved('b-new'), approved('b-old')];
  const opts: ClientOpts = { visible: ['billing'], entries, highlights };

  it('gives a backlog write-up a card, so it can be edited or withdrawn', async () => {
    // THE REGRESSION TEST. Both changes are last week, so this week's selection
    // offers nothing at all — and before this fix the queue's only card loop
    // (body.candidates) was empty while both were live on the reader's page.
    const strip = (await call(BASE, opts)).body;
    const queue = (await call(`${BASE}?queue=1`, opts)).body;

    expect(strip.highlights.map((h: any) => h.sha)).toEqual(['b-new', 'b-old']);
    expect(queue.candidates).toEqual([]);

    const cards = [...queue.candidates, ...(queue.live ?? [])].map((c: any) => c.sha);
    for (const sha of strip.highlights.map((h: any) => h.sha)) {
      expect(cards).toContain(sha);
    }
  });

  it('carries the saved text and status for those cards, so Edit and Live work', async () => {
    // The card's inputs are filled from `saved`, and the Live badge is read from
    // it. A card with no saved row would render three empty boxes and no badge —
    // "editable" in appearance only.
    const { body } = await call(`${BASE}?queue=1`, opts);
    const saved = new Map<string, any>(body.saved.map((s: any) => [s.sha, s]));
    for (const sha of ['b-new', 'b-old']) {
      expect(saved.get(sha)).toBeTruthy();
      expect(saved.get(sha).status).toBe('approved');
      expect(saved.get(sha).headline).toBe(`Headline ${sha}`);
    }
  });

  it('counts the reports filed against a backlog write-up', async () => {
    // The report POST has no week constraint (its RLS asks only for an approved
    // visible highlight), so a reader CAN flag a month-old card. Before this fix
    // the tally was built from this week's shas alone, so that row could never
    // be counted and the tap changed nothing anyone could see.
    const { body } = await call(`${BASE}?queue=1`, {
      ...opts,
      reports: [
        { sha: 'b-old', reported_by: 'r-1' },
        { sha: 'b-old', reported_by: 'r-2' },
      ],
    });
    const saved = new Map<string, any>(body.saved.map((s: any) => [s.sha, s]));
    expect(saved.get('b-old').reports).toBe(2);
    expect(saved.get('b-new').reports).toBe(0);
  });

  it('reports how many are live as the number actually on the page', async () => {
    // The screen used to derive this from `saved`, which is this week's rows —
    // it would have said 0 here while two write-ups were on What's New.
    const strip = (await call(BASE, opts)).body;
    const queue = (await call(`${BASE}?queue=1`, opts)).body;
    expect(queue.liveCount).toBe(strip.highlights.length);
    expect(queue.liveCount).toBe(2);
  });

  it('does not duplicate a card selection already offers', async () => {
    // A write-up from THIS week is both on the strip and in the week's
    // selection. It must appear once, not twice.
    const { body } = await call(`${BASE}?queue=1`, {
      visible: ['billing'],
      entries: [entry('t1', IST_TODAY)],
      highlights: [approved('t1')],
    });
    const cards = [...body.candidates, ...(body.live ?? [])].map((c: any) => c.sha);
    expect(cards).toEqual(['t1']);
  });

  it('covers a this-week write-up that selection crowded out of its cap', async () => {
    // Not a backlog case at all, and it predates the strip's widening: selection
    // slices to WEEKLY_CAP by score, so an approved write-up outside that slice
    // was already renderable-but-unreviewable. The union closes it too, because
    // the test is "is it on the page", never "how did it get there".
    const many = Array.from({ length: WEEKLY_CAP + 5 }, (_, i) => entry(`w${i}`, IST_TODAY));
    const last = `w${WEEKLY_CAP + 4}`;
    const { body } = await call(`${BASE}?queue=1`, {
      visible: ['billing'],
      entries: many,
      // Only the LAST one is written up — the one selection's cap leaves out.
      highlights: [approved(last)],
    });
    expect(body.candidates.length).toBe(WEEKLY_CAP);
    expect(body.candidates.map((c: any) => c.sha)).not.toContain(last);
    const cards = [...body.candidates, ...(body.live ?? [])].map((c: any) => c.sha);
    expect(cards).toContain(last);
  });

  it('still refuses a caller without the manage permission, and says why', async () => {
    // Widening what the queue READS must not widen who may read it. The refusal
    // is explicit, never a silent empty 200 (CLAUDE.md #27).
    const { res, body } = await call(`${BASE}?queue=1`, { ...opts, canManage: false });
    expect(res.status).toBe(403);
    expect(body.error).toContain('whats_new.highlights.manage');
    expect(JSON.stringify(body)).not.toContain('Headline b-new');
  });

  it('withholds a backlog card whose module this approver may not see', async () => {
    // The queue's extra rows come from the strip's own walk, which applies
    // `.in('module_key', visible)` at the database. Scoping must survive the
    // union rather than be re-derived here.
    const { body } = await call(`${BASE}?queue=1`, { ...opts, visible: [] });
    const cards = [...body.candidates, ...(body.live ?? [])];
    expect(cards).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('Headline b-new');
  });

  it('leaves a draft and a skipped write-up out of the live group', async () => {
    // `live` is "what the reader can see", so only approved rows belong in it.
    // A draft still reaches the queue through this week's selection when it
    // falls there; it must never arrive as an already-live card.
    const { body } = await call(`${BASE}?queue=1`, {
      visible: ['billing'],
      entries,
      highlights: [
        approved('b-new', { status: 'draft', headline: 'HALF WRITTEN', affects: null, action: null }),
        approved('b-old', { status: 'skipped', headline: 'SET ASIDE' }),
      ],
    });
    expect(body.live ?? []).toEqual([]);
    expect(body.liveCount).toBe(0);
  });
});
