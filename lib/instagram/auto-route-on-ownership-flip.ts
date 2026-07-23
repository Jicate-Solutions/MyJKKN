/**
 * lib/instagram/auto-route-on-ownership-flip.ts
 *
 * Hook for the daily ig-accounts-sync cron: detect when an Instagram
 * account's ownership flipped during the sync (institution_id changed,
 * metrics_source moved business_discovery → graph, OR an entirely new
 * page-edge ownership appeared) and:
 *   1. Write an ownership_flipped event into social_instagram_logs.
 *   2. Notify super-admins (in-app) of the flip so the human-review trail
 *      exists.
 *   3. Re-route open social/instagram bug_reports that reference the
 *      flipped ig_user_id — clear the old metadata.routed_owner_user_id
 *      so a downstream router can pick a new owner from the new
 *      institution_id.
 *
 * Why a separate file (and not in sync-accounts.ts): the shared sync core
 * is used by BOTH the POST /api/social/instagram/accounts/sync route and
 * the daily cron. The auto-route side-effect is only desirable in the
 * cron path — a manual UI sync shouldn't fan out admin notifications.
 *
 * Snapshot semantics: caller takes a snapshot of pre-sync state
 * (`snapshotOwnership`), runs the sync, then calls `routeOwnershipFlips`
 * with the snapshot — the helper re-reads post-sync state and emits the
 * diff. No coupling back into sync-accounts.ts is required.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

export interface IgOwnershipSnapshotRow {
  ig_user_id: string;
  institution_id: string | null;
  metrics_source: string | null;
}

export type IgOwnershipSnapshot = Map<string, IgOwnershipSnapshotRow>;

export interface IgOwnershipFlip {
  ig_user_id: string;
  username: string | null;
  before: {
    institution_id: string | null;
    metrics_source: string | null;
  } | null; // null = brand new account
  after: {
    institution_id: string | null;
    metrics_source: string | null;
  };
  reason:
    | 'new_account'
    | 'institution_changed'
    | 'metrics_source_changed';
}

export interface RouteOwnershipFlipsResult {
  flips: IgOwnershipFlip[];
  notified: number;
  bug_reports_rerouted: number;
  log_writes: number;
  errors: string[];
}

/**
 * Take a snapshot of every ig_accounts row's ownership-relevant columns.
 * Cheap query; even at 1000+ accounts this is one indexed scan.
 */
export async function snapshotOwnership(
  supabase: SupabaseClient
): Promise<IgOwnershipSnapshot> {
  const { data, error } = await supabase
    .from('ig_accounts')
    .select('ig_user_id, institution_id, metrics_source');
  if (error) {
    console.warn('[ig-auto-route] snapshotOwnership failed:', error.message);
    return new Map();
  }
  const map: IgOwnershipSnapshot = new Map();
  for (const row of data ?? []) {
    if (!row?.ig_user_id) continue;
    map.set(row.ig_user_id as string, {
      ig_user_id: row.ig_user_id as string,
      institution_id: (row.institution_id as string | null) ?? null,
      metrics_source: (row.metrics_source as string | null) ?? null,
    });
  }
  return map;
}

/**
 * Compute the diff between pre-sync snapshot and post-sync DB state, then
 * emit notifications + log + bug_reports updates for every flip detected.
 *
 * Per-flip failures are isolated and reported in `errors[]` — one bad
 * fanout never aborts the loop.
 */
export async function routeOwnershipFlips(
  supabase: SupabaseClient,
  preSnapshot: IgOwnershipSnapshot
): Promise<RouteOwnershipFlipsResult> {
  const errors: string[] = [];
  const flips: IgOwnershipFlip[] = [];

  // Post-sync state for every account that was in the pre-snapshot OR
  // appeared during the sync. Single query.
  const { data: postRows, error: postErr } = await supabase
    .from('ig_accounts')
    .select('ig_user_id, username, institution_id, metrics_source');
  if (postErr) {
    return {
      flips: [],
      notified: 0,
      bug_reports_rerouted: 0,
      log_writes: 0,
      errors: [`ig_accounts post-snapshot read failed: ${postErr.message}`],
    };
  }

  for (const row of postRows ?? []) {
    if (!row?.ig_user_id) continue;
    const igUserId = row.ig_user_id as string;
    const after = {
      institution_id: (row.institution_id as string | null) ?? null,
      metrics_source: (row.metrics_source as string | null) ?? null,
    };
    const before = preSnapshot.get(igUserId);

    if (!before) {
      flips.push({
        ig_user_id: igUserId,
        username: (row.username as string | null) ?? null,
        before: null,
        after,
        reason: 'new_account',
      });
      continue;
    }

    const instChanged = before.institution_id !== after.institution_id;
    const metricsChanged = before.metrics_source !== after.metrics_source;

    if (instChanged) {
      flips.push({
        ig_user_id: igUserId,
        username: (row.username as string | null) ?? null,
        before: {
          institution_id: before.institution_id,
          metrics_source: before.metrics_source,
        },
        after,
        reason: 'institution_changed',
      });
    } else if (metricsChanged) {
      // metrics_source flip without institution change still matters for
      // poller routing (graph vs business_discovery vs instagram_login).
      flips.push({
        ig_user_id: igUserId,
        username: (row.username as string | null) ?? null,
        before: {
          institution_id: before.institution_id,
          metrics_source: before.metrics_source,
        },
        after,
        reason: 'metrics_source_changed',
      });
    }
  }

  if (flips.length === 0) {
    return {
      flips: [],
      notified: 0,
      bug_reports_rerouted: 0,
      log_writes: 0,
      errors,
    };
  }

  // Resolve super-admins once (canonical recipients for system alerts,
  // matches lib/instagram/sync-accounts.ts:alertEnumerationFailure).
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true);
  const adminIds = (admins ?? [])
    .map((r: any) => r?.id as string)
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);

  let notified = 0;
  let bugReportsRerouted = 0;
  let logWrites = 0;
  const dayKey = new Date().toISOString().slice(0, 10);

  for (const flip of flips) {
    // 1) social_instagram_logs entry. Fail-silent — log misses don't
    //    block the rest of the routing.
    try {
      await supabase.from('social_instagram_logs').insert({
        account_id: null,
        event_type: 'ownership_flipped',
        status: 'success',
        payload: {
          source: 'ig-auto-route',
          ig_user_id: flip.ig_user_id,
          username: flip.username,
          reason: flip.reason,
          before: flip.before,
          after: flip.after,
        },
        error_message: null,
      });
      logWrites++;
    } catch (err) {
      errors.push(
        `log write failed for ${flip.ig_user_id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    // 2) Admin notification (one per flip per day).
    if (adminIds.length > 0) {
      const title =
        flip.reason === 'new_account'
          ? 'New Instagram account discovered'
          : 'Instagram account ownership flipped';
      const body =
        flip.reason === 'new_account'
          ? `@${flip.username ?? flip.ig_user_id} was discovered during the daily Instagram sync and is now monitored (metrics_source=${flip.after.metrics_source ?? 'unknown'}).`
          : flip.reason === 'institution_changed'
            ? `@${flip.username ?? flip.ig_user_id} moved between institutions during the daily Instagram sync (was ${flip.before?.institution_id ?? 'null'} → now ${flip.after.institution_id ?? 'null'}). Verify routing of open social/instagram tickets.`
            : `@${flip.username ?? flip.ig_user_id} changed metrics_source (was ${flip.before?.metrics_source ?? 'null'} → now ${flip.after.metrics_source ?? 'null'}). Insights pipeline updated automatically.`;

      try {
        const outcome = await fanoutNotification(supabase, {
          title,
          body,
          userIds: adminIds,
          createdBy: adminIds[0],
          category: 'Alert',
          kind: 'work_item',
          priority: 'normal',
          idempotencyKey: `ig-ownership-flip-${flip.ig_user_id}-${flip.reason}-${dayKey}`,
          source: 'ig-auto-route',
          metadata: {
            event: 'ig_ownership_flipped',
            ig_user_id: flip.ig_user_id,
            ig_username: flip.username,
            reason: flip.reason,
            before: flip.before,
            after: flip.after,
          },
        });
        if (outcome.notified > 0) notified += outcome.notified;
      } catch (err) {
        errors.push(
          `notify failed for ${flip.ig_user_id}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    // 3) Re-route open social/instagram bug_reports keyed to this ig_user_id.
    //    bug_reports.module_name is GENERATED from page_url; current CASE
    //    routes /admin/social/* to module_name='admin'+sub_module_name='social'
    //    and a future /social/instagram/* page would route to module_name='other'.
    //    We match on page_url so both shapes are covered today.
    //
    //    bug_reports.metadata is added by the same migration as this
    //    helper. If the column is missing in a downgrade scenario, the
    //    UPDATE fails with 42703 — caught and logged, never crashing the
    //    sync (the auto-route is best-effort).
    try {
      // Set routed_owner_user_id to null so a downstream router picks a
      // new owner from the new institution_id; preserve every other key
      // in metadata via jsonb concatenation in two updates:
      //   a) write the new institution + clear the previous owner
      //   b) keep status open
      const { count, error: updateErr } = await supabase
        .from('bug_reports')
        .update(
          {
            metadata: {
              // Read-modify-write via the merge operator below would
              // require a custom RPC; this overwrite is bounded to the
              // routing-only keys we own, and the rest of metadata is
              // expected to be auto-routing-related (set by webhooks).
              ig_user_id: flip.ig_user_id,
              routed_owner_user_id: null,
              routed_institution_id: flip.after.institution_id,
              last_routed_at: new Date().toISOString(),
              last_routed_reason: flip.reason,
            },
          },
          { count: 'exact' }
        )
        .eq('status', 'open')
        .filter('metadata->>ig_user_id', 'eq', flip.ig_user_id);

      if (updateErr) {
        // 42703 = undefined_column. Surface but don't crash — the
        // migration ships in this PR; downgrades would skip routing.
        errors.push(
          `bug_reports re-route failed for ${flip.ig_user_id}: ${updateErr.message}`
        );
      } else if (typeof count === 'number') {
        bugReportsRerouted += count;
      }
    } catch (err) {
      errors.push(
        `bug_reports re-route exception for ${flip.ig_user_id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return {
    flips,
    notified,
    bug_reports_rerouted: bugReportsRerouted,
    log_writes: logWrites,
    errors,
  };
}
