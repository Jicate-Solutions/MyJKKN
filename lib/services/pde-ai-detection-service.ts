/**
 * PDE AI Deliverable Detection Service (Tier 2 Item 6)
 * ============================================================================
 *
 * Pure detection helpers for the PDE pipeline:
 *
 *   1. `classifyDeliverable(input)` — applies the
 *      `pde.scoring.ai_deliverable_credit_policy` rules to a submitted
 *      deliverable + the learner's agency score and disclosure flag,
 *      returning a credit decision (`full` / `partial` / `none`).
 *
 *   2. `detectAiPatterns(text)` — STUB heuristic classifier that scores how
 *      likely a freeform text body was written by an LLM. Deterministic,
 *      no network calls. Intended to be replaced by a real classifier in
 *      Tier 3 (will live in the same file behind the same signature).
 *
 * Design notes
 * ------------
 *   - Pure, side-effect-free, easy to unit-test. No DB writes.
 *   - Reads policy through `getAiDeliverableCreditPolicy()` so a Director can
 *     change the global stance without redeploys.
 *   - Real classifier integration is intentionally out-of-scope for Tier 2.
 *     The stub returns a deterministic 0..1 score from cheap structural
 *     signals so downstream code can be wired now and swapped later.
 *   - `validator-service.ts` integration lands in a separate PR (Tier 3).
 *
 * Phase: PDE Tier 2.6 (2026-05-19).
 */

import {
  getAiDeliverableCreditPolicy,
  type AiDeliverableCreditMode,
  type AiDeliverableCreditPolicy,
} from '@/lib/services/pde-policy-reader';

// ===========================================================================
// Public types
// ===========================================================================

export type AiCreditMode = 'full' | 'partial' | 'none';

export interface AiDeliverableInput {
  evidence: Record<string, unknown>;
  agency_score?: number;
  disclosed: boolean;
}

export interface AiDeliverableClassification {
  credit_mode: AiCreditMode;
  reason: string;
  /** Echo of the policy mode that produced the decision, for auditability. */
  policy_mode: AiDeliverableCreditMode;
  /** Multiplier the scoring engine should apply downstream (1, 0.5, or 0). */
  credit_multiplier: number;
}

export interface AiPatternSignal {
  likelihood: number; // 0..1
  signals: string[];
}

// ===========================================================================
// Internal helpers (pure)
// ===========================================================================

const PARTIAL_CREDIT_MULTIPLIER = 0.5;

function decisionFor(
  credit_mode: AiCreditMode,
  reason: string,
  policy: AiDeliverableCreditPolicy
): AiDeliverableClassification {
  const credit_multiplier =
    credit_mode === 'full' ? 1 : credit_mode === 'partial' ? PARTIAL_CREDIT_MULTIPLIER : 0;
  return {
    credit_mode,
    reason,
    policy_mode: policy.mode,
    credit_multiplier,
  };
}

// ===========================================================================
// Service class
// ===========================================================================

export class PDEAiDetectionService {
  /**
   * Decide how much credit an AI-assisted deliverable should receive.
   *
   * Mapping (aligned to the typed `AiDeliverableCreditMode` enum in
   * `pde-policy-reader.ts`, which is the source of truth):
   *
   *   - `full_credit_if_agency_proven`
   *       + agency_score >= min_agency_score  → full
   *       + agency_score <  min_agency_score  → partial
   *       + agency_score missing              → partial (safer default)
   *
   *   - `disclosure_required_full_credit`
   *       + disclosed=true   → full
   *       + disclosed=false  → none
   *
   *   - `reduced_credit_proportional`
   *       Always partial (50%) — proportional model, exact curve lives in
   *       Tier 3 scoring engine.
   *
   *   - any unknown mode → defaults to `full` (fail-soft).
   *
   * @param input.evidence       Evidence blob — currently unused by this
   *                             function, accepted for forward-compat with
   *                             a future LLM-based examination pass.
   * @param input.agency_score   Learner's Agency Index score (0..100).
   *                             Optional only because some callers may not
   *                             have computed it yet.
   * @param input.disclosed      Whether the learner disclosed AI assistance.
   */
  static async classifyDeliverable(
    input: AiDeliverableInput,
    institutionId?: string | null
  ): Promise<AiDeliverableClassification> {
    const policy = await getAiDeliverableCreditPolicy(institutionId ?? null);
    const { mode, min_agency_score, require_disclosure } = policy;

    // Disclosure precondition: if the policy says disclosure is mandatory
    // and the learner did not disclose, no credit is granted regardless of
    // the mode-specific credit curve.
    if (require_disclosure && !input.disclosed) {
      return decisionFor(
        'none',
        'AI assistance disclosure is required by policy but was not provided.',
        policy
      );
    }

    switch (mode) {
      case 'full_credit_if_agency_proven': {
        if (typeof input.agency_score !== 'number') {
          return decisionFor(
            'partial',
            `Agency Index score not available; partial (${PARTIAL_CREDIT_MULTIPLIER * 100}%) credit applied pending score computation.`,
            policy
          );
        }
        if (input.agency_score >= min_agency_score) {
          return decisionFor(
            'full',
            `Agency Index ${input.agency_score} meets the threshold of ${min_agency_score}; full credit granted for AI-assisted deliverable.`,
            policy
          );
        }
        return decisionFor(
          'partial',
          `Agency Index ${input.agency_score} below threshold of ${min_agency_score}; partial (${PARTIAL_CREDIT_MULTIPLIER * 100}%) credit applied.`,
          policy
        );
      }

      case 'disclosure_required_full_credit': {
        if (input.disclosed) {
          return decisionFor(
            'full',
            'AI assistance disclosed; full credit granted under disclosure-required policy.',
            policy
          );
        }
        return decisionFor(
          'none',
          'AI assistance not disclosed under disclosure-required policy; no credit granted.',
          policy
        );
      }

      case 'reduced_credit_proportional': {
        return decisionFor(
          'partial',
          `Proportional-reduction policy in effect; partial (${PARTIAL_CREDIT_MULTIPLIER * 100}%) credit applied to AI-assisted deliverable.`,
          policy
        );
      }

      default: {
        // Fail-soft for any future mode that lands before this service is
        // updated. Prefer granting credit over silently zeroing learners out.
        return decisionFor(
          'full',
          `Unrecognised policy mode "${mode}"; defaulting to full credit (fail-soft).`,
          policy
        );
      }
    }
  }

  /**
   * STUB heuristic AI-pattern detector.
   *
   * Returns a deterministic 0..1 likelihood plus a list of structural signals
   * that fired. Does **not** call any LLM, does **not** hit the network, and
   * never returns NaN. The score is suitable for plumbing the integration but
   * MUST NOT be used as a real classifier in production decisions.
   *
   * Heuristic signals (each adds a small weight):
   *   - very long body (>= 1500 chars)
   *   - very high average sentence length (>= 22 words)
   *   - balanced paragraph cadence (3+ paragraphs of similar length)
   *   - presence of LLM-typical filler phrases
   *   - absence of contractions
   *   - presence of bulleted lists with parallel grammar
   *
   * // TODO: integrate real classifier in Tier 3
   */
  static async detectAiPatterns(text: string): Promise<AiPatternSignal> {
    const signals: string[] = [];
    const safeText = (text ?? '').toString();

    if (safeText.trim().length === 0) {
      return { likelihood: 0, signals: ['empty_input'] };
    }

    const length = safeText.length;
    const words = safeText.split(/\s+/).filter(Boolean);
    const sentences = safeText
      .split(/[.!?]+\s/)
      .map((s) => s.trim())
      .filter(Boolean);
    const paragraphs = safeText
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;

    let score = 0;

    if (length >= 1500) {
      score += 0.15;
      signals.push('long_body');
    }
    if (avgWordsPerSentence >= 22) {
      score += 0.2;
      signals.push('high_avg_sentence_length');
    }
    if (paragraphs.length >= 3) {
      const lengths = paragraphs.map((p) => p.length);
      const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance =
        lengths.reduce((acc, l) => acc + (l - mean) * (l - mean), 0) / lengths.length;
      const stdev = Math.sqrt(variance);
      const coefficientOfVariation = mean > 0 ? stdev / mean : 0;
      if (coefficientOfVariation < 0.35) {
        score += 0.15;
        signals.push('balanced_paragraph_cadence');
      }
    }

    const fillerPhrases = [
      "it's important to note",
      'in conclusion',
      'furthermore',
      'moreover',
      'in summary',
      'overall',
      "it's worth mentioning",
      'as previously mentioned',
    ];
    const lower = safeText.toLowerCase();
    const matchedFillers = fillerPhrases.filter((p) => lower.includes(p));
    if (matchedFillers.length >= 2) {
      score += 0.2;
      signals.push('llm_filler_phrases');
    } else if (matchedFillers.length === 1) {
      score += 0.1;
      signals.push('llm_filler_phrase');
    }

    if (!/\b(can't|won't|don't|isn't|it's|i'm|we're|you're|they're)\b/i.test(safeText)) {
      score += 0.1;
      signals.push('no_contractions');
    }

    const bulletLines = safeText.split('\n').filter((l) => /^\s*[-*•]\s+/.test(l));
    if (bulletLines.length >= 3) {
      const firstWords = bulletLines.map((l) => l.replace(/^\s*[-*•]\s+/, '').split(/\s+/)[0]);
      const firstWordSet = new Set(firstWords.map((w) => w?.toLowerCase()));
      // Parallel grammar = many bullets sharing the same opening word.
      if (firstWordSet.size <= Math.ceil(bulletLines.length / 2)) {
        score += 0.1;
        signals.push('parallel_bullet_grammar');
      }
    }

    const likelihood = Math.min(1, Math.max(0, Number(score.toFixed(2))));
    return { likelihood, signals };
  }
}
