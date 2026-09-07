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

/** The columns Wave 1 adds to fp_attempts. */
export interface FpAttemptOneMarkColumns {
  mode: OneMarkAttemptMode | null;
  /** Groups the attempts of one sitting (decision 9). */
  session_id: string | null;
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
};

/** exam_definitions.config_key of the two subject rows under the tn_hsc umbrella. */
export const OneMarkExamKeys = {
  PHYSICS: 'tn_hsc_physics',
  ENGLISH: 'tn_hsc_english',
} as const;

export type OneMarkExamKey = (typeof OneMarkExamKeys)[keyof typeof OneMarkExamKeys];
