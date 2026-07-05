/**
 * lib/services/_shared/notifications/notify.ts
 *
 * Canonical in-app notification fanout helper. Replaces the per-module
 * `createNotification` helpers that have been copy-pasted into
 * app/api/{events,learn,startup-studio,work-pulse,profile,staff}/notify
 * and the inline two-write pattern inside lib/instagram/sync-accounts.ts
 * (alertEnumerationFailure).
 *
 * Why this exists (per memory feedback_notification_delivery_needs_user_notifications_fanout
 * + the rule-of-3 → extract-on-2nd principle in CLAUDE.md):
 * Delivering an in-app notification requires TWO writes — a `notifications`
 * row plus per-user fan-out rows into `user_notifications`. There is no DB
 * trigger that fans out, so anything that misses the second write silently
 * fails to surface in the bell/inbox. Every site that does it correctly has
 * the same shape; that shape now lives here.
 *
 * No file outside this helper should `insert into user_notifications`
 * directly going forward.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface FanoutNotificationOptions {
  /** Notification headline (notifications.title). */
  title: string;
  /** Notification body text (notifications.body). */
  body: string;
  /** Recipients. De-duplicated; empty list → skipped (returns notified=0). */
  userIds: string[];
  /**
   * `notifications.created_by` (NOT NULL). For cron-generated alerts, pass
   * the first super-admin id (mirrors lib/instagram/sync-accounts.ts:
   * alertEnumerationFailure). If omitted, the first userId is used.
   */
  createdBy?: string;
  /** `notifications.category` — defaults to 'general'. */
  category?: string;
  /** `notifications.kind` — defaults to 'announcement'. */
  kind?: 'announcement' | 'work_item';
  /** `notifications.priority` — defaults to 'normal'. */
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  /** Free-form JSON for downstream consumers. Merged with `{ source }`. */
  metadata?: Record<string, unknown>;
  /**
   * Optional idempotency key — written to notifications.idempotency_key.
   * Has a UNIQUE partial index; we pre-check to avoid violating it under
   * concurrent crons (same pattern as alertEnumerationFailure).
   */
  idempotencyKey?: string;
  /** Optional click-through URL surfaced in the bell. */
  url?: string;
  /** Optional icon hint. */
  icon?: string;
  /** Notifications.targeting JSONB — defaults to `{ user_ids: <userIds> }`. */
  targeting?: Record<string, unknown>;
  /**
   * Backwards-compat / extension point. Spread directly into the
   * notifications insert payload alongside the canonical columns. Use only
   * for columns that exist in production but aren't in the canonical set
   * (e.g. legacy `type` on a few older callers). Do NOT use for ad-hoc
   * "extra fields" — those belong in `metadata`.
   */
  extraColumns?: Record<string, unknown>;
  /**
   * A short label written into metadata.source for traceability in the
   * notifications table. Defaults to 'shared-notify'.
   */
  source?: string;
}

export interface FanoutNotificationResult {
  /** Number of user_notifications rows successfully inserted. */
  notified: number;
  /** notifications.id of the row created, or undefined when skipped. */
  notificationId?: string;
  /**
   * When set, no insert happened. `idempotent` = a notifications row with
   * the same idempotency_key already exists; `no_recipients` = empty
   * userIds AFTER de-dup; `no_created_by` = no createdBy and no userIds to
   * derive one from.
   */
  skipped?: 'idempotent' | 'no_recipients' | 'no_created_by';
}

/**
 * Insert a single `notifications` row, then fan out to `user_notifications`
 * for every recipient. Service-role client required — RLS on these tables
 * does not permit cross-user writes from `authenticated`.
 *
 * Idempotent under concurrent crons when `idempotencyKey` is supplied: a
 * pre-check + UNIQUE-violation race fallback both return `skipped:'idempotent'`.
 *
 * Returns a structured result instead of throwing, so callers (typically
 * cron routes) can record outcomes in their logs without try/catch noise.
 */
export async function fanoutNotification(
  supabase: SupabaseClient,
  options: FanoutNotificationOptions
): Promise<FanoutNotificationResult> {
  const userIds = Array.from(new Set((options.userIds || []).filter(Boolean)));
  if (userIds.length === 0) {
    return { notified: 0, skipped: 'no_recipients' };
  }

  const createdBy = options.createdBy ?? userIds[0];
  if (!createdBy) {
    return { notified: 0, skipped: 'no_created_by' };
  }

  // Idempotency pre-check (matches alertEnumerationFailure's pattern).
  // The DB has a UNIQUE partial index on (idempotency_key) WHERE NOT NULL,
  // so a concurrent insert is still safe — we treat 23505 as 'idempotent'.
  if (options.idempotencyKey) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('idempotency_key', options.idempotencyKey)
      .maybeSingle();
    if (existing?.id) {
      // Heal a prior PARTIAL fan-out: the notifications row exists but its
      // user_notifications links may be missing (parent committed, then the
      // links insert threw). Re-assert idempotently so the bell item is never
      // permanently lost. No-op when the links already exist.
      await ensureLinks(supabase, existing.id, userIds);
      return { notified: 0, notificationId: existing.id, skipped: 'idempotent' };
    }
  }

  const payload: Record<string, unknown> = {
    title: options.title,
    body: options.body,
    created_by: createdBy,
    targeting: options.targeting ?? { user_ids: userIds },
    category: options.category ?? 'general',
    kind: options.kind ?? 'announcement',
    priority: options.priority ?? 'normal',
    metadata: {
      source: options.source ?? 'shared-notify',
      ...(options.metadata ?? {}),
    },
    ...(options.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {}),
    ...(options.url ? { url: options.url } : {}),
    ...(options.icon ? { icon: options.icon } : {}),
    ...(options.extraColumns ?? {}),
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('notifications')
    .insert(payload)
    .select('id')
    .maybeSingle();

  if (insertErr) {
    // 23505 = unique_violation. With idempotency_key set this is the
    // concurrent-cron race; re-read the existing row and return it.
    if (insertErr.code === '23505' && options.idempotencyKey) {
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('idempotency_key', options.idempotencyKey)
        .maybeSingle();
      if (existing?.id) {
        await ensureLinks(supabase, existing.id, userIds);
        return { notified: 0, notificationId: existing.id, skipped: 'idempotent' };
      }
    }
    throw insertErr;
  }
  if (!inserted?.id) return { notified: 0 };

  // Idempotent upsert (see ensureLinks): consistent with the heal on the
  // idempotent-skip paths above and safe against a re-run.
  await ensureLinks(supabase, inserted.id as string, userIds);

  return { notified: userIds.length, notificationId: inserted.id as string };
}

/**
 * Idempotently ensure a user_notifications link exists for every recipient.
 * Uses the UNIQUE (notification_id, user_id) index so a re-run — e.g. healing a
 * partial fan-out on the idempotent-skip path — adds only the missing rows and
 * never errors on the ones already present. Throws on a real DB error so the
 * caller's existing try/catch still surfaces it.
 */
async function ensureLinks(
  supabase: SupabaseClient,
  notificationId: string,
  userIds: string[]
): Promise<void> {
  if (userIds.length === 0) return;
  const links = userIds.map((user_id) => ({ notification_id: notificationId, user_id }));
  const { error } = await supabase
    .from('user_notifications')
    .upsert(links, { onConflict: 'notification_id,user_id', ignoreDuplicates: true });
  if (error) throw error;
}
