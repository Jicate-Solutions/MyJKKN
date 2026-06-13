// =============================================================================
// lib/services/pde-accreditation-evidence-service.ts
// PDE Tier 4 — T4.5 Accreditation Evidence Aggregator
// =============================================================================
//
// Purpose
// -------
// Surface real, validated `pde_demonstrations` rows as accreditation-packet
// evidence for a given body (NAAC / NBA / IQAC / NIRF / NCTE / ...).
//
// Each accreditation body has different mapping rules, but the aggregator
// shape is identical: 7 category buckets (PDE_CATEGORY_KEYS), per-bucket
// counts (submitted/validated/scored/passed), and a small sample of scored
// rows per bucket (the actual evidence rows the accreditation packet cites).
//
// The page that consumes this aggregator (`/pde/admin/accreditation-evidence/
// [body]`) used to read engagement/OBE/Fink's/agency/innovation metrics
// scattered across 6 tables (`pde_quest_enrollments`, `pde_submissions`,
// `pde_engagement_daily`, `pde_certificates`, `pde_capabilities`,
// `pde_learner_capabilities`). T4.5 redirects it to `pde_demonstrations` —
// the actual learner-evidence substrate seeded by Tier 1.1/1.2 — so that
// what surfaces in the packet is the same evidence that scored at validator
// time.
//
// Policy enforcement
// ------------------
// Server-side only. Callers must already have passed `SuperAdminOnly` (the
// route handler enforces) or be an institution admin reading their own
// institution. RLS on `pde_demonstrations` then narrows visibility to that
// envelope.
//
// Empty-state
// -----------
// Guaranteed to return all 7 categories even when `pde_demonstrations` is
// empty — buckets surface as zero counts + empty `sample_evidence` arrays.
// UI never needs to defend against missing keys.
//
// Phase: PDE Consumer Tier 4 (2026-05-19).
// =============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  PDE_CATEGORY_KEYS,
  PDE_CATEGORY_LABELS,
  type PDECategoryKey,
} from './pde-cohort-types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AccreditationBodyForEvidence =
  | 'NAAC'
  | 'NBA'
  | 'IQAC'
  | 'NIRF'
  | 'QS'
  | 'DCI'
  | 'PCI'
  | 'INC'
  | 'AICTE'
  | 'NCTE'
  | 'UGC';

export interface CategoryEvidenceSample {
  id: string;
  learner_id: string;
  skill_name: string | null;
  evidence_type: string | null;
  evidence: Record<string, unknown>;
  scored_at: string | null;
  weighted_score: number | null;
  passed: boolean | null;
  validator_notes: Record<string, unknown>;
}

export interface CategoryEvidenceBucket {
  category_key: PDECategoryKey;
  category_label: string;
  counts: {
    submitted: number;
    validated: number;
    scored: number;
    passed: number;
  };
  rubric_attestation_counts: Record<string, number>;
  sample_evidence: CategoryEvidenceSample[];
}

export interface AccreditationEvidencePacket {
  body: AccreditationBodyForEvidence;
  institution_id: string | null;
  generated_at: string;
  total_demonstrations: number;
  by_category: CategoryEvidenceBucket[];
}

// ---------------------------------------------------------------------------
// Internal row shape
// ---------------------------------------------------------------------------

interface DemonstrationRow {
  id: string;
  learner_id: string;
  institution_id: string | null;
  category_key: PDECategoryKey;
  rubric_policy_key: string | null;
  skill_name: string | null;
  evidence: Record<string, unknown> | null;
  evidence_type: string | null;
  status: string;
  weighted_score: number | null;
  passed: boolean | null;
  scored_at: string | null;
  validator_notes: Record<string, unknown> | null;
}

const SAMPLE_SIZE_PER_CATEGORY = 5;
const MAX_ROWS_AGGREGATED = 5000;

function emptyBucket(category_key: PDECategoryKey): CategoryEvidenceBucket {
  return {
    category_key,
    category_label: PDE_CATEGORY_LABELS[category_key],
    counts: { submitted: 0, validated: 0, scored: 0, passed: 0 },
    rubric_attestation_counts: {},
    sample_evidence: [],
  };
}

function emptyBucketMap(): Record<PDECategoryKey, CategoryEvidenceBucket> {
  return PDE_CATEGORY_KEYS.reduce(
    (acc, key) => {
      acc[key] = emptyBucket(key);
      return acc;
    },
    {} as Record<PDECategoryKey, CategoryEvidenceBucket>
  );
}

function bumpRubricCount(
  bucket: CategoryEvidenceBucket,
  rubric_policy_key: string | null
): void {
  if (!rubric_policy_key) return;
  bucket.rubric_attestation_counts[rubric_policy_key] =
    (bucket.rubric_attestation_counts[rubric_policy_key] ?? 0) + 1;
}

function foldRowIntoBucket(
  bucket: CategoryEvidenceBucket,
  row: DemonstrationRow
): void {
  // Status is monotonic-ish: scored implies validated implies submitted.
  // Treat 'submitted', 'under_review', 'validated', 'scored' all as ≥ submitted.
  if (
    row.status === 'submitted' ||
    row.status === 'under_review' ||
    row.status === 'validated' ||
    row.status === 'scored'
  ) {
    bucket.counts.submitted++;
  }
  if (row.status === 'validated' || row.status === 'scored') {
    bucket.counts.validated++;
  }
  if (row.status === 'scored') {
    bucket.counts.scored++;
    if (row.passed === true) {
      bucket.counts.passed++;
    }
    bumpRubricCount(bucket, row.rubric_policy_key);

    // Keep first N scored rows as the evidence sample. Service order is
    // `scored_at DESC` so these are the most recent attestations.
    if (bucket.sample_evidence.length < SAMPLE_SIZE_PER_CATEGORY) {
      bucket.sample_evidence.push({
        id: row.id,
        learner_id: row.learner_id,
        skill_name: row.skill_name,
        evidence_type: row.evidence_type,
        evidence: row.evidence ?? {},
        scored_at: row.scored_at,
        weighted_score: row.weighted_score,
        passed: row.passed,
        validator_notes: row.validator_notes ?? {},
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PDEAccreditationEvidenceService {
  /**
   * Aggregate `pde_demonstrations` into a packet shape for the given body.
   *
   * Body argument is currently a label-only filter: every supported body
   * surfaces the same underlying PDE evidence (the 7-category substrate is
   * body-agnostic). Body-specific mapping rules (e.g. NBA criterion grouping)
   * land in follow-up PRs that wrap this aggregator and re-bucket categories
   * against the body's criterion taxonomy.
   *
   * @param body          Which accreditation packet is being built.
   * @param institutionId Optional institution filter. `null` / undefined =
   *                      whatever RLS allows (super_admin sees all).
   */
  static async getEvidenceForBody(
    body: AccreditationBodyForEvidence,
    institutionId?: string | null
  ): Promise<AccreditationEvidencePacket> {
    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from('pde_demonstrations')
      .select(
        'id, learner_id, institution_id, category_key, rubric_policy_key, ' +
          'skill_name, evidence, evidence_type, status, weighted_score, ' +
          'passed, scored_at, validator_notes'
      )
      .order('scored_at', { ascending: false, nullsFirst: false })
      .limit(MAX_ROWS_AGGREGATED);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(
        `PDEAccreditationEvidenceService.getEvidenceForBody failed: ${error.message}`
      );
    }

    const buckets = emptyBucketMap();
    const rows = (data ?? []) as unknown as DemonstrationRow[];

    for (const row of rows) {
      const bucket = buckets[row.category_key];
      // Defensive: if the DB ever holds a category_key outside the 7,
      // skip silently rather than crash. The migration's CHECK constraint
      // makes this nearly impossible — but RLS-rejected rows might arrive
      // null in some adapter edge cases.
      if (!bucket) continue;
      foldRowIntoBucket(bucket, row);
    }

    return {
      body,
      institution_id: institutionId ?? null,
      generated_at: new Date().toISOString(),
      total_demonstrations: rows.length,
      // Preserve the canonical 7-key order regardless of insertion order.
      by_category: PDE_CATEGORY_KEYS.map((k) => buckets[k]),
    };
  }

  /**
   * Empty packet — handy for early-render skeleton paths and for tests of
   * callers that don't want to mock supabase.
   */
  static emptyPacket(
    body: AccreditationBodyForEvidence,
    institutionId?: string | null
  ): AccreditationEvidencePacket {
    return {
      body,
      institution_id: institutionId ?? null,
      generated_at: new Date().toISOString(),
      total_demonstrations: 0,
      by_category: PDE_CATEGORY_KEYS.map(emptyBucket),
    };
  }
}
