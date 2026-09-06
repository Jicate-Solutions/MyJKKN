// types/event-feedback.ts
//
// Coordinator-editable feedback forms attached to any event (general,
// tournament, marathon, induction). Shapes mirror the registration form
// builder in types/tournament.ts — deliberately, so the two builders read the
// same way — but the tables are independent (see the header of
// supabase/migrations/event_feedback_forms.sql for why).
//
// Vocabulary differs on purpose: a registration form has FIELDS, a feedback
// form has QUESTIONS. Keeping the words apart is what stops someone importing
// EventRegistrationFormField here and quietly wiring a survey to the
// registration tables.

import type { FormFieldCondition, FormFieldOption } from '@/types/tournament';

export type { FormFieldCondition, FormFieldOption };

/**
 * What a feedback question can ask.
 *
 * A near-copy of FormFieldType minus the types a survey has no use for
 * (phone / email / file / image — a feedback form should not be collecting
 * documents or contact details it already has from the registration), plus the
 * two it needs that registration never did:
 *
 *  - 'rating'       a 1..N score, stored as a plain integer so a mean is
 *                   computable without parsing prose. This is the type the
 *                   whole feature exists for.
 *  - 'section_note' display-only guidance ("Please answer honestly — responses
 *                   are anonymous"). Collects nothing.
 */
export type FeedbackQuestionType =
  | 'rating'
  | 'text'
  | 'textarea'
  | 'select'
  | 'multi_select'
  | 'radio'
  | 'checkbox'
  | 'number'
  | 'date'
  | 'section_note';

export const FEEDBACK_QUESTION_TYPES: { value: FeedbackQuestionType; label: string }[] = [
  { value: 'rating', label: 'Rating (star / scale)' },
  { value: 'text', label: 'Short answer' },
  { value: 'textarea', label: 'Long answer' },
  { value: 'radio', label: 'Single choice' },
  { value: 'select', label: 'Dropdown (single choice)' },
  { value: 'multi_select', label: 'Multiple choice' },
  { value: 'checkbox', label: 'Yes / No' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'section_note', label: 'Note (display only — no answer)' },
];

/** Question types that collect nothing. Everything walking the answer set skips these. */
export const DISPLAY_ONLY_QUESTION_TYPES = new Set<FeedbackQuestionType>(['section_note']);

/** True when the question actually asks the respondent for something. */
export function isAnswerableQuestion(type: FeedbackQuestionType): boolean {
  return !DISPLAY_ONLY_QUESTION_TYPES.has(type);
}

/** Question types whose answer is one of a fixed option list. */
export const CHOICE_QUESTION_TYPES = new Set<FeedbackQuestionType>([
  'select',
  'multi_select',
  'radio',
]);

/** The scales a coordinator may pick for a 'rating' question. Matches the DB's
 *  event_feedback_questions_rating_scale_check (2..10). */
export const RATING_SCALES = [3, 4, 5, 7, 10] as const;
export const DEFAULT_RATING_SCALE = 5;

export interface EventFeedbackQuestion {
  id: string;
  section_id: string;
  form_id: string;
  event_id: string;
  /**
   * Stable answer key. Assigned from the label on first save and never changed
   * afterwards — EventFeedbackResponse.answers is keyed by it, so rewording a
   * question must not orphan the answers already given to it.
   */
  question_key: string;
  question_label: string;
  question_type: FeedbackQuestionType;
  is_required: boolean;
  display_order: number;
  placeholder: string | null;
  help_text: string | null;
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  pattern: string | null;
  options: FormFieldOption[] | null;
  condition: FormFieldCondition | null;
  /** Top of the scale for a 'rating' question; NULL for every other type. */
  rating_scale: number | null;
  created_at: string;
  updated_at: string;
}

export interface EventFeedbackSection {
  id: string;
  form_id: string;
  event_id: string;
  title: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  questions?: EventFeedbackQuestion[];
}

export interface EventFeedbackForm {
  id: string;
  event_id: string;
  /** Coordinator-facing label, e.g. "Day 2 Feedback". */
  name: string;
  /** URL segment: /events/<id>/feedback/respond?form=<slug>. Unique per event. */
  slug: string;
  description: string | null;
  /**
   * The coordinator's manual open/closed switch. NOT the whole answer to
   * "can this be answered now" — use feedbackFormState() / isFeedbackFormOpen(),
   * which also weigh the window.
   */
  is_enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
  display_order: number;
  /**
   * Hide respondent identity in the coordinator's responses viewer.
   *
   * A PRESENTATION promise, not cryptographic anonymity: registration_id is
   * still stored (it has to be, or one-response-per-participant cannot be
   * enforced). Anywhere this is surfaced to a coordinator, say so — a
   * coordinator who believes otherwise will promise their attendees more than
   * the system actually delivers.
   */
  is_anonymous: boolean;
  created_at: string;
  updated_at: string;
  sections?: EventFeedbackSection[];
}

/** A form row plus the two counts the console cards show. */
export interface EventFeedbackFormSummary extends EventFeedbackForm {
  question_count: number;
  response_count: number;
}

export interface EventFeedbackResponse {
  id: string;
  form_id: string;
  event_id: string;
  registration_id: string;
  profile_id: string | null;
  /** Keyed by question_key, exactly as events_registrations.custom_fields is keyed by field_key. */
  answers: Record<string, unknown>;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

// ── Open / closed state ──────────────────────────────────────────────────────
// Identical model to the registration form's formRegistrationState(): DERIVED
// at read time from (is_enabled, starts_at, ends_at) rather than stored, so an
// expired form cannot keep collecting because a job failed, and extending the
// end date reopens it with no further action.

export type FeedbackFormState = 'active' | 'inactive' | 'scheduled' | 'expired';

export interface FeedbackWindowLike {
  is_enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

export function feedbackFormState(
  form: FeedbackWindowLike,
  now: Date = new Date()
): FeedbackFormState {
  if (!form.is_enabled) return 'inactive';
  if (form.starts_at) {
    const starts = new Date(form.starts_at);
    // An unparseable date must not silently gate the form open or shut.
    if (!Number.isNaN(starts.getTime()) && now < starts) return 'scheduled';
  }
  if (form.ends_at) {
    const ends = new Date(form.ends_at);
    if (!Number.isNaN(ends.getTime()) && now > ends) return 'expired';
  }
  return 'active';
}

/** True only when feedback may actually be submitted right now. */
export function isFeedbackFormOpen(form: FeedbackWindowLike, now?: Date): boolean {
  return feedbackFormState(form, now) === 'active';
}

export const FEEDBACK_STATE_LABELS: Record<FeedbackFormState, string> = {
  active: 'Open',
  inactive: 'Closed',
  scheduled: 'Scheduled',
  expired: 'Ended',
};

/** Why a closed form is closed, for the message shown to a participant. */
export const FEEDBACK_STATE_REASONS: Record<FeedbackFormState, string> = {
  active: '',
  inactive: 'This feedback form is not open yet.',
  scheduled: 'This feedback form has not opened yet.',
  expired: 'This feedback form has closed.',
};

// ── Aggregates for the coordinator's summary ─────────────────────────────────

/** Per-question rollup shown on the responses tab. */
export interface FeedbackQuestionSummary {
  question_key: string;
  question_label: string;
  question_type: FeedbackQuestionType;
  /** How many responses answered THIS question (skipped optional ones are excluded). */
  answered: number;
  /** Mean score for a 'rating' question, else null. */
  average: number | null;
  /** Top of the scale, so the mean can be shown as "4.2 / 5". */
  rating_scale: number | null;
  /** Answer counts per option, for choice and checkbox questions. */
  distribution: { label: string; count: number }[];
  /** Free-text answers, newest first, for text / textarea questions. */
  comments: string[];
}
