/**
 * Shared LayerResult type for all 5 layer evaluators.
 *
 * Each evaluator (lib/attention-bar/layers/layer-{0,1,2,3,4}.ts) returns a
 * LayerResult that the resolver wraps with bookkeeping (firedLayer, trace).
 *
 * Optional `secondary` (added 2026-04-29):
 *   A layer may now emit a SECOND distinct match alongside its primary one.
 *   The resolver pushes both into its hit list (subject to the same
 *   self-referential filter as the primary), preserving the L0→L2→L3→L1→L4
 *   priority order. Used by Layer 1 today (Director-tunable toggle
 *   `attention_bar.layer1.return_secondary`) so the split bar can render on
 *   every page by default. Other layers may opt in later via the same field
 *   without further plumbing.
 */

import type { ResolvedAction } from '../types';

export type LayerResult =
  | {
      matched: true;
      action: Omit<ResolvedAction, 'firedLayer' | 'trace'>;
      /**
       * Optional second action surfaced by the same layer. Same shape as
       * `action`; resolver dedups by href and applies the self-referential
       * filter independently before pushing into `hits`.
       */
      secondary?: Omit<ResolvedAction, 'firedLayer' | 'trace'>;
    }
  | { matched: false; reason?: string };
