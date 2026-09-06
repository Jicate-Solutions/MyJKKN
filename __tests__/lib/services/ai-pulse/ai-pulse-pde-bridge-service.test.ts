/**
 * AI Pulse → PDE bridge — engagement-signal scoring.
 * =============================================================================
 *
 * Covers the two pure surfaces that decide what an `engaged_live_session`
 * demonstration is worth:
 *
 *   1. `resolveSignalMap` — merges the `pde_bridge_signal_map` policy row over
 *      DEFAULT_SIGNAL_MAP. It validates key-by-key and never spreads, so an
 *      unvalidated key is silently dropped (this is why `score_source` in the
 *      live policy row has always been inert). These tests exist to make sure
 *      `weight_multiplier` never joins it.
 *
 *   2. `engagementWeightedScore` — the discount itself, and the null-vs-zero
 *      distinction the Agency Index depends on.
 */

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_SIGNAL_MAP,
  resolveSignalMap,
  engagementWeightedScore,
} from '@/lib/services/ai-pulse/ai-pulse-pde-bridge-service';

// Convenience: build a policy value that overrides only engaged_live_session.
function policyWithMultiplier(weight_multiplier: unknown) {
  return { engaged_live_session: { weight_multiplier } };
}

const DEFAULT_MULTIPLIER = 0.25;

describe('resolveSignalMap — weight_multiplier', () => {
  it('defaults to 0.25 when the policy row is absent', () => {
    const map = resolveSignalMap(undefined);
    expect(map.engaged_live_session.weight_multiplier).toBe(DEFAULT_MULTIPLIER);
  });

  it('defaults to 0.25 when the policy row omits the key', () => {
    // This is the shape of the row live in prod today.
    const live = {
      engaged_live_session: {
        category_key: 'embodied',
        skill_name: 'AI Pulse — Weekly AI Tool Practice',
        status: 'scored',
        evidence_type: 'engagement_record',
        score_source: 'quiz_score',
      },
    };
    expect(resolveSignalMap(live).engaged_live_session.weight_multiplier).toBe(
      DEFAULT_MULTIPLIER,
    );
  });

  it('honours an in-range override (the Director can retune without a deploy)', () => {
    expect(
      resolveSignalMap(policyWithMultiplier(0.3)).engaged_live_session.weight_multiplier,
    ).toBe(0.3);
  });

  it('accepts both bounds: 0 (signal contributes nothing) and 1 (no discount)', () => {
    expect(
      resolveSignalMap(policyWithMultiplier(0)).engaged_live_session.weight_multiplier,
    ).toBe(0);
    expect(
      resolveSignalMap(policyWithMultiplier(1)).engaged_live_session.weight_multiplier,
    ).toBe(1);
  });

  it('accepts a numeric string, matching asNumber() semantics', () => {
    expect(
      resolveSignalMap(policyWithMultiplier('0.4')).engaged_live_session.weight_multiplier,
    ).toBe(0.4);
  });

  it.each([
    ['a fat-fingered 25 (meant 0.25)', 25],
    ['a negative multiplier', -1],
    ['a value just above the upper bound', 1.0001],
    ['a non-numeric string', 'quarter'],
    ['null', null],
    ['NaN', NaN],
  ])('rejects %s and falls back to the default', (_label, bad) => {
    expect(
      resolveSignalMap(policyWithMultiplier(bad)).engaged_live_session.weight_multiplier,
    ).toBe(DEFAULT_MULTIPLIER);
  });

  it('ignores weight_multiplier on signals other than engaged_live_session', () => {
    const map = resolveSignalMap({ gold_selected: { weight_multiplier: 0.5 } });
    expect(map.gold_selected.weight_multiplier).toBeUndefined();
  });

  it('does not mutate DEFAULT_SIGNAL_MAP', () => {
    resolveSignalMap(policyWithMultiplier(0.9));
    expect(DEFAULT_SIGNAL_MAP.engaged_live_session.weight_multiplier).toBe(
      DEFAULT_MULTIPLIER,
    );
  });

  it('still honours min_polls_responded alongside the new key', () => {
    const map = resolveSignalMap({
      engaged_live_session: { min_polls_responded: 5, weight_multiplier: 0.5 },
    });
    expect(map.engaged_live_session.min_polls_responded).toBe(5);
    expect(map.engaged_live_session.weight_multiplier).toBe(0.5);
  });
});

describe('engagementWeightedScore', () => {
  it('discounts a real quiz score', () => {
    // quiz_score is 0-100 in prod (n=68, median 67). 67 * 0.25 = 16.75, which
    // normalises to ~3/100 against NORMALISATION_CAP=500 in the live service.
    expect(engagementWeightedScore(80, 0.25)).toBe(20);
    expect(engagementWeightedScore(67, 0.25)).toBeCloseTo(16.75, 10);
    expect(engagementWeightedScore(100, 0.25)).toBe(25);
  });

  it('keeps a missing quiz score as null, NOT zero', () => {
    // A `0` would read as a scored demonstration to pde-agency-live-service
    // (`.not('weighted_score','is',null)`), suppressing its snapshot fallback.
    expect(engagementWeightedScore(null, 0.25)).toBeNull();
  });

  it('preserves a genuine zero score as zero, distinct from null', () => {
    expect(engagementWeightedScore(0, 0.25)).toBe(0);
  });

  it('respects a retuned multiplier', () => {
    expect(engagementWeightedScore(80, 0.5)).toBe(40);
    expect(engagementWeightedScore(80, 0)).toBe(0);
  });
});
