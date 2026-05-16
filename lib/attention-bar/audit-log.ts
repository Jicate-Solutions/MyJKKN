/**
 * Attention Bar — universal audit log writer + retention helpers.
 *
 * Spec: specs/attention-bar-5-layer-system.md §3 (table `quick_action_audit`)
 * + §6 admin tab 6 (audit log viewer).
 *
 * Phase 7 introduces this module to close two observability gaps left by the
 * earlier phases:
 *
 *   1. Only Layer 4 was writing to `quick_action_audit` (via
 *      `cost-tracker.recordLayer4Call`). Layers 0/1/2/3 fired silently.
 *      The spec is explicit: "every render produces an audit row: which
 *      layer fired, why, what the user did next" (§1 principle 5).
 *
 *   2. There was no retention pruner for the audit table. Spec §3 Layer
 *      audit comment: "Retention: 30 days, then aggregate-only via nightly
 *      cron." Phase 7's prune cron wires this up.
 *
 * Performance contract:
 *   - `recordResolveAudit()` is fire-and-forget. Callers MUST NOT await it
 *     on the user-facing resolver path; use `void recordResolveAudit(...)`
 *     instead. The function itself catches its own errors and never throws.
 *   - DB writes use the service-role client because audit rows describe
 *     resolver decisions (system-managed data) and the RLS policy on
 *     `quick_action_audit` is admin-read-only — no per-user insert path.
 *
 * Privacy contract:
 *   - We persist `user_id`, `page`, `role`, `fired_layer`, `rule_id`,
 *     `action_id`, and the per-layer `trace`. The trace is whatever
 *     each evaluator's TraceEntry produced — never raw user content,
 *     never the LLM prompt, never the LLM response text.
 *   - The 30-day prune below enforces the retention rule mechanically.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ResolvedAction, TraceEntry } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveAuditInput {
  /** Authenticated user — may be null for anonymous resolves (rare; e.g., 401 path). */
  userId: string | null;
  /** Page path the resolver ran for. */
  page: string;
  /** Role used during resolution. */
  role: string;
  /** Resolved action — null when the entire cascade returned null (defensive). */
  resolved: ResolvedAction | null;
  /** Full per-layer trace from the resolver. */
  trace: TraceEntry[];
}

export interface AuditPruneResult {
  deleted: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// recordResolveAudit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a row to `quick_action_audit` describing one resolve() call.
 *
 * NEVER awaits a network call on the caller's hot path. The function is
 * `async` only because the underlying Supabase client is — but every error
 * is caught and logged, never re-thrown. Use as:
 *
 *     void recordResolveAudit({ ... });
 *
 * The leading `void` keyword documents the fire-and-forget intent and
 * silences the no-floating-promises lint rule.
 *
 * Special-case: when `resolved` is null AND `trace` is empty, this is the
 * "catastrophic empty cascade" path — Layer 1 catch-all should have caught
 * everything. We still write a row (with `fired_layer = -1` placeholder)
 * so the admin Tab 6 audit log surfaces the bug.
 */
export async function recordResolveAudit(input: ResolveAuditInput): Promise<void> {
  try {
    const supabase = createServiceRoleClient();

    // The DB column is `fired_layer SMALLINT NOT NULL`. We use -1 as the
    // sentinel for "cascade returned null" so the admin UI can filter it
    // out separately from real layer hits.
    const firedLayer = input.resolved?.firedLayer ?? -1;

    const { error } = await supabase.from('quick_action_audit').insert({
      user_id: input.userId,
      page: input.page,
      role: input.role,
      fired_layer: firedLayer,
      rule_id: input.resolved?.ruleId ?? null,
      action_id: input.resolved?.id ?? null,
      trace: {
        // The trace array as the resolver produced it.
        layers: input.trace,
        // Sentinel flag so post-hoc dashboards can spot the catastrophic path
        // without re-deriving from fired_layer.
        cascade_empty: input.resolved === null,
        recorded_at: new Date().toISOString(),
      },
    });

    if (error) {
      // Audit failure must never crash the resolver path. Log + swallow.
      console.warn('[attention-bar/audit-log] insert failed:', error.message);
    }
  } catch (err) {
    // Defensive: if even building the client throws, we still don't want
    // to surface the error. The resolver has already returned to the user.
    console.warn(
      '[attention-bar/audit-log] recordResolveAudit threw:',
      err instanceof Error ? err.message : err,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// purgeAuditOlderThan30Days
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete audit rows older than 30 days.
 *
 * Spec §3 Layer audit comment: "Retention: 30 days, then aggregate-only via
 * nightly cron." For v1 we do the simple thing — straight DELETE. A future
 * PR can add an aggregation step (renders/layer/day rollup table) before
 * the delete so the admin dashboard's lifetime-stats view keeps working.
 *
 * Idempotent. Safe to call as often as needed.
 */
export async function purgeAuditOlderThan30Days(): Promise<AuditPruneResult> {
  const supabase = createServiceRoleClient();

  const cutoffIso = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from('quick_action_audit')
    .delete()
    .lt('rendered_at', cutoffIso)
    .select('id');

  if (error) {
    throw new Error(
      `[attention-bar/audit-log] purgeAuditOlderThan30Days failed: ${error.message}`,
    );
  }

  return { deleted: data?.length ?? 0 };
}
