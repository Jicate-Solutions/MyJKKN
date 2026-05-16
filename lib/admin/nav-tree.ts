/**
 * Admin Nav Tree — filesystem auto-discovery for /admin/*.
 *
 * Director's directive (2026-04-29): every policy decision is a config row +
 * UI; future admin pages must AUTO-APPEAR in nav without manual registration
 * (silent ghost-page failure mode bit us 4 times today). This module derives
 * the 3-tier admin nav directly from the filesystem at build time so dropping
 * a new `app/(routes)/admin/<x>/page.tsx` makes it appear automatically.
 *
 * Source of truth
 * ---------------
 * Reads from `lib/navigation/route-manifest.generated.ts` which is regenerated
 * on every `npm run build` from the actual filesystem (see
 * `scripts/generate-route-manifest.ts`). That manifest already filters out
 * dynamic segments (`[id]`, `[body]`, etc.) and private folders (`_components`)
 * so consumers see only navigable pages.
 *
 * Categorization rules
 * --------------------
 *  - Directories under `/admin/` with ≥2 page.tsx files (recursively) become
 *    a category. Key = directory name.
 *  - Single-page top-level pages (e.g. `/admin/saml`) are grouped under a
 *    synthetic 'system' bucket with sub-tabs for each page.
 *  - `/admin/page.tsx` is the root landing — not a category.
 *  - Sub-pages whose label is "New" or "Create" (the typical create-route
 *    convention) are kept as Tier-3 entries since they're navigable, but the
 *    AdminCategoryNav component may choose to hide them; this module just
 *    surfaces the raw filesystem reality.
 */

import {
  ROUTE_MANIFEST,
  type RouteNode,
} from '@/lib/navigation/route-manifest.generated';

/* ────────────────────────────────────────────────────────────────────────── */
/* Public types                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

export interface AdminPageNode {
  /** Full route, e.g. '/admin/notifications/audiences'. */
  href: string;
  /** Humanized label (from filesystem name; can be overridden via `navMeta`). */
  label: string;
  /** Top-level admin folder, e.g. 'notifications' (or 'system' synthetic). */
  category: string;
  /** True when this href === /admin/<category> (the category index page). */
  isCategoryRoot: boolean;
  /** Lucide icon export name for the page chip. */
  iconName: string;
}

export interface AdminCategoryNode {
  /** Folder key (e.g. 'notifications', 'pde') or synthetic 'system'. */
  key: string;
  /** Display label, e.g. 'Notifications'. */
  label: string;
  /**
   * Where the Tier-2 tab navigates to. For real categories this is
   * `/admin/<key>` (the index page). For the synthetic 'system' bucket this
   * is the first system page so the tab is clickable.
   */
  href: string;
  /** All Tier-3 pages that belong to this category. Includes the root index. */
  pages: AdminPageNode[];
  /** Sort key — alphabetical by default; nav-meta overrides may adjust. */
  displayOrder: number;
  /** Lucide icon export name for the category tab. */
  iconName: string;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Internal helpers                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

const ADMIN_ROOT = '/admin';

/**
 * Per-category icon mapping. We keep this small and intentional rather than
 * pattern-matching against page labels — categories are stable, and this map
 * gives every Tier-2 tab a recognizable glyph. Unknown categories fall back
 * to ShieldCheck (the admin-shield motif).
 */
const CATEGORY_ICONS: Record<string, string> = {
  notifications: 'Bell',
  lti: 'Plug',
  pde: 'GraduationCap',
  counselors: 'UserCog',
  system: 'Settings',
};

/**
 * Per-category display labels (override the auto-humanized form). Keeps
 * acronyms like LTI / PDE in correct case.
 */
const CATEGORY_LABELS: Record<string, string> = {
  lti: 'LTI',
  pde: 'PDE',
  saml: 'SAML',
  ai: 'AI',
};

/**
 * Per-category display order. Lower numbers render first. Categories not in
 * this map sort alphabetically AFTER all explicit entries.
 */
const CATEGORY_ORDER: Record<string, number> = {
  notifications: 10,
  pde: 20,
  lti: 30,
  counselors: 40,
  system: 100,
};

/** Humanize a label using the small CATEGORY_LABELS override map. */
function humanizeCategory(key: string): string {
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  // Title-case the key, but expand known multi-word acronyms inline
  return key
    .split('-')
    .map((part) => CATEGORY_LABELS[part] ?? part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * The manifest emits "Lti", "Pde", "Saml" via simple title-casing. Replace
 * these acronym labels with their canonical uppercase forms.
 */
function fixAcronyms(label: string): string {
  return label
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      return CATEGORY_LABELS[lower] ?? word;
    })
    .join(' ');
}

/**
 * Walk a manifest node to count how many descendant pages it has, including
 * itself. Used to decide if a directory becomes a category (≥2) or stays in
 * the synthetic 'system' bucket (1).
 */
function countPagesInSubtree(node: RouteNode): number {
  // Each node represents a page.tsx, so count = 1 + sum of children's counts.
  let count = 1;
  for (const child of node.children) {
    count += countPagesInSubtree(child);
  }
  return count;
}

/**
 * Flatten a category subtree into a flat list of pages, with the category
 * key tagged on each page. Used to build AdminPageNode[] for AdminCategoryNav.
 */
function flattenPages(node: RouteNode, categoryKey: string): AdminPageNode[] {
  const out: AdminPageNode[] = [];
  const visit = (n: RouteNode) => {
    out.push({
      href: n.path,
      label: fixAcronyms(n.label),
      category: categoryKey,
      isCategoryRoot: n.path === `${ADMIN_ROOT}/${categoryKey}`,
      iconName: n.iconName,
    });
    for (const child of n.children) visit(child);
  };
  visit(node);
  return out;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Build the tree                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Find the /admin node in the manifest. Returns null if no admin pages exist
 * (shouldn't happen in practice; defensive against manifest regeneration
 * issues).
 */
function findAdminRoot(): RouteNode | null {
  return ROUTE_MANIFEST.find((n) => n.path === ADMIN_ROOT) ?? null;
}

let _cachedTree: AdminCategoryNode[] | null = null;

/**
 * Returns the categorized admin nav tree, derived from the filesystem at
 * build time via the generated route manifest.
 *
 * Memoized — the manifest is static so the tree is computed once per process.
 */
export function getAdminNavTree(): AdminCategoryNode[] {
  if (_cachedTree) return _cachedTree;

  const adminRoot = findAdminRoot();
  if (!adminRoot) {
    _cachedTree = [];
    return _cachedTree;
  }

  const categories: AdminCategoryNode[] = [];
  const systemPages: AdminPageNode[] = [];

  for (const child of adminRoot.children) {
    const key = child.path.replace(`${ADMIN_ROOT}/`, '');
    const pageCount = countPagesInSubtree(child);

    if (pageCount >= 2) {
      // Real category — has sub-pages
      const pages = flattenPages(child, key);
      const label = humanizeCategory(key);
      categories.push({
        key,
        label,
        href: child.path,
        pages,
        displayOrder: CATEGORY_ORDER[key] ?? 50,
        iconName: CATEGORY_ICONS[key] ?? 'ShieldCheck',
      });
    } else {
      // Single-page top-level — joins the synthetic 'system' bucket
      systemPages.push({
        href: child.path,
        label: fixAcronyms(child.label),
        category: 'system',
        isCategoryRoot: false,
        iconName: child.iconName,
      });
    }
  }

  if (systemPages.length > 0) {
    // Sort system pages alphabetically so order is deterministic
    systemPages.sort((a, b) => a.label.localeCompare(b.label));
    categories.push({
      key: 'system',
      label: humanizeCategory('system'),
      href: systemPages[0]!.href,
      pages: systemPages,
      displayOrder: CATEGORY_ORDER.system,
      iconName: CATEGORY_ICONS.system!,
    });
  }

  // Sort by displayOrder, then alphabetical fallback
  categories.sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.label.localeCompare(b.label);
  });

  _cachedTree = categories;
  return _cachedTree;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Lookup helper                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Given a pathname (typically from `usePathname()`), return the active admin
 * category and the active sub-page within that category.
 *
 * Matching rules:
 *  - Real category: pathname must start with `/admin/<key>` (so dynamic
 *    children like `/admin/notifications/[id]` correctly highlight the
 *    Notifications tab).
 *  - 'system' category: pathname must match one of the synthetic system
 *    pages exactly (no nesting expected).
 *  - Active page within a category: longest-prefix match (so a deep route
 *    like `/admin/pde/quests/create` highlights `/admin/pde/quests`, not
 *    just `/admin/pde`).
 *
 * Returns null when pathname is not an admin route or no category matches.
 */
export function findActiveCategory(
  pathname: string
): { category: AdminCategoryNode; activePage: AdminPageNode | null } | null {
  if (!pathname.startsWith(ADMIN_ROOT)) return null;

  const tree = getAdminNavTree();

  // First pass: try real categories (pathname starts with /admin/<key>)
  for (const category of tree) {
    if (category.key === 'system') continue;
    const prefix = `${ADMIN_ROOT}/${category.key}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      // Find the deepest sub-page whose href is a prefix of pathname
      let activePage: AdminPageNode | null = null;
      let bestLen = -1;
      for (const page of category.pages) {
        if (
          (pathname === page.href || pathname.startsWith(`${page.href}/`)) &&
          page.href.length > bestLen
        ) {
          activePage = page;
          bestLen = page.href.length;
        }
      }
      return { category, activePage };
    }
  }

  // Second pass: try the 'system' bucket — pathname must equal one of its
  // system pages exactly (these are leaf routes by definition).
  const systemCategory = tree.find((c) => c.key === 'system');
  if (systemCategory) {
    const activePage =
      systemCategory.pages.find(
        (p) => pathname === p.href || pathname.startsWith(`${p.href}/`)
      ) ?? null;
    if (activePage) return { category: systemCategory, activePage };
  }

  return null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Test/debug helper (used by Agent O's CI gate)                             */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Returns a flat count summary of the tree — useful for the CI coverage check
 * that asserts "every page.tsx under /admin is reachable from the nav".
 */
export function getAdminNavStats(): {
  categoryCount: number;
  pageCount: number;
  systemPageCount: number;
} {
  const tree = getAdminNavTree();
  const systemCategory = tree.find((c) => c.key === 'system');
  return {
    categoryCount: tree.length,
    pageCount: tree.reduce((sum, c) => sum + c.pages.length, 0),
    systemPageCount: systemCategory?.pages.length ?? 0,
  };
}
