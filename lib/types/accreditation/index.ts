// lib/types/accreditation/index.ts
// ============================================================================
// Shared types for the /accreditation/* dashboards (PR-A7 and onward).
// Body_code values match DB CHECK constraints on sh_accreditation_metrics +
// quality_evidence_mappings.
// ============================================================================

import type { AccreditationBodyCode } from '@/lib/services/solutions/types';

export type { AccreditationBodyCode };

/**
 * Static metadata for the 10 compliance bodies. Rendered on the landing page
 * and drives routing + display. Sequence is intentional:
 * 1. Cross-cutting (NAAC, UGC) first
 * 2. Rankings (NIRF, QS) next
 * 3. Program/Technical (NBA, AICTE, NCTE) middle
 * 4. Profession-specific (DCI, PCI, INC) last
 */
export interface BodyMeta {
  code: AccreditationBodyCode;
  name: string;
  shortLabel: string;
  description: string;
  cycleLabel: string;
  scopeLabel: string;
  status: 'live' | 'placeholder' | 'phase-2';
  accentClass: string;
}

export const ACCREDITATION_BODIES: BodyMeta[] = [
  {
    code: 'NAAC',
    name: 'National Assessment and Accreditation Council',
    shortLabel: 'NAAC',
    description: 'Binary + MBGL framework. 10 Attributes × Input/Process/Outcome.',
    cycleLabel: '3-year binary',
    scopeLabel: 'All 8 colleges',
    status: 'placeholder',
    accentClass: 'border-indigo-300 bg-indigo-50 dark:bg-indigo-950/30',
  },
  {
    code: 'UGC',
    name: 'University Grants Commission',
    shortLabel: 'UGC',
    description: 'Overall regulator — compliance, grants, affiliation.',
    cycleLabel: 'Continuous',
    scopeLabel: 'All 8 colleges',
    status: 'placeholder',
    accentClass: 'border-slate-300 bg-slate-50 dark:bg-slate-950/30',
  },
  {
    code: 'NIRF',
    name: 'National Institutional Ranking Framework',
    shortLabel: 'NIRF',
    description: 'MoE annual ranking across TLR + RPC + GO + OI + PR.',
    cycleLabel: 'Annual',
    scopeLabel: 'All 8 colleges + JKKN overall',
    status: 'placeholder',
    accentClass: 'border-amber-300 bg-amber-50 dark:bg-amber-950/30',
  },
  {
    code: 'QS',
    name: 'QS World University Rankings',
    shortLabel: 'QS',
    description: 'Aspirational world ranking — 6 indicators.',
    cycleLabel: 'Annual',
    scopeLabel: 'Aspirational (Phase 2+)',
    status: 'phase-2',
    accentClass: 'border-rose-300 bg-rose-50 dark:bg-rose-950/30',
  },
  {
    code: 'NBA',
    name: 'National Board of Accreditation',
    shortLabel: 'NBA',
    description: 'Program-level accreditation for engineering + technical.',
    cycleLabel: '3-year per program',
    scopeLabel: 'Engineering programs',
    status: 'placeholder',
    accentClass: 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30',
  },
  {
    code: 'AICTE',
    name: 'All India Council for Technical Education',
    shortLabel: 'AICTE',
    description: 'Annual Extension of Approval for technical institutions.',
    cycleLabel: 'Annual EoA',
    scopeLabel: 'Engineering + Pharmacy',
    status: 'placeholder',
    accentClass: 'border-sky-300 bg-sky-50 dark:bg-sky-950/30',
  },
  {
    code: 'NCTE',
    name: 'National Council for Teacher Education',
    shortLabel: 'NCTE',
    description: 'Teacher education programs.',
    cycleLabel: 'Periodic',
    scopeLabel: 'JKKN College of Education',
    status: 'placeholder',
    accentClass: 'border-teal-300 bg-teal-50 dark:bg-teal-950/30',
  },
  {
    code: 'DCI',
    name: 'Dental Council of India',
    shortLabel: 'DCI',
    description: 'Annual inspection — Dental Council regulator.',
    cycleLabel: 'Annual inspection',
    scopeLabel: 'JKKN Dental College',
    status: 'placeholder',
    accentClass: 'border-fuchsia-300 bg-fuchsia-50 dark:bg-fuchsia-950/30',
  },
  {
    code: 'PCI',
    name: 'Pharmacy Council of India',
    shortLabel: 'PCI',
    description: 'Annual inspection — Pharmacy Council regulator.',
    cycleLabel: 'Annual inspection',
    scopeLabel: 'JKKN College of Pharmacy',
    status: 'placeholder',
    accentClass: 'border-violet-300 bg-violet-50 dark:bg-violet-950/30',
  },
  {
    code: 'INC',
    name: 'Indian Nursing Council',
    shortLabel: 'INC',
    description: 'Annual inspection — Nursing Council regulator.',
    cycleLabel: 'Annual inspection',
    scopeLabel: 'JKKN College of Nursing',
    status: 'placeholder',
    accentClass: 'border-lime-300 bg-lime-50 dark:bg-lime-950/30',
  },
];

/**
 * One row per body for the landing scoreboard: counts of seeded metrics,
 * evidence tags present, and a coarse "coverage" signal. Coverage is just
 * evidence_rows / max_score_sum normalised to % for the placeholder — real
 * weighted formula (per docs/one-jkkn-one-data §8) lands in the per-body
 * dashboards as each body's full catalog + evidence is seeded.
 */
export interface BodyScoreboard {
  body_code: AccreditationBodyCode;
  metrics_seeded: number;
  evidence_rows: number;
  coverage_pct: number; // 0-100
}

/**
 * Coverage matrix row for /accreditation/coverage. One row per (body, institution)
 * combination that has any activity. Institutions with zero metrics for that
 * body are omitted (e.g., DCI row only contains JKKN Dental College).
 */
export interface CoverageMatrixRow {
  body_code: AccreditationBodyCode;
  institution_id: string;
  institution_name: string;
  iqac_code: string | null;
  evidence_rows: number;
  metrics_seeded: number;
  coverage_pct: number;
}

// ============================================================================
// Quality Loops → NAAC Metric 7.3 "Quality Assurance System"
// (Loop → accreditation bridge, PR-2 of 2)
//
// PR-1 (loop evidence rollup) emits one quality_evidence_mappings row per
// measured loop cycle: body_code='NAAC', metric_code IN 7.3.d/7.3.e/7.3.f
// (facet letters under Metric 7.3, Attribute 7 Governance and Administration,
// per the NAAC Reforms 2024 Binary Accreditation Framework), is_auto=true,
// metadata jsonb per the pinned contract below. These types render that
// contract — they do not define new write shapes.
//
// NOTE: the pre-existing numeric row 7.3.1 (IQAC meeting frequency) is a
// different concern and is deliberately NOT part of this set.
// Under the outgoing framework this evidence maps to AQAR Criterion 6.5.
// ============================================================================

/** NAAC 7.3 facet codes emitted by the loop evidence rollup. */
export const LOOP_METRIC_CODES = ['7.3.d', '7.3.e', '7.3.f'] as const;
export type LoopMetricCode = (typeof LOOP_METRIC_CODES)[number];

/** Short chip labels for the 7.3 facets. */
export const LOOP_METRIC_LABELS: Record<LoopMetricCode, string> = {
  '7.3.d': 'audit & feedback to system',
  '7.3.e': 'quality circles — reserved',
  '7.3.f': 'stakeholder satisfaction loop',
};

/** delta_summary vocabulary written by PR-1 (pinned contract). */
export type LoopDeltaSummary = 'improved' | 'no_change' | 'worse' | 'n/a';

/** metadata jsonb shape written by PR-1 (pinned contract). */
export interface LoopEvidenceMetadata {
  loop_key: string; // e.g. 'scf_teaching' | 'induction_session' | 'mess_menu' | ...
  loop_name: string; // human-readable loop name
  outcome?: Record<string, unknown>; // loop-specific numbers
  delta_summary?: LoopDeltaSummary;
  measured_at?: string; // ISO timestamp
}

/** One quality_evidence_mappings row tagged to a Metric 7.3 facet. */
export interface LoopEvidenceRow {
  id: string;
  institution_id: string;
  metric_code: string;
  period_label: string | null; // 'AY 2026-27'-style academic-year label
  mapped_at: string;
  source_table: string;
  is_auto: boolean;
  metadata: LoopEvidenceMetadata | null;
}

/** Per-loop rollup rendered as a tile on the NAAC dashboard. */
export interface QualityLoopSummary {
  loop_key: string;
  loop_name: string;
  metric_code: string;
  cycles: number; // measured cycles = row count
  last_measured_at: string | null; // max(mapped_at)
  deltas: {
    improved: number;
    no_change: number;
    worse: number;
    na: number;
  };
  /** Most recent cycle's metadata.outcome (loop-specific numbers), if any. */
  latest_outcome: Record<string, unknown> | null;
}
