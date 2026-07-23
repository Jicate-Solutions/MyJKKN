// lib/services/meetings/routing-rule-evaluator.ts
//
// Routing Forms [M1] — the PURE rule-evaluation core (Calendly parity).
//
// Given a visitor's answers and an ordered list of routing rules, decide which
// destination they land on:
//   1. Non-default rules are tried in order_index ASC; FIRST match wins.
//   2. A rule matches when its conditions satisfy match_logic ('all' = every
//      condition true; 'any' = at least one true).
//   3. If NO non-default rule matches, the is_default rule's destination is used.
//   4. If there is no default rule either, the result is null (caller must
//      surface an explicit "no destination" state — never fail silently, rule #27).
//
// NO DB, NO CLOCK, NO I/O — every input is passed in. This is the unit-tested
// heart of the feature; the public route handler and the admin preview both
// call evaluateRouting() so behaviour can never drift between them.

export type RoutingFieldType = 'text' | 'select' | 'multiselect';
export type RoutingOperator = 'is' | 'is_not' | 'contains';
export type RoutingDestinationType = 'event_link' | 'url' | 'message';

/** One field on the form. */
export interface RoutingField {
  key: string;
  label: string;
  type: RoutingFieldType;
  options?: string[];
  required?: boolean;
}

/** One condition inside a rule. */
export interface RoutingCondition {
  field_key: string;
  operator: RoutingOperator;
  value: string;
}

/** A rule: IF (conditions, combined by match_logic) THEN destination. */
export interface RoutingRule {
  id: string;
  order_index: number;
  match_logic: 'all' | 'any';
  conditions: RoutingCondition[];
  destination_type: RoutingDestinationType;
  destination_value: RoutingDestinationValue;
  is_default: boolean;
}

/** Shape varies by destination_type: {url} or {markdown}. */
export interface RoutingDestinationValue {
  url?: string;
  markdown?: string;
  [k: string]: unknown;
}

/** A visitor answer is a single string (text/select) or an array (multiselect). */
export type RoutingAnswer = string | string[];
export type RoutingAnswers = Record<string, RoutingAnswer>;

export interface ResolvedDestination {
  type: RoutingDestinationType;
  value: RoutingDestinationValue;
}

export interface RoutingResult {
  /** The rule that decided the outcome, or null when nothing (not even a default) matched. */
  rule: RoutingRule | null;
  /** The destination to send the visitor to, or null when there is no destination. */
  destination: ResolvedDestination | null;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Normalise an answer to the array of selected/entered string values. */
function answerValues(answer: RoutingAnswer | undefined): string[] {
  if (answer == null) return [];
  if (Array.isArray(answer)) return answer.map((v) => String(v));
  return [String(answer)];
}

const ci = (s: string) => s.trim().toLowerCase();

/**
 * Evaluate ONE condition against the answers.
 *
 *   is       — the answer set contains an EXACT (case-insensitive) match of value.
 *   is_not   — the answer set does NOT contain value (vacuously true when empty).
 *   contains — some answer value contains value as a substring (case-insensitive).
 *
 * Multiselect answers are handled naturally: 'is' is satisfied if ANY selected
 * option equals value; 'is_not' requires NONE of them to equal value.
 */
export function evaluateCondition(
  condition: RoutingCondition,
  answers: RoutingAnswers,
): boolean {
  const values = answerValues(answers[condition.field_key]);
  const target = ci(condition.value);

  switch (condition.operator) {
    case 'is':
      return values.some((v) => ci(v) === target);
    case 'is_not':
      return !values.some((v) => ci(v) === target);
    case 'contains':
      return values.some((v) => ci(v).includes(target));
    default:
      // Unknown operator never matches — defensive (DB CHECK should prevent this).
      return false;
  }
}

/** Does a rule (its conditions, combined by match_logic) match the answers? */
export function evaluateRule(rule: RoutingRule, answers: RoutingAnswers): boolean {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  // A non-default rule with no conditions is treated as a catch-all (always true);
  // the default rule is handled separately and never reaches here.
  if (conditions.length === 0) return true;

  if (rule.match_logic === 'any') {
    return conditions.some((c) => evaluateCondition(c, answers));
  }
  // 'all' (default): every condition must be true.
  return conditions.every((c) => evaluateCondition(c, answers));
}

/**
 * First-match-wins routing with a default fallback.
 * Rules are sorted defensively here so callers don't depend on input ordering.
 */
export function evaluateRouting(
  answers: RoutingAnswers,
  rules: RoutingRule[],
): RoutingResult {
  const safeRules = Array.isArray(rules) ? rules : [];

  const ordered = safeRules
    .filter((r) => !r.is_default)
    .slice()
    .sort((a, b) => a.order_index - b.order_index);

  for (const rule of ordered) {
    if (evaluateRule(rule, answers)) {
      return {
        rule,
        destination: { type: rule.destination_type, value: rule.destination_value },
      };
    }
  }

  const defaultRule = safeRules.find((r) => r.is_default) ?? null;
  if (defaultRule) {
    return {
      rule: defaultRule,
      destination: {
        type: defaultRule.destination_type,
        value: defaultRule.destination_value,
      },
    };
  }

  return { rule: null, destination: null };
}
