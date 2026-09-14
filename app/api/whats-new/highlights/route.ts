// app/api/whats-new/highlights/route.ts
//
// The highlights strip, and the queue behind it.
//
//   GET  /api/whats-new/highlights           → the most recent STRIP_CAP
//                                              APPROVED highlights, for any
//                                              signed-in reader. NOT week-bound
//                                              — see "THE WINDOW" below.
//   GET  /api/whats-new/highlights?queue=1   → the approver's queue: this week's
//                                              candidates, each with the sentence
//                                              saying why it was picked, merged
//                                              with whatever has been written so
//                                              far. Needs the manage permission.
//   PUT  /api/whats-new/highlights           → save, approve or skip ONE
//                                              highlight. Needs the manage
//                                              permission.
//
// THE WINDOW, AND WHY THE STRIP STOPPED BEING WEEKLY.
//
// This route was written when a highlight was a weekly artefact, so the strip
// read `weekStart(istToday())` and showed the write-ups whose change landed in
// the current week. Ruling 1 (2026-09-13) then pointed the WRITER at a month of
// backlog (WRITEUP_BACKLOG_FLOOR) without moving the reader's window, and the
// two rulings collided: measured on production 2026-09-14, 199 approved
// write-ups existed and 6 of them fell in the current week. The other 193 were
// unreachable BY CONSTRUCTION — most were already outside any future week the
// moment they were written, and every one had cost a model run.
//
// The strip now reads from the same floor the writer does and takes the most
// recent STRIP_CAP approved write-ups, whichever weeks they fall in. A thin
// week fills from the days before it instead of rendering nothing. The queue is
// untouched and stays weekly: it is a person's workload, not a reader's page.
//
// WHY THIS IS A SEPARATE ROUTE FROM /api/whats-new. That route's `?part=` payload
// shapes are a contract two suites assert on (__tests__/lib/changelog/
// data-contract.test.ts, live-data-schema.test.ts), and the plain list must keep
// rendering byte-for-byte as it does today whether or not anything is approved
// this week. Adding a fourth part would put a new failure mode in the read path
// the whole page depends on. A strip that fails is a strip that is absent.
//
// READS RUN AS THE SIGNED-IN USER — the anon-key server client carrying this
// request's cookies, never the service role, exactly as the sibling route does.
// That matters more here than there, because the approved-only rule and the
// module boundary are BOTH expressed as RLS on changelog_highlights
// (20261203120000_changelog_highlights.sql). Reading with the service role would
// work and would quietly move both of those rules into whatever this file
// remembers to filter on. The filters below are the second wall, not the first.
//
// NOTHING UNAPPROVED CAN REACH A READER even if this file is wrong: the reader
// policy is `status = 'approved' AND EXISTS (… visible, not hidden …)`, so a
// forgotten `.eq('status', 'approved')` here returns no more rows than it does
// with it.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  selectHighlights,
  weekStart,
  STRIP_CAP,
  WRITEUP_BACKLOG_FLOOR,
  type HighlightCandidate,
} from '@/lib/changelog/highlights';
import type { ChangelogEntry, ChangelogModule } from '@/lib/changelog/types';

export const dynamic = 'force-dynamic';

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * The QUEUE's row budget for one week. The strip has its own — STRIP_PAGE and
 * STRIP_MAX_PAGES below — because it no longer reads a week.
 *
 * PostgREST's default `db-max-rows` is 1,000 and it truncates SILENTLY. One
 * week held 222 user-facing entries on 2026-09-12, so this has four times the
 * headroom it needs — but a week that somehow exceeded it would drop the OLDEST
 * entries of that week, the order being newest-first, and the queue would
 * simply offer fewer candidates. Stated so a future reader knows which way it
 * fails.
 */
const WEEK_ROWS = 1000;

/** `.in()` travels in the URL. Chunked so a busy week cannot build one too long. */
const IN_CHUNK = 200;

/**
 * Entries the strip scans per round trip, newest first.
 *
 * Equal to IN_CHUNK on purpose, so one page of entries is exactly one `.in()`
 * and never a chunked read. The strip stops as soon as it has STRIP_CAP
 * approved write-ups, so the ordinary answer is ONE page and two queries —
 * fewer than the single week-wide read this replaced, which already needed two
 * chunks for a 222-entry week.
 */
const STRIP_PAGE = 200;

/**
 * The furthest back the strip will ever walk, in pages.
 *
 * 5 × 200 = 1,000: the same row budget the queue's single read has always had,
 * spent gradually instead of all at once. It is needed because the window below
 * it is a FIXED floor and therefore widens by a day every day — an unbounded
 * walk would get slower forever.
 *
 * HOW IT FAILS, stated so nobody has to guess. A reader whose newest 1,000
 * in-scope changes hold fewer than STRIP_CAP approved write-ups is served the
 * ones that are there, and no error. That is the same shortfall a quiet week
 * has always produced, and the strip renders ABSENT rather than empty for it.
 */
const STRIP_MAX_PAGES = 5;

/** Today in IST, as YYYY-MM-DD — the timezone entry dates were recorded in. */
function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

interface EntryRow {
  sha: string;
  app_key: string;
  entry_date: string;
  kind: ChangelogEntry['t'];
  module_key: string;
  subject: string;
  author: string;
  pr_number: number | null;
  breaking: boolean;
}

interface HighlightRow {
  app_key: string;
  sha: string;
  headline: string | null;
  affects: string | null;
  action: string | null;
  status: 'draft' | 'approved' | 'skipped';
  selection_reason: string | null;
  /** 'ai' — written by the Max-lane writer and published unreviewed. 'human' —
   *  typed by a person. The strip captions the original developer line with it. */
  source: 'human' | 'ai';
}

function toEntry(r: EntryRow): ChangelogEntry {
  return {
    h: r.sha,
    d: r.entry_date,
    t: r.kind,
    m: r.module_key,
    s: r.subject,
    a: r.author,
    ...(r.pr_number ? { p: r.pr_number } : {}),
    ...(r.breaking ? { b: 1 as const } : {}),
  };
}

/**
 * The module keys this CALLER may read — the same boundary the plain list uses.
 * A failure throws rather than falling back to "show everything", which is how
 * a boundary quietly stops being one.
 */
async function readVisibleModules(supabase: Db): Promise<string[]> {
  const { data, error } = await (supabase as any).rpc('fn_changelog_visible_modules');
  if (error) throw new Error(`visible modules: ${error.message}`);
  return (data as string[] | null) ?? [];
}

/**
 * One page of entries on or after `from`, NEWEST FIRST, scoped to the caller's
 * modules.
 *
 * `.in('module_key', visible)` is the module boundary and the database applies
 * it, not this file — which is also what keeps the row budget below spent on
 * the reader's OWN modules rather than diluted by changes they may not see.
 */
async function readEntryPage(
  supabase: Db,
  from: string,
  visible: string[],
  offset: number,
  limit: number
): Promise<EntryRow[]> {
  if (visible.length === 0) return [];
  const { data, error } = await supabase
    .from('changelog_entries')
    .select('sha,app_key,entry_date,kind,module_key,subject,author,pr_number,breaking')
    .in('module_key', visible)
    .gte('entry_date', from)
    .order('entry_date', { ascending: false })
    .order('ordinal', { ascending: true })
    .order('app_key', { ascending: true })
    .order('sha', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return (data as EntryRow[] | null) ?? [];
}

/** This week's entries, scoped to the caller's modules — the queue's read. */
async function readWeekEntries(supabase: Db, from: string, visible: string[]): Promise<EntryRow[]> {
  return readEntryPage(supabase, from, visible, 0, WEEK_ROWS);
}

/** The highlight rows for a set of entries. RLS decides which of them come back. */
async function readHighlights(supabase: Db, shas: string[]): Promise<HighlightRow[]> {
  const out: HighlightRow[] = [];
  for (let i = 0; i < shas.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from('changelog_highlights')
      .select('app_key,sha,headline,affects,action,status,selection_reason,source')
      .in('sha', shas.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    out.push(...((data as HighlightRow[] | null) ?? []));
  }
  return out;
}

/**
 * Report rows for a set of entries — Director ruling 7.
 *
 * RLS decides what comes back and the two answers are BOTH correct, which is
 * why this one query serves the strip and the queue:
 *   • an ordinary reader sees only their own taps, so the strip can say "you
 *     reported this" after a reload instead of offering the link again;
 *   • someone holding whats_new.highlights.manage sees every tap, so the queue
 *     can show the count — the honest measure of how often the writing is
 *     wrong, which is the deliverable of that ruling.
 * Nothing here filters by user: doing so would put the boundary in this file
 * instead of in the policy.
 */
async function readReports(
  supabase: Db,
  shas: string[]
): Promise<{ sha: string; reported_by: string }[]> {
  const out: { sha: string; reported_by: string }[] = [];
  for (let i = 0; i < shas.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from('changelog_highlight_reports')
      .select('sha,reported_by')
      .in('sha', shas.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    out.push(...((data as { sha: string; reported_by: string }[] | null) ?? []));
  }
  return out;
}

/**
 * The most recent STRIP_CAP APPROVED write-ups this reader may see, newest
 * first — the whole of what the strip renders.
 *
 * It walks the backlog window a page at a time and STOPS as soon as it has
 * enough, which is why the window being a month wide (and widening) costs
 * nothing in the ordinary case: the newest page almost always holds ten.
 *
 * WHY IT WALKS ENTRIES RATHER THAN READING changelog_highlights DIRECTLY.
 * "Newest first" is the ENTRY'S own date, and a highlight row does not carry
 * one — ordering there would mean ordering by when someone wrote the sentence,
 * which is the cron's schedule and not the reader's sense of recent. Walking
 * entries also puts `.in('module_key', visible)` — the same module boundary the
 * plain list uses — on every row considered, rather than trusting this file to
 * re-derive it afterwards.
 *
 * The approved-only test below is the second wall, not the first: the RLS on
 * changelog_highlights already returns approved rows only, and only to readers
 * scoped to the module. Both are kept, and the tests deliberately remove the
 * first one to prove this file does not depend on it.
 */
async function readStripEntries(
  supabase: Db,
  visible: string[]
): Promise<{ entry: EntryRow; highlight: HighlightRow }[]> {
  const picked: { entry: EntryRow; highlight: HighlightRow }[] = [];

  for (let page = 0; page < STRIP_MAX_PAGES && picked.length < STRIP_CAP; page++) {
    const rows = await readEntryPage(
      supabase,
      WRITEUP_BACKLOG_FLOOR,
      visible,
      page * STRIP_PAGE,
      STRIP_PAGE
    );
    if (rows.length === 0) break;

    const highlights = await readHighlights(
      supabase,
      rows.map((r) => r.sha)
    );
    const byKey = new Map(highlights.map((h) => [`${h.app_key}:${h.sha}`, h]));

    for (const entry of rows) {
      const highlight = byKey.get(`${entry.app_key}:${entry.sha}`);
      if (!highlight || highlight.status !== 'approved') continue;
      picked.push({ entry, highlight });
      if (picked.length >= STRIP_CAP) break;
    }

    // A short page is the end of the window, not a slow one.
    if (rows.length < STRIP_PAGE) break;
  }

  return picked;
}

async function readModules(supabase: Db, visible: string[]): Promise<Record<string, ChangelogModule>> {
  if (visible.length === 0) return {};
  const { data, error } = await supabase
    .from('changelog_modules')
    .select('key,label,perm,href')
    .in('key', visible);
  if (error) throw new Error(error.message);
  const out: Record<string, ChangelogModule> = {};
  for (const m of (data as { key: string; label: string; perm: string[] | null; href: string | null }[] | null) ?? []) {
    // NULL and [] must mean the same thing — platform-wide. The sibling route
    // normalises them the same way for the same reason.
    out[m.key] = { label: m.label, perm: m.perm && m.perm.length > 0 ? m.perm : null, href: m.href ?? null };
  }
  return out;
}

/** Does the caller hold the key that lets them write a highlight? */
async function canManage(supabase: Db): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc('user_has_permission', {
    permission_name: 'whats_new.highlights.manage',
  });
  if (error) return false;
  return data === true;
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

  const url = new URL(request.url);
  const wantsQueue = url.searchParams.get('queue') === '1';

  try {
    const visible = await readVisibleModules(supabase);

    if (!wantsQueue) {
      // ── the reader's strip ───────────────────────────────────────────────
      // The most recent approved write-ups, in the same newest-first order the
      // plain list below uses, from wherever in the backlog window they fall.
      // An empty array is still a normal answer — a reader scoped to nothing,
      // and the days before the writer has produced anything — and the strip
      // renders NOTHING for it rather than an empty box.
      const picked = await readStripEntries(supabase, visible);
      // Ruling 7: a reader who has already tapped "report" sees that state
      // rather than the link. `reports` is RLS-scoped to their own rows here,
      // so this set can only ever contain THIS reader's taps. Asked for the
      // handful of changes actually on the page rather than for the whole
      // window — the window is now a month and growing, and nothing off the
      // page has anywhere to show this state.
      const reports = await readReports(
        supabase,
        picked.map((p) => p.entry.sha)
      );
      const myReports = new Set(reports.map((r) => r.sha));
      const strip = picked.map(({ entry: e, highlight: h }) => {
        return {
          sha: e.sha,
          date: e.entry_date,
          kind: e.kind,
          module_key: e.module_key,
          headline: h.headline,
          affects: h.affects,
          action: h.action,
          // THE MITIGATION, and the reason these two fields are on the strip
          // payload at all. Most highlights are now written by a model and
          // published with nobody reading them first (Director ruling
          // 2026-09-13). The page's purpose is teaching people what they can
          // do, so a confident wrong claim here is worse than a terse
          // accurate one — and the only thing standing between the two is the
          // reader being able to see what actually shipped. The strip renders
          // `subject` beneath every highlight in smaller type. Removing it
          // from this payload silently removes that check.
          subject: e.subject,
          author: e.author,
          source: h.source,
          // Ruling 7's state, not its count. A reader is never shown how many
          // OTHER people flagged a write-up: that number is a super admin's
          // measure, and putting it on the card would turn a quiet check into
          // a pile-on signal.
          reported: myReports.has(e.sha),
        };
      });
      return NextResponse.json(
        // `from`, not `weekFrom`. The strip is no longer a week, and a field
        // still called weekFrom would have been a lie in the payload rather
        // than merely a stale name. The queue below keeps `weekFrom`, where it
        // is still exactly what it says.
        { from: WRITEUP_BACKLOG_FLOOR, highlights: strip },
        { headers: { 'Cache-Control': 'private, no-cache, must-revalidate' } }
      );
    }

    // ── the approver's queue ──────────────────────────────────────────────
    // Still a week. This is one person's workload for the week, not a reader's
    // page, and widening it would hand them the whole backlog at once.
    const from = weekStart(istToday());
    const entries = await readWeekEntries(supabase, from, visible);
    const highlights = await readHighlights(
      supabase,
      entries.map((e) => e.sha)
    );
    const reports = await readReports(
      supabase,
      entries.map((e) => e.sha)
    );

    if (!(await canManage(supabase))) {
      // An explicit refusal that says why, never a silent empty 200 — a
      // permission miss that renders nothing is the bug this team keeps being
      // bitten by (CLAUDE.md #27).
      return NextResponse.json(
        {
          error:
            'You do not have access to the What’s New highlights queue. It needs the ' +
            'whats_new.highlights.manage permission. Ask a super admin in Role Management.',
        },
        { status: 403 }
      );
    }

    // Ruling 7's deliverable: how many DISTINCT readers said each write-up is
    // wrong. Distinct by construction — the UNIQUE (app_key, sha, reported_by)
    // in 20261207090000 means one row per reader, so this is a plain tally and
    // not a de-duplication this file could get wrong.
    const reportCounts: Record<string, number> = {};
    for (const r of reports) {
      reportCounts[r.sha] = (reportCounts[r.sha] ?? 0) + 1;
    }

    const modules = await readModules(supabase, visible);
    // Only a SKIP takes an entry out of the queue. An approved highlight stays,
    // carrying its saved text, so the person who wrote it can correct it or set
    // it back to draft to pull it off the page — a write-up that cannot be
    // edited after it goes live is one nobody dares approve. A draft stays for
    // the obvious reason: it is work in progress, not an answer.
    const decided = new Set(
      highlights.filter((h) => h.status === 'skipped').map((h) => h.sha)
    );
    const candidates: HighlightCandidate[] = selectHighlights(entries.map(toEntry), modules, {
      from,
      alreadyDecided: decided,
    });

    return NextResponse.json(
      {
        weekFrom: from,
        // Everything already written this week, so the screen can show work in
        // progress and let an approved one be edited or withdrawn.
        saved: highlights.map((h) => ({
          sha: h.sha,
          headline: h.headline,
          affects: h.affects,
          action: h.action,
          status: h.status,
          selection_reason: h.selection_reason,
          // So the queue can show which rows a model wrote — those are the ones
          // worth a person's attention, since nothing else has read them.
          source: h.source,
          // Ruling 7. Zero is the normal answer and is sent explicitly, so the
          // screen can say "nobody has flagged this" rather than leaving the
          // reader of the queue to guess whether the number is missing or nil.
          reports: reportCounts[h.sha] ?? 0,
        })),
        candidates: candidates.map((c) => ({
          sha: c.entry.h,
          date: c.entry.d,
          kind: c.entry.t,
          module_key: c.entry.m,
          module_label: modules[c.entry.m]?.label ?? c.entry.m,
          subject: c.entry.s,
          pr_number: c.entry.p ?? null,
          breaking: c.entry.b === 1,
          score: c.score,
          reason: c.reason,
          suggestedAffects: c.suggestedAffects,
        })),
      },
      { headers: { 'Cache-Control': 'private, no-cache, must-revalidate' } }
    );
  } catch (error) {
    // Kept in production: "no highlights this week" and "the read failed" look
    // identical from the page, and only one of them is worth waking someone for.
    console.error('[whats-new/highlights] read failed', { queue: wantsQueue, error });
    return NextResponse.json({ error: 'The highlights could not be read.' }, { status: 500 });
  }
}

const SHA_RE = /^[0-9a-fA-F]{4,64}$/;
const STATUSES = ['draft', 'approved', 'skipped'] as const;

/** Trimmed, or null when there is nothing but whitespace. */
function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Sign in to write a highlight.' }, { status: 401 });
  }

  // The gate, server-side and before anything is read from the body. The RLS
  // policy on changelog_highlights re-checks the same key, so this is the
  // explanation rather than the lock — but a refusal a person can read is the
  // whole point of checking it here as well.
  if (!(await canManage(supabase))) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Only someone who manages What’s New highlights can write one ' +
          '(whats_new.highlights.manage). Nothing was saved.',
      },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'The request body was not readable.' }, { status: 400 });
  }

  const sha = typeof body?.sha === 'string' ? body.sha : '';
  if (!SHA_RE.test(sha)) {
    return NextResponse.json({ ok: false, error: 'A change id is required.' }, { status: 400 });
  }
  const status = body?.status;
  if (!(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { ok: false, error: `status must be one of: ${STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const headline = text(body?.headline);
  const affects = text(body?.affects);
  const action = text(body?.action);

  // The same rule the database holds as a CHECK, restated here so the approver
  // gets a sentence instead of a constraint name. Both are kept: this one is
  // the message, that one is the guarantee.
  if (status === 'approved' && (!headline || !affects || !action)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'An approved highlight needs all three lines filled in: the headline, who it ' +
          'affects, and what you can do now. Nothing was saved.',
      },
      { status: 400 }
    );
  }

  // `app_key` is not taken from the body. One application writes here today and
  // the key is what the row is joined on; letting a caller name it would let
  // them attach a highlight to another application's commit.
  const appKey = 'myjkkn';
  const reviewed = status !== 'draft';

  const { error } = await (supabase as any)
    .from('changelog_highlights')
    .upsert(
      {
        app_key: appKey,
        sha,
        headline,
        affects,
        action,
        status,
        selection_reason: text(body?.selection_reason),
        // A person writing through this route OWNS the row from now on, even if
        // a model wrote it first. This is not bookkeeping: the review-stamp
        // CHECK (20261203180000) requires an 'ai' row to carry NO reviewer and a
        // 'human' row to carry one, so approving a machine-written row without
        // flipping this would be rejected by the database. Setting it here is
        // also the honest record — from this write on, a person has read it.
        source: 'human',
        // The review stamp CHECK requires both together, and requires BOTH to be
        // absent while it is still a draft — so a row sent back to draft loses
        // its stamp rather than keeping a stale one.
        reviewed_by: reviewed ? user.id : null,
        reviewed_at: reviewed ? new Date().toISOString() : null,
      },
      { onConflict: 'app_key,sha' }
    );

  if (error) {
    // A foreign-key violation here means the entry is not in changelog_entries —
    // the commonest real cause is a sync that pruned it between the queue being
    // drawn and Approve being pressed.
    console.error('[whats-new/highlights] write failed', { sha, status, error });
    const missing = typeof error.code === 'string' && error.code === '23503';
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? 'That change is no longer in the changelog, so nothing was saved. Reload the queue.'
          : 'The highlight could not be saved.',
      },
      { status: missing ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true, sha, status });
}
