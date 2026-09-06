/**
 * PDE Pace-Cap Service
 * ============================================================================
 *
 * Enforces the policy `pde.rollout.pace_cap_coordinators_per_60d`
 * (seeded by `20260518_pde_cluster_c_rollout_compliance_policies.sql`,
 * read via `getPaceCapCoordinatorsPer60d()` in `pde-policy-reader.ts`).
 *
 * Backing table: `public.pde_coordinator_onboarding_log`
 * (migration `20260519000000_pde_coordinator_onboarding_log.sql`).
 *
 * Flow
 * ----
 * 1. `getRecentOnboardingCount(institutionId?, windowDays = 60)`
 *      → COUNT(*) WHERE onboarded_at > now() - interval 'N days'
 *      → optionally filtered by institution_id (NULL = "global / unscoped").
 *
 * 2. `canOnboardCoordinator(institutionId?)`
 *      → reads the policy via `getPaceCapCoordinatorsPer60d()`
 *      → returns `{allowed, current, cap, window_days, reason?}`.
 *
 * 3. `recordOnboarding(coordinatorId, institutionId?, notes?)`
 *      → calls `canOnboardCoordinator()` as the gate
 *      → throws `PaceCapExceededError` if `!allowed`
 *      → INSERTs the row (RLS limits inserts to super_admin; the gate is
 *        the soft layer, RLS is the hard layer).
 *
 * Pattern alignment: thin class with static methods, mirrors
 * `lib/services/pde-demonstration-service.ts`. All Supabase calls go through
 * `createServerSupabaseClient()` — every consumer runs in a server route.
 *
 * Phase: PDE Tier 2.1 — 2026-05-19.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPaceCapCoordinatorsPer60d } from '@/lib/services/pde-policy-reader';
import {
  PaceCapExceededError,
  type PDECoordinatorOnboardingLog,
  type PaceCapDecision,
} from '@/lib/types/pde-coordinator-onboarding';

const DEFAULT_WINDOW_DAYS = 60;

export class PDEPaceCapService {
  /**
   * Returns the count of rows in `pde_coordinator_onboarding_log` with
   * `onboarded_at` newer than `now() - interval '<windowDays> days'`.
   *
   * When `institutionId` is provided, the count is scoped to that institution
   * AND to global (`institution_id IS NULL`) rows, since a global row consumes
   * the cap for every institution. When `institutionId` is omitted, the count
   * spans all rows in the window.
   */
  static async getRecentOnboardingCount(
    institutionId?: string | null,
    windowDays: number = DEFAULT_WINDOW_DAYS
  ): Promise<number> {
    const supabase = await createServerSupabaseClient();
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('pde_coordinator_onboarding_log')
      .select('id', { count: 'exact', head: true })
      .gte('onboarded_at', windowStart);

    if (institutionId) {
      // Match either the scoped institution OR global (NULL) rows — both consume the cap.
      query = query.or(`institution_id.eq.${institutionId},institution_id.is.null`);
    }

    const { count, error } = await query;
    if (error) {
      // Fail-loud: pace-cap depends on this count; can't soft-fall-back to 0.
      throw new Error(`PDEPaceCapService.getRecentOnboardingCount failed: ${error.message}`);
    }
    return count ?? 0;
  }

  /**
   * Decides whether a new coordinator onboarding is allowed RIGHT NOW.
   * Pure read — no rows written. Safe to call from a UI button-disable check.
   */
  static async canOnboardCoordinator(
    institutionId?: string | null,
    windowDays: number = DEFAULT_WINDOW_DAYS
  ): Promise<PaceCapDecision> {
    const [cap, current] = await Promise.all([
      getPaceCapCoordinatorsPer60d(institutionId),
      this.getRecentOnboardingCount(institutionId, windowDays),
    ]);

    const allowed = current < cap;
    const decision: PaceCapDecision = {
      allowed,
      current,
      cap,
      window_days: windowDays,
    };
    if (!allowed) {
      decision.reason =
        `Pace-cap exceeded: ${current} coordinators onboarded in last ${windowDays} days ` +
        `(cap = ${cap}). Adjust pde.rollout.pace_cap_coordinators_per_60d or wait for the window to slide.`;
    }
    return decision;
  }

  /**
   * Records a coordinator onboarding event. Throws `PaceCapExceededError` if
   * the gate refuses. RLS additionally restricts INSERT to super_admin — the
   * gate is the soft layer, RLS the hard one.
   *
   * Returns the `id` of the newly inserted row (full row read is unnecessary
   * for the typical call site, which is the onboarding wizard's "confirm"
   * button).
   */
  static async recordOnboarding(
    coordinatorId: string,
    institutionId?: string | null,
    notes?: string | null
  ): Promise<{ id: string }> {
    const decision = await this.canOnboardCoordinator(institutionId);
    if (!decision.allowed) {
      throw new PaceCapExceededError(decision);
    }

    const supabase = await createServerSupabaseClient();
    const { data: authUser } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('pde_coordinator_onboarding_log')
      .insert({
        coordinator_id: coordinatorId,
        institution_id: institutionId ?? null,
        onboarded_by: authUser?.user?.id ?? null,
        notes: notes ?? null,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`PDEPaceCapService.recordOnboarding INSERT failed: ${error.message}`);
    }
    return { id: data.id };
  }

  /**
   * Convenience reader for admin dashboards. Returns the most recent N rows
   * scoped to an institution (or globally if `institutionId` omitted). RLS
   * filters the result set automatically.
   */
  static async listRecent(
    institutionId?: string | null,
    limit = 50
  ): Promise<PDECoordinatorOnboardingLog[]> {
    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from('pde_coordinator_onboarding_log')
      .select('*')
      .order('onboarded_at', { ascending: false })
      .limit(limit);

    if (institutionId) {
      query = query.or(`institution_id.eq.${institutionId},institution_id.is.null`);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`PDEPaceCapService.listRecent failed: ${error.message}`);
    }
    return (data ?? []) as PDECoordinatorOnboardingLog[];
  }
}
