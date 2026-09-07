import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard: custom_roles has NO institution_id column and never has.
 *
 * The hand-written `CustomRole` type in types/auth.ts used to declare one. It
 * described a column that does not exist, so `role.institution_id` was always
 * undefined at runtime, and the phantom field made a query result impossible to
 * cast to `CustomRole` (TS2352 in user-roles-service.ts).
 *
 * Roles are cluster-wide. Scoping is expressed by institution_scope
 * ('all' | 'own') plus the role_has_institution_access() RLS helper — never by
 * a column on the role itself.
 */

const REPO = resolve(__dirname, '../../..');

function sliceInterface(source: string, name: string): string {
  const start = source.indexOf(`export interface ${name} {`);
  expect(start, `interface ${name} not found in types/auth.ts`).toBeGreaterThan(-1);
  const end = source.indexOf('\n}', start);
  expect(end, `unterminated interface ${name}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('custom_roles has no institution_id column', () => {
  const authTypes = readFileSync(resolve(REPO, 'types/auth.ts'), 'utf8');

  it('the generated custom_roles Row does not declare institution_id', () => {
    const generated = readFileSync(resolve(REPO, 'types/supabase.ts'), 'utf8');
    const start = generated.indexOf('      custom_roles: {');
    expect(start, 'custom_roles not found in types/supabase.ts').toBeGreaterThan(-1);

    // The Row block ends at the first Insert block after it.
    const rowBlock = generated.slice(start, generated.indexOf('Insert: {', start));
    expect(rowBlock).toContain('institution_scope');
    expect(rowBlock).not.toContain('institution_id');
  });

  it('CustomRole does not re-introduce the phantom institution_id field', () => {
    const block = sliceInterface(authTypes, 'CustomRole');
    expect(block).toContain('institution_scope');
    expect(block).not.toMatch(/^\s*institution_id\b/m);
  });

  it('CustomRoleCreate scopes with institution_scope, not institution_id', () => {
    const block = sliceInterface(authTypes, 'CustomRoleCreate');
    expect(block).toContain('institution_scope');
    expect(block).not.toMatch(/^\s*institution_id\b/m);
  });
});
