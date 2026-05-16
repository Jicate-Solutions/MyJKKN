/**
 * Layer 2 — pure rule-evaluator.
 *
 * Spec §3 Layer 2: every Layer 2 rule has a `when_clause` JSONB tree that is
 * evaluated against the resolver's pre-fetched state-query results plus a
 * handful of synthetic state keys (time_of_day, day_of_week, is_weekend).
 *
 * This module is pure (no DB, no async). Inputs in, boolean out. That keeps it
 * trivially unit-testable from `scripts/check-attention-bar-layer2-rules.ts`
 * and ensures Layer 2 evaluation has zero hidden side-effects.
 *
 * Tree shape (recursive):
 *   { type: 'all_of', conditions: [<clause>, <clause>, ...] }
 *   { type: 'any_of', conditions: [<clause>, <clause>, ...] }
 *   { type: 'not',    condition:  <clause> }
 *   { state_query: '<key>', op: '<op>', value: <any> }   // leaf
 *
 * Supported operators on leaves:
 *   '=', '!=', '>', '>=', '<', '<=',
 *   'in' (value is array), 'not_in',
 *   'between' (value is [lo, hi] inclusive),
 *   'is_null', 'is_not_null'
 *
 * Synthetic state keys (computed at eval time, NOT from DB):
 *   - time_of_day  → 'HH:mm' string (24h, derived from `nowIso`)
 *   - day_of_week  → 0-6 number (0 = Sunday, matching Date.getDay())
 *   - is_weekend   → boolean (Saturday or Sunday)
 *
 * The leaf reads the state-query blob FIRST by exact `state_query` key, and
 * falls back to a synthetic resolver. Nested paths inside a state-query blob
 * (e.g., `counselor.pending_leads.count`) are NOT evaluated here — Layer 2
 * rule authors should write the state-query function to return a flat shape,
 * or the evaluator picks the leaf with `dot.notation` paths split below.
 */

export type WhenClause = AllOfClause | AnyOfClause | NotClause | LeafClause;

export interface AllOfClause {
  type: 'all_of';
  conditions: WhenClause[];
}

export interface AnyOfClause {
  type: 'any_of';
  conditions: WhenClause[];
}

export interface NotClause {
  type: 'not';
  condition: WhenClause;
}

export interface LeafClause {
  state_query: string;
  op: LeafOp;
  /** Operand for op. Undefined for is_null / is_not_null. */
  value?: unknown;
}

export type LeafOp =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'not_in'
  | 'between'
  | 'is_null'
  | 'is_not_null';

export interface EvaluationContext {
  /** State-query results, keyed by query_key. */
  state: Record<string, unknown>;
  /** ISO timestamp used for synthetic keys (defaults to now). */
  nowIso?: string;
}

/* ─────────────────────────────────────────────────────────────────
 * Public API
 * ─────────────────────────────────────────────────────────────── */

/**
 * Recursively evaluate a when_clause tree against state.
 * Returns false (not throw) on any structural error — Layer 2 must be
 * fail-soft so a malformed rule doesn't blow up the whole bar.
 */
export function evaluateWhenClause(clause: unknown, ctx: EvaluationContext): boolean {
  if (clause == null || typeof clause !== 'object') return false;
  const c = clause as Record<string, unknown>;

  if (c.type === 'all_of') {
    const conds = Array.isArray(c.conditions) ? c.conditions : [];
    // Empty all_of vacuously true; matches typical SQL semantics.
    return conds.every((sub) => evaluateWhenClause(sub, ctx));
  }
  if (c.type === 'any_of') {
    const conds = Array.isArray(c.conditions) ? c.conditions : [];
    return conds.some((sub) => evaluateWhenClause(sub, ctx));
  }
  if (c.type === 'not') {
    return !evaluateWhenClause(c.condition, ctx);
  }

  // Leaf — must have state_query + op.
  if (typeof c.state_query !== 'string' || typeof c.op !== 'string') return false;
  return evaluateLeaf(c as unknown as LeafClause, ctx);
}

/* ─────────────────────────────────────────────────────────────────
 * Leaf evaluation
 * ─────────────────────────────────────────────────────────────── */

function evaluateLeaf(leaf: LeafClause, ctx: EvaluationContext): boolean {
  const lhs = resolveStateValue(leaf.state_query, ctx);

  switch (leaf.op) {
    case 'is_null':
      return lhs == null;
    case 'is_not_null':
      return lhs != null;
    case '=':
      return looseEq(lhs, leaf.value);
    case '!=':
      return !looseEq(lhs, leaf.value);
    case '>':
      return numCompare(lhs, leaf.value, (a, b) => a > b);
    case '>=':
      return numCompare(lhs, leaf.value, (a, b) => a >= b);
    case '<':
      return numCompare(lhs, leaf.value, (a, b) => a < b);
    case '<=':
      return numCompare(lhs, leaf.value, (a, b) => a <= b);
    case 'in':
      return Array.isArray(leaf.value) && leaf.value.some((v) => looseEq(lhs, v));
    case 'not_in':
      return Array.isArray(leaf.value) && !leaf.value.some((v) => looseEq(lhs, v));
    case 'between':
      return betweenCompare(lhs, leaf.value);
    default:
      return false;
  }
}

/* ─────────────────────────────────────────────────────────────────
 * State-value resolver
 *
 * Order:
 *  1. Synthetic keys (time_of_day, day_of_week, is_weekend) — always win.
 *  2. Exact state[key] match (e.g., 'counselor.pending_leads').
 *  3. Dot-path traversal (e.g., 'counselor.pending_leads.count' splits into
 *     state['counselor.pending_leads'].count, then state['counselor'].pending_leads.count).
 * ─────────────────────────────────────────────────────────────── */

function resolveStateValue(key: string, ctx: EvaluationContext): unknown {
  // Synthetic keys always come from the time provider.
  const synthetic = resolveSyntheticKey(key, ctx);
  if (synthetic !== SYNTHETIC_MISS) return synthetic;

  // Exact match wins (most state-query keys ARE dotted, e.g., 'counselor.pending_leads').
  if (Object.prototype.hasOwnProperty.call(ctx.state, key)) {
    return (ctx.state as Record<string, unknown>)[key];
  }

  // Dot-path traversal: split by '.', look for longest prefix that exists in state,
  // then drill into the remainder.
  const parts = key.split('.');
  for (let i = parts.length - 1; i >= 1; i--) {
    const head = parts.slice(0, i).join('.');
    if (Object.prototype.hasOwnProperty.call(ctx.state, head)) {
      return drill((ctx.state as Record<string, unknown>)[head], parts.slice(i));
    }
  }

  // Last resort: top-level drill.
  return drill(ctx.state as unknown, parts);
}

function drill(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const segment of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[segment];
  }
  return cur;
}

const SYNTHETIC_MISS: unique symbol = Symbol('synthetic-miss');

function resolveSyntheticKey(key: string, ctx: EvaluationContext): unknown | typeof SYNTHETIC_MISS {
  if (key !== 'time_of_day' && key !== 'day_of_week' && key !== 'is_weekend') {
    return SYNTHETIC_MISS;
  }
  const d = ctx.nowIso ? new Date(ctx.nowIso) : new Date();
  if (Number.isNaN(d.getTime())) return SYNTHETIC_MISS;
  switch (key) {
    case 'time_of_day': {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    case 'day_of_week':
      return d.getDay();
    case 'is_weekend': {
      const dow = d.getDay();
      return dow === 0 || dow === 6;
    }
  }
  return SYNTHETIC_MISS;
}

/* ─────────────────────────────────────────────────────────────────
 * Comparison helpers
 * ─────────────────────────────────────────────────────────────── */

function looseEq(a: unknown, b: unknown): boolean {
  // Strict for non-primitives; loose only for number/string/boolean coercion-edge cases.
  if (a === b) return true;
  if (a == null || b == null) return false;
  // Treat number-vs-numeric-string as equal (rules can be edited as JSON strings).
  if (typeof a === 'number' && typeof b === 'string') return a === Number(b);
  if (typeof a === 'string' && typeof b === 'number') return Number(a) === b;
  return false;
}

function numCompare(
  lhs: unknown,
  rhs: unknown,
  cmp: (a: number, b: number) => boolean,
): boolean {
  // For `time_of_day` the lhs is 'HH:mm' string; allow string-compare on those.
  if (typeof lhs === 'string' && typeof rhs === 'string' && /^\d{2}:\d{2}$/.test(lhs) && /^\d{2}:\d{2}$/.test(rhs)) {
    return cmp(timeToMinutes(lhs), timeToMinutes(rhs));
  }
  const a = toNumber(lhs);
  const b = toNumber(rhs);
  if (a == null || b == null) return false;
  return cmp(a, b);
}

function betweenCompare(lhs: unknown, range: unknown): boolean {
  if (!Array.isArray(range) || range.length !== 2) return false;
  const [lo, hi] = range;
  // Time-of-day style strings allowed.
  if (
    typeof lhs === 'string' && /^\d{2}:\d{2}$/.test(lhs) &&
    typeof lo === 'string' && /^\d{2}:\d{2}$/.test(lo) &&
    typeof hi === 'string' && /^\d{2}:\d{2}$/.test(hi)
  ) {
    const v = timeToMinutes(lhs);
    return v >= timeToMinutes(lo) && v <= timeToMinutes(hi);
  }
  const v = toNumber(lhs);
  const a = toNumber(lo);
  const b = toNumber(hi);
  if (v == null || a == null || b == null) return false;
  return v >= a && v <= b;
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
}

function timeToMinutes(s: string): number {
  const [hh, mm] = s.split(':').map(Number);
  return hh * 60 + mm;
}

/* ─────────────────────────────────────────────────────────────────
 * Helper: extract all state_query keys mentioned in a clause tree.
 * Used by Layer 2 to decide which queries to fetch.
 * ─────────────────────────────────────────────────────────────── */

export function extractStateQueryKeys(clause: unknown): string[] {
  const keys = new Set<string>();
  walk(clause);
  return Array.from(keys);

  function walk(node: unknown): void {
    if (node == null || typeof node !== 'object') return;
    const c = node as Record<string, unknown>;
    if (c.type === 'all_of' || c.type === 'any_of') {
      const arr = Array.isArray(c.conditions) ? c.conditions : [];
      arr.forEach(walk);
      return;
    }
    if (c.type === 'not') {
      walk(c.condition);
      return;
    }
    if (typeof c.state_query === 'string') {
      // Synthetic keys are computed in-process, not fetched.
      const k = c.state_query;
      if (k !== 'time_of_day' && k !== 'day_of_week' && k !== 'is_weekend') {
        keys.add(k);
      }
    }
  }
}
