/**
 * lib/webhooks/meta/leadgen-handler.ts
 *
 * Pure handler for a single Meta Page webhook entry containing
 * `changes[].field === "leadgen"` events. Extracted from the original
 * `app/api/webhooks/meta/leadgen/route.ts` POST body so the unified Page
 * dispatcher can call it whether the entry was delivered to
 * `/meta/messenger` (the App-level subscribed callback) or
 * `/meta/leadgen` (legacy direct route).
 *
 * The handler persists raw rows to `meta_leadgen_events` and is
 * idempotent on `fb_leadgen_id` via the unique index + upsert with
 * `ignoreDuplicates: true`. Importer hydration + CRM lead creation is
 * scheduled by the route layer (uses `is_enabled` policy + waitUntil).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  FbLeadgenWebhookPayload,
  FbLeadgenWebhookValue,
} from '@/lib/meta/lead-ads-types';

/**
 * Persist raw leadgen rows for one Page webhook entry. Returns the
 * extracted values so the caller can decide whether to hydrate the
 * importer (gated by `meta.leadgen.is_enabled` policy + page access
 * token availability).
 */
export async function handleLeadgenEntry(
  entry: FbLeadgenWebhookPayload['entry'][number],
  supabase: SupabaseClient
): Promise<{ ok: true; values: FbLeadgenWebhookValue[] }> {
  const values = collectLeadgenValuesFromEntry(entry);

  for (const value of values) {
    try {
      await supabase
        .from('meta_leadgen_events')
        .upsert(
          {
            fb_leadgen_id: value.leadgen_id,
            fb_form_id: value.form_id,
            fb_page_id: value.page_id,
            raw_payload: value as unknown as Record<string, unknown>,
            status: 'pending',
          },
          { onConflict: 'fb_leadgen_id', ignoreDuplicates: true }
        );
    } catch (err) {
      logger.error('meta/leadgen-handler', 'Failed to upsert event row', {
        leadgenId: value.leadgen_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ok: true, values };
}

export function collectLeadgenValuesFromEntry(
  entry: FbLeadgenWebhookPayload['entry'][number]
): FbLeadgenWebhookValue[] {
  const out: FbLeadgenWebhookValue[] = [];
  for (const change of entry.changes ?? []) {
    if (change.field !== 'leadgen') continue;
    const v = change.value as Partial<FbLeadgenWebhookValue> | null;
    if (!v || !v.leadgen_id || !v.form_id || !v.page_id) continue;
    out.push({
      leadgen_id: String(v.leadgen_id),
      form_id: String(v.form_id),
      page_id: String(v.page_id),
      created_time: Number(v.created_time ?? Math.floor(Date.now() / 1000)),
      ad_id: v.ad_id ? String(v.ad_id) : undefined,
      adgroup_id: v.adgroup_id ? String(v.adgroup_id) : undefined,
    });
  }
  return out;
}
