// lib/constants/ai-safety-judge.ts
// ============================================================================
// Safety-judge model FLOOR — shared by the admin UI picker and the PATCH route.
//
// A small set of AI jobs act as SAFETY JUDGES: they decide whether a note is
// safe, whether a help-ask is safe, or whether a reported bug is really fixed.
// A weaker judge silently lets unsafe content through, so these jobs must NEVER
// run below Sonnet. The admin dialog hides below-Sonnet models for these jobs,
// and the PATCH route rejects them server-side as defense in depth.
//
// Model tier: haiku < sonnet < opus. "Below Sonnet" means an Anthropic model
// whose id contains "haiku", OR any non-Anthropic model — the free (Max) worker
// runs Claude only, so a non-Claude pick is off the tier entirely and is
// treated as below the floor.
// ============================================================================

// The safety-critical judge jobs, keyed by feature_key (== ai_job_types.job_type).
// Verified against source: scf-note-judge cron ('scf.note_safety_judge'),
// scf-generate-suggestions cron ('scf.judge_help_ask'), and bug-reports reverify
// ('bug.reverify').
export const SAFETY_JUDGE_FEATURE_KEYS = [
  'scf.note_safety_judge',
  'scf.judge_help_ask',
  'bug.reverify',
] as const;

export type SafetyJudgeFeatureKey = (typeof SAFETY_JUDGE_FEATURE_KEYS)[number];

const SAFETY_JUDGE_SET: ReadonlySet<string> = new Set(SAFETY_JUDGE_FEATURE_KEYS);

/** True when this feature is a safety-critical judge subject to the Sonnet floor. */
export function isSafetyJudge(featureKey: string | null | undefined): boolean {
  return featureKey != null && SAFETY_JUDGE_SET.has(featureKey);
}

/**
 * True when the given provider+model is BELOW the safety-judge floor:
 * an Anthropic Haiku model, or any non-Anthropic model.
 */
export function isBelowSonnet(
  provider: string | null | undefined,
  modelId: string | null | undefined,
): boolean {
  if (provider !== 'anthropic') return true; // non-Claude → off the tier, below the floor
  return (modelId ?? '').toLowerCase().includes('haiku');
}
