/**
 * PDE Validator Service
 * ============================================================================
 *
 * Server-side service for the faculty/staff inbox + the validation action.
 *
 * State machine (relevant slice):
 *   draft        — learner is editing
 *   submitted    — landed in faculty inbox (RLS gates faculty/hod/coordinator/dean/admin)
 *   under_review — claimed by a validator (future — not modelled yet)
 *   validated    — recordValidation() flips here, raw_score set, validator id appended
 *   scored       — PDEScoringService.scoreAndPersist() flips here (separate service)
 *   rejected     — out of scope for this PR
 *   withdrawn    — learner-driven
 *
 * RLS does the institution gating — this service does NOT re-check role/scope.
 * Callers (API routes) MUST be wrapped by auth middleware that ensures
 * `auth.uid()` is set; the row-level policies in
 * `20260518_pde_demonstrations_table.sql` then enforce
 * `profiles.role IN ('faculty','hod','coordinator','dean','institution_admin','administrator')`
 * AND `profiles.institution_id = pde_demonstrations.institution_id`.
 *
 * Pattern alignment: matches `pde-scoring-service.ts` — single Supabase client
 * per call, thin static methods, throws on error.
 *
 * Phase: PDE Tier 1.2 (2026-05-19).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { PdeDemonstrationRow } from '@/lib/services/pde-scoring-service';

// ===========================================================================
// Public API
// ===========================================================================

export class PDEValidatorService {
  /**
   * List demonstrations awaiting validation. RLS narrows to the caller's
   * institution (and to roles permitted to validate).
   *
   * Sorted by submitted_at ascending (oldest first) so validators can drain
   * the inbox FIFO.
   */
  static async listPending(): Promise<PdeDemonstrationRow[]> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('pde_demonstrations')
      .select('*')
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true, nullsFirst: false });

    if (error) {
      throw new Error(`[pde-validator] listPending failed: ${error.message}`);
    }
    return (data ?? []) as PdeDemonstrationRow[];
  }

  /**
   * Fetch a single demonstration by id. Returns null if RLS hides it from
   * the caller or the row doesn't exist.
   */
  static async getById(id: string): Promise<PdeDemonstrationRow | null> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('pde_demonstrations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`[pde-validator] getById ${id} failed: ${error.message}`);
    }
    return (data ?? null) as PdeDemonstrationRow | null;
  }

  /**
   * Record a validator's review.
   *
   * - Appends validatorId to validator_ids[] (idempotent — won't double-add)
   * - Sets validator_notes[validatorId] = notes
   * - Writes raw_score
   * - Flips status → 'validated'
   *
   * Throws if the row doesn't exist or raw_score is out of [0, 100].
   */
  static async recordValidation(
    id: string,
    validatorId: string,
    notes: string,
    rawScore: number
  ): Promise<PdeDemonstrationRow> {
    if (typeof rawScore !== 'number' || Number.isNaN(rawScore) || rawScore < 0 || rawScore > 100) {
      throw new Error(
        `[pde-validator] raw_score must be a number in [0,100], got ${rawScore}`
      );
    }

    const supabase = await createServerSupabaseClient();

    // Fetch current row to compute idempotent jsonb merges client-side.
    // (Could be a PG function — kept as a 2-query pattern for now to stay
    // legible and avoid an extra migration.)
    const { data: existing, error: fetchErr } = await (supabase as any)
      .from('pde_demonstrations')
      .select('validator_ids, validator_notes')
      .eq('id', id)
      .single();

    if (fetchErr) {
      throw new Error(
        `[pde-validator] recordValidation cannot read ${id}: ${fetchErr.message}`
      );
    }
    if (!existing) {
      throw new Error(`[pde-validator] demonstration ${id} not found`);
    }

    const currentIds = Array.isArray(existing.validator_ids) ? existing.validator_ids : [];
    const nextIds = currentIds.includes(validatorId)
      ? currentIds
      : [...currentIds, validatorId];

    const currentNotes =
      existing.validator_notes && typeof existing.validator_notes === 'object'
        ? (existing.validator_notes as Record<string, string>)
        : {};
    const nextNotes = { ...currentNotes, [validatorId]: notes };

    const { data, error } = await (supabase as any)
      .from('pde_demonstrations')
      .update({
        validator_ids: nextIds,
        validator_notes: nextNotes,
        raw_score: rawScore,
        status: 'validated',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(
        `[pde-validator] recordValidation failed for ${id}: ${error.message}`
      );
    }
    return data as PdeDemonstrationRow;
  }
}
