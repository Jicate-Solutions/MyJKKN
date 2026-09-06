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

// Anthropic families POSITIVELY KNOWN to sit at or above Sonnet.
//
// This is an ALLOWLIST, and that is the whole point. Until 2026-08-06 the floor
// was enforced by excluding ids containing "haiku", which fails OPEN: every
// family invented later passes silently. Adding `fable` to the picker that day
// made it an instantly-valid pick for all three safety judges without anyone
// establishing where Fable ranks — the check said "not haiku, therefore fine".
//
// A new family must be added here DELIBERATELY, after its tier is established.
// Being absent is not an accusation that it is weak; it means unproven, and an
// unproven judge is exactly what this floor exists to keep out.
//
// `fable` admitted 2026-08-06 on published evidence, not assumption:
//   - the model-selection guide orders the tiers Haiku -> Sonnet -> Opus -> Fable
//     and recommends Fable for work "where you've tested with Opus and it
//     struggled";
//   - the launch announcement reports "state-of-the-art on nearly all tested
//     benchmarks", outperforming Opus 4.8 across software engineering and
//     knowledge work — benchmark claims, not only a capability adjective.
//
// The one caveat, recorded because it bears directly on judging: Fable's
// classifiers divert cybersecurity, bio/chem and distillation requests, and
// "the response is automatically handled by Claude Opus 4.8 instead" (>95% of
// sessions involve no fallback). That fallback lands on Opus 4.8 — itself above
// this floor — so even the diverted path is not sub-floor. A judge job never
// silently drops below Sonnet.
//
// Reviewers challenged this entry as resting on a marketing claim. Worth noting
// that `sonnet` and `opus` sit in this list on exactly the same basis — the
// vendor's published tier ordering — and neither was ever validated against the
// adversarial-reasoning task specifically. Applied consistently, that objection
// would unseat the whole allowlist, not just Fable. If a task-specific bar is
// wanted, it should be set for all three.
// Sources: https://claude.com/resources/tutorials/choosing-the-right-claude-model
//          https://www.anthropic.com/news/claude-fable-5-mythos-5
const AT_OR_ABOVE_SONNET: ReadonlySet<string> = new Set(['sonnet', 'opus', 'fable']);

/**
 * Dated historical ids (claude-sonnet-4-6, claude-opus-4-8, claude-fable-5, …)
 * still clear the floor. This list MUST track the alias allowlist above: the
 * eight bug.* jobs briefly held the dated `claude-fable-5` before being moved to
 * the alias, and omitting fable here would have judged the same model as above
 * the floor under one id and below it under the other.
 */
const DATED_AT_OR_ABOVE_SONNET = /^claude-(sonnet|opus|fable)(-|$)/;

/**
 * True when the given provider+model is BELOW the safety-judge floor.
 *
 * Fails CLOSED: anything not positively known to meet the floor — a non-Anthropic
 * provider, Haiku, or an unclassified family — is treated as below it.
 */
export function isBelowSonnet(
  provider: string | null | undefined,
  modelId: string | null | undefined,
): boolean {
  if (provider !== 'anthropic') return true; // non-Claude → off the tier, below the floor
  const id = (modelId ?? '').trim().toLowerCase();
  if (AT_OR_ABOVE_SONNET.has(id)) return false;
  if (DATED_AT_OR_ABOVE_SONNET.test(id)) return false;
  return true; // unknown family → unproven → below the floor
}
