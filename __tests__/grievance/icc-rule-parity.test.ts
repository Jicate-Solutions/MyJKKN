// The ICC-only rule exists twice: isIccOnlyCategory (lib/instasolver/complaint.ts),
// which the InstaSolver route and the /accreditation form call, and
// fn_grievance_is_icc_only_category (migration 20270624093700), which the
// database applies to every insert whoever the writer. This keeps them one rule.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICC_CATEGORY_PATTERN, isIccOnlyCategory } from '@/lib/instasolver/complaint';

const ROOT = join(__dirname, '..', '..');
const MIGRATION = readFileSync(
  join(ROOT, 'supabase/migrations/20270624093700_grievance_complaint_privacy.sql'),
  'utf8'
);
const REHEARSAL = readFileSync(join(ROOT, 'supabase/tests/grievance/20_privacy.sql'), 'utf8');

function sqlPattern(): string {
  const fn = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.fn_grievance_is_icc_only_category(p_name text)'));
  const m = fn.match(/~\*\s*'([^']*)'/);
  if (!m) throw new Error('fn_grievance_is_icc_only_category has no ~* literal');
  return m[1];
}

function fixtures(): Array<[string, boolean]> {
  const start = REHEARSAL.indexOf('-- icc-rule-fixtures:begin');
  const end = REHEARSAL.indexOf('-- icc-rule-fixtures:end');
  if (start < 0 || end < start) throw new Error('fixture markers missing from 20_privacy.sql');
  const block = REHEARSAL.slice(start, end);
  return [...block.matchAll(/\('([^']*)',\s*(true|false)\)/g)].map((m) => [m[1], m[2] === 'true']);
}

describe('one ICC rule for every door', () => {
  it('the SQL regex is the TypeScript regex, with \\b written as \\y (Postgres word boundary)', () => {
    expect(sqlPattern()).toBe(ICC_CATEGORY_PATTERN.replace(/\\b/g, '\\y'));
  });

  it('the SQL match is case-insensitive, as the TypeScript one is', () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.fn_grievance_is_icc_only_category(p_name text)'));
    expect(fn).toMatch(/~\*\s*'/);
  });

  it('isIccOnlyCategory answers the same fixture names the database rehearsal checks', () => {
    const list = fixtures();
    expect(list.length).toBeGreaterThanOrEqual(10);
    for (const [name, expected] of list) {
      expect({ name, iccOnly: isIccOnlyCategory(name) }).toEqual({ name, iccOnly: expected });
    }
  });

  it('a missing category name is not ICC-only', () => {
    expect(isIccOnlyCategory(null)).toBe(false);
    expect(isIccOnlyCategory(undefined)).toBe(false);
  });

  it('the /accreditation form uses the shared rule, not its own substring', () => {
    const page = readFileSync(
      join(ROOT, 'app/(routes)/accreditation/naac/grievance/new/page.tsx'),
      'utf8'
    );
    expect(page).toContain('is_icc_only: isIccOnlyCategory(selectedCategory?.name)');
    expect(page).not.toMatch(/includes\('sexual harassment'\)/);
  });
});
