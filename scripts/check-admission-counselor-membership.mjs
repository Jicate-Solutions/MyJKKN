#!/usr/bin/env node
/**
 * scripts/check-admission-counselor-membership.mjs
 *
 * CI guard for the dual-table admission-counselor contract documented at
 * docs/architecture/admission-counselor-membership.md.
 *
 * Locked by Director decision 2026-05-03 (P0-3 of session brief). The platform
 * supports multi-role users where someone can be a member of admission_counselors
 * while holding a different profiles.role. Treating profiles.role='admission_counselor'
 * as the source of truth for "is this user a valid counselor?" produces false
 * negatives — caused the 2026-05-03 audit to flag 2,348 legitimate assignments
 * as "tainted."
 *
 * Scope: scans .ts/.tsx files for the highest-risk JS-side drift pattern:
 *
 *   .eq('role', 'admission_counselor')   // Supabase chain
 *
 * outside whitelisted paths. Intentionally narrow to avoid false positives on
 * setup-function role-permission filters (which are correct in their context).
 *
 * Usage:
 *   node scripts/check-admission-counselor-membership.mjs            # check (exit 1 on drift)
 *   node scripts/check-admission-counselor-membership.mjs --verbose  # show whitelist hits too
 */
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const ROOT = process.cwd();
const VERBOSE = process.argv.includes('--verbose');

const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

// Paths to scan
const SCAN_DIRS = ['app', 'lib'];

// Allowed paths where the pattern is legitimate (test fixtures, the canonical role-check itself)
const ALLOWLIST_PREFIXES = [
  'app/auth/test-login/',
  '__tests__/',
  'lib/auth/',
];

// The forbidden pattern: .eq('role', 'admission_counselor') in any quoting style
const FORBIDDEN_RE = /\.eq\(\s*['"]role['"]\s*,\s*['"]admission_counselor['"]\s*\)/;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
      yield* walk(full);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

function isAllowlisted(relPath) {
  return ALLOWLIST_PREFIXES.some(prefix => relPath.startsWith(prefix));
}

const violations = [];
const whitelist_hits = [];

for (const scanDir of SCAN_DIRS) {
  const absDir = resolve(ROOT, scanDir);
  try {
    statSync(absDir);
  } catch {
    continue;
  }
  for (const file of walk(absDir)) {
    const relPath = relative(ROOT, file);
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, idx) => {
      if (FORBIDDEN_RE.test(line)) {
        const hit = { file: relPath, line: idx + 1, text: line.trim() };
        if (isAllowlisted(relPath)) whitelist_hits.push(hit);
        else violations.push(hit);
      }
    });
  }
}

if (VERBOSE && whitelist_hits.length) {
  console.log(`${DIM}Whitelisted occurrences (allowed):${RESET}`);
  for (const h of whitelist_hits) console.log(`  ${DIM}${h.file}:${h.line}${RESET}  ${h.text}`);
  console.log('');
}

if (violations.length === 0) {
  console.log(`${GREEN}✓ admission-counselor membership: no drift found${RESET}`);
  console.log(`${DIM}  scanned ${SCAN_DIRS.join(' + ')} for .eq('role', 'admission_counselor') outside ${ALLOWLIST_PREFIXES.length} whitelisted paths${RESET}`);
  process.exit(0);
}

console.error(`${RED}${BOLD}✗ admission-counselor membership drift detected${RESET}`);
console.error(`${RED}  ${violations.length} occurrence(s) of .eq('role', 'admission_counselor') outside whitelisted paths${RESET}\n`);
for (const v of violations) {
  console.error(`  ${YELLOW}${v.file}:${v.line}${RESET}`);
  console.error(`    ${v.text}`);
}
console.error(`\n${DIM}See docs/architecture/admission-counselor-membership.md for the dual-table contract.${RESET}`);
console.error(`${DIM}If you really need to filter on profiles.role here, JOIN through admission_counselors.user_id instead.${RESET}`);
console.error(`${DIM}If this file is a test fixture, add its path prefix to ALLOWLIST_PREFIXES in this script.${RESET}\n`);
process.exit(1);
