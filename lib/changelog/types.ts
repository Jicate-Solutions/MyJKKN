// Shape of the generated changelog files in lib/changelog/data/.
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
