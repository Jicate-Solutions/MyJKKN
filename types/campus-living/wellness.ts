/**
 * Types for the hostel wellness pulse-survey module.
 *
 * Backs:
 *   /campus-living/wellness            — warden dashboard (responses, critical inbox)
 *   /campus-living/wellness/surveys    — admin config (templates, cadence)
 *
 * Tables (existing on prod kvizhngldtiuufknvehv, probed 2026-05-21):
 *   hostel_pulse_configs  — survey templates
 *   hostel_pulse_responses — submitted answers (1 per learner per period)
 *
 * Notes:
 *   - `learner_id` is NOT NULL on responses, so DB-level anonymity is not
 *     enforced. UI suppresses identity when `anonymous_mode` config is on.
 *   - No dedicated `critical_threshold` or `is_critical` column. Threshold is
 *     stored in the `questions` jsonb meta block; critical-flag is derived
 *     at query time from `overall_mood <= threshold`.
 *   - Block dimension on responses is via allocations → beds → rooms →
 *     blocks (no direct fk). v1 aggregates by mood × week only; block
 *     drill-down is a v2 follow-up.
 */

export type PulseFrequencyEnum = 'weekly' | 'biweekly' | 'monthly';

export type PulseStatusEnum =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived';

/** A single question inside the pulse-config `questions` jsonb. */
export interface PulseQuestion {
  id: string;
  text: string;
  /**
   * 'scale' = 1..scale_max numeric (default scale_max=5).
   * 'text' = free-form short answer.
   */
  type: 'scale' | 'text';
  scale_max?: number;
  /** When true, low values on this question contribute to critical-flag. */
  is_critical_indicator?: boolean;
}

/** Shape of the `questions` jsonb column. We always store the meta envelope
 * (not a bare array) so threshold + future config can ride along. */
export interface PulseQuestionsPayload {
  items: PulseQuestion[];
  /** overall_mood <= this value flags the response as critical. */
  critical_threshold: number;
  /** When true, warden UI hides learner identifiers. */
  anonymous_mode?: boolean;
}

export interface HostelPulseConfig {
  id: string;
  institution_id: string;
  title: string;
  description: string | null;
  frequency: PulseFrequencyEnum;
  questions: PulseQuestionsPayload;
  target_blocks: string[] | null;
  status: PulseStatusEnum;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateHostelPulseConfigDTO {
  institution_id: string;
  title: string;
  description?: string | null;
  frequency: PulseFrequencyEnum;
  questions: PulseQuestionsPayload;
  target_blocks?: string[] | null;
  status?: PulseStatusEnum;
  starts_at?: string | null;
  ends_at?: string | null;
  created_by?: string | null;
}

export type UpdateHostelPulseConfigDTO = Partial<
  Omit<HostelPulseConfig, 'id' | 'institution_id' | 'created_at' | 'updated_at'>
>;

export interface HostelPulseResponse {
  id: string;
  institution_id: string;
  config_id: string;
  learner_id: string;
  period_start: string;
  answers: Record<string, unknown>;
  overall_mood: number | null;
  submitted_at: string | null;
}

export interface CreateHostelPulseResponseDTO {
  institution_id: string;
  config_id: string;
  learner_id: string;
  period_start: string;
  answers: Record<string, unknown>;
  overall_mood?: number | null;
}

/**
 * A response augmented with the originating config so the warden UI can
 * display the config title and apply the right critical threshold without
 * a second lookup.
 */
export interface HostelPulseResponseWithConfig extends HostelPulseResponse {
  config: Pick<
    HostelPulseConfig,
    'id' | 'title' | 'frequency' | 'questions' | 'status'
  > | null;
  /** Derived: overall_mood <= config.questions.critical_threshold */
  is_critical: boolean;
}

/** Aggregated cell for the mood × week heatmap (warden dashboard). */
export interface PulseHeatmapCell {
  /** ISO week start (YYYY-MM-DD, Monday). */
  period_start: string;
  /** Bucket label: '1'..'5' for scale buckets, 'na' when overall_mood is null. */
  mood_bucket: string;
  count: number;
}

export const PULSE_FREQUENCY_LABELS: Record<PulseFrequencyEnum, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
};

export const PULSE_STATUS_LABELS: Record<PulseStatusEnum, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
};

export const DEFAULT_PULSE_QUESTIONS: PulseQuestionsPayload = {
  critical_threshold: 2,
  anonymous_mode: false,
  items: [
    {
      id: 'mood',
      text: 'How is your overall mood this week?',
      type: 'scale',
      scale_max: 5,
      is_critical_indicator: true,
    },
    {
      id: 'sleep',
      text: 'How well did you sleep this week?',
      type: 'scale',
      scale_max: 5,
    },
    {
      id: 'food',
      text: 'How satisfied are you with the mess food?',
      type: 'scale',
      scale_max: 5,
    },
    {
      id: 'homesick',
      text: 'How homesick are you feeling? (5 = not at all)',
      type: 'scale',
      scale_max: 5,
      is_critical_indicator: true,
    },
    {
      id: 'feedback',
      text: 'Anything else the warden should know? (optional)',
      type: 'text',
    },
  ],
};
