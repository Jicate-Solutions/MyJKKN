/**
 * The TypeScript parser and the database must agree, case for case, on whether
 * a stored rule holds an amount.
 *
 * hr_salary_suggestion_inputs() decides WHICH row is a college's rule (its own,
 * else the group-wide one) with hr_salary_rule_has_amount(); the suggestion then
 * reads that row with parseSalarySuggestionRule(). If the parser were looser
 * than the database — a numeric string, a `{ value: {...} }` wrapper — a row the
 * database skipped could still be read as a rule somewhere else, and a row the
 * database chose could read as "rule not set" here. The cases below are the
 * same file supabase/tests/hr-salary-suggestion/run.sh feeds to Postgres 16.
 *
 * Run: npx vitest run __tests__/hr/salary-suggestion-rule-parity.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSalarySuggestionRuleEmpty, parseSalarySuggestionRule } from '@/lib/hr/salary-suggestion';

const CASES = JSON.parse(
  readFileSync(join(process.cwd(), 'supabase/tests/hr-salary-suggestion/rule-parity-cases.json'), 'utf8')
) as Array<{ case: string; value: unknown; has_amount: boolean }>;

describe('parseSalarySuggestionRule is exactly as strict as hr_salary_rule_has_amount()', () => {
  it('has the cases the database rehearsal runs', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(CASES.map((c) => [c.case, c.value, c.has_amount] as const))('%s', (_name, value, hasAmount) => {
    expect(isSalarySuggestionRuleEmpty(parseSalarySuggestionRule(value))).toBe(!hasAmount);
  });
});
