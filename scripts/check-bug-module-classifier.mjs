#!/usr/bin/env node
/**
 * scripts/check-bug-module-classifier.mjs
 *
 * Catalog-sync gate. Compares the canonical module list in
 * lib/navigation/modules.ts against the bug_reports.module_name CASE
 * expression in supabase/setup/01_tables.sql. Exits non-zero with a
 * diagnostic if drift is detected.
 *
 * Why this exists:
 *   bug_reports.module_name is a PostgreSQL GENERATED column whose CASE
 *   expression hand-maps URL prefixes (`/campus-living/`) to module slugs
 *   ('campus-living'). When a developer adds a new module to MODULES
 *   in lib/navigation/modules.ts but forgets to extend the CASE, all
 *   bugs from that module's URLs silently classify as 'other'.
 *   Audited 2026-05-05: 11 of 34 modules in the CASE; 22 missing —
 *   1,201 historical bugs misclassified across campus-living, service-
 *   requests, faculty, accreditation, etc.
 *
 *   This script enforces parity going forward.
 *
 * Mirrors the shape of scripts/check-permissions-catalog.mjs (existing
 * canonical drift-detector for MENU_PERMISSIONS ↔ PERMISSION_CATEGORIES).
 *
 * Usage:
 *   node scripts/check-bug-module-classifier.mjs            # check (exit 1 on drift)
 *   node scripts/check-bug-module-classifier.mjs --verbose  # list every slug status
 *
 * Dependency-free — fs + regex — runs anywhere Node 18+ runs.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const MODULES_FILE = resolve(ROOT, 'lib/navigation/modules.ts');
const TABLES_FILE = resolve(ROOT, 'supabase/setup/01_tables.sql');
const VERBOSE = process.argv.includes('--verbose');

const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', RESET = '\x1b[0m';

// ─── Slugs that legitimately don't need a CASE branch ────────────────────────
// These are top-level routes that exist as MODULES entries but either:
//   - Are sub-routes mounted UNDER another module's URL prefix (no own /slug/)
//   - Are non-routable special entries (Dashboard with empty slug, top-bar surfaces)
//   - Are intentionally lumped into 'other' for the bug-report dimension
const EXEMPT_MODULE_SLUGS = new Set([
  '',           // Dashboard root — page_url '/' is too noisy to classify
  'dashboard',  // 'Dashboard (Classic)' top-bar surface — overlaps with root
  'profile'     // Top-bar /profile — short prefix could match unintended URLs
]);

// ─── Extract module slugs from MODULES const in lib/navigation/modules.ts ────
function extractModuleSlugs(src) {
  const slugs = new Set();
  // Find: export const MODULES: Module[] = [
  const startMatch = src.match(/export const MODULES\s*:[^=]*=\s*\[/);
  if (!startMatch) return slugs;
  const startIdx = startMatch.index + startMatch[0].length;

  // Walk to matching closing bracket
  let depth = 1, i = startIdx;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '[') depth++;
    else if (c === ']') depth--;
    i++;
  }
  const body = src.slice(startIdx, i - 1);

  // Each entry: { slug: 'foo', label: 'Foo', ... }
  const entryRegex = /\{\s*slug:\s*['"]([^'"]*)['"]/g;
  let m;
  while ((m = entryRegex.exec(body))) {
    slugs.add(m[1]);
  }
  return slugs;
}

// ─── Extract slugs from bug_reports.module_name CASE expression ──────────────
function extractCaseSlugs(src) {
  const slugs = new Set();
  // Find the module_name GENERATED block
  const blockMatch = src.match(/module_name\s+VARCHAR\(\d+\)\s+GENERATED ALWAYS AS\s*\(\s*CASE([\s\S]*?)\s*END\s*\)\s*STORED/);
  if (!blockMatch) return slugs;
  const body = blockMatch[1];

  // Each branch: WHEN page_url ~ '/foo/' THEN 'foo'
  const branchRegex = /THEN\s+'([^']+)'/g;
  let m;
  while ((m = branchRegex.exec(body))) {
    // Skip 'unknown' (NULL handler) and 'other' (fallthrough)
    if (m[1] !== 'unknown' && m[1] !== 'other') {
      slugs.add(m[1]);
    }
  }
  return slugs;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const modulesSrc = readFileSync(MODULES_FILE, 'utf8');
  const tablesSrc = readFileSync(TABLES_FILE, 'utf8');

  const moduleSlugs = extractModuleSlugs(modulesSrc);
  const caseSlugs = extractCaseSlugs(tablesSrc);

  // A module slug is "covered" if EXEMPT or present in CASE.
  // 'organizations' is special — the CASE uses regex `/organizations?/` to
  // match both /organization/ and /organizations/, but the THEN clause is
  // 'organizations' (slug as in modules.ts). Regex check: the slug must
  // appear in the CASE either literally OR via the 'organizations?/' regex
  // prefix. The simple set check handles both because the THEN value is
  // what goes into caseSlugs.
  const missing = [];
  for (const slug of [...moduleSlugs].sort()) {
    if (EXEMPT_MODULE_SLUGS.has(slug)) continue;
    if (caseSlugs.has(slug)) continue;
    // Also tolerate the 'organization' singular ↔ 'organizations' plural drift
    // (CASE THEN 'organizations' covers MODULES slug 'organizations').
    if (slug === 'organizations' && (caseSlugs.has('organization') || caseSlugs.has('organizations'))) continue;
    missing.push(slug);
  }

  // CASE has slugs that aren't in MODULES at all (orphan CASE branches —
  // possible if a module was deleted from MODULES but the CASE wasn't cleaned).
  const orphans = [];
  for (const slug of [...caseSlugs].sort()) {
    if (slug === 'organization' && moduleSlugs.has('organizations')) continue;
    if (!moduleSlugs.has(slug)) orphans.push(slug);
  }

  // ─── Report ────────────────────────────────────────────────────────────────
  console.log(`${DIM}bug-module-classifier check — MODULES (TS) vs bug_reports CASE (SQL)${RESET}`);
  console.log(`  MODULES slugs:    ${moduleSlugs.size}`);
  console.log(`  CASE slugs:       ${caseSlugs.size}`);
  console.log(`  exempt:           ${EXEMPT_MODULE_SLUGS.size}`);
  console.log(`  missing in CASE:  ${RED}${missing.length}${RESET}`);
  console.log(`  orphan in CASE:   ${YELLOW}${orphans.length}${RESET}  ${DIM}(in CASE but not MODULES)${RESET}`);

  if (VERBOSE || missing.length > 0 || orphans.length > 0) {
    if (missing.length > 0) {
      console.log(`\n${RED}MISSING${RESET} — modules in lib/navigation/modules.ts but NOT in supabase/setup/01_tables.sql CASE:`);
      for (const slug of missing) {
        console.log(`  ${RED}✗${RESET} ${slug}  ${DIM}(bugs from /${slug}/* will classify as 'other')${RESET}`);
      }
      console.log(`\n${DIM}Fix: extend the CASE expression in supabase/setup/01_tables.sql AND add a migration.${RESET}`);
      console.log(`${DIM}Template branch (place in BOTH module_name and sub_module_name CASEs):${RESET}`);
      for (const slug of missing) {
        console.log(`  ${DIM}WHEN page_url ~ '/${slug}/' THEN '${slug}'${RESET}`);
      }
    }

    if (orphans.length > 0) {
      console.log(`\n${YELLOW}ORPHANS${RESET} — slugs in CASE but not in MODULES:`);
      for (const slug of orphans) {
        console.log(`  ${YELLOW}!${RESET} ${slug}  ${DIM}(remove from CASE OR add to MODULES)${RESET}`);
      }
    }

    if (VERBOSE) {
      console.log(`\n${DIM}Covered slugs (${caseSlugs.size}):${RESET}`);
      for (const slug of [...caseSlugs].sort()) console.log(`  ${GREEN}✓${RESET} ${slug}`);
    }
  } else {
    console.log(`\n${GREEN}✓ No drift — every MODULES slug has a CASE branch.${RESET}`);
  }

  // Exit code: 1 on missing (hard error), 0 on orphans-only (soft warn) or clean.
  process.exit(missing.length > 0 ? 1 : 0);
}

main();
