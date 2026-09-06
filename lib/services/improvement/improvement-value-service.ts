// =====================================================================
// Improvement Board — recording what a verified fix was actually worth
// =====================================================================
//
// WHY THIS FILE EXISTS
//   improvement_ideas has carried `verified_value_inr`, `value_verified_at`
//   and `value_holds` since the board was created in July 2026, and until
//   2026-09-06 NOTHING in this repository wrote any of them. Measured on
//   production that day: 55 ideas, 0 with a verified value, 0 with a
//   value_holds verdict, 0 ever reaching status 'verified'.
//
//   That is not a backlog, it is a missing writer — and two finished features
//   are dead behind it:
//
//     1. fn_case_study_start refuses unless `status='verified' AND
//        value_holds IS TRUE`, so no learner can write up their own fix.
//     2. lib/services/solutions/resident-promotion-service.ts promotes a
//        resident into sh_builders off verified ideas and sums
//        verified_value_inr — it can never fire.
//
//   The write itself lives in the database, in the SECURITY DEFINER RPC
//   `fn_improvement_set_verified_value` (migration 20261111000000), for the
//   same reason `setStatus` and `setResolution` do: improvement_idea_activity
//   has no INSERT policy at all, so the audit row cannot be written any other
//   way. This module is the single TypeScript entry point to it.
//
// WHAT IS MIRRORED HERE, AND WHY
//   `validateVerifiedValue` below is a deliberate second copy of the RPC's
//   refusal rules. Two copies of one rule is normally a smell; it is done here
//   for one specific reason and pinned by one specific test:
//
//     * a caller can refuse a nonsense entry without a round-trip, and say the
//       same thing the server would have said;
//     * __tests__/lib/improvement-board/verified-value.test.ts reads the
//       migration SQL off disk and fails if this copy and that one drift.
//
//   That test exists because this module already has a scar to point at:
//   the board's transition map and fn_improvement_set_status's transition
//   guard were two copies of one rule with nothing linking them, and they
//   drifted silently from July to September 2026 (see
//   __tests__/lib/improvement-board/manager-transitions.test.ts).
//
// WHAT THIS MODULE DOES NOT DO
//   * does not move status — fn_improvement_set_status owns that, and the RPC
//     refuses to do it too. Recording a value and closing the loop are two
//     acts, performed in that order;
//   * does not write estimated_value_inr — that is the author's claim, not
//     the manager's measurement;
//   * adds no UI.
//
// Created: 2026-09-06.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { ImprovementIdeaStatus } from '@/lib/services/improvement/improvement-service';

const MODULE = 'improvement/value';

/**
 * The only two statuses at which a verified value may be recorded.
 *
 * DECIDED, not specified. Verifying an improvement means going and measuring
 * what the applied fix was worth, so the measurement has to be recordable
 * BEFORE the idea is declared verified — otherwise a manager must call it
 * verified before they have measured anything. `fn_case_study_start` already
 * documents this exact state in a live error branch ("an idea can sit at
 * status='applied' with value_holds already true"), which would be unreachable
 * dead code if only 'verified' were allowed.
 *
 * 'closed' is excluded even though a closed idea may have been valued once: it
 * is terminal, and rewriting its figure would move promotion and case-study
 * arithmetic after the fact.
 *
 * Mirror of the `v_status NOT IN (...)` guard in migration 20261111000000.
 */
export const VALUE_RECORDABLE_STATUSES = ['applied', 'verified'] as const;

export type ValueRecordableStatus = (typeof VALUE_RECORDABLE_STATUSES)[number];

/** Is this idea at a status where a verified value may be recorded? */
export function canRecordVerifiedValue(status: ImprovementIdeaStatus | string): boolean {
  return (VALUE_RECORDABLE_STATUSES as readonly string[]).includes(String(status));
}

export interface VerifiedValueEntry {
  /**
   * Whether the claimed value actually held once measured.
   *
   * There is no third option here on purpose. `value_holds` is nullable in the
   * database and NULL means "nobody has checked yet" — a state this write path
   * can only ever move away from, never back into.
   */
  valueHolds: boolean;
  /**
   * The measured rupee value. REQUIRED when `valueHolds` is true; must be
   * absent (or null) when it is false — see `validateVerifiedValue`.
   */
  verifiedValueInr?: number | null;
  /** Free-text note appended to the audit trail. Optional. */
  note?: string | null;
}

/**
 * Client-side mirror of the RPC's refusal rules.
 *
 * @returns the reason this entry would be refused, or `null` if it is legal.
 *
 * The server enforces every one of these again — this is a courtesy, never a
 * security boundary. A caller that skips it simply gets the same refusal a
 * round-trip later.
 */
export function validateVerifiedValue(
  status: ImprovementIdeaStatus | string,
  entry: VerifiedValueEntry
): string | null {
  if (!canRecordVerifiedValue(status)) {
    return `A verified value can only be recorded once the fix has been applied. This idea is "${status}", not "applied" or "verified".`;
  }

  // `valueHolds` is typed boolean, but this module is reachable from untyped
  // form state, so the NULL case is checked rather than assumed away.
  if (entry.valueHolds === null || entry.valueHolds === undefined) {
    return 'Say whether the value holds: true (and give the figure) or false (and give no figure).';
  }

  if (entry.valueHolds) {
    const v = entry.verifiedValueInr;
    if (v === null || v === undefined) {
      return 'A value that holds needs a figure. Give the verified rupee amount, or record that the value does not hold.';
    }
    // Number.isFinite covers NaN and both Infinities in one test. NaN matters
    // specifically: Postgres `numeric` accepts 'NaN' and sorts it ABOVE every
    // number, so a bare `< 0` check on either side lets it through into a
    // figure that feeds a stipend.
    if (!Number.isFinite(v)) {
      return 'The verified value is not a number.';
    }
    if (v < 0) {
      return `The verified value cannot be negative (got ${v}).`;
    }
    return null;
  }

  if (entry.verifiedValueInr !== null && entry.verifiedValueInr !== undefined) {
    // Not a tidiness rule. resident-promotion-service sums verified_value_inr
    // for every verified idea WITHOUT consulting value_holds, so this row would
    // credit a learner with a number a manager has just rejected.
    return `An idea whose value does not hold cannot carry a figure (got ${entry.verifiedValueInr}). Record the real figure and mark the value as holding instead.`;
  }

  return null;
}

/**
 * Record what a verified fix was worth.
 *
 * Board managers only — enforced by the RPC, which is the real gate. Writes
 * `verified_value_inr`, `value_holds` and `value_verified_at` together, and
 * one `improvement_idea_activity` row with action `value_verified`.
 *
 * Last write wins: a measurement may be re-measured, and the superseded figure
 * survives in the audit trail. THROWS on refusal, carrying the server's own
 * message, because every refusal here is something the user must read and act
 * on rather than a state the UI can paper over.
 */
export async function recordVerifiedValue(
  ideaId: string,
  entry: VerifiedValueEntry
): Promise<void> {
  const supabase = createClientSupabaseClient();

  const { error } = await (supabase as any).rpc('fn_improvement_set_verified_value', {
    p_idea_id: ideaId,
    p_verified_value_inr: entry.valueHolds ? (entry.verifiedValueInr ?? null) : null,
    p_value_holds: entry.valueHolds,
    p_note: entry.note?.trim() ? entry.note.trim() : null,
  });

  if (error) {
    logger.error(MODULE, 'Error recording verified value', error);
    throw new Error(error.message || 'Failed to record the verified value.');
  }
}
