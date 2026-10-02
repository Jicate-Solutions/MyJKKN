// types/health-surveys.ts
// Types for the Health & Wellness → program-scoped scenario SURVEYS.
// Separate from the program (days / videos / quizzes) flow in health-programs.ts.
// Migration: supabase/migrations/20260928120000_health_wellness_surveys.sql
// Created: 2026-09-28

export type SurveyLanguage = 'en' | 'ta';

export const SURVEY_LANGUAGE_LABEL: Record<SurveyLanguage, string> = {
  en: 'English',
  ta: 'தமிழ்',
};

/** Text authored per language. `en` is always present; others are optional. */
export type LocalizedText = { en: string } & Partial<Record<SurveyLanguage, string>>;

export type HealthSurveyStatus = 'draft' | 'active' | 'closed';
export type SurveyRespondentType = 'student' | 'staff' | 'public';

export const RESPONDENT_TYPE_LABEL: Record<SurveyRespondentType, string> = {
  'student': 'Learner',
  'staff': 'Team Member',
  public: 'Public',
};

export interface SurveyOption {
  /** Stable key stored in answers, e.g. "A". */
  id: string;
  text: LocalizedText;
  /** Shown when this (non-constructive) option is picked. */
  justification?: LocalizedText;
}

export interface SurveyQuestion {
  id: string;
  title: LocalizedText;
  text: LocalizedText;
  options: SurveyOption[];
  /** Option id of the constructive answer. */
  constructive: string;
  /** "Suggested path" shown whenever a non-constructive option is picked. */
  guidance?: LocalizedText;
}

export interface HealthSurvey {
  id: string;
  program_id: string;
  title: string;
  description: string | null;
  status: HealthSurveyStatus;
  audience: SurveyRespondentType[];
  languages: SurveyLanguage[];
  questions: SurveyQuestion[];
  public_token: string | null;
  /** Optional header banner (public URL in the health-survey-media bucket). */
  banner_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** { [question_id]: option_id } */
export type SurveyAnswers = Record<string, string>;

export interface HealthSurveyResponse {
  id: string;
  survey_id: string;
  program_id: string;
  user_id: string | null;
  respondent_type: SurveyRespondentType;
  name: string;
  designation: string | null;
  institution_id: string | null;
  institution_name: string | null;
  email: string;
  mobile: string | null;
  language: SurveyLanguage;
  answers: SurveyAnswers;
  constructive_count: number;
  total_questions: number;
  score_pct: number | null;
  submitted_at: string;
}

/** Resolve a LocalizedText in the chosen language, falling back to English. */
export function lt(text: LocalizedText | undefined, lang: SurveyLanguage): string {
  if (!text) return '';
  return (text[lang] && text[lang]!.trim()) || text.en || '';
}
