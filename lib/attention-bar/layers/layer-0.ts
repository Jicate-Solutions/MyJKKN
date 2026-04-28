/**
 * Layer 0 — Urgent Notifications (real-time, Supabase Realtime).
 *
 * Per spec §3 Layer 0: surfaces urgent ack-required notifications targeted
 * at the current user as the highest-priority Attention Bar action. Latency
 * budget end-to-end is 2s (insert → realtime fan-out → resolver re-run →
 * pixel). The DB query here MUST stay under ~50ms — the unacknowledged
 * partial index `idx_user_notifications_unacknowledged` covers the hot path.
 *
 * Schema mapping (spec → prod):
 *   spec "severity = 'red'"            → notifications.priority = 'urgent'
 *   spec "requires_acknowledgment"     → notifications.requires_acknowledgment
 *   spec "acknowledged_at IS NULL"     → user_notifications.acknowledged_at
 *   spec "target user matches uid"     → user_notifications.user_id (per-user fanout)
 *
 * The `notifications` table on prod uses `priority` (low/normal/high/urgent),
 * not `severity` (red/amber/green). `priority='urgent'` is the operational
 * analog of severity=red and is what every existing emitter (billing
 * overdue, escalations, rescue-card alerts) already writes. We honour the
 * spec literal by treating these as equivalent for Layer 0.
 *
 * Snooze + force-dismiss (spec §3 Layer 0): `snoozed_until` / `force_dismissed_at`
 * columns don't yet exist on user_notifications. For v1 we treat acknowledgment
 * as the only dismissal vector. Snooze is a TODO punted to a follow-up PR;
 * `acknowledged_at` covers the must-have CTA path.
 *
 * Constraint: ONE Layer 0 active at a time (spec §3). We pick the most
 * recent unacknowledged urgent notification by `created_at DESC`. The
 * realtime listener / queue-depth pip in components/attention-bar/realtime-
 * listener.tsx renders the "+N" overlay when more are queued.
 *
 * Failure mode: any DB error returns `{matched: false, reason: 'error'}` so
 * the resolver falls through to Layer 2/3/1/4 — Layer 0 must never break
 * the bar. The thrown-error path in resolver.ts also catches anything we
 * miss here.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ResolverContext } from '../types';
import type { LayerResult } from './layer-result';

/** Truncate notification body for the bar's secondary line. Keeps it readable. */
const CONTEXT_MAX_CHARS = 80;

function truncateContext(body: string | null | undefined): string | undefined {
  if (!body) return undefined;
  const trimmed = body.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length <= CONTEXT_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, CONTEXT_MAX_CHARS - 1).trimEnd()}…`;
}

/** Pull a string from action_config JSON safely; return null on missing/wrong type. */
function readActionConfigString(
  config: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!config || typeof config !== 'object') return null;
  const v = (config as Record<string, unknown>)[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export async function evaluateLayer0(ctx: ResolverContext): Promise<LayerResult> {
  if (!ctx.userId) {
    return { matched: false, reason: 'no userId' };
  }

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    return { matched: false, reason: 'supabase client init failed' };
  }

  // Join user_notifications ⨝ notifications for the current user.
  // Filter to urgent + ack-required + unacknowledged. We rely on the
  // unacknowledged partial index for the user_id branch and post-filter
  // priority/ack-required client-side via the embedded select.
  const { data, error } = await supabase
    .from('user_notifications')
    .select(
      `
        id,
        notification_id,
        acknowledged_at,
        notifications!inner (
          id,
          title,
          body,
          icon,
          url,
          priority,
          requires_acknowledgment,
          action_type,
          action_config,
          expires_at,
          created_at
        )
      `,
    )
    .eq('user_id', ctx.userId)
    .is('acknowledged_at', null)
    .eq('notifications.priority', 'urgent')
    .eq('notifications.requires_acknowledgment', true)
    .order('created_at', { ascending: false, foreignTable: 'notifications' })
    .limit(1);

  if (error) {
    return { matched: false, reason: `db error: ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { matched: false, reason: 'no urgent notifications' };
  }

  const row = data[0] as {
    id: string;
    notification_id: string;
    acknowledged_at: string | null;
    notifications: {
      id: string;
      title: string;
      body: string | null;
      icon: string | null;
      url: string | null;
      priority: string;
      requires_acknowledgment: boolean | null;
      action_type: string | null;
      action_config: Record<string, unknown> | null;
      expires_at: string | null;
      created_at: string;
    } | null;
  };

  const notif = row.notifications;
  if (!notif) {
    // Shouldn't happen with !inner join, but guard anyway.
    return { matched: false, reason: 'notification join returned null' };
  }

  // Skip if expired.
  if (notif.expires_at && new Date(notif.expires_at).getTime() < Date.now()) {
    return { matched: false, reason: 'urgent notification expired' };
  }

  // Resolve href: prefer notification.url, then action_config.url, else fall
  // back to the in-app inbox so the user can still act on it.
  const href =
    notif.url ??
    readActionConfigString(notif.action_config, 'url') ??
    `/system/notifications/${notif.id}`;

  // CTA label: action_config.cta or label takes precedence; fall back to
  // a generic "Open" since prod notifications use action_type='open_url'
  // which implies a navigation intent.
  const cta =
    readActionConfigString(notif.action_config, 'cta') ??
    readActionConfigString(notif.action_config, 'label') ??
    'Open';

  // Append acknowledgment hint to href so the acknowledge route handler
  // (app/api/attention-bar/acknowledge) can mark this user_notification
  // when the user taps the CTA. We put it as a query param so the actual
  // navigation target is preserved — the route handler intercepts ack=1
  // on its own dedicated POST endpoint, but the link includes a marker
  // for the client component to fire a beacon-style ack request.
  // Keep href clean for now; the realtime-listener/AttentionBar wires
  // the acknowledge call client-side using the action.id pattern.

  return {
    matched: true,
    action: {
      id: `L0.notification.${notif.id}`,
      label: notif.title,
      context: truncateContext(notif.body),
      tone: 'urgent',
      cta,
      icon: notif.icon ?? 'AlertTriangle',
      href,
    },
  };
}
