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
// KNOWN LIMIT, stated so nobody mistakes it for a guarantee: this gate is
// per-SESSION, not per-ROLE. Any signed-in user can request any part and receive
// the full set; the page then filters what it DISPLAYS by role. That matches the
// stated decision and the smart-guide precedent, but it means the role scoping is
// a presentation rule, not an access boundary.

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
 * and it does so SILENTLY: a plain select of the ~4,700 entries returns the
 * first 1,000 with no error, which would drop months of history off the page
 * with nothing to notice. Every read below therefore pages, and uses the exact
 * row count returned by the same request to decide when it has everything.
 */
const PAGE_ROWS = 1000;

type Page<T> = { data: T[] | null; error: { message: string } | null; count: number | null };

async function fetchAll<T>(
  pageAt: (from: number, to: number) => PromiseLike<Page<T>>
): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;

  for (;;) {
    const { data, error, count } = await pageAt(rows.length, rows.length + PAGE_ROWS - 1);
    if (error) throw new Error(error.message);
    if (expected === null) expected = count;

    const got = data ?? [];
    rows.push(...got);

    if (got.length === 0) break;
    // The offset advances by what the server actually returned, not by
    // PAGE_ROWS, so a deployment whose cap is lower than 1,000 still walks the
    // whole table instead of stopping at the first short page. `count` is the
    // authority on when to stop; the short-page test is only the fallback for a
    // response that carries no count.
    if (expected !== null ? rows.length >= expected : got.length < PAGE_ROWS) break;
  }

  return rows;
}

/**
 * Newest first, and a TOTAL order.
 *
 * The date alone is not enough. Paging with .range() over a sort that has ties
 * lets two equal rows swap between requests, which silently drops one and
 * repeats another. `sha` is UNIQUE, so ending on it makes the sort total and the
 * paging exact. `created_at` sits in the middle as a best-effort echo of the
 * order the sync wrote the rows in: the table stores no commit sequence, so
 * within a single day nothing can reproduce the order the commits were made in
 * — the generated file used git's own order there.
 */
function newestFirst(query: any) {
  return query
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('sha', { ascending: false });
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

const ENTRY_COLUMNS = 'sha,entry_date,kind,module_key,subject,author,pr_number,breaking';

interface EntryRow {
  sha: string;
  entry_date: string;
  kind: ChangeKind;
  module_key: string;
  subject: string;
  author: string;
  pr_number: number | null;
  breaking: boolean;
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

/** One window of entries, newest first, the whole window. */
async function readEntries(
  supabase: Db,
  part: Exclude<Part, 'meta'>,
  cutoff: string
): Promise<ChangelogEntry[]> {
  const rows = await fetchAll<EntryRow>((from, to) => {
    const scoped = supabase.from('changelog_entries').select(ENTRY_COLUMNS, { count: 'exact' });
    return newestFirst(
      part === 'recent' ? scoped.gte('entry_date', cutoff) : scoped.lt('entry_date', cutoff)
    ).range(from, to);
  });
  return rows.map(toEntry);
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
 * `total`: it counts what the sync wrote, hidden rows included, and this reader
 * must not be told those exist.
 */
async function readMeta(supabase: Db, cutoff: string): Promise<ChangelogMeta> {
  const [scan, moduleRows, sync] = await Promise.all([
    fetchAll<Pick<EntryRow, 'entry_date' | 'author' | 'module_key'>>((from, to) =>
      newestFirst(
        supabase.from('changelog_entries').select('entry_date,author,module_key', {
          count: 'exact',
        })
      ).range(from, to)
    ),
    fetchAll<ModuleRow>((from, to) =>
      supabase
        .from('changelog_modules')
        .select('key,label,perm,href', { count: 'exact' })
        .order('key', { ascending: true })
        .range(from, to)
    ),
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
  const cutoff = recentFrom();

  let body: ChangelogMeta | ChangelogEntry[];
  try {
    body = part === 'meta' ? await readMeta(supabase, cutoff) : await readEntries(supabase, part, cutoff);
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
    },
  });
}
