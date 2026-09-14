/**
 * Direction-aware amber/red validation for the Thresholds page.
 *
 * Director's ruling 2026-09-12: for a higher-is-worse input (SFR, projected
 * intake, attrition pipeline) a red ABOVE amber is correct — the seeded
 * 100/120 and 10/20 rows are valid, the old fixed "amber > red" rule was wrong.
 */
import { describe, it, expect } from 'vitest';
import {
  THRESHOLD_DIRECTION,
  validateThresholdRow,
  validateThresholdRows,
} from '@/lib/services/hr/recruitment-need/threshold-direction';

describe('THRESHOLD_DIRECTION', () => {
  it('matches the seed migration comments for every input', () => {
    expect(THRESHOLD_DIRECTION).toEqual({
      sanctioned_gap: 'lower-is-worse',
      sfr: 'higher-is-worse',
      specialization_gap: 'lower-is-worse',
      workload: 'higher-is-worse',
      projected_intake: 'higher-is-worse',
      attrition_pipeline: 'higher-is-worse',
      peer_benchmark: 'lower-is-worse',
    });
  });
});

describe('validateThresholdRow', () => {
  it.each([
    // ── lower-is-worse: amber > red, both 0-100 ─────────────────────────
    { name: 'lower-is-worse seeded values are valid', input_key: 'sanctioned_gap', amber: 100, red: 80, errors: {} },
    { name: 'lower-is-worse edited valid row', input_key: 'peer_benchmark', amber: 89, red: 75, errors: {} },
    { name: 'lower-is-worse inverted row is rejected', input_key: 'specialization_gap', amber: 60, red: 80, errors: { specialization_gap: 'Amber must be greater than Red' } },
    { name: 'lower-is-worse equal values are rejected', input_key: 'sanctioned_gap', amber: 80, red: 80, errors: { sanctioned_gap: 'Amber must be greater than Red' } },
    { name: 'lower-is-worse amber above 100 is rejected', input_key: 'sanctioned_gap', amber: 120, red: 80, errors: { sanctioned_gap_amber: 'Must be 0-100' } },
    { name: 'lower-is-worse negative red is rejected', input_key: 'peer_benchmark', amber: 90, red: -1, errors: { peer_benchmark_red: 'Must be 0-100' } },
    // ── higher-is-worse: red > amber, values may exceed 100 ─────────────
    { name: 'sfr seeded 100/120 is valid', input_key: 'sfr', amber: 100, red: 120, errors: {} },
    { name: 'projected_intake seeded 100/120 is valid', input_key: 'projected_intake', amber: 100, red: 120, errors: {} },
    { name: 'attrition_pipeline seeded 10/20 is valid', input_key: 'attrition_pipeline', amber: 10, red: 20, errors: {} },
    { name: 'workload 100/120 is valid', input_key: 'workload', amber: 100, red: 120, errors: {} },
    { name: 'higher-is-worse inverted row is rejected', input_key: 'sfr', amber: 120, red: 100, errors: { sfr: 'Red must be greater than Amber' } },
    { name: 'higher-is-worse equal values are rejected', input_key: 'attrition_pipeline', amber: 20, red: 20, errors: { attrition_pipeline: 'Red must be greater than Amber' } },
    { name: 'higher-is-worse negative amber is rejected', input_key: 'projected_intake', amber: -5, red: 120, errors: { projected_intake_amber: 'Must be 0 or more' } },
    { name: 'higher-is-worse NaN red is rejected', input_key: 'sfr', amber: 100, red: NaN, errors: { sfr: 'Red must be greater than Amber', sfr_red: 'Must be 0 or more' } },
  ] as const)('$name', ({ input_key, amber, red, errors }) => {
    expect(validateThresholdRow({ input_key, amber, red })).toEqual(errors);
  });
});

describe('validateThresholdRows', () => {
  it('passes the live global rows for all six page inputs (Save enables)', () => {
    const live = [
      { input_key: 'sanctioned_gap', amber: 100, red: 80 },
      { input_key: 'sfr', amber: 100, red: 120 },
      { input_key: 'specialization_gap', amber: 80, red: 60 },
      { input_key: 'projected_intake', amber: 100, red: 120 },
      { input_key: 'attrition_pipeline', amber: 10, red: 20 },
      { input_key: 'peer_benchmark', amber: 90, red: 75 },
    ] as const;
    expect(validateThresholdRows([...live])).toEqual({});
  });

  it('still blocks a genuinely inverted row among otherwise valid ones', () => {
    expect(
      validateThresholdRows([
        { input_key: 'sanctioned_gap', amber: 100, red: 80 },
        { input_key: 'sfr', amber: 130, red: 120 },
      ])
    ).toEqual({ sfr: 'Red must be greater than Amber' });
  });
});
