/**
 * The salary suggestion settings page's save path: one box per department, and
 * a blank box is saved as an ABSENT key, never 0 — "absent = no suggestion for
 * that department".
 *
 * formToRule is what the page sends; ruleForStorage is what the server stores
 * whatever the browser sent. Both are pure, so no browser is needed.
 *
 * Run: npx vitest run __tests__/hr/salary-suggestion-rule-form.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  EMPTY_RULE_FORM,
  formToRule,
  ruleForStorage,
  ruleToForm,
  type RuleForm,
} from '@/lib/hr/salary-suggestion-rule-form';
import { departmentRate, parseSalarySuggestionRule } from '@/lib/hr/salary-suggestion';

const X = 'abcdef12-1111-4111-8111-111111111111';
const Y = '22222222-2222-4222-8222-222222222222';

function form(over: Partial<RuleForm>): RuleForm {
  return { ...EMPTY_RULE_FORM, byDepartment: {}, ...over };
}

describe('the page: blank boxes are saved as absent, not 0', () => {
  it('an untouched form carries no amount at all', () => {
    const { rule, errors } = formToRule(form({}));
    expect(errors).toEqual([]);
    expect(rule).toEqual({});
  });

  it('only filled departments are saved; a blank box is left out', () => {
    const { rule, errors } = formToRule(form({ byDepartment: { [X]: '500', [Y]: '  ' } }));
    expect(errors).toEqual([]);
    expect(rule).toEqual({ per_year_by_department: { [X]: 500 } });
    expect(departmentRate(rule, Y)).toBeNull();
  });

  it('a typed 0 is kept as 0 (a year adds nothing there), unlike a blank', () => {
    const { rule } = formToRule(form({ byDepartment: { [X]: '0' } }));
    expect(rule.per_year_by_department).toEqual({ [X]: 0 });
  });

  it('commas, spaces and the rupee sign are ignored; paise are kept', () => {
    const { rule } = formToRule(form({ byDepartment: { [X]: '₹1,250.50' } }));
    expect(rule.per_year_by_department?.[X]).toBe(1250.5);
  });

  it('a negative or non-number amount is an error naming the department, not a blank', () => {
    const { errors } = formToRule(form({ byDepartment: { [X]: '-5', [Y]: 'abc' } }), {
      [X]: 'Physics (College A)',
    });
    expect(errors).toEqual([
      'The amount for Physics (College A) must be a number of rupees, 0 or more.',
      'The amount for a department must be a number of rupees, 0 or more.',
    ]);
  });

  it('round to: blank is the ₹100 default, 0 is an error', () => {
    expect(formToRule(form({ roundTo: '' })).rule.round_to).toBeUndefined();
    expect(formToRule(form({ roundTo: '500' })).rule.round_to).toBe(500);
    expect(formToRule(form({ roundTo: '0' })).errors[0]).toContain('more than 0');
  });

  it('upper-case ids from the browser are stored lower-case, as Postgres looks them up', () => {
    const { rule } = formToRule(form({ byDepartment: { [X.toUpperCase()]: '500' } }));
    expect(Object.keys(rule.per_year_by_department ?? {})).toEqual([X]);
  });

  it('a stored rule round-trips through the boxes', () => {
    const stored = { per_year_by_department: { [X]: 500, [Y]: 0 }, round_to: 500 };
    const back = formToRule(ruleToForm(stored)).rule;
    expect(back).toEqual(stored);
  });
});

describe('the server: what is stored, whatever the browser sent', () => {
  it('keeps only real department amounts', () => {
    expect(
      ruleForStorage({
        per_year_by_department: { [X]: 500, [Y]: '300', 'not-an-id': 5 },
        per_year_at_jkkn: 900,
        extras: [{ label: 'Doctorate', amount: 3000 }],
        cap_at_band_max: true,
      })
    ).toEqual({ per_year_by_department: { [X]: 500 } });
  });

  it('a rule with no department amount at all is stored as {} — the round-to box alone is not a rule', () => {
    expect(ruleForStorage({ round_to: 500 })).toEqual({});
    expect(ruleForStorage({})).toEqual({});
    expect(ruleForStorage('nonsense')).toEqual({});
  });

  it('what is stored reads back the same through the suggestion parser', () => {
    const stored = ruleForStorage({ per_year_by_department: { [X]: 250 }, round_to: 1000 });
    expect(parseSalarySuggestionRule(stored)).toEqual(stored);
  });
});
