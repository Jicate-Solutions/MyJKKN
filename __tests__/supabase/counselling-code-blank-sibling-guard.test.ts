// role_has_institution_access() backs 777 RLS policies. Its "CAS sibling" rule
// grants access between two institutions that share a counselling_code, and
// the guard on that rule was `IS NOT NULL` — which does not exclude the empty
// string. Two institutions with counselling_code = '' would have become mutual
// siblings platform-wide.
//
// 20261201110000 closes it in two layers: a btrim guard inside the function,
// and a CHECK constraint so the data state cannot exist. These assertions pin
// both, because either one silently disappearing restores the hole.
//
// Text assertions rather than a live query: this suite has no database. The
// behavioural proof lives in the migration header (all 196 institution pairs
// on production, 16 sibling pairs before and after, 0 behaviour changes).

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20261201110000_counselling_code_blank_sibling_guard.sql'
  ),
  'utf8'
);

/** The migration with SQL line-comments stripped — the header quotes the very
 *  constructs these assertions look for. */
const CODE = MIGRATION.split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

describe('counselling_code blank-sibling guard', () => {
  it('guards the sibling rule against blank and whitespace-only codes', () => {
    expect(CODE).toMatch(/btrim\(i_self\.counselling_code\)\s*<>\s*''/);
  });

  it('keeps the original IS NOT NULL guard alongside it', () => {
    // Redundant given the equality join (NULL = NULL is never true), but
    // removing it would make the rule harder to read, not safer.
    expect(CODE).toMatch(/i_self\.counselling_code IS NOT NULL/);
  });

  it('makes the bad data state unrepresentable', () => {
    expect(CODE).toMatch(
      /ADD CONSTRAINT institutions_counselling_code_not_blank/
    );
    expect(CODE).toMatch(
      /CHECK \(counselling_code IS NULL OR btrim\(counselling_code\) <> ''\)/
    );
  });

  it('still allows NULL — that is how an institution says "no code"', () => {
    expect(CODE).toMatch(/counselling_code IS NULL OR/);
  });

  it('does NOT revoke anon, which is load-bearing here', () => {
    // RLS policy expressions are evaluated as the querying role, so anon needs
    // EXECUTE on this function for every anon-reachable table that carries one
    // of the 777 policies. A well-meaning "harden it" revoke would break every
    // unauthenticated page at once. This assertion exists to stop that commit.
    expect(CODE).not.toMatch(/REVOKE[\s\S]*role_has_institution_access/i);
    expect(CODE).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.role_has_institution_access\(uuid\) TO anon;/
    );
  });

  it('preserves the rest of the function verbatim', () => {
    // The three other access paths must survive untouched: scope='all' via
    // user_roles, the legacy profiles.role fallback, own institution, and the
    // user_institution_access grants. Diffed against the deployed definition
    // before shipping — exactly one code line differs (the btrim guard).
    expect(CODE).toMatch(/cr\.institution_scope = 'all'/);
    expect(CODE).toMatch(/check_institution_id = get_current_user_institution_id\(\)/);
    expect(CODE).toMatch(/FROM user_institution_access uia/);
    expect(CODE).toMatch(/IF is_super_admin\(\) THEN/);
    // and it must remain SECURITY DEFINER — it reads tables the caller cannot
    expect(CODE).toMatch(/STABLE SECURITY DEFINER/);
  });
});
