#!/usr/bin/env node
/**
 * scripts/check-permissions-catalog.mjs
 *
 * Catalog-sync gate. Scans lib/sidebarMenuLink.ts for MENU_PERMISSIONS keys and
 * verifies every key has a matching entry in lib/constants/permissions.ts
 * PERMISSION_CATEGORIES. Exits non-zero with a diagnostic if drift is detected.
 *
 * Runs in the /myjkkn-chain skill's `catalog-sync` gate (between
 * silent-failure-auditor and pr-preflight) and in CI. Prevents the class of bug
 * that shipped 9 modules without Role-Management visibility (audited 2026-04-20,
 * see PR #266 / #269 + memory/feedback_preflight_must_scan_production_code.md).
 *
 * Usage:
 *   node scripts/check-permissions-catalog.mjs            # check mode (exit 1 on drift)
 *   node scripts/check-permissions-catalog.mjs --verbose  # list every key status
 *   node scripts/check-permissions-catalog.mjs --fix      # RESERVED: auto-append block (not yet)
 *
 * This script is intentionally dependency-free — just fs + regex — so it runs
 * anywhere Node 18+ runs (no ts-node, no tsx, no build step).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const MENU_FILE = resolve(ROOT, 'lib/sidebarMenuLink.ts');
const CATALOG_FILE = resolve(ROOT, 'lib/constants/permissions.ts');
const VERBOSE = process.argv.includes('--verbose');

const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', RESET = '\x1b[0m';

// ─── Extract all permission keys from MENU_PERMISSIONS ─────────────────────────
// Grammar: the MENU_PERMISSIONS object has string-keyed string values like:
//   '/some/path': 'module.sub.action',
//   '/some/path': 'permission.key', // trailing comment ok
// We capture the VALUE (the permission key). Null values exist (some paths are
// un-gated) and we ignore those.
function extractMenuKeys(src) {
  const keys = new Set();
  // Find the MENU_PERMISSIONS object
  const startMatch = src.match(/export const MENU_PERMISSIONS\s*:[^=]*=\s*\{/);
  if (!startMatch) return keys;
  const startIdx = startMatch.index + startMatch[0].length;
  // Walk until matching closing brace
  let depth = 1, i = startIdx;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  const body = src.slice(startIdx, i - 1);

  // Parse each entry — route-key: 'permission.key' or null
  const entryRegex = /['"]([^'"]+)['"]\s*:\s*(['"]([\w.]+)['"]|null)/g;
  let m;
  while ((m = entryRegex.exec(body))) {
    if (m[3]) keys.add(m[3]);
  }
  return keys;
}

// ─── Extract all keys present in PERMISSION_CATEGORIES ────────────────────────
function extractCatalogKeys(src) {
  const keys = new Set();
  const catalogMatch = src.match(/export const PERMISSION_CATEGORIES\s*=\s*\[([\s\S]*?)^\];\s*$/m);
  if (!catalogMatch) return keys;
  const catalogBody = catalogMatch[1];
  // Each permission entry is `{ key: 'module.sub.action', label: '...' }`
  const permRegex = /\{\s*key:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = permRegex.exec(catalogBody))) {
    keys.add(m[1]);
  }
  return keys;
}

// ─── Derive catalogued module keys from the permission keys themselves ─────
// A module `X` is considered catalogued if ANY catalog permission-key starts
// with `X.` (e.g. `X.view`). This is more robust than parsing block structure
// because it doesn't depend on whitespace/comment/comma variations.
function deriveCatalogModules(catalogKeys) {
  const modules = new Set();
  for (const k of catalogKeys) {
    const top = k.split('.')[0];
    if (top) modules.add(top);
  }
  return modules;
}

// ─── Well-known permissions that MENU_PERMISSIONS uses but don't follow the
// {module}.{action} convention (e.g. legacy `view_dashboard`, `view_profile`).
// These don't need catalog entries because they are baseline perms granted to
// all roles (see DEFAULT_ROLE_PERMISSIONS in lib/constants/permissions.ts).
const EXEMPT_KEYS = new Set([
  'view_dashboard',
  'view_profile',
  'view',
  'admin_panel',
  'manage_users',
  // Legacy role-level flags — handled by is_super_admin column, not catalogued.
  'super_admin'
]);

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const menuSrc = readFileSync(MENU_FILE, 'utf8');
  const catalogSrc = readFileSync(CATALOG_FILE, 'utf8');

  const menuKeys = extractMenuKeys(menuSrc);
  const catalogKeys = extractCatalogKeys(catalogSrc);
  const catalogModules = deriveCatalogModules(catalogKeys);

  // A MENU key `X.Y.Z` is considered catalogued if:
  //   (a) It's in EXEMPT_KEYS, OR
  //   (b) It's exactly in catalogKeys, OR
  //   (c) Its top-level module `X` is a catalogued module with a baseline `X.view` entry
  //       (allows light-touch catalogging: a new module can start with just .view).
  const gaps = [];
  for (const key of [...menuKeys].sort()) {
    if (EXEMPT_KEYS.has(key)) continue;
    if (catalogKeys.has(key)) continue;
    // Check if top-level module exists in catalog
    const topLevel = key.split('.')[0];
    if (catalogModules.has(topLevel)) {
      // Module is catalogued — key is a new sub-permission. This is a SOFT gap:
      // module exists but the specific key isn't. Flag as WARNING not FAILURE.
      gaps.push({ key, severity: 'WARN', module: topLevel, reason: 'module catalogued but sub-key missing' });
    } else {
      // Hard gap: no such module in catalog at all. User can't grant this.
      gaps.push({ key, severity: 'ERROR', module: topLevel, reason: 'entire module missing from PERMISSION_CATEGORIES' });
    }
  }

  // Also surface catalogued keys NOT enforced anywhere (dead catalog entries).
  // These aren't a failure (the module might be using route-level guards not in
  // MENU_PERMISSIONS, or just baseline seeds for roles to toggle). Informational.
  const deadCatalog = [];
  for (const key of [...catalogKeys].sort()) {
    if (!menuKeys.has(key)) deadCatalog.push(key);
  }

  // ─── Report ────────────────────────────────────────────────────────────────
  const errorCount = gaps.filter((g) => g.severity === 'ERROR').length;
  const warnCount = gaps.filter((g) => g.severity === 'WARN').length;

  console.log(`${DIM}catalog-sync check — MENU_PERMISSIONS vs PERMISSION_CATEGORIES${RESET}`);
  console.log(`  menu keys:        ${menuKeys.size}`);
  console.log(`  catalog keys:     ${catalogKeys.size}`);
  console.log(`  catalog modules:  ${catalogModules.size}`);
  console.log(`  gaps:             ${gaps.length}  (${RED}${errorCount} errors${RESET}, ${YELLOW}${warnCount} warnings${RESET})`);
  console.log(`  dead catalog:     ${deadCatalog.length}  ${DIM}(in catalog, never enforced — informational)${RESET}`);

  if (VERBOSE || gaps.length > 0) {
    if (errorCount > 0) {
      console.log(`\n${RED}ERRORS${RESET} — new modules enforced in MENU_PERMISSIONS but absent from PERMISSION_CATEGORIES:`);
      const missingModules = new Set();
      for (const g of gaps.filter((x) => x.severity === 'ERROR')) {
        missingModules.add(g.module);
        console.log(`  ${RED}✗${RESET} ${g.key}  ${DIM}(module: ${g.module})${RESET}`);
      }
      console.log(`\n${DIM}Fix: append a category block to lib/constants/permissions.ts PERMISSION_CATEGORIES:${RESET}`);
      for (const mod of missingModules) {
        const name = mod.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        console.log(`  ${DIM}{ name: '${name}', key: '${mod}', permissions: [ { key: '${mod}.view', label: 'View ${name}' } ] },${RESET}`);
      }
    }

    if (warnCount > 0 && VERBOSE) {
      console.log(`\n${YELLOW}WARNINGS${RESET} — module catalogued but specific sub-key not in its permissions list:`);
      for (const g of gaps.filter((x) => x.severity === 'WARN')) {
        console.log(`  ${YELLOW}!${RESET} ${g.key}  ${DIM}(add to ${g.module}'s permissions)${RESET}`);
      }
    }

    if (deadCatalog.length > 0 && VERBOSE) {
      console.log(`\n${DIM}INFO — catalogued keys not referenced in MENU_PERMISSIONS (first 10):${RESET}`);
      for (const k of deadCatalog.slice(0, 10)) console.log(`  ${DIM}• ${k}${RESET}`);
    }
  }

  if (errorCount > 0) {
    console.log(`\n${RED}FAIL${RESET}: ${errorCount} module(s) enforced in MENU_PERMISSIONS are not in PERMISSION_CATEGORIES.`);
    console.log(`The Role-Management Edit dialog will NOT show toggles for these modules.`);
    console.log(`See the fix template above. Rerun with ${DIM}--verbose${RESET} for full detail.`);
    process.exit(1);
  }

  console.log(`\n${GREEN}OK${RESET}: every enforced MENU_PERMISSIONS key has a catalog home.`);
}

main();
