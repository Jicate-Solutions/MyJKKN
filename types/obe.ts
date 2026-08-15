// ── OBE Type Definitions ────────────────────────────────────────────────
// Outcome-Based Education system supporting Bloom's, Fink's and JKKN Advanced
// Bloom's (JABT) taxonomies.

/*
 * THREE frameworks, not two. 'jkkn_advanced' is seeded in bos_taxonomy with all
 * eleven levels (spec §3, verified against the live catalog 2026-08-15), and
 * bos_regulation_taxonomies.taxonomy_type is an unconstrained varchar — so the third
 * value reaches the surfaces reading this type today.
 *
 * CAVEAT, recorded here on purpose: the repo's migrations do NOT admit it everywhere.
 * chk_curriculum_lesson_primary_taxonomy (supabase/migrations/20260801110000) still
 * reads IN ('finks','blooms'), and no migration in this repo defines
 * obe_regulation_config_taxonomy_type_check at all. Spec §8.3/§10 records both as
 * altered on production, but that alter has no migration file, so the repo is not the
 * authority. Verify the LIVE constraint before writing 'jkkn_advanced' to
 * curriculum_lesson.primary_taxonomy or obe_regulation_config.
 *
 * See specs/jkkn-advanced-blooms-taxonomy-2026-07-30.md (§2.2, §8.3, §8.4).
 */
export type TaxonomyType = 'blooms' | 'finks' | 'jkkn_advanced';
export type BloomsLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
export type FinksDimension = 'FK' | 'AP' | 'IN' | 'HD' | 'CA' | 'LL';
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

// Fink's labels
export const FINKS_DIMENSION_LABELS: Record<FinksDimension, string> = {
  FK: 'Foundational Knowledge',
  AP: 'Application',
  IN: 'Integration',
  HD: 'Human Dimension',
  CA: 'Caring',
  LL: 'Learning How to Learn',
};

// ── JKKN Advanced Bloom's Taxonomy (JABT) ─────────────────────────────
// Spec §2.2 — eleven elements: Bloom's six retained unchanged (K1-K6, a
// hierarchy) plus five added (A1-A5, deliberately FLAT and unordered — A1 is
// not lower than A3). The mixed shape is the point; do not force it into one
// bucket.

export type JabtKLevel = 'K1' | 'K2' | 'K3' | 'K4' | 'K5' | 'K6';
export type JabtADimension = 'A1' | 'A2' | 'A3' | 'A4' | 'A5';
export type JabtElement = JabtKLevel | JabtADimension;

export const JABT_K_LEVELS: JabtKLevel[] = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'];
export const JABT_A_DIMENSIONS: JabtADimension[] = ['A1', 'A2', 'A3', 'A4', 'A5'];
export const JABT_ELEMENTS: JabtElement[] = [...JABT_K_LEVELS, ...JABT_A_DIMENSIONS];

export const JABT_ELEMENT_LABELS: Record<JabtElement, string> = {
  K1: 'Remember',
  K2: 'Understand',
  K3: 'Apply',
  K4: 'Analyze',
  K5: 'Evaluate',
  K6: 'Create',
  A1: 'Human Dimension',
  A2: 'Caring',
  A3: 'Learning How to Learn',
  A4: 'Performed Skill',
  A5: 'Accountable AI Use',
};

/*
 * Mandatory attribution line — spec §1. Must appear wherever JABT is formally
 * defined or named as the framework in force.
 */
export const JABT_ATTRIBUTION =
  "JKKN Advanced Bloom's Taxonomy: Bloom's revised cognitive taxonomy (Bloom et al., 1956; " +
  "Anderson & Krathwohl, 2001) retained in full, extended by three dimensions drawn from " +
  "L. Dee Fink's Taxonomy of Significant Learning (Creating Significant Learning Experiences, " +
  '2003) — Human Dimension, Caring, and Learning How to Learn; by Performed Skill, ' +
  "operationalising Bloom's uncompleted psychomotor domain in three bands after Simpson (1972); " +
  'and by Accountable AI Use, which has no precedent in either author.';

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
