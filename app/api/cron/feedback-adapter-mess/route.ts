export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Feedback adapter: mess_feedback → feedback_events.
 *
 * Normalizes each mess_feedback row (a learner's per-meal caterer rating +
 * optional comments) into the universal spine. Pure capture — no AI here;
 * the daily classify routine (Claude subscription) fills the ai_* fields later.
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

interface MessFeedbackRow {
  id: string;
  institution_id: string | null;
  learner_id: string | null;
  caterer_id: string | null;
  date: string | null;
  meal_type: string | null;
  taste_rating: number | null;
  hygiene_rating: number | null;
  quantity_rating: number | null;
  variety_rating: number | null;
  overall_rating: number | null;
  comments: string | null;
  photo_urls: unknown;
  is_complaint: boolean | null;
  complaint_ticket_id: string | null;
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
    .from('mess_feedback')
    .select(
      'id, institution_id, learner_id, caterer_id, date, meal_type, taste_rating, hygiene_rating, quantity_rating, variety_rating, overall_rating, comments, photo_urls, is_complaint, complaint_ticket_id, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = (data as MessFeedbackRow[]) ?? [];
  const events: FeedbackEventInput[] = rows.map((r) => ({
    source: 'mess',
    source_ref: r.id,
    institution_id: r.institution_id,
    actor_type: 'learner',
    actor_ref: r.learner_id,
    target_type: 'mess',
    target_ref: r.caterer_id,
    event_type: r.is_complaint ? 'comment' : 'rating',
    // Only text is classifiable; pure numeric-rating rows have no content.
    content: r.comments && r.comments.trim().length > 0 ? r.comments.trim() : null,
    rating: r.overall_rating ?? null,
    raw: {
      meal_type: r.meal_type,
      date: r.date,
      taste_rating: r.taste_rating,
      hygiene_rating: r.hygiene_rating,
      quantity_rating: r.quantity_rating,
      variety_rating: r.variety_rating,
      is_complaint: r.is_complaint,
      complaint_ticket_id: r.complaint_ticket_id,
      photo_urls: r.photo_urls,
    },
    occurred_at: r.created_at ?? undefined,
  }));

  const result = await ingestFeedbackEvents(events);
  return NextResponse.json({ success: !result.error, source: 'mess', ...result });
}
