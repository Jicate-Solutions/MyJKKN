/**
 * The salary suggestion rule as the settings page holds it, and back.
 *
 * One amount box per department, and one "round to" box. Every box is held as
 * a STRING, and a blank box is saved as an ABSENT key — never 0. The rule's
 * whole contract is "absent = not set": a 0 typed on purpose means "a year at
 * JKKN adds nothing in this department", and a department nobody filled in
 * must not be mistaken for that — it gets no suggestion at all. Pure, so the
 * page's save path is testable without a browser.
 */

import {
  isSalarySuggestionRuleEmpty,
  parseSalarySuggestionRule,
  type SalarySuggestionRule,
} from '@/lib/hr/salary-suggestion';

export interface RuleForm {
  /** Department id (lower-case) → the text in its box. */
  byDepartment: Record<string, string>;
  roundTo: string;
}

export const EMPTY_RULE_FORM: RuleForm = { byDepartment: {}, roundTo: '' };

function toText(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? String(n) : '';
}

/** A stored rule (or nothing) → the boxes on screen. */
export function ruleToForm(raw: unknown): RuleForm {
  const rule = parseSalarySuggestionRule(raw);
  if (!rule) return { byDepartment: {}, roundTo: '' };
  const byDepartment: Record<string, string> = {};
  for (const [id, amount] of Object.entries(rule.per_year_by_department ?? {})) {
    byDepartment[id] = toText(amount);
  }
  return { byDepartment, roundTo: toText(rule.round_to) };
}

/** A typed box → a figure, or undefined when blank. NaN and negatives are errors, not blanks. */
function readAmount(text: string, what: string, errors: string[]): number | undefined {
  const t = text.replace(/[,\s₹]/g, '');
  if (t === '') return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`${what} must be a number of rupees, 0 or more.`);
    return undefined;
  }
  return n;
}

export interface FormToRuleResult {
  rule: SalarySuggestionRule;
  errors: string[];
}

/**
 * The boxes → the rule that is saved. Blank boxes are left out.
 * `names` (department id → name) only makes the error messages readable.
 */
export function formToRule(form: RuleForm, names: Record<string, string> = {}): FormToRuleResult {
  const errors: string[] = [];
  const rule: SalarySuggestionRule = {};

  const amounts: Record<string, number> = {};
  for (const [id, text] of Object.entries(form.byDepartment)) {
    const amount = readAmount(text, `The amount for ${names[id] ?? 'a department'}`, errors);
    if (amount !== undefined) amounts[id.toLowerCase()] = amount;
  }
  if (Object.keys(amounts).length > 0) rule.per_year_by_department = amounts;

  const roundTo = readAmount(form.roundTo, 'Round to', errors);
  if (roundTo !== undefined) {
    if (roundTo === 0) errors.push('Round to must be more than 0, or left blank for ₹100.');
    else rule.round_to = roundTo;
  }

  return { rule, errors };
}

/**
 * What is actually stored, whatever the browser sent: the rule re-read through
 * the same parser the suggestion uses, so an unknown key, a negative figure, a
 * figure that is not a number or a key that is not a department id never
 * reaches the database. A rule with no department amount at all is stored as
 * `{}` — "not set" either way, and the round-to box alone is not a rule.
 */
export function ruleForStorage(raw: unknown): SalarySuggestionRule {
  const rule = parseSalarySuggestionRule(raw) ?? {};
  if (isSalarySuggestionRuleEmpty(rule)) return {};
  return rule;
}
