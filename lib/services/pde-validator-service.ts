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
   * - Optionally writes clo_refs_confirmed (curriculum connector, spec §4.8):
   *   the validator-CONFIRMED CLO set. Attainment math reads ONLY this column
   *   — learner proposals (clo_refs) are never trusted directly. Pass
   *   undefined to leave the column untouched (non-curriculum validations).
   *
   * Throws if the row doesn't exist or raw_score is out of [0, 100].
   */
  static async recordValidation(
    id: string,
    validatorId: string,
    notes: string,
    rawScore: number,
    cloRefsConfirmed?: number[] | null
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

    const patch: Record<string, unknown> = {
      validator_ids: nextIds,
      validator_notes: nextNotes,
      raw_score: rawScore,
      status: 'validated',
    };
    if (cloRefsConfirmed !== undefined) {
      patch.clo_refs_confirmed =
        cloRefsConfirmed && cloRefsConfirmed.length > 0 ? cloRefsConfirmed : null;
    }

    const { data, error } = await (supabase as any)
      .from('pde_demonstrations')
      .update(patch)
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

  /**
   * Validation-loop visibility for the inbox header (connector PR 2 +
   * CARE audit 2026-06-12 corrective move A — A3/A4 scored 1/0):
   *
   * - slaDays: `pde.scoring.validation_sla_days` policy (default 7)
   * - pendingOverSla: submitted rows older than the SLA
   * - medianLatencyDays: median submission → first-acknowledgment time over
   *   validated/scored rows. pde_demonstrations has no validated_at column
   *   (and is read-only by standing constraint), so the proxy is
   *   COALESCE(scored_at, updated_at) — scoring follows validation within
   *   the same flow; labeled as approximate in the UI.
   * - ackCoveragePct: % of learners with ≥1 submitted demonstration who have
   *   received ≥1 validator acknowledgment (A4 — coverage of the median).
   *
   * RLS scopes everything to the caller's institution, same as listPending.
   */
  static async validationVisibilityStats(): Promise<{
    slaDays: number;
    pendingCount: number;
    pendingOverSla: number;
    medianLatencyDays: number | null;
    ackCoveragePct: number | null;
  }> {
    const supabase = await createServerSupabaseClient();

    const { data: slaRaw } = await supabase.rpc('fn_get_policy_json', {
      p_key: 'pde.scoring.validation_sla_days',
      p_default: 7,
      p_scope_id: null,
    });
    const slaDays =
      typeof slaRaw === 'number' && Number.isFinite(slaRaw) && slaRaw > 0
        ? slaRaw
        : 7;

    const { data, error } = await (supabase as any)
      .from('pde_demonstrations')
      .select('learner_id, status, submitted_at, scored_at, updated_at, validator_notes')
      .in('status', ['submitted', 'validated', 'scored']);

    if (error) {
      throw new Error(`[pde-validator] visibilityStats failed: ${error.message}`);
    }

    const rows = (data ?? []) as Array<
      Pick<
        PdeDemonstrationRow,
        'learner_id' | 'status' | 'submitted_at' | 'scored_at' | 'updated_at' | 'validator_notes'
      >
    >;

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    let pendingCount = 0;
    let pendingOverSla = 0;
    const latencies: number[] = [];
    const submittedLearners = new Set<string>();
    const acknowledgedLearners = new Set<string>();

    for (const row of rows) {
      if (!row.submitted_at) continue;
      submittedLearners.add(row.learner_id);
      const submittedMs = new Date(row.submitted_at).getTime();

      if (row.status === 'submitted') {
        pendingCount += 1;
        if (now - submittedMs > slaDays * dayMs) pendingOverSla += 1;
        continue;
      }

      // validated / scored — acknowledgment happened
      const hasNote =
        row.validator_notes &&
        typeof row.validator_notes === 'object' &&
        Object.values(row.validator_notes).some(
          (n) => typeof n === 'string' && n.trim().length > 0
        );
      if (hasNote || row.status === 'validated' || row.status === 'scored') {
        acknowledgedLearners.add(row.learner_id);
      }
      const ackMs = new Date(row.scored_at ?? row.updated_at).getTime();
      if (Number.isFinite(ackMs) && ackMs >= submittedMs) {
        latencies.push((ackMs - submittedMs) / dayMs);
      }
    }

    let medianLatencyDays: number | null = null;
    if (latencies.length > 0) {
      latencies.sort((a, b) => a - b);
      const mid = Math.floor(latencies.length / 2);
      medianLatencyDays =
        latencies.length % 2 === 1
          ? latencies[mid]
          : (latencies[mid - 1] + latencies[mid]) / 2;
      medianLatencyDays = Math.round(medianLatencyDays * 10) / 10;
    }

    const ackCoveragePct =
      submittedLearners.size === 0
        ? null
        : Math.round((acknowledgedLearners.size / submittedLearners.size) * 100);

    return { slaDays, pendingCount, pendingOverSla, medianLatencyDays, ackCoveragePct };
  }
}
