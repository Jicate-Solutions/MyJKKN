export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron: classify unprocessed feedback_events.
 *
 * Pulls up to BATCH events awaiting classification (ai_processed_at IS NULL,
 * content present), runs the AI-classify worker on each, and writes back
 * sentiment/intent/topic/draft_reply. Idempotent + self-throttling: only ever
 * touches unprocessed rows, so re-running is safe and it drains the queue over
 * successive runs.
 *
 * Auth: a cron secret (Authorization: Bearer $CRON_SECRET) or Vercel's
 * x-vercel-cron header. Never callable anonymously.
 */

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { classifyFeedback } from '@/lib/services/feedback/feedback-classify';

const BATCH = 25;

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
  const { data: pending, error } = await db
    .from('feedback_events')
    .select('id, content')
    .is('ai_processed_at', null)
    .not('content', 'is', null)
    .order('occurred_at', { ascending: false })
    .limit(BATCH);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ success: true, processed: 0, message: 'queue empty' });
  }

  let ok = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();

  // Small sequential loop — keeps Anthropic RPS modest and stays within maxDuration.
  for (const row of pending as { id: string; content: string }[]) {
    try {
      const c = await classifyFeedback(row.content);
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
  }

  return NextResponse.json({
    success: true,
    fetched: pending.length,
    classified: ok,
    failed,
    remaining_hint: pending.length === BATCH ? 'more may remain — run again' : 'drained',
  });
}
