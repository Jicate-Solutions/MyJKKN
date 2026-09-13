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
  /**
   * The screen this change happened on — an in-app path such as
   * `/hr/admin/recruitment-need/norms`, derived by
   * scripts/generate-changelog.mjs from the static app/(routes) page files the
   * commit touched (lib/changelog/entry-link.mjs has the rules).
   *
   * OPTIONAL, and absent for roughly three quarters of entries: a commit that
   * touched only a migration, a service or a shared component has no single
   * screen, a dynamic route ([id]) has no URL without a real id, and a page that
   * has since been deleted is deliberately refused rather than linked to a 404.
   * A reader must fall back to the module's own href in all of those cases, and
   * render no link at all when the module has none either.
   *
   * NOT a permission signal. Which entries a reader receives is already decided
   * server-side by fn_changelog_visible_modules(); this only says where the
   * change was, and the target page states its own access.
   */
  l?: string;
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
