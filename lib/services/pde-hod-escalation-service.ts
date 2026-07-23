/**
 * PDE HOD Blocking Escalation Service
 * ============================================================================
 *
 * Wires the `pde.rollout.hod_blocking_escalation` policy to an enforcement
 * decision. When an HOD blocks a PDE demonstration (e.g. refuses to allow
 * faculty validation, refuses departmental rollout), this service reads the
 * institution-scoped policy and returns the action the caller must take.
 *
 * Policy values (see lib/services/pde-policy-reader.ts):
 *   - `respect_no`               → HOD's NO stands; no further routing.
 *   - `bypass_hod_to_coordinator`→ Route the demonstration to the institution's
 *                                  PDE coordinator (or placeholder if no
 *                                  coordinator resolvable in current scope).
 *   - `dean_kpi`                 → Log block to the dean's KPI dashboard for
 *                                  visibility; HOD's NO stands operationally.
 *
 * Pattern alignment:
 *   - Consumer-only service, no migration/table of its own.
 *   - Fail-soft: if coordinator/dean lookup fails, we still return a decision
 *     with a placeholder target string so the caller can continue.
 *
 * Tier 2 Item 2 of PDE consumer wiring (spec: pde-roadmap-tier-1-6-2026-05-19.md).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getHodBlockingEscalation,
  type HodBlockingEscalation,
} from '@/lib/services/pde-policy-reader';

// ===========================================================================
// Types
// ===========================================================================

export type HodBlockResolutionAction =
  | 'respect'
  | 'bypass_to_coordinator'
  | 'log_to_dean_kpi';

export interface HodBlockInput {
  learnerId: string;
  blockedBy: string; // HOD's profile_id
  demonstrationId: string;
  reason: string;
  institutionId?: string | null;
}

export interface HodBlockDecision {
  action: HodBlockResolutionAction;
  policyMode: HodBlockingEscalation;
  /** Resolved target profile_id (coordinator or dean) when applicable, else placeholder. */
  target?: string;
  /** Human-readable notification line the caller may surface in audit/UI. */
  notification?: string;
}

// ===========================================================================
// Service
// ===========================================================================

export class PDEHodEscalationService {
  /**
   * Read the active HOD-blocking-escalation policy and return the action the
   * caller must take for this block event.
   *
   * Caller is responsible for actually performing the routing (e.g. creating
   * a notification row, updating the demonstration record, posting to the
   * dean's KPI dashboard). This service is decision-only.
   */
  static async resolveBlockAction(input: HodBlockInput): Promise<HodBlockDecision> {
    const policyMode = await getHodBlockingEscalation(input.institutionId ?? null);

    switch (policyMode) {
      case 'respect_no':
        return {
          action: 'respect',
          policyMode,
          notification: `HOD block respected for demonstration ${input.demonstrationId}. No further routing per policy.`,
        };

      case 'bypass_hod_to_coordinator': {
        const target = await PDEHodEscalationService.resolveCoordinator(input.institutionId ?? null);
        return {
          action: 'bypass_to_coordinator',
          policyMode,
          target,
          notification: `HOD block bypassed; demonstration ${input.demonstrationId} routed to coordinator (${target}) per policy.`,
        };
      }

      case 'dean_kpi':
      default: {
        const target = await PDEHodEscalationService.resolveDean(input.institutionId ?? null);
        return {
          action: 'log_to_dean_kpi',
          policyMode: policyMode ?? 'dean_kpi',
          target,
          notification: `HOD block logged to dean KPI dashboard (dean=${target}) for demonstration ${input.demonstrationId}.`,
        };
      }
    }
  }

  /**
   * Resolve the PDE coordinator for an institution.
   *
   * Looks up the first profile holding the `pde_coordinator` role within the
   * institution scope. Falls back to a placeholder string when unresolvable
   * so the caller can still proceed (and surface the placeholder in audit).
   */
  static async resolveCoordinator(institutionId?: string | null): Promise<string> {
    const placeholder = 'coordinator_lookup_pending';
    try {
      const supabase = await createServerSupabaseClient();
      let query = (supabase as any)
        .from('user_role_assignments')
        .select('profile_id')
        .eq('role_key', 'pde_coordinator');
      if (institutionId) query = query.eq('institution_id', institutionId);
      const { data, error } = await query.limit(1);
      if (error || !data || data.length === 0) return placeholder;
      return (data[0]?.profile_id as string | undefined) ?? placeholder;
    } catch {
      return placeholder;
    }
  }

  /**
   * Resolve the dean for an institution.
   *
   * Mirrors coordinator lookup; placeholder when unresolvable.
   */
  static async resolveDean(institutionId?: string | null): Promise<string> {
    const placeholder = 'dean_lookup_pending';
    try {
      const supabase = await createServerSupabaseClient();
      let query = (supabase as any)
        .from('user_role_assignments')
        .select('profile_id')
        .eq('role_key', 'dean');
      if (institutionId) query = query.eq('institution_id', institutionId);
      const { data, error } = await query.limit(1);
      if (error || !data || data.length === 0) return placeholder;
      return (data[0]?.profile_id as string | undefined) ?? placeholder;
    } catch {
      return placeholder;
    }
  }
}
