// ── OBE Type Definitions ────────────────────────────────────────────────
// Outcome-Based Education system supporting Bloom's and Fink's taxonomies

export type TaxonomyType = 'blooms' | 'finks' | 'jkkn_advanced';
export type BloomsLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
export type FinksDimension = 'FK' | 'AP' | 'IN' | 'HD' | 'CA' | 'LL';
/** JKKN Advanced final form ("C + three bands", 2026-08-21): alongside the six
 *  cognitive levels sit Krathwohl's affective ladder AF1-AF5 (a hierarchy — it
 *  absorbs Fink's Caring at AF3), three psychomotor bands PS-a/b/c after Simpson
 *  (a hierarchy), and a flat rail — HD Human Dimension, L2L Learning How to
 *  Learn, AIU Accountable AI Use — whose members do not outrank one another.
 *  Which elements are active varies by college family; the per-institution
 *  bos_taxonomy_levels rows are the activation record. */
export type AdvancedDimension =
  | 'AF1' | 'AF2' | 'AF3' | 'AF4' | 'AF5'
  | 'PS-a' | 'PS-b' | 'PS-c'
  | 'HD' | 'L2L' | 'AIU';

export type CorrelationLevel = 0 | 1 | 2 | 3;
export type AssessmentComponentType = 'cia' | 'ese' | 'assignment' | 'lab' | 'seminar' | 'project' | 'other';

// Bloom's labels
export const BLOOMS_LEVEL_LABELS: Record<BloomsLevel, string> = {
  L1: 'Remember',
  L2: 'Understand',
  L3: 'Apply',
  L4: 'Analyze',
  L5: 'Evaluate',
  L6: 'Create',
};

// JKKN Advanced — the added elements beyond Bloom's six cognitive levels
export const ADVANCED_DIMENSION_LABELS: Record<AdvancedDimension, string> = {
  AF1: 'Receiving',
  AF2: 'Responding',
  AF3: 'Valuing',
  AF4: 'Organising',
  AF5: 'Characterising',
  'PS-a': 'Guided Performance',
  'PS-b': 'Independent Performance',
  'PS-c': 'Adaptive Performance',
  HD: 'Human Dimension',
  L2L: 'Learning How to Learn',
  AIU: 'Accountable AI Use',
};

// Fink's labels
export const FINKS_DIMENSION_LABELS: Record<FinksDimension, string> = {
  FK: 'Foundational Knowledge',
  AP: 'Application',
  IN: 'Integration',
  HD: 'Human Dimension',
  CA: 'Caring',
  LL: 'Learning How to Learn',
};

// ── Regulation Config ────────────────────────────────────────────────

export interface ObeRegulationConfig {
  id: string;
  institution_id: string;
  regulation_id: string;
  taxonomy_type: TaxonomyType;
  blooms_active_levels: BloomsLevel[];
  finks_active_dimensions: FinksDimension[];
  direct_weightage: number;
  indirect_weightage: number;
  indirect_scale_max: number;
  attainment_scale_max: number;
  created_at: string;
  updated_at: string;
}

export type CreateObeRegulationConfigDto = Omit<ObeRegulationConfig, 'id' | 'created_at' | 'updated_at'>;
export type UpdateObeRegulationConfigDto = Partial<CreateObeRegulationConfigDto>;

// ── Program Outcome ───────────────────────────────────────────────────

export interface ProgramOutcome {
  id: string;
  institution_id: string;
  program_id: string;
  po_code: string;
  po_description: string;
  po_category?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateProgramOutcomeDto = Omit<ProgramOutcome, 'id' | 'created_at' | 'updated_at'>;
export type UpdateProgramOutcomeDto = Partial<CreateProgramOutcomeDto>;

// ── Program Specific Outcome ──────────────────────────────────────────

export interface ProgramSpecificOutcome {
  id: string;
  institution_id: string;
  program_id: string;
  pso_code: string;
  pso_description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateProgramSpecificOutcomeDto = Omit<ProgramSpecificOutcome, 'id' | 'created_at' | 'updated_at'>;
export type UpdateProgramSpecificOutcomeDto = Partial<CreateProgramSpecificOutcomeDto>;

// ── Course Outcome ────────────────────────────────────────────────────

export interface CourseOutcome {
  id: string;
  institution_id: string;
  course_id: string;
  co_code: string;
  co_description: string;
  taxonomy_level?: BloomsLevel;
  taxonomy_dimension?: FinksDimension;
  secondary_dimensions?: FinksDimension[];
  target_percentage: number;
  attainment_level_3_threshold: number;
  attainment_level_2_threshold: number;
  attainment_level_1_threshold: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateCourseOutcomeDto = Omit<CourseOutcome, 'id' | 'created_at' | 'updated_at'>;
export type UpdateCourseOutcomeDto = Partial<CreateCourseOutcomeDto>;

// ── CO-PO Mapping ─────────────────────────────────────────────────────

export interface CoPoMapping {
  id: string;
  institution_id: string;
  co_id: string;
  po_id: string;
  correlation_level: CorrelationLevel;
  created_at: string;
}

export interface CoPsoMapping {
  id: string;
  institution_id: string;
  co_id: string;
  pso_id: string;
  correlation_level: CorrelationLevel;
  created_at: string;
}

// ── Filters & Responses ─────────────────────────────────────────────────

export interface ObeFilters {
  institution_id?: string;
  program_id?: string;
  regulation_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}
