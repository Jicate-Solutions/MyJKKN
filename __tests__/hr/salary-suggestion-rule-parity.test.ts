/**
 * The TypeScript parser and the database must agree, case for case, on the
 * amount a stored rule holds for a department, and on its rounding step.
 *
 * hr_salary_suggestion_inputs() hands the server only
 * hr_salary_rule_department_rate(rule, the person's department) and
 * hr_salary_rule_round_to(rule); the settings page reads the same row with
 * parseSalarySuggestionRule(). If the two disagreed — a numeric string, an
 * upper-case key, a `{ value: {...} }` wrapper — the page could show an amount
 * the suggestion never uses, or the reverse. The cases below are the same file
 * supabase/tests/hr-salary-suggestion/run.sh feeds to PostgreSQL 16.
 *
 * Run: npx vitest run __tests__/hr/salary-suggestion-rule-parity.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { departmentRate, parseSalarySuggestionRule } from '@/lib/hr/salary-suggestion';

const CASES = JSON.parse(
  readFileSync(join(process.cwd(), 'supabase/tests/hr-salary-suggestion/rule-parity-cases.json'), 'utf8')
) as Array<{ case: string; value: unknown; department_id: string | null; rate: number | null; round_to: number | null }>;

describe('parseSalarySuggestionRule matches hr_salary_rule_department_rate() and hr_salary_rule_round_to()', () => {
  it('has the cases the database rehearsal runs', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(CASES.map((c) => [c.case, c] as const))('%s', (_name, c) => {
    const rule = parseSalarySuggestionRule(c.value);
    expect(departmentRate(rule, c.department_id)).toBe(c.rate);
    expect(rule?.round_to ?? null).toBe(c.round_to);
  });
});
