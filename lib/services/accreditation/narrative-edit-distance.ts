// lib/services/accreditation/narrative-edit-distance.ts
// ============================================================================
// How far did the reviewer move the AI's draft? — the drafter's return edge.
//
// Pure, dependency-free measurement between the AI-generated draft
// (accreditation_metric_narratives.ai_draft_md) and the text the owning
// reviewer okayed. Called from the okay-narrative server action AFTER a
// successful owner_okay transition; the result lands in edit_distance /
// edit_ratio / edit_measured_at. Measurement only — it gates nothing, blocks
// nothing, and never runs before the fraud-gate grounding validation.
//
// METRIC DEFINITION
//   * Both texts are tokenised on whitespace (runs of whitespace collapse, so
//     re-wrapping lines or normalising spaces is NOT an edit). Citation
//     markers like [E1] are ordinary tokens — deleting or moving a citation
//     IS an edit worth counting. Case-sensitive: "increased" → "Increased" is
//     a (small) edit.
//   * edit_distance = Levenshtein distance over those token sequences
//     (insertions + deletions + substitutions of whole tokens).
//   * edit_ratio = edit_distance / max(draft tokens, final tokens), clamped to
//     [0, 1] and rounded to 4 decimals. 0 = accepted verbatim, 1 = fully
//     rewritten. Both sides empty → 0 (nothing to edit, nothing edited).
//
// Token-level (not character-level) on purpose: a reviewer swapping one word
// in a 300-word narrative reads as 1/300 ≈ 0.003, which matches the human
// sense of "barely touched"; character distance would over-weight long words.
//
// COMPLEXITY GUARD: two-row dynamic programming, O(n·m) time / O(min(n,m))
// space. Narratives run a few hundred tokens; MAX_MEASURED_TOKENS caps the
// worst case so a pathological input cannot stall the okay path. Ratios on
// truncated inputs use the truncated lengths, keeping distance and ratio
// consistent with each other.
// ============================================================================

export interface NarrativeEditStats {
  /** Token-level Levenshtein distance between the AI draft and the final. */
  editDistance: number;
  /** editDistance / max(side lengths), 0..1, 4 decimals. */
  editRatio: number;
  /** Token count of the AI draft (after normalisation/truncation). */
  draftTokenCount: number;
  /** Token count of the okayed final (after normalisation/truncation). */
  finalTokenCount: number;
}

/** Cap per side — well above any real narrative (~hundreds of tokens). */
export const MAX_MEASURED_TOKENS = 5000;

/** Whitespace tokenisation; collapsing runs so reflowing text is not an edit. */
export function tokenizeNarrative(md: string): string[] {
  if (typeof md !== 'string') return [];
  const trimmed = md.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/);
}

function levenshtein(a: string[], b: string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Keep the shorter sequence as the DP row (O(min(n,m)) space).
  const [long, short] = a.length >= b.length ? [a, b] : [b, a];
  let prev = new Array<number>(short.length + 1);
  let curr = new Array<number>(short.length + 1);
  for (let j = 0; j <= short.length; j++) prev[j] = j;
  for (let i = 1; i <= long.length; i++) {
    curr[0] = i;
    const li = long[i - 1];
    for (let j = 1; j <= short.length; j++) {
      const cost = li === short[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution / match
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[short.length];
}

/**
 * Measure how much `finalMd` (the reviewer-okayed text) differs from
 * `draftMd` (the AI's draft snapshot). Pure; safe on empty/odd inputs.
 */
export function computeNarrativeEditStats(
  draftMd: string,
  finalMd: string,
): NarrativeEditStats {
  const draftTokens = tokenizeNarrative(draftMd).slice(0, MAX_MEASURED_TOKENS);
  const finalTokens = tokenizeNarrative(finalMd).slice(0, MAX_MEASURED_TOKENS);

  const editDistance = levenshtein(draftTokens, finalTokens);
  const denom = Math.max(draftTokens.length, finalTokens.length);
  const rawRatio = denom === 0 ? 0 : editDistance / denom;
  const editRatio = Math.round(Math.min(1, Math.max(0, rawRatio)) * 10000) / 10000;

  return {
    editDistance,
    editRatio,
    draftTokenCount: draftTokens.length,
    finalTokenCount: finalTokens.length,
  };
}
