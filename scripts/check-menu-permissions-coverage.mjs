#!/usr/bin/env node
/**
 * scripts/check-menu-permissions-coverage.mjs
 *
 * Coverage gate — complements check-permissions-catalog.mjs.
 *
 * Verifies every `href` declared in sidebar menu definitions (GetPages) has a
 * matching entry in MENU_PERMISSIONS. Without a MENU_PERMISSIONS entry the
 * filter logic in GetRoleBasedPages hides the menu for every non-super-admin
 * role, even when the user has been granted the underlying permission. This
 * class of bug shipped the HR module in Sprint 1-3 without sidebar visibility
 * for any custom role — see incident 2026-04-22.
 *
 * Usage:
 *   node scripts/check-menu-permissions-coverage.mjs            # CI mode (exit 1 on gap)
 *   node scripts/check-menu-permissions-coverage.mjs --verbose  # list every href status
 *   node scripts/check-menu-permissions-coverage.mjs --unused   # also flag MENU_PERMISSIONS keys no menu uses
 *
 * Dependency-free — fs + regex only. No ts-node / tsx / build step.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const MENU_FILE = resolve(ROOT, 'lib/sidebarMenuLink.ts');
const VERBOSE = process.argv.includes('--verbose');
const SHOW_UNUSED = process.argv.includes('--unused');

const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

// Paths the filter logic always shows regardless of MENU_PERMISSIONS — must be
// kept in sync with GetRoleBasedPages in lib/sidebarMenuLink.ts.
const ALWAYS_VISIBLE = new Set([
  '/',                              // Dashboard — line ~3004 of sidebar
  '/admin/bug-reports',             // Always-visible parent — line ~3007
  '/my-bug-reports',                // Student self-service bug reports
  '/bug-leaderboard',               // Public bug leaderboard
]);

// UUID normalization — mirror of normalizeRoute() in sidebarMenuLink.ts. When
// a menu is built from an activeId (real UUID) but MENU_PERMISSIONS uses the
// static [id] placeholder, both sides are reduced to [id] before comparison.
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const normalize = (href) => href.replace(UUID_REGEX, '[id]');

// ─── Slice the source into its two regions ────────────────────────────────────
function splitRegions(src) {
  // MENU_PERMISSIONS block: `export const MENU_PERMISSIONS ... = { ... };`
  const permsBlockMatch = src.match(/export\s+const\s+MENU_PERMISSIONS[\s\S]*?=\s*\{([\s\S]*?)^\};/m);
  if (!permsBlockMatch) {
    console.error(`${RED}✗ Could not locate MENU_PERMISSIONS object in ${MENU_FILE}${RESET}`);
    process.exit(2);
  }
  const permsBlock = permsBlockMatch[1];
  const permsEndIndex = permsBlockMatch.index + permsBlockMatch[0].length;

  // GetPages function: everything after MENU_PERMISSIONS until the end of file.
  // This contains all the menu trees (`href: '...'` declarations).
  const pagesRegion = src.slice(permsEndIndex);
  return { permsBlock, pagesRegion };
}

// ─── Extract MENU_PERMISSIONS keys (the route paths, not the perm values) ─────
function extractDeclaredPaths(block) {
  const paths = new Set();
  // Match `'key': 'value'` — key must start with `/` (route path) to avoid
  // accidentally picking up comments or string literals in the same region.
  const KV_REGEX = /'(\/[^']*)'\s*:\s*'([^']+)'/g;
  for (const m of block.matchAll(KV_REGEX)) {
    paths.add(m[1]);
  }
  return paths;
}

// ─── Extract every `href: '...'` from menu definitions ────────────────────────
function extractHrefs(pagesRegion) {
  const refs = [];
  const HREF_REGEX = /href:\s*'([^']+)'/g;
  for (const m of pagesRegion.matchAll(HREF_REGEX)) {
    refs.push(m[1]);
  }
  return refs;
}

// ─── Detect parent menus with non-empty submenus ─────────────────────────────
// Per GetRoleBasedPages filter logic (line 3026-3034), a parent menu is shown
// if *any* submenu is accessible — the parent's own href is never looked up in
// MENU_PERMISSIONS. So parents-with-children don't need their own entry.
//
// Fingerprint: top-level menu objects contain `href → icon → submenus: [ {` in
// that order (submenus have `href, label, active` only — no `icon`, no nested
// `submenus`), so the sequence uniquely identifies a parent with children.
function extractParentHrefs(pagesRegion) {
  const parents = new Set();
  // Non-greedy spans bounded to stay within one object literal.
  // [^}] forbids the span from crossing `}` (the object terminator) — this
  // prevents an adjacent sibling's `icon:` / `submenus:` from matching the
  // current href (previously caused false-positive PARENT classification).
  const PARENT_REGEX = /href:\s*'([^']+)'[^}]{0,300}?icon:[^}]{0,200}?submenus:\s*\[\s*\{/g;
  for (const m of pagesRegion.matchAll(PARENT_REGEX)) {
    parents.add(m[1]);
  }
  return parents;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const src = readFileSync(MENU_FILE, 'utf8');
const { permsBlock, pagesRegion } = splitRegions(src);
const declaredPaths = extractDeclaredPaths(permsBlock);
const hrefRaw = extractHrefs(pagesRegion);
const parentHrefs = extractParentHrefs(pagesRegion);

// Normalize hrefs and de-dup
const hrefSet = new Set(hrefRaw.map(normalize));
const parentSet = new Set([...parentHrefs].map(normalize));

// ─── Find missing (href without MENU_PERMISSIONS entry) ───────────────────────
// Parents with non-empty submenus are derived from children — skip them.
const missing = [];
for (const href of hrefSet) {
  if (ALWAYS_VISIBLE.has(href)) continue;
  if (parentSet.has(href)) continue;
  if (declaredPaths.has(href)) continue;
  missing.push(href);
}

// ─── Find unused (MENU_PERMISSIONS entry no menu references) ─────────────────
// Not a failure — menus may be dynamically rendered outside the sidebar tree
// (e.g. shortcuts palette, breadcrumbs). Reported only when --unused is passed.
const unused = [];
if (SHOW_UNUSED) {
  for (const path of declaredPaths) {
    if (!hrefSet.has(path)) unused.push(path);
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────
const header = `${BOLD}Menu ⇄ MENU_PERMISSIONS coverage${RESET} ${DIM}(${MENU_FILE.replace(ROOT, '.')})${RESET}`;
console.log(header);
console.log(`  ${DIM}Declared in MENU_PERMISSIONS:${RESET} ${declaredPaths.size} route path(s)`);
console.log(`  ${DIM}Used by menu href:${RESET}          ${hrefSet.size} unique path(s)`);
console.log(`  ${DIM}Parents with children (skip):${RESET} ${parentSet.size} path(s)`);
console.log(`  ${DIM}Always-visible allowlist:${RESET}   ${ALWAYS_VISIBLE.size} path(s)`);
console.log('');

if (VERBOSE) {
  console.log(`${DIM}All hrefs:${RESET}`);
  for (const href of [...hrefSet].sort()) {
    const status = ALWAYS_VISIBLE.has(href) ? `${YELLOW}ALWAYS${RESET}`
                 : parentSet.has(href)       ? `${DIM}PARENT${RESET}`
                 : declaredPaths.has(href)   ? `${GREEN}OK${RESET}    `
                 : `${RED}MISSING${RESET}`;
    console.log(`  ${status}  ${href}`);
  }
  console.log('');
}

if (missing.length > 0) {
  console.error(`${RED}✗ ${missing.length} menu href(s) have no MENU_PERMISSIONS entry — they will be HIDDEN for every non-super-admin role:${RESET}`);
  for (const href of missing.sort()) {
    console.error(`  ${RED}•${RESET} ${href}`);
  }
  console.error('');
  console.error(`${DIM}Fix:${RESET} add an entry to MENU_PERMISSIONS in ${MENU_FILE.replace(ROOT, '.')}:`);
  console.error(`${DIM}  '${missing[0]}': 'module.submodule.view',${RESET}`);
  console.error('');
  console.error(`${DIM}Then confirm the permission key exists in lib/constants/permissions.ts`);
  console.error(`(run: node scripts/check-permissions-catalog.mjs)${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}✓ All ${hrefSet.size} menu href(s) have MENU_PERMISSIONS coverage.${RESET}`);

if (SHOW_UNUSED && unused.length > 0) {
  console.log('');
  console.log(`${YELLOW}⚠ ${unused.length} MENU_PERMISSIONS entries are not referenced by any menu href${RESET}`);
  console.log(`${DIM}  (may be dead code, or used by palette/breadcrumbs/search rather than sidebar)${RESET}`);
  for (const path of unused.sort()) {
    console.log(`  ${DIM}•${RESET} ${path}`);
  }
}

process.exit(0);
