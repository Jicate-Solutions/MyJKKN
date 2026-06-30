/**
 * lib/instagram/silence-detect.ts
 *
 * Daily silence-detection core for connected Instagram accounts.
 *
 * Reads ig_accounts rows where last_post_at is older than the configured
 * threshold (default 30 days, tunable via platform_policies key
 * `ig.alert_dormant_after_days`) and dispatches one in-app notification
 * per silent account per day to the account's connected_by user (when
 * present) plus all super admins.
 *
 * Why these two keys vs a new `ig.silence_threshold_days`:
 *   `ig.dormancy_threshold_days` (default 14) — classifies the account as
 *     dormant (used elsewhere to flip status).
 *   `ig.alert_dormant_after_days`   (default 30) — when alerts dispatch.
 * Both already exist in `platform_policies` (seeded by migration
 * 20260530140000_instagram_monitoring_substrate.sql), so a "silence alert"
 * cron is exactly the second key. Re-using avoids the
 * parallel-config-knob smell.
 *
 * Idempotent per (ig_user_id, day): the `notifications.idempotency_key`
 * is `ig-silence-${ig_user_id}-${YYYY-MM-DD}` so a re-run on the same day
 * is a no-op. Fanout uses the canonical
 * `lib/services/_shared/notifications/notify.ts` helper.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

/** Default in-code fallback — must match the seeded platform_policies row. */
const DEFAULT_SILENCE_DAYS = 30;

export interface SilenceAccountResult {
  ig_user_id: string;
  username: string;
  institution_id: string;
  last_post_at: string | null;
  days_silent: number | null;
  status: 'alerted' | 'deduplicated' | 'no_recipients' | 'error';
  notified?: number;
  notification_id?: string;
  error?: string;
}

export interface RunSilenceDetectResult {
  threshold_days: number;
  candidates: number;
  alerted: number;
  deduplicated: number;
  failed: number;
  results: SilenceAccountResult[];
}

/**
 * Read the threshold via the typed-policy resolver. The function is
 * SECURITY DEFINER (lib/policies/keys.ts notes are authoritative), so the
 * service-role client can call it and get the global default even though
 * the resolver also walks user/role/institution overrides which aren't
 * meaningful for a cron context. NULL/missing rows fall back to the
 * provided default rather than throwing.
 */
async function readThresholdDays(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc('fn_get_policy_int', {
    p_key: 'ig.alert_dormant_after_days',
    p_default: DEFAULT_SILENCE_DAYS,
  });
  if (error) {
    console.warn('[ig-silence-detect] fn_get_policy_int failed:', error.message);
    return DEFAULT_SILENCE_DAYS;
  }
  // RPC returns a scalar int; guard against unexpected shapes.
  const n = typeof data === 'number' ? data : Number(data);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SILENCE_DAYS;
  return Math.floor(n);
}

async function resolveSuperAdminIds(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true);
  return (data ?? [])
    .map((r: any) => r?.id as string)
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
}

interface SilentRow {
  ig_user_id: string;
  username: string;
  institution_id: string;
  last_post_at: string | null;
  connected_by: string | null;
}

/**
 * Run silence detection across all active accounts. Per-account failures
 * are isolated — one bad fanout never aborts the loop.
 *
 * @param supabase a service-role Supabase client.
 */
export async function runSilenceDetect(
  supabase: SupabaseClient
): Promise<RunSilenceDetectResult> {
  const thresholdDays = await readThresholdDays(supabase);
  const thresholdIso = new Date(
    Date.now() - thresholdDays * 24 * 60 * 60 * 1000
  ).toISOString();

  // Silent = status active AND no recent post. We deliberately INCLUDE
  // accounts whose last_post_at IS NULL (never posted / never polled) so
  // they don't escape detection — the metrics poller writes last_post_at
  // on first poll, so a NULL means an account that should be alerted on.
  const { data: silentRaw, error: selectErr } = await supabase
    .from('ig_accounts')
    .select('ig_user_id, username, institution_id, last_post_at, connected_by')
    .eq('status', 'active')
    .or(`last_post_at.is.null,last_post_at.lt.${thresholdIso}`);

  if (selectErr) {
    throw new Error(`ig_accounts read failed: ${selectErr.message}`);
  }
  const silent: SilentRow[] = (silentRaw ?? []) as SilentRow[];

  const adminIds = await resolveSuperAdminIds(supabase);
  // first super-admin is the canonical created_by for service-role cron
  // inserts (notifications.created_by is NOT NULL).
  const dayKey = new Date().toISOString().slice(0, 10);

  const results: SilenceAccountResult[] = [];
  let alerted = 0;
  let deduplicated = 0;
  let failed = 0;

  for (const row of silent) {
    const ig_user_id = row.ig_user_id;
    const username = row.username || '';
    const last = row.last_post_at;
    const daysSilent =
      last == null
        ? null
        : Math.floor(
            (Date.now() - new Date(last).getTime()) / (24 * 60 * 60 * 1000)
          );

    // Recipients: account's connected_by user (if any) + every super-admin
    // — never depend on a single per-account owner that may be null.
    const recipients = new Set<string>([
      ...(row.connected_by ? [row.connected_by] : []),
      ...adminIds,
    ]);
    const recipientIds = Array.from(recipients);

    if (recipientIds.length === 0) {
      results.push({
        ig_user_id,
        username,
        institution_id: row.institution_id,
        last_post_at: last,
        days_silent: daysSilent,
        status: 'no_recipients',
      });
      continue;
    }

    const idempotencyKey = `ig-silence-${ig_user_id}-${dayKey}`;
    const title = 'Instagram account is silent';
    const lastClause = last
      ? `Last post was ${daysSilent} day${daysSilent === 1 ? '' : 's'} ago`
      : 'No post has been recorded yet';
    const body =
      `@${username || ig_user_id} has gone quiet for more than ${thresholdDays} days. ` +
      `${lastClause}. Open the Instagram admin to review whether the account is still owned and posting.`;

    try {
      const outcome = await fanoutNotification(supabase, {
        title,
        body,
        userIds: recipientIds,
        createdBy: adminIds[0] || row.connected_by || undefined,
        category: 'Alert',
        // Operational cron task → work_item (matches the
        // notifications_kind_check constraint added by setup/01_tables.sql).
        kind: 'work_item',
        priority: 'normal',
        idempotencyKey,
        source: 'ig-silence-detect',
        metadata: {
          event: 'ig_silence_alert',
          ig_user_id,
          ig_username: username || null,
          institution_id: row.institution_id,
          last_post_at: last,
          days_silent: daysSilent,
          threshold_days: thresholdDays,
        },
      });

      if (outcome.skipped === 'idempotent') {
        deduplicated++;
        results.push({
          ig_user_id,
          username,
          institution_id: row.institution_id,
          last_post_at: last,
          days_silent: daysSilent,
          status: 'deduplicated',
          notification_id: outcome.notificationId,
        });
        continue;
      }

      if (outcome.skipped === 'no_recipients' || outcome.skipped === 'no_created_by') {
        results.push({
          ig_user_id,
          username,
          institution_id: row.institution_id,
          last_post_at: last,
          days_silent: daysSilent,
          status: 'no_recipients',
        });
        continue;
      }

      alerted++;
      results.push({
        ig_user_id,
        username,
        institution_id: row.institution_id,
        last_post_at: last,
        days_silent: daysSilent,
        status: 'alerted',
        notified: outcome.notified,
        notification_id: outcome.notificationId,
      });
    } catch (err) {
      failed++;
      results.push({
        ig_user_id,
        username,
        institution_id: row.institution_id,
        last_post_at: last,
        days_silent: daysSilent,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    threshold_days: thresholdDays,
    candidates: silent.length,
    alerted,
    deduplicated,
    failed,
    results,
  };
}
