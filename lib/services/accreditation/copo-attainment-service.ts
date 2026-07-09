// lib/services/accreditation/copo-attainment-service.ts
// ============================================================================
// CO/PO Attainment Loop (NBA) — client-side reads for the (future) UI.
// Accreditation-loop PR-4: substrate only, NO UI in this PR.
//
// Data source: obe_course_attainment_rollup — course-grain DIRECT attainment
// computed weekly by /api/cron/copo-attainment from COE marks. HONESTY: every
// row is grain='course_proxy' (co_tagged=false) until the Academic Office
// authors assessment→CO maps; a UI MUST surface the grain, never present
// proxy rows as CO-tagged attainment.
//
// RLS: SELECT requires accreditation.view + institution scope (admins bypass).
// Config: copo_attainment.* rows in platform_policies (authenticated-readable).
// PER-COLLEGE THRESHOLD (Director 2026-07-09): threshold_pct's global row is a
// FALLBACK — an institution-scoped override row (scope_type='institution',
// scope_id=<institution uuid>) wins, mirroring fn_get_policy precedence.
// Weights 80/20 RATIFIED by Director 2026-07-09; remaining values are DEFAULTS
// awaiting Director/Academic Council ratification.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

/** Contract with the copo_attainment.* platform_policies rows
 *  (seeded by supabase/migrations/20260709031000_copo_attainment_spine.sql). */
export const COPO_POLICY_KEYS = {
  MASTER_ENABLED: 'copo_attainment.master_enabled',
  THRESHOLD_PCT: 'copo_attainment.threshold_pct',
  DIRECT_WEIGHT: 'copo_attainment.direct_weight',
  INDIRECT_WEIGHT: 'copo_attainment.indirect_weight',
  TARGET_LEVEL: 'copo_attainment.target_level',
  LEVEL3_MIN_PCT: 'copo_attainment.level3_min_pct',
  LEVEL2_MIN_PCT: 'copo_attainment.level2_min_pct',
  LEVEL1_MIN_PCT: 'copo_attainment.level1_min_pct',
} as const;

export type CopoPolicyKey = (typeof COPO_POLICY_KEYS)[keyof typeof COPO_POLICY_KEYS];

export interface CopoAttainmentConfig {
  masterEnabled: boolean;
  /** Resolved for the requested institution when one is passed:
   *  institution-scoped override row > global fallback row > 60. */
  thresholdPct: number;
  thresholdPctSource: 'institution_override' | 'global_fallback';
  directWeight: number;
  indirectWeight: number;
  targetLevel: number;
  level3MinPct: number;
  level2MinPct: number;
  level1MinPct: number;
}

export interface CourseAttainmentRow {
  id: string;
  institution_id: string;
  course_code: string;
  course_name: string | null;
  program_code: string | null;
  session_code: string;
  session_end_date: string | null;
  grain: 'course_proxy' | 'co_tagged';
  threshold_pct_used: number;
  internal_learner_count: number | null;
  internal_meeting_threshold: number | null;
  internal_attainment_pct: number | null;
  avg_internal_pct: number | null;
  final_learner_count: number | null;
  final_meeting_threshold: number | null;
  final_attainment_pct: number | null;
  avg_external_pct: number | null;
  avg_total_pct: number | null;
  pass_pct: number | null;
  attainment_basis: 'final_total' | 'internal_cia' | null;
  attainment_pct: number | null;
  attainment_level: number | null;
  prior_rollup_id: string | null;
  prev_attainment_pct: number | null;
  delta_pct: number | null;
  metadata: Record<string, unknown>;
  computed_at: string;
}

const SELECT_COLS =
  'id, institution_id, course_code, course_name, program_code, session_code, ' +
  'session_end_date, grain, threshold_pct_used, ' +
  'internal_learner_count, internal_meeting_threshold, internal_attainment_pct, avg_internal_pct, ' +
  'final_learner_count, final_meeting_threshold, final_attainment_pct, ' +
  'avg_external_pct, avg_total_pct, pass_pct, ' +
  'attainment_basis, attainment_pct, attainment_level, ' +
  'prior_rollup_id, prev_attainment_pct, delta_pct, metadata, computed_at';

/** The 8 methodology config rows, with the same defensive defaults the SQL
 *  fns use (a missing row falls back rather than throwing). Pass an
 *  institutionId to resolve that college's ratified threshold override
 *  (institution > global > 60 — fn_get_policy precedence). */
export async function getCopoAttainmentConfig(
  institutionId?: string,
): Promise<CopoAttainmentConfig> {
  const supabase = createClientSupabaseClient();
  const { data, error } = await supabase
    .from('platform_policies')
    .select('policy_key, value')
    .in('policy_key', Object.values(COPO_POLICY_KEYS))
    .eq('scope_type', 'global')
    .eq('is_active', true);
  if (error) throw error;

  let overrideThreshold: number | null = null;
  if (institutionId) {
    const { data: ov, error: ovError } = await supabase
      .from('platform_policies')
      .select('value')
      .eq('policy_key', COPO_POLICY_KEYS.THRESHOLD_PCT)
      .eq('scope_type', 'institution')
      .eq('scope_id', institutionId)
      .eq('is_active', true)
      .maybeSingle();
    if (ovError) throw ovError;
    if (typeof ov?.value === 'number') overrideThreshold = ov.value;
  }

  const byKey = new Map<string, unknown>(
    (data ?? []).map((r) => [r.policy_key as string, r.value]),
  );
  const num = (key: CopoPolicyKey, fallback: number): number => {
    const v = byKey.get(key);
    return typeof v === 'number' ? v : fallback;
  };
  return {
    masterEnabled: byKey.get(COPO_POLICY_KEYS.MASTER_ENABLED) === true,
    thresholdPct: overrideThreshold ?? num(COPO_POLICY_KEYS.THRESHOLD_PCT, 60),
    thresholdPctSource:
      overrideThreshold != null ? 'institution_override' : 'global_fallback',
    directWeight: num(COPO_POLICY_KEYS.DIRECT_WEIGHT, 0.8),
    indirectWeight: num(COPO_POLICY_KEYS.INDIRECT_WEIGHT, 0.2),
    targetLevel: num(COPO_POLICY_KEYS.TARGET_LEVEL, 2),
    level3MinPct: num(COPO_POLICY_KEYS.LEVEL3_MIN_PCT, 70),
    level2MinPct: num(COPO_POLICY_KEYS.LEVEL2_MIN_PCT, 60),
    level1MinPct: num(COPO_POLICY_KEYS.LEVEL1_MIN_PCT, 50),
  };
}

export interface ListCourseAttainmentParams {
  institutionId?: string;
  sessionCode?: string;
  programCode?: string;
  /** only rows at/below this attainment level (action shortlist) */
  maxLevel?: number;
  limit?: number;
  offset?: number;
}

/** Rollup rows, newest session first then lowest attainment first (the
 *  action-needed ordering the loop UI will want). */
export async function listCourseAttainment(
  params: ListCourseAttainmentParams = {},
): Promise<CourseAttainmentRow[]> {
  const supabase = createClientSupabaseClient();
  // 'as any': obe_course_attainment_rollup ships in this PR's migration and is
  // not yet in the generated types/supabase.ts (repo pattern, e.g.
  // course-mapping-service). Remove on the next types regen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any).from('obe_course_attainment_rollup')
    .select(SELECT_COLS)
    .order('session_end_date', { ascending: false, nullsFirst: false })
    .order('attainment_pct', { ascending: true, nullsFirst: false });
  if (params.institutionId) q = q.eq('institution_id', params.institutionId);
  if (params.sessionCode) q = q.eq('session_code', params.sessionCode);
  if (params.programCode) q = q.eq('program_code', params.programCode);
  if (params.maxLevel != null) q = q.lte('attainment_level', params.maxLevel);
  q = q.range(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 100) - 1);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as CourseAttainmentRow[];
}

/** One course's attainment across sessions, oldest first — the NBA trend line. */
export async function getCourseAttainmentTrend(
  institutionId: string,
  courseCode: string,
): Promise<CourseAttainmentRow[]> {
  const supabase = createClientSupabaseClient();
  // 'as any': see listCourseAttainment — table not yet in generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('obe_course_attainment_rollup')
    .select(SELECT_COLS)
    .eq('institution_id', institutionId)
    .eq('course_code', courseCode)
    .order('session_end_date', { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data ?? []) as unknown as CourseAttainmentRow[];
}
