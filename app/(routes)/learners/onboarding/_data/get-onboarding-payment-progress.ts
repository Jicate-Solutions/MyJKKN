/**
 * Fee position for the Awaiting Payment tier of /learners/onboarding.
 *
 * Wraps fn_onboarding_payment_progress (migration 20260818130000). That RPC —
 * not this file — owns which percentage counts: it reads
 * admission_statuses.threshold_basis and pairs the matching billed/paid amounts,
 * exactly as evaluate_learner_status_after_payment does when it promotes.
 * Deriving any of that here would put the number on screen and the number in
 * the gate on two code paths that drift.
 *
 * Scale: the RPC's predicate is `learner_id = ANY(array)`, which Postgres pushes
 * INTO the aggregate — index scan per learner rather than a full re-aggregate
 * (measured 1.7ms for 50 ids, vs 61ms when the predicate cannot be pushed down).
 * Cost is therefore linear in the ids passed, so passing the whole tier is
 * affordable and is what makes fee-aware sorting possible.
 */

import { createClient } from '@/lib/supabase/server';
import type { OnboardingPaymentProgress } from '@/types/learner-onboarding';

/**
 * Ceiling on ids per call. The tier is ~207 learners today and the scan cap
 * upstream is 5,000; this bounds the worst case at a few hundred ms rather than
 * letting one pathological institution stall the page. Overflow is logged, not
 * silently dropped — a partial fee picture that looks complete is the failure
 * mode worth shouting about.
 */
const MAX_IDS = 2000;

export async function getOnboardingPaymentProgress(
  learnerIds: string[]
): Promise<Map<string, OnboardingPaymentProgress>> {
  const result = new Map<string, OnboardingPaymentProgress>();
  if (learnerIds.length === 0) return result;

  const ids = learnerIds.slice(0, MAX_IDS);
  if (learnerIds.length > MAX_IDS) {
    console.warn(
      `[getOnboardingPaymentProgress] ${learnerIds.length} learners requested; ` +
        `capped at ${MAX_IDS}. Rows beyond the cap render without fee data.`
    );
  }

  try {
    // Cast to `any` — generated Supabase types lag this RPC (2026-08-18), the
    // same convention LearnerProfileService.activateIfReady uses.
    const supabase = (await createClient()) as any;

    const { data, error } = await supabase.rpc('fn_onboarding_payment_progress', {
      p_learner_ids: ids
    });

    // RLS denials and 42501s arrive in `error`, never as a throw.
    if (error) {
      console.error('[getOnboardingPaymentProgress] RPC failed:', error);
      return result;
    }

    // Postgres numerics arrive as strings over PostgREST; coerce once here so
    // every consumer can do arithmetic without re-checking the type.
    for (const row of (data || []) as Record<string, unknown>[]) {
      const id = row.learner_id as string;
      result.set(id, {
        learner_id: id,
        target_code: (row.target_code as string) ?? null,
        target_label: (row.target_label as string) ?? null,
        threshold_pct: row.threshold_pct == null ? null : Number(row.threshold_pct),
        threshold_basis: (row.threshold_basis as OnboardingPaymentProgress['threshold_basis']) ?? 'due_to_date',
        achieved_pct: Number(row.achieved_pct ?? 0),
        basis_billed: Number(row.basis_billed ?? 0),
        basis_paid: Number(row.basis_paid ?? 0),
        basis_balance: Number(row.basis_balance ?? 0),
        total_billed: Number(row.total_billed ?? 0),
        total_paid: Number(row.total_paid ?? 0),
        total_balance: Number(row.total_balance ?? 0),
        amount_to_threshold:
          row.amount_to_threshold == null ? null : Number(row.amount_to_threshold),
        meets_threshold: row.meets_threshold === true,
        has_basis_due: row.has_basis_due === true,
        // NULL is meaningful here and must survive: it means "no schedule",
        // not "due today". Number(null) would be 0 and read as a real date /
        // amount, so each is guarded before coercion.
        next_due_date: (row.next_due_date as string) ?? null,
        next_due_amount:
          row.next_due_amount == null ? null : Number(row.next_due_amount),
        instalments_total: Number(row.instalments_total ?? 0),
        instalments_settled: Number(row.instalments_settled ?? 0)
      });
    }

    return result;
  } catch (error) {
    console.error('[getOnboardingPaymentProgress] Unexpected error:', error);
    return result;
  }
}
