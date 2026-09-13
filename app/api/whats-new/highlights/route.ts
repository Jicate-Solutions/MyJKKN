// app/api/whats-new/highlights/route.ts
//
// The weekly highlights strip, and the queue behind it.
//
//   GET  /api/whats-new/highlights           → this week's APPROVED highlights,
//                                              for any signed-in reader.
//   GET  /api/whats-new/highlights?queue=1   → the approver's queue: this week's
//                                              candidates, each with the sentence
//                                              saying why it was picked, merged
//                                              with whatever has been written so
//                                              far. Needs the manage permission.
//   PUT  /api/whats-new/highlights           → save, approve or skip ONE
//                                              highlight. Needs the manage
//                                              permission.
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
import { selectHighlights, weekStart, type HighlightCandidate } from '@/lib/changelog/highlights';
import type { ChangelogEntry, ChangelogModule } from '@/lib/changelog/types';

export const dynamic = 'force-dynamic';

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * PostgREST's default `db-max-rows` is 1,000 and it truncates SILENTLY. One
 * week held 222 user-facing entries on 2026-09-12, so this has four times the
 * headroom it needs — but a week that somehow exceeded it would drop entries
 * from the QUEUE (never from the reader's strip, which is driven by the
 * highlight rows, not by this list), and the queue would simply offer fewer
 * candidates. Stated so a future reader knows which way it fails.
 */
const WEEK_ROWS = 1000;

/** `.in()` travels in the URL. Chunked so a busy week cannot build one too long. */
const IN_CHUNK = 200;

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

/** This week's entries, scoped to the caller's modules. */
async function readWeekEntries(supabase: Db, from: string, visible: string[]): Promise<EntryRow[]> {
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
    .range(0, WEEK_ROWS - 1);
  if (error) throw new Error(error.message);
  return (data as EntryRow[] | null) ?? [];
}

/** The highlight rows for a set of entries. RLS decides which of them come back. */
async function readHighlights(supabase: Db, shas: string[]): Promise<HighlightRow[]> {
  const out: HighlightRow[] = [];
  for (let i = 0; i < shas.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from('changelog_highlights')
      .select('app_key,sha,headline,affects,action,status,selection_reason')
      .in('sha', shas.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    out.push(...((data as HighlightRow[] | null) ?? []));
  }
  return out;
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
  const from = weekStart(istToday());

  try {
    const visible = await readVisibleModules(supabase);
    const entries = await readWeekEntries(supabase, from, visible);
    const highlights = await readHighlights(
      supabase,
      entries.map((e) => e.sha)
    );
    const byKey = new Map(highlights.map((h) => [`${h.app_key}:${h.sha}`, h]));

    if (!wantsQueue) {
      // ── the reader's strip ───────────────────────────────────────────────
      // Only rows a person approved, in the same newest-first order the plain
      // list below uses. An empty array is the normal answer for a week nobody
      // wrote up, and the strip renders NOTHING for it rather than an empty box.
      const strip = entries
        .map((e) => {
          const h = byKey.get(`${e.app_key}:${e.sha}`);
          if (!h || h.status !== 'approved') return null;
          return {
            sha: e.sha,
            date: e.entry_date,
            kind: e.kind,
            module_key: e.module_key,
            headline: h.headline,
            affects: h.affects,
            action: h.action,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      return NextResponse.json(
        { weekFrom: from, highlights: strip },
        { headers: { 'Cache-Control': 'private, no-cache, must-revalidate' } }
      );
    }

    // ── the approver's queue ──────────────────────────────────────────────
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
