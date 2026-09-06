import { describe, it, expect } from 'vitest';
import {
  MODULES,
  INTERNAL_SCOPES,
  PLATFORM,
  moduleFor,
  slugify,
} from '@/lib/changelog/modules.mjs';

describe('moduleFor — unknown scope', () => {
  it('falls back to Platform', () => {
    const m = moduleFor('a-scope-nobody-has-ever-used');
    expect(m.key).toBe('platform');
    expect(m.label).toBe(PLATFORM.label);
    expect(m.perm).toBeNull();
    expect(m.href).toBeNull();
  });

  it('falls back to Platform for a missing, empty or null scope', () => {
    // The generator hands over `(rawScope || '').split('/')[0]`, so an unscoped
    // commit arrives here as the empty string, not as undefined.
    for (const scope of ['', undefined, null]) {
      expect(moduleFor(scope as never).key).toBe('platform');
    }
  });

  it('does not fall back for a scope that IS mapped', () => {
    expect(moduleFor('billing').key).not.toBe('platform');
  });
});

describe('moduleFor — aliases collapse to one module', () => {
  const sameModule = (scopes: string[]) => {
    const first = moduleFor(scopes[0]);
    for (const s of scopes.slice(1)) {
      const m = moduleFor(s);
      expect({ scope: s, key: m.key, label: m.label }).toEqual({
        scope: s,
        key: first.key,
        label: first.label,
      });
    }
    return first;
  };

  it('hostel / mess / mess-menu / mess-loop / campus-living are one module', () => {
    // A reader does not know that "hostel" and "mess" are separate git scopes.
    const m = sameModule(['campus-living', 'hostel', 'mess', 'mess-menu', 'mess-loop']);
    expect(m.key).toBe('campus-living');
    expect(m.label).toBe('Campus Living');
  });

  it('the billing scopes are one module', () => {
    const m = sameModule(['billing', 'payments', 'fees', 'my-bills', 'billing-reports']);
    expect(m.label).toBe('Billing');
  });

  it('telephony / calls / voice-memos are one module', () => {
    const m = sameModule(['telephony', 'calls', 'voice-memos', 'voice-memo']);
    expect(m.label).toBe('Telephony');
  });

  it('users / roles / permissions / rbac are one module and keep the array perm', () => {
    const m = sameModule(['users', 'roles', 'permissions', 'rbac', 'rls']);
    expect(m.key).toBe('users-roles');
    expect(m.perm).toEqual(['users', 'roles']);
  });

  it('a scope maps to the key derived from its own label', () => {
    for (const [scope, entry] of Object.entries(MODULES) as [string, { label: string }][]) {
      expect(moduleFor(scope).key).toBe(slugify(entry.label));
    }
  });
});

describe('slugify', () => {
  it('lowercases and collapses runs of non-alphanumerics to a single dash', () => {
    expect(slugify('Campus Living')).toBe('campus-living');
    expect(slugify('Users & Roles')).toBe('users-roles');
    expect(slugify("Director's Desk")).toBe('director-s-desk');
    expect(slugify('Board of Studies')).toBe('board-of-studies');
  });

  it('strips leading and trailing separators', () => {
    expect(slugify('  Hello!  ')).toBe('hello');
    expect(slugify('-x-')).toBe('x');
  });

  it('is idempotent for every label in the dictionary', () => {
    // The key travels in the data and is matched against meta.modules on the
    // page, so slugify(slugify(x)) drifting from slugify(x) would silently
    // orphan a module.
    const labels = [...new Set(Object.values(MODULES).map((m) => (m as { label: string }).label))];
    for (const label of labels) {
      const once = slugify(label);
      expect(slugify(once)).toBe(once);
      expect(once).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('never collapses two different labels onto one key', () => {
    // Two labels sharing a key would merge unrelated modules into one filter
    // chip and one permission gate.
    const bySlug = new Map<string, Set<string>>();
    for (const m of Object.values(MODULES) as { label: string }[]) {
      const s = slugify(m.label);
      if (!bySlug.has(s)) bySlug.set(s, new Set());
      bySlug.get(s)!.add(m.label);
    }
    const collisions = [...bySlug.entries()]
      .filter(([, labels]) => labels.size > 1)
      .map(([s, labels]) => `${s}: ${[...labels].join(' / ')}`);
    expect(collisions).toEqual([]);
  });
});

describe('INTERNAL_SCOPES', () => {
  it('is a Set of scopes the generator drops', () => {
    expect(INTERNAL_SCOPES).toBeInstanceOf(Set);
    for (const s of ['ci', 'build', 'deps', 'tests', 'migrations', 'lint']) {
      expect(INTERNAL_SCOPES.has(s)).toBe(true);
    }
  });

  it('shares no scope with MODULES', () => {
    // The generator tests INTERNAL_SCOPES BEFORE it looks the scope up in
    // MODULES, so any scope in both is silently dropped — the module would sit
    // in the dictionary looking mapped while every one of its commits vanished.
    const overlap = [...INTERNAL_SCOPES].filter((s) => Object.hasOwn(MODULES, s as string));
    expect(overlap).toEqual([]);
  });

  it('holds only lowercase, slash-free scopes', () => {
    // The generator compares against `rawScope.split('/')[0].toLowerCase()`, so
    // an entry with a capital or a slash can never match anything.
    for (const s of INTERNAL_SCOPES as Set<string>) {
      expect(s).toBe(s.toLowerCase());
      expect(s).not.toContain('/');
    }
  });
});

describe('MODULES dictionary shape', () => {
  it('keys are lowercase and slash-free', () => {
    // Same reason as INTERNAL_SCOPES: a key the generator's normalised scope can
    // never equal is dead weight, and its commits fall through to Platform.
    const bad = Object.keys(MODULES).filter((k) => k !== k.toLowerCase() || k.includes('/'));
    expect(bad).toEqual([]);
  });

  it('every entry has a label, a permission namespace or null, and an href or null', () => {
    for (const [scope, m] of Object.entries(MODULES) as [
      string,
      { label: unknown; perm: unknown; href: unknown },
    ][]) {
      expect(typeof m.label, scope).toBe('string');
      expect((m.label as string).length, scope).toBeGreaterThan(0);

      const permOk =
        m.perm === null ||
        (typeof m.perm === 'string' && m.perm.length > 0) ||
        (Array.isArray(m.perm) &&
          m.perm.length > 0 &&
          m.perm.every((p) => typeof p === 'string' && p.length > 0));
      expect(permOk, `${scope}: perm must be a non-empty namespace, list of them, or null`).toBe(
        true
      );

      const hrefOk = m.href === null || (typeof m.href === 'string' && m.href.startsWith('/'));
      expect(hrefOk, `${scope}: href must be an app path or null`).toBe(true);
    }
  });

  it('PLATFORM is the everyone-can-read bucket', () => {
    expect(PLATFORM.perm).toBeNull();
    expect(slugify(PLATFORM.label)).toBe('platform');
  });
});
