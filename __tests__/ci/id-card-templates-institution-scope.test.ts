/**
 * id_card_templates must stay scoped per institution.
 *
 * The table shipped in 20260507150000 WITH an institution_id column and not one
 * of its four authenticated policies gated on it, so whoever held
 * id_cards.templates.* held it over every college's card design. These tests
 * pin the repair so a later regeneration of these policies cannot quietly drop
 * the predicate again — which is exactly how the hole opened the first time.
 *
 * Deliberately placed in __tests__/ci: that is one of the few directories the
 * workflows actually name, so this file runs rather than sitting dark.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION = path.resolve(
  process.cwd(),
  'supabase/migrations/20261012000000_id_card_templates_institution_scope.sql'
);
const POLICIES = path.resolve(process.cwd(), 'supabase/setup/03_policies.sql');

const migration = readFileSync(MIGRATION, 'utf8');
const policies = readFileSync(POLICIES, 'utf8');

/** Strip line and block comments so a commented-out clause can never satisfy an assertion. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
}

/** The body of one CREATE POLICY statement, comments removed. */
function policyBody(sql: string, name: string): string {
  const live = stripComments(sql);
  const start = live.indexOf(`CREATE POLICY "${name}"`);
  expect(start, `CREATE POLICY "${name}" not found`).toBeGreaterThan(-1);
  const end = live.indexOf(';', start);
  expect(end, `unterminated CREATE POLICY "${name}"`).toBeGreaterThan(start);
  return live.slice(start, end);
}

const CASES = [
  { policy: 'id_card_templates_view', key: 'id_cards.templates.view' },
  { policy: 'id_card_templates_create', key: 'id_cards.templates.create' },
  { policy: 'id_card_templates_edit', key: 'id_cards.templates.edit' },
  { policy: 'id_card_templates_delete', key: 'id_cards.templates.delete' },
] as const;

describe('id_card_templates RLS is scoped per institution', () => {
  it.each(CASES)(
    '$policy gates on role_has_institution_access(institution_id)',
    ({ policy }) => {
      const body = policyBody(migration, policy);
      expect(body).toContain('role_has_institution_access(institution_id)');
    }
  );

  it.each(CASES)(
    '$policy pairs the institution check with its own permission key, not a bare OR',
    ({ policy, key }) => {
      const body = policyBody(migration, policy);
      // The predicate must read `user_has_permission('<key>') AND role_has_...`.
      // An OR here would re-open the hole while still mentioning the function.
      const paired = new RegExp(
        `user_has_permission\\('${key.replace(/\./g, '\\.')}'\\)\\s*\\)?\\s*AND\\s*public\\.role_has_institution_access\\(institution_id\\)`
      );
      expect(body).toMatch(paired);
    }
  );

  it('UPDATE scopes WITH CHECK as well as USING, so a row cannot be re-parented out of reach', () => {
    const body = policyBody(migration, 'id_card_templates_edit');
    const occurrences = body.match(/role_has_institution_access\(institution_id\)/g) ?? [];
    expect(occurrences.length).toBe(2);
    expect(body).toContain('WITH CHECK');
  });

  it('keeps the initplan (SELECT fn()) wrapping applied estate-wide by rls_initplan_wrap_sweep', () => {
    // role_has_institution_access takes a per-row column and is correctly NOT
    // wrapped; the three argument-free helpers must stay wrapped or the sweep's
    // per-statement evaluation silently becomes per-row again.
    for (const { policy } of CASES) {
      const body = policyBody(migration, policy);
      expect(body).toContain('(SELECT public.is_super_admin())');
      expect(body).toContain('(SELECT public.is_admin())');
      expect(body).toMatch(/\(SELECT public\.user_has_permission\(/);
      expect(body).not.toMatch(/\(SELECT public\.role_has_institution_access\(/);
    }
  });

  it('is marked FILE ONLY and carries no BEGIN/COMMIT, so a reviewer rollback rehearsal rolls back', () => {
    expect(migration).toContain('NOT YET APPLIED — FILE ONLY');
    expect(migration).not.toMatch(/^\s*BEGIN;\s*$/m);
    expect(migration).not.toMatch(/^\s*COMMIT;\s*$/m);
  });

  it('guards with RAISE EXCEPTION rather than NOTICE — a silent guard is no guard', () => {
    expect(migration).toContain('RAISE EXCEPTION');
    expect(migration).not.toContain('RAISE NOTICE');
  });

  it('mirrors the same four scoped policies into supabase/setup/03_policies.sql', () => {
    for (const { policy } of CASES) {
      const body = policyBody(policies, policy);
      expect(body).toContain('role_has_institution_access(institution_id)');
    }
  });

  it('records the NULL-institution hole rather than leaving it undocumented', () => {
    // role_has_institution_access(NULL) returns TRUE by design and
    // institution_id is nullable, so a NULL-institution row stays global.
    // If someone later makes the column NOT NULL this note should be revisited,
    // which is precisely why it is pinned here.
    expect(migration).toMatch(/role_has_institution_access\(NULL\) returns TRUE/);
  });
});
