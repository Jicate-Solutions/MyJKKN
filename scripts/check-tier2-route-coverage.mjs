#!/usr/bin/env node
/**
 * scripts/check-tier2-route-coverage.mjs
 *
 * Filesystem-driven coverage gate — closes the structural permission-leak
 * class that PR #511 patched for /billing/payment.
 *
 * Why this script exists:
 *   `scripts/check-menu-permissions-coverage.mjs` walks SIDEBAR declarations
 *   (GetPages → href) and checks each href has a MENU_PERMISSIONS entry. But
 *   AutoTabNav (`components/navigation/auto-tab-nav.tsx:127-133`) renders
 *   chips from the FILESYSTEM route manifest, not the sidebar tree. A page
 *   that exists on disk but has no MENU_PERMISSIONS entry default-allows for
 *   every authenticated role — the chip leaks even when the user has no
 *   business seeing the underlying data.
 *
 *   This gate walks `app/(routes)/**` and asserts every public tier-2 page
 *   either:
 *     (a) has a MENU_PERMISSIONS entry in lib/sidebarMenuLink.ts, OR
 *     (b) is on the ALWAYS_VISIBLE allow-list below (intentional user-self-
 *         service surface — e.g. /dashboard, /notifications).
 *
 * Mirrors the audit query that surfaced the original 23 leaks (2026-04-26):
 *
 *   comm -23 \
 *     <(find "app/(routes)" -mindepth 2 -maxdepth 3 -name "page.tsx" \
 *         | sed -E 's|app/\(routes\)||;s|/page\.tsx||' \
 *         | grep -vE '\(|\[' | sort -u) \
 *     <(grep -oE "'/[a-z][a-z0-9/-]+'" lib/sidebarMenuLink.ts \
 *         | tr -d "'" | grep -vE '\[|\(' | sort -u)
 *
 * Usage:
 *   node scripts/check-tier2-route-coverage.mjs            # CI mode (exit 1 on gap)
 *   node scripts/check-tier2-route-coverage.mjs --verbose  # list every route status
 *
 * Dependency-free — fs + regex only, no tsx/ts-node/build step.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';

const ROOT = process.cwd();
const ROUTES_DIR = resolve(ROOT, 'app/(routes)');
const MENU_FILE = resolve(ROOT, 'lib/sidebarMenuLink.ts');
const VERBOSE = process.argv.includes('--verbose');

const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

// ─── Allow-list (always-visible — intentional user-self-service surfaces) ─────
// These routes are reachable from every authenticated user's chip strip without
// a permission check. Matches the spirit of `ALWAYS_VISIBLE` in
// check-menu-permissions-coverage.mjs but driven by filesystem reality, not
// sidebar declarations.
//
// Adding to this list = decision that the route is universally visible. If a
// route should be perm-gated, add it to MENU_PERMISSIONS in
// lib/sidebarMenuLink.ts instead.
const ALWAYS_VISIBLE = new Set([
  '/',                       // Root (already in MENU_PERMISSIONS as 'view_dashboard'; here for safety)
  '/dashboard',              // Operational Nervous System dashboard (every user)
  '/dashboard/classic',      // Legacy dashboard preserved for 60-day grace (every user)
  '/notifications',          // Notification inbox (every user's own)
  '/notifications/settings', // Notification preferences (every user's own)
  '/admin/bug-reports',      // Always-visible parent — mirrored from sidebar gate
  '/my-bug-reports',         // Student self-service bug reports
  '/bug-leaderboard',        // Public bug leaderboard
  '/auth/test-login',        // Dev-only test login (excluded from prod build anyway)
]);

// ─── Tier-2 route discovery (filesystem walk) ────────────────────────────────
// Walks `app/(routes)/**` to depth ≤3 (matching the spec's mindepth=2 maxdepth=3).
// Excludes:
//   - dynamic segments `[id]`, `[slug]` (rendered per-instance, not per-chip)
//   - route groups `(...)` (folder-only, no URL impact)
//   - segments starting with `_` (Next.js private folders)
// Returns canonical route paths like `/bos/meetings`.
function discoverRoutes(dir, depth = 0, prefix = '', out = []) {
  if (depth > 2) return out;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  // If this directory has page.tsx, register its URL prefix. Mirrors the
  // spec's `find app/(routes) -mindepth 2 -maxdepth 3 -name page.tsx`:
  //   depth 0 = (routes) itself (no URL — skipped naturally because prefix='')
  //   depth 1 = top-level module page.tsx (URL `/bos`)             — INCLUDE
  //   depth 2 = tier-2 page.tsx           (URL `/bos/meetings`)    — INCLUDE
  //   depth 3+ = tier-3 page.tsx          (URL `/bos/meetings/x`)  — EXCLUDE
  // Tier-3 routes are typically button-invoked detail/edit pages (navMeta
  // .invokedFrom), not chip-rendered, so they're outside the leak class
  // covered by this gate.
  if (depth >= 1 && entries.includes('page.tsx')) {
    out.push(prefix);
  }
  // Recurse into subdirectories.
  for (const entry of entries) {
    if (entry.startsWith('_')) continue;       // Next.js private folder
    if (entry.startsWith('(') && entry.endsWith(')')) {
      // Route group — descend without consuming a URL segment.
      const sub = join(dir, entry);
      try {
        if (statSync(sub).isDirectory()) {
          discoverRoutes(sub, depth, prefix, out);
        }
      } catch { /* ignore */ }
      continue;
    }
    if (entry.startsWith('[') && entry.endsWith(']')) continue; // dynamic segment
    const sub = join(dir, entry);
    let s;
    try { s = statSync(sub); } catch { continue; }
    if (!s.isDirectory()) continue;
    discoverRoutes(sub, depth + 1, `${prefix}/${entry}`, out);
  }
  return out;
}

// ─── Extract every route path declared in sidebarMenuLink.ts ─────────────────
// Mirrors the original audit query (RHS of the `comm -23` two-way diff):
//
//   grep -oE "'/[a-z][a-z0-9/-]+'" lib/sidebarMenuLink.ts \
//     | tr -d "'" | grep -vE '\[|\(' | sort -u
//
// This captures BOTH:
//   (a) MENU_PERMISSIONS keys — the perm-gating surface AutoTabNav consumes
//       directly via `MENU_PERMISSIONS[normalizeRoute(href)]`
//   (b) GetPages href values — explicit sidebar declarations. A href listed
//       here without a MENU_PERMISSIONS key is hidden from non-super-admins
//       by the existing `check:menu-coverage` gate (so it can't actually
//       leak through the sidebar surface).
//
// A route covered by either surface is NOT a default-allow chip leak in
// AutoTabNav: (a) blocks the leak directly; (b) means the route is wired
// into the sidebar gate which already exit-1s on missing MENU_PERMISSIONS.
//
// A route covered by NEITHER is the bug class PR #511 patched: a page that
// exists on disk, gets discovered by the filesystem manifest at chip-render
// time, and default-allows because no entry exists anywhere.
function extractDeclaredPaths(src) {
  const paths = new Set();
  // Match single-quoted route literals starting with `/` followed by a
  // lowercase letter. Mirrors the audit grep `'/[a-z][a-z0-9/-]+'`. Excludes
  // dynamic / route-group placeholders so the match aligns with the
  // discovered-routes set (which strips those too).
  const ROUTE_LITERAL = /'(\/[a-z][a-z0-9/_-]*)'/g;
  for (const m of src.matchAll(ROUTE_LITERAL)) {
    const route = m[1];
    if (route.includes('[') || route.includes('(')) continue;
    paths.add(route);
  }
  return paths;
}

// ─── Main ────────────────────────────────────────────────────────────────────
const src = readFileSync(MENU_FILE, 'utf8');
const declaredPaths = extractDeclaredPaths(src);
const discovered = discoverRoutes(ROUTES_DIR).map(r => r.split(sep).join('/')).sort();

const missing = [];
for (const route of discovered) {
  if (ALWAYS_VISIBLE.has(route)) continue;
  if (declaredPaths.has(route)) continue;
  missing.push(route);
}

const header = `${BOLD}Tier-2 route ⇄ MENU_PERMISSIONS coverage${RESET} ${DIM}(filesystem-driven)${RESET}`;
console.log(header);
console.log(`  ${DIM}Discovered routes (page.tsx at depth 2-3):${RESET} ${discovered.length}`);
console.log(`  ${DIM}MENU_PERMISSIONS entries:${RESET}              ${declaredPaths.size}`);
console.log(`  ${DIM}Always-visible allow-list:${RESET}             ${ALWAYS_VISIBLE.size}`);
console.log('');

if (VERBOSE) {
  console.log(`${DIM}All discovered routes:${RESET}`);
  for (const route of discovered) {
    const status = ALWAYS_VISIBLE.has(route) ? `${YELLOW}ALWAYS${RESET} `
                 : declaredPaths.has(route)  ? `${GREEN}OK${RESET}     `
                                             : `${RED}MISSING${RESET}`;
    console.log(`  ${status}  ${route}`);
  }
  console.log('');
}

if (missing.length > 0) {
  console.error(
    `${RED}✗ ${missing.length} tier-2 route(s) on disk have no MENU_PERMISSIONS ` +
    `entry — chips for these will leak to every role via AutoTabNav default-allow:${RESET}`
  );
  for (const route of missing.sort()) {
    console.error(`  ${RED}•${RESET} ${route}`);
  }
  console.error('');
  console.error(`${DIM}Fix one of:${RESET}`);
  console.error(`${DIM}  (a) add an entry to MENU_PERMISSIONS in lib/sidebarMenuLink.ts:${RESET}`);
  console.error(`${DIM}        '${missing[0]}': 'module.submodule.view',${RESET}`);
  console.error(`${DIM}  (b) if it should be visible to every role, add to ALWAYS_VISIBLE${RESET}`);
  console.error(`${DIM}      at the top of this script.${RESET}`);
  console.error('');
  console.error(`${DIM}Then ensure the permission key exists in lib/constants/permissions.ts`);
  console.error(`(run: node scripts/check-permissions-catalog.mjs)${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}✓ All ${discovered.length} discovered tier-2 route(s) are covered (perm-gated or always-visible).${RESET}`);
process.exit(0);
