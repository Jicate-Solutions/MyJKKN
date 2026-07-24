// lib/session-feedback/notebooklm-features.ts
// ---------------------------------------------------------------------------
// The NotebookLM feature taxonomy captured in post-class feedback (Rank 2 reframe,
// 2026-07-24). Replaces the saturated yes/no `notebooklm_used` (96.6% "yes") with
// WHICH materials were actually used — a signal that discriminates.
//
// Stored in `session_feedback.checklist` under RESERVED keys `nblm:*`. These are
// booleans (the checklist stays Record<string, boolean>) but are deliberately NOT
// `session_feedback_checklist_config` item_keys, so they never enter the config-driven
// checklist or the carry-forward "unmet items" universe (which joins is_active config
// rows). One shared list so the learner "used" capture, the Senior Learner "shared" capture
// (Rank 3), and any aggregate display all read the SAME taxonomy — no mirror drift.
// ---------------------------------------------------------------------------

/** Reserved checklist-key prefix for NotebookLM feature ticks. */
export const NBLM_KEY_PREFIX = 'nblm:';

/** Neutral opt-out — "No NotebookLM this session". Mutually exclusive with the features. */
export const NBLM_NONE_KEY = 'nblm:none';

export interface NotebookLmFeature {
  /** Full reserved checklist key, e.g. 'nblm:audio_overview'. */
  key: string;
  /** Learner-facing label. */
  label: string;
}

/** The NotebookLM materials a learner can report using (Director interview 2026-07-23). */
export const NOTEBOOKLM_FEATURES: readonly NotebookLmFeature[] = [
  { key: 'nblm:audio_overview', label: 'Audio overview' },
  { key: 'nblm:video_overview', label: 'Video overview' },
  { key: 'nblm:slide_deck', label: 'Slide deck' },
  { key: 'nblm:mind_map', label: 'Mind map' },
  { key: 'nblm:report', label: 'Report' },
  { key: 'nblm:flashcards', label: 'Flashcards' },
  { key: 'nblm:quiz', label: 'Quiz' },
  { key: 'nblm:infographic', label: 'Infographic' },
  { key: 'nblm:chat', label: 'Chat' },
] as const;

/** True if a checklist key is a NotebookLM reserved key (feature or the "none" opt-out). */
export function isNotebookLmKey(key: string): boolean {
  return key.startsWith(NBLM_KEY_PREFIX);
}
