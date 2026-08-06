// types/accreditation/stakeholder-survey.ts
// ============================================================================
// Employer + alumni course feedback — the EXTERNAL half of NAAC 1.2.
//
// The question sets are FROZEN CONSTANTS, not a builder. The director asked for
// one genuinely short form per year; a question builder is a different product
// and would be the thing that stops it being short. Each cycle snapshots the
// set it was created with into accreditation_stakeholder_surveys.questions, so
// re-wording next year never retro-alters answers already given.
//
// Two audience-specific sets with PARALLEL keys: an employer is asked about our
// learners, an alumnus about their own experience. Same keys means the
// per-question means stay comparable across audiences on the same metric.
//
// Terminology gate: learning framework (never curriculum), learner (never
// student), Senior Learner (never faculty), learning pathway (never syllabus).
// ============================================================================

export type StakeholderAudience = 'alumni' | 'industry';
export type StakeholderSurveyStatus = 'draft' | 'active' | 'closed' | 'archived';

export interface StakeholderQuestion {
  key: string;
  type: 'scale' | 'text';
  label: string;
  /** scale only */
  min?: number;
  max?: number;
}

/** Answers to a cycle: scale keys hold numbers, text keys hold strings. */
export type StakeholderAnswers = Record<string, number | string>;

export interface StakeholderSurveyRow {
  id: string;
  institution_id: string;
  body_code: string;
  audience: StakeholderAudience;
  academic_year: string;
  title: string;
  questions: StakeholderQuestion[];
  status: StakeholderSurveyStatus;
  opens_at: string | null;
  closes_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StakeholderInviteRow {
  id: string;
  survey_id: string;
  token: string;
  invited_email: string;
  invited_name: string | null;
  source_table: string | null;
  source_id: string | null;
  sent_at: string | null;
  responded_at: string | null;
  expires_at: string;
  created_at: string;
}

export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

/** Shown under every scale row on the public form. 1 = worst, 5 = best. */
export const SCALE_LABELS: Record<number, string> = {
  1: 'Not at all',
  2: 'A little',
  3: 'Somewhat',
  4: 'Well',
  5: 'Very well',
};

const EMPLOYER_QUESTIONS: StakeholderQuestion[] = [
  {
    key: 'relevance',
    type: 'scale',
    min: SCALE_MIN,
    max: SCALE_MAX,
    label: 'How well does our learning framework match what you actually need from the learners you hire?',
  },
  {
    key: 'practical_skills',
    type: 'scale',
    min: SCALE_MIN,
    max: SCALE_MAX,
    label: 'How well prepared are our learners in practical, job-ready skills?',
  },
  {
    key: 'communication',
    type: 'scale',
    min: SCALE_MIN,
    max: SCALE_MAX,
    label: 'How well prepared are our learners in communication and teamwork?',
  },
  {
    key: 'currency',
    type: 'scale',
    min: SCALE_MIN,
    max: SCALE_MAX,
    label: 'How up to date is our learning framework with current practice in your field?',
  },
  {
    key: 'one_change',
    type: 'text',
    label: 'One thing we should add to or change in the learning framework (optional)',
  },
];

const ALUMNI_QUESTIONS: StakeholderQuestion[] = [
  {
    key: 'relevance',
    type: 'scale',
    min: SCALE_MIN,
    max: SCALE_MAX,
    label: 'How well did your learning framework prepare you for the work you do now?',
  },
  {
    key: 'practical_skills',
    type: 'scale',
    min: SCALE_MIN,
    max: SCALE_MAX,
    label: 'How well did it build practical, job-ready skills?',
  },
  {
    key: 'communication',
    type: 'scale',
    min: SCALE_MIN,
    max: SCALE_MAX,
    label: 'How well did it build your communication and teamwork?',
  },
  {
    key: 'currency',
    type: 'scale',
    min: SCALE_MIN,
    max: SCALE_MAX,
    label: 'How up to date was it with current practice in your field?',
  },
  {
    key: 'one_change',
    type: 'text',
    label: "One thing we should add to or change for today's learners (optional)",
  },
];

export const QUESTION_SETS: Record<StakeholderAudience, StakeholderQuestion[]> = {
  industry: EMPLOYER_QUESTIONS,
  alumni: ALUMNI_QUESTIONS,
};

export const AUDIENCE_LABELS: Record<StakeholderAudience, string> = {
  industry: 'Employers & recruiters',
  alumni: 'Alumni',
};

export const AUDIENCE_TITLES: Record<StakeholderAudience, string> = {
  industry: 'Employer feedback on our learning framework',
  alumni: 'Alumni feedback on our learning framework',
};

/**
 * Evidence is emitted with per-question means SUPPRESSED below this many
 * responses — a mean over 1-4 external respondents is that person's opinion.
 * Mirrors the constant of the same value inside
 * fn_sync_stakeholder_survey_evidence; kept here only to explain the UI badge.
 */
export const MIN_RESPONSES_FOR_MEANS = 5;

export const MAX_FREE_TEXT = 1000;
