// Shape of the payloads served by /api/whats-new, assembled from the
// changelog_entries / changelog_modules / changelog_sync tables.
// Written by scripts/generate-changelog.mjs — keep the two in step.

/** How a change reads to a person. */
export type ChangeKind = 'new' | 'fixed' | 'faster' | 'security';

/**
 * One shipped change. Keys are short because ~4,800 of these travel over the
 * wire to a phone; the generator is the only thing that writes them.
 */
export interface ChangelogEntry {
  /** short commit sha */
  h: string;
  /** YYYY-MM-DD the change landed on production's main branch */
  d: string;
  /**
   * The instant it landed, ISO 8601. `d` is this value's day in Asia/Kolkata —
   * see lib/changelog/entry-time.ts, which is where that reading is done and
   * where the rule is tested.
   *
   * OPTIONAL, and not a transitional nicety: every row written before
   * 2026-09-12 has no timestamp at all (the generator read `--date=short` and
   * threw the time away), and they stay that way until the next sync re-reads
   * git history. A reader must render the date alone when this is absent.
   */
  at?: string;
  t: ChangeKind;
  /** module slug — index into ChangelogMeta.modules */
  m: string;
  /** the change, in the words of the person who shipped it */
  s: string;
  /** who shipped it */
  a: string;
  /** pull request number, when the change went through one */
  p?: number;
  /** breaking change (a `!` in the commit type) */
  b?: 1;
}

export interface ChangelogModule {
  label: string;
  /**
   * Permission namespace(s) gating this module, or null for platform-wide
   * changes everyone sees. A viewer holding ANY live permission inside the
   * namespace sees the module's entries.
   */
  perm: string | string[] | null;
  href: string | null;
}

export interface ChangelogMeta {
  generatedAt: string;
  ref: string;
  total: number;
  first: string | null;
  latest: string | null;
  months: string[];
  recentFrom: string;
  recentCount: number;
  archiveCount: number;
  contributors: { name: string; count: number }[];
  modules: Record<string, ChangelogModule>;
}

export const KIND_LABEL: Record<ChangeKind, string> = {
  new: 'New',
  fixed: 'Fixed',
  faster: 'Faster',
  security: 'Security',
};
