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
const BADGE_FILE = resolve(ROOT, 'components/bug-reporter/bug-module-badge.tsx');
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

// ─── Extract slugs from bug-module-badge.tsx moduleConfig keys ───────────────
// The badge component has a Record<ModuleName, ...> that maps slugs to
// { label, icon, colorClass }. If a module slug is missing from this Record,
// the badge falls back to 'other' at line 140 — so a bug from a known module
// would silently DISPLAY as "Other" even though the DB classification was
// correct.
function extractBadgeSlugs(src) {
  const slugs = new Set();
  // Find: export const moduleConfig: Record<ModuleName, ...> = {
  const startMatch = src.match(/export const moduleConfig\s*:[^=]*=\s*\{/);
  if (!startMatch) return slugs;
  const startIdx = startMatch.index + startMatch[0].length;

  // Walk to matching closing brace
  let depth = 1, i = startIdx;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  const body = src.slice(startIdx, i - 1);

  // Each entry top-level: 'foo': { ... } OR foo: { ... } (unquoted bare-ident)
  // We capture both quoted ('campus-living') and bare (academic) keys at depth 0.
  // Strategy: walk the body char-by-char tracking brace depth, only capture
  // keys when depth=0.
  let d = 0, j = 0;
  while (j < body.length) {
    const ch = body[j];
    if (ch === '{') d++;
    else if (ch === '}') d--;
    else if (d === 0) {
      // Quoted key
      if (ch === "'" || ch === '"') {
        const quote = ch;
        const end = body.indexOf(quote, j + 1);
        if (end > j) {
          const key = body.slice(j + 1, end);
          // Look for colon after closing quote (allow whitespace)
          const tail = body.slice(end + 1).match(/^\s*:/);
          if (tail) slugs.add(key);
          j = end + 1;
          continue;
        }
      }
      // Bare identifier key (e.g. `academic:`, `learners:`, `admission:`)
      const m = body.slice(j).match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:/);
      if (m && /[\w\}\,\s]/.test(body[j - 1] || ',')) {
        slugs.add(m[1]);
        j += m[0].length;
        continue;
      }
    }
    j++;
  }

  // Drop the 'other' fallback — it's the catch-all, not a real module.
  slugs.delete('other');
  return slugs;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const modulesSrc = readFileSync(MODULES_FILE, 'utf8');
  const tablesSrc = readFileSync(TABLES_FILE, 'utf8');
  const badgeSrc = readFileSync(BADGE_FILE, 'utf8');

  const moduleSlugs = extractModuleSlugs(modulesSrc);
  const caseSlugs = extractCaseSlugs(tablesSrc);
  const badgeSlugs = extractBadgeSlugs(badgeSrc);

  // A module slug is "covered" if EXEMPT or present in the relevant lookup.
  const missingFromCase = [];
  const missingFromBadge = [];
  for (const slug of [...moduleSlugs].sort()) {
    if (EXEMPT_MODULE_SLUGS.has(slug)) continue;
    if (!caseSlugs.has(slug)) {
      // Tolerate the 'organization' singular ↔ 'organizations' plural drift.
      if (!(slug === 'organizations' && caseSlugs.has('organization'))) {
        missingFromCase.push(slug);
      }
    }
    if (!badgeSlugs.has(slug)) missingFromBadge.push(slug);
  }

  // Orphan slugs: present in CASE/badge but not in MODULES.
  const orphansCase = [];
  for (const slug of [...caseSlugs].sort()) {
    if (slug === 'organization' && moduleSlugs.has('organizations')) continue;
    if (!moduleSlugs.has(slug)) orphansCase.push(slug);
  }
  const orphansBadge = [];
  for (const slug of [...badgeSlugs].sort()) {
    if (!moduleSlugs.has(slug)) orphansBadge.push(slug);
  }

  // ─── Report ────────────────────────────────────────────────────────────────
  console.log(`${DIM}bug-module-classifier check — MODULES (TS) ↔ bug_reports CASE (SQL) ↔ moduleConfig (TSX)${RESET}`);
  console.log(`  MODULES slugs:        ${moduleSlugs.size}`);
  console.log(`  CASE slugs:           ${caseSlugs.size}`);
  console.log(`  badge moduleConfig:   ${badgeSlugs.size}`);
  console.log(`  exempt:               ${EXEMPT_MODULE_SLUGS.size}`);
  console.log(`  missing in CASE:      ${RED}${missingFromCase.length}${RESET}`);
  console.log(`  missing in badge:     ${RED}${missingFromBadge.length}${RESET}`);
  console.log(`  orphan in CASE:       ${YELLOW}${orphansCase.length}${RESET}  ${DIM}(in CASE but not MODULES)${RESET}`);
  console.log(`  orphan in badge:      ${YELLOW}${orphansBadge.length}${RESET}  ${DIM}(in moduleConfig but not MODULES)${RESET}`);

  const hasError = missingFromCase.length > 0 || missingFromBadge.length > 0;

  if (VERBOSE || hasError || orphansCase.length > 0 || orphansBadge.length > 0) {
    if (missingFromCase.length > 0) {
      console.log(`\n${RED}MISSING in supabase/setup/01_tables.sql CASE${RESET} — bugs from these modules' URLs will classify as 'other':`);
      for (const slug of missingFromCase) {
        console.log(`  ${RED}✗${RESET} ${slug}`);
      }
      console.log(`\n${DIM}Fix: add to BOTH module_name and sub_module_name CASEs:${RESET}`);
      for (const slug of missingFromCase) {
        console.log(`  ${DIM}WHEN page_url ~ '/${slug}/' THEN '${slug}'${RESET}`);
      }
      console.log(`${DIM}Then write a supabase/migrations/<date>_extend_bug_module_classifier.sql migration.${RESET}`);
    }

    if (missingFromBadge.length > 0) {
      console.log(`\n${RED}MISSING in components/bug-reporter/bug-module-badge.tsx moduleConfig${RESET} — bugs from these modules will display as 'Other' in /admin/bug-reports even when DB classification is correct:`);
      for (const slug of missingFromBadge) {
        console.log(`  ${RED}✗${RESET} ${slug}`);
      }
      console.log(`\n${DIM}Fix: add a moduleConfig entry for each, mirroring the existing pattern (label + icon + Tailwind colorClass + subColorClass).${RESET}`);
    }

    if (orphansCase.length > 0) {
      console.log(`\n${YELLOW}ORPHANS in CASE${RESET} — slugs in SQL but not in MODULES:`);
      for (const slug of orphansCase) console.log(`  ${YELLOW}!${RESET} ${slug}`);
    }
    if (orphansBadge.length > 0) {
      console.log(`\n${YELLOW}ORPHANS in badge${RESET} — slugs in moduleConfig but not in MODULES:`);
      for (const slug of orphansBadge) console.log(`  ${YELLOW}!${RESET} ${slug}`);
    }

    if (VERBOSE) {
      console.log(`\n${DIM}CASE slugs (${caseSlugs.size}):${RESET}`);
      for (const slug of [...caseSlugs].sort()) console.log(`  ${GREEN}✓${RESET} ${slug}`);
      console.log(`\n${DIM}Badge moduleConfig slugs (${badgeSlugs.size}):${RESET}`);
      for (const slug of [...badgeSlugs].sort()) console.log(`  ${GREEN}✓${RESET} ${slug}`);
    }
  } else {
    console.log(`\n${GREEN}✓ No drift — every MODULES slug has a CASE branch AND a badge moduleConfig entry.${RESET}`);
  }

  // Exit code: 1 on missing (hard error), 0 on orphans-only (soft warn) or clean.
  process.exit(hasError ? 1 : 0);
}

main();
