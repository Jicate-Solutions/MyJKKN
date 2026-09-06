// lib/services/cohort-core/experiment-service.ts
// Cohort Core — M7.2 experiment (control-group / causal-lift) read+compute service.
//
// public.cohort_experiments holds ONE causal-lift result per cohort:
//   causal_lift = mean(treatment lift) − mean(control lift)  (the confound-killed
//   number the feed-forward loop may act on), alongside naive_lift (confounded,
//   for contrast only). Computed by fn_compute_cohort_experiment (SECURITY
//   INVOKER — runs under the caller's RLS). Arms are assigned by
//   fn_assign_experiment_arms_for_cohort.
//
// CLIENT-ONLY — uses the session-scoped browser Supabase client, so RLS is
// enforced automatically. Do NOT import into a Server Component / route handler.
// Connected to:
//   supabase/migrations/20260731093000_cohort_experiments.sql
//   lib/services/cohort-core/feedforward-service.ts (reads causal_lift)
//   hooks/cohort-core/useMoat.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type { CohortExperiment } from '@/lib/types/cohort-core';

export class CohortExperimentService {
  private static supabase = createClientSupabaseClient();

  /** The computed experiment result for a cohort (or null if not yet computed). */
  static async getExperiment(cohortId: string): Promise<CohortExperiment | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('cohort_experiments')
        .select('*')
        .eq('cohort_id', cohortId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    } catch (error) {
      console.error('CohortExperimentService: getExperiment error:', error);
      throw error;
    }
  }

  /**
   * Deterministically 50/50-assign control/treatment arms to a cohort's
   * unassigned, non-terminal members. Idempotent (already-armed members are
   * skipped). Returns the count newly assigned.
   */
  static async assignArms(cohortId: string): Promise<number> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'fn_assign_experiment_arms_for_cohort',
        { p_cohort_id: cohortId }
      );
      if (error) throw error;
      return (data as number) ?? 0;
    } catch (error) {
      console.error('CohortExperimentService: assignArms error:', error);
      throw error;
    }
  }

  /**
   * Compute (or recompute) the causal lift for a cohort from its captured
   * outcomes, grouped by arm. Upserts one cohort_experiments row and returns it.
   * causal_lift is null unless BOTH arms have a scored member.
   */
  static async computeExperiment(cohortId: string): Promise<CohortExperiment> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'fn_compute_cohort_experiment',
        { p_cohort_id: cohortId }
      );
      if (error) throw error;
      toast.success('Experiment recomputed');
      return data as CohortExperiment;
    } catch (error) {
      console.error('CohortExperimentService: computeExperiment error:', error);
      throw error;
    }
  }
}
