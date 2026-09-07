// File: types/onemark.ts
//
// OneMark — the Tamil Nadu State Board Class-12 one-mark MCQ product, built as
// an extension of the Foundation module (fp_*). Row shapes for the tables and
// columns added by migration 20260917111500_onemark_wave1_schema_seeds_roles.sql.
// Types only — no runtime code. Rulings of record: specs/onemark-decisions-2026-09-02.md.

/** How the four options are laid out on paper (PRD Physics §4.3 / English §4.5).
 *  `auto` computes the layout from the longest option at render time. */
export type OneMarkOptionLayout = 'auto' | 'inline_4' | 'inline_2x2' | 'stacked';

/** How an fp_attempts row was taken (decision 17). NULL on rows that predate OneMark. */
export type OneMarkAttemptMode = 'practice' | 'timed' | 'live' | 'vault_review';

/** Mistake Vault row state (decisions 9 / 10). Mastery is revocable. */
export type MistakeVaultStatus = 'active' | 'mastered';

/** What an onemark_question_assets row holds. */
export type OneMarkAssetType = 'svg' | 'png' | 'katex_block';

/** Provenance classes seeded in onemark_item_sources (PRD §3.3 Source Filter).
 *  A subject Senior Learner may add rows — keep this type open-ended via `string`
 *  at call sites that read the master table. */
export type OneMarkSeededSourceKey =
  | 'textbook_back'
  | 'past_board_exam'
  | 'district_revision'
  | 'model_paper'
  | 'internal';

/** Shared mixin from docs/architecture/config-table-pattern.md, as used on the
 *  two master tables and the weights table. */
interface OneMarkConfigMixin {
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  change_reason: string | null;
}

/** onemark_item_tags — the category-tag vocabulary. fp_items.tags holds these keys. */
export interface OneMarkItemTag extends OneMarkConfigMixin {
  key: string;
  label: string;
  /** exam_definitions.id the tag belongs to; null = usable by any subject. */
  subject_exam_definition_id: string | null;
  is_system: boolean;
  sort_order: number;
}

/** onemark_item_sources — where a one-mark item came from. */
export interface OneMarkItemSource extends OneMarkConfigMixin {
  key: string;
  label: string;
  is_system: boolean;
  sort_order: number;
}

/** onemark_question_assets — a figure or KaTeX block that renders with an item. */
export interface OneMarkQuestionAsset {
  id: string;
  item_id: string;
  asset_type: OneMarkAssetType;
  storage_path: string | null;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** onemark_category_weights — per-subject empirical weight of a tag for the
 *  proportional generator (PRD English §4.3). */
export interface OneMarkCategoryWeight extends OneMarkConfigMixin {
  id: string;
  exam_definition_id: string;
  tag_key: string;
  weight: number;
}

/** onemark_mistake_vault — per (learner, question) spaced-repetition state
 *  (PRD §6.3). NOT fp_student_weakness, which is a per-topic counter. */
export interface MistakeVaultRow {
  id: string;
  /** fp_students.id */
  student_id: string;
  /** fp_items.id */
  item_id: string;
  /** Correct answers in DISTINCT review sessions since the last wrong answer. */
  consecutive_correct_count: number;
  /** fp_attempts.session_id of the most recent counted correct answer. */
  last_correct_session_id: string | null;
  total_wrong: number;
  status: MistakeVaultStatus;
  mastered_at: string | null;
  /** Earliest time the item may be drawn for review again. */
  next_eligible_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The columns Wave 1 adds to fp_items. Intersect with the existing item row
 *  type at the call site: `FpItem & FpItemOneMarkColumns`. */
export interface FpItemOneMarkColumns {
  stem_ta: string | null;
  /** Same shape and order as `options`. */
  options_ta: unknown[] | null;
  explanation_ta: string | null;
  option_layout: OneMarkOptionLayout;
  /** Keys from onemark_item_tags. */
  tags: string[];
  /** Key from onemark_item_sources. Distinct from the legacy `source` column. */
  source_key: string | null;
  source_year: number | null;
  source_sitting: string | null;
  source_series: string | null;
  source_qno: number | null;
  times_served: number;
  times_correct: number;
}

/** The columns Wave 1 adds to fp_attempts, plus the two Wave 3 adds
 *  (20260919120000_onemark_wave3_schema.sql). */
export interface FpAttemptOneMarkColumns {
  mode: OneMarkAttemptMode | null;
  /** Groups the attempts of one sitting (decision 9). */
  session_id: string | null;
  /** Wave 3. The item ids this sitting actually served, recorded at draw time.
   *  NULL on a live paper (its set is fp_assessment_items) and on every
   *  pre-Wave-3 attempt. When it is set, fn_onemark_record_response and
   *  fn_onemark_finalize_attempt refuse any item outside it (SQLSTATE 22023) —
   *  the server-side wall that replaces the HMAC served-set token. */
  served_item_ids: string[] | null;
  /** Wave 3. Per-sitting settings recorded at draw time. */
  config: OneMarkAttemptConfig;
}

/** fp_attempts.config (Wave 3). Open-ended on purpose — read what you wrote. */
export interface OneMarkAttemptConfig {
  /** onemark_item_sources keys the learner picked. Absent or empty = all
   *  sources. fn_onemark_source_analytics reads this to know what was asked
   *  for; what was actually SERVED is read from the responses' items. */
  source_keys?: string[];
  [key: string]: unknown;
}

/** The column Wave 1 adds to fp_responses (decision 18: skipped is not wrong). */
export interface FpResponseOneMarkColumns {
  skipped: boolean;
}

/** platform_policies keys seeded by Wave 1. Read server-side via
 *  fn_get_policy_int(key, default). Defaults are the PRD values. */
export const OneMarkPolicyKeys = {
  VAULT_MASTERY_STREAK: 'onemark.vault.mastery_streak',
  VAULT_MIN_GAP_DAYS: 'onemark.vault.min_gap_days',
  VAULT_MAX_SINGLE_CHAPTER_PCT: 'onemark.vault.max_single_chapter_pct',
  TIMED_DEFAULT_MINUTES: 'onemark.timed.default_minutes',
  PAPER_QUESTION_COUNT: 'onemark.paper.question_count',
  PAPER_MAX_SERIES: 'onemark.paper.max_series',
  /** Wave 3 (20260919120000). */
  PAPER_QUESTION_COUNT_TN_HSC_ENGLISH: 'onemark.paper.question_count.tn_hsc_english',
  LIVE_AUTO_CLOSE_AFTER_MINUTES: 'onemark.live.auto_close_after_minutes',
  LIVE_GRACE_SECONDS: 'onemark.live.grace_seconds',
  RESULTS_MIN_LEARNERS_FOR_ITEM_STATS: 'onemark.results.min_learners_for_item_stats',
} as const;

export type OneMarkPolicyKey = (typeof OneMarkPolicyKeys)[keyof typeof OneMarkPolicyKeys];

/** The PRD defaults, mirrored so a caller has a fallback when the policy row is absent. */
export const OneMarkPolicyDefaults: Record<OneMarkPolicyKey, number> = {
  'onemark.vault.mastery_streak': 2,
  'onemark.vault.min_gap_days': 2,
  'onemark.vault.max_single_chapter_pct': 60,
  'onemark.timed.default_minutes': 20,
  'onemark.paper.question_count': 15,
  'onemark.paper.max_series': 4,
  'onemark.paper.question_count.tn_hsc_english': 20,
  'onemark.live.auto_close_after_minutes': 30,
  'onemark.live.grace_seconds': 15,
  'onemark.results.min_learners_for_item_stats': 3,
};

// ---------------------------------------------------------------------------
// Wave 3 (20260919120000_onemark_wave3_schema.sql)
// ---------------------------------------------------------------------------

/** onemark_user_prefs — per-person interface language (decision 5). One row per
 *  signed-in person, readable and writable only by that person. The question
 *  CONTENT language is separate: fp_items.stem_ta / options_ta. */
export interface OneMarkUserPrefs {
  /** auth.users.id */
  user_id: string;
  ui_locale: OneMarkUiLocale;
  created_at: string;
  updated_at: string;
}

export type OneMarkUiLocale = 'en' | 'ta';

/** How closely a bank question matched the real board paper. */
export type OneMarkBoardMatchKind = 'exact' | 'near';

/** onemark_board_paper_hits — "this bank question appeared in the real board
 *  paper", ticked once a year after the exam by a question author. Append-only:
 *  a wrong tick is deleted by its author, never edited. */
export interface OneMarkBoardPaperHit {
  id: string;
  exam_definition_id: string;
  exam_year: number;
  /** March / June / September. NULL when the year had one sitting. */
  sitting: string | null;
  /** fp_items.id */
  item_id: string;
  match_kind: OneMarkBoardMatchKind;
  board_qno: number | null;
  note: string | null;
  /** profiles.id */
  noted_by: string | null;
  noted_at: string;
}

/** One learner's row in fn_onemark_cohort_results. */
export interface OneMarkCohortResultLearner {
  student_id: string;
  full_name: string | null;
  attempt_id: string;
  status: string;
  score: number | null;
  answered: number;
  skipped: number;
  /** decision 17 — the sitting was taken on a device (mode is set). */
  taken_digitally: boolean;
  mode: OneMarkAttemptMode | null;
  started_at: string;
  submitted_at: string | null;
  per_tag: Record<string, { correct: number; total: number }>;
  per_unit: Array<{
    topic_id: string | null;
    /** exam_topic_map.sort_order for THIS exam — never the shared topics
     *  table's global sort_order, which interleaves the subjects. */
    unit_no: number | null;
    correct: number;
    total: number;
  }>;
}

/** One question's row in fn_onemark_cohort_results. Every statistic is null
 *  when item_stats_visible is false (ruling #9), and correct_key is null until
 *  the paper's close_at has passed (ruling #2). */
export interface OneMarkCohortResultItem {
  item_id: string;
  /** fp_assessment_items.position; null on a pool-backed sitting. */
  position: number | null;
  /** ruling #8 — the question was withdrawn from the bank (fp_items.is_active
   *  is false) AFTER this paper ran. It is a flag and nothing else: no score
   *  is recomputed and no response is removed. */
  is_withdrawn: boolean;
  withdrawn_note: string | null;
  served: number | null;
  correct: number | null;
  skipped: number | null;
  /** Fraction of submitted sittings that got it right, 0..1. */
  p_value: number | null;
  /** The most-chosen WRONG option, as stored in fp_responses.chosen. */
  top_distractor: unknown | null;
  top_distractor_count: number | null;
  /** The correct option KEY — never the option text, never an explanation. */
  correct_key: unknown | null;
}

/** fn_onemark_cohort_results(p_assessment_id) return shape. */
export interface OneMarkCohortResults {
  assessment: {
    id: string;
    title: string;
    kind: string;
    cohort_id: string | null;
    exam_definition_id: string;
    close_at: string | null;
    closed: boolean;
  };
  learner_count: number;
  min_learners_for_item_stats: number;
  item_stats_visible: boolean;
  item_stats_hidden_reason: string | null;
  answer_keys_reason: string | null;
  learners: OneMarkCohortResultLearner[];
  items: OneMarkCohortResultItem[];
}

/** fn_onemark_learner_report(p_student_id, p_exam_definition_id) return shape. */
export interface OneMarkLearnerReport {
  student_id: string;
  exam_definition_id: string;
  /** fn_fp_student_progress, wrapped as-is. */
  progress: unknown;
  vault: {
    active: number;
    mastered: number;
    due_now: number;
    next_due_at: string | null;
  };
  sittings: Array<{
    attempt_id: string;
    assessment_id: string;
    title: string;
    mode: OneMarkAttemptMode | null;
    status: string;
    score: number | null;
    /** Questions the sitting recorded a response for. */
    out_of: number;
    started_at: string;
    submitted_at: string | null;
  }>;
}

/** One source's row in fn_onemark_source_analytics. */
export interface OneMarkSourceAnalyticsRow {
  /** null = the "source not recorded" bucket, which is kept, never dropped. */
  source_key: string | null;
  label: string;
  is_recorded: boolean;
  source_active: boolean;
  items_total: number;
  items_active: number;
  times_served: number;
  times_correct: number;
  accuracy: number | null;
  hits_exact: number;
  hits_near: number;
  /** Board hits divided by active questions, for the exam year asked for. */
  hit_rate: number | null;
  /** Median split on practice share. A CORRELATION, not a cause. Null with a
   *  reason below onemark.results.min_learners_for_item_stats learners. */
  lift: number | null;
  lift_learners: number;
  lift_reason: string | null;
}

/** fn_onemark_source_analytics(p_exam_definition_id, p_exam_year) return shape. */
export interface OneMarkSourceAnalytics {
  exam_definition_id: string;
  /** null = every year. */
  exam_year: number | null;
  min_learners_for_item_stats: number;
  sources: OneMarkSourceAnalyticsRow[];
  notes: { hit_rate: string; lift: string };
}

/** exam_definitions.config_key of the two subject rows under the tn_hsc umbrella. */
export const OneMarkExamKeys = {
  PHYSICS: 'tn_hsc_physics',
  ENGLISH: 'tn_hsc_english',
} as const;

export type OneMarkExamKey = (typeof OneMarkExamKeys)[keyof typeof OneMarkExamKeys];
