// =============================================================================
// lib/services/pde-cohort-service.ts
// PDE Tier 1.3 — Cohort comparison aggregation service.
// =============================================================================
//
// Purpose
// -------
// Aggregates rows from `pde_demonstrations` (substrate seeded by
// 20260518_pde_demonstrations_table.sql) into two consumer-friendly shapes:
//
//   1. CohortHeatmapData — institution × category matrix for admin overview
//      at /pde/admin/cohort.
//   2. LearnerPeerData   — single learner's score per category vs cohort avg
//      (with percentile) for the learner peer-relative view at /pde/learn/cohort.
//
// Policy enforcement
// ------------------
// - `getCohortHeatmap` honors `pde.visibility.cohort_comparison_scope`:
//     * institution_wide → all institutions visible (caller must be staff/admin)
//     * deans_only       → filter to caller's institution_id only
//     * aggregated_only  → strip institution_id; return one aggregated cohort
// - `getLearnerPeerRelative` honors `pde.visibility.individual_metric_display`
//     and returns the display-flag object so the UI can hide percentile/
//     numeric score per policy.
//
// Empty-state
// -----------
// `pde_demonstrations` will be mostly empty until Tier 1.1 (faculty validation
// UI) and Tier 1.2 (learner submission UI) land + accumulate live data. All
// returned shapes are guaranteed populated with the 7 category keys even when
// zero rows exist, so the UI never crashes on missing keys.
//
// Aggregation strategy
// --------------------
// Reads up to 5000 demonstrations in TypeScript (acceptable for early adoption
// volume; switch to a PG aggregate RPC once we cross ~5k rows). Each row is
// folded into the cohort × category buckets once.
//
// Phase: PDE Consumer Layer Tier 1.3 (2026-05-19).
// =============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getCohortComparisonScope,
  getIndividualMetricDisplay,
} from '@/lib/services/pde-policy-reader';
import type {
  IndividualMetricDisplay,
  CohortComparisonScope,
} from '@/lib/services/pde-policy-reader-types';
import {
  PDE_CATEGORY_KEYS,
  PDE_CATEGORY_LABELS,
  type PDECategoryKey,
  type CategoryAggregate,
  type CohortRow,
  type CohortHeatmapData,
  type LearnerCategorySummary,
  type LearnerPeerData,
} from './pde-cohort-types';

// Re-export pure types/constants for backward compatibility with existing
// server-side callers (page.tsx Server Components). Client components must
// import from './pde-cohort-types' directly to avoid pulling in the server
// Supabase client (next/headers).
export {
  PDE_CATEGORY_KEYS,
  PDE_CATEGORY_LABELS,
  type PDECategoryKey,
  type CategoryAggregate,
  type CohortRow,
  type CohortHeatmapData,
  type LearnerCategorySummary,
  type LearnerPeerData,
} from './pde-cohort-types';

// ---------------------------------------------------------------------------
// Minimal shape of a `pde_demonstrations` row we actually read.
// Kept in sync with the migration; not the full row.
// ---------------------------------------------------------------------------

interface DemonstrationRow {
  learner_id: string;
  institution_id: string | null;
  category_key: PDECategoryKey;
  status: string;
  weighted_score: number | null;
  scored_at: string | null;
  created_at: string;
}

interface InstitutionRow {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_CATEGORY_AGGREGATE: CategoryAggregate = {
  submitted: 0,
  validated: 0,
  scored: 0,
  passed: 0,
  avg_weighted_score: null,
};

function emptyCategoryMap(): Record<PDECategoryKey, CategoryAggregate> {
  return PDE_CATEGORY_KEYS.reduce(
    (acc, key) => {
      acc[key] = { ...EMPTY_CATEGORY_AGGREGATE };
      return acc;
    },
    {} as Record<PDECategoryKey, CategoryAggregate>
  );
}

function emptyLearnerCategoryMap(): Record<PDECategoryKey, LearnerCategorySummary> {
  return PDE_CATEGORY_KEYS.reduce(
    (acc, key) => {
      acc[key] = {
        own_score: null,
        cohort_avg: null,
        percentile: null,
        total_demonstrations: 0,
      };
      return acc;
    },
    {} as Record<PDECategoryKey, LearnerCategorySummary>
  );
}

const AGGREGATED_INSTITUTION_ID = '__aggregated__';
const AGGREGATED_INSTITUTION_NAME = 'All Institutions (Aggregated)';
const UNASSIGNED_INSTITUTION_ID = '__unassigned__';
const UNASSIGNED_INSTITUTION_NAME = 'Unassigned';

function isValidatedStatus(status: string): boolean {
  return status === 'validated' || status === 'scored';
}

function isScoredStatus(status: string): boolean {
  return status === 'scored';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PDECohortService {
  /**
   * Resolve the caller's profile (id + institution_id) once per request.
   * Returns null when no authenticated user is present (server components
   * should handle that case upstream via the SuperAdminOnly guard).
   */
  private static async getCallerContext(): Promise<{
    userId: string;
    institutionId: string | null;
  } | null> {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, institution_id')
      .eq('id', user.id)
      .maybeSingle();

    return {
      userId: user.id,
      institutionId: (profile?.institution_id as string | null) ?? null,
    };
  }

  /**
   * Fetch demonstrations within the given timeframe.
   * Hard cap of 5000 rows; the scoring engine should keep volume well below
   * this threshold in early adoption.
   */
  private static async fetchDemonstrations(
    fromIso: string,
    toIso: string,
    institutionFilter?: string | null
  ): Promise<DemonstrationRow[]> {
    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from('pde_demonstrations')
      .select('learner_id, institution_id, category_key, status, weighted_score, scored_at, created_at')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .limit(5000);

    if (institutionFilter) {
      query = query.eq('institution_id', institutionFilter);
    }

    const { data, error } = await query;
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[pde-cohort-service] fetchDemonstrations failed', error.message);
      return [];
    }
    return (data as DemonstrationRow[] | null) ?? [];
  }

  /**
   * Fetch institution name lookup for the unique institution_ids in the data.
   */
  private static async fetchInstitutions(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('institutions')
      .select('id, name')
      .in('id', ids);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[pde-cohort-service] fetchInstitutions failed', error.message);
      return new Map();
    }
    const rows = (data as InstitutionRow[] | null) ?? [];
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /**
   * Aggregate a flat list of demonstrations into the heatmap shape.
   * One pass through the rows; runs an `avg_weighted_score` divisor at the end.
   */
  private static foldIntoCohorts(
    rows: DemonstrationRow[],
    bucketKey: (r: DemonstrationRow) => string,
    nameFor: (id: string) => string
  ): CohortRow[] {
    interface InternalCohort {
      institution_id: string;
      institution_name: string;
      learners: Set<string>;
      by_category: Record<PDECategoryKey, CategoryAggregate & { _sum: number; _count: number }>;
    }

    const map = new Map<string, InternalCohort>();

    for (const row of rows) {
      if (!PDE_CATEGORY_KEYS.includes(row.category_key)) continue;
      const id = bucketKey(row);
      let cohort = map.get(id);
      if (!cohort) {
        cohort = {
          institution_id: id,
          institution_name: nameFor(id),
          learners: new Set<string>(),
          by_category: PDE_CATEGORY_KEYS.reduce(
            (acc, key) => {
              acc[key] = { ...EMPTY_CATEGORY_AGGREGATE, _sum: 0, _count: 0 };
              return acc;
            },
            {} as Record<PDECategoryKey, CategoryAggregate & { _sum: number; _count: number }>
          ),
        };
        map.set(id, cohort);
      }
      cohort.learners.add(row.learner_id);
      const bucket = cohort.by_category[row.category_key];
      // status flow: draft → submitted → under_review → validated → scored
      // Anything with submitted_at semantically counts as submitted; we use
      // status snapshot here for a stable count (draft excluded).
      if (row.status !== 'draft' && row.status !== 'withdrawn' && row.status !== 'rejected') {
        bucket.submitted += 1;
      }
      if (isValidatedStatus(row.status)) bucket.validated += 1;
      if (isScoredStatus(row.status)) {
        bucket.scored += 1;
        if (row.weighted_score !== null && row.weighted_score !== undefined) {
          bucket._sum += Number(row.weighted_score);
          bucket._count += 1;
          if (Number(row.weighted_score) >= 60) bucket.passed += 1;
        }
      }
    }

    return Array.from(map.values()).map((cohort) => {
      const by_category: Record<PDECategoryKey, CategoryAggregate> = PDE_CATEGORY_KEYS.reduce(
        (acc, key) => {
          const b = cohort.by_category[key];
          acc[key] = {
            submitted: b.submitted,
            validated: b.validated,
            scored: b.scored,
            passed: b.passed,
            avg_weighted_score: b._count > 0 ? Math.round((b._sum / b._count) * 10) / 10 : null,
          };
          return acc;
        },
        {} as Record<PDECategoryKey, CategoryAggregate>
      );
      return {
        institution_id: cohort.institution_id,
        institution_name: cohort.institution_name,
        cohort_size: cohort.learners.size,
        by_category,
      };
    });
  }

  /**
   * Admin overview: institution × category heatmap with weighted-score
   * averages, scoped by `pde.visibility.cohort_comparison_scope`.
   *
   * Default timeframe is the trailing 180 days; pass an explicit `from`/`to`
   * if you need a different window.
   */
  static async getCohortHeatmap(
    institutionIdOverride?: string,
    options?: { fromIso?: string; toIso?: string }
  ): Promise<CohortHeatmapData> {
    const now = new Date();
    const toIso = options?.toIso ?? now.toISOString();
    const fromIso =
      options?.fromIso ?? new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();

    const caller = await this.getCallerContext();
    const scope = await getCohortComparisonScope(institutionIdOverride ?? caller?.institutionId);

    // Decide filter strategy based on scope.
    let institutionFilter: string | null | undefined = institutionIdOverride;
    if (scope === 'deans_only' && !institutionIdOverride) {
      institutionFilter = caller?.institutionId ?? null;
      // If caller has no institution, fall back to empty list rather than
      // leaking all rows.
      if (!institutionFilter) {
        return {
          cohorts: [],
          timeframe: { from: fromIso, to: toIso },
          scope,
        };
      }
    }

    const rows = await this.fetchDemonstrations(fromIso, toIso, institutionFilter);

    // Aggregated mode: strip institution_id and return ONE row.
    if (scope === 'aggregated_only') {
      const cohorts = this.foldIntoCohorts(
        rows,
        () => AGGREGATED_INSTITUTION_ID,
        () => AGGREGATED_INSTITUTION_NAME
      );
      return {
        cohorts,
        timeframe: { from: fromIso, to: toIso },
        scope,
      };
    }

    // Institution-wide or deans_only: bucket by institution_id (with name lookup).
    const uniqueInstIds = Array.from(
      new Set(rows.map((r) => r.institution_id).filter((id): id is string => !!id))
    );
    const nameMap = await this.fetchInstitutions(uniqueInstIds);

    const cohorts = this.foldIntoCohorts(
      rows,
      (r) => r.institution_id ?? UNASSIGNED_INSTITUTION_ID,
      (id) => {
        if (id === UNASSIGNED_INSTITUTION_ID) return UNASSIGNED_INSTITUTION_NAME;
        return nameMap.get(id) ?? 'Unknown Institution';
      }
    );

    // Stable sort: largest cohort first so the heatmap reads top-down.
    cohorts.sort((a, b) => b.cohort_size - a.cohort_size);

    return {
      cohorts,
      timeframe: { from: fromIso, to: toIso },
      scope,
    };
  }

  /**
   * Learner peer-relative view: the learner's own scored demonstrations vs
   * the cohort average per category, with percentile.
   *
   * Honors `pde.visibility.individual_metric_display` — the caller is
   * expected to hide percentile/numeric score when the flags say so.
   */
  static async getLearnerPeerRelative(learnerId: string): Promise<LearnerPeerData> {
    const caller = await this.getCallerContext();
    const display = await getIndividualMetricDisplay(caller?.institutionId);

    // Use a wider 365-day window for the learner view; demonstrations are
    // sparse early on and we'd rather show something than nothing.
    const now = new Date();
    const fromIso = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const toIso = now.toISOString();

    // Resolve the learner's institution to scope the cohort to peers in the
    // same institution. If not available, fall back to global cohort.
    const supabase = await createServerSupabaseClient();
    const { data: learnerProfile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', learnerId)
      .maybeSingle();
    const learnerInstId = (learnerProfile?.institution_id as string | null) ?? null;

    const rows = await this.fetchDemonstrations(fromIso, toIso, learnerInstId);

    // Walk rows once and build per-category (own scores, cohort scores).
    const byCategory: Record<
      PDECategoryKey,
      { ownScores: number[]; cohortScores: number[]; totalForLearner: number }
    > = PDE_CATEGORY_KEYS.reduce(
      (acc, key) => {
        acc[key] = { ownScores: [], cohortScores: [], totalForLearner: 0 };
        return acc;
      },
      {} as Record<PDECategoryKey, { ownScores: number[]; cohortScores: number[]; totalForLearner: number }>
    );

    for (const row of rows) {
      if (!PDE_CATEGORY_KEYS.includes(row.category_key)) continue;
      const bucket = byCategory[row.category_key];
      if (row.learner_id === learnerId && row.status !== 'draft') {
        bucket.totalForLearner += 1;
      }
      if (!isScoredStatus(row.status)) continue;
      if (row.weighted_score === null || row.weighted_score === undefined) continue;
      const score = Number(row.weighted_score);
      if (row.learner_id === learnerId) {
        bucket.ownScores.push(score);
      }
      bucket.cohortScores.push(score);
    }

    const summary: Record<PDECategoryKey, LearnerCategorySummary> = emptyLearnerCategoryMap();
    for (const key of PDE_CATEGORY_KEYS) {
      const b = byCategory[key];
      summary[key].total_demonstrations = b.totalForLearner;
      if (b.ownScores.length > 0) {
        // Best-of: surface the learner's strongest demonstration as their score.
        summary[key].own_score = Math.round(Math.max(...b.ownScores) * 10) / 10;
      }
      if (b.cohortScores.length > 0) {
        const sum = b.cohortScores.reduce((s, n) => s + n, 0);
        summary[key].cohort_avg = Math.round((sum / b.cohortScores.length) * 10) / 10;
      }
      if (summary[key].own_score !== null && b.cohortScores.length > 0) {
        // Percentile = % of cohort scores at or below the learner's best.
        const below = b.cohortScores.filter((s) => s <= (summary[key].own_score as number)).length;
        summary[key].percentile = Math.round((below / b.cohortScores.length) * 100);
      }
    }

    return {
      learner_id: learnerId,
      by_category: summary,
      display,
    };
  }
}
