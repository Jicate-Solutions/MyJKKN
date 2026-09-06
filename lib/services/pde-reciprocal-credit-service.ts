/**
 * PDE Reciprocal Credit Service
 * ============================================================================
 *
 * Grants and aggregates credits stored in `public.pde_reciprocal_credits`
 * (migration `20260519_pde_reciprocal_credits.sql`) under the policy
 * `pde.quests.compensation_model` (seeded by
 * `20260518_pde_cluster_d_quests_supply_policies.sql`).
 *
 * The policy value is a string enum:
 *   - 'voluntary_recognition' → no compensation, no credit row inserted
 *   - 'reciprocal_credit'     → INSERT credit row (this service's main path)
 *   - 'honorarium_per_quest'  → cash compensation, OUT of scope here
 *                              (handled by a future payroll integration)
 *
 * The service treats anything other than `'reciprocal_credit'` as "credit
 * grants disabled". A `granted: false` return is a normal outcome, not an
 * error.
 *
 * Pattern alignment: mirrors `PDEPaceCapService` —
 *   - thin class with static methods
 *   - server-only (uses `createServerSupabaseClient`)
 *   - all consumers run in server routes
 *
 * Phase: PDE Tier 3 — T3.3 — 2026-05-19.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getQuestsCompensationModel } from '@/lib/services/pde-policy-reader';
import type {
  CreditType,
  PdeReciprocalCredit,
  LearnerCreditTotals,
  GrantResult,
} from '@/lib/types/pde-reciprocal';

/**
 * Per-credit-type default values. Service-layer defaults — kept here (not in
 * the migration) so they're tunable without a schema change. If the
 * `compensation_model` policy ever grows to an object with explicit values,
 * those override these defaults.
 */
const DEFAULT_CREDIT_VALUES: Record<CreditType, number> = {
  quest_completion: 1.0,
  validator_grant: 0.5,
  peer_attestation: 0.25,
};

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export class PDEReciprocalCreditService {
  /**
   * Grants a `quest_completion` credit to a learner when the policy is enabled.
   *
   * Returns `{ granted: false, reason }` when the policy is not
   * `'reciprocal_credit'` — callers should treat this as a normal outcome.
   *
   * Optional `client` argument supports dependency injection for tests; in
   * production paths, omit it and the service spins up its own server client.
   */
  static async grantCreditForQuestCompletion(
    learnerId: string,
    questId: string,
    options?: { institutionId?: string | null; client?: SupabaseClient; notes?: string | null }
  ): Promise<GrantResult> {
    const institutionId = options?.institutionId ?? null;
    const model = await getQuestsCompensationModel(institutionId);
    if (model !== 'reciprocal_credit') {
      return {
        granted: false,
        reason: `compensation_model='${model}' — reciprocal credits disabled.`,
      };
    }

    const supabase = options?.client ?? (await createServerSupabaseClient());
    const { data: authUser } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('pde_reciprocal_credits')
      .insert({
        learner_id: learnerId,
        quest_id: questId,
        credit_type: 'quest_completion',
        credit_value: DEFAULT_CREDIT_VALUES.quest_completion,
        granted_by: authUser?.user?.id ?? null,
        institution_id: institutionId,
        notes: options?.notes ?? null,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(
        `PDEReciprocalCreditService.grantCreditForQuestCompletion INSERT failed: ${error.message}`
      );
    }
    return { granted: true, credit_id: data.id };
  }

  /**
   * Grants a `validator_grant` credit to a validator (faculty / peer) when
   * the policy is enabled. The `demonstrationId` is recorded in `notes` for
   * traceability since `quest_id` is the primary foreign key.
   */
  static async grantCreditForValidator(
    validatorId: string,
    demonstrationId: string,
    options?: { institutionId?: string | null; client?: SupabaseClient }
  ): Promise<GrantResult> {
    const institutionId = options?.institutionId ?? null;
    const model = await getQuestsCompensationModel(institutionId);
    if (model !== 'reciprocal_credit') {
      return {
        granted: false,
        reason: `compensation_model='${model}' — validator credits disabled.`,
      };
    }

    const supabase = options?.client ?? (await createServerSupabaseClient());
    const { data: authUser } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('pde_reciprocal_credits')
      .insert({
        learner_id: validatorId,
        quest_id: null,
        credit_type: 'validator_grant',
        credit_value: DEFAULT_CREDIT_VALUES.validator_grant,
        granted_by: authUser?.user?.id ?? null,
        institution_id: institutionId,
        notes: `validator_grant for demonstration_id=${demonstrationId}`,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(
        `PDEReciprocalCreditService.grantCreditForValidator INSERT failed: ${error.message}`
      );
    }
    return { granted: true, credit_id: data.id };
  }

  /**
   * Returns the learner's credit totals with per-type breakdown.
   * RLS scopes the query — learners see their own rows, super_admins all,
   * institution faculty same-institution.
   */
  static async getLearnerCredits(
    learnerId: string,
    options?: { client?: SupabaseClient }
  ): Promise<LearnerCreditTotals> {
    const supabase = options?.client ?? (await createServerSupabaseClient());
    const { data, error } = await supabase
      .from('pde_reciprocal_credits')
      .select('credit_type, credit_value')
      .eq('learner_id', learnerId);

    if (error) {
      throw new Error(
        `PDEReciprocalCreditService.getLearnerCredits SELECT failed: ${error.message}`
      );
    }

    const rows = (data ?? []) as Pick<PdeReciprocalCredit, 'credit_type' | 'credit_value'>[];
    const by_type: Record<CreditType, number> = {
      quest_completion: 0,
      validator_grant: 0,
      peer_attestation: 0,
    };
    let total = 0;
    for (const row of rows) {
      const value = Number(row.credit_value) || 0;
      by_type[row.credit_type] += value;
      total += value;
    }
    return {
      learner_id: learnerId,
      total,
      by_type,
      row_count: rows.length,
    };
  }

  /**
   * Lists the most recent N credit rows for a learner — used by learner
   * dashboards to show the "what was credited and why" trail.
   */
  static async listLearnerCreditRows(
    learnerId: string,
    limit = 50,
    options?: { client?: SupabaseClient }
  ): Promise<PdeReciprocalCredit[]> {
    const supabase = options?.client ?? (await createServerSupabaseClient());
    const { data, error } = await supabase
      .from('pde_reciprocal_credits')
      .select('*')
      .eq('learner_id', learnerId)
      .order('granted_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(
        `PDEReciprocalCreditService.listLearnerCreditRows SELECT failed: ${error.message}`
      );
    }
    return (data ?? []) as PdeReciprocalCredit[];
  }
}
