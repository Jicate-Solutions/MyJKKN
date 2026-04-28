/**
 * Standalone Attention Bar coverage check — verifies every (page, role) pair
 * declared in the spec has an exact Layer 1 default registered.
 *
 * Two gates are enforced:
 *
 *   1. Coverage matrix gate
 *      → Every (page, role) in the v1 matrix MUST resolve to an exact-match
 *        registry entry, NOT to a wildcard fallback. The wildcards exist for
 *        future pages and unknown roles, but the v1 matrix is fully curated.
 *
 *   2. Catch-all presence gate
 *      → A global ('*', '*') entry must exist as the absolute fallback so
 *        the resolver never returns null for an unknown page×role.
 *
 * Usage:
 *   npx tsx scripts/check-attention-bar-coverage.ts
 *
 * Exits 0 when fully covered, 1 when ANY gap is present.
 *
 * Wired into:
 *   - package.json: `npm run check:attention-bar`
 *
 * Why this exists in Phase 1:
 *   - Spec says "every page×role pair must have an entry — no exceptions". A
 *     hand-checked invariant decays. This gate makes it mechanical.
 *   - Future PRs adding a new page to the v1 matrix will fail this gate
 *     until they wire 5 role-specific entries. That's the intent.
 */

import {
  STATIC_DEFAULTS,
  findStaticDefault,
} from '../lib/attention-bar/static-defaults';

// ──────────────────────────────────────────────────────────────────────────
// V1 matrix — kept in sync with spec §3 Layer 1
// ──────────────────────────────────────────────────────────────────────────

const V1_PAGES: readonly string[] = [
  '/dashboard',
  '/admission/leads',
  '/admission/counselors',
  '/academic/attendance/dashboard',
  '/academic/timetables',
  '/billing/invoices',
  '/billing/receipts',
  '/staff',
  '/learners',
  '/system/notifications',
];

const V1_ROLES: readonly string[] = [
  'super_admin',
  'admin',
  'counselor',
  'faculty',
  'hod',
];

// ──────────────────────────────────────────────────────────────────────────
// Gate 1: every v1 (page, role) has an EXACT entry
// ──────────────────────────────────────────────────────────────────────────

let failed = false;
const exactGaps: { page: string; role: string }[] = [];

for (const page of V1_PAGES) {
  for (const role of V1_ROLES) {
    const exact = STATIC_DEFAULTS.find(d => d.page === page && d.role === role);
    if (!exact) {
      exactGaps.push({ page, role });
    }
  }
}

if (exactGaps.length > 0) {
  console.error(`✗ ${exactGaps.length} (page, role) pair${exactGaps.length > 1 ? 's' : ''} missing exact Layer 1 default:`);
  for (const { page, role } of exactGaps) {
    console.error(`    - page=${page}  role=${role}`);
  }
  console.error();
  failed = true;
}

// ──────────────────────────────────────────────────────────────────────────
// Gate 2: catch-all ('*', '*') entry must exist
// ──────────────────────────────────────────────────────────────────────────

const catchAll = findStaticDefault('/__definitely-not-a-real-page__', '__unknown_role__');
if (!catchAll) {
  console.error(`✗ Global catch-all ('*', '*') entry missing from STATIC_DEFAULTS.`);
  console.error(`    The resolver relies on this as the absolute fallback so it never returns null.`);
  console.error();
  failed = true;
}

// ──────────────────────────────────────────────────────────────────────────
// Gate 2b: findStaticDefault() returns the EXACT entry for v1 pairs,
// NOT the catch-all. This tests the resolver lookup path end-to-end —
// catches bugs where the array has the entry but the lookup falls through.
// ──────────────────────────────────────────────────────────────────────────

const lookupGaps: { page: string; role: string; resolvedTo: string }[] = [];

for (const page of V1_PAGES) {
  for (const role of V1_ROLES) {
    const def = findStaticDefault(page, role);
    if (!def) {
      lookupGaps.push({ page, role, resolvedTo: '<null>' });
      continue;
    }
    if (def.page === '*' || def.role === '*') {
      lookupGaps.push({ page, role, resolvedTo: `${def.page}/${def.role}` });
    }
  }
}

if (lookupGaps.length > 0) {
  console.error(`✗ ${lookupGaps.length} v1 pair${lookupGaps.length > 1 ? 's' : ''} fall through to wildcard via findStaticDefault():`);
  for (const { page, role, resolvedTo } of lookupGaps) {
    console.error(`    - page=${page}  role=${role}  →  resolved to wildcard ${resolvedTo}`);
  }
  console.error(`    The resolver lookup is bypassing exact entries. Check insertion order or specificity logic.`);
  console.error();
  failed = true;
}

// ──────────────────────────────────────────────────────────────────────────
// Gate 3: no duplicate (page, role) entries
// ──────────────────────────────────────────────────────────────────────────

const seen = new Map<string, number>();
for (const def of STATIC_DEFAULTS) {
  const key = `${def.page}::${def.role}`;
  seen.set(key, (seen.get(key) ?? 0) + 1);
}

const duplicates = Array.from(seen.entries()).filter(([, n]) => n > 1);
if (duplicates.length > 0) {
  console.error(`✗ ${duplicates.length} duplicate (page, role) entries in STATIC_DEFAULTS:`);
  for (const [key, n] of duplicates) {
    const [page, role] = key.split('::');
    console.error(`    - page=${page}  role=${role}  count=${n}`);
  }
  console.error(`    First match wins per insertion order — duplicates are dead code at best, conflicts at worst.`);
  console.error();
  failed = true;
}

// ──────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────

if (failed) {
  console.error(`✗ Attention Bar coverage check FAILED.\n`);
  process.exit(1);
}

console.log(`✓ Attention Bar Layer 1 coverage healthy:`);
console.log(`    ${V1_PAGES.length} pages × ${V1_ROLES.length} roles = ${V1_PAGES.length * V1_ROLES.length} required exact entries`);
console.log(`    ${STATIC_DEFAULTS.length} total entries in STATIC_DEFAULTS (including catch-all)`);
process.exit(0);
