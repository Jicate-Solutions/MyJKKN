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

export interface QuizOption {
  id: string;
  text: string;
  is_correct: boolean;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: QuizOption[];
}

export interface QuizSpec {
  questions: QuizQuestion[];
}

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
  created_at: string;
  updated_at: string;
}

export interface HealthProgramWithDays extends HealthProgram {
  days: HealthProgramDay[];
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
