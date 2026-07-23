/**
 * Feedback Spine — ingestion service.
 *
 * The single write path into public.feedback_events. Every source adapter calls
 * ingestFeedbackEvents() with normalized FeedbackEventInput[]; this dedups on
 * (source, source_ref) so re-running an adapter is idempotent (no duplicate
 * events). Runs server-side under the service role (adapters are crons).
 *
 * Returns the number of NEW rows inserted (existing source_refs are ignored).
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { FeedbackEventInput } from '@/lib/types/feedback-spine';

export interface IngestResult {
  received: number;
  inserted: number;
  error?: string;
}

export async function ingestFeedbackEvents(
  events: FeedbackEventInput[]
): Promise<IngestResult> {
  if (!events || events.length === 0) return { received: 0, inserted: 0 };

  const db = createServiceRoleClient();

  // Normalize → rows. raw defaults to {}; occurred_at left to the DB default
  // when the adapter doesn't supply it.
  const rows = events.map((e) => ({
    source: e.source,
    source_ref: e.source_ref,
    institution_id: e.institution_id ?? null,
    actor_type: e.actor_type ?? null,
    actor_ref: e.actor_ref ?? null,
    target_type: e.target_type ?? null,
    target_ref: e.target_ref ?? null,
    event_type: e.event_type,
    content: e.content ?? null,
    rating: e.rating ?? null,
    raw: e.raw ?? {},
    ...(e.occurred_at ? { occurred_at: e.occurred_at } : {}),
  }));

  // upsert + ignoreDuplicates → idempotent on the (source, source_ref) unique
  // constraint. `.select('id')` returns only the rows actually inserted.
  const { data, error } = await db
    .from('feedback_events')
    .upsert(rows, { onConflict: 'source,source_ref', ignoreDuplicates: true })
    .select('id');

  if (error) {
    return { received: events.length, inserted: 0, error: error.message };
  }
  return { received: events.length, inserted: data?.length ?? 0 };
}
