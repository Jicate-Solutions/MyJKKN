// =====================================================================
// Social engagement — in-app notification delivery (the two-write contract)
// =====================================================================
// Delivering a MyJKKN in-app notification is TWO writes, not one:
//   1. insert one `notifications` row (the shared card), and
//   2. fan out one `user_notifications { notification_id, user_id }` per recipient.
// The bell / inbox reads `user_notifications` — there is NO DB trigger that fans
// out from `notifications.targeting`, so inserting only the shared row reaches
// NOBODY. (Verified against live prod 2026-07-06: only timestamp + delete-safety
// triggers exist on `notifications`.)
//
// Column shape mirrors the known-good friday-reflection cron (title/body/created_by/
// targeting/kind), NOT the stale work-pulse/notify or lead-service `{type,message}`
// shape (those columns do not exist on the current table).
//
// Idempotency: `notifications.idempotency_key` has a UNIQUE partial index, so a
// pre-check + a swallowed 23505 make repeat cron ticks safe (exactly one delivery
// per key). Callers ALSO guard with a per-row column (reminded_at / signal_notified_at)
// — belt and suspenders.
// =====================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type DeliverResult = 'delivered' | 'duplicate' | 'error';

export interface DeliverInAppOptions {
  /** auth user id == profiles.id of the single recipient */
  recipientId: string;
  title: string;
  body: string;
  /** deep-link the card opens to (e.g. '/dashboard') */
  url?: string;
  /** free-text bucket, e.g. 'social:rota-reminder' */
  category: string;
  /** stable per-event key for dedup (unique across the notifications table) */
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

/**
 * Deliver one in-app notification to one recipient via the two-write contract.
 * Returns 'duplicate' (already sent for this idempotencyKey), 'delivered', or
 * 'error'. Never throws — a delivery failure must not fail a cron tick.
 */
export async function deliverInApp(
  admin: SupabaseClient,
  opts: DeliverInAppOptions,
): Promise<DeliverResult> {
  try {
    // Dedup pre-check (the UNIQUE partial index makes the concurrent race safe too).
    const { data: existing } = await admin
      .from('notifications')
      .select('id')
      .eq('idempotency_key', opts.idempotencyKey)
      .maybeSingle();
    if (existing) return 'duplicate';

    const { data: notif, error: insErr } = await admin
      .from('notifications')
      .insert({
        title: opts.title,
        body: opts.body,
        url: opts.url ?? null,
        icon: '/icons/icon-192x192.png',
        // Self-targeted system nudge: recipient is both creator and target (matches
        // the friday-reflection convention; created_by is NOT-NULL).
        created_by: opts.recipientId,
        targeting: { user_ids: [opts.recipientId] },
        priority: 'normal',
        category: opts.category,
        // work_item keeps cron-emitted nudges out of the /notifications/admin
        // announcements page while the dashboard bell/inbox still surfaces them.
        kind: 'work_item',
        idempotency_key: opts.idempotencyKey,
        metadata: opts.metadata ?? {},
      })
      .select('id')
      .single();

    if (insErr || !notif) {
      // 23505 = another tick raced us to the same idempotency_key → already delivered.
      if ((insErr as { code?: string } | null)?.code === '23505') return 'duplicate';
      return 'error';
    }

    const { error: fanoutErr } = await admin
      .from('user_notifications')
      .insert({ notification_id: notif.id, user_id: opts.recipientId });
    if (fanoutErr) return 'error';

    return 'delivered';
  } catch {
    return 'error';
  }
}
