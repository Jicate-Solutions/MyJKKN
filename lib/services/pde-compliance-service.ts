// =============================================================================
// lib/services/pde-compliance-service.ts
// PDE Tier 2.4 — Per-college compliance aggregation service.
// =============================================================================
//
// Purpose
// -------
// Aggregates rows from `pde_demonstrations` into an 8×7 matrix keyed by
// college slug × PDE category, and evaluates per-college compliance against
// the targets defined in `pde.rollout.per_college_compliance_targets`.
//
// Returned shape (per college):
//   {
//     college: 'medical' | 'pharmacy' | ... | 'default',
//     target_categories: PDECategoryKey[],
//     actual: Record<PDECategoryKey, { submitted, validated, scored, passed, pass_rate }>,
//     on_track_count, target_count, compliance_percent,
//   }
//
// Compliance rule
// ---------------
// A targeted category is "on track" when its pass_rate >= 0.7 AND at least
// one demonstration was scored. compliance_percent = on_track / target_count.
// pass_rate = passed / scored (0 when scored = 0).
//
// Empty state
// -----------
// `pde_demonstrations` will be mostly empty during early rollout. Every
// returned college row is fully populated with all 7 category buckets at zero
// so the UI never crashes; `compliance_percent` is 0 when no targets are met,
// which the UI surfaces as "all targets pending".
//
// Bucketing
// ---------
// Real institutions are matched to college slugs via the same substring
// heuristic used in `app/(routes)/pde/admin/cohort/_components/CohortHeatmap.tsx`
// so the two pages tell a coherent story. Slugs not represented by any real
// institution still appear as empty rows (so the matrix is always 8×7).
//
// Phase: PDE Consumer Layer Tier 2.4 (2026-05-19).
// =============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  PDE_CATEGORY_KEYS,
  type PDECategoryKey,
} from '@/lib/services/pde-cohort-service';
import {
  getPerCollegeComplianceTargets,
  type PerCollegeComplianceTargets,
} from '@/lib/services/pde-policy-reader';

// ---------------------------------------------------------------------------
// Public type surface
// ---------------------------------------------------------------------------

/** Ordered list of college slugs the matrix renders rows for. */
export const PDE_COLLEGE_SLUGS = [
  'medical',
  'pharmacy',
  'nursing',
  'dental',
  'engineering',
  'education',
  'arts_science',
  'default',
] as const;

export type PDECollegeSlug = (typeof PDE_COLLEGE_SLUGS)[number];

/** Human-readable labels for each college slug. */
export const PDE_COLLEGE_LABELS: Record<PDECollegeSlug, string> = {
  medical: 'Medical',
  pharmacy: 'Pharmacy',
  nursing: 'Nursing',
  dental: 'Dental',
  engineering: 'Engineering',
  education: 'Education',
  arts_science: 'Arts & Science',
  default: 'Other / Default',
};

export interface CategoryComplianceBucket {
  submitted: number;
  validated: number;
  scored: number;
  passed: number;
  /** passed / scored — 0 when scored is 0. */
  pass_rate: number;
}

export interface CollegeComplianceRow {
  college: PDECollegeSlug;
  college_label: string;
  /** Source institution names rolled up into this college slug (may be empty). */
  institution_names: string[];
  target_categories: PDECategoryKey[];
  actual: Record<PDECategoryKey, CategoryComplianceBucket>;
  /** How many targeted categories have pass_rate >= 0.7 with at least one scored row. */
  on_track_count: number;
  target_count: number;
  /** on_track_count / target_count — 0 when target_count is 0. */
  compliance_percent: number;
}

export interface PerCollegeComplianceData {
  colleges: CollegeComplianceRow[];
  /** Mean of all colleges' compliance_percent (colleges with no targets count 0). */
  institutional_compliance_percent: number;
  /** Total demonstrations submitted across all colleges within the timeframe. */
  total_demonstrations: number;
  /** Total demonstrations that reached the 'scored' status. */
  total_scored: number;
  timeframe: { from: string; to: string };
}

// ---------------------------------------------------------------------------
// Internal shapes
// ---------------------------------------------------------------------------

interface DemonstrationRow {
  learner_id: string;
  institution_id: string | null;
  category_key: PDECategoryKey;
  status: string;
  weighted_score: number | null;
  created_at: string;
}

interface InstitutionRow {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// College slug resolver (kept in sync with CohortHeatmap.tsx COLLEGE_SLUG_KEYWORDS).
// ---------------------------------------------------------------------------

const COLLEGE_SLUG_KEYWORDS: Array<{ slug: PDECollegeSlug; keywords: string[] }> = [
  { slug: 'medical', keywords: ['medical', 'medicine'] },
  { slug: 'pharmacy', keywords: ['pharmacy', 'pharm'] },
  { slug: 'nursing', keywords: ['nursing', 'nurse'] },
  { slug: 'dental', keywords: ['dental', 'dentistry'] },
  { slug: 'engineering', keywords: ['engineering', 'technology', 'polytechnic'] },
  { slug: 'education', keywords: ['education', 'teacher'] },
  { slug: 'arts_science', keywords: ['arts', 'science', 'commerce'] },
];

function resolveCollegeSlug(institutionName: string | null): PDECollegeSlug {
  if (!institutionName) return 'default';
  const lower = institutionName.toLowerCase();
  for (const { slug, keywords } of COLLEGE_SLUG_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return slug;
  }
  return 'default';
}

// ---------------------------------------------------------------------------
// Empty-bucket factory — guarantees the UI always has 7 category keys.
// ---------------------------------------------------------------------------

function emptyCategoryBuckets(): Record<PDECategoryKey, CategoryComplianceBucket> {
  return PDE_CATEGORY_KEYS.reduce(
    (acc, key) => {
      acc[key] = {
        submitted: 0,
        validated: 0,
        scored: 0,
        passed: 0,
        pass_rate: 0,
      };
      return acc;
    },
    {} as Record<PDECategoryKey, CategoryComplianceBucket>
  );
}

function isCountableSubmitted(status: string): boolean {
  return (
    status !== 'draft' && status !== 'withdrawn' && status !== 'rejected'
  );
}

function isValidatedStatus(status: string): boolean {
  return status === 'validated' || status === 'scored';
}

function isScoredStatus(status: string): boolean {
  return status === 'scored';
}

/** Pass threshold — same constant the scoring engine uses (weighted_score >= 60 = pass). */
const PASS_THRESHOLD = 60;

/** Compliance threshold — a category is on-track when pass_rate >= this. */
const COMPLIANCE_PASS_RATE = 0.7;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PDEComplianceService {
  /**
   * Pull demonstrations within the timeframe, optionally scoped to one
   * institution. Hard cap of 5000 rows; matches PDECohortService convention.
   */
  private static async fetchDemonstrations(
    fromIso: string,
    toIso: string,
    institutionFilter?: string | null
  ): Promise<DemonstrationRow[]> {
    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from('pde_demonstrations')
      .select('learner_id, institution_id, category_key, status, weighted_score, created_at')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .limit(5000);

    if (institutionFilter) {
      query = query.eq('institution_id', institutionFilter);
    }

    const { data, error } = await query;
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[pde-compliance-service] fetchDemonstrations failed', error.message);
      return [];
    }
    return (data as DemonstrationRow[] | null) ?? [];
  }

  /** Resolve institution_id → name for the unique ids we touched. */
  private static async fetchInstitutions(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('institutions')
      .select('id, name')
      .in('id', ids);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[pde-compliance-service] fetchInstitutions failed', error.message);
      return new Map();
    }
    const rows = (data as InstitutionRow[] | null) ?? [];
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /**
   * Per-college compliance against `pde.rollout.per_college_compliance_targets`.
   *
   * Default timeframe is the trailing 180 days.
   */
  static async getPerCollegeCompliance(
    institutionId?: string,
    options?: { fromIso?: string; toIso?: string }
  ): Promise<PerCollegeComplianceData> {
    const now = new Date();
    const toIso = options?.toIso ?? now.toISOString();
    const fromIso =
      options?.fromIso ?? new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();

    // Pull policy + demonstrations in parallel.
    const [targets, rows] = await Promise.all([
      getPerCollegeComplianceTargets(institutionId),
      this.fetchDemonstrations(fromIso, toIso, institutionId ?? null),
    ]);

    // Name lookup for the institution_ids actually present in the data.
    const uniqueInstIds = Array.from(
      new Set(rows.map((r) => r.institution_id).filter((id): id is string => !!id))
    );
    const nameMap = await this.fetchInstitutions(uniqueInstIds);

    // Initialize one row per college slug — guarantees the matrix is always 8 rows
    // even when no real institution maps to that slug.
    interface InternalCollege {
      college: PDECollegeSlug;
      institution_names: Set<string>;
      buckets: Record<PDECategoryKey, CategoryComplianceBucket>;
    }

    const collegeMap = new Map<PDECollegeSlug, InternalCollege>();
    for (const slug of PDE_COLLEGE_SLUGS) {
      collegeMap.set(slug, {
        college: slug,
        institution_names: new Set<string>(),
        buckets: emptyCategoryBuckets(),
      });
    }

    // Single pass over the rows.
    for (const row of rows) {
      if (!PDE_CATEGORY_KEYS.includes(row.category_key)) continue;

      const instName = row.institution_id ? nameMap.get(row.institution_id) ?? null : null;
      const slug = resolveCollegeSlug(instName);
      const college = collegeMap.get(slug);
      if (!college) continue;
      if (instName) college.institution_names.add(instName);

      const bucket = college.buckets[row.category_key];
      if (isCountableSubmitted(row.status)) bucket.submitted += 1;
      if (isValidatedStatus(row.status)) bucket.validated += 1;
      if (isScoredStatus(row.status)) {
        bucket.scored += 1;
        if (
          row.weighted_score !== null &&
          row.weighted_score !== undefined &&
          Number(row.weighted_score) >= PASS_THRESHOLD
        ) {
          bucket.passed += 1;
        }
      }
    }

    // Finalize: compute pass_rate per bucket + roll up per college.
    const colleges: CollegeComplianceRow[] = PDE_COLLEGE_SLUGS.map((slug) => {
      const internal = collegeMap.get(slug)!;
      const targetCategoriesRaw = targets[slug] ?? targets.default ?? [];
      const targetCategories: PDECategoryKey[] = targetCategoriesRaw.filter(
        (c): c is PDECategoryKey => PDE_CATEGORY_KEYS.includes(c as PDECategoryKey)
      );

      // Compute pass_rate per category in place.
      for (const key of PDE_CATEGORY_KEYS) {
        const b = internal.buckets[key];
        b.pass_rate = b.scored > 0 ? Math.round((b.passed / b.scored) * 1000) / 1000 : 0;
      }

      let onTrack = 0;
      for (const cat of targetCategories) {
        const b = internal.buckets[cat];
        if (b.scored > 0 && b.pass_rate >= COMPLIANCE_PASS_RATE) onTrack += 1;
      }

      const compliancePercent =
        targetCategories.length > 0
          ? Math.round((onTrack / targetCategories.length) * 1000) / 10 // → 0..100, 1 decimal
          : 0;

      return {
        college: slug,
        college_label: PDE_COLLEGE_LABELS[slug],
        institution_names: Array.from(internal.institution_names).sort(),
        target_categories: targetCategories,
        actual: internal.buckets,
        on_track_count: onTrack,
        target_count: targetCategories.length,
        compliance_percent: compliancePercent,
      };
    });

    // Institutional compliance = mean across all 8 colleges. Colleges with no
    // targets contribute 0 — this matches the Director's mental model
    // ("if a college has no compliance plan, that's a 0").
    const institutionalCompliancePercent =
      colleges.length > 0
        ? Math.round(
            (colleges.reduce((s, c) => s + c.compliance_percent, 0) / colleges.length) * 10
          ) / 10
        : 0;

    const totalDemonstrations = colleges.reduce(
      (sum, c) =>
        sum + PDE_CATEGORY_KEYS.reduce((s2, k) => s2 + c.actual[k].submitted, 0),
      0
    );
    const totalScored = colleges.reduce(
      (sum, c) =>
        sum + PDE_CATEGORY_KEYS.reduce((s2, k) => s2 + c.actual[k].scored, 0),
      0
    );

    return {
      colleges,
      institutional_compliance_percent: institutionalCompliancePercent,
      total_demonstrations: totalDemonstrations,
      total_scored: totalScored,
      timeframe: { from: fromIso, to: toIso },
    };
  }
}
