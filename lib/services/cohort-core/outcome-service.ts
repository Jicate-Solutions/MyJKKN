// lib/services/cohort-core/outcome-service.ts
// Cohort Core — M2 outcome-capture read/write service (Phase 7 · THE MOAT).
//
// public.cohort_outcomes captures the OUTCOME BASELINE of a cohort member AT THE
// MOMENT IT CLOSES (a membership transitioning into graduated | removed). The
// PRIMARY writer is a DATABASE TRIGGER (fn_capture_cohort_outcome) — it fires no
// matter which code path performs the close, so the moat's fuel can never be
// stranded by a service that forgets. THIS service is the read surface plus a
// MANUAL / supplemental capture escape-hatch (source='service'|'manual').
//
// CLIENT-ONLY — uses the session-scoped browser Supabase client, so RLS is
// enforced automatically. Do NOT import into a Server Component / route handler
// (the browser client has no auth cookie context server-side → RLS returns 0
// rows). Connected to:
//   supabase/migrations/20260731091000_cohort_outcome_capture.sql
//   hooks/cohort-core/useCohortOutcomes.ts
//   lib/services/cohort-core/cohort-service.ts (the closeCohort path that fires
//     the capturing trigger)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type { CohortKind, MembershipType } from '@/lib/types/cohort-core';

// ── Types (mirror the columns / CHECKs of public.cohort_outcomes) ─────────────

/** cohort_outcomes.source — provenance of a captured baseline. */
export type CohortOutcomeSource = 'trigger' | 'service' | 'backfill' | 'manual';

/** A row of public.cohort_outcomes. */
export interface CohortOutcome {
  id: string;
  cohort_id: string;
  /** nullable: SET NULL on membership delete so the baseline survives. */
  membership_id: string | null;
  member_ref: string;
  member_type: MembershipType;
  kind: CohortKind;
  captured_at: string;
  outcome_snapshot: Record<string, unknown>;
  source: CohortOutcomeSource;
  institution_id: string;
  created_at: string;
}

/** Filters for a cohort_outcomes list read. */
export interface CohortOutcomeFilters {
  cohort_id?: string;
  institution_id?: string;
  kind?: CohortKind;
  member_type?: MembershipType;
  member_ref?: string;
  source?: CohortOutcomeSource;
}

/**
 * DTO for a MANUAL / supplemental capture (the trigger handles the automatic
 * capture-at-close). institution_id is REQUIRED and must match the cohort's
 * tenant — never write a NULL-institution row (role_has_institution_access(NULL)
 * = TRUE leak). Defaults source to 'service'.
 */
export interface CreateCohortOutcomeDto {
  cohort_id: string;
  institution_id: string;
  member_ref: string;
  member_type: MembershipType;
  kind: CohortKind;
  membership_id?: string | null;
  outcome_snapshot?: Record<string, unknown>;
  source?: CohortOutcomeSource;
  captured_at?: string;
}

export class CohortOutcomeService {
  private static supabase = createClientSupabaseClient();

  // ── Reads ───────────────────────────────────────────────────────────────────

  static async getOutcomes(
    filters: CohortOutcomeFilters = {}
  ): Promise<CohortOutcome[]> {
    try {
      let query = (this.supabase as any)
        .from('cohort_outcomes')
        .select('*');

      if (filters.cohort_id) query = query.eq('cohort_id', filters.cohort_id);
      if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
      if (filters.kind) query = query.eq('kind', filters.kind);
      if (filters.member_type) query = query.eq('member_type', filters.member_type);
      if (filters.member_ref) query = query.eq('member_ref', filters.member_ref);
      if (filters.source) query = query.eq('source', filters.source);

      query = query.order('captured_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('CohortOutcomeService: getOutcomes error:', error);
      // Non-critical list read — degrade gracefully.
      return [];
    }
  }

  static async getOutcome(id: string): Promise<CohortOutcome | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('cohort_outcomes')
        .select('*')
        .eq('id', id)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data;
    } catch (error) {
      console.error('CohortOutcomeService: getOutcome error:', error);
      throw error;
    }
  }

  static async getOutcomesByCohort(cohortId: string): Promise<CohortOutcome[]> {
    return this.getOutcomes({ cohort_id: cohortId });
  }

  /**
   * The captured baseline for a single membership (or null if it has not closed
   * yet). At most one exists per membership (partial unique index).
   */
  static async getOutcomeByMembership(
    membershipId: string
  ): Promise<CohortOutcome | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('cohort_outcomes')
        .select('*')
        .eq('membership_id', membershipId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    } catch (error) {
      console.error('CohortOutcomeService: getOutcomeByMembership error:', error);
      throw error;
    }
  }

  // ── Manual / supplemental capture ────────────────────────────────────────────

  /**
   * Manually record an outcome baseline (the trigger is the primary capture
   * path). Defaults source to 'service'. The DB partial-unique index makes this
   * idempotent per membership — a second write for the same membership_id is
   * rejected with 23505, surfaced here as a clear "already captured" message.
   *
   * L5 (feed-forward): an RLS denial (Postgres 42501) is preserved with its code
   * intact and tagged .status=403 so the calling route can map it to a clean 403
   * rather than a masked 500.
   */
  static async recordOutcome(
    dto: CreateCohortOutcomeDto
  ): Promise<CohortOutcome> {
    try {
      if (!dto.institution_id) {
        // Never write a NULL-institution row (cross-tenant read leak).
        const err = new Error(
          'institution_id is required to record a cohort outcome'
        ) as Error & { status?: number };
        err.status = 400;
        throw err;
      }

      const { data, error } = await (this.supabase as any)
        .from('cohort_outcomes')
        .insert([
          {
            cohort_id: dto.cohort_id,
            institution_id: dto.institution_id,
            membership_id: dto.membership_id ?? null,
            member_ref: dto.member_ref,
            member_type: dto.member_type,
            kind: dto.kind,
            outcome_snapshot: dto.outcome_snapshot ?? {},
            source: dto.source ?? 'service',
            ...(dto.captured_at ? { captured_at: dto.captured_at } : {}),
          },
        ])
        .select()
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new Error('An outcome has already been captured for this membership');
        }
        // L5: surface an RLS denial as a clean 403, preserving the code.
        if (error.code === '42501') {
          const denied = new Error(
            'You do not have permission to record this cohort outcome'
          ) as Error & { status?: number; code?: string };
          denied.status = 403;
          denied.code = '42501';
          throw denied;
        }
        throw error;
      }
      toast.success('Outcome recorded');
      return data;
    } catch (error) {
      console.error('CohortOutcomeService: recordOutcome error:', error);
      throw error;
    }
  }
}
