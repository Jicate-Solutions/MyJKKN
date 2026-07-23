/**
 * PDE Curriculum Connector — type definitions.
 * ============================================================================
 * Shapes for the BoS/VAC dual-lane curriculum link on pde_demonstrations and
 * the CLO/PO attainment math computed from validated evidence.
 *
 * Spec: specs/pde-bos-outcome-connector-2026-06-11.md
 * Migration: supabase/migrations/20260611230000_pde_bos_clo_connector.sql
 *
 * Source-of-truth JSONB shapes (probed live on bos_course_syllabi 2026-06-11):
 *   course_learning_outcomes = { clos: [{ clo_number, description, k_values[] }] }
 *   po_mappings              = { mappings: [{ co_id: "CO1", pos: {PO1:"H"...}, psos: {PSO1:"M"...} }] }
 * The co_id → clo_number join is by convention: "CO3" maps to clo_number 3.
 */

export interface BosSyllabusOption {
  id: string;
  course_code: string;
  course_name: string;
  version_number: number;
}

export interface VacCourseOption {
  id: string;
  code: string | null;
  name: string;
  track: string | null;
}

export interface SyllabusCLO {
  clo_number: number;
  description: string;
  k_values: string[];
}

export interface SyllabusCLOResult {
  syllabus: BosSyllabusOption;
  clos: SyllabusCLO[];
}

export interface PoMappingEntry {
  co_id: string;
  /** Parsed from co_id ("CO3" → 3); null when co_id carries no digits. */
  clo_number: number | null;
  pos: Record<string, string>;
  psos: Record<string, string>;
}

/** Minimal demonstration slice the attainment fold consumes. */
export interface AttainmentDemoRow {
  learner_id: string;
  status: string;
  passed: boolean | null;
  clo_refs_confirmed: number[] | null;
}

export interface CLOAttainmentRow {
  clo_number: number;
  description: string;
  /** Distinct learners with ≥1 PASSED demo validator-confirmed for this CLO. */
  attained_learners: number;
  /** Distinct learners with ≥1 non-draft, non-withdrawn demo on this syllabus. */
  participating_learners: number;
  /** null when participating_learners is 0 — "no evidence yet", never NaN. */
  attainment_pct: number | null;
}

export interface SyllabusAttainment {
  syllabus_id: string;
  course_code: string;
  course_name: string;
  version_number: number;
  participating_learners: number;
  demo_count: number;
  clos: CLOAttainmentRow[];
}

export interface OutcomeAttainmentRow {
  /** PO1 / PSO2 / ... */
  outcome_key: string;
  /** Weighted mean of contributing CLO attainments; null when no evidence. */
  attainment_pct: number | null;
  total_weight: number;
  contributing_clos: number;
}

export interface CurriculumAttainmentResult {
  institution_id: string | null;
  generated_at: string;
  /**
   * One section per syllabus VERSION with evidence (version pinning, spec §4.5:
   * demos keep the syllabus row current at submission; each version is its own
   * bos_course_syllabi row, so >1 version with evidence → >1 section here).
   */
  syllabi: SyllabusAttainment[];
  po: OutcomeAttainmentRow[];
  pso: OutcomeAttainmentRow[];
  participating_learners: number;
}
