/**
 * Internal Assessment (IA) Question Paper — MyJKKN consumer types.
 *
 * These MIRROR the COE app's `types/ia-question-paper.ts`. The COE database owns
 * the `ia_*` tables and exposes them over `/api/v1/ia/*`; MyJKKN pages talk to
 * thin proxy routes under `/api/question-papers/*` which forward to COE.
 *
 * The authoritative screen-by-screen contract is
 * `D:\JKKN\Development\Appliaction\COE\JKKN_COE\docs\ia-question-paper-entry-spec.md`.
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
  /** "Answer any N": only this many questions count toward the part total. Null = answer all. */
  num_to_answer?: number | null;
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
  /** Plain mirror of `text_html`, kept in step by `richTextToPlain`. Legacy
   *  papers carry only this; exports and anything reading options as strings use it. */
  text: string;
  /** Rich content as authored (bold, sub/superscript, inline equations).
   *  The COE PDF renderer PREFERS this whenever it is a non-empty string, so an
   *  edit that writes `text` without refreshing `text_html` is invisible in
   *  print. Always write BOTH — see `richTextToPlain` in lib/utils/question-papers. */
  text_html?: string | null;
}

/**
 * A figure attached to a question or sub-division; prints centred under that
 * question's text at `width_pct` of the ~190 mm A4 text column.
 *
 * Only http(s) URLs survive COE's `readQuestionImage` normaliser — the value is
 * written into an `<img src>` by the PDF renderer, so `javascript:` and `data:`
 * payloads are dropped server-side.
 */
export interface IaQuestionImage {
  url: string;
  /** Object path inside the public `question-images` bucket
   *  (`<paperId>/<uuid>.<ext>`). Kept so a later replace/remove can DELETE the
   *  object instead of orphaning it. */
  path?: string | null;
  /** Printed width as a percentage of the text column: 40 | 60 | 85. */
  width_pct?: number | null;
  px_w?: number | null;
  px_h?: number | null;
  bytes?: number | null;
}

/**
 * An author-defined split of one question slot into `i. / ii. / …` — a PAPER-level
 * decision, never a template one. One level only, max 10.
 *
 * Sub-division marks must sum EXACTLY to the parent question's marks, and each
 * sub-division carries its own CO + K-level (the parent's are nulled on save once
 * it is split). Labels and `display_order` are recomputed on every add/remove by
 * `relabelSubs`.
 */
export interface IaSubQuestion {
  id: string;
  /** Roman numeral, recomputed on every add/remove ("i", "ii", "iii"). */
  label: string;
  question_text: string | null;
  marks: number | null;
  co_code: string | null;
  k_level: string | null;
  image?: IaQuestionImage | null;
  display_order: number;
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
  /** CSS family override for THIS question's options. Rides inside the question
   *  object, so the merge rule covers it. */
  option_font?: string | null;
  image?: IaQuestionImage | null;
  correct_option?: string;
  /** Null once the question is split — each sub-division carries its own. */
  co_code?: string;
  /** Null once the question is split — each sub-division carries its own. */
  k_level?: string;
  /** Author-defined split. `null` / `[]` = not split. Only descriptive questions
   *  (no `options`) can be split. */
  sub_questions?: IaSubQuestion[] | null;
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
  /** Paper-wide default language/font: `null` = English default, else one of
   *  TAMIL_FONT_FAMILIES' `cssName`. There is NO per-question font picker — this
   *  cascades into every editor AND the PDF reads the same column, so screen and
   *  print agree. */
  default_font?: string | null;
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

/**
 * A single question edit sent on save.
 *
 * THE MERGE RULE (COE `lib/ia/apply-question-edits.ts`): *a field this payload
 * does not MENTION is preserved; only an explicit value — including `null` or
 * empty string — changes it.* So omitting `image` / `sub_questions` is SAFE (COE
 * re-reads the stored value), and every key present here is a deliberate write.
 *
 * Questions are matched by `id`; unknown ids are ignored. Slots come from the
 * template — this endpoint can neither add nor remove a question.
 */
export interface QuestionEditDto {
  id: string;
  question_number?: number;
  question_text?: string | null;
  marks?: number | null;
  options?: IaPaperQuestionOption[] | null;
  option_font?: string | null;
  image?: IaQuestionImage | null;
  correct_option?: string | null;
  co_code?: string | null;
  k_level?: string | null;
  sub_questions?: IaSubQuestion[] | null;
}

/** Body for PUT /api/question-papers/[id] (save / status transition / meta). */
export interface SavePaperDto {
  questions?: QuestionEditDto[];
  status?: PaperStatus;
  subject_title?: string;
  exam_date?: string | null;
  duration_minutes?: number | string | null;
  paper_setter_id?: string | null;
  /** Paper-wide font (`null` = English default). */
  default_font?: string | null;
  regenerate?: boolean;
  force?: boolean;
  /** Deliberate consent to a save that would blank 3+ already-authored questions.
   *  Without it COE refuses with 409 WOULD_CLEAR — the mass-clear guard. */
  allow_clear?: boolean;
  /** Optimistic-concurrency guard: the updated_at the client last loaded. The COE
   *  save 409s ("CONFLICT") if the paper changed since. */
  base_updated_at?: string;
}

// ── Paper-wide language / font ──────────────────────────────────────────────

/**
 * Mirrors COE `lib/ia/tamil-font-meta.ts`. `cssName` is what lands in
 * `ia_question_papers.default_font`; the PDF renderer embeds the matching face
 * from COE `public/fonts/tamil/`.
 *
 * Bamini and Suntommy are GLYPH fonts mapping Latin codepoints — they render
 * legacy-encoded Tamil, NOT Unicode Tamil. Text typed on a normal Tamil keyboard
 * needs "Unicode Tamil".
 */
export const TAMIL_FONT_FAMILIES = [
  { id: 'unicode', label: 'Unicode Tamil', cssName: 'Noto Sans Tamil' },
  { id: 'bamini', label: 'Bamini', cssName: 'Bamini' },
  { id: 'suntommy', label: 'Suntommy', cssName: 'Suntommy' },
] as const;

export type TamilFontId = (typeof TAMIL_FONT_FAMILIES)[number]['id'];

// ── Coded save errors ───────────────────────────────────────────────────────

/** Machine-readable codes COE's PUT can return. See spec §9.4. */
export type SaveErrorCode =
  | 'SUB_MARKS'
  | 'INCOMPLETE'
  | 'WOULD_CLEAR'
  | 'CONFLICT'
  | 'AUTHORED';

/**
 * A save rejection that carried a machine-readable code.
 *
 * COE puts the human-readable text in `message`, NOT in `error` — the service
 * surfaces `message ?? error` and stamps the code here so the UI can branch
 * (WOULD_CLEAR → confirm + retry with allow_clear, CONFLICT → tell the author to
 * reopen, INCOMPLETE → show the checklist panel).
 */
export class PaperSaveError extends Error {
  constructor(
    message: string,
    readonly code?: SaveErrorCode,
    readonly status?: number
  ) {
    super(message);
    this.name = 'PaperSaveError';
  }
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
