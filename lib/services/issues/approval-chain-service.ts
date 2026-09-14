// lib/services/issues/approval-chain-service.ts
// ============================================================================
// InstaSolver — ApprovalChainService (purchase lane, I5).
//
// A purchase raised through InstaSolver clears a tiered approval before it
// becomes a Procurement purchase request. This service builds that chain and
// advances it. Snapshot-at-build-time semantics, cloned from
// `lib/services/hr/leave-service.ts buildApprovalChain` — a later threshold
// edit does not disturb a chain already in flight.
//
// Seed budget bands (super_admin-editable rows in
// procurement_approval_thresholds):
//   - HOD          ≤ ₹10,000
//   - Principal    ₹10,000.01 – ₹50,000   (paise-exact: the bands are contiguous)
//   - super_admin  > ₹50,000
//
// REWRITTEN 2026-09-14 (specs/instasolver-2026-09-14.md). Two changes:
//
//   1. The tier table is now `procurement_approval_thresholds`, not
//      `requirement_approval_thresholds`. Identical columns; only the module
//      it belongs to changed (I3/I5 send purchases to Procurement).
//
//   2. advanceChain / getCurrentApprover / isChainComplete no longer read and
//      write a row themselves. They used to SELECT and UPDATE
//      `requirement_requests.approval_chain` — a table this rewrite drops and
//      that was never created in production. `procurement_purchase_requests`
//      has no approval_chain column to point them at instead, and adding one
//      to a live Procurement table is not this lane's to make. So the three
//      are now pure functions over the chain array: the Procurement caller
//      reads the chain, passes it in, and persists what comes back, in
//      whichever column that module decides to hold it. Same names, same
//      order of operations, no hidden I/O.
//
// Spec:      specs/instasolver-2026-09-14.md
// Migration: supabase/migrations/20261213100000_instasolver_substrate_v2.sql
// Pattern source: lib/services/hr/leave-service.ts (buildApprovalChain)
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ApprovalChainStep,
  BuildChainInput,
} from '@/lib/types/issues';

/**
 * The minimum this service needs from a Supabase client. Narrow on purpose: a
 * server route can hand in its own cookie-scoped or service-role client without
 * the two client types having to agree on anything else.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ThresholdReader = { from: (table: string) => any };

/**
 * WHY THE CLIENT IS A PARAMETER AND NOT A MODULE-SCOPE SINGLETON.
 *
 * This class used to hold `private static supabase = createClientSupabaseClient()`,
 * evaluated at module load. Two things were wrong with that, and the second one
 * is fatal now that the threshold table has RLS:
 *
 *   1. A BROWSER client built at import time runs on the server too — this
 *      module is importable from a route handler, and Next will happily
 *      evaluate it there.
 *   2. `procurement_approval_thresholds_select` now requires
 *      `auth.role() = 'authenticated'` AND institution access. A browser
 *      client constructed outside a request has no session, so every SELECT
 *      returns ZERO rows — and since buildApprovalChain now throws when no
 *      band matches (rather than silently returning an empty, "fully approved"
 *      chain), every server-side call would throw. Silent zero rows became a
 *      loud failure the moment the empty chain stopped being acceptable, which
 *      is how this surfaced.
 *
 * So: server callers pass their own client. Browser callers may omit it and get
 * the browser client, resolved LAZILY and only when a `window` actually exists —
 * never at import time.
 */
function resolveClient(explicit?: ThresholdReader): ThresholdReader {
  if (explicit) return explicit;
  if (typeof window === 'undefined') {
    throw new Error(
      'ApprovalChainService: no Supabase client supplied. On the server you must pass one ' +
        '(a route handler\'s cookie-scoped client, or a service-role client) — the browser ' +
        'client has no session there, procurement_approval_thresholds RLS would return zero ' +
        'rows, and the call would fail as though no approval tier existed.'
    );
  }
  return createClientSupabaseClient() as unknown as ThresholdReader;
}

/**
 * Validate and normalise the amount BEFORE it is matched against a band.
 *
 * `Math.max(0, input.estimated_budget ?? 0)` used to sit here, which is three
 * bugs wearing one coat: a null or undefined budget became a legitimate ₹0
 * request routed to the HOD, a negative budget became ₹0 instead of being
 * rejected, and NaN propagated into every comparison as false — matching no
 * band. None of them told anyone.
 *
 * Rounding to 2 dp is not cosmetic either. The bands are `numeric(12,2)`, so
 * that is the resolution the database stores and compares at. An amount with
 * more precision than the bands — ₹50,000.005, or a third of ₹50,000.01 —
 * would otherwise fall between two contiguous bands and match neither.
 */
function normaliseBudget(raw: unknown): number {
  if (raw === null || raw === undefined) {
    throw new Error(
      'ApprovalChainService: estimated_budget is required and was ' + String(raw) +
        '. A missing amount is not a ₹0 purchase.'
    );
  }
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(
      `ApprovalChainService: estimated_budget must be a finite number, got ${JSON.stringify(raw)}.`
    );
  }
  if (n < 0) {
    throw new Error(
      `ApprovalChainService: estimated_budget must not be negative, got ${n}.`
    );
  }
  // numeric(12,2) semantics. Round half away from zero, as PostgreSQL does.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export class ApprovalChainService {

  // --------------------------------------------------------------------------
  // Build (snapshot at request create-time)
  // --------------------------------------------------------------------------

  /**
   * Build the chain by reading `procurement_approval_thresholds` for the given
   * institution + budget band. Returns the chain ordered by step_order.
   *
   * `client` is required on the server and optional in the browser — see
   * resolveClient() above for why there is no module-scope singleton.
   *
   * PER-AUTHORITY OVERRIDE, NOT ALL-OR-NOTHING. Per-institution rows and
   * platform-wide rows are merged by `approval_authority`: an institution row
   * wins for the authority it names, and platform rows fill in the rest. This
   * used to key on `instRows.length === 0`, so ONE institution row shadowed all
   * three platform bands — a college that overrode only its HOD band ended up
   * with a single-tier chain, and a ₹5,00,000 purchase was approved by an HOD
   * alone. Overriding one band must not delete the others.
   */
  static async buildApprovalChain(
    input: BuildChainInput,
    client?: ThresholdReader
  ): Promise<ApprovalChainStep[]> {
    const budget = normaliseBudget(input.estimated_budget);
    const db = resolveClient(client);
    const COLUMNS =
      'approval_authority, min_amount, max_amount, escalate_after_days, fallback_role, is_active';

    type ThresholdRow = {
      approval_authority: string;
      min_amount: number;
      max_amount: number | null;
      escalate_after_days: number;
      fallback_role: string | null;
      is_active: boolean;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: instRows, error: instErr } = await (db as any)
      .from('procurement_approval_thresholds')
      .select(COLUMNS)
      .eq('institution_id', input.institution_id)
      .eq('is_active', true);
    if (instErr) throw instErr;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: platRows, error: platErr } = await (db as any)
      .from('procurement_approval_thresholds')
      .select(COLUMNS)
      .is('institution_id', null)
      .eq('is_active', true);
    if (platErr) throw platErr;

    // Merge per authority: institution row wins, platform row fills the gap.
    const byAuthority = new Map<string, ThresholdRow>();
    for (const r of (platRows ?? []) as ThresholdRow[]) {
      byAuthority.set(r.approval_authority, r);
    }
    for (const r of (instRows ?? []) as ThresholdRow[]) {
      byAuthority.set(r.approval_authority, r);
    }
    const rows = Array.from(byAuthority.values());

    // Filter to bands whose range covers the budget, sort ascending by
    // min_amount so HOD comes first, super_admin last.
    const matched = rows
      .filter(
        (r) =>
          budget >= r.min_amount && (r.max_amount === null || budget <= r.max_amount)
      )
      .sort((a, b) => a.min_amount - b.min_amount);

    // NO BAND MATCHED IS AN ERROR, NEVER AN EMPTY CHAIN.
    //
    // Returning [] here used to mean "approved by nobody": getCurrentApprover([])
    // is null, so isChainComplete([]) was true and a purchase with no approver
    // read as fully approved. The bands are seeded contiguous to the paise, so
    // reaching this line means the configuration is broken (a tier deleted, an
    // institution override with a hole in it, or a negative budget) — and a
    // broken spending policy must stop the request, not wave it through.
    if (matched.length === 0) {
      throw new Error(
        `No approval tier covers ₹${budget} (institution ${input.institution_id}). ` +
          `procurement_approval_thresholds must cover every amount with no gap. ` +
          `Refusing to build an empty approval chain — an empty chain would read as fully approved.`
      );
    }

    return matched.map((r, i) => ({
      step_order: i + 1,
      approver_role: r.approval_authority,
      approver_user_id: null, // resolved at decide time by role lookup
      status: 'pending',
      min_amount: r.min_amount,
      max_amount: r.max_amount,
      escalate_after_days: r.escalate_after_days,
      fallback_role: r.fallback_role,
      decided_at: null,
      decided_by: null,
      comment: null,
    }));
  }

  // --------------------------------------------------------------------------
  // Advance (when an approver acts)
  // --------------------------------------------------------------------------

  /**
   * Mark the current pending step as approved/rejected and return the updated
   * chain. The caller persists it.
   *
   * If 'approve' AND another pending step exists, the request stays in its
   * current status (the next-step approver picks it up). If 'approve' AND this
   * was the final step, the caller transitions the request to approved. If
   * 'reject', the caller transitions it to rejected and every later pending
   * step is marked 'skipped' here for audit clarity.
   *
   * To decide what to do with the returned chain, ask
   * {@link isChainApproved} — not isChainComplete, which is true of a rejected
   * chain as well.
   *
   * Returns the input unchanged when the chain is already fully decided.
   * The input array is never mutated.
   */
  static advanceChain(
    chain: ApprovalChainStep[],
    actorUserId: string,
    action: 'approve' | 'reject',
    comment?: string
  ): ApprovalChainStep[] {
    const next = (chain ?? []).slice();
    const idx = next.findIndex((s) => s.status === 'pending');
    if (idx === -1) {
      // No pending step — chain already terminal. No-op.
      return next;
    }

    const now = new Date().toISOString();
    next[idx] = {
      ...next[idx],
      status: action === 'approve' ? 'approved' : 'rejected',
      decided_at: now,
      decided_by: actorUserId,
      comment: comment ?? null,
    };

    // On reject, mark all later pending steps as 'skipped' for clarity
    if (action === 'reject') {
      for (let i = idx + 1; i < next.length; i++) {
        if (next[i].status === 'pending') {
          next[i] = { ...next[i], status: 'skipped' };
        }
      }
    }

    return next;
  }

  // --------------------------------------------------------------------------
  // Read helpers
  // --------------------------------------------------------------------------

  /**
   * Return the current pending step (with approver_role + step_order), or
   * null if no step is pending. Used by the UI to surface "awaiting approval
   * from <role>" badges.
   *
   * Null means "nothing pending", which is ALSO what an empty chain and a
   * rejected chain look like. Do not read null as approval — see
   * {@link isChainApproved}.
   */
  static getCurrentApprover(
    chain: ApprovalChainStep[]
  ): { step_order: number; approver_role: string; approver_user_id: string | null } | null {
    const pending = (chain ?? []).find((s) => s.status === 'pending');
    if (!pending) return null;

    return {
      step_order: pending.step_order,
      approver_role: pending.approver_role,
      approver_user_id: pending.approver_user_id,
    };
  }

  /**
   * DECIDED — approved OR rejected. Not "approved".
   *
   * True when the chain has at least one step and no step is still pending. A
   * REJECTED chain is decided, so this returns true for it: after a rejection
   * advanceChain marks the rejected step and skips the rest, leaving nothing
   * pending. That is the documented meaning and it is deliberately kept.
   *
   * ⚠️ DO NOT USE THIS TO DECIDE WHETHER A PURCHASE MAY PROCEED. Use
   * {@link isChainApproved}. The name reads like a green light and is not one;
   * a caller that gates spending on "complete" would release money on a
   * rejected request.
   *
   * AN EMPTY CHAIN IS NOT DECIDED. `getCurrentApprover([])` is null because
   * there is nothing pending, and reading that alone as decided turned a
   * purchase nobody approved into a purchase fully approved. A chain of zero
   * steps means no approval was ever sought, which is the opposite of decided.
   * buildApprovalChain now refuses to produce one, and this is the second lock
   * on the same door: a chain that arrives empty from anywhere — a stored row
   * written before that fix, a caller that builds its own array — still cannot
   * clear the gate.
   */
  static isChainComplete(chain: ApprovalChainStep[]): boolean {
    if (!chain || chain.length === 0) return false;
    return this.getCurrentApprover(chain) === null;
  }

  /**
   * APPROVED — the only question a spending gate should ask.
   *
   * True when the chain has at least one step, at least one step was actually
   * approved, and every step that was not skipped is approved. False for an
   * empty chain, for a chain with anything still pending, for any chain
   * carrying a rejection, and for the degenerate all-skipped chain (nobody
   * decided anything, so nobody approved anything).
   *
   * Skipped steps are tolerated because advanceChain marks later pending steps
   * 'skipped' on a rejection — but a rejection also leaves a 'rejected' step,
   * which fails the every() below. A skip can also arise from a shortened
   * chain, and those are genuinely not required.
   */
  static isChainApproved(chain: ApprovalChainStep[]): boolean {
    if (!chain || chain.length === 0) return false;
    const decided = chain.filter((s) => s.status !== 'skipped');
    if (decided.length === 0) return false;
    return decided.every((s) => s.status === 'approved');
  }
}
