/**
 * What's New — the archive is read by KEYSET, and the role boundary survives it.
 *
 * The change under test replaced offset paging (`.range(n, n + 999)`, walked
 * with a growing n) with a cursor on the composite sort key
 * (entry_date DESC, ordinal ASC, app_key ASC, sha DESC). Three claims have to
 * hold, and each one fails silently if it stops holding:
 *
 *   SAME ANSWER      keyset paging that gets the tie-break wrong drops rows and
 *                    repeats others, and the page still renders. So the order
 *                    and the membership are asserted against an independently
 *                    sorted copy of the fixture, not against "it returned some
 *                    entries".
 *
 *   LESS WORK        the point of the change. An offset walk re-derives every
 *                    row before the one it wants; a cursor seeks. Measured here
 *                    as: no request carries a non-zero offset, and only the
 *                    first request asks for an exact count (PostgREST answers
 *                    that with a COUNT over the whole filtered set, so asking
 *                    on every page paid for it on every page).
 *
 *   STILL SCOPED     a cursor is a position, not a permission. Every page —
 *                    including pages reached by a cursor the caller supplied —
 *                    must still carry `.in('module_key', visible)`. A keyset
 *                    predicate built as a top-level OR is exactly the shape
 *                    that could widen the set if it were not ANDed with the
 *                    boundary, so this is asserted on every request, not once.
 *
 * The fake database below EVALUATES the or-predicate the route builds rather
 * than recording it, for the same reason route-module-scope.test.ts evaluates
 * `.in()`: a route that built a cursor filter and never applied it would pass a
 * spy and fail this.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

function daysAgo(n: number): string {
  const [y, m, d] = istToday().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

const MODULES = [
  { key: 'platform', label: 'Platform', perm: null, href: null },
  { key: 'billing', label: 'Billing', perm: ['billing'], href: '/billing' },
  { key: 'administration', label: 'Administration', perm: ['admin'], href: '/admin' },
];

interface Row {
  sha: string;
  entry_date: string;
  kind: string;
  module_key: string;
  subject: string;
  author: string;
  pr_number: number | null;
  breaking: boolean;
  ordinal: number;
  app_key: string;
}

/**
 * 300 archive entries built to put every branch of the keyset predicate on the
 * critical path, not just the first one:
 *
 *   - many rows share an entry_date        -> the `ordinal` branch must decide
 *   - two app_keys reuse the SAME ordinal  -> the `app_key` branch must decide
 *   - one pair shares date+ordinal+app_key -> the `sha` branch must decide
 *
 * A route that paged on entry_date alone, or stopped at ordinal, would lose or
 * repeat rows exactly at those boundaries and nowhere else.
 */
const ARCHIVE: Row[] = [];
for (let i = 0; i < 150; i++) {
  const day = daysAgo(120 + Math.floor(i / 10)); // 10 entries per day
  for (const app of ['myjkkn', 'hostel']) {
    ARCHIVE.push({
      sha: `${app === 'myjkkn' ? 'a' : 'b'}${String(i).padStart(6, '0')}`,
      entry_date: day,
      kind: 'new',
      module_key: MODULES[i % 3].key,
      subject: `Archive change ${i} (${app})`,
      author: `Author ${i % 5}`,
      pr_number: i,
      breaking: false,
      ordinal: i, // deliberately IDENTICAL across the two apps
      app_key: app,
    });
  }
}
// The one pair that ties on date, ordinal AND app_key — only `sha` separates
// them, and it descends.
ARCHIVE.push({
  sha: 'ffffffffffff',
  entry_date: ARCHIVE[0].entry_date,
  kind: 'fixed',
  module_key: 'platform',
  subject: 'Same date, same ordinal, same app',
  author: 'Author 0',
  pr_number: null,
  breaking: false,
  ordinal: ARCHIVE[0].ordinal,
  app_key: 'myjkkn',
});

/** A few rows inside the 90-day window, so the archive filter has work to do. */
const RECENT: Row[] = Array.from({ length: 12 }, (_, i) => ({
  sha: `r${String(i).padStart(6, '0')}`,
  entry_date: daysAgo(i),
  kind: 'new',
  module_key: MODULES[i % 3].key,
  subject: `Recent change ${i}`,
  author: 'Author 0',
  pr_number: i,
  breaking: false,
  ordinal: 900 + i,
  app_key: 'myjkkn',
}));

const ALL: Row[] = [...RECENT, ...ARCHIVE];

/** The route's sort, written out once so the tests can sort independently of it. */
function newestFirst(a: Row, b: Row): number {
  if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? 1 : -1;
  if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
  if (a.app_key !== b.app_key) return a.app_key < b.app_key ? -1 : 1;
  return a.sha < b.sha ? 1 : -1;
}

// ---------------------------------------------------------------- fake server

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

function leaf(row: any, term: string): boolean {
  const [col, op, ...rest] = term.split('.');
  const raw = rest.join('.');
  const actual = row[col];
  const v = typeof actual === 'number' ? Number(raw) : raw;
  switch (op) {
    case 'eq': return actual === v;
    case 'lt': return actual < v;
    case 'gt': return actual > v;
    case 'lte': return actual <= v;
    case 'gte': return actual >= v;
    default: throw new Error(`fake db: unsupported operator ${op}`);
  }
}

function orMatches(row: any, expr: string): boolean {
  return splitTop(expr).some((t) =>
    t.startsWith('and(') && t.endsWith(')')
      ? splitTop(t.slice(4, -1)).every((c) => leaf(row, c))
      : leaf(row, t)
  );
}

interface Call {
  table: string;
  /** The module keys this request was scoped to; null means it was never scoped. */
  scopedTo: string[] | null;
  usedCursor: boolean;
  counted: boolean;
  from: number;
  to: number;
  returned: number;
}

let calls: Call[] = [];
/** What the fake will hand back at most, whatever window is asked for. */
let serverCap = 100;

function table(name: string, rows: any[]) {
  let out = [...rows];
  let scopedTo: string[] | null = null;
  let usedCursor = false;
  let counted = false;
  const b: any = {
    select: (_c: string, opts?: { count?: string }) => {
      counted = opts?.count === 'exact';
      return b;
    },
    in: (col: string, vals: string[]) => {
      if (col === 'module_key' || col === 'key') scopedTo = [...vals];
      out = out.filter((r) => vals.includes(r[col]));
      return b;
    },
    gte: (col: string, v: string) => { out = out.filter((r) => r[col] >= v); return b; },
    gt: (col: string, v: string) => { out = out.filter((r) => r[col] > v); return b; },
    lt: (col: string, v: string) => { out = out.filter((r) => r[col] < v); return b; },
    or: (expr: string) => {
      usedCursor = true;
      out = out.filter((r) => orMatches(r, expr));
      return b;
    },
    order: () => b,
    limit: () => b,
    maybeSingle: async () => ({ data: out[0] ?? null, error: null }),
    range: async (from: number, to: number) => {
      const data = out.slice(from, Math.min(to + 1, from + serverCap));
      calls.push({ table: name, scopedTo, usedCursor, counted, from, to, returned: data.length });
      return { data, error: null, count: counted ? out.length : null };
    },
  };
  return b;
}

let client: any;

function makeClient(visible: string[] = MODULES.map((m) => m.key)) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
    rpc: async (name: string) =>
      name === 'fn_changelog_visible_modules'
        ? { data: visible, error: null }
        : { data: null, error: null },
    from: (t: string) => {
      if (t === 'changelog_entries') {
        // The fake sorts, because PostgREST does — keyset paging is only correct
        // over an ordered set and a test that fed it an unordered one would
        // prove nothing.
        return table(t, [...ALL].sort(newestFirst));
      }
      if (t === 'changelog_modules') return table(t, MODULES);
      return table(t, [{ last_synced_at: null, last_ref: null }]);
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));

async function get(url: string) {
  const { GET } = await import('@/app/api/whats-new/route');
  return GET(new Request(url));
}

const U = 'https://x.test/api/whats-new';
const CUTOFF = daysAgo(90);

/**
 * The cursor format, restated here rather than imported.
 *
 * The route does not export it, and a test that reused the route's own encoder
 * would agree with it however wrong it was. Writing it out means a change to
 * the encoding has to be made in two places by someone who has noticed.
 */
function cursorOf(r: Row): string {
  return Buffer.from(
    JSON.stringify({ entry_date: r.entry_date, ordinal: r.ordinal, app_key: r.app_key, sha: r.sha }),
    'utf8'
  ).toString('base64url');
}

/** The archive, as the route ought to return it, derived from the fixture. */
function expectedArchive(visible: string[] = MODULES.map((m) => m.key)): Row[] {
  return ALL.filter((r) => r.entry_date < CUTOFF && visible.includes(r.module_key)).sort(newestFirst);
}

const entryCalls = () => calls.filter((c) => c.table === 'changelog_entries');

beforeEach(() => {
  vi.resetModules();
  calls = [];
  serverCap = 100;
  client = makeClient();
});

describe("What's New — keyset paging returns the same answer as before", () => {
  it('returns every archive row, in exactly the composite-sort order', async () => {
    const body = await (await get(`${U}?part=archive&before=${CUTOFF}`)).json();
    const expected = expectedArchive();

    // The fixture has to actually exercise multi-page paging or this proves
    // nothing about paging at all.
    expect(expected.length).toBeGreaterThan(serverCap * 2);
    expect(body.map((e: any) => e.h)).toEqual(expected.map((r) => r.sha));
  });

  it('repeats nothing and loses nothing across page boundaries', async () => {
    const body = await (await get(`${U}?part=archive&before=${CUTOFF}`)).json();
    const shas = body.map((e: any) => e.h);
    expect(new Set(shas).size).toBe(shas.length);
    expect(new Set(shas)).toEqual(new Set(expectedArchive().map((r) => r.sha)));
  });

  /**
   * EVERY branch of the keyset predicate, forced onto a page boundary.
   *
   * At a realistic cap the boundary never lands inside a tie group, so the
   * `app_key` and `sha` branches are carried along by the earlier ones and a
   * route missing either still returns the right answer. A two-row page makes
   * the boundary land between tied rows over and over, which is the only
   * arrangement in which those two branches decide anything. Dropping the `sha`
   * branch loses a row here; dropping `app_key` loses far more.
   */
  it.each([2, 3, 5, 7])(
    'is exact when a %i-row page boundary lands inside a tie group',
    async (cap) => {
      serverCap = cap;
      const body = await (await get(`${U}?part=archive&before=${CUTOFF}`)).json();
      expect(body.map((e: any) => e.h)).toEqual(expectedArchive().map((r) => r.sha));
    }
  );

  it('separates rows that tie on date, ordinal and app — only sha tells them apart', async () => {
    const twins = ARCHIVE.filter(
      (r) => r.entry_date === ARCHIVE[0].entry_date && r.ordinal === ARCHIVE[0].ordinal
    );
    expect(twins.length).toBeGreaterThan(2); // the deliberate ties exist

    // Two rows, so the boundary falls between the two that differ only by sha.
    serverCap = 2;
    const body = await (await get(`${U}?part=archive&before=${CUTOFF}`)).json();
    for (const t of twins) expect(body.map((e: any) => e.h)).toContain(t.sha);
  });

  it('still partitions the window: nothing in both halves, nothing in neither', async () => {
    const recent = await (await get(`${U}?part=recent&before=${CUTOFF}`)).json();
    const archive = await (await get(`${U}?part=archive&before=${CUTOFF}`)).json();
    const r = new Set(recent.map((e: any) => e.h));
    const a = new Set(archive.map((e: any) => e.h));
    expect([...r].filter((h) => a.has(h))).toEqual([]);
    expect(r.size + a.size).toBe(ALL.length);
  });

  it('walks the whole archive when the server caps pages far below the ask', async () => {
    serverCap = 37;
    const body = await (await get(`${U}?part=archive&before=${CUTOFF}`)).json();
    expect(body.map((e: any) => e.h)).toEqual(expectedArchive().map((r) => r.sha));
  });
});

describe("What's New — the read is a seek, not a growing offset", () => {
  it('never asks for a non-zero offset, however many pages it reads', async () => {
    await get(`${U}?part=archive&before=${CUTOFF}`);
    expect(entryCalls().length).toBeGreaterThan(2); // it really did page
    // This is the regression guard. `.range(n, …)` with n > 0 is the offset
    // walk this change removed: PostgREST turns it into OFFSET n and Postgres
    // produces and discards n rows to satisfy it.
    expect(entryCalls().map((c) => c.from)).toEqual(entryCalls().map(() => 0));
  });

  it('asks for an exact count ONCE per read, not once per page', async () => {
    await get(`${U}?part=archive&before=${CUTOFF}`);
    const counted = entryCalls().filter((c) => c.counted);
    expect(counted).toHaveLength(1);
    expect(entryCalls()[0].counted).toBe(true);
    expect(entryCalls().length).toBeGreaterThan(counted.length);
  });

  it('pages after the first one carry a cursor predicate', async () => {
    await get(`${U}?part=archive&before=${CUTOFF}`);
    expect(entryCalls()[0].usedCursor).toBe(false);
    expect(entryCalls().slice(1).every((c) => c.usedCursor)).toBe(true);
  });

  it('uses no more round-trips than the row cap requires', async () => {
    await get(`${U}?part=archive&before=${CUTOFF}`);
    // The 1,000-row PostgREST cap fixes the trip count; keyset must not make it
    // worse by needing an extra empty page to discover the end.
    expect(entryCalls()).toHaveLength(Math.ceil(expectedArchive().length / serverCap));
  });
});

describe("What's New — a cursor is a position, never a permission", () => {
  const VISIBLE = ['platform', 'billing'];

  it('re-applies the module boundary on EVERY page, cursor pages included', async () => {
    client = makeClient(VISIBLE);
    await get(`${U}?part=archive&before=${CUTOFF}`);

    expect(entryCalls().length).toBeGreaterThan(2);
    for (const c of entryCalls()) expect(c.scopedTo).toEqual(VISIBLE);
  });

  it('withholds a hidden module on page 2 and beyond, not just on page 1', async () => {
    client = makeClient(VISIBLE);
    const body = await (await get(`${U}?part=archive&before=${CUTOFF}`)).json();

    expect(body.map((e: any) => e.m)).not.toContain('administration');
    expect(body.map((e: any) => e.h)).toEqual(expectedArchive(VISIBLE).map((r) => r.sha));
    // And the narrowing is real, not an empty result dressed up as one.
    expect(body.length).toBeGreaterThan(serverCap);
    expect(body.length).toBeLessThan(expectedArchive().length);
  });

  it('a cursor naming a row the caller may not see cannot reach that row', async () => {
    const hidden = expectedArchive().find((r) => r.module_key === 'administration')!;
    client = makeClient(VISIBLE);
    const body = await (
      await get(`${U}?part=archive&before=${CUTOFF}&cursor=${cursorOf(hidden)}`)
    ).json();

    expect(body.map((e: any) => e.m)).not.toContain('administration');
    for (const c of entryCalls()) expect(c.scopedTo).toEqual(VISIBLE);
  });

  it('resumes exactly where the previous read stopped — no gap, no repeat', async () => {
    const expected = expectedArchive();
    const at = expected[120];
    const rest = await (
      await get(`${U}?part=archive&before=${CUTOFF}&cursor=${cursorOf(at)}`)
    ).json();

    expect(rest.map((e: any) => e.h)).toEqual(expected.slice(121).map((r) => r.sha));
  });

  it('hands back the position of the last row it served', async () => {
    const res = await get(`${U}?part=archive&before=${CUTOFF}`);
    const expected = expectedArchive();
    expect(res.headers.get('X-Changelog-Cursor')).toBe(cursorOf(expected[expected.length - 1]));

    // And continuing from it is empty, because there is nothing after the end.
    const more = await (
      await get(`${U}?part=archive&before=${CUTOFF}&cursor=${res.headers.get('X-Changelog-Cursor')}`)
    ).json();
    expect(more).toEqual([]);
  });
});

describe("What's New — a cursor that cannot be read FAILS CLOSED", () => {
  /**
   * The distinction this whole describe exists for: `?before=` falls back to
   * today's boundary when it is malformed, which narrows. A cursor falling back
   * to "no cursor" would WIDEN — it would hand the whole window to a caller who
   * asked for a slice of it — so it must be refused instead.
   */
  const badCursors: Array<[string, string]> = [
    ['not base64 at all', 'not-a-cursor!!'],
    ['base64 of something that is not JSON', Buffer.from('hello', 'utf8').toString('base64url')],
    ['JSON that is not an object', Buffer.from('[1,2,3]', 'utf8').toString('base64url')],
    ['an object missing sha', Buffer.from(JSON.stringify({ entry_date: '2026-01-01', ordinal: 1, app_key: 'myjkkn' }), 'utf8').toString('base64url')],
    ['a date that is not a date', Buffer.from(JSON.stringify({ entry_date: 'yesterday', ordinal: 1, app_key: 'myjkkn', sha: 'abc123' }), 'utf8').toString('base64url')],
    ['an impossible date', Buffer.from(JSON.stringify({ entry_date: '2026-13-45', ordinal: 1, app_key: 'myjkkn', sha: 'abc123' }), 'utf8').toString('base64url')],
    ['a fractional ordinal', Buffer.from(JSON.stringify({ entry_date: '2026-01-01', ordinal: 1.5, app_key: 'myjkkn', sha: 'abc123' }), 'utf8').toString('base64url')],
    ['a negative ordinal', Buffer.from(JSON.stringify({ entry_date: '2026-01-01', ordinal: -1, app_key: 'myjkkn', sha: 'abc123' }), 'utf8').toString('base64url')],
    ['an ordinal past the integer column', Buffer.from(JSON.stringify({ entry_date: '2026-01-01', ordinal: 4294967296, app_key: 'myjkkn', sha: 'abc123' }), 'utf8').toString('base64url')],
    ['an empty string', ''],
  ];

  for (const [what, raw] of badCursors) {
    it(`refuses ${what} with 400, and reads no entries`, async () => {
      const res = await get(`${U}?part=archive&before=${CUTOFF}&cursor=${encodeURIComponent(raw)}`);
      expect(res.status).toBe(400);
      expect(entryCalls()).toHaveLength(0);
    });
  }

  /**
   * The values are interpolated into a PostgREST or-filter, where a comma or a
   * parenthesis would restructure the predicate rather than be compared as
   * text. The validation above is what stands between a caller and that, so it
   * is asserted directly on the characters that would do it.
   */
  const injections = [
    { entry_date: '2026-01-01', ordinal: 1, app_key: 'myjkkn,module_key.eq.administration', sha: 'abc123' },
    { entry_date: '2026-01-01', ordinal: 1, app_key: 'myjkkn', sha: 'abc123,or(module_key.eq.administration)' },
    { entry_date: '2026-01-01', ordinal: 1, app_key: 'my)jkkn', sha: 'abc123' },
    { entry_date: '2026-01-01', ordinal: 1, app_key: 'myjkkn', sha: '*' },
  ];

  for (const [i, payload] of injections.entries()) {
    it(`refuses a cursor carrying filter syntax (#${i + 1})`, async () => {
      const raw = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
      const res = await get(`${U}?part=archive&before=${CUTOFF}&cursor=${encodeURIComponent(raw)}`);
      expect(res.status).toBe(400);
      expect(entryCalls()).toHaveLength(0);
    });
  }

  it('refuses a cursor on part=meta, which describes the whole window', async () => {
    const at = expectedArchive()[10];
    const res = await get(`${U}?part=meta&before=${CUTOFF}&cursor=${cursorOf(at)}`);
    expect(res.status).toBe(400);
  });

  it('a malformed ?before still falls back rather than failing — unchanged', async () => {
    // The two parameters fail in opposite directions ON PURPOSE, and this is
    // the assertion that keeps the cursor's stricter rule from being copied
    // back onto `before` by someone tidying up.
    const res = await get(`${U}?part=recent&before=not-a-date`);
    expect(res.status).toBe(200);
  });
});
