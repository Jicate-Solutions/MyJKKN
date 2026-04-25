/**
 * Standalone sidebar health check — runs the validator against a no-auth,
 * unfiltered view of the sidebar config.
 *
 * Two gates are enforced:
 *
 *   1. Flat-sidebar gate (via lib/sidebar-validator.ts)
 *      → Any group with ≥15 top-level items, or a submenu with ≥15 flat
 *        children, is a blocking error. 8+ is a warning.
 *
 *   2. Missing-page.tsx gate (scanner below)
 *      → Any folder under app/(routes)/** that has ROUTE children
 *        (excluding _components, _actions, dynamic [id], route groups (x))
 *        but no page.tsx at its own level is a blocking error IF either:
 *          (a) the folder's path appears as an href: in lib/sidebarMenuLink.ts
 *              (meaning the sidebar will link to a 404), or
 *          (b) the folder is one of the 17 KNOWN module/section landings that
 *              were fixed in PRs #341–#348 (seed list — prevents regression).
 *        Otherwise, it's emitted as a warning (folder may not be reachable
 *        yet; could just be a scaffold for a future route).
 *
 * Usage:
 *   npx tsx scripts/check-sidebar-health.ts
 *
 * Exits 0 when healthy, 1 when ANY error-level issue is present.
 *
 * Why not just import GetRoleBasedPages? Because it requires a pathname and
 * a RolePermissionData. For structural validation we just need the raw menu
 * config — passing a dummy pathname and super-admin role gives us everything
 * without needing DB access.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { GetRoleBasedPages } from '../lib/sidebarMenuLink';
import {
  validateSidebar,
  assertSidebarHealthy,
} from '../lib/sidebar-validator';

// ────────────────────────────────────────────────────────────────────────────
// Gate 1: Flat-sidebar validator (existing behavior — untouched)
// ────────────────────────────────────────────────────────────────────────────

const groups = GetRoleBasedPages('/', {
  role_key: 'super_admin',
  permissions: {},
});

const issues = validateSidebar(groups);
const errors = issues.filter((i) => i.severity === 'error');
const warns = issues.filter((i) => i.severity === 'warn');

console.log(`\n=== Sidebar Health Check ===`);
console.log(`Groups analyzed: ${groups.length}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warns.length}\n`);

if (warns.length > 0) {
  console.log(`⚠  WARNINGS (non-blocking):`);
  warns.forEach((w) => console.log(`   ${w.path}: ${w.message}`));
  console.log('');
}

if (errors.length > 0) {
  console.log(`✗  BLOCKING ISSUES:`);
  errors.forEach((e) => console.log(`   ${e.path}: ${e.message}`));
  console.log('');
}

// ────────────────────────────────────────────────────────────────────────────
// Gate 2: Missing-page.tsx scanner
// ────────────────────────────────────────────────────────────────────────────
//
// Flags any route folder under app/(routes) that has children but no page.tsx
// at its own level. This is the class of bug where the sidebar links to
// /billing but /billing itself 404s because there's only /billing/receipts,
// /billing/invoices, etc. — with no landing page at the module root.
//
// Seed list: 17 module/section landings fixed in PRs #341–#348. These MUST
// always have a page.tsx — regression-blocker list.

const ROOT = resolve(__dirname, '..');
const ROUTES_ROOT = join(ROOT, 'app', '(routes)');
const SIDEBAR_FILE = join(ROOT, 'lib', 'sidebarMenuLink.ts');

// Seed list (17 recently-fixed landings) — any of these missing page.tsx
// when the folder exists is always an error, regardless of whether the
// sidebar currently links to it.
const SEED_REQUIRED_LANDINGS: readonly string[] = [
  'billing',
  'billing/payment',
  'faculty',
  'faculty/pde',
  'admin',
  'admin/lti',
  'admin/pde',
  'organizations',
  'learn',
  'health',
  'learners',
  'learners/leave-onduty',
  'system',
  'staff',
  'solutions/settings',
  'okr/admin',
  'accreditation/naac/surveys',
  'admission/marketing',
  'admission/data-quality',
  'academic',
  'academic/leave-onduty',
];

// Folders to ignore at ANY depth when counting "children"
const IGNORED_FOLDER_NAMES = new Set([
  '_components',
  '_actions',
  '_hooks',
  '_utils',
  '_lib',
  '_types',
  '_data',
  '_constants',
  '_schemas',
  '_styles',
  '_assets',
  '__tests__',
]);

function isRouteChildFolder(name: string): boolean {
  // Skip hidden dirs
  if (name.startsWith('.')) return false;
  // Skip private (Next.js convention) / test / asset folders
  if (IGNORED_FOLDER_NAMES.has(name)) return false;
  // Skip dynamic segments [id], [...slug], [[...optional]]
  if (name.startsWith('[')) return false;
  // Skip route groups (group) — they're organizational, not real URL segments
  if (name.startsWith('(') && name.endsWith(')')) return false;
  return true;
}

interface PageMissIssue {
  severity: 'error' | 'warn';
  path: string; // relative route path, e.g. "billing/payment"
  reason: string;
}

const pageIssues: PageMissIssue[] = [];

// Extract all href: '/foo/bar' strings from sidebarMenuLink.ts so we can
// decide whether a missing-page.tsx folder is "reachable from sidebar".
function extractSidebarHrefs(): Set<string> {
  const src = readFileSync(SIDEBAR_FILE, 'utf8');
  const hrefs = new Set<string>();
  // Match both single and double-quoted href values. Skip href: string (the
  // type declarations) by requiring a quote as the first non-space char.
  const re = /href:\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const href = m[1];
    if (href && href.startsWith('/')) {
      // Normalize — strip leading "/", strip trailing "/", strip query/hash
      const clean = href.replace(/[?#].*$/, '').replace(/^\/+/, '').replace(/\/+$/, '');
      if (clean.length > 0) hrefs.add(clean);
    }
  }
  return hrefs;
}

const sidebarHrefs = extractSidebarHrefs();

// Walk app/(routes) recursively.
function walk(dirAbs: string, relPath: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dirAbs);
  } catch {
    return;
  }

  const childRouteFolders = entries.filter((e) => {
    const full = join(dirAbs, e);
    try {
      return statSync(full).isDirectory() && isRouteChildFolder(e);
    } catch {
      return false;
    }
  });

  const hasPageTsx = existsSync(join(dirAbs, 'page.tsx')) ||
                     existsSync(join(dirAbs, 'page.ts')) ||
                     existsSync(join(dirAbs, 'page.jsx')) ||
                     existsSync(join(dirAbs, 'page.js'));

  // Only evaluate folders that have route children AND are not the top
  // app/(routes) root itself (that root is handled by app/(routes)/layout.tsx
  // + the root-level page at app/page.tsx, not by (routes)/page.tsx).
  if (relPath !== '' && childRouteFolders.length > 0 && !hasPageTsx) {
    // Decide severity
    const inSeed = SEED_REQUIRED_LANDINGS.includes(relPath);
    const inSidebar = sidebarHrefs.has(relPath);

    if (inSeed) {
      pageIssues.push({
        severity: 'error',
        path: relPath,
        reason:
          `SEED landing has ${childRouteFolders.length} child route(s) but no page.tsx. ` +
          `This path was fixed in PRs #341–#348; adding children without a landing page regresses the fix.`,
      });
    } else if (inSidebar) {
      pageIssues.push({
        severity: 'error',
        path: relPath,
        reason:
          `Sidebar links to /${relPath} but this folder has ${childRouteFolders.length} child route(s) and no page.tsx — the link will 404. Add app/(routes)/${relPath}/page.tsx.`,
      });
    } else {
      // Scaffold-only: folder has children, not linked, not in seed list.
      // Warn so it's visible but don't block.
      pageIssues.push({
        severity: 'warn',
        path: relPath,
        reason:
          `Folder has ${childRouteFolders.length} child route(s) but no page.tsx at its own level. If this path is meant to be reachable, add a landing page.`,
      });
    }
  }

  // Recurse into each child
  for (const child of childRouteFolders) {
    walk(join(dirAbs, child), relPath === '' ? child : `${relPath}/${child}`);
  }
}

walk(ROUTES_ROOT, '');

const pageErrors = pageIssues.filter((i) => i.severity === 'error');
const pageWarns = pageIssues.filter((i) => i.severity === 'warn');

console.log(`=== Route Folder page.tsx Scan ===`);
console.log(`Seed landings tracked: ${SEED_REQUIRED_LANDINGS.length}`);
console.log(`Sidebar hrefs extracted: ${sidebarHrefs.size}`);
console.log(`Errors: ${pageErrors.length}`);
console.log(`Warnings: ${pageWarns.length}\n`);

if (pageWarns.length > 0) {
  console.log(`⚠  WARNINGS (non-blocking — scaffold-only folders):`);
  pageWarns.forEach((w) => console.log(`   ${w.path}: ${w.reason}`));
  console.log('');
}

if (pageErrors.length > 0) {
  console.log(`✗  BLOCKING ISSUES (missing page.tsx on reachable folders):`);
  pageErrors.forEach((e) => console.log(`   ${e.path}: ${e.reason}`));
  console.log('');
}

// ────────────────────────────────────────────────────────────────────────────
// Final verdict — non-zero exit if ANY gate failed
// ────────────────────────────────────────────────────────────────────────────

let failed = false;

try {
  assertSidebarHealthy(groups);
} catch (err) {
  console.error(`${(err as Error).message}\n`);
  failed = true;
}

if (pageErrors.length > 0) {
  console.error(
    `Missing page.tsx on ${pageErrors.length} reachable route folder${pageErrors.length > 1 ? 's' : ''}. Each of these will 404 in production. See list above.\n`
  );
  failed = true;
}

if (failed) {
  console.error(`✗ Sidebar health check FAILED.\n`);
  process.exit(1);
}

console.log(`✓ Sidebar structure is healthy (no blocking issues).`);
process.exit(0);
