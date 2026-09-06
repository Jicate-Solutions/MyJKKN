export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Feedback adapter: ig_dm_messages → feedback_events.
 *
 * Normalizes each INBOUND Instagram DM (a follower messaging one of our IG
 * accounts) into the universal spine. Outbound rows (direction='out') are OUR
 * replies, not audience feedback, so they are filtered out. Media-only DMs
 * (empty text) carry nothing to classify and are skipped. Pure capture — no AI
 * here; the daily classify routine (Claude subscription) fills the ai_* fields
 * later.
 *
 * Idempotent: ingest dedups on (source, source_ref), so re-running never
 * duplicates. Auth: CRON_SECRET via ?secret= query or Authorization: Bearer
 * (matches the project's other cron routes).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ingestFeedbackEvents } from '@/lib/services/feedback/feedback-ingest';
import type { FeedbackEventInput } from '@/lib/types/feedback-spine';

interface IgDmMessageRow {
  id: string;
  conversation_id: string | null;
  direction: string | null;
  text: string | null;
  media: unknown;
  mid: string | null;
  sent_at: string | null;
  created_at: string | null;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('ig_dm_messages')
    .select('id, conversation_id, direction, text, media, mid, sent_at, created_at')
    // Inbound only — outbound rows are our own replies, not audience feedback.
    .eq('direction', 'in')
    .order('sent_at', { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = (data as IgDmMessageRow[]) ?? [];
  const events: FeedbackEventInput[] = rows
    // Skip media-only DMs (empty text) — nothing to classify.
    .filter((r) => !!r.text && r.text.trim().length > 0)
    .map((r) => ({
      source: 'ig_dm',
      source_ref: r.id,
      // conversation_id identifies the person on the other end of the DM.
      actor_type: 'ig_user',
      actor_ref: r.conversation_id,
      target_type: 'ig_account',
      target_ref: null,
      event_type: 'dm',
      content: r.text && r.text.trim().length > 0 ? r.text.trim() : null,
      rating: null,
      raw: {
        conversation_id: r.conversation_id,
        mid: r.mid,
        has_media: !!r.media,
      },
      occurred_at: r.sent_at ?? r.created_at ?? undefined,
    }));

  const result = await ingestFeedbackEvents(events);
  return NextResponse.json({ success: !result.error, source: 'ig_dm', ...result });
}
