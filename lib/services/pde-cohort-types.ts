// =============================================================================
// lib/services/pde-cohort-types.ts
// Pure types & constants extracted from pde-cohort-service.ts so client
// components (CohortHeatmap, PeerRelativeCard) can import them without
// dragging in `@/lib/supabase/server` (server-only).
//
// Anything in this file MUST stay free of server-only imports.
// =============================================================================

import type {
  CohortComparisonScope,
  IndividualMetricDisplay,
} from './pde-policy-reader-types';

// ---------------------------------------------------------------------------
// Public type surface
// ---------------------------------------------------------------------------

export const PDE_CATEGORY_KEYS = [
  'judgment',
  'embodied',
  'problem_finding',
  'accountability',
  'social_leadership',
  'cultural_civic',
  'credential',
] as const;

export type PDECategoryKey = (typeof PDE_CATEGORY_KEYS)[number];

/** Human-readable labels for each of the 7 categories. */
export const PDE_CATEGORY_LABELS: Record<PDECategoryKey, string> = {
  judgment: 'Judgment',
  embodied: 'Embodied Practice',
  problem_finding: 'Problem Finding',
  accountability: 'Accountability',
  social_leadership: 'Social Leadership',
  cultural_civic: 'Cultural & Civic',
  credential: 'Credentials',
};

export interface CategoryAggregate {
  submitted: number;
  validated: number;
  scored: number;
  passed: number;
  avg_weighted_score: number | null;
}

export interface CohortRow {
  institution_id: string;
  institution_name: string;
  cohort_size: number;
  by_category: Record<PDECategoryKey, CategoryAggregate>;
}

export interface CohortHeatmapData {
  cohorts: CohortRow[];
  timeframe: { from: string; to: string };
  scope: CohortComparisonScope;
}

export interface LearnerCategorySummary {
  own_score: number | null;
  cohort_avg: number | null;
  percentile: number | null;
  total_demonstrations: number;
}

export interface LearnerPeerData {
  learner_id: string;
  by_category: Record<PDECategoryKey, LearnerCategorySummary>;
  display: IndividualMetricDisplay;
}
