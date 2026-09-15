export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron: classify unprocessed feedback_events.
 *
 * Works the queue from BOTH ends until its time budget is spent: odd chunks
 * newest-first (fresh feedback stays fast), even chunks oldest-first (the
 * backlog actually drains). One-directional newest-first ordering is why
 * 49,804 events sat unclassified on 2026-09-14 with the oldest reaching back
 * to 18 June — at ~679 arriving a day against ~82 classified, new rows always
 * outranked the old ones, so the old ones were not slow, they were
 * unreachable. Alternating guarantees both ends make progress.
 *
 * Idempotent: only ever touches rows with ai_processed_at IS NULL, so
 * re-running is safe and a failed row is retried by a later run.
 *
 * Auth: a cron secret (Authorization: Bearer $CRON_SECRET) or Vercel's
 * x-vercel-cron header. Never callable anonymously.
 */

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { classifyFeedback } from '@/lib/services/feedback/feedback-classify';

/** Rows fetched per chunk. Kept small so one slow chunk cannot overrun the budget. */
const CHUNK = 25;

/**
 * Stop starting new work after this much wall time. maxDuration is 300s; the
 * gap absorbs the in-flight row plus its write, so the run returns its tally
 * instead of being killed mid-chunk with nothing reported.
 */
const TIME_BUDGET_MS = 240_000;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth === `Bearer ${secret}`) return true;
  // Vercel Cron sets this header on scheduled invocations.
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceRoleClient();
  const startedAt = Date.now();

  let ok = 0;
  let failed = 0;
  let fetched = 0;
  let fromNewest = 0;
  let fromOldest = 0;
  let chunks = 0;
  let stoppedBecause = 'queue empty';

  /**
   * Rows attempted in THIS run. A row whose classify call throws keeps
   * ai_processed_at NULL by design, so without this it would be re-fetched by
   * every later chunk and a handful of poison rows would consume the whole run.
   */
  const attempted = new Set<string>();

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    // Alternate ends: even chunks take the newest, odd chunks take the oldest.
    const newestFirst = chunks % 2 === 0;

    const { data, error } = await db
      .from('feedback_events')
      .select('id, content')
      .is('ai_processed_at', null)
      .not('content', 'is', null)
      .order('occurred_at', { ascending: !newestFirst })
      .limit(CHUNK);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []).filter((r) => !attempted.has(r.id)) as {
      id: string;
      content: string;
    }[];

    if (rows.length === 0) {
      // Either the queue is drained, or everything this end still offers was
      // already tried and failed in this run. Both mean: stop, report, retry later.
      stoppedBecause = (data ?? []).length === 0 ? 'queue empty' : 'only already-attempted rows left';
      break;
    }

    chunks++;
    fetched += rows.length;
    if (newestFirst) fromNewest += rows.length;
    else fromOldest += rows.length;

    // Sequential on purpose — keeps Anthropic RPS modest.
    for (const row of rows) {
      attempted.add(row.id);
      try {
        const c = await classifyFeedback(row.content);
        // Stamped per row, not once per run: a whole run sharing one timestamp
        // makes rows indistinguishable from runs, which is what hid the
        // throughput shortfall for three months.
        const nowIso = new Date().toISOString();
        const { error: upErr } = await db
          .from('feedback_events')
          .update({
            ai_sentiment: c.sentiment,
            ai_intent: c.intent,
            ai_topic: c.topic,
            ai_draft_reply: c.draft_reply,
            ai_model: c.model,
            ai_processed_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', row.id);
        if (upErr) failed++;
        else ok++;
      } catch {
        failed++;
        // Leave ai_processed_at NULL so a later run retries this event.
      }

      if (Date.now() - startedAt >= TIME_BUDGET_MS) {
        stoppedBecause = 'time budget spent';
        break;
      }
    }
  }

  if (chunks > 0 && stoppedBecause === 'queue empty' && Date.now() - startedAt >= TIME_BUDGET_MS) {
    stoppedBecause = 'time budget spent';
  }

  const { count: remaining } = await db
    .from('feedback_events')
    .select('id', { count: 'exact', head: true })
    .is('ai_processed_at', null)
    .not('content', 'is', null);

  return NextResponse.json({
    success: true,
    fetched,
    classified: ok,
    failed,
    from_newest: fromNewest,
    from_oldest: fromOldest,
    chunks,
    elapsed_ms: Date.now() - startedAt,
    stopped_because: stoppedBecause,
    remaining,
  });
}
