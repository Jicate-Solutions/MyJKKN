/**
 * lib/webhooks/meta/page-dispatcher.ts
 *
 * Meta allows only ONE callback URL per Page product. Our App-level Page
 * subscription points at `/api/webhooks/meta/messenger`, which means
 * `leadgen`, `feed`, etc. events all arrive there too — they were
 * previously dropped because the messenger route only iterated
 * `entry.messaging`.
 *
 * This dispatcher inspects each entry's shape and routes:
 *
 *   - `entry.changes[].field === "leadgen"` → leadgen-handler (per-entry)
 *   - `entry.messaging` array present       → messenger-handler
 *
 * Other `changes[].field` values (feed, mention, etc.) are logged for
 * observability but currently no-op. Add a branch here when those
 * surfaces are implemented.
 *
 * Returns the list of dispatched event types per entry (e.g.
 * `["leadgen", "messenger"]`) so callers can log + assert in tests.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import { handleMessengerEvent } from './messenger-handler';
import { handleLeadgenEntry } from './leadgen-handler';
import type { MessengerEntry } from '@/lib/messenger/types';
import type {
  FbLeadgenWebhookPayload,
  FbLeadgenWebhookValue,
} from '@/lib/meta/lead-ads-types';

export interface DispatchResult {
  ok: true;
  dispatched: string[];
  leadgenValues: FbLeadgenWebhookValue[];
}

export async function dispatchPageWebhook(
  payload: unknown,
  supabase: SupabaseClient
): Promise<DispatchResult> {
  const dispatched: string[] = [];
  const leadgenValues: FbLeadgenWebhookValue[] = [];

  const p = payload as { object?: string; entry?: unknown[] } | null;
  if (!p || p.object !== 'page' || !Array.isArray(p.entry)) {
    return { ok: true, dispatched, leadgenValues };
  }

  for (const rawEntry of p.entry) {
    const entry = rawEntry as Record<string, unknown>;

    // ----- 1. Messenger shape: entry.messaging[] is present
    if (Array.isArray(entry.messaging) && entry.messaging.length > 0) {
      try {
        await handleMessengerEvent(entry as unknown as MessengerEntry, supabase);
        dispatched.push('messenger');
      } catch (err) {
        logger.error('meta/page-dispatcher', 'messenger-handler threw', {
          pageId: entry.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ----- 2. Page-changes shape: entry.changes[] with field discriminator
    if (Array.isArray(entry.changes) && entry.changes.length > 0) {
      const hasLeadgen = entry.changes.some(
        (c) => (c as { field?: string })?.field === 'leadgen'
      );

      if (hasLeadgen) {
        try {
          const res = await handleLeadgenEntry(
            entry as unknown as FbLeadgenWebhookPayload['entry'][number],
            supabase
          );
          dispatched.push('leadgen');
          leadgenValues.push(...res.values);
        } catch (err) {
          logger.error('meta/page-dispatcher', 'leadgen-handler threw', {
            pageId: entry.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Surface any other change.field values for observability so we know
      // when Meta starts delivering a surface we haven't implemented yet.
      for (const c of entry.changes) {
        const f = (c as { field?: string })?.field;
        if (f && f !== 'leadgen') {
          logger.info('meta/page-dispatcher', 'Unhandled change.field', {
            pageId: entry.id,
            field: f,
          });
        }
      }
    }
  }

  return { ok: true, dispatched, leadgenValues };
}
