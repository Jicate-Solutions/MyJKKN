/**
 * Attention Bar — Layer 3 behavioural-learning rails smoke gate.
 *
 * Pure-function unit checks against `confidence-engine.ts`. No DB required.
 * Phase 7 polish: the spec is explicit about Layer 3 thresholds (≥30
 * impressions, ≥0.7 confidence) — this gate verifies the math the resolver
 * relies on so a regression in confidenceFormula() can never silently
 * change which actions Layer 3 promotes.
 *
 * What this verifies:
 *   1. Zero-impression / zero-tap inputs return 0 (no divide-by-zero).
 *   2. 30-impression ramp-up: confidence ramps linearly from 0 → tap_rate
 *      as impressions go 0 → 30, then clamps at tap_rate.
 *   3. The 0.7 threshold the resolver uses is reachable (a user with
 *      tap_rate ≥ 0.7 and ≥30 impressions clears it).
 *   4. The 0.7 threshold is NOT prematurely reached (a user with high
 *      tap_rate but only 5 impressions stays below).
 *
 * Usage:
 *   npx tsx scripts/check-attention-bar-layer3-rails.ts
 *
 * Exits 0 on full pass, 1 on any failure. Wired into:
 *   - package.json: `npm run check:attention-bar-layer3`
 *   - package.json: `npm run check:attention-bar-all` (umbrella)
 */

import { confidenceFormula } from '../lib/attention-bar/confidence-engine';

// ──────────────────────────────────────────────────────────────────────────
// Tiny green/red harness
// ──────────────────────────────────────────────────────────────────────────

let failures = 0;
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`${GREEN}OK${RESET}    ${name}`);
  } else {
    console.error(`${RED}FAIL${RESET}  ${name}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

function expectClose(
  name: string,
  actual: number,
  expected: number,
  epsilon = 1e-6,
): void {
  const diff = Math.abs(actual - expected);
  check(
    name,
    diff < epsilon,
    `expected ≈ ${expected}, got ${actual} (Δ=${diff})`,
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Spec constants — MUST match Layer 3 evaluator
// ──────────────────────────────────────────────────────────────────────────

const MIN_IMPRESSIONS = 30;
const CONFIDENCE_THRESHOLD = 0.7;

// ──────────────────────────────────────────────────────────────────────────
// Gate 1: degenerate inputs return 0
// ──────────────────────────────────────────────────────────────────────────

console.log('\n── Gate 1: degenerate inputs ──');
expectClose('zero impressions returns 0', confidenceFormula(0, 0), 0);
expectClose('zero impressions, non-zero taps returns 0', confidenceFormula(5, 0), 0);
expectClose('zero taps, non-zero impressions returns 0', confidenceFormula(0, 30), 0);
expectClose('negative impressions returns 0', confidenceFormula(5, -1), 0);
expectClose('negative taps returns 0', confidenceFormula(-1, 30), 0);

// ──────────────────────────────────────────────────────────────────────────
// Gate 2: ramp-up scaling
// ──────────────────────────────────────────────────────────────────────────

console.log('\n── Gate 2: ramp-up scaling (30-impression window) ──');

// At exactly the ramp-up threshold, ramp-up factor is 1.0.
expectClose(
  'at 30 impressions ramp-up = 1.0 → confidence = tap_rate',
  confidenceFormula(15, 30),
  15 / 30,
);

// Beyond ramp-up, factor stays clamped at 1.0.
expectClose(
  'at 60 impressions confidence stays at tap_rate (clamped ramp-up)',
  confidenceFormula(30, 60),
  30 / 60,
);

// Halfway through ramp-up (15 impressions) — factor = 0.5.
expectClose(
  'at 15 impressions ramp-up = 0.5',
  confidenceFormula(10, 15),
  (10 / 15) * 0.5,
);

// Very early (1 impression) — factor ≈ 1/30; confidence small even at 100% taps.
expectClose(
  'at 1 impression with 1 tap, confidence ≈ 1/30',
  confidenceFormula(1, 1),
  1 / 30,
);

// ──────────────────────────────────────────────────────────────────────────
// Gate 3: 0.7 threshold reachable
// ──────────────────────────────────────────────────────────────────────────

console.log('\n── Gate 3: 0.7 threshold reachable for high-engagement users ──');

// User with 25 taps in 30 impressions = 0.833 tap_rate × ramp-up 1.0 = 0.833 ≥ 0.7
const highEngagement = confidenceFormula(25, 30);
check(
  `25/30 taps clears ${CONFIDENCE_THRESHOLD} threshold (got ${highEngagement.toFixed(4)})`,
  highEngagement >= CONFIDENCE_THRESHOLD,
);

// User with 21 taps in 30 impressions = 0.7 exact
const exactlyAtThreshold = confidenceFormula(21, 30);
check(
  `21/30 taps reaches threshold exactly (got ${exactlyAtThreshold.toFixed(4)})`,
  exactlyAtThreshold >= CONFIDENCE_THRESHOLD,
);

// User with 90 taps in 100 impressions = 0.9 × 1.0 = 0.9 ≥ 0.7
expectClose(
  '90/100 taps post-rampup → 0.9',
  confidenceFormula(90, 100),
  0.9,
);
check(
  '90/100 taps clears threshold',
  confidenceFormula(90, 100) >= CONFIDENCE_THRESHOLD,
);

// ──────────────────────────────────────────────────────────────────────────
// Gate 4: 0.7 threshold protects against premature promotion
// ──────────────────────────────────────────────────────────────────────────

console.log('\n── Gate 4: ramp-up protects against premature promotion ──');

// User with 5 taps in 5 impressions = 1.0 tap_rate × 5/30 ramp = 0.167 < 0.7
const tooEarly = confidenceFormula(5, 5);
check(
  `5/5 taps at impressions=5 stays below threshold (got ${tooEarly.toFixed(4)})`,
  tooEarly < CONFIDENCE_THRESHOLD,
);

// Even 100% tap_rate at MIN_IMPRESSIONS-1 must NOT clear threshold for the
// resolver — but the resolver enforces MIN_IMPRESSIONS separately. Here we
// just verify the math: 29/29 × 29/30 = 0.9667 — which is above threshold.
// This is intentional: confidenceFormula is purely the math; the
// MIN_IMPRESSIONS gate lives in evaluateLayer3 as a separate guard. We
// document the contract here.
const at29 = confidenceFormula(29, 29);
check(
  `29/29 taps gives ${at29.toFixed(4)} — math is correct (Layer 3 evaluator separately gates MIN_IMPRESSIONS=${MIN_IMPRESSIONS})`,
  at29 > 0.9,
);

// ──────────────────────────────────────────────────────────────────────────
// Gate 5: monotonicity — more taps with same impressions → higher confidence
// ──────────────────────────────────────────────────────────────────────────

console.log('\n── Gate 5: monotonicity ──');

const c10 = confidenceFormula(10, 100);
const c20 = confidenceFormula(20, 100);
const c50 = confidenceFormula(50, 100);
check('10 < 20 < 50 taps in same window: confidence rises monotonically', c10 < c20 && c20 < c50);

// More impressions WITHOUT more taps → ramp-up bigger but tap_rate smaller.
// This SHOULD lower confidence (the user has been shown more often without
// engaging). Verify: 5/30 = 0.166 vs 5/60 = 0.083.
const sparseEarly = confidenceFormula(5, 30);
const sparseLate = confidenceFormula(5, 60);
check(
  'static taps + more impressions → confidence DROPS (correct decay)',
  sparseLate < sparseEarly,
);

// ──────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────

console.log('');
if (failures === 0) {
  console.log(`${GREEN}All Layer 3 confidence-engine gates passed.${RESET}`);
  process.exit(0);
} else {
  console.error(`${RED}${failures} gate(s) failed.${RESET}`);
  process.exit(1);
}
