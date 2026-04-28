/**
 * Shared LayerResult type for all 5 layer evaluators.
 *
 * Each evaluator (lib/attention-bar/layers/layer-{0,1,2,3,4}.ts) returns a
 * LayerResult that the resolver wraps with bookkeeping (firedLayer, trace).
 */

import type { ResolvedAction } from '../types';

export type LayerResult =
  | { matched: true; action: Omit<ResolvedAction, 'firedLayer' | 'trace'> }
  | { matched: false; reason?: string };
