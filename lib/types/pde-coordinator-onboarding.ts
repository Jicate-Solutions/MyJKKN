/**
 * PDE Coordinator Onboarding — shared types
 * ============================================================================
 *
 * Backing table: `public.pde_coordinator_onboarding_log`
 * (migration `20260519000000_pde_coordinator_onboarding_log.sql`).
 *
 * Backing policy: `pde.rollout.pace_cap_coordinators_per_60d`
 * (read via `getPaceCapCoordinatorsPer60d()` in pde-policy-reader.ts).
 *
 * Phase: PDE Tier 2.1 (pace-cap enforcement) — 2026-05-19.
 */

/** One row of `public.pde_coordinator_onboarding_log`. */
export interface PDECoordinatorOnboardingLog {
  id: string;
  coordinator_id: string;
  institution_id: string | null;
  onboarded_at: string;          // ISO timestamp
  onboarded_by: string | null;
  notes: string | null;
  created_at: string;            // ISO timestamp
}

/** Input shape when recording a new onboarding (id, timestamps, and audit cols are server-filled). */
export interface RecordOnboardingInput {
  coordinator_id: string;
  institution_id?: string | null;
  notes?: string | null;
}

/**
 * Pace-cap decision returned by `PDEPaceCapService.canOnboardCoordinator`.
 *
 * - `allowed`     — `true` iff `current < cap`.
 * - `current`     — count of rows in the rolling window (capped at `window_days`).
 * - `cap`         — value of `pde.rollout.pace_cap_coordinators_per_60d`.
 * - `window_days` — width of the rolling window (default 60).
 * - `reason`      — human-readable explanation when `allowed === false`.
 */
export interface PaceCapDecision {
  allowed: boolean;
  current: number;
  cap: number;
  window_days: number;
  reason?: string;
}

/** Thrown by `recordOnboarding` when the pace-cap gate refuses an insert. */
export class PaceCapExceededError extends Error {
  readonly current: number;
  readonly cap: number;
  readonly window_days: number;

  constructor(decision: PaceCapDecision) {
    super(
      decision.reason ??
        `PDE coordinator pace-cap exceeded: ${decision.current}/${decision.cap} in last ${decision.window_days} days.`
    );
    this.name = 'PaceCapExceededError';
    this.current = decision.current;
    this.cap = decision.cap;
    this.window_days = decision.window_days;
  }
}
