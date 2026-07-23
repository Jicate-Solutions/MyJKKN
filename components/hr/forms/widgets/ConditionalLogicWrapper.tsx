/**
 * ConditionalLogicWrapper — gates a child widget based on prior answers.
 *
 * Wave 3 — M9 follow-up (builder UI + per-widget renderers).
 *
 * Evaluates a `ConditionalExpression` against the live submission values; if
 * the expression resolves truthy the child is rendered, otherwise nothing is.
 * Used by both the submission renderer (to hide irrelevant fields) and the
 * builder canvas preview (to visualize conditional behavior).
 */
'use client';

import type { ConditionalExpression } from '@/types/hr-forms';

interface ConditionalLogicWrapperProps {
  expression?: ConditionalExpression;
  /** All known answers keyed by widget.id → value. */
  values: Record<string, unknown>;
  children: React.ReactNode;
}

/**
 * Pure evaluator — exported separately so the submission renderer can use it
 * without rendering a wrapper element.
 */
export function evaluateConditional(
  expr: ConditionalExpression | undefined,
  values: Record<string, unknown>,
): boolean {
  if (!expr) return true;
  const lhs = values[expr.field_id];
  const rhs = expr.value;
  switch (expr.operator) {
    case 'eq':
      return lhs === rhs;
    case 'neq':
      return lhs !== rhs;
    case 'gt':
      return typeof lhs === 'number' && typeof rhs === 'number' && lhs > rhs;
    case 'lt':
      return typeof lhs === 'number' && typeof rhs === 'number' && lhs < rhs;
    case 'gte':
      return typeof lhs === 'number' && typeof rhs === 'number' && lhs >= rhs;
    case 'lte':
      return typeof lhs === 'number' && typeof rhs === 'number' && lhs <= rhs;
    case 'in':
      return Array.isArray(rhs) && (rhs as Array<unknown>).includes(lhs);
    case 'not_in':
      return Array.isArray(rhs) && !(rhs as Array<unknown>).includes(lhs);
    default:
      return true;
  }
}

export function ConditionalLogicWrapper({
  expression,
  values,
  children,
}: ConditionalLogicWrapperProps) {
  if (!evaluateConditional(expression, values)) return null;
  return <>{children}</>;
}
