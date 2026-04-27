#!/usr/bin/env tsx
/**
 * Permissions Audit Coverage Gate.
 *
 * Fails CI when the Permissions Audit dashboard would render gray
 * "indeterminate" CRUD badges or "0/0 routes" stats due to drift between:
 *
 *   - `getAllModuleNames()` in lib/constants/table-module-map.ts
 *     (the canonical module list)
 *   - `MODULE_TO_CATEGORY_KEY` in lib/permissions-audit/module-mappings.ts
 *     (display name → PERMISSION_CATEGORIES.key)
 *   - `ROUTE_PREFIX_TO_MODULE` in lib/permissions-audit/module-mappings.ts
 *     (top-level URL prefix → display name)
 *   - `MENU_PERMISSIONS` in lib/sidebarMenuLink.ts (every navigable URL)
 *
 * History (2026-04-27): User Resolver tab on production showed every CEO
 * module as gray null because 8+ canonical modules had no category-key
 * mapping, and 238 of 535 sidebar routes fell through to no module
 * because ROUTE_PREFIX_TO_MODULE only covered 19 of 41 top-level prefixes.
 *
 * Pattern modeled on scripts/check-nav-reachability.ts (the permanent gate
 * for "pages keep going missing"). Run via:
 *   npx tsx scripts/check-permission-audit-coverage.ts
 */

import {
  MODULE_TO_CATEGORY_KEY,
  ROUTE_PREFIX_TO_MODULE,
  ROUTE_EXCLUDE,
  MODULE_WITHOUT_CATEGORY,
  getModuleForRoute,
  getAllAuditModuleNames,
} from '../lib/permissions-audit/module-mappings';
import { PERMISSION_CATEGORIES } from '../lib/constants/permissions';
import { MENU_PERMISSIONS } from '../lib/sidebarMenuLink';

const errors: string[] = [];
const warnings: string[] = [];

// ── Check 1: every module has a category key OR is on the explicit
// no-catalog allowlist. ──
const allModules = getAllAuditModuleNames();
const categoryKeys = new Set(PERMISSION_CATEGORIES.map((c) => c.key));

for (const moduleName of allModules) {
  const cat = MODULE_TO_CATEGORY_KEY[moduleName];
  if (!cat) {
    if (MODULE_WITHOUT_CATEGORY.has(moduleName)) continue;
    errors.push(
      `[category] Module "${moduleName}" has no PERMISSION_CATEGORIES key ` +
        `mapping in MODULE_TO_CATEGORY_KEY and is not in MODULE_WITHOUT_CATEGORY. ` +
        `Add an override in lib/permissions-audit/module-mappings.ts.`,
    );
  } else if (!categoryKeys.has(cat)) {
    errors.push(
      `[category] Module "${moduleName}" maps to category "${cat}" but no ` +
        `such key exists in PERMISSION_CATEGORIES.`,
    );
  }
}

// ── Check 2: every route in MENU_PERMISSIONS resolves to a module via
// `getModuleForRoute`, OR is in ROUTE_EXCLUDE. ──
for (const route of Object.keys(MENU_PERMISSIONS)) {
  if (ROUTE_EXCLUDE.has(route)) continue;
  const m = getModuleForRoute(route);
  if (!m) {
    errors.push(
      `[route] Route "${route}" has no entry in ROUTE_PREFIX_TO_MODULE. ` +
        `Add a prefix mapping in lib/permissions-audit/module-mappings.ts.`,
    );
  }
}

// ── Check 3: every module display name referenced by ROUTE_PREFIX_TO_MODULE
// must exist in `getAllAuditModuleNames()` — that's the union of table-derived
// modules and CATEGORY_ONLY_MODULES. Otherwise routes get assigned to a
// phantom module that the unified API will silently drop. ──
const moduleSet = new Set(allModules);
for (const [prefix, mod] of ROUTE_PREFIX_TO_MODULE) {
  if (!moduleSet.has(mod)) {
    errors.push(
      `[route-target] Prefix "${prefix}" maps to module "${mod}" which is ` +
        `not in getAllAuditModuleNames(). Remove the prefix, add the module ` +
        `to lib/constants/table-module-map.ts, or add it to ` +
        `CATEGORY_ONLY_MODULES.`,
    );
  }
}

// ── Soft warning: prefixes that don't match any current MENU_PERMISSIONS
// entry (might be dead). Doesn't fail the gate — keeping them future-proofs
// against new sidebar additions. ──
const allRoutes = Object.keys(MENU_PERMISSIONS);
for (const [prefix] of ROUTE_PREFIX_TO_MODULE) {
  const used = allRoutes.some(
    (r) => r === prefix || r.startsWith(prefix + '/'),
  );
  if (!used) {
    warnings.push(
      `[unused-prefix] "${prefix}" matches no current MENU_PERMISSIONS entry. ` +
        `Likely future-proofing — fine to keep, but worth a glance.`,
    );
  }
}

// ── Report ──
if (warnings.length) {
  console.warn('\nWarnings:');
  for (const w of warnings) console.warn('  ' + w);
}

if (errors.length) {
  console.error('\nPermissions Audit coverage gate FAILED:');
  for (const e of errors) console.error('  ' + e);
  console.error(
    `\n${errors.length} error(s). Fix above and re-run: ` +
      `npx tsx scripts/check-permission-audit-coverage.ts`,
  );
  process.exit(1);
}

console.log(
  `\nPermissions Audit coverage gate PASSED. ` +
    `${allModules.length} modules, ${allRoutes.length} routes, ` +
    `${ROUTE_PREFIX_TO_MODULE.length} prefixes, ` +
    `${MODULE_WITHOUT_CATEGORY.size} no-catalog allowlist entries.`,
);
process.exit(0);
