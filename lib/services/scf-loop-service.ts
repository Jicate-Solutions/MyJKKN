// lib/services/scf-loop-service.ts
// Client-side service for the SCF loop-activity panel (#4) + per-learner trajectory
// early-warning (#3a). Browser supabase client (RLS/RPC), mirroring the
// SessionFeedbackService pattern (static methods over getSupabase()).
// Both RPCs are SECURITY DEFINER, anon-locked, and gate the caller internally.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LoopActivity } from '@/types/loop-activity';
import type { LearnerTrajectoryRow } from '@/types/learner-trajectory';

// Untyped client — the scf_* tables are not in the generated types yet (same as
// SessionFeedbackService).
const getSupabase = (): any => createClientSupabaseClient();

export class ScfLoopService {
  /** The loop's vital signs for a window (single snapshot object). The RPC raises for
   *  non-authorized callers; returns aggregates + AI coaching summaries only. */
  static async getLoopActivity(
    from: string,
    to: string,
    institutionId?: string | null,
  ): Promise<LoopActivity | null> {
    const supabase = getSupabase();
    // p_institution_id is a NARROWING filter applied on top of the caller's own
    // institution scope inside the RPC — it can never widen what you may see.
    // Always sent (null = all colleges in scope) so PostgREST resolves the 3-arg
    // overload rather than the legacy 2-arg one.
    const { data, error } = await supabase.rpc('fn_scf_loop_activity', {
      p_from: from,
      p_to: to,
      p_institution_id: institutionId ?? null,
    });
    if (error) throw new Error(`Failed to load loop activity: ${error.message}`);
    return (data ?? null) as LoopActivity | null;
  }

  /** Sliding learners (understanding declining over >= minSessions of their own rows),
   *  worst-decline + at-risk first. The RPC raises for non-authorized callers and never
   *  returns any raw rating — only a derived slope + an at_risk flag + identity.
   *  slopeThreshold is negative; rows with slope <= it are returned (default -0.15). */
  static async getLearnerTrajectory(
    from: string,
    to: string,
    opts?: { minSessions?: number; slopeThreshold?: number },
  ): Promise<LearnerTrajectoryRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_learner_trajectory', {
      p_from: from,
      p_to: to,
      p_min_sessions: opts?.minSessions ?? 3,
      p_slope_threshold: opts?.slopeThreshold ?? -0.15,
    });
    if (error) throw new Error(`Failed to load learner trajectory: ${error.message}`);
    return (data ?? []) as LearnerTrajectoryRow[];
  }
}
