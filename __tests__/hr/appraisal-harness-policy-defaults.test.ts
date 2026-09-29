// =====================================================================
// HR appraisal checks — what an ABSENT policy key means
// =====================================================================
// No policy row carries any of these keys today, so every college reads
// the absent case. Pinned both where the settings page reads them
// (parseValue) and where the checks read them (appraisal-harness).
// =====================================================================

import { describe, it, expect } from 'vitest';
import { parseValue } from '@/lib/hr/performance-review-policy';
import {
  agreementMinPairs,
  agreementMinPct,
  conditionsFirstRequired,
  hasAnyStatements,
  saturationMinCount,
  saturationWarnPct,
} from '@/lib/hr/appraisal-harness';

describe('an empty policy row, read by the settings page', () => {
  const v = parseValue({});

  it('asks what the college did not provide (ON by default)', () => {
    expect(v.conditions_first_on_below).toBe(true);
  });

  it('uses the approved thresholds', () => {
    expect(v.rater_agreement_min_pct).toBe(70);
    expect(v.rater_agreement_min_pairs).toBe(5);
    expect(v.saturation_warn_pct).toBe(80);
    expect(v.saturation_min_count).toBe(10);
  });

  it('has no statements, so no form changes', () => {
    for (const area of ['teaching', 'research', 'service', 'collegiality'] as const) {
      expect(v.band_statements[area]).toEqual({ exceeds: [], meets: [], below: [] });
    }
  });

  it('leaves the rules that shipped in #4081 exactly as they were', () => {
    expect(v.collegiality_below_requires_example).toBe(true);
    expect(v.below_blocks_increment).toBe(false);
    expect(v.exclude_collegiality_from_score).toBe(false);
  });
});

describe('an empty policy, read by the checks', () => {
  it.each([null, undefined, {}])('%s gives the defaults', (p) => {
    expect(conditionsFirstRequired(p)).toBe(true);
    expect(agreementMinPct(p)).toBe(70);
    expect(agreementMinPairs(p)).toBe(5);
    expect(saturationWarnPct(p)).toBe(80);
    expect(saturationMinCount(p)).toBe(10);
    expect(hasAnyStatements(p)).toBe(false);
  });
});

describe('a damaged policy row', () => {
  it('falls back per field rather than trusting nonsense', () => {
    const v = parseValue({
      rater_agreement_min_pct: 140,
      rater_agreement_min_pairs: 0,
      saturation_warn_pct: -5,
      saturation_min_count: 'ten',
      band_statements: { teaching: { exceeds: ['  Real one  ', 12, ''] }, bogus: { meets: ['x'] } },
    });
    expect(v.rater_agreement_min_pct).toBe(70);
    expect(v.rater_agreement_min_pairs).toBe(5);
    expect(v.saturation_warn_pct).toBe(80);
    expect(v.saturation_min_count).toBe(10);
    expect(v.band_statements.teaching.exceeds).toEqual(['Real one']);
    expect(Object.keys(v.band_statements)).toEqual(['teaching', 'research', 'service', 'collegiality']);
  });

  it('only an explicit false switches conditions-first off', () => {
    expect(parseValue({ conditions_first_on_below: false }).conditions_first_on_below).toBe(false);
    expect(parseValue({ conditions_first_on_below: 'false' }).conditions_first_on_below).toBe(true);
    expect(parseValue({ conditions_first_on_below: null }).conditions_first_on_below).toBe(true);
  });
});
