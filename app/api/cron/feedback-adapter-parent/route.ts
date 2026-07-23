export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Feedback adapter: pp_feedback → feedback_events.
 *
 * Normalizes each pp_feedback row (a parent's rating + optional message)
 * into the universal spine. Pure capture — no AI here; the daily classify
 * routine (Claude subscription) fills the ai_* fields later.
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

interface ParentFeedbackRow {
  id: string;
  institutions_id: string | null;
  parent_account_id: string | null;
  type: string | null;
  rating: number | null;
  message: string | null;
  status: string | null;
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
    .from('pp_feedback')
    .select(
      'id, institutions_id, parent_account_id, type, rating, message, status, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = (data as ParentFeedbackRow[]) ?? [];
  const events: FeedbackEventInput[] = rows.map((r) => ({
    source: 'parent',
    source_ref: r.id,
    // NOTE: source column is `institutions_id` (misspelled), spine column is `institution_id`.
    institution_id: r.institutions_id,
    actor_type: 'parent',
    actor_ref: r.parent_account_id,
    target_type: 'institution',
    target_ref: r.institutions_id,
    event_type: 'rating',
    content: r.message && r.message.trim().length > 0 ? r.message.trim() : null,
    rating: r.rating ?? null,
    raw: {
      type: r.type,
      status: r.status,
    },
    occurred_at: r.created_at ?? undefined,
  }));

  const result = await ingestFeedbackEvents(events);
  return NextResponse.json({ success: !result.error, source: 'parent', ...result });
}
