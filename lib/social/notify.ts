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
  /**
   * ISO timestamp after which the bell drops the card (notifications.expires_at).
   * Recurring editions (weekly digests/alarms) should set this to just past the
   * next edition, per the 2026-08-10 notification-expiry ruling — an unexpired
   * weekly card outlives its usefulness and floods the unread count. Omitted =
   * NULL = never expires (one-off items).
   */
  expiresAt?: string;
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
    if (existing) {
      // Self-heal: the shared row exists, but a PRIOR tick may have crashed / timed
      // out AFTER inserting `notifications` and BEFORE the fan-out (a window no
      // in-process compensation can cover). Ensure the recipient's user_notifications
      // row exists before returning 'duplicate', so an orphan is delivered on this
      // tick rather than being marked done-yet-lost.
      await ensureFanout(admin, existing.id, opts.recipientId);
      return 'duplicate';
    }

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
        expires_at: opts.expiresAt ?? null,
        metadata: opts.metadata ?? {},
      })
      .select('id')
      .single();

    if (insErr || !notif) {
      // 23505 = another tick raced us to the same idempotency_key. The winner's row
      // exists; ensure its fan-out landed (the winner may still be mid-flight or have
      // crashed between its two writes) before reporting duplicate.
      if ((insErr as { code?: string } | null)?.code === '23505') {
        const { data: raced } = await admin
          .from('notifications')
          .select('id')
          .eq('idempotency_key', opts.idempotencyKey)
          .maybeSingle();
        if (raced) await ensureFanout(admin, raced.id, opts.recipientId);
        return 'duplicate';
      }
      return 'error';
    }

    const { error: fanoutErr } = await admin
      .from('user_notifications')
      .insert({ notification_id: notif.id, user_id: opts.recipientId });
    if (fanoutErr) {
      // In-process fan-out failure: delete the orphan so the next tick cleanly redoes
      // both writes. (If this delete itself fails, the self-heal branch above recovers
      // the orphan on the next tick — belt and suspenders.)
      await admin.from('notifications').delete().eq('id', notif.id);
      return 'error';
    }

    return 'delivered';
  } catch {
    return 'error';
  }
}

/** Ensure exactly one user_notifications row exists for (notification, user).
 *  Idempotent recovery for an orphaned notifications row whose fan-out never landed. */
async function ensureFanout(
  admin: SupabaseClient,
  notificationId: string,
  userId: string,
): Promise<void> {
  const { data } = await admin
    .from('user_notifications')
    .select('id')
    .eq('notification_id', notificationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) {
    await admin.from('user_notifications').insert({ notification_id: notificationId, user_id: userId });
  }
}
