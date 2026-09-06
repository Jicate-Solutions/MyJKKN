import { describe, it, expect, vi } from 'vitest';
import { MODULES, PLATFORM, moduleFor, slugify } from '@/lib/changelog/modules.mjs';
import { canSeeModule } from '@/lib/changelog/use-changelog';
import type { ChangelogModule } from '@/lib/changelog/types';

// See can-see-module.test.ts: importing the client module for its one pure
// export would otherwise boot the Supabase browser client.
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, isSuperAdmin: false, isLoading: false }),
}));

/**
 * The changelog data contract, after the move off committed files.
 *
 * WHAT THIS FILE USED TO ASSERT, AND WHY IT NO LONGER CAN. It read
 * lib/changelog/data/{meta,recent,archive}.json off disk and checked the
 * generator's output: date format, the four kinds, newest-first ordering, the
 * recent/archive split, contributor counts, and that every entry's module slug
 * existed in the dictionary that travelled with it. Those files are gone — the
 * entries are rows in changelog_entries now. Every one of those invariants moved
 * INTO the database (a `date` column, a CHECK on `kind`, NOT NULL on subject and
 * author, a foreign key on `module_key`, `ORDER BY entry_date DESC` in the read
 * path) or into SQL this suite cannot execute. It would be worse than useless to
 * keep asserting them against a fixture written in this file: the fixture would
 * always pass and would prove nothing about the rows a reader actually gets.
 *
 * live-data-schema.test.ts asserts the declarations that replaced them, and
 * names in one place everything that is now beyond the reach of a unit test.
 *
 * WHAT IS STILL REAL HERE. The module dictionary did not move. It is still plain
 * JavaScript in lib/changelog/modules.mjs, it is what must seed
 * changelog_modules, and it is what the role gate runs against. A mistake in it
 * is invisible on the page rather than loud: canSeeModule fails closed, so a bad
 * slug makes entries silently disappear for every non-super-admin, and a
 * too-broad namespace shows module news to people with no access to the module.
 */

type Mod = { key: string; label: string; perm: string | string[] | null; href: string | null };

const scopes = Object.keys(MODULES as Record<string, unknown>);

/**
 * Every module the generator can emit, keyed the way changelog_modules is.
 *
 * Built by running every scope through moduleFor(), which is exactly what the
 * generator does per commit — so this is the row set a sync job has to write,
 * derived the same way rather than restated.
 */
const seed = new Map<string, Mod>();
for (const scope of scopes) seed.set((moduleFor(scope) as Mod).key, moduleFor(scope) as Mod);

const PLATFORM_KEY = slugify((PLATFORM as { label: string }).label) as string;

const namespacesOf = (m: Mod) => (m.perm === null ? [] : Array.isArray(m.perm) ? m.perm : [m.perm]);

/** Rows that break a rule, capped so a failure prints a diff a person can read. */
const sample = <T,>(rows: T[], n = 5) => rows.slice(0, n);

describe('the dictionary is a valid seed for changelog_modules', () => {
  it('has modules to seed at all', () => {
    expect(seed.size).toBeGreaterThan(0);
  });

  it('every key is a slug the module_key foreign key can point at', () => {
    // changelog_entries.module_key REFERENCES changelog_modules(key), so a key
    // that is empty, capitalised or punctuated is not a cosmetic problem: the
    // entry insert fails and that commit never reaches the page.
    const bad = [...seed.keys()].filter((k) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(k));
    expect(bad).toEqual([]);
  });

  it('a key never carries two different labels or two different namespaces', () => {
    // The seed is an upsert on a UNIQUE key. If two scopes produced the same key
    // with different content, the row would hold whichever the job wrote last —
    // and which one that is depends on iteration order, so the page's filter
    // chip and its permission gate would change for no reason anyone can see.
    const drift: string[] = [];
    const seen = new Map<string, Mod>();
    for (const scope of scopes) {
      const m = moduleFor(scope) as Mod;
      const prev = seen.get(m.key);
      if (!prev) {
        seen.set(m.key, m);
        continue;
      }
      if (prev.label !== m.label) drift.push(`${m.key}: label "${prev.label}" vs "${m.label}"`);
      if (JSON.stringify(prev.perm) !== JSON.stringify(m.perm)) {
        drift.push(`${m.key}: perm ${JSON.stringify(prev.perm)} vs ${JSON.stringify(m.perm)}`);
      }
    }
    expect(drift).toEqual([]);
  });

  it('records the ONE key whose href is not stable, so a second one is caught', () => {
    // Characterisation, not approval. `administration` is reachable through two
    // MODULES entries that agree on label and namespace but disagree on href
    // (/admin/ai-models and /admin/dashboard-drilldowns), so the "Open
    // Administration" link already points wherever the last write happened to
    // land — the JSON generator had the same wart, silently. It is left alone
    // here because lib/changelog/modules.mjs is not this suite's to change; the
    // point of pinning it is that a SECOND module developing the same split
    // turns this test red instead of shipping another arbitrary link.
    const hrefs = new Map<string, Set<string>>();
    for (const scope of scopes) {
      const m = moduleFor(scope) as Mod;
      if (!hrefs.has(m.key)) hrefs.set(m.key, new Set());
      hrefs.get(m.key)!.add(JSON.stringify(m.href));
    }
    const unstable = [...hrefs.entries()].filter(([, set]) => set.size > 1).map(([k]) => k);
    expect(unstable).toEqual(['administration']);
  });

  it('every namespace fits the text[] column and the gate that reads it', () => {
    // changelog_modules.perm is text[]; modules.mjs stores a bare string for
    // most modules and an array for the few that span namespaces, so the sync
    // has to wrap the bare ones. Both shapes are checked here because a
    // namespace is also matched by canSeeModule with a dot boundary — a value
    // with a space or a capital could never match a real permission key.
    const bad: string[] = [];
    for (const [key, m] of seed) {
      if (m.perm === null) continue;
      const ns = namespacesOf(m);
      if (ns.length === 0) bad.push(`${key}: perm present but empty`);
      for (const p of ns) {
        if (typeof p !== 'string' || !/^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/.test(p)) {
          bad.push(`${key}: "${p}" is not a permission namespace`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('every href is an app path or null', () => {
    const bad = [...seed.entries()]
      .filter(([, m]) => !(m.href === null || (typeof m.href === 'string' && m.href.startsWith('/'))))
      .map(([k, m]) => `${k}: ${JSON.stringify(m.href)}`);
    expect(bad).toEqual([]);
  });
});

describe('the platform bucket must be seeded even though no scope produces it', () => {
  it('is where every unmapped scope lands', () => {
    expect((moduleFor('a-scope-nobody-has-ever-used') as Mod).key).toBe(PLATFORM_KEY);
    expect(PLATFORM_KEY).toBe('platform');
  });

  it('is NOT reachable by walking MODULES, so a seed built from MODULES alone omits it', () => {
    // Measured, not assumed: no key in MODULES maps to the Platform module — it
    // exists only as moduleFor()'s fallback. A sync job that seeds
    // changelog_modules by iterating MODULES therefore never writes the
    // `platform` row, and then every unscoped commit fails its foreign key on
    // insert. Cross-cutting changes (sign-in, navigation, speed) are exactly the
    // entries everyone signed in is meant to see, so that failure would be
    // invisible AND would empty the one bucket with no permission gate.
    expect(seed.has(PLATFORM_KEY)).toBe(false);
  });

  it('is platform-wide: no namespace, so everyone signed in reads it', () => {
    expect((PLATFORM as { perm: unknown }).perm).toBeNull();
    expect(canSeeModule(moduleFor('') as ChangelogModule, {}, false)).toBe(true);
  });
});

describe('role scoping against the real dictionary', () => {
  // These ran against meta.json's copy of the dictionary before the move. They
  // now run against its source, which is the same data one step earlier and no
  // longer depends on a file being regenerated.

  it('a viewer holding nothing sees exactly the platform-wide modules', () => {
    // The floor of the gate. If this ever returns a perm-gated module, every
    // signed-in learner is reading module news they have no access to.
    const visible = [...seed.entries()]
      .filter(([, m]) => canSeeModule(m as ChangelogModule, {}, false))
      .map(([k]) => k)
      .sort();
    const platformWide = [...seed.entries()]
      .filter(([, m]) => m.perm === null)
      .map(([k]) => k)
      .sort();
    expect(visible).toEqual(platformWide);
  });

  it('a super admin sees every module', () => {
    const hidden = [...seed.entries()]
      .filter(([, m]) => !canSeeModule(m as ChangelogModule, {}, true))
      .map(([k]) => k);
    expect(hidden).toEqual([]);
  });

  it('every gated module opens on its own namespace, and not on a look-alike', () => {
    // Runs the dot-boundary rule over the SHIPPED dictionary rather than a
    // fixture, so it keeps covering real modules as they come and go. Two
    // modules may legitimately share a namespace (Administration and AI
    // Routines are both gated on `admin`), so this checks each module against
    // its own namespace rather than asserting exclusivity between modules.
    const gated = [...seed.entries()].filter(([, m]) => m.perm !== null);
    expect(gated.length).toBeGreaterThan(0);

    const wrong: string[] = [];
    for (const [key, mod] of gated) {
      for (const ns of namespacesOf(mod)) {
        if (!canSeeModule(mod as ChangelogModule, { [`${ns}.view`]: true }, false)) {
          wrong.push(`${key}: "${ns}.view" did not open it`);
        }
        if (canSeeModule(mod as ChangelogModule, { [`${ns}x.view`]: true }, false)) {
          wrong.push(`${key}: look-alike "${ns}x.view" opened it`);
        }
        if (canSeeModule(mod as ChangelogModule, { [`${ns}.view`]: false }, false)) {
          wrong.push(`${key}: a DENIED "${ns}.view" opened it`);
        }
      }
    }
    expect(sample(wrong)).toEqual([]);
  });
});
