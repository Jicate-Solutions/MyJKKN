/**
 * Direction of each recruitment-need signal input and the amber/red rule that
 * follows from it. Mirrors the seed comments in
 * supabase/migrations/20260526000000_hr_recruitment_need_threshold_policies.sql.
 *
 *   lower-is-worse  — the input is a % of norm where falling short is the
 *                     problem (sanctioned gap, specialization coverage, peer
 *                     benchmark). Amber fires first, so amber > red.
 *   higher-is-worse — the input is a % of norm where exceeding it is the
 *                     problem (SFR, projected intake, attrition pipeline,
 *                     workload). Amber fires first, so red > amber, and the
 *                     values legitimately go past 100 (e.g. red at 120% of norm).
 */

import type { SignalInputKey } from '@/types/hr-recruitment-need';

export type ThresholdDirection = 'lower-is-worse' | 'higher-is-worse';

export const THRESHOLD_DIRECTION: Record<SignalInputKey, ThresholdDirection> = {
  sanctioned_gap: 'lower-is-worse',
  sfr: 'higher-is-worse',
  specialization_gap: 'lower-is-worse',
  workload: 'higher-is-worse',
  projected_intake: 'higher-is-worse',
  attrition_pipeline: 'higher-is-worse',
  peer_benchmark: 'lower-is-worse',
};

export const THRESHOLD_RULE_TEXT: Record<ThresholdDirection, string> = {
  'lower-is-worse': 'Amber must be greater than Red',
  'higher-is-worse': 'Red must be greater than Amber',
};

export interface ThresholdRowInput {
  input_key: SignalInputKey;
  amber: number;
  red: number;
}

/**
 * Validate one row against its direction. Returns the error keyed the way the
 * Thresholds page renders them: `<input_key>` for the ordering rule and
 * `<input_key>_amber` / `<input_key>_red` for out-of-range values.
 */
export function validateThresholdRow(row: ThresholdRowInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const direction = THRESHOLD_DIRECTION[row.input_key];
  const ordered =
    direction === 'higher-is-worse' ? row.red > row.amber : row.amber > row.red;
  if (!ordered) errors[row.input_key] = THRESHOLD_RULE_TEXT[direction];

  // A lower-is-worse input is a share of norm, so 0-100. A higher-is-worse one
  // is expected to pass 100 (120% of norm), so only negatives are rejected.
  const max = direction === 'higher-is-worse' ? Infinity : 100;
  const rangeText = direction === 'higher-is-worse' ? 'Must be 0 or more' : 'Must be 0-100';
  if (!Number.isFinite(row.amber) || row.amber < 0 || row.amber > max) {
    errors[`${row.input_key}_amber`] = rangeText;
  }
  if (!Number.isFinite(row.red) || row.red < 0 || row.red > max) {
    errors[`${row.input_key}_red`] = rangeText;
  }
  return errors;
}

export function validateThresholdRows(rows: ThresholdRowInput[]): Record<string, string> {
  return rows.reduce<Record<string, string>>(
    (acc, row) => Object.assign(acc, validateThresholdRow(row)),
    {}
  );
}
