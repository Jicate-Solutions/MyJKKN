// lib/services/shared/comment-mention-alerts.ts
//
// SERVER ONLY. Grant a comment tag and tell the tagged person, as one step
// that is safe to repeat. Shared by the two tag routes:
//   /api/resource-management/reservations/[id]/comment-mentions
//   /api/events/[eventId]/review-mentions
//
// ── Why one step ────────────────────────────────────────────────────────────
// Granting (inserting the tag) and telling (the in-app alert) cannot share a
// database transaction — the alert is written by the service role, the tag by
// the caller's session so RLS decides who may tag. So instead of atomic, the
// step is RESUMABLE: every tag remembers `notified_at`, and any request for
// that person on that comment finishes whatever is left.
//
//   notified_at IS NULL      → access granted, alert not delivered: send it.
//   notified_at set          → an explicit re-tag is a reminder: send again,
//                              unless the last alert went out moments ago
//                              (a double-click, not a request).
//
// The alert's idempotency key is (tag, previous notified_at). A retry of the
// same attempt reuses the key, so fanoutNotification sends once and heals a
// half-written fan-out; marking notified_at moves the key on, so the next
// deliberate re-tag is a genuinely new alert. notified_at is only advanced
// with a compare-and-set on its old value, so two concurrent requests cannot
// both count as "the" delivery.
//
// See supabase/migrations/20261224120000_comment_mentions_notified_at.sql.

import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

/** A re-tag within this window of the last alert is treated as a double-click. */
const REMIND_COOLDOWN_MS = 60_000;

export interface MentionAlert {
  title: string;
  body: string;
  url: string;
  source: string;
  metadata: Record<string, unknown>;
}

export interface GrantAndNotifyOptions {
  /** Caller's session client — RLS and the guard trigger decide the grant. */
  db: any;
  /** Service-role client — writes the alert and notified_at. */
  service: any;
  table: 'resource_reservation_comment_mentions' | 'event_review_comment_mentions';
  /** The column pinning the tag to its thread, and its value. */
  parentColumn: 'reservation_id' | 'event_id';
  parentId: string;
  commentId: string;
  /** Already filtered to people who may be tagged. */
  userIds: string[];
  callerId: string;
  /** Prefix for idempotency keys, unique per thread type. */
  keyPrefix: string;
  /** Built lazily — only when at least one alert has to go out. */
  buildAlert: () => Promise<MentionAlert>;
}

export interface GrantAndNotifyResult {
  /** A session refusal of the grant itself (RLS / trigger). Nothing was granted. */
  grantError?: { code?: string; message?: string };
  /** User ids tagged on the comment after this call (new and existing). */
  tagged: string[];
  /** Told for the first time by this call. */
  notified: string[];
  /** Already told; this call sent a reminder. */
  reminded: string[];
  /** Already told moments ago; nothing sent. */
  recentlyNotified: string[];
  /** Granted but the alert could not be delivered — Resend will retry. */
  notNotified: string[];
  /** First delivery error, for the log. */
  alertError?: string;
}

/**
 * Did this call tell somebody for the FIRST time that they were tagged? That
 * is the completed act of tagging. `tagged` also lists tags that already
 * existed, `reminded` and `recentlyNotified` are repeats, and `notNotified`
 * mixes undelivered new tags with failed reminders — a new tag whose alert
 * failed is counted when its Resend succeeds, once.
 */
export function toldSomeoneNew(result: Pick<GrantAndNotifyResult, 'notified'>): boolean {
  return result.notified.length > 0;
}

export async function grantAndNotifyTags(o: GrantAndNotifyOptions): Promise<GrantAndNotifyResult> {
  const result: GrantAndNotifyResult = {
    tagged: [],
    notified: [],
    reminded: [],
    recentlyNotified: [],
    notNotified: [],
  };

  // 1. Grant. Idempotent: an existing tag is left as it is.
  const { error: grantError } = await o.db.from(o.table).upsert(
    o.userIds.map((id) => ({
      comment_id: o.commentId,
      [o.parentColumn]: o.parentId,
      mentioned_user_id: id,
    })),
    { onConflict: 'comment_id,mentioned_user_id', ignoreDuplicates: true },
  );
  if (grantError) return { ...result, grantError };

  // 2. Read back what is actually granted — new rows and ones that already
  //    existed — through the session, so only tags the caller may see count.
  const { data: rows, error: readError } = await o.db
    .from(o.table)
    .select('id, mentioned_user_id, notified_at')
    .eq('comment_id', o.commentId)
    .in('mentioned_user_id', o.userIds);
  if (readError) return { ...result, grantError: readError };

  const tags = (rows ?? []) as { id: string; mentioned_user_id: string; notified_at: string | null }[];
  result.tagged = tags.map((t) => t.mentioned_user_id);

  const now = Date.now();
  const due = tags.filter((t) => {
    if (!t.notified_at) return true;
    if (now - Date.parse(t.notified_at) < REMIND_COOLDOWN_MS) {
      result.recentlyNotified.push(t.mentioned_user_id);
      return false;
    }
    return true;
  });
  if (due.length === 0) return result;

  // 3. Tell each person, then record it. One alert per person, so each tag's
  //    delivery succeeds or fails — and is retried — on its own.
  let alert: MentionAlert;
  try {
    alert = await o.buildAlert();
  } catch (e) {
    result.notNotified.push(...due.map((t) => t.mentioned_user_id));
    result.alertError = (e as Error)?.message ?? 'could not build the alert';
    return result;
  }

  await Promise.all(
    due.map(async (t) => {
      const attempt = t.notified_at ? String(Date.parse(t.notified_at)) : 'first';
      try {
        await fanoutNotification(o.service, {
          title: alert.title,
          body: alert.body,
          url: alert.url,
          source: alert.source,
          userIds: [t.mentioned_user_id],
          createdBy: o.callerId,
          idempotencyKey: `${o.keyPrefix}:${t.id}:${attempt}`,
          metadata: { ...alert.metadata, comment_id: o.commentId, reminder: !!t.notified_at },
        });

        // Compare-and-set on the value we read: a concurrent request that
        // already recorded this delivery wins, and this one changes nothing.
        let mark = o.service
          .from(o.table)
          .update({ notified_at: new Date().toISOString() })
          .eq('id', t.id);
        mark = t.notified_at ? mark.eq('notified_at', t.notified_at) : mark.is('notified_at', null);
        const { error: markError } = await mark;
        // The alert is in the inbox either way; a failed mark only means the
        // next Resend re-uses this key, which fanoutNotification treats as done.
        if (markError) result.alertError ??= markError.message;

        (t.notified_at ? result.reminded : result.notified).push(t.mentioned_user_id);
      } catch (e) {
        result.notNotified.push(t.mentioned_user_id);
        result.alertError ??= (e as { message?: string })?.message ?? 'notification failed';
      }
    }),
  );

  return result;
}
