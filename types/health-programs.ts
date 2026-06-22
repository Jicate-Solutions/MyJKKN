// types/health-programs.ts
// Types for the Health → Wellness Programs feature.
// Spec: specs/health-wellness-programs-2026-06-15.md
// Created: 2026-06-15

export type HealthProgramStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'completed'
  | 'archived';

export type HealthProgramAudience = 'students' | 'staff' | 'both' | 'public';

// --- Form builder (Google-Forms-style; replaces the fixed single-answer quiz)
// Stored in health_program_days.quiz (JSONB — column name kept for history).
// One form can mix GRADED choice fields (with correct answers → feed quiz_score)
// and UNGRADED fields (text / scale → captured only as survey responses).

export type FormFieldType =
  | 'single_choice' // radio, gradable
  | 'multi_choice' // checkboxes, gradable (exact-match)
  | 'dropdown' // select, gradable
  | 'short_text' // single line, ungraded
  | 'paragraph' // multi line, ungraded
  | 'scale' // linear N..M, ungraded
  | 'date'; // date picker, ungraded (answer stored as YYYY-MM-DD string)

export interface FormFieldOption {
  id: string;
  text: string;
  /** Only meaningful when the parent field is graded. */
  is_correct?: boolean;
}

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  /** Optional helper sub-text shown under the question label (all types). */
  description?: string;
  required?: boolean;
  /** single_choice | multi_choice | dropdown */
  options?: FormFieldOption[];
  /** choice types only — when true the field counts toward quiz_score */
  graded?: boolean;
  /** scale only */
  scale_min?: number;
  scale_max?: number;
  scale_min_label?: string;
  scale_max_label?: string;
}

export interface FormSpec {
  fields: FormField[];
}

/** A single participant answer, keyed by field type. */
export type FormAnswer = string | string[] | number;
/** All of a participant's answers for one day's form: { [field_id]: answer }. */
export type FormResponses = Record<string, FormAnswer>;

// Back-compat aliases — older code/data used the quiz vocabulary. The legacy
// stored shape {questions:[{question,options}]} is normalized to FormSpec by
// normalizeForm() (see admin form-helpers). New code should use the Form* names.
export type QuizOption = FormFieldOption;
export type QuizQuestion = FormField;
export type QuizSpec = FormSpec;

export interface HealthProgram {
  id: string;
  institution_id: string | null;
  title: string;
  slug: string;
  theme: string | null;
  description: string | null;
  status: HealthProgramStatus;
  audience: HealthProgramAudience;
  start_date: string | null;
  end_date: string | null;
  cover_image_url: string | null;
  public_token: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthProgramDay {
  id: string;
  program_id: string;
  day_number: number;
  title: string;
  summary: string | null;
  video_url: string | null;
  publish_date: string | null;
  quiz: QuizSpec | null;
  created_at: string;
  updated_at: string;
}

/** Per-person per-day FACTS. Keyed on profiles.id (students AND staff). */
export interface HealthProgramParticipation {
  id: string;
  program_id: string;
  day_id: string;
  user_id: string;
  learner_id: string | null;
  watched_at: string | null;
  watch_completed: boolean;
  quiz_score: number | null;
  usefulness_rating: number | null;
  reflection_text: string | null;
  /** Per-field answers for the day's form (graded + ungraded). */
  form_responses: FormResponses | null;
  created_at: string;
  updated_at: string;
}

export interface HealthProgramWithDays extends HealthProgram {
  days: HealthProgramDay[];
}

/**
 * A participation row joined to its participant's profile, for the admin
 * response-viewer. profile is null when the manager can't read that profile
 * (left embed — the row is never dropped).
 */
export interface ProgramResponseRow {
  id: string;
  user_id: string;
  day_id: string;
  quiz_score: number | null;
  form_responses: FormResponses | null;
  created_at: string;
  updated_at: string;
  profile: {
    full_name: string | null;
    email: string | null;
    role: string | null;
  } | null;
}

/** Bundle returned by getProgramResponseData — everything the viewer renders. */
export interface ProgramResponseData {
  program: HealthProgram | null;
  days: HealthProgramDay[];
  responses: ProgramResponseRow[];
}

/**
 * Director-editable tunables, read from platform_policies (health.programs.*).
 * Never hardcode these — they are config rows a super-admin edits with zero deploys.
 */
export interface WellnessProgramConfig {
  completion_rule: 'watch' | 'watch_and_quiz';
  quiz_pass_pct: number;
  streak_grace_hours: number;
  adoption_window_days: number;
  realtime_refresh: boolean;
  refresh_interval_seconds: number;
  useful_prompt: string;
  digest_roles: string[];
}

export const WELLNESS_CONFIG_DEFAULTS: WellnessProgramConfig = {
  completion_rule: 'watch',
  quiz_pass_pct: 60,
  streak_grace_hours: 6,
  adoption_window_days: 14,
  realtime_refresh: false,
  refresh_interval_seconds: 30,
  useful_prompt: 'Was this useful today?',
  digest_roles: ['ceo', 'health_supervisor'],
};

/** Return shape of fn_health_program_impact(program_id). */
export interface ProgramImpact {
  program_id: string;
  days_total: number;
  policy: {
    completion_rule: string;
    quiz_pass_pct: number;
    adoption_window_days: number;
  };
  reach: {
    unique_participants: number;
    by_day: { day_number: number; unique_viewers: number | null }[];
  };
  engagement: {
    completed_all: number;
    avg_days_completed: number;
    funnel: { days_completed: number; people: number }[];
  };
  learning: {
    quiz_attempts: number;
    avg_quiz_score: number;
    pass_rate_pct: number;
  };
  usefulness: {
    responses: number;
    avg_rating: number;
  };
  adoption_lift: {
    window_days: number;
    new_consents: number;
  };
  /**
   * Retention curve — day-over-day return.
   * retained_from_prev = of the people who watched day N, how many also
   * watched day N-1. Day 1's retained_from_prev is null (no prior day).
   */
  retention: {
    day_number: number;
    viewers: number;
    retained_from_prev: number | null;
  }[];
  /**
   * Activation rate — activated participants vs an estimate of the eligible
   * audience. `eligible` is an estimate (active profiles whose role carries
   * health.programs.view, org-wide), so treat rate_pct as directional.
   */
  activation: {
    eligible: number;
    activated: number;
    rate_pct: number | null;
  };
}

/** Computes whether a participation row counts as "complete" under a given policy. */
export function isDayComplete(
  p: Pick<HealthProgramParticipation, 'watch_completed' | 'quiz_score'>,
  config: Pick<WellnessProgramConfig, 'completion_rule' | 'quiz_pass_pct'>
): boolean {
  if (!p.watch_completed) return false;
  if (config.completion_rule === 'watch') return true;
  return p.quiz_score != null && p.quiz_score >= config.quiz_pass_pct;
}
