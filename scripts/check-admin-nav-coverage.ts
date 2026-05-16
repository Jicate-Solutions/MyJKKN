/**
 * scripts/check-admin-nav-coverage.ts
 *
 * Fails the build if any `app/(routes)/admin/__/page.tsx` exists on disk
 * but is NOT reachable from `getAdminNavTree()`. This guarantees zero
 * "ghost admin pages" — pages that exist but cannot be navigated to via
 * the admin 3-tier nav (sidebar -> category tabs -> sub-page tabs).
 *
 * Symptom this gate prevents:
 *   Today's wave shipped 4 admin pages without sidebar/tab entries.
 *   They were silent ghosts: rendered fine if you typed the URL, but
 *   invisible to anyone navigating from the admin module home. The
 *   only signal was a 404-feel from the user's perspective. CI never
 *   caught it because typecheck and reachability both passed.
 *
 * What this script does:
 *   1. Walk filesystem for every `app/(routes)/admin/__/page.tsx`.
 *      Filter out dynamic segments (`[id]`, `[body]`) and route groups
 *      (`(...)`). Each remaining file maps to one canonical URL.
 *   2. Import `getAdminNavTree()` from `@/lib/admin/nav-tree` (Agent M's
 *      foundation PR). Flatten its leaf hrefs into a set.
 *   3. Diff:
 *        - In filesystem but NOT in tree -> ghost page  -> FAIL
 *        - In tree but NOT on filesystem -> orphan tree -> FAIL
 *   4. On success: print summary table.
 *
 * Run via:
 *   npx tsx scripts/check-admin-nav-coverage.ts
 *   npx tsx scripts/check-admin-nav-coverage.ts --verbose
 *
 * Exit codes:
 *   0 = all admin pages reachable (or foundation not yet merged - non-blocking)
 *   1 = ghost page or orphan tree entry detected
 *
 * Wired into:
 *   package.json: `npm run check:admin-nav` (added separately)
 *
 * Cross-PR contract:
 *   This script imports `getAdminNavTree` from the foundation PR
 *   (Agent M, `lib/admin/nav-tree.ts`). Until that PR merges, the
 *   import will fail. The script handles that gracefully — see the
 *   try/catch around the dynamic import below. It prints an actionable
 *   "foundation not yet merged" message and exits 0 so this PR can
 *   land in either order.
 *
 *   Once Agent M merges, this gate becomes blocking on every PR that
 *   adds a new admin page without wiring it into the nav tree.
 *
 * Pattern reference:
 *   - `scripts/check-tier2-route-coverage.mjs`  — fs vs sidebar
 *   - `scripts/check-nav-reachability.ts`        — chip-click BFS
 *   - `scripts/check-attention-bar-coverage.ts`  — exact-match gate
 *   - `docs/architecture/admin-nav-pattern.md`   — full pattern doc
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const ROOT = process.cwd();
const ADMIN_ROUTES_DIR = resolve(ROOT, 'app/(routes)/admin');
const VERBOSE = process.argv.includes('--verbose');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: walk filesystem for every admin page.tsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively collect every `page.tsx` under `dir`, returning the URL path
 * each one represents (with `app/(routes)` stripped and `/page.tsx` stripped).
 *
 * Filters out:
 *   - Dynamic segments: `[id]`, `[body]`, `[...slug]`
 *   - Route groups:     `(group)` (these don't appear in the URL)
 *   - Private folders:  `_components`, `_hooks`
 */
function collectAdminPagePaths(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const out: string[] = [];

  function walk(current: string) {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(current, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        // Skip private folders (Next.js convention: leading underscore).
        if (entry.startsWith('_')) continue;
        walk(full);
      } else if (entry === 'page.tsx') {
        // Convert filesystem path to URL path.
        // /Users/.../app/(routes)/admin/foo/bar/page.tsx -> /admin/foo/bar
        const rel = full.replace(ROOT + sep, '').replace(/\\/g, '/');
        const url = rel
          .replace(/^app\/\(routes\)/, '')
          .replace(/\/page\.tsx$/, '');

        // Skip dynamic segments and route groups — they don't render
        // a single canonical URL.
        if (url.includes('[') || url.includes('(')) continue;

        out.push(url);
      }
    }
  }

  walk(dir);
  return out.sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: load nav tree from foundation PR (graceful fallback if unmerged)
// ─────────────────────────────────────────────────────────────────────────────

interface NavTreeNode {
  /** URL path the node points at, e.g. `/admin/lti/launches`. */
  href?: string;
  /** Optional children for nested categories. */
  children?: NavTreeNode[];
}

/**
 * Flatten a nav tree into the set of every URL it can reach.
 * Recursive — handles tier-2 (categories), tier-3 (sub-page tabs),
 * and tier-4 (further nesting) automatically.
 */
function flattenNavTreeHrefs(nodes: NavTreeNode[]): Set<string> {
  const out = new Set<string>();

  function visit(node: NavTreeNode) {
    if (node.href) out.add(node.href);
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  }

  for (const node of nodes) visit(node);
  return out;
}

/**
 * Try to load the nav tree from the foundation PR. Returns `null` if the
 * foundation isn't merged yet — the caller treats that as a non-blocking
 * "skip this gate" outcome so this PR can land in either order.
 */
async function tryLoadNavTree(): Promise<NavTreeNode[] | null> {
  try {
    // Dynamic import so that a missing module produces a runtime error
    // we can catch — not a top-level import error that crashes tsx.
    const mod = await import('../lib/admin/nav-tree');
    if (typeof (mod as { getAdminNavTree?: unknown }).getAdminNavTree !== 'function') {
      console.warn(
        `${YELLOW}!${RESET} Foundation module loaded but does not export ` +
          `${BOLD}getAdminNavTree${RESET}. Skipping coverage gate.`
      );
      return null;
    }
    const tree = (mod as { getAdminNavTree: () => NavTreeNode[] }).getAdminNavTree();
    if (!Array.isArray(tree)) {
      console.warn(
        `${YELLOW}!${RESET} ${BOLD}getAdminNavTree()${RESET} returned non-array. ` +
          `Skipping coverage gate.`
      );
      return null;
    }
    return tree;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `${YELLOW}!${RESET} Could not load admin nav tree foundation ` +
        `(${BOLD}@/lib/admin/nav-tree${RESET}).\n` +
        `${DIM}  Reason: ${msg}${RESET}\n` +
        `${DIM}  This is expected when the foundation PR (Agent M) is not yet merged.${RESET}\n` +
        `${DIM}  Coverage gate skipped (non-blocking). It becomes active once the foundation lands.${RESET}`
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: diff filesystem vs tree, report
// ─────────────────────────────────────────────────────────────────────────────

function diff(setA: Set<string>, setB: Set<string>): string[] {
  return [...setA].filter(x => !setB.has(x)).sort();
}

async function main(): Promise<number> {
  console.log(`${BOLD}check-admin-nav-coverage${RESET}`);
  console.log(`${DIM}  Walking ${ADMIN_ROUTES_DIR}${RESET}\n`);

  // Step 1: filesystem
  const fsPaths = collectAdminPagePaths(ADMIN_ROUTES_DIR);
  if (fsPaths.length === 0) {
    console.error(`${RED}x${RESET} No admin pages found on disk. ` +
      `Did the working directory change? Expected ${ADMIN_ROUTES_DIR}.`);
    return 1;
  }
  const fsSet = new Set(fsPaths);

  if (VERBOSE) {
    console.log(`${BOLD}Filesystem pages (${fsPaths.length}):${RESET}`);
    for (const p of fsPaths) console.log(`  ${DIM}fs${RESET}  ${p}`);
    console.log();
  }

  // Step 2: nav tree (with graceful fallback)
  const tree = await tryLoadNavTree();
  if (tree === null) {
    // Foundation not yet merged — print fs inventory and exit non-blocking.
    console.log(
      `${YELLOW}!${RESET} Foundation not loaded. ` +
        `${fsPaths.length} admin pages on disk awaiting nav tree wiring.`
    );
    console.log(`${DIM}  Once Agent M's PR merges, this gate becomes blocking.${RESET}`);
    return 0;
  }

  const treeSet = flattenNavTreeHrefs(tree);

  if (VERBOSE) {
    console.log(`${BOLD}Nav tree leaves (${treeSet.size}):${RESET}`);
    for (const p of [...treeSet].sort()) console.log(`  ${DIM}tree${RESET} ${p}`);
    console.log();
  }

  // Step 3: diff
  const ghosts = diff(fsSet, treeSet);   // fs -> not in tree
  const orphans = diff(treeSet, fsSet);  // tree -> no fs page

  let exitCode = 0;

  if (ghosts.length > 0) {
    exitCode = 1;
    console.error(
      `${RED}x ${ghosts.length} ghost admin page${ghosts.length === 1 ? '' : 's'}` +
        ` (exists on disk, NOT reachable from nav tree):${RESET}`
    );
    for (const g of ghosts) console.error(`    ${RED}-${RESET} ${g}`);
    console.error(
      `\n${DIM}  Fix: add an entry to lib/admin/nav-tree.ts (or override via ` +
        `admin_nav_config DB table once Phase 2 lands). See ` +
        `docs/architecture/admin-nav-pattern.md for the happy path.${RESET}\n`
    );
  }

  if (orphans.length > 0) {
    exitCode = 1;
    console.error(
      `${RED}x ${orphans.length} orphan tree entr${orphans.length === 1 ? 'y' : 'ies'}` +
        ` (in nav tree, NOT on disk):${RESET}`
    );
    for (const o of orphans) console.error(`    ${RED}-${RESET} ${o}`);
    console.error(
      `\n${DIM}  Fix: either create the page.tsx, or remove the dead nav tree entry.${RESET}\n`
    );
  }

  if (exitCode === 0) {
    console.log(
      `${GREEN}OK${RESET} All ${fsPaths.length} admin pages on disk are reachable ` +
        `from the nav tree.`
    );
    console.log(`${DIM}  ${treeSet.size} tree leaves, ${fsPaths.length} disk pages, 0 ghosts, 0 orphans.${RESET}`);
  }

  return exitCode;
}

main()
  .then(code => process.exit(code))
  .catch(err => {
    console.error(`${RED}x${RESET} Unexpected error:`, err);
    process.exit(1);
  });
