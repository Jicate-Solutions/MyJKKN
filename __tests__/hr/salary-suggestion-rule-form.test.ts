/**
 * The salary suggestion rule editor's save path: a blank box is saved as an
 * ABSENT key, never 0 — the rule's whole contract is "absent = not set".
 *
 * formToRule is what the editor sends; ruleForStorage is what the server
 * stores whatever the browser sent. Both are pure, so no browser is needed.
 *
 * Run: npx vitest run __tests__/hr/salary-suggestion-rule-form.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  EMPTY_RULE_FORM,
  blankExtra,
  formToRule,
  ruleForStorage,
  ruleToForm,
  type RuleForm,
} from '@/lib/hr/salary-suggestion-rule-form';
import { isSalarySuggestionRuleEmpty, parseSalarySuggestionRule } from '@/lib/hr/salary-suggestion';

function form(over: Partial<RuleForm>): RuleForm {
  return { ...EMPTY_RULE_FORM, extras: [], ...over };
}

describe('the editor: blank boxes are saved as absent, not 0', () => {
  it('an untouched form carries no amount at all', () => {
    const { rule, errors } = formToRule(form({}));
    expect(errors).toEqual([]);
    expect('per_year_at_jkkn' in rule).toBe(false);
    expect('per_year_prior' in rule).toBe(false);
    expect('round_to' in rule).toBe(false);
    expect('extras' in rule).toBe(false);
    expect(isSalarySuggestionRuleEmpty(rule)).toBe(true);
  });

  it('whitespace-only boxes are blank too', () => {
    const { rule } = formToRule(form({ perYearAtJkkn: '   ', perYearPrior: ' ', roundTo: '' }));
    expect('per_year_at_jkkn' in rule).toBe(false);
    expect('per_year_prior' in rule).toBe(false);
  });

  it('a 0 typed on purpose is kept as 0', () => {
    const { rule } = formToRule(form({ perYearAtJkkn: '0' }));
    expect(rule.per_year_at_jkkn).toBe(0);
    expect(isSalarySuggestionRuleEmpty(rule)).toBe(false);
  });

  it('reads rupees typed with commas or a ₹ sign', () => {
    const { rule, errors } = formToRule(form({ perYearAtJkkn: '₹1,500', perYearPrior: '750' }));
    expect(errors).toEqual([]);
    expect(rule.per_year_at_jkkn).toBe(1500);
    expect(rule.per_year_prior).toBe(750);
  });

  it('refuses a figure that is not a number, or is negative, instead of guessing', () => {
    expect(formToRule(form({ perYearAtJkkn: 'abc' })).errors).toHaveLength(1);
    expect(formToRule(form({ perYearPrior: '-5' })).errors).toHaveLength(1);
    expect(formToRule(form({ roundTo: '0' })).errors).toHaveLength(1);
  });

  it('an extra with a blank amount is kept WITHOUT an amount key', () => {
    const { rule } = formToRule(
      form({ extras: [{ ...blankExtra(), label: 'Doctorate', source: 'doctorate', amount: '' }] })
    );
    expect(rule.extras).toHaveLength(1);
    expect('amount' in (rule.extras as object[])[0]).toBe(false);
  });

  it('a doctorate always needs the Director’s approval, whatever the switch says', () => {
    const { rule } = formToRule(
      form({
        extras: [{ ...blankExtra(), label: 'Doctorate', source: 'doctorate', amount: '3000', needsApproval: false }],
      })
    );
    expect(rule.extras?.[0].needs_approval).toBe(true);
  });

  it('research papers keep the least number only when it is a whole number of 1 or more', () => {
    const ok = formToRule(
      form({ extras: [{ ...blankExtra(), label: 'Papers', source: 'research_papers', amount: '500', minCount: '3', needsApproval: false }] })
    );
    expect(ok.rule.extras?.[0]).toMatchObject({ source: 'research_papers', amount: 500, min_count: 3, needs_approval: false });
    const bad = formToRule(
      form({ extras: [{ ...blankExtra(), label: 'Papers', source: 'research_papers', amount: '500', minCount: '0.5' }] })
    );
    expect(bad.errors).toHaveLength(1);
  });

  it('an unnamed item with an amount is an error; an unnamed empty one is dropped', () => {
    expect(formToRule(form({ extras: [{ ...blankExtra(), amount: '100' }] })).errors).toHaveLength(1);
    const dropped = formToRule(form({ extras: [blankExtra()] }));
    expect(dropped.errors).toEqual([]);
    expect('extras' in dropped.rule).toBe(false);
  });

  it('round-trips: what is stored comes back into the same boxes', () => {
    const f = form({
      perYearAtJkkn: '500',
      priorCounts: true,
      perYearPrior: '',
      extras: [{ label: 'Doctorate', source: 'doctorate', amount: '3000', minCount: '', needsApproval: true }],
    });
    const back = ruleToForm(ruleForStorage(formToRule(f).rule));
    expect(back.perYearAtJkkn).toBe('500');
    expect(back.perYearPrior).toBe('');
    expect(back.priorCounts).toBe(true);
    expect(back.extras[0]).toMatchObject({ label: 'Doctorate', amount: '3000', needsApproval: true });
  });
});

describe('the server: what is stored, whatever the browser sent', () => {
  it('a rule with no rupee amount is stored as {} — so a college row cannot hide the group-wide rule', () => {
    expect(ruleForStorage({ prior_counts: true, cap_at_band_max: false, round_to: 500 })).toEqual({});
    expect(ruleForStorage({ extras: [{ label: 'Doctorate', source: 'doctorate' }] })).toEqual({});
  });

  it('drops negatives, junk and unknown keys; keeps a deliberate 0', () => {
    const stored = ruleForStorage({
      per_year_at_jkkn: -10,
      per_year_prior: 0,
      surprise: 'x',
      round_to: 'nope',
    });
    expect(stored).toEqual({ per_year_prior: 0 });
  });

  it('stores an extra with no amount without an amount key, and forces approval on a doctorate', () => {
    const stored = ruleForStorage({
      per_year_at_jkkn: 100,
      extras: [
        { label: 'Doctorate', source: 'doctorate', amount: 3000, needs_approval: false },
        { label: 'Papers', source: 'research_papers' },
      ],
    });
    expect(stored.extras?.[0]).toMatchObject({ amount: 3000, needs_approval: true });
    expect('amount' in (stored.extras as object[])[1]).toBe(false);
    // And the suggestion reads the stored row back the same way.
    expect(parseSalarySuggestionRule(stored)?.extras?.[1].amount).toBeNull();
  });
});
