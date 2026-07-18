/**
 * Internal Assessment (IA) Question Paper — MyJKKN consumer types.
 *
 * These MIRROR the COE app's `types/ia-question-paper.ts`. The COE database owns
 * the `ia_*` tables and exposes them over `/api/v1/ia/*`; MyJKKN pages talk to
 * thin proxy routes under `/api/question-papers/*` which forward to COE.
 *
 * CAS note: MyJKKN has separate SF + Aided institutions, but COE collapses both
 * to ONE institution (e.g. institution_code = "CAS"). The proxy resolves the
 * MyJKKN institution UUID → COE institution_code, so both branches read/write the
 * same papers automatically. See lib/utils/internal-marks/internal-marks-access.ts.
 */

export type ExamScope = 'cia' | 'ese' | 'all';
export type TemplateStatus = 'draft' | 'active' | 'archived';
export type PaperStatus = 'draft' | 'submitted' | 'approved' | 'locked';
export type CourseTypeApplicability =
  | 'theory'
  | 'practical'
  | 'project'
  | 'theory_practical'
  | 'all';
export type ProgramTypeApplicability = 'ug' | 'pg' | 'diploma' | 'certificate' | 'all';

// ── Template parts / header ─────────────────────────────────────────────────

export interface IaTemplatePart {
  id: string;
  template_id: string;
  part_label: string;
  part_title?: string;
  instruction?: string;
  question_type_code: string;
  num_questions: number;
  marks_per_question: number;
  has_choice: boolean;
  choice_group_size: number;
  option_count?: number | null;
  capture_co: boolean;
  capture_klevel: boolean;
  part_max_marks: number;
  display_order: number;
  is_active: boolean;
}

export interface IaPaperTemplate {
  id: string;
  institutions_id: string;
  institution_code: string;
  regulation_id?: string;
  regulation_code?: string;
  template_code: string;
  template_name: string;
  description?: string;
  exam_scope: ExamScope;
  course_type_applicability: CourseTypeApplicability;
  program_type_applicability: ProgramTypeApplicability;
  total_marks: number;
  duration_minutes?: number | null;
  capture_co: boolean;
  capture_klevel: boolean;
  wef_date: string;
  version_number: number;
  status: TemplateStatus;
  is_default: boolean;
  is_active: boolean;
  ia_template_parts?: IaTemplatePart[];
}

// ── Course outcomes master ──────────────────────────────────────────────────

export interface IaCourseOutcome {
  id: string;
  institutions_id: string;
  course_id: string;
  course_code: string;
  co_code: string;
  co_description?: string;
  display_order: number;
  is_active: boolean;
}

// ── Question paper instance + questions ─────────────────────────────────────

export interface IaPaperQuestionOption {
  key: string;
  text: string;
}

export interface IaPaperQuestion {
  id: string;
  paper_id: string;
  part_id?: string;
  part_label?: string;
  question_number: number;
  sub_label?: string;
  is_choice_alternative: boolean;
  question_type_code?: string;
  question_text?: string;
  marks?: number;
  options?: IaPaperQuestionOption[] | null;
  correct_option?: string;
  co_code?: string;
  k_level?: string;
  display_order: number;
}

export interface IaQuestionPaper {
  id: string;
  institutions_id: string;
  examination_session_id: string;
  cia_setting_id?: string;
  cia_round?: number;
  cia_round_name?: string;
  course_offering_id?: string;
  course_id?: string;
  course_code?: string;
  program_code?: string;
  semester?: number;
  template_id?: string;
  template_version?: number;
  set_number: number;
  set_label?: string;
  subject_title?: string;
  exam_date?: string;
  duration_minutes?: number;
  max_marks?: number;
  status: PaperStatus;
  paper_setter_id?: string;
  author_id?: string;
  created_at?: string;
  updated_at?: string;
  /** Enriched server-side from COE `courses.course_category` — the canonical
   *  theory/practical classifier ('Theory' | 'Practical' | 'Theory + Practical' |
   *  'Project' | 'Field Work'). The IA list endpoint does not return it. */
  course_category?: string;
  /** Questions live in the `ia_question_papers.questions` JSONB column (the
   *  ia_paper_questions table was dropped 2026-07-18). Present on detail; the list
   *  endpoint omits the array and returns `authored` instead. */
  questions?: IaPaperQuestion[];
  /** List-only: does any question have text? Gates PDF export/download. */
  authored?: boolean;
}

/** Full detail returned by GET /api/question-papers/[id] (paper + questions + template parts + CO master). */
export interface IaQuestionPaperDetail extends IaQuestionPaper {
  questions: IaPaperQuestion[];
  template_parts: IaTemplatePart[];
  course_outcomes: IaCourseOutcome[];
}

// ── Staff-planning gate ─────────────────────────────────────────────────────

/**
 * A distinct (program, semester) scope that has an ACTIVE staff_plans row for the
 * exam session's academic year. Only these scopes are offered for QP entry, so
 * subjects are "only visible per staff planning". program_code/semester_number map
 * to COE course_offerings (programs.program_id / semesters.semester_order).
 */
export interface PlannedScope {
  program_code: string;
  program_name: string;
  semester_number: number;
  semester_name: string;
}

// ── Request DTOs (MyJKKN → proxy) ───────────────────────────────────────────

/** Filters for GET /api/question-papers (list). */
export interface QuestionPaperListFilters {
  institutionId?: string;
  examSessionId?: string;
  ciaRound?: number;
  programCode?: string;
  semester?: number;
  status?: PaperStatus;
}

/** Body for POST /api/question-papers (bulk scaffold from applicable template). */
export interface GeneratePapersDto {
  institutionId?: string;
  examSessionId: string;
  programCode: string;
  semester: number;
  ciaRound?: number;
  ciaRoundName?: string;
  ciaSettingId?: string;
  templateId?: string;
}

export interface GeneratePapersResult {
  created: number;
  skipped: number;
}

/** A single question edit sent on autosave. */
export interface QuestionEditDto {
  id: string;
  question_number?: number;
  question_text?: string | null;
  marks?: number | null;
  options?: IaPaperQuestionOption[] | null;
  correct_option?: string | null;
  co_code?: string | null;
  k_level?: string | null;
}

/** Body for PUT /api/question-papers/[id] (save / status transition / meta). */
export interface SavePaperDto {
  questions?: QuestionEditDto[];
  status?: PaperStatus;
  subject_title?: string;
  exam_date?: string | null;
  duration_minutes?: number | string | null;
  paper_setter_id?: string | null;
  regenerate?: boolean;
  force?: boolean;
  /** Optimistic-concurrency guard: the updated_at the client last loaded. The COE
   *  save 409s ("CONFLICT") if the paper changed since. */
  base_updated_at?: string;
}

// ── K-level (Bloom) reference ───────────────────────────────────────────────

/** Fallback CO options when a course has no ia_course_outcomes master seeded. */
export const CO_FALLBACK: string[] = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO6'];

export const K_LEVELS: { code: string; label: string }[] = [
  { code: 'K1', label: 'K1 — Remember' },
  { code: 'K2', label: 'K2 — Understand' },
  { code: 'K3', label: 'K3 — Apply' },
  { code: 'K4', label: 'K4 — Analyze' },
  { code: 'K5', label: 'K5 — Evaluate' },
  { code: 'K6', label: 'K6 — Create' },
];

/** Status → badge styling helper for the paper list. */
export const PAPER_STATUS_META: Record<
  PaperStatus,
  { label: string; className: string }
> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  submitted: {
    label: 'Submitted',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  approved: {
    label: 'Approved',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  locked: { label: 'Locked', className: 'bg-blue-100 text-blue-800 border-blue-200' },
};
