/**
 * PDE Transcript Service
 * ============================================================================
 *
 * Aggregates per-learner PDE evidence into a NAAC/NBA-ready transcript shape.
 * Reads from existing tables only — does NOT introduce a `pde_transcripts`
 * table. The transcript is a *projection* over current state, not a snapshot.
 *
 * Sources
 * -------
 * - `pde_demonstrations`            → all 7 categories, grouped by category_key
 * - `pde_learner_capabilities`      → demonstrated / mastered capabilities
 * - `pde_agency_index`              → latest snapshot row (overall score)
 * - `profiles` + `institutions`     → header block (learner + institution)
 *
 * Pattern alignment: thin class with static methods, mirrors
 * `lib/services/pde-demonstration-service.ts` and `pde-agency-live-service.ts`.
 *
 * Auth: callers MUST gate access. This service trusts the supabase client
 * passed in — RLS handles row-level safety. For admin-view we pass a
 * service-role client (after role gating in the route).
 *
 * Phase: PDE Tier 4 — Item 4.4 (2026-05-19).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PDECategoryKey } from '@/lib/types/pde-demonstrations';

// ---------------------------------------------------------------------------
// Public shape — what the API / page consumes
// ---------------------------------------------------------------------------

export const PDE_CATEGORY_LABELS: Record<PDECategoryKey, string> = {
  judgment: 'Judgment',
  embodied: 'Embodied Practice',
  problem_finding: 'Problem Finding',
  accountability: 'Accountability',
  social_leadership: 'Social Leadership',
  cultural_civic: 'Cultural & Civic',
  credential: 'Credential',
};

export const PDE_CATEGORY_ORDER: readonly PDECategoryKey[] = [
  'judgment',
  'embodied',
  'problem_finding',
  'accountability',
  'social_leadership',
  'cultural_civic',
  'credential',
] as const;

export interface TranscriptLearner {
  id: string;
  full_name: string | null;
  email: string | null;
  institution_id: string | null;
  department_id: string | null;
}

export interface TranscriptInstitution {
  id: string | null;
  name: string | null;
  department_name: string | null;
}

export interface TranscriptDemonstrationRow {
  id: string;
  skill_name: string | null;
  status: string;
  submitted_at: string | null;
  validated: boolean;
  scored: boolean;
  raw_score: number | null;
  weighted_score: number | null;
  passed: boolean | null;
}

export interface TranscriptCategoryBlock {
  category_key: PDECategoryKey;
  category_label: string;
  count_submitted: number;
  count_validated: number;
  count_scored: number;
  total_weighted_score: number;
  rows: TranscriptDemonstrationRow[];
}

export interface TranscriptCapability {
  id: string | null;
  name: string | null;
  category: string | null;
  level: string | null;
  status: string;
  demonstrated_at: string | null;
  score: number | null;
}

export interface TranscriptData {
  learner: TranscriptLearner;
  institution: TranscriptInstitution;
  generated_at: string;
  generated_by: string | null;
  demonstrations_by_category: TranscriptCategoryBlock[];
  capabilities: TranscriptCapability[];
  agency_index: {
    overall: number;
    level: string;
    assessed_at: string | null;
  } | null;
  totals: {
    demonstrations_submitted: number;
    demonstrations_validated: number;
    demonstrations_scored: number;
    weighted_score_total: number;
    capabilities_demonstrated: number;
  };
}

// ---------------------------------------------------------------------------
// Validated / scored helpers — match the status enum from pde_demonstrations
// ---------------------------------------------------------------------------

const VALIDATED_STATUSES = new Set(['validated', 'scored']);
const SCORED_STATUSES = new Set(['scored']);

function levelFromOverall(overall: number): string {
  if (overall >= 80) return 'principal';
  if (overall >= 60) return 'self_directed';
  if (overall >= 40) return 'independent';
  if (overall >= 20) return 'directed';
  return 'dependent';
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class PDETranscriptService {
  /**
   * Build the full transcript projection for a learner. Reads through the
   * supplied supabase client — caller is responsible for using either a
   * server-context client (RLS gates) or a service-role client (after
   * role-gating in the API/page).
   *
   * `generatedBy` is the auth uid of whoever triggered the transcript —
   * stamped on the rendered PDF / HTML for audit.
   */
  static async buildTranscriptData(
    learnerId: string,
    supabase: SupabaseClient,
    generatedBy: string | null = null
  ): Promise<TranscriptData | null> {
    // ---------- 1. Learner profile ----------
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, institution_id, department_id')
      .eq('id', learnerId)
      .maybeSingle();

    if (profileError || !profile) {
      return null;
    }

    // ---------- 2. Institution + department names ----------
    let institutionName: string | null = null;
    let departmentName: string | null = null;

    if (profile.institution_id) {
      const { data: inst } = await supabase
        .from('institutions')
        .select('name')
        .eq('id', profile.institution_id)
        .maybeSingle();
      institutionName = inst?.name ?? null;
    }
    if (profile.department_id) {
      const { data: dept } = await supabase
        .from('departments')
        .select('name')
        .eq('id', profile.department_id)
        .maybeSingle();
      departmentName = dept?.name ?? null;
    }

    // ---------- 3. Demonstrations ----------
    const { data: demoRows } = await supabase
      .from('pde_demonstrations')
      .select(
        'id, category_key, skill_name, status, submitted_at, raw_score, weighted_score, passed'
      )
      .eq('learner_id', learnerId)
      .neq('status', 'draft')
      .order('submitted_at', { ascending: false });

    const demos = (demoRows ?? []) as Array<{
      id: string;
      category_key: PDECategoryKey;
      skill_name: string | null;
      status: string;
      submitted_at: string | null;
      raw_score: number | null;
      weighted_score: number | null;
      passed: boolean | null;
    }>;

    // Group by category, seeding all 7 so the transcript always shows the full set.
    const blocks: TranscriptCategoryBlock[] = PDE_CATEGORY_ORDER.map((key) => ({
      category_key: key,
      category_label: PDE_CATEGORY_LABELS[key],
      count_submitted: 0,
      count_validated: 0,
      count_scored: 0,
      total_weighted_score: 0,
      rows: [],
    }));

    const blockByKey = new Map<PDECategoryKey, TranscriptCategoryBlock>(
      blocks.map((b) => [b.category_key, b])
    );

    for (const d of demos) {
      const block = blockByKey.get(d.category_key);
      if (!block) continue;
      const validated = VALIDATED_STATUSES.has(d.status);
      const scored = SCORED_STATUSES.has(d.status);
      block.count_submitted += 1;
      if (validated) block.count_validated += 1;
      if (scored) block.count_scored += 1;
      if (typeof d.weighted_score === 'number') {
        block.total_weighted_score += d.weighted_score;
      }
      block.rows.push({
        id: d.id,
        skill_name: d.skill_name,
        status: d.status,
        submitted_at: d.submitted_at,
        validated,
        scored,
        raw_score: d.raw_score,
        weighted_score: d.weighted_score,
        passed: d.passed,
      });
    }

    // ---------- 4. Capabilities ----------
    const { data: capRows } = await supabase
      .from('pde_learner_capabilities')
      .select(
        'status, demonstrated_at, demonstration_score, capability:pde_capabilities(id, name, category, level)'
      )
      .eq('learner_id', learnerId)
      .in('status', ['demonstrated', 'mastered'])
      .order('demonstrated_at', { ascending: false });

    const capabilities: TranscriptCapability[] = ((capRows ?? []) as any[]).map(
      (r) => ({
        id: r.capability?.id ?? null,
        name: r.capability?.name ?? null,
        category: r.capability?.category ?? null,
        level: r.capability?.level ?? null,
        status: r.status,
        demonstrated_at: r.demonstrated_at ?? null,
        score: typeof r.demonstration_score === 'number' ? r.demonstration_score : null,
      })
    );

    // ---------- 5. Agency Index (latest snapshot) ----------
    const { data: agencyRow } = await supabase
      .from('pde_agency_index')
      .select('overall, assessment_date, created_at')
      .eq('learner_id', learnerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const agency = agencyRow
      ? {
          overall: typeof agencyRow.overall === 'number' ? agencyRow.overall : 0,
          level: levelFromOverall(
            typeof agencyRow.overall === 'number' ? agencyRow.overall : 0
          ),
          assessed_at:
            (agencyRow.assessment_date as string | null) ??
            (agencyRow.created_at as string | null) ??
            null,
        }
      : null;

    // ---------- 6. Roll-ups ----------
    const totals = blocks.reduce(
      (acc, b) => ({
        demonstrations_submitted: acc.demonstrations_submitted + b.count_submitted,
        demonstrations_validated: acc.demonstrations_validated + b.count_validated,
        demonstrations_scored: acc.demonstrations_scored + b.count_scored,
        weighted_score_total: acc.weighted_score_total + b.total_weighted_score,
      }),
      {
        demonstrations_submitted: 0,
        demonstrations_validated: 0,
        demonstrations_scored: 0,
        weighted_score_total: 0,
      }
    );

    return {
      learner: {
        id: profile.id,
        full_name: profile.full_name ?? null,
        email: profile.email ?? null,
        institution_id: profile.institution_id ?? null,
        department_id: profile.department_id ?? null,
      },
      institution: {
        id: profile.institution_id ?? null,
        name: institutionName,
        department_name: departmentName,
      },
      generated_at: new Date().toISOString(),
      generated_by: generatedBy,
      demonstrations_by_category: blocks,
      capabilities,
      agency_index: agency,
      totals: {
        ...totals,
        capabilities_demonstrated: capabilities.length,
      },
    };
  }
}
