/**
 * Feedback Spine — shared types.
 *
 * The universal feedback/interaction event model every source normalizes into
 * (table: public.feedback_events). Adapters produce FeedbackEventInput; the
 * AI-classify worker produces FeedbackClassification; loops + the dashboard
 * read FeedbackEvent.
 */

export type FeedbackSource =
  | 'ig_comment'
  | 'ig_dm'
  | 'session_feedback'
  | 'ai_pulse'
  | 'mess'
  | 'class_feedback'
  | 'parent'
  | 'scf_checkin';

export type FeedbackEventType =
  | 'comment'
  | 'dm'
  | 'rating'
  | 'reply'
  | 'mention'
  | 'story_reply';

export type AiSentiment = 'positive' | 'neutral' | 'negative' | 'mixed';
export type AiIntent =
  | 'praise'
  | 'complaint'
  | 'question'
  | 'request'
  | 'suggestion'
  | 'spam';

/** What an adapter hands the ingest service (one normalized feedback event). */
export interface FeedbackEventInput {
  source: FeedbackSource;
  /** Source's own id — the idempotency key (UNIQUE with source). */
  source_ref: string;
  institution_id?: string | null;
  actor_type?: string | null;
  actor_ref?: string | null;
  target_type?: string | null;
  target_ref?: string | null;
  event_type: FeedbackEventType;
  content?: string | null;
  rating?: number | null;
  raw?: Record<string, unknown>;
  /** When the feedback actually happened (defaults to now() server-side). */
  occurred_at?: string;
}

/** The AI-classify worker's output for one event. */
export interface FeedbackClassification {
  sentiment: AiSentiment;
  intent: AiIntent;
  topic: string;
  /** A suggested personalized reply — a human approves before it's sent. */
  draft_reply: string;
  model: string;
}

/** A persisted feedback_events row. */
export interface FeedbackEvent extends FeedbackEventInput {
  id: string;
  ai_sentiment: AiSentiment | null;
  ai_intent: AiIntent | null;
  ai_topic: string | null;
  ai_draft_reply: string | null;
  ai_model: string | null;
  ai_processed_at: string | null;
  created_at: string;
  updated_at: string;
}
