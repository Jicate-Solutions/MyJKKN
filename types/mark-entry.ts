/**
 * Question-wise CIA mark entry — MyJKKN consumer types.
 *
 * Mirrors the COE feature shipped in `app/(coe)/pre-exam/internal-mark-entry`
 * (spec: 2026-08-13-question-wise-cia-mark-entry-myjkkn-port.md). COE remains the
 * system of record; MyJKKN is an entry client.
 *
 * The invariant everything else rests on: the component mark
 * (`test_1_mark` / `assignment_marks` / `extra_marks[code]`) always holds the SUM
 * of its question marks. `question_marks` is an ADDITIVE detail behind that
 * number — never a replacement. Every existing consumer of component totals
 * (reports, marksheets, GPA) is therefore unaffected.
 *
 * ── COE contract, as of 2026-08-13 ───────────────────────────────────────────
 * `POST /api/v1/cia-marks/sync` accepts `question_marks` (COE `lib/cia/
 * question-marks.ts`). Three rules matter to this client:
 *   1. THE BREAKDOWN WINS. COE re-derives each component total from the sum of
 *      its breakdown and IGNORES whatever the caller sent for that column. We
 *      still compute a total for display, but it is not load-bearing on save.
 *   2. Writing a component total WITHOUT a breakdown clears any stale stored
 *      breakdown. This is what makes both the component re-point and the
 *      absent-learner path clean up after themselves.
 *   3. Per-question max, OR pairs and answer-any-N are validated server-side
 *      from the same implementation COE's own entry screen uses. We mirror them
 *      client-side for immediate feedback, never as the authority.
 *
 * PREREQUISITE: migration `20260812_add_question_marks_to_cia_marks.sql` must be
 * applied by hand in the Supabase SQL editor. Until it is, every write fails with
 * `column "question_marks" does not exist`.
 *
 * Entry is only permitted against `submitted` / `approved` / `locked` papers —
 * see ENTRY_ELIGIBLE_STATUSES in lib/utils/mark-entry/entry-rules.ts.
 *
 * ── Still open ───────────────────────────────────────────────────────────────
 *  - No v1 endpoint returns the mark-entry paper shape (`choice_group`,
 *    `parts[].num_to_answer`). Derived in entry-rules.ts from what the detail
 *    endpoint already returns.
 *  - `GET /api/v1/cia-marks/report` emits only the 13 component codes, so saved
 *    `question_marks` CANNOT be read back. Within a session the localStorage
 *    draft covers it; across sessions the breakdown is not recoverable.
 *  - Shared papers: `ia_question_papers` is UNIQUE on
 *    (cia_setting_id, cia_round, course_offering_id, set_number) and COE's own
 *    lookup filters on course_offering_id, so a paper is bound to ONE offering.
 *    MyJKKN resolves by course_code across offerings so a common course authored
 *    once serves every program. Writes work (keyed by paper_id), but COE's entry
 *    screen will not find that paper for the other programs' offerings until the
 *    schema gains a link table or an offerings array. Pending a schema decision.
 */

import type { PaperStatus } from './ia-question-paper';

/** How faculty key in marks for a CIA round. Absent on legacy rounds ⇒ 'direct'. */
export type MarkEntryType = 'direct' | 'question_wise';

/** Why a grid cell is not editable — drives the tooltip text. */
export type LockReason = 'or-sibling' | 'answer-limit' | null;

// ── Paper, reshaped for entry ───────────────────────────────────────────────

/**
 * One question as the entry grid needs it. Derived from
 * `ia_question_papers.questions[]` + `ia_template_parts`.
 *
 * `id` is the stable key marks are filed under — never the index or the question
 * number, both of which move when a paper is renumbered.
 */
export interface EntryQuestion {
  id: string;
  /** Display label: question_number + sub_label, e.g. "6a". */
  label: string;
  part_label: string;
  question_number: number;
  sub_label?: string;
  /**
   * `${part_label}|${question_number}` — questions sharing this are OR
   * alternatives and at most ONE of them may hold a mark.
   */
  choice_group: string;
  /** Per-question max. */
  marks: number;
  is_choice_alternative: boolean;
  co_code?: string;
  k_level?: string;
  /** Tooltip only — never rendered inline in the grid. */
  question_text?: string;
  display_order: number;
}

/** A template part, reduced to what the entry rules need. */
export interface EntryPart {
  part_label: string;
  /** Distinct choice groups in this part (an OR pair counts as ONE). */
  group_count: number;
  /**
   * "Answer any N" limit, counted in GROUPS. Null unless it is a real
   * restriction (`0 < num_to_answer < num_questions`).
   */
  num_to_answer: number | null;
}

/** A candidate paper for the Set / source-paper dropdown. */
export interface MarkEntryPaperOption {
  id: string;
  set_number: number;
  set_label?: string;
  status: PaperStatus;
  authored: boolean;
  program_code?: string;
  /** True when this paper belongs to a DIFFERENT program than the one selected. */
  is_shared: boolean;
}

/** The resolved paper the grid renders. */
export interface MarkEntryPaper {
  id: string;
  course_code: string;
  subject_title?: string;
  set_number: number;
  set_label?: string;
  status: PaperStatus;
  /** Paper total from the template. */
  max_marks: number;
  /** Sum of every question's marks — exceeding max_marks is NORMAL (OR choices). */
  questions_total: number;
  questions: EntryQuestion[];
  parts: EntryPart[];
  /** Program the paper was authored under. */
  program_code?: string;
  /**
   * True when the paper came from another program's offering — a course common
   * across programs (e.g. 24UGEN03) authored once. Drives the source banner.
   */
  is_shared: boolean;
}

/**
 * What the caller may do, resolved server-side from resolveQpScope so the UI and
 * the API can never disagree.
 *
 * `can_enter` is false for the 'all' tier (principal / registrar / CoE office):
 * leadership sees every course and the completion picture, but entry stays with
 * the faculty who taught and the HOD who covers for them. super_admin is exempt.
 */
export interface MarkEntryAccess {
  level: 'all' | 'program' | 'course';
  can_enter: boolean;
}

/** Response of GET /api/mark-entry/paper. */
export interface MarkEntryPaperResponse {
  /** Entry-eligible papers matching course + session + round, across all programs. */
  options: MarkEntryPaperOption[];
  /** The auto-picked (or explicitly requested) paper, fully expanded. */
  paper: MarkEntryPaper | null;
  access: MarkEntryAccess;
  /**
   * True when papers DO exist for this course + round but every one of them is
   * still a draft, so none is entry-eligible.
   *
   * "Nobody has authored a paper" and "the paper is written but not submitted"
   * look identical from an empty grid, yet they need opposite actions from the
   * user — write one, versus go and chase the setter to submit it. Worth the
   * extra field to tell them apart.
   */
  draft_only: boolean;
  /** Set labels of those drafts, so the message can name what is waiting. */
  draft_set_labels?: string[];
}

// ── Marks ───────────────────────────────────────────────────────────────────

/**
 * The `cia_marks.question_marks[component_code]` block.
 * An omitted question id means NOT ATTEMPTED — which is how the unanswered half
 * of an OR pair is recorded. Never write a 0 for it.
 */
export interface QuestionMarksBlock {
  paper_id: string;
  set_number: number;
  set_label?: string;
  /** question id → mark. Whole numbers only (cia_marks columns are INTEGER). */
  marks: Record<string, number>;
}

/**
 * The grade COE uses to record absence, matching the grading module and bulk
 * internal marks.
 *
 * Absence is a DIFFERENT FACT from a zero: `grade = 'AAA'` means the learner did
 * not sit the assessment, while a zero with no grade means they sat it and scored
 * nothing. Conflating them corrupts pass/fail and attainment reporting, so the
 * grid captures it explicitly rather than inferring it from empty inputs.
 */
export const ABSENT_GRADE = 'AAA';

/** One learner's in-progress entry state. */
export interface LearnerEntry {
  student_id: string;
  exam_registration_id: string;
  register_number: string;
  student_name: string;
  course_offering_id: string;
  /** question id → mark. Absent key = not attempted. */
  marks: Record<string, number>;
  /** Learner did not sit the assessment — saved as grade 'AAA', not as zeros. */
  is_absent?: boolean;
}

/** A record sent to POST /api/mark-entry/marks. */
export interface QuestionMarkSyncRecord {
  institutions_id: string;
  examination_session_id: string;
  course_offering_id: string;
  student_id: string;
  exam_registration_id: string;
  cia_round: number;
  cia_setting_id?: string;
  submission_date: string;
  marks_status: string;
  /** Component the paper feeds — COE derives its total from the breakdown. */
  component_code: string;
  component_max: number;
  max_internal_marks: number;
  /**
   * Learner did not sit the assessment. Sends grade 'AAA' with a zeroed
   * component and NO breakdown, so COE's "overwriting a total without a
   * breakdown clears the stale one" rule removes any previously saved detail.
   */
  is_absent?: boolean;
  /**
   * Set when the user re-pointed "Marks go to" after a previous save. The old
   * component must be zeroed in the same write, or it keeps a stale total that
   * every downstream report still reads as real.
   */
  clear_component_code?: string;
  question_marks: Record<string, QuestionMarksBlock>;
}

export interface QuestionMarkSaveRequest {
  records: QuestionMarkSyncRecord[];
  /** Echoed back so the client can show which learners failed. */
  paper_id: string;
  /** Re-checked server-side against the caller's scope — never trusted for display. */
  course_code: string;
  program_code: string;
  /** CIA assessment period, so a lapsed staff plan still authorizes the write. */
  session_from?: string | null;
  session_to?: string | null;
}

export interface QuestionMarkSaveResponse {
  success: boolean;
  inserted: number;
  updated: number;
  failed: number;
  total: number;
  /** Register numbers that failed — surfaced verbatim in the error toast. */
  details?: string[];
  message?: string;
}

// ── CO / Bloom attainment ───────────────────────────────────────────────────

export interface AttainmentBucket {
  key: string;
  obtained: number;
  max: number;
  /** obtained / max × 100, or null when nothing has been entered yet. */
  percentage: number | null;
}

export interface AttainmentSummary {
  co: AttainmentBucket[];
  kLevel: AttainmentBucket[];
  /** Learners with at least one mark entered. */
  learnersEntered: number;
  learnersTotal: number;
}

// ── Draft (localStorage) ────────────────────────────────────────────────────

/**
 * A local draft, mirrored on every keystroke so entry survives a crash, an
 * outage or a closed tab. NEVER auto-applied over database values — always
 * offered back through a banner.
 */
export interface MarkEntryDraft {
  saved_at: string;
  paper_id: string;
  component_code: string;
  /** student_id → (question id → mark) */
  entries: Record<string, Record<string, number>>;
  /** student_ids marked absent. Optional so older drafts still parse. */
  absent?: string[];
  /** Learners keyed in OR marked absent — shown in the restore banner. */
  count: number;
}

// ── Part colours ────────────────────────────────────────────────────────────

/**
 * Part palette in the paper's own part order (emerald → sky → violet → amber →
 * rose), matching the COE grid so the two screens read identically.
 */
export const PART_COLORS = [
  {
    header: 'bg-emerald-700 text-emerald-50',
    cell: 'bg-emerald-50/60 dark:bg-emerald-950/30',
    input: 'border-emerald-300 dark:border-emerald-800',
    edge: 'border-l-4 border-l-emerald-500',
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  },
  {
    header: 'bg-sky-700 text-sky-50',
    cell: 'bg-sky-50/60 dark:bg-sky-950/30',
    input: 'border-sky-300 dark:border-sky-800',
    edge: 'border-l-4 border-l-sky-500',
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  },
  {
    header: 'bg-violet-700 text-violet-50',
    cell: 'bg-violet-50/60 dark:bg-violet-950/30',
    input: 'border-violet-300 dark:border-violet-800',
    edge: 'border-l-4 border-l-violet-500',
    chip: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  },
  {
    header: 'bg-amber-700 text-amber-50',
    cell: 'bg-amber-50/60 dark:bg-amber-950/30',
    input: 'border-amber-300 dark:border-amber-800',
    edge: 'border-l-4 border-l-amber-500',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  },
  {
    header: 'bg-rose-700 text-rose-50',
    cell: 'bg-rose-50/60 dark:bg-rose-950/30',
    input: 'border-rose-300 dark:border-rose-800',
    edge: 'border-l-4 border-l-rose-500',
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  },
] as const;

export function partColor(index: number) {
  return PART_COLORS[index % PART_COLORS.length];
}

/**
 * Frozen-column widths. These MUST be pinned inline on every cell
 * (width/minWidth/maxWidth) — a column left to `table-layout: auto` sizes to its
 * content, drifts from the computed `left` offset, and the frozen columns then
 * overlap. Both the offsets and the styles derive from this one constant.
 */
export const FROZEN_W = { sno: 48, register: 130, name: 190 } as const;
export const FROZEN_LEFT = {
  sno: 0,
  register: FROZEN_W.sno,
  name: FROZEN_W.sno + FROZEN_W.register,
} as const;
