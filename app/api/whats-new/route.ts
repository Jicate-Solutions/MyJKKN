// app/api/whats-new/route.ts
//
// Serves the What's New changelog data to SIGNED-IN users only.
//
// WHY THIS ROUTE EXISTS AT ALL — a real exposure, found live on production
// 2026-09-06. The data originally shipped as public/changelog/*.json. MyJKKN's
// proxy treats any path ending in `.json` as a public static asset:
//
//     proxy.ts:258
//     const STATIC_ASSET_PATTERN =
//       /^\/(_next|icons)|\.(?:js|css|png|ico|svg|json|xml|html|woff2?)$/;
//
// so `/changelog/recent.json` never reached the auth check. Verified against
// www.jkkn.ai with no session: all three files returned HTTP 200 (meta 7,977 B,
// recent 390,405 B, archive 319,877 B) — 4,753 internal change descriptions
// readable by anyone on the internet, including entries about Administration,
// AI Routines and Users & Roles.
//
// The Director's decision (2026-09-05) was "everyone who SIGNS IN". Widening the
// proxy's static-asset rule would change auth for the whole app, so the fix
// belongs here instead: the data is no longer under public/, and this route
// requires a session.
//
// WHERE THE DATA COMES FROM (changed 2026-09-06). It used to be JSON generated
// from git history at build time and committed to the repo, which this route
// imported. It is now three tables — changelog_entries, changelog_modules,
// changelog_sync (supabase/migrations/20260906090000_changelog_live_data.sql) —
// written by a sync job over the service role. The page is therefore as current
// as the last sync rather than the last deploy, and this route no longer reads
// lib/changelog/data/*.json. The response shape is unchanged: the same
// ?part=meta|recent|archive payloads described in lib/changelog/types.ts, so
// nothing that consumes this route had to change with it.
//
// READS RUN AS THE SIGNED-IN USER, deliberately — the anon-key server client
// carrying this request's cookies, never the service role. RLS on those tables
// grants SELECT to `authenticated` only, and the entries policy is
// `USING (NOT hidden)`, so both the sign-in gate and the takedown list are
// enforced by the database. Reading with the service role would work too, and
// would quietly move both of those rules into whatever this file remembers to
// filter on.
//
// ROLE SCOPING IS AN ACCESS BOUNDARY (changed 2026-09-08). It used to be a
// presentation rule: this route returned the full set to any signed-in caller
// and the page filtered what it DISPLAYED, so every learner could read all
// ~4,800 subjects — Administration, AI Routines, Users & Roles included — by
// requesting ?part=recent and ignoring the page. One layer in from the
// public/*.json exposure above, and the same class of miss.
//
// Every read below is now confined to the modules the CALLER may see, decided
// by fn_changelog_visible_modules() (supabase/migrations/
// 20261123090000_changelog_visible_modules.sql) rather than by anything this
// file remembers to filter on. The page's canSeeModule() stays exactly as it
// was: it is now the second, cosmetic pass over a list the database has already
// narrowed, not the only one.
//
// HOW THE READS PAGE (changed 2026-09-12). Keyset, not offset — see fetchPaged()
// below. The table reached 4,923 rows on 2026-09-12 and only grows, and an
// offset walk re-derives and discards every row before the one it wants, so the
// cost of reading the archive was rising with the square of the changelog. The
// module boundary above is unaffected by this and is re-applied on every page,
// cursor pages included: `.or()` is one top-level node and PostgREST ANDs the
// top-level nodes, so a cursor narrows and can never widen.
//
// The function is deliberately NOT narrower than the page — it reproduces the
// multi-role OR-merge, the profiles.role safety net, live handover keys and the
// super-admin bypass, because a server filter that hides a module the page
// shows is a regression wearing a security fix's clothes. Its one documented
// residual is at the foot of that migration.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type {
  ChangeKind,
  ChangelogEntry,
  ChangelogMeta,
  ChangelogModule,
} from '@/lib/changelog/types';

export const dynamic = 'force-dynamic';

type Db = Awaited<ReturnType<typeof createClient>>;

const PARTS = ['meta', 'recent', 'archive'] as const;
type Part = (typeof PARTS)[number];

function isPart(v: string | null): v is Part {
  return v !== null && (PARTS as readonly string[]).includes(v);
}

/** Days of history the page renders on first paint. Older entries are the archive. */
const RECENT_DAYS = 90;

/**
 * PostgREST caps a single response — Supabase's default `db-max-rows` is 1,000 —
 * and it does so SILENTLY: a plain select of the ~4,900 entries returns the
 * first 1,000 with no error, which would drop months of history off the page
 * with nothing to notice. Every read below therefore pages.
 */
const PAGE_ROWS = 1000;

/**
 * A loop stop that cannot be reasoned away. Keyset paging advances strictly —
 * the last row of a page is, by construction, before every row of the next —
 * so this can only fire if the sort or the cursor stops being a total order.
 * Loudly, then, rather than spinning against the database forever.
 */
const MAX_PAGES = 200;

type Page<T> = { data: T[] | null; error: { message: string } | null; count: number | null };

/**
 * PAGING IS KEYSET, NOT OFFSET (changed 2026-09-12).
 *
 * It used to be `.range(rows.length, rows.length + 999)`, walked with a growing
 * offset. PostgREST turns an offset into OFFSET n, and Postgres implements that
 * by producing and discarding the first n rows of the ordered set: page 5 of
 * the archive re-derived rows 1..4,000 to throw them away. Reading the whole
 * archive therefore cost O(n²/PAGE_ROWS) row-productions, and got worse every
 * time the sync added a commit — 4,923 entries live on 2026-09-12.
 *
 * A cursor replaces the offset. Each page asks for the rows strictly AFTER the
 * last row of the previous one, expressed on the same composite sort key, which
 * is a seek into changelog_entries_date_idx (entry_date DESC, ordinal ASC)
 * rather than a scan from the top. Every page costs the same as the first.
 *
 * `count: 'exact'` now rides on the FIRST request only. PostgREST answers an
 * exact count with a COUNT over the whole filtered set, in addition to the rows
 * — so asking on all five archive pages paid for five full counts to learn one
 * number that does not change between them. Round-TRIPS are unchanged (the
 * 1,000-row cap fixes those); what drops is the work inside each one.
 */
async function fetchPaged<T>(
  page: (cursor: T | null, withCount: boolean) => PromiseLike<Page<T>>
): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;

  for (let i = 0; ; i++) {
    if (i >= MAX_PAGES) {
      throw new Error(`changelog paging did not terminate after ${MAX_PAGES} pages`);
    }
    const first = i === 0;
    const { data, error, count } = await page(first ? null : rows[rows.length - 1], first);
    if (error) throw new Error(error.message);
    if (first) expected = count;

    const got = data ?? [];
    rows.push(...got);

    if (got.length === 0) break;
    // `count` from the first request is the authority on when to stop, so a run
    // whose total lands exactly on a page boundary does not pay for an extra
    // empty request. The short-page test is the fallback for a response that
    // carries no count, and also covers a deployment whose cap is below 1,000.
    if (expected !== null ? rows.length >= expected : got.length < PAGE_ROWS) break;
  }

  return rows;
}

/**
 * Newest first, and a TOTAL order.
 *
 * The date alone is not enough. Paging with .range() over a sort that has ties
 * lets two equal rows swap between requests, which silently drops one and
 * repeats another. The entries table's unique key is (app_key, sha), so ending
 * on BOTH of those makes the sort total and the paging exact. Ending on `sha`
 * alone would not: a short hash is unique inside one repository and nowhere
 * else, so the moment a second application writes here two rows could tie on
 * every term of this sort. `ordinal` sits in the middle and is the entry's
 * position in the sync's newest-first read of git history. It replaced
 * `created_at`, which
 * could not break a same-day tie at all: the whole seed is one transaction, so
 * now() is identical on every row in it. Ordering by it silently returned
 * same-day entries in an arbitrary order — a regression against the file the
 * page used to read, which carried git's own order.
 */
function newestFirst(query: any) {
  return query
    .order('entry_date', { ascending: false })
    .order('ordinal', { ascending: true })
    .order('app_key', { ascending: true })
    .order('sha', { ascending: false });
}

/** The four columns that make the sort above total — the cursor, in other words. */
interface SortKey {
  entry_date: string;
  ordinal: number;
  app_key: string;
  sha: string;
}

/**
 * "Strictly after this row", written out on the composite sort key.
 *
 * Row-value comparison — `(entry_date, ordinal, app_key, sha) < (…)` — would say
 * this in one line, but PostgREST has no syntax for it and the sort mixes
 * directions anyway, so it is spelled as the equivalent OR of four
 * lexicographic cases. Read against newestFirst(): descend on entry_date,
 * ascend on ordinal, ascend on app_key, descend on sha.
 *
 * `.or()` is ONE top-level node, and PostgREST ANDs top-level nodes together —
 * so the `.in('module_key', visible)` boundary applied by the caller still
 * binds every cursor page. A cursor can only ever narrow the set; it has no way
 * to reach a module the caller may not see. Proved in
 * __tests__/lib/changelog/route-keyset-paging.test.ts rather than asserted here.
 *
 * The interpolated values are safe because isSortKey() below has already
 * rejected everything that is not a plain date / non-negative integer / short
 * identifier / hex hash — in particular commas and parentheses, which are the
 * only characters that could restructure this filter.
 */
function after(query: any, k: SortKey) {
  const d = k.entry_date;
  return query.or(
    [
      `entry_date.lt.${d}`,
      `and(entry_date.eq.${d},ordinal.gt.${k.ordinal})`,
      `and(entry_date.eq.${d},ordinal.eq.${k.ordinal},app_key.gt.${k.app_key})`,
      `and(entry_date.eq.${d},ordinal.eq.${k.ordinal},app_key.eq.${k.app_key},sha.lt.${k.sha})`,
    ].join(',')
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** `app_key` is an application slug; 'myjkkn' is the only one today. */
const APP_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** A twelve-character short hash today; the width is not pinned here. */
const SHA_RE = /^[0-9a-fA-F]{4,64}$/;

/**
 * Is this a cursor we are willing to put in a query filter?
 *
 * Deliberately shaped like the `?before=` check above and for the same reason:
 * the values reach PostgREST. The caller treats a `false` here as a 400 rather
 * than as "no cursor" — a cursor that fails validation must never widen the
 * answer to the whole window, which is the direction `?before=` falls in (it
 * re-derives today's boundary) and the direction a paging cursor must not.
 */
function isSortKey(v: unknown): v is SortKey {
  if (typeof v !== 'object' || v === null) return false;
  const k = v as Record<string, unknown>;
  return (
    typeof k.entry_date === 'string' &&
    DATE_RE.test(k.entry_date) &&
    !Number.isNaN(Date.parse(k.entry_date)) &&
    typeof k.ordinal === 'number' &&
    Number.isSafeInteger(k.ordinal) &&
    k.ordinal >= 0 &&
    // `ordinal` is an integer column; anything past its range is a forgery, and
    // a filter Postgres would reject with a 400 of its own.
    k.ordinal <= 2147483647 &&
    typeof k.app_key === 'string' &&
    APP_KEY_RE.test(k.app_key) &&
    typeof k.sha === 'string' &&
    SHA_RE.test(k.sha)
  );
}

/**
 * Opaque to the caller on purpose: base64url of the four sort columns. Opaque
 * so that the sort key can change — it already has once, when `ordinal`
 * replaced `created_at` — without a client holding a URL shaped like the old
 * one. Nothing secret is in it; it is the position, not a capability, and the
 * module boundary is re-applied from the session on every page regardless of
 * what a cursor says.
 */
function encodeCursor(k: SortKey): string {
  return Buffer.from(JSON.stringify(k), 'utf8').toString('base64url');
}

/** null means "this string is not a cursor" — never "start from the beginning". */
function decodeCursor(raw: string): SortKey | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    return isSortKey(parsed) ? { ...(parsed as SortKey) } : null;
  } catch {
    return null;
  }
}

/**
 * A date in IST, as YYYY-MM-DD (which is what en-CA formats to).
 *
 * Entry dates are each commit's own +05:30 date (`git log %cd`), so every
 * boundary here is drawn in the timezone the dates were recorded in rather than
 * the server's — on Vercel that is UTC, which is how an earlier version of this
 * page printed "Updated 5 September" above an entry dated 6 September.
 */
function istDate(at: Date = new Date()): string {
  return at.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * The recent/archive boundary. Derived from the clock rather than stored, which
 * is what the generated files did too — they were rebuilt daily with a fresh
 * 90-day cutoff — so it moves once a day at IST midnight. Checked against the
 * last generated meta.json: on 2026-09-06 both give 2026-06-08.
 */
function recentFrom(): string {
  const [y, m, d] = istDate().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - RECENT_DAYS)).toISOString().slice(0, 10);
}

// `ordinal` is selected but never sent to the page — it exists only so the ORDER
// BY below has a column it is certainly allowed to sort on. Ordering by a column
// absent from the projection is a PostgREST detail worth not depending on, and a
// 400 from it would only appear at runtime against a table that does not exist
// yet locally. toEntry() drops it, so the payload shape is unchanged.
//
// `app_key` joined it on 2026-09-12: the cursor that replaced the offset is the
// sort key, and the sort ends on (app_key, sha). toEntry() drops it too.
const ENTRY_COLUMNS =
  'sha,entry_date,kind,module_key,subject,author,pr_number,breaking,ordinal,app_key';

interface EntryRow extends SortKey {
  sha: string;
  entry_date: string;
  kind: ChangeKind;
  module_key: string;
  subject: string;
  author: string;
  pr_number: number | null;
  breaking: boolean;
  ordinal: number;
  app_key: string;
}

/** Row -> the short keys the page reads. ~4,700 of these travel to a phone. */
function toEntry(r: EntryRow): ChangelogEntry {
  return {
    h: r.sha,
    d: r.entry_date,
    t: r.kind,
    m: r.module_key,
    s: r.subject,
    a: r.author,
    // Both stay ABSENT rather than null when they do not apply: the page tests
    // `e.p &&` / `e.b === 1`, and the data contract asserts on `'p' in e`.
    ...(r.pr_number ? { p: r.pr_number } : {}),
    ...(r.breaking ? { b: 1 as const } : {}),
  };
}

interface ModuleRow {
  key: string;
  label: string;
  perm: string[] | null;
  href: string | null;
}

function toModule(r: ModuleRow): ChangelogModule {
  return {
    label: r.label,
    // NULL means platform-wide. An empty array has to mean the same thing, and
    // does NOT say so on its own: canSeeModule() tests `!mod.perm`, and `[]` is
    // truthy, so an empty array would hide a platform-wide module from everyone
    // except a super admin. Normalised here rather than trusted from the sync.
    //
    // A single-namespace module arrives as a one-element array where the
    // generated file wrote a bare string. ChangelogModule.perm is
    // `string | string[] | null` and every reader branches on Array.isArray
    // (use-changelog.ts:24 and both contract suites), so the array is inside the
    // existing contract — the only other uses of `.perm` are `=== null` tests,
    // which an array does not disturb.
    perm: r.perm && r.perm.length > 0 ? r.perm : null,
    href: r.href ?? null,
  };
}

/**
 * The module keys this CALLER may read — the access boundary itself.
 *
 * Resolved once per request and threaded through every read below, so meta and
 * the two entry windows cannot disagree about who the reader is. Errors are
 * FATAL and are allowed to throw: falling back to "show everything" on a failed
 * permission lookup is how a boundary quietly stops being one.
 */
async function readVisibleModules(supabase: Db): Promise<string[]> {
  // `as any` because types/supabase.ts is generated from the deployed schema and
  // this function is new in this change — the same cast every route in this repo
  // uses for user_has_permission(). It drops back to the generated signature the
  // next time the types are regenerated.
  const { data, error } = await (supabase as any).rpc('fn_changelog_visible_modules');
  if (error) throw new Error(`visible modules: ${error.message}`);
  // An empty array is a legitimate answer, not a failure: a viewer who may see
  // no module gets `module_key=in.()`, which PostgREST answers with [] and a
  // 200. Verified against production rather than assumed.
  return (data as string[] | null) ?? [];
}

/**
 * One window of entries, newest first, the whole window.
 *
 * `start` resumes strictly after a position the caller was previously served.
 * It is threaded into the SAME builder as the module boundary, never around it.
 */
async function readEntries(
  supabase: Db,
  part: Exclude<Part, 'meta'>,
  cutoff: string,
  visible: string[],
  start: SortKey | null
): Promise<EntryRow[]> {
  return fetchPaged<EntryRow>((cursor, withCount) => {
    const scoped = supabase
      .from('changelog_entries')
      .select(ENTRY_COLUMNS, withCount ? { count: 'exact' } : undefined)
      // The boundary. Applied in the database, on the partial index
      // changelog_entries (module_key) WHERE NOT hidden, so it costs a filter
      // rather than a scan. It is re-applied on EVERY page, cursor pages
      // included — a cursor is a position, not a permission.
      .in('module_key', visible);
    const windowed =
      part === 'recent' ? scoped.gte('entry_date', cutoff) : scoped.lt('entry_date', cutoff);
    // The caller's resume point on the first page; this page's own last row on
    // every page after it.
    const from = cursor ?? start;
    // Always `.range(0, …)`. The offset that used to grow with every page is
    // what this change removes; a non-zero `from` anywhere below would mean it
    // had quietly come back.
    return newestFirst(from ? after(windowed, from) : windowed).range(0, PAGE_ROWS - 1);
  });
}

/**
 * Everything the page needs to describe the list before it has the list.
 *
 * Derived from ONE scan of three columns over every visible entry rather than
 * from a handful of count-only queries. Two reasons, both load-bearing:
 * `months` and `contributors` cannot be computed by PostgREST at all (no
 * DISTINCT, no GROUP BY), and deriving every number from a single read is what
 * keeps total / recentCount / archiveCount from disagreeing with the lists this
 * same route serves. changelog_sync.entry_count is deliberately NOT used as
 * `total` even though it is the visible count: it is only rewritten inside a
 * sync (scripts/sync-changelog-db.mjs), so an entry hidden between syncs — a
 * person's takedown, the thing `hidden` exists for — leaves it overstating what
 * this reader can actually see.
 */
async function readMeta(
  supabase: Db,
  cutoff: string,
  visible: string[]
): Promise<ChangelogMeta> {
  const [scan, moduleRows, sync] = await Promise.all([
    // The scan selects the four sort columns as well as the three it reduces —
    // they are the cursor, and without them this read could not page by keyset.
    fetchPaged<Pick<EntryRow, 'entry_date' | 'author' | 'module_key'> & SortKey>(
      (cursor, withCount) => {
        const scoped = supabase
          .from('changelog_entries')
          .select(
            'entry_date,author,module_key,ordinal,app_key,sha',
            withCount ? { count: 'exact' } : undefined
          )
          // Same boundary as readEntries, and it must be the same or the header
          // counts would describe a list this reader is never served.
          .in('module_key', visible);
        return newestFirst(cursor ? after(scoped, cursor) : scoped).range(0, PAGE_ROWS - 1);
      }
    ),
    // Keyset here too, on the primary key. The table is small enough that it has
    // never needed a second page, which is exactly why it must not be the one
    // read that would silently truncate if it ever did.
    fetchPaged<ModuleRow>((cursor, withCount) => {
      const scoped = supabase
        .from('changelog_modules')
        .select('key,label,perm,href', withCount ? { count: 'exact' } : undefined)
        // The "areas" dropdown is built from this. Left unscoped it would name
        // every module on the platform while selecting entries from none of
        // them — leaking the module list back out of the boundary the entries
        // just went behind.
        .in('key', visible);
      return (cursor ? scoped.gt('key', cursor.key) : scoped)
        .order('key', { ascending: true })
        .range(0, PAGE_ROWS - 1);
    }),
    supabase.from('changelog_sync').select('last_synced_at,last_ref').limit(1).maybeSingle(),
  ]);

  if (sync.error) throw new Error(sync.error.message);
  const syncRow = sync.data as { last_synced_at: string | null; last_ref: string | null } | null;

  const total = scan.length;
  const latest = scan[0]?.entry_date ?? null;
  const first = scan[total - 1]?.entry_date ?? null;

  let recentCount = 0;
  const tally = new Map<string, number>();
  const used = new Set<string>();
  for (const r of scan) {
    if (r.entry_date >= cutoff) recentCount++;
    tally.set(r.author, (tally.get(r.author) ?? 0) + 1);
    used.add(r.module_key);
  }

  // Only modules that actually have entries, which is what the generated file
  // carried. The page turns meta.modules into the "areas" dropdown, so every
  // extra key would be a filter option that selects nothing.
  const modules: Record<string, ChangelogModule> = {};
  for (const m of moduleRows) {
    if (used.has(m.key)) modules[m.key] = toModule(m);
  }

  return {
    // When the sync has never run there is no honest timestamp, so fall back to
    // the newest entry's own date: the data cannot be fresher than that, so this
    // can only ever make the page look older, never newer. The page prints this
    // as "Updated <date> · N days ago" and warns past a week, and understating
    // freshness is the safe direction for that warning.
    generatedAt: syncRow?.last_synced_at ? istDate(new Date(syncRow.last_synced_at)) : (latest ?? ''),
    ref: syncRow?.last_ref ?? '',
    total,
    first,
    latest,
    months: [...new Set(scan.map((r) => r.entry_date.slice(0, 7)))].sort().reverse(),
    recentFrom: cutoff,
    recentCount,
    archiveCount: total - recentCount,
    contributors: [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    modules,
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const part = new URL(request.url).searchParams.get('part');
  if (!isPart(part)) {
    return NextResponse.json(
      { error: `part must be one of: ${PARTS.join(', ')}` },
      { status: 400 }
    );
  }

  // One cutoff for the whole request, so meta.recentFrom always describes the
  // window the same call would return.
  // The reader may pin the boundary by echoing back the `recentFrom` they were
  // given with `meta`. Without that, the cutoff is recomputed per request and
  // moves at IST midnight — so a reader who loads the page at 23:59 and clicks
  // "show earlier changes" at 00:01 gets one day in BOTH lists, and the page
  // concatenates them and renders that day twice. Validated hard against the
  // exact date shape rather than trusted: it goes into a query filter.
  const pinned = new URL(request.url).searchParams.get('before');
  const cutoff =
    pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned) && !Number.isNaN(Date.parse(pinned))
      ? pinned
      : recentFrom();

  // Resume a read strictly after a position this route previously served.
  // Opaque, and validated hard before it reaches a query filter — but unlike
  // `?before=` above, an unreadable one is a 400 rather than a fallback. The
  // fallback for a cutoff is "today's boundary", which is narrow; the fallback
  // for a cursor would be "start from the beginning", which hands back the
  // whole window to a caller who asked for a slice of it.
  const raw = new URL(request.url).searchParams.get('cursor');
  const start = raw === null ? null : decodeCursor(raw);
  if (raw !== null && start === null) {
    return NextResponse.json({ error: 'cursor is not readable' }, { status: 400 });
  }
  if (start !== null && part === 'meta') {
    // meta describes the whole window; resuming it partway would return counts
    // that describe neither the window nor the slice.
    return NextResponse.json({ error: 'cursor does not apply to part=meta' }, { status: 400 });
  }

  let body: ChangelogMeta | ChangelogEntry[];
  // The position of the last row served, so a caller can continue from here
  // without re-reading what it already has. A HEADER, not a body field: the
  // ?part= payload shapes are a contract (lib/changelog/types.ts, and two
  // contract suites assert on them), and adding a key to an array response
  // would mean changing every reader to unwrap it.
  let last: SortKey | null = null;
  try {
    const visible = await readVisibleModules(supabase);
    if (part === 'meta') {
      body = await readMeta(supabase, cutoff, visible);
    } else {
      const rows = await readEntries(supabase, part, cutoff, visible, start);
      last = rows[rows.length - 1] ?? null;
      body = rows.map(toEntry);
    }
  } catch (error) {
    // Kept in production: this is the difference between "the changelog is empty"
    // and "the database read failed", and the two look identical from the page.
    console.error('[whats-new] read failed', { part, error });
    return NextResponse.json({ error: "What's New could not be read." }, { status: 500 });
  }

  return NextResponse.json(body, {
    headers: {
      // Private: this is behind a session, so no shared cache may hold it.
      // The service worker keeps its own offline copy (app/sw.ts, NetworkFirst).
      'Cache-Control': 'private, no-cache, must-revalidate',
      ...(last
        ? {
            'X-Changelog-Cursor': encodeCursor({
              entry_date: last.entry_date,
              ordinal: last.ordinal,
              app_key: last.app_key,
              sha: last.sha,
            }),
          }
        : {}),
    },
  });
}
