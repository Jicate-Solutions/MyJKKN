// ============================================================================
// The route -> permission-key resolver behind the Director's hand-over control.
//
// These assertions run against the REAL MENU_PERMISSIONS map (via routeMatcher)
// rather than a fixture. That is on purpose. A fixture would prove the resolver
// agrees with a map I wrote, which is a test that encodes my own understanding
// and certifies nothing (feedback_a_test_can_encode_your_own_misunderstanding).
// Reading production entries means a key that gets renamed out from under this
// feature fails here instead of in a Director's hands.
// ============================================================================

import { describe, it, expect } from 'vitest';

import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import {
  ACCESS_LEVELS,
  deriveHandoverTitle,
  keyAllowedAtLevel,
  keysNotAllowedAtLevel,
  lowestLevelThatCarries,
  normalizePathname,
  resolveRoutePermissionKeys,
} from '@/components/director-desk/route-permission-resolver';

describe('resolveRoutePermissionKeys', () => {
  describe('exact match on the route', () => {
    it('resolves a plain route to the key MENU_PERMISSIONS declares for it', () => {
      const result = resolveRoutePermissionKeys('/learners');
      expect(result.keys).toEqual([MENU_PERMISSIONS['/learners']]);
      expect(result.keys).toEqual(['learners.profiles.view']);
      expect(result.inherited).toBe(false);
    });

    it('prefers the deeper exact entry over its parent', () => {
      // '/users' and '/users/[id]/edit' both exist; the deeper one must win or
      // an edit page would be handed over as a read.
      const view = resolveRoutePermissionKeys('/foundation');
      const deeper = resolveRoutePermissionKeys('/foundation/practice');
      expect(view.keys).toEqual(['foundation.dashboard.view']);
      expect(deeper.keys).toEqual(['foundation.practice.take']);
    });

    it('ignores a query string and a trailing slash', () => {
      expect(resolveRoutePermissionKeys('/learners/?tab=all#top').keys).toEqual([
        'learners.profiles.view',
      ]);
    });
  });

  describe('dynamic segments — match the pattern, not the literal id', () => {
    it('resolves a uuid segment through the [id] entry', () => {
      const result = resolveRoutePermissionKeys(
        '/users/3f9a1c22-5d4e-4b17-9f0a-2c6e8b1d4a77/edit'
      );
      expect(result.keys).toEqual([MENU_PERMISSIONS['/users/[id]/edit']]);
      expect(result.keys).toEqual(['users.edit']);
    });

    it('resolves a numeric segment through the same entry', () => {
      expect(resolveRoutePermissionKeys('/users/1042/edit').keys).toEqual(['users.edit']);
    });

    it('resolves a slug segment through the same entry', () => {
      expect(resolveRoutePermissionKeys('/users/some-slug/edit').keys).toEqual([
        'users.edit',
      ]);
    });

    it('gives the id-level key when the route stops at the dynamic segment', () => {
      expect(resolveRoutePermissionKeys('/users/1042').keys).toEqual([
        MENU_PERMISSIONS['/users/[id]'],
      ]);
      expect(resolveRoutePermissionKeys('/users/1042').keys).toEqual(['users.view']);
    });

    it('never writes the literal id into the resolved key', () => {
      const id = '3f9a1c22-5d4e-4b17-9f0a-2c6e8b1d4a77';
      const result = resolveRoutePermissionKeys(`/users/${id}/edit`);
      expect(result.keys.join(' ')).not.toContain(id);
    });
  });

  describe('deeper routes inherit the nearest declared key', () => {
    it('falls back to the section key and says so', () => {
      // No entry for a per-employee documents tab; the page gate resolves it to
      // the section's key, so the handover must carry exactly that.
      const result = resolveRoutePermissionKeys('/hr/employees/1042/documents');
      expect(result.keys).toEqual([MENU_PERMISSIONS['/hr/employees/[id]']]);
      expect(result.inherited).toBe(true);
      expect(result.matchedAt).not.toBeNull();
      expect(result.matchedAt).not.toEqual('/hr/employees/1042/documents');
    });
  });

  describe('no entry found', () => {
    it('returns no keys for a route the map does not cover', () => {
      const result = resolveRoutePermissionKeys('/definitely-not-a-real-module-xyz');
      expect(result.keys).toEqual([]);
      expect(result.matchedAt).toBeNull();
      expect(result.inherited).toBe(false);
    });

    it('returns no keys for a deep route under an uncovered top level', () => {
      const result = resolveRoutePermissionKeys('/definitely-not-a-real-module-xyz/a/b');
      expect(result.keys).toEqual([]);
    });

    it('never invents a key from the path segments', () => {
      const result = resolveRoutePermissionKeys('/definitely-not-a-real-module-xyz');
      expect(result.keys).toHaveLength(0);
    });
  });

  describe('normalizePathname', () => {
    it.each([
      [null, '/'],
      [undefined, '/'],
      ['', '/'],
      ['/', '/'],
      ['/a/b/', '/a/b'],
      ['/a/b//', '/a/b'],
      ['a/b', '/a/b'],
      ['/a?x=1', '/a'],
      ['/a#frag', '/a'],
    ])('%s -> %s', (input, expected) => {
      expect(normalizePathname(input as string | null | undefined)).toBe(expected);
    });
  });
});

// ============================================================================
// The client-side mirror of fn_handover_key_allowed_at_level(key, level).
// The database is the authority; these assertions exist so the hint the
// Director sees before submitting matches the answer he would get after.
// ============================================================================

describe('keyAllowedAtLevel', () => {
  it('full carries everything', () => {
    for (const key of ['x.view', 'x.manage', 'x.delete', 'x.create', 'anything']) {
      expect(keyAllowedAtLevel(key, 'full')).toBe(true);
    }
  });

  it('watch carries only view, read and export', () => {
    expect(keyAllowedAtLevel('learners.profiles.view', 'watch')).toBe(true);
    expect(keyAllowedAtLevel('billing.reports.read', 'watch')).toBe(true);
    expect(keyAllowedAtLevel('billing.reports.export', 'watch')).toBe(true);
    expect(keyAllowedAtLevel('learners.profiles.edit', 'watch')).toBe(false);
    expect(keyAllowedAtLevel('improvement.board.manage', 'watch')).toBe(false);
  });

  it('update adds the move-it-along verbs', () => {
    for (const key of [
      'x.view',
      'x.read',
      'x.export',
      'x.edit',
      'x.update',
      'x.submit',
      'x.mark',
      'x.respond',
      'x.acknowledge',
    ]) {
      expect(keyAllowedAtLevel(key, 'update')).toBe(true);
    }
  });

  it('update deliberately excludes create, delete and manage', () => {
    for (const key of ['x.create', 'x.delete', 'x.manage']) {
      expect(keyAllowedAtLevel(key, 'update')).toBe(false);
    }
  });

  it("reproduces the SQL LIKE '%.mark_%' wildcard, not a literal underscore", () => {
    // `_` is a single-character wildcard in LIKE, so ".mark" + any one char
    // matches. Both of these are allowed at update in the database.
    expect(keyAllowedAtLevel('academic.attendance.marks', 'update')).toBe(true);
    expect(keyAllowedAtLevel('academic.attendance.mark_bulk', 'update')).toBe(true);
    // ".mark" with nothing after is caught by the plain '%.mark' clause.
    expect(keyAllowedAtLevel('academic.attendance.mark', 'update')).toBe(true);
    // No ".mark" anywhere — a lookalike must not slip through.
    expect(keyAllowedAtLevel('x.remarkable', 'update')).toBe(false);
  });
});

describe('keysNotAllowedAtLevel / lowestLevelThatCarries', () => {
  it('names the keys the level cannot carry', () => {
    expect(keysNotAllowedAtLevel(['a.view', 'b.manage'], 'watch')).toEqual(['b.manage']);
    expect(keysNotAllowedAtLevel(['a.view', 'b.manage'], 'full')).toEqual([]);
  });

  it('suggests the lowest level that carries every key', () => {
    expect(lowestLevelThatCarries(['a.view'])).toBe('watch');
    expect(lowestLevelThatCarries(['a.view', 'b.edit'])).toBe('update');
    expect(lowestLevelThatCarries(['a.manage'])).toBe('full');
  });

  it('every level in the picker is a real DB value', () => {
    expect(ACCESS_LEVELS.map((l) => l.value)).toEqual(['watch', 'update', 'full']);
  });
});

describe('deriveHandoverTitle', () => {
  it('prefers the page title and strips the app suffix', () => {
    expect(deriveHandoverTitle('/learners', 'Learner Profiles | MyJKKN')).toBe(
      'Learner Profiles'
    );
  });

  it('falls back to the last word-shaped path segment', () => {
    expect(deriveHandoverTitle('/campus-living/room-allocation', '')).toBe(
      'Room Allocation'
    );
  });

  it('treats a bare app name as no title at all', () => {
    // Seen live on /learners/profiles: document.title is just "MyJKKN".
    // Prefilling that as the job is worse than prefilling the route's name.
    expect(deriveHandoverTitle('/learners/profiles', 'MyJKKN')).toBe('Profiles');
    expect(deriveHandoverTitle('/learners/profiles', '  MyJKKN ')).toBe('Profiles');
  });

  it('walks back past a concrete id', () => {
    expect(
      deriveHandoverTitle('/users/3f9a1c22-5d4e-4b17-9f0a-2c6e8b1d4a77', null)
    ).toBe('Users');
    expect(deriveHandoverTitle('/users/1042', null)).toBe('Users');
  });
});
