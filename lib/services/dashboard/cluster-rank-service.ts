/**
 * Dashboard v2 — Doctrines v1 Cluster Rank Service (server + client)
 *
 * Calls `fn_cluster_rank_public()` RPC which returns the 8-college OHS
 * leaderboard for Principal/HOD/super-admin callers. For Faculty/Student
 * private percentile, use fn_cluster_rank_private() (Task 8, not yet wired).
 *
 * Spec: JKKNKB/MyJKKN/Routines-Stickiness-Ivy-Doctrine.md §8 Doctrine 1
 *       (tiered-privacy cluster rank cascade)
 */

import { createClient } from '@/lib/supabase/server';

export type ClusterBand = 'red' | 'amber' | 'green';

export type LeaderboardEntry = {
  institution_id: string;
  institution_name: string;
  counselling_code: string;
  ohs_score: number;
  ohs_band: ClusterBand;
  rank: number;
};

export type ClusterRankPublic = {
  leaderboard: LeaderboardEntry[];
  caller_institution_id: string | null;
  caller_rank: number | null;
  caller_score: number | null;
  refreshed_at: string | null;
  forbidden: boolean;
  reason?: string;
};

const EMPTY_CLUSTER_RANK_PUBLIC: ClusterRankPublic = {
  leaderboard: [],
  caller_institution_id: null,
  caller_rank: null,
  caller_score: null,
  refreshed_at: null,
  forbidden: true,
  reason: 'no_data'
};

/**
 * Fetches the 8-college cluster leaderboard + caller's own rank.
 * Returns EMPTY_CLUSTER_RANK_PUBLIC with forbidden=true on error.
 * Role-gated server-side: only principal/hod/super_admin/admin receive data.
 */
export async function getClusterRankPublic(): Promise<ClusterRankPublic> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_cluster_rank_public');

    if (error) {
      console.error('[dashboard/cluster-rank] RPC error:', error);
      return { ...EMPTY_CLUSTER_RANK_PUBLIC, reason: 'rpc_error' };
    }

    return (data as ClusterRankPublic) ?? EMPTY_CLUSTER_RANK_PUBLIC;
  } catch (err) {
    console.error('[dashboard/cluster-rank] unexpected error:', err);
    return { ...EMPTY_CLUSTER_RANK_PUBLIC, reason: 'unexpected_error' };
  }
}

// =====================================================================
// Doctrines v1 Task 8 — PRIVATE cluster rank (Faculty + Student personas)
// =====================================================================
// Tiered-privacy cascade: Faculty/Student callers get ONLY percentile +
// quartile label. NO peer names, NO peer scores, NO caller raw score.
// Backed by fn_cluster_rank_private() which is the SQL authorization
// boundary over the service_role-only TES/CRS helpers.
// =====================================================================

export type Quartile = 'top_quartile' | 'upper_middle' | 'lower_middle' | 'bottom_quartile';

export type ClusterRankPrivate = {
  percentile: number | null;
  quartile_label: Quartile | null;
  data_source: string;
  // 'cache' | 'live' | 'insufficient_peers' | 'no_staff_record' | 'no_learner_profile'
  //   | 'not_authenticated' | 'role_not_allowed' | 'no_cluster' | 'no_caller_profile'
  //   | 'not_in_cluster'     — caller's institution is outside the cluster pool (2026-04-20)
  //   | 'pending_cache'      — eligible caller awaiting Sunday cron backfill (2026-04-20)
  //   | 'error' | 'no_data' | 'null_user_id'
  forbidden: boolean;
  reason?: string | null;
};

const EMPTY_CLUSTER_RANK_PRIVATE: ClusterRankPrivate = {
  percentile: null,
  quartile_label: null,
  data_source: 'no_data',
  forbidden: true
};

/**
 * Fetches the caller's own cluster-wide percentile + quartile label.
 * Role MUST be 'faculty' or 'student' (explicit — no silent defaults).
 * Returns EMPTY_CLUSTER_RANK_PRIVATE on error / forbidden.
 *
 * Privacy guarantee: return payload contains NO peer names and NO raw
 * scores. Enforced by fn_cluster_rank_private() at the SQL layer.
 */
export async function getClusterRankPrivate(
  role: 'faculty' | 'student'
): Promise<ClusterRankPrivate> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_cluster_rank_private', { p_role: role });

    if (error) {
      console.error('[dashboard/cluster-rank-private] RPC error:', error);
      return { ...EMPTY_CLUSTER_RANK_PRIVATE, data_source: 'error', reason: error.message };
    }

    return (data as ClusterRankPrivate) ?? EMPTY_CLUSTER_RANK_PRIVATE;
  } catch (err) {
    console.error('[dashboard/cluster-rank-private] unexpected error:', err);
    return { ...EMPTY_CLUSTER_RANK_PRIVATE, data_source: 'error' };
  }
}

// =====================================================================
// Doctrines v1 Task 7b — HOD-DHS cluster leaderboard
// =====================================================================
// Peers see peers. HOD-only RPC returning all HODs ranked by DHS plus
// caller's own rank. Distinct from fn_cluster_rank_public (which ranks
// institutions by OHS). Both tiles co-exist on the HOD hero strip.
// =====================================================================

export type HodLeaderboardEntry = {
  hod_user_id: string;
  hod_name: string;
  department_id: string;
  department_name: string;
  institution_id: string;
  institution_name: string;
  dhs_score: number;
  dhs_band: ClusterBand;
  rank: number;
};

export type ClusterRankHodsPublic = {
  leaderboard: HodLeaderboardEntry[];
  caller_rank: number | null;
  caller_score: number | null;
  caller_department_id: string | null;
  caller_institution_id: string | null;
  refreshed_at: string | null;
  forbidden: boolean;
  reason?: string | null;
};

const EMPTY_CLUSTER_RANK_HODS_PUBLIC: ClusterRankHodsPublic = {
  leaderboard: [],
  caller_rank: null,
  caller_score: null,
  caller_department_id: null,
  caller_institution_id: null,
  refreshed_at: null,
  forbidden: true,
  reason: 'no_data'
};

/**
 * Fetches the HOD cluster leaderboard + caller's own rank. Role-gated
 * server-side: only 'hod' or super_admin callers receive data. All
 * other callers get forbidden=true with empty leaderboard.
 */
export async function getClusterRankHodsPublic(): Promise<ClusterRankHodsPublic> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_cluster_rank_hods_public');

    if (error) {
      console.error('[dashboard/cluster-rank-hods] RPC error:', error);
      return { ...EMPTY_CLUSTER_RANK_HODS_PUBLIC, reason: 'rpc_error' };
    }

    return (data as ClusterRankHodsPublic) ?? EMPTY_CLUSTER_RANK_HODS_PUBLIC;
  } catch (err) {
    console.error('[dashboard/cluster-rank-hods] unexpected error:', err);
    return { ...EMPTY_CLUSTER_RANK_HODS_PUBLIC, reason: 'unexpected_error' };
  }
}
