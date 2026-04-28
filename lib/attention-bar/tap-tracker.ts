/**
 * Attention Bar — Layer 3 tap tracker (server-side recorder).
 *
 * Spec §3 Layer 3 — every Attention Bar render writes an `impression`; every
 * CTA tap writes a `tap`; every dismissal writes a `dismiss`. Tap-rate per
 * (user, page, action) becomes the Layer 3 signal.
 *
 * Privacy contract:
 *  - Inserts are gated by RLS policy `qat_self_insert`: WITH CHECK (user_id = auth.uid())
 *  - Caller MUST pass an authenticated server-side Supabase client (from
 *    `createServerSupabaseClient()`) — service-role bypasses RLS and would
 *    let one user's session impersonate another.
 *  - Writes are no-ops when the user has not granted Layer 3 consent. The
 *    consent gate is enforced in the API route (track/route.ts) before this
 *    module is called, but each function ALSO double-checks via
 *    `assertConsent()` as a defence-in-depth measure.
 *  - Never reads or writes other users' rows.
 *
 * Performance contract:
 *  - Inserts are fire-and-forget from the resolver path. Failures are
 *    logged but never thrown back to the caller — the resolver must not
 *    block on telemetry.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type TapEventType = 'impression' | 'tap' | 'dismiss';

export interface RecordEventInput {
  /** Authenticated user — must match auth.uid() at the DB layer. */
  userId: string;
  /** Page path. */
  page: string;
  /** Role at the time of render. */
  role: string;
  /** Which layer fired (0/1/2/3/4). */
  firedLayer: 0 | 1 | 2 | 3 | 4;
  /** rule_id when firedLayer === 2; null otherwise. */
  ruleId?: string | null;
  /** Canonical action_id from the action template. */
  actionId: string;
  /** Optional resolver context snapshot. Sanitised by caller. */
  context?: Record<string, unknown> | null;
  /** Authenticated server-side Supabase client (cookie-bound). */
  supabase: SupabaseClient;
}

/**
 * Defence-in-depth: refuse to write if the user has not given Layer 3
 * consent, even if the API route somehow forgets to check.
 *
 * Returns true when consent is on; false otherwise.
 */
async function assertConsent(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('quick_action_user_consent')
    .select('layer_3_consent')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Fail closed: refuse the write rather than leak data on error.
    return false;
  }
  return data?.layer_3_consent === true;
}

/**
 * Write an event row to `quick_action_taps`.
 *
 * Internal helper — public API uses recordImpression / recordTap /
 * recordDismiss for clarity at the call site.
 */
async function writeEvent(
  input: RecordEventInput,
  eventType: TapEventType,
): Promise<void> {
  if (!(await assertConsent(input.supabase, input.userId))) {
    // No consent → silently no-op. We do NOT log the action_id because that
    // would itself be tracking.
    return;
  }

  const { error } = await input.supabase.from('quick_action_taps').insert({
    user_id: input.userId,
    page: input.page,
    role: input.role,
    fired_layer: input.firedLayer,
    rule_id: input.ruleId ?? null,
    action_id: input.actionId,
    event_type: eventType,
    context: input.context ?? null,
  });

  if (error) {
    // Telemetry failure must never crash the resolver path. Log + swallow.
    console.warn('[attention-bar/tap-tracker] insert failed:', error.message);
  }
}

/**
 * Record an impression event — written every time the Attention Bar renders
 * a non-empty action for the user.
 *
 * Fire-and-forget. Returns void promise that resolves when the insert
 * completes (or is silently dropped on consent-off / error).
 */
export async function recordImpression(input: RecordEventInput): Promise<void> {
  return writeEvent(input, 'impression');
}

/**
 * Record a tap event — written when the user clicks the CTA on the bar.
 * The combination of impression + tap rows is what the confidence engine
 * uses to compute tap_rate per action_id.
 */
export async function recordTap(input: RecordEventInput): Promise<void> {
  return writeEvent(input, 'tap');
}

/**
 * Record a dismiss event — written when the user explicitly dismisses the
 * bar (e.g., swipe-away or X tap). Dismissals do NOT lower tap_rate but
 * they help the admin Tab 4 distinguish "user never saw it" from "user saw
 * it and ignored it".
 */
export async function recordDismiss(input: RecordEventInput): Promise<void> {
  return writeEvent(input, 'dismiss');
}

/**
 * Purge tap rows older than 90 days. Called by the nightly cron job (out of
 * scope for this PR but the function is here so the cron stays a 1-line
 * wrapper). Uses the SERVICE-ROLE client because cross-user data deletion
 * cannot be performed under any single user's RLS context.
 *
 * Safe to call: only deletes occurred_at < (now - 90 days).
 *
 * Returns the number of rows deleted.
 */
export async function purgeOlderThan90Days(
  serviceRoleClient: SupabaseClient,
): Promise<number> {
  const cutoffIso = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { count, error } = await serviceRoleClient
    .from('quick_action_taps')
    .delete({ count: 'exact' })
    .lt('occurred_at', cutoffIso);

  if (error) {
    console.warn(
      '[attention-bar/tap-tracker] purgeOlderThan90Days failed:',
      error.message,
    );
    return 0;
  }
  return count ?? 0;
}

/**
 * Cascade-delete every Layer-3-related row for a single user across all
 * three privacy-bearing tables. Used by the "Delete all my data" surface
 * on /system/attention-bar/my-data.
 *
 * Wrapped in a logical transaction-like sequence: if any delete fails we
 * surface the error so the caller can decide. Supabase REST does not
 * expose multi-statement transactions, so this leans on the per-table
 * `ON DELETE CASCADE` to clean up dependents (none here) and on the
 * caller catching errors and surfacing a clear message to the user.
 *
 * Privacy contract: the caller MUST pass `userId = auth.uid()`. Each
 * delete is also gated by RLS (`user_id = auth.uid()` in the policy).
 *
 * Returns counts per table for the verification gate.
 */
export interface CascadeDeleteResult {
  taps: number;
  consent: number;
  audit: number;
}

export async function cascadeDeleteUserData(
  supabase: SupabaseClient,
  userId: string,
): Promise<CascadeDeleteResult> {
  // 1. Tap history
  const tapsResult = await supabase
    .from('quick_action_taps')
    .delete({ count: 'exact' })
    .eq('user_id', userId);
  if (tapsResult.error) {
    throw new Error(`[cascade-delete] taps: ${tapsResult.error.message}`);
  }

  // 2. Audit rows (qau_self_delete policy permits user_id = auth.uid())
  const auditResult = await supabase
    .from('quick_action_audit')
    .delete({ count: 'exact' })
    .eq('user_id', userId);
  if (auditResult.error) {
    throw new Error(`[cascade-delete] audit: ${auditResult.error.message}`);
  }

  // 3. Consent row last — once this is gone no further inserts will succeed.
  const consentResult = await supabase
    .from('quick_action_user_consent')
    .delete({ count: 'exact' })
    .eq('user_id', userId);
  if (consentResult.error) {
    throw new Error(`[cascade-delete] consent: ${consentResult.error.message}`);
  }

  return {
    taps: tapsResult.count ?? 0,
    consent: consentResult.count ?? 0,
    audit: auditResult.count ?? 0,
  };
}
