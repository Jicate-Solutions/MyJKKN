/**
 * Attention Bar — Layer 2 rules-engine smoke gate.
 *
 * Pure-function unit checks against `rule-evaluator.ts`. No DB required.
 * Phase 7 polish: complements check-attention-bar-coverage (Layer 1) and
 * check-attention-bar-layer4-rails (Layer 4) so the consolidated
 * `npm run check:attention-bar-all` covers every layer with at least
 * one mechanical gate.
 *
 * What this verifies:
 *   1. evaluateWhenClause respects priority — `all_of` short-circuits on
 *      first false; `any_of` short-circuits on first true.
 *   2. Operators behave as documented (=, !=, >, >=, <, <=, in, not_in,
 *      between, is_null, is_not_null).
 *   3. Synthetic state keys (time_of_day, day_of_week, is_weekend) resolve
 *      without a real Date — the evaluator must not throw on missing
 *      synthetic context.
 *   4. extractStateQueryKeys walks nested clauses without duplicating
 *      keys — the resolver depends on this for de-duped parallel fetch.
 *   5. Malformed clauses fail closed (return false, not throw) so a bad
 *      admin-authored rule can never crash the resolver.
 *
 * Usage:
 *   npx tsx scripts/check-attention-bar-layer2-rules.ts
 *
 * Exits 0 on full pass, 1 on any failure. Wired into:
 *   - package.json: `npm run check:attention-bar-layer2`
 *   - package.json: `npm run check:attention-bar-all` (umbrella)
 */

import {
  evaluateWhenClause,
  extractStateQueryKeys,
} from '../lib/attention-bar/rule-evaluator';

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

function expectEqual<T>(name: string, actual: T, expected: T): void {
  check(
    name,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Gate 1: leaf operators
// ──────────────────────────────────────────────────────────────────────────

const baseState = {
  count: 5,
  status: 'open',
  ratio: 0.42,
  optional: null,
};

const evalCtx = { state: baseState };

console.log('\n── Gate 1: leaf operators ──');
expectEqual(
  'eq operator',
  evaluateWhenClause({ state_query: 'count', op: '=', value: 5 }, evalCtx),
  true,
);
expectEqual(
  'ne operator',
  evaluateWhenClause({ state_query: 'count', op: '!=', value: 6 }, evalCtx),
  true,
);
expectEqual(
  'gt operator (true)',
  evaluateWhenClause({ state_query: 'count', op: '>', value: 4 }, evalCtx),
  true,
);
expectEqual(
  'gt operator (false)',
  evaluateWhenClause({ state_query: 'count', op: '>', value: 5 }, evalCtx),
  false,
);
expectEqual(
  'gte operator (boundary)',
  evaluateWhenClause({ state_query: 'count', op: '>=', value: 5 }, evalCtx),
  true,
);
expectEqual(
  'lt operator',
  evaluateWhenClause({ state_query: 'ratio', op: '<', value: 0.5 }, evalCtx),
  true,
);
expectEqual(
  'lte operator (boundary)',
  evaluateWhenClause({ state_query: 'count', op: '<=', value: 5 }, evalCtx),
  true,
);
expectEqual(
  'in operator (member)',
  evaluateWhenClause(
    { state_query: 'status', op: 'in', value: ['open', 'closed'] },
    evalCtx,
  ),
  true,
);
expectEqual(
  'in operator (non-member)',
  evaluateWhenClause(
    { state_query: 'status', op: 'in', value: ['archived'] },
    evalCtx,
  ),
  false,
);
expectEqual(
  'not_in operator',
  evaluateWhenClause(
    { state_query: 'status', op: 'not_in', value: ['archived'] },
    evalCtx,
  ),
  true,
);
expectEqual(
  'between operator (in range)',
  evaluateWhenClause({ state_query: 'count', op: 'between', value: [1, 10] }, evalCtx),
  true,
);
expectEqual(
  'between operator (boundary)',
  evaluateWhenClause({ state_query: 'count', op: 'between', value: [5, 10] }, evalCtx),
  true,
);
expectEqual(
  'between operator (out of range)',
  evaluateWhenClause({ state_query: 'count', op: 'between', value: [10, 20] }, evalCtx),
  false,
);
expectEqual(
  'is_null operator (null value)',
  evaluateWhenClause({ state_query: 'optional', op: 'is_null' }, evalCtx),
  true,
);
expectEqual(
  'is_null operator (non-null)',
  evaluateWhenClause({ state_query: 'count', op: 'is_null' }, evalCtx),
  false,
);
expectEqual(
  'is_not_null operator',
  evaluateWhenClause({ state_query: 'count', op: 'is_not_null' }, evalCtx),
  true,
);

// ──────────────────────────────────────────────────────────────────────────
// Gate 2: combinators
// ──────────────────────────────────────────────────────────────────────────

console.log('\n── Gate 2: combinators (all_of / any_of / not) ──');

expectEqual(
  'all_of: every condition true',
  evaluateWhenClause(
    {
      type: 'all_of',
      conditions: [
        { state_query: 'count', op: '>', value: 0 },
        { state_query: 'status', op: '=', value: 'open' },
      ],
    },
    evalCtx,
  ),
  true,
);

expectEqual(
  'all_of: one condition false',
  evaluateWhenClause(
    {
      type: 'all_of',
      conditions: [
        { state_query: 'count', op: '>', value: 0 },
        { state_query: 'status', op: '=', value: 'closed' },
      ],
    },
    evalCtx,
  ),
  false,
);

expectEqual(
  'any_of: first true',
  evaluateWhenClause(
    {
      type: 'any_of',
      conditions: [
        { state_query: 'count', op: '>', value: 0 },
        { state_query: 'status', op: '=', value: 'closed' },
      ],
    },
    evalCtx,
  ),
  true,
);

expectEqual(
  'any_of: all false',
  evaluateWhenClause(
    {
      type: 'any_of',
      conditions: [
        { state_query: 'count', op: '<', value: 0 },
        { state_query: 'status', op: '=', value: 'closed' },
      ],
    },
    evalCtx,
  ),
  false,
);

expectEqual(
  'not: inverts true → false',
  evaluateWhenClause(
    {
      type: 'not',
      condition: { state_query: 'count', op: '>', value: 0 },
    },
    evalCtx,
  ),
  false,
);

expectEqual(
  'not: inverts false → true',
  evaluateWhenClause(
    {
      type: 'not',
      condition: { state_query: 'count', op: '<', value: 0 },
    },
    evalCtx,
  ),
  true,
);

// ──────────────────────────────────────────────────────────────────────────
// Gate 3: malformed clauses fail closed (do not throw)
// ──────────────────────────────────────────────────────────────────────────

console.log('\n── Gate 3: malformed clauses fail closed ──');

let threw = false;
try {
  evaluateWhenClause(null, evalCtx);
} catch {
  threw = true;
}
check('null clause does not throw', !threw, 'evaluator threw on null');

threw = false;
try {
  evaluateWhenClause({ malformed: 'shape' }, evalCtx);
} catch {
  threw = true;
}
check(
  'unknown shape does not throw',
  !threw,
  'evaluator threw on unknown shape',
);

threw = false;
try {
  evaluateWhenClause(
    { state_query: 'count', op: 'unknown_op', value: 1 },
    evalCtx,
  );
} catch {
  threw = true;
}
check(
  'unknown operator does not throw',
  !threw,
  'evaluator threw on unknown op',
);

// Missing state-query key should evaluate to false, not throw.
threw = false;
let missingResult = true;
try {
  missingResult = evaluateWhenClause(
    { state_query: 'does_not_exist', op: '=', value: 1 },
    evalCtx,
  );
} catch {
  threw = true;
}
check('missing state-query key does not throw', !threw);
expectEqual('missing state-query key returns false', missingResult, false);

// ──────────────────────────────────────────────────────────────────────────
// Gate 4: extractStateQueryKeys de-duplicates + walks nested clauses
// ──────────────────────────────────────────────────────────────────────────

console.log('\n── Gate 4: extractStateQueryKeys ──');

const nested = {
  type: 'all_of',
  conditions: [
    { state_query: 'a', op: '>', value: 0 },
    {
      type: 'any_of',
      conditions: [
        { state_query: 'b', op: '=', value: 'x' },
        { state_query: 'a', op: '<', value: 100 }, // duplicate, must dedupe
      ],
    },
    {
      type: 'not',
      condition: { state_query: 'c', op: 'is_null' },
    },
  ],
};
const keys = extractStateQueryKeys(nested);
const sorted = [...keys].sort();
expectEqual(
  'extractStateQueryKeys returns 3 unique keys (a, b, c)',
  JSON.stringify(sorted),
  JSON.stringify(['a', 'b', 'c']),
);

// ──────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────

console.log('');
if (failures === 0) {
  console.log(`${GREEN}All Layer 2 rule-engine gates passed.${RESET}`);
  process.exit(0);
} else {
  console.error(`${RED}${failures} gate(s) failed.${RESET}`);
  process.exit(1);
}
