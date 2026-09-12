// Global record search decides, per entity, whether the caller may see a row.
// The permission key behind that decision is written in TWO places:
//
//   1. supabase/migrations/20261201090000_global_record_search.sql
//      — user_has_permission('<key>') inside fn_global_record_search
//   2. lib/sidebarMenuLink.ts
//      — MENU_PERMISSIONS for the detail route the hit links to
//
// If they drift apart, the palette offers a result and the destination then
// refuses it — a hit you cannot open, which reads to a user as a broken link
// rather than as a permission boundary.
//
// RECORD_ENTITIES deliberately does NOT carry a third copy of the key; this
// test derives it from the route map instead. Two files in two different
// languages, and nothing but this test keeps them honest.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  RECORD_ENTITIES,
  RECORD_ENTITY_ORDER,
  groupRecordHits,
  isRecordEntity,
  type RecordEntity,
  type RecordHit,
} from '@/lib/navigation/record-search';
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';

// The CURRENT definition of the function. 20261201090000 created it as
// SECURITY DEFINER, which was a confidentiality defect (it bypassed RLS and
// substituted a simpler check); 20261201100000 re-issues it as SECURITY
// INVOKER. These assertions must track the LATEST definition — pinned to the
// superseded file, this suite would have gone on certifying the vulnerable
// version, green, forever.
const MIGRATION = readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20261201100000_global_record_search_security_invoker.sql'
  ),
  'utf8'
);

/**
 * The migration with SQL line-comments removed.
 *
 * The header explains the defect and necessarily QUOTES the very constructs
 * these assertions count — user_has_permission('<key>'), and
 * role_has_institution_access(). Counting the raw file therefore counts the
 * prose as if it were code.
 */
const MIGRATION_CODE = MIGRATION.split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

const ENTITIES = Object.keys(RECORD_ENTITIES) as RecordEntity[];

/**
 * Nearest mapped ancestor of a route.
 *
 * Not every detail route has its own MENU_PERMISSIONS row: '/staff/list/[id]'
 * and '/courses/[id]' inherit from '/staff/list' and '/courses'. Walking up is
 * what the permission model actually does, so the test models that rather than
 * demanding an exact row that the codebase has deliberately not written.
 */
function resolveRoutePermission(route: string): string | undefined {
  const map = MENU_PERMISSIONS as Record<string, string>;
  const segments = route.split('/').filter(Boolean);
  for (let i = segments.length; i > 0; i--) {
    const candidate = '/' + segments.slice(0, i).join('/');
    if (map[candidate]) return map[candidate];
  }
  return undefined;
}

describe('global record search — permission key agreement', () => {
  it.each(ENTITIES)('%s: the detail route maps to a permission at all', (entity) => {
    // href('[id]') yields the ROUTE TEMPLATE, which is how MENU_PERMISSIONS
    // spells dynamic segments.
    const routeTemplate = RECORD_ENTITIES[entity].href('[id]');
    expect(resolveRoutePermission(routeTemplate)).toBeTruthy();
  });

  it.each(ENTITIES)(
    '%s: the migration gates on the key that route resolves to',
    (entity) => {
      const routeTemplate = RECORD_ENTITIES[entity].href('[id]');
      const expected = resolveRoutePermission(routeTemplate);
      expect(MIGRATION).toContain(`user_has_permission('${expected}')`);
    }
  );

  it('gates every entity the migration searches — no silent extra table', () => {
    // Count the permission gates in the function body. A future edit that adds
    // a fifth entity to the SQL without adding it here would leave a category
    // of record searchable that the frontend cannot route or label.
    const gates = MIGRATION_CODE.match(/user_has_permission\('[^']+'\)/g) ?? [];
    expect(gates).toHaveLength(ENTITIES.length);
  });

  it('locks the function against anon', () => {
    // Supabase grants EXECUTE to anon by default on every new function, and
    // CREATE OR REPLACE does not reset that.
    expect(MIGRATION).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_global_record_search\(text, integer\) FROM anon, PUBLIC;/
    );
    expect(MIGRATION).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.fn_global_record_search\(text, integer\) TO authenticated;/
    );
  });

  it('is SECURITY INVOKER, so RLS stays the authority', () => {
    // THE REGRESSION GUARD FOR THE 2026-09-12 DEFECT.
    // SECURITY DEFINER here does not ADD a check, it REPLACES each table's RLS
    // policy — and those policies are far richer than anything reproduced in
    // this function. admission_leads additionally requires an allowlist and
    // excludes strict counsellors; staff switches on a scope tier that
    // includes 'own_records' (profile_id = auth.uid()), which
    // role_has_institution_access() cannot express at all. Measured live:
    // a staff_counselor with 0 RLS-readable leads was returned 10 of them,
    // names and phone numbers included.
    expect(MIGRATION).toMatch(/\bSECURITY INVOKER\b/);
    expect(MIGRATION).not.toMatch(/^\s*SECURITY DEFINER\b/m);
  });

  it('does not re-implement institution scoping in the predicates', () => {
    // role_has_institution_access() inside the query body is the shape of the
    // original bug: a second, simpler authorization rule competing with the
    // policy RLS actually applies. Mentions in COMMENTS are fine and expected
    // (the migration explains why it was removed); a call in a WHERE clause is
    // not.
    expect(MIGRATION_CODE).not.toMatch(/role_has_institution_access\s*\(/);
  });

  it('excludes NULL-institution rows in every entity block', () => {
    // Some table policies permit a NULL institution_id, and 3
    // learners_profiles rows have one. Search should not surface orphan rows
    // platform-wide, so each block carries its own IS NOT NULL guard.
    const guards = MIGRATION_CODE.match(/\.institution_id IS NOT NULL/g) ?? [];
    expect(guards).toHaveLength(ENTITIES.length);
  });
});

describe('groupRecordHits', () => {
  const hit = (entity: RecordEntity, title: string): RecordHit => ({
    entity,
    recordId: `${entity}-${title}`,
    title,
    subtitle: null,
    institutionName: null,
    matchRank: 0,
  });

  it('groups by entity in the declared display order', () => {
    // Deliberately out of order on the way in.
    const groups = groupRecordHits([
      hit('course', 'Anatomy'),
      hit('learner', 'Priya'),
      hit('lead', 'Kavin'),
      hit('staff', 'Ravi'),
    ]);
    expect(groups.map((g) => g.entity)).toEqual(RECORD_ENTITY_ORDER);
  });

  it('omits entities with no hits rather than rendering empty headings', () => {
    const groups = groupRecordHits([hit('learner', 'Priya')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entity).toBe('learner');
  });

  it('preserves the order the database returned within a group', () => {
    const groups = groupRecordHits([
      hit('learner', 'Aarav'),
      hit('learner', 'Bhavna'),
    ]);
    expect(groups[0].hits.map((h) => h.title)).toEqual(['Aarav', 'Bhavna']);
  });

  it('returns nothing for no hits', () => {
    expect(groupRecordHits([])).toEqual([]);
  });
});

describe('isRecordEntity', () => {
  it.each(ENTITIES)('accepts %s', (entity) => {
    expect(isRecordEntity(entity)).toBe(true);
  });

  it('rejects an entity this build cannot route', () => {
    // Guards the forward-compatibility case: a later migration adds an entity
    // before the frontend knows how to render it.
    expect(isRecordEntity('invoice')).toBe(false);
    expect(isRecordEntity(null)).toBe(false);
    expect(isRecordEntity(undefined)).toBe(false);
    expect(isRecordEntity(42)).toBe(false);
  });
});
