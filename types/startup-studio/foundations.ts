// types/startup-studio/foundations.ts
// Startup Studio — Foundations (Level 0) type contract.
//
// Self-contained on purpose: the sf100 exercise types (SF100ExerciseField) are
// not exported on current jicate/main, so Foundations owns its field vocabulary
// rather than depending on a phantom type. The field shape mirrors the
// `fields` JSONB documented in migration 20260602000001_ss_foundations_substrate.sql.
// Spec: specs/startup-studio-foundations-level0-spec-2026-06-01.md

// ----- Worksheet field vocabulary -----
export type FoundationsFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'number'
  | 'scale'
  | 'matrix' // editable table (assumption analyzer, revenue/cost grids, ratings)
  | 'markdown' // display-only instructional / case-study content
  | 'image'; // drawing / logo upload (Draw Your Solution, Design a Logo)

export interface FoundationsMatrixColumn {
  key: string;
  label: string;
  type?: 'text' | 'number';
}

export interface FoundationsWorksheetField {
  id: string;
  type: FoundationsFieldType;
  label: string;
  required?: boolean;
  /** select | radio options, or scale endpoint labels */
  options?: string[];
  placeholder?: string;
  /** scale: upper bound (default 10) */
  scale_max?: number;
  /** matrix: column definitions */
  columns?: FoundationsMatrixColumn[];
  /** matrix: number of starter rows (default 1; user can add more) */
  rows?: number;
  /** markdown: display-only body text (rendered, not edited) */
  content?: string;
}

export type FoundationsStrand =
  | 'mindset'
  | 'ideation'
  | 'evaluation'
  | 'model'
  | 'pitch'
  | 'reflection';

// ----- Persisted entities (mirror ss_foundations_* tables) -----
export type FoundationsCohortStatus = 'draft' | 'active' | 'completed' | 'archived';
export type FoundationsEnrollmentStatus = 'active' | 'completed' | 'withdrawn';
export type FoundationsResponseStatus = 'draft' | 'submitted' | 'reviewed';

export interface FoundationsCohort {
  id: string;
  name: string;
  institution_id: string;
  academic_year: string | null;
  lead_mentor_id: string | null;
  enrollment_mode: 'facilitator' | 'self' | 'both';
  status: FoundationsCohortStatus;
  starts_on: string | null;
  ends_on: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FoundationsEnrollment {
  id: string;
  cohort_id: string;
  student_id: string;
  enrolled_via: 'facilitator' | 'self';
  status: FoundationsEnrollmentStatus;
  enrolled_at: string;
  enrolled_by: string | null;
  /**
   * Cohort-core link (migration 20260731080000): the cohort_memberships row that
   * mirrors this per-student enrollment onto the shared spine. Nullable — set at
   * enroll-time (best-effort) or left null for rows that pre-date the spine mirror.
   */
  cohort_membership_id?: string | null;
}

export interface FoundationsWorksheet {
  id: string;
  cohort_id: string | null; // null = global canon
  session_no: number;
  strand: FoundationsStrand;
  title: string;
  description: string | null;
  fields: FoundationsWorksheetField[];
  is_required: boolean;
  sort_order: number;
  status: 'draft' | 'published' | 'archived';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FoundationsResponse {
  id: string;
  worksheet_id: string;
  student_id: string;
  cohort_id: string | null;
  response_data: Record<string, unknown>;
  fields_snapshot: FoundationsWorksheetField[];
  status: FoundationsResponseStatus;
  current_version: number;
  submitted_by: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  mentor_feedback: string | null;
  mentor_rating: number | null;
  created_at: string;
  updated_at: string;
}

/** A worksheet joined with the current student's response (for the journey UI). */
export interface FoundationsWorksheetWithResponse extends FoundationsWorksheet {
  response: FoundationsResponse | null;
}

// ----- DTOs -----
export interface SubmitFoundationsResponseDto {
  worksheet_id: string;
  response_data: Record<string, unknown>;
  cohort_id?: string | null;
  status?: Extract<FoundationsResponseStatus, 'draft' | 'submitted'>;
}

export interface ReviewFoundationsResponseDto {
  mentor_feedback?: string;
  mentor_rating?: number;
}

export interface FoundationsProgress {
  student_id: string;
  total_required: number;
  submitted_required: number;
  reviewed_required: number;
  completion_pct: number; // submitted_required / total_required (decision #3)
  graduated: boolean; // completion_pct >= graduation threshold
}
