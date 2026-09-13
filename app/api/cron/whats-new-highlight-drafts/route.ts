// =====================================================================
// What's New — the plain-English highlight writer: the cron.
// =====================================================================
// Turns the developer's commit subject into the three lines a Principal can
// read, for the handful of changes each week that actually affect someone.
//
// THE COMPLAINT THIS ANSWERS (Director, 2026-09-12): /whats-new "seems to be
// only for developers and not understandable by the actual users who are non
// developers and would like to know how it impacts them and how they can take
// advantage of the new changes just like all product companies."
//
// 20261203120000 built the table, the queue and the strip and left the WRITING
// to a person. Nobody wrote anything — changelog_highlights held 0 rows on
// 2026-09-13, and the strip's reader policy is `status = 'approved'`, so it
// rendered nothing and always would. This route is the missing writer.
//
// ── FLOW (one route, re-entrant, idempotent — mirrors aipulse-domain-starter)
//   COLLECT first: drain done ai_jobs, parse, file each as a changelog_highlights
//     row. fn_ai_collect_claim stamps delivered_at under FOR UPDATE SKIP LOCKED,
//     so a result is filed exactly once even if two runs overlap.
//   SUBMIT next: run the SAME deterministic selection the approver's queue uses
//     (lib/changelog/highlights.ts — this route does not re-invent picking), and
//     enqueue one Max-lane job per candidate that has no highlight row yet.
//
// ── PUBLISHED UNREVIEWED, AND WHY THAT IS NOT A SHORTCUT
// The Director reversed the earlier "a person writes and approves" clause on
// 2026-09-13: highlights publish unreviewed, no approval queue, because he wants
// zero ongoing work. He was shown the accuracy risk and chose this. So a parsed
// draft is filed with status = 'approved' and source = 'ai', carrying NO review
// stamp — nobody reviewed it, and the constraint in 20261203180000 makes
// claiming otherwise unrepresentable.
//
// Two things hold the risk down, and both are load-bearing:
//   1. THE ORIGINAL DEVELOPER LINE RENDERS BENEATH EVERY HIGHLIGHT, in smaller
//      type (components/changelog/highlights-strip.tsx). Unreviewed text about
//      ten applications now reaches every reader, on a page whose purpose is
//      teaching people what they can do; the original line keeps every claim
//      checkable against what actually shipped, by the reader, as they read it.
//   2. A super admin can still pull a bad line — the queue UI and every write
//      path from 20261203120000 are untouched.
//
// ── A REFUSAL IS A RESULT
// Most of what ships is invisible to a reader. The prompt tells the model to
// say so rather than invent an effect, and this route files that answer as
// 'skipped' — which takes the entry out of selection permanently, so the lane
// is never asked about it again. Publishing nothing is the correct outcome for
// most commits; a run that files more skips than highlights is working.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Created: 2026-09-13.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  enqueueJobsLane,
  collectJobsLane,
  type JobsLaneEnqueueResult,
} from '@/lib/services/platform/ai-jobs-lane';
import { selectHighlights, weekStart } from '@/lib/changelog/highlights';
import {
  buildHighlightPrompt,
  highlightDedupeKey,
  isRefusal,
  parseHighlightResult,
} from '@/lib/changelog/highlight-prompt';
import type { ChangelogEntry, ChangelogModule } from '@/lib/changelog/types';

const JOB_TYPE = 'whats_new.highlight_draft';

/**
 * Max outstanding jobs this route will hold on the lane.
 *
 * WEEKLY_CAP is 10, so a settled week needs far less than this. The headroom is
 * for the FIRST run against a backlog and for a week where many candidates
 * refuse: a refusal costs a round trip and frees the slot for the next entry.
 * ONE seat drains this lane for every consumer on it (PDE, SCF, OneMark,
 * AI Pulse), and fn_ai_claim has no job_type filter — lane is the only
 * isolation — so a number this small is a courtesy to them, not a limit this
 * feature needs.
 */
const CAP = 20;

/** PostgREST truncates at db-max-rows SILENTLY. A week held 222 entries on
 *  2026-09-12; this has the same four-times headroom the sibling route documents. */
const WEEK_ROWS = 1000;

type Admin = ReturnType<typeof createServiceRoleClient>;

/** Stashed in payload._ctx so the collect pass files the row without re-querying.
 *  The sha lives HERE, not in the prompt — it is the join key, not the question. */
type DraftContext = {
  app_key: string;
  sha: string;
  /** carried only so a log line can name the change a human recognises */
  subject: string;
};

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

/** Today in IST, as YYYY-MM-DD — the timezone entry dates were recorded in. */
function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const admin = createServiceRoleClient();

  // `?sha=` writes up ONE named change and returns its text in the response.
  // This is the end-to-end proof hook: a registered job type that nothing ever
  // runs verifies perfectly and does nothing, which is the failure this whole
  // route exists to avoid making. It selects nothing and enqueues only that one.
  const onlySha = request.nextUrl.searchParams.get('sha');

  let published = 0;
  let skippedNoEffect = 0;
  let unparsed = 0;
  let fileFailed = 0;
  let enqueued = 0;
  let inFlight = 0;
  let candidatesTotal = 0;
  const drafted: Array<Record<string, unknown>> = [];
  let alert: string | null = null;

  // ── COLLECT: drain done jobs and file what came back. ──────────────────────
  try {
    const items = await collectJobsLane(admin, [JOB_TYPE], CAP);
    for (const item of items) {
      const ctx = item.context as unknown as DraftContext;
      if (!ctx?.sha) {
        unparsed++;
        continue;
      }
      const block = item.message?.content?.find((b) => b.type === 'text');
      const raw = block && 'text' in block ? (block.text as string) : null;
      const parsed = parseHighlightResult(raw);

      if (!parsed) {
        // Nothing is filed, so the entry re-qualifies on the next run. A
        // half-read answer must never become a published sentence: there is no
        // approval step left to catch it.
        unparsed++;
        console.warn(`[cron/whats-new-highlight-drafts] unparseable result for ${ctx.sha}`);
        continue;
      }

      const refused = isRefusal(parsed);
      const row = {
        app_key: ctx.app_key ?? 'myjkkn',
        sha: ctx.sha,
        headline: refused ? null : parsed.headline,
        affects: refused ? null : parsed.affects,
        action: refused ? null : parsed.action,
        // A refusal is retired as 'skipped' — kept rather than deleted so
        // selection never offers the same entry again, which is exactly what
        // that status is for.
        status: refused ? 'skipped' : 'approved',
        selection_reason: refused
          ? `Written up automatically; no user-visible effect. ${parsed.reason}`
          : 'Written up automatically from the shipped change.',
        source: 'ai',
        // No review stamp. Nobody reviewed it, and the CHECK in
        // 20261203180000 requires an 'ai' row to carry neither column.
        reviewed_by: null,
        reviewed_at: null,
      };

      const { error } = await (admin as any)
        .from('changelog_highlights')
        .upsert(row, { onConflict: 'app_key,sha' });

      if (error) {
        // 23503 = the entry left changelog_entries between enqueue and collect
        // (the sync prunes). Nothing to write up any more; not worth alerting.
        fileFailed++;
        console.error(
          `[cron/whats-new-highlight-drafts] file failed for ${ctx.sha}: ${error.message}`
        );
        continue;
      }
      if (refused) skippedNoEffect++;
      else published++;
      drafted.push(
        refused
          ? { sha: ctx.sha, subject: ctx.subject, status: 'skipped', reason: parsed.reason }
          : {
              sha: ctx.sha,
              subject: ctx.subject,
              status: 'approved',
              headline: parsed.headline,
              affects: parsed.affects,
              action: parsed.action,
            }
      );
    }
  } catch (e) {
    alert = 'collect phase threw — results may still be waiting';
    console.error('[cron/whats-new-highlight-drafts] collect failed:', e);
  }

  // ── SUBMIT: enqueue one job per candidate with no highlight row yet. ───────
  const from = weekStart(istToday());
  try {
    let rows: EntryRow[] = [];

    if (onlySha) {
      const { data, error } = await admin
        .from('changelog_entries')
        .select('sha,app_key,entry_date,kind,module_key,subject,author,pr_number,breaking')
        .eq('sha', onlySha)
        .eq('hidden', false)
        .limit(1);
      if (error) throw new Error(error.message);
      rows = (data as EntryRow[] | null) ?? [];
      if (rows.length === 0) alert = `no visible changelog entry for sha ${onlySha}`;
    } else {
      const { data, error } = await admin
        .from('changelog_entries')
        .select('sha,app_key,entry_date,kind,module_key,subject,author,pr_number,breaking')
        .eq('hidden', false)
        .gte('entry_date', from)
        .order('entry_date', { ascending: false })
        .order('ordinal', { ascending: true })
        .order('app_key', { ascending: true })
        .order('sha', { ascending: false })
        .range(0, WEEK_ROWS - 1);
      if (error) throw new Error(error.message);
      rows = (data as EntryRow[] | null) ?? [];
    }

    if (rows.length > 0) {
      // The module LABELS. This is the "send names, not ids" rule made
      // structural: the prompt is built from `label`, and `module_key` never
      // reaches the model.
      const keys = [...new Set(rows.map((r) => r.module_key))];
      const { data: modRows, error: modErr } = await admin
        .from('changelog_modules')
        .select('key,label,perm,href')
        .in('key', keys);
      if (modErr) throw new Error(modErr.message);
      const modules: Record<string, ChangelogModule> = {};
      for (const m of (modRows as
        | { key: string; label: string; perm: string[] | null; href: string | null }[]
        | null) ?? []) {
        // NULL and [] both mean platform-wide, exactly as the read routes
        // normalise them. Drifting from that here would change which entries
        // selection considers reachable.
        modules[m.key] = {
          label: m.label,
          perm: m.perm && m.perm.length > 0 ? m.perm : null,
          href: m.href ?? null,
        };
      }

      // Every sha that already HAS a highlight row, in any status. An approved
      // one is written; a skipped one was refused; a draft is a human's work in
      // progress the writer must not overwrite.
      const { data: existing, error: exErr } = await admin
        .from('changelog_highlights')
        .select('sha')
        .in('sha', rows.map((r) => r.sha));
      if (exErr) throw new Error(exErr.message);
      const written = new Set(
        ((existing as { sha: string }[] | null) ?? []).map((h) => h.sha)
      );

      const candidates = onlySha
        ? // The proof hook bypasses scoring on purpose: it must be able to write
          // up a NAMED change, including one selection would rank below the cap.
          rows.filter((r) => !written.has(r.sha)).map((r) => ({ entry: toEntry(r) }))
        : selectHighlights(rows.map(toEntry), modules, { from, alreadyDecided: written });
      candidatesTotal = candidates.length;

      const bySha = new Map(rows.map((r) => [r.sha, r]));
      for (const c of candidates) {
        if (enqueued + inFlight >= CAP) break;
        const row = bySha.get(c.entry.h);
        if (!row) continue;
        const mod = modules[row.module_key];
        const ctx: DraftContext = {
          app_key: row.app_key,
          sha: row.sha,
          subject: row.subject,
        };
        const res = await enqueueJobsLane(admin, {
          jobType: JOB_TYPE,
          prompt: buildHighlightPrompt({
            subject: row.subject,
            moduleLabel: mod?.label ?? row.module_key,
            moduleHref: mod?.href ?? null,
            author: row.author,
            kind: row.kind,
            breaking: row.breaking,
          }),
          context: ctx as unknown as Record<string, unknown>,
          dedupeKey: highlightDedupeKey(row.app_key, row.sha),
        });
        if (res.ok) {
          enqueued++;
          continue;
        }
        // This repo compiles with strictNullChecks OFF, and without it TypeScript
        // will not discriminate a union on a boolean literal — `res.reason` is an
        // error inside this branch even though `res.ok` is false here. The house
        // workaround (aipulse-domain-starter) casts to `{ reason?: string }`,
        // which compiles but throws away the literal union and would let a typo
        // like 'in_flght' pass every comparison below. Extract keeps it: the cast
        // names exactly the failure variant, so `reason` stays the four-value
        // union the compiler checks each `===` against.
        const fail = res as Extract<JobsLaneEnqueueResult, { ok: false }>;
        if (fail.reason === 'in_flight') {
          inFlight++;
          continue;
        }
        console.warn(
          `[cron/whats-new-highlight-drafts] enqueue failed for ${row.sha} (${fail.reason}): ${fail.error ?? ''}`
        );
        if (fail.reason === 'unknown_type') {
          alert =
            'job type whats_new.highlight_draft is not registered or is disabled — ' +
            'migration 20261203180000 has not been applied';
        } else if (fail.reason === 'no_seat') {
          alert = 'no seat owner configured for the max lane — nothing can be drafted';
        }
      }
    }
  } catch (e) {
    alert = 'submit phase threw — no changes were enqueued this run';
    console.error('[cron/whats-new-highlight-drafts] submit failed:', e);
  }

  return NextResponse.json({
    ok: true,
    week_from: from,
    only_sha: onlySha,
    // What this run FILED (the previous run's jobs coming home).
    published,
    skipped_no_effect: skippedNoEffect,
    unparsed,
    file_failed: fileFailed,
    // What this run SENT (lands on the next run).
    candidates_total: candidatesTotal,
    enqueued,
    in_flight: inFlight,
    cap: CAP,
    // The actual text filed this run — so a person reading the cron's output
    // can see what went on the page without opening the database.
    drafted,
    alert,
    elapsed_ms: Date.now() - started,
  });
}
