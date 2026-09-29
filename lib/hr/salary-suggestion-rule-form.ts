/**
 * The salary suggestion rule as the editor holds it, and back.
 *
 * Every box is held as a STRING, and a blank box is saved as an ABSENT key —
 * never 0. The rule's whole contract is "absent = not set": a 0 typed on
 * purpose means "counts nothing", and a box nobody filled in must not be
 * mistaken for that. Pure, so the editor's save path is testable without a
 * browser.
 */

import {
  isSalarySuggestionRuleEmpty,
  parseSalarySuggestionRule,
  type SalarySuggestionRule,
  type SuggestionExtra,
} from '@/lib/hr/salary-suggestion';

export interface RuleFormExtra {
  label: string;
  source: string;
  amount: string;
  minCount: string;
  needsApproval: boolean;
}

export interface RuleForm {
  perYearAtJkkn: string;
  perYearPrior: string;
  priorCounts: boolean;
  capAtBandMax: boolean;
  roundTo: string;
  extras: RuleFormExtra[];
}

export const EMPTY_RULE_FORM: RuleForm = {
  perYearAtJkkn: '',
  perYearPrior: '',
  priorCounts: false,
  capAtBandMax: true,
  roundTo: '',
  extras: [],
};

export function blankExtra(): RuleFormExtra {
  return { label: '', source: 'doctorate', amount: '', minCount: '', needsApproval: true };
}

function toText(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? String(n) : '';
}

/** A stored rule (or nothing) → the boxes on screen. */
export function ruleToForm(raw: unknown): RuleForm {
  const rule = parseSalarySuggestionRule(raw);
  if (!rule) return { ...EMPTY_RULE_FORM, extras: [] };
  return {
    perYearAtJkkn: toText(rule.per_year_at_jkkn),
    perYearPrior: toText(rule.per_year_prior),
    priorCounts: rule.prior_counts === true,
    capAtBandMax: rule.cap_at_band_max !== false,
    roundTo: toText(rule.round_to),
    extras: (rule.extras ?? []).map((e) => ({
      label: e.label,
      source: e.source,
      amount: toText(e.amount),
      minCount: toText(e.min_count),
      needsApproval: e.source === 'doctorate' ? true : e.needs_approval === true,
    })),
  };
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
 * The boxes → the rule that is saved. Blank boxes are left out. The switches
 * are always saved, because a switch has no blank state: what is on screen is
 * a decision.
 */
export function formToRule(form: RuleForm): FormToRuleResult {
  const errors: string[] = [];
  const rule: SalarySuggestionRule = {};

  const perYear = readAmount(form.perYearAtJkkn, 'Amount per year at JKKN', errors);
  if (perYear !== undefined) rule.per_year_at_jkkn = perYear;
  const perPrior = readAmount(form.perYearPrior, 'Amount per year before JKKN', errors);
  if (perPrior !== undefined) rule.per_year_prior = perPrior;
  rule.prior_counts = form.priorCounts;
  rule.cap_at_band_max = form.capAtBandMax;

  const roundTo = readAmount(form.roundTo, 'Round to', errors);
  if (roundTo !== undefined) {
    if (roundTo === 0) errors.push('Round to must be more than 0, or left blank for ₹100.');
    else rule.round_to = roundTo;
  }

  const extras: SuggestionExtra[] = [];
  form.extras.forEach((e, i) => {
    const label = e.label.trim();
    const amount = readAmount(e.amount, `Extra ${i + 1} amount`, errors);
    if (label === '') {
      if (e.amount.trim() !== '') errors.push(`Extra ${i + 1} needs a name.`);
      return;
    }
    const extra: SuggestionExtra = { label, source: e.source, amount: amount ?? null };
    if (e.source === 'research_papers') {
      const min = readAmount(e.minCount, `Extra ${i + 1} least number of papers`, errors);
      if (min !== undefined) {
        if (!Number.isInteger(min) || min < 1) errors.push(`Extra ${i + 1} least number of papers must be a whole number, 1 or more.`);
        else extra.min_count = min;
      }
    }
    // A doctorate always needs the Director's approval (his ruling of 18 Sep 2026).
    extra.needs_approval = e.source === 'doctorate' ? true : e.needsApproval;
    if (extra.amount === null) delete (extra as Partial<SuggestionExtra>).amount;
    extras.push(extra);
  });
  if (extras.length > 0) rule.extras = extras;

  return { rule, errors };
}

/**
 * What is actually stored, whatever the browser sent: the rule re-read through
 * the same parser the suggestion uses, so an unknown key, a negative figure or
 * a figure that is not a number never reaches the database, and an item with
 * no amount is stored WITHOUT an amount rather than with 0 or null. A doctorate
 * always needs the Director's approval, whatever the request said.
 *
 * A rule that holds no rupee amount at all — every box blank, only the switches
 * on screen — is stored as `{}`. It is "not set" to the suggestion either way,
 * and storing the switches would make a college's blank row look like a rule
 * of its own and hide the group-wide one (hr_salary_suggestion_inputs applies
 * the same "has an amount" test for rows written some other way).
 */
export function ruleForStorage(raw: unknown): SalarySuggestionRule {
  const rule = parseSalarySuggestionRule(raw) ?? {};
  if (isSalarySuggestionRuleEmpty(rule)) return {};
  const out: SalarySuggestionRule = { ...rule };
  if (rule.extras) {
    out.extras = rule.extras.map((e) => {
      const extra: Partial<SuggestionExtra> = { ...e };
      if (e.source === 'doctorate') extra.needs_approval = true;
      if (e.amount === null) delete extra.amount;
      return extra as SuggestionExtra;
    });
  }
  return out;
}
