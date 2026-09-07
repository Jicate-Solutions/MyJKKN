import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { canSeeModule } from '@/lib/changelog/use-changelog';
import type { ChangelogEntry, ChangelogMeta } from '@/lib/changelog/types';

// See can-see-module.test.ts: importing the client module for its one pure
// export would otherwise boot the Supabase browser client.
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, isSuperAdmin: false, isLoading: false }),
}));

/**
 * The contract between scripts/generate-changelog.mjs and the page.
 *
 * The generator shells out to `git log` at import time, so it cannot be
 * imported here. What CAN be checked is its committed output: these are the
 * three files the browser actually fetches, and every assertion below must hold
 * for ANY generation, not for today's history. Counts and commit text are
 * deliberately not asserted — they change on every merge.
 *
 * Note for whoever changes the generator: this suite runs on a pull request
 * only when a path under __tests__/lib/**, lib/** or vitest.config.js changes
 * (see .github/workflows/lib-unit-suite.yml). Regenerating lib/changelog/data/
 * alone does not trigger it.
 */
const dir = path.join(process.cwd(), 'lib', 'changelog', 'data');
const read = <T,>(f: string): T => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as T;

const meta = read<ChangelogMeta>('meta.json');
const recent = read<ChangelogEntry[]>('recent.json');
const archive = read<ChangelogEntry[]>('archive.json');
const all = [...recent, ...archive];

const KINDS = new Set(['new', 'fixed', 'faster', 'security']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Rows that break a rule, capped so a failure prints a diff a person can read. */
const sample = <T,>(rows: T[], n = 5) => rows.slice(0, n);

describe('generated files load', () => {
  it('recent and archive are arrays and recent is not empty', () => {
    expect(Array.isArray(recent)).toBe(true);
    expect(Array.isArray(archive)).toBe(true);
    expect(recent.length).toBeGreaterThan(0);
  });

  it('meta carries the fields the page reads', () => {
    expect(typeof meta.generatedAt).toBe('string');
    expect(typeof meta.ref).toBe('string');
    expect(meta.generatedAt).toMatch(DATE_RE);
    expect(Array.isArray(meta.months)).toBe(true);
    expect(Array.isArray(meta.contributors)).toBe(true);
    expect(typeof meta.modules).toBe('object');
    expect(Object.keys(meta.modules).length).toBeGreaterThan(0);
  });
});

describe('entry shape', () => {
  it('every entry has a 7-character short sha', () => {
    expect(sample(all.filter((e) => !/^[0-9a-f]{7}$/.test(e.h)))).toEqual([]);
  });

  it('every date is YYYY-MM-DD', () => {
    expect(sample(all.filter((e) => !DATE_RE.test(e.d)))).toEqual([]);
  });

  it('every kind is one of new | fixed | faster | security', () => {
    // KIND_LABEL and the filter chips are keyed on exactly these four; a fifth
    // renders as an unlabelled chip nothing can select.
    expect(sample(all.filter((e) => !KINDS.has(e.t)))).toEqual([]);
  });

  it('no entry has an empty summary or author', () => {
    // An empty summary is a blank row on the page; an empty author is an
    // uncredited change.
    expect(sample(all.filter((e) => typeof e.s !== 'string' || e.s.trim() === ''))).toEqual([]);
    expect(sample(all.filter((e) => typeof e.a !== 'string' || e.a.trim() === ''))).toEqual([]);
  });

  it('the optional PR number is a positive integer when present', () => {
    expect(sample(all.filter((e) => 'p' in e && !(Number.isInteger(e.p) && (e.p as number) > 0)))).toEqual(
      []
    );
  });

  it('the optional breaking flag is exactly 1 when present', () => {
    expect(sample(all.filter((e) => 'b' in e && e.b !== 1))).toEqual([]);
  });
});

describe('ordering', () => {
  const nonIncreasing = (rows: ChangelogEntry[]) =>
    rows
      .map((e, i) => (i > 0 && e.d > rows[i - 1].d ? { at: i, after: rows[i - 1].d, is: e.d } : null))
      .filter(Boolean);

  it('recent is newest-first by date', () => {
    // git log is topological, not chronological, so the generator sorts
    // explicitly. A changelog read as a timeline must never step forwards.
    expect(sample(nonIncreasing(recent))).toEqual([]);
  });

  it('archive is newest-first by date', () => {
    expect(sample(nonIncreasing(archive))).toEqual([]);
  });

  it('the archive is entirely older than the recent window', () => {
    if (archive.length === 0) return;
    expect(archive[0].d <= recent[recent.length - 1].d).toBe(true);
  });
});

describe('the recent / archive split', () => {
  it('splits on meta.recentFrom, with no entry on the wrong side', () => {
    // The page renders recent.json first and fetches archive.json on demand. If
    // the two windows overlapped, an entry would appear twice once the reader
    // asked for older changes.
    expect(meta.recentFrom).toMatch(DATE_RE);
    expect(sample(recent.filter((e) => e.d < meta.recentFrom))).toEqual([]);
    expect(sample(archive.filter((e) => e.d >= meta.recentFrom))).toEqual([]);
  });

  it('meta counts describe the files that were written', () => {
    expect(meta.recentCount).toBe(recent.length);
    expect(meta.archiveCount).toBe(archive.length);
    expect(meta.total).toBe(all.length);
  });

  it('meta.first and meta.latest bracket the data', () => {
    expect(meta.latest).toBe(all[0].d);
    expect(meta.first).toBe(all[all.length - 1].d);
  });

  it('meta.months lists every month present, newest first', () => {
    const derived = [...new Set(all.map((e) => e.d.slice(0, 7)))].sort().reverse();
    expect(meta.months).toEqual(derived);
  });
});

describe('the module dictionary travels with the data', () => {
  it('every entry module slug exists in meta.modules', () => {
    // A slug missing here is invisible on the page: canSeeModule() fails closed
    // on an unknown module, so those entries silently disappear for every
    // non-super-admin.
    const unknown = [...new Set(all.filter((e) => !meta.modules[e.m]).map((e) => e.m))];
    expect(unknown).toEqual([]);
  });

  it('every module entry has a label, a namespace or null, and an href or null', () => {
    for (const [slug, m] of Object.entries(meta.modules)) {
      expect(typeof m.label, slug).toBe('string');
      expect(m.label.length, slug).toBeGreaterThan(0);

      const permOk =
        m.perm === null ||
        (typeof m.perm === 'string' && m.perm.length > 0) ||
        (Array.isArray(m.perm) &&
          m.perm.length > 0 &&
          m.perm.every((p) => typeof p === 'string' && p.length > 0));
      expect(permOk, `${slug}: perm must be a non-empty namespace, list of them, or null`).toBe(
        true
      );

      const hrefOk = m.href === null || (typeof m.href === 'string' && m.href.startsWith('/'));
      expect(hrefOk, `${slug}: href must be an app path or null`).toBe(true);
    }
  });
});

describe('contributors', () => {
  it('names every author that appears in the data', () => {
    const named = new Set(meta.contributors.map((c) => c.name));
    const missing = [...new Set(all.map((e) => e.a))].filter((a) => !named.has(a));
    expect(missing).toEqual([]);
  });

  it('counts are positive integers ordered most-first', () => {
    expect(sample(meta.contributors.filter((c) => !Number.isInteger(c.count) || c.count < 1))).toEqual(
      []
    );
    const outOfOrder = meta.contributors.filter((c, i, a) => i > 0 && a[i - 1].count < c.count);
    expect(sample(outOfOrder)).toEqual([]);
  });
});

describe('role scoping against the real dictionary', () => {
  it('a viewer holding nothing sees exactly the platform-wide modules', () => {
    // The floor of the gate. If this ever returns a perm-gated module, every
    // signed-in learner is reading module news they have no access to.
    const visible = Object.entries(meta.modules)
      .filter(([, m]) => canSeeModule(m, {}, false))
      .map(([slug]) => slug)
      .sort();
    const platformWide = Object.entries(meta.modules)
      .filter(([, m]) => m.perm === null)
      .map(([slug]) => slug)
      .sort();
    expect(visible).toEqual(platformWide);
  });

  it('a super admin sees every module', () => {
    const hidden = Object.entries(meta.modules)
      .filter(([, m]) => !canSeeModule(m, {}, true))
      .map(([slug]) => slug);
    expect(hidden).toEqual([]);
  });

  it('every gated module opens on its own namespace, and not on a look-alike', () => {
    // Runs the dot-boundary rule over the SHIPPED dictionary rather than a
    // fixture, so it keeps covering real modules as they come and go. Two
    // modules may legitimately share a namespace (Administration and AI
    // Routines are both gated on `admin`), so this checks each module against
    // its own namespace rather than asserting exclusivity between modules.
    const gated = Object.entries(meta.modules).filter(([, m]) => m.perm !== null);
    expect(gated.length).toBeGreaterThan(0);

    const wrong: string[] = [];
    for (const [slug, mod] of gated) {
      const namespaces = Array.isArray(mod.perm) ? mod.perm : [mod.perm as string];
      for (const ns of namespaces) {
        if (!canSeeModule(mod, { [`${ns}.view`]: true }, false)) {
          wrong.push(`${slug}: "${ns}.view" did not open it`);
        }
        if (canSeeModule(mod, { [`${ns}x.view`]: true }, false)) {
          wrong.push(`${slug}: look-alike "${ns}x.view" opened it`);
        }
        if (canSeeModule(mod, { [`${ns}.view`]: false }, false)) {
          wrong.push(`${slug}: a DENIED "${ns}.view" opened it`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
