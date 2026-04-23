#!/usr/bin/env node
/**
 * Nav-coverage assertion — strict discoverability gate.
 *
 * Exits 1 if any static `page.tsx` in `app/(routes)/` is not reachable via
 * a user-clickable link. A page is reachable when ONE of these is true:
 *
 *   1. Its URL appears as a LITERAL `href` value in `lib/sidebarMenuLink.ts`
 *      or any `app/(routes)/<module>/nav-config.ts` (groups[].href,
 *      children[].href).
 *   2. Its URL appears as an EXACT entry in a `matchPaths` array in a
 *      nav-config (exact match, NOT prefix). matchPaths-as-prefix is
 *      retained for active-state resolution but NOT for discoverability.
 *   3. The page.tsx exports `navMeta.invokedFrom = '/parent-page'` — a
 *      documented button/row-click entry point (for Create/Edit forms,
 *      detail views, KPI-card drill-downs, etc.). The invokedFrom value
 *      must itself be a known page URL.
 *   4. The page URL is in the `NAV_EXCLUDE` allowlist below — for genuine
 *      system pages (OAuth callbacks, avatar-menu targets, redirect roots).
 *
 * Prefix-coverage ("some nav path is a prefix of this URL") is NOT
 * sufficient. That check produces false negatives — e.g. a user on
 * `/admission/marketing/expos` has no chip for `/admission/marketing/expos/analytics`
 * even though the analytics URL is prefix-covered by the expos nav entry.
 *
 * Rationale + history: 2026-04-23 audit found 192 "prefix-covered but
 * undiscoverable" pages that the prior prefix-based detector scored as
 * zero orphans. See `specs/mobile-sidebar-bottomnav-spec.md` + the
 * `noble-laureates` critique thread on that date.
 *
 * Run: `npm run check:nav` or `node scripts/assert-nav-coverage.mjs`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROUTES = 'app/(routes)';
const SIDEBAR = 'lib/sidebarMenuLink.ts';

/**
 * Pages that legitimately have no nav surface and no invokedFrom marker.
 * Reserved for OAuth callbacks, avatar-menu targets, redirect-to-first-child
 * module roots, and admin one-shots reachable only by deep link.
 *
 * If you're tempted to add a feature page here, STOP — the page needs either
 * a nav-config entry or a `navMeta.invokedFrom` export instead. This list is
 * for pages that truly have no user-navigable entry point by design.
 */
const NAV_EXCLUDE = new Set([
  // Top-bar avatar / bell targets
  '/profile',
  '/notifications',
  '/notifications/settings',
  '/dashboard',
  '/dashboard/classic',

  // Payment gateway callback landings
  '/billing/payment',
  '/billing/payment/success',
  '/billing/payment/failed',

  // SSO / admin-only one-shots
  '/admin/saml',
  '/admin/reset-driver-passwords',
  '/system',

  // Module root landings — redirect-to-first-child pages
  '/academic',
  '/admin',
  '/audit',
  '/billing',
  '/events',
  '/faculty',
  '/health',
  '/learn',
  '/learners',
  '/organizations',
  '/resource-management',
  '/staff',
  '/startup-studio',
]);

/** Walk app/(routes)/ collecting {url, filePath} for every static page.tsx. */
function walkPages(dir, urlBase = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (/^\[.+\]$/.test(entry.name)) continue; // dynamic route — skip
      const segment = /^\(.*\)$/.test(entry.name) ? '' : '/' + entry.name;
      out.push(...walkPages(fullPath, urlBase + segment));
    } else if (entry.name === 'page.tsx') {
      out.push({ url: urlBase || '/', filePath: fullPath });
    }
  }
  return out;
}

/** Extract literal `href: '/...'` values from a config/sidebar source. */
function extractHrefs(content) {
  const out = [];
  const rx = /['"]?href['"]?\s*:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = rx.exec(content))) {
    if (m[1].startsWith('/')) out.push(m[1]);
  }
  return out;
}

/** Extract individual strings from every `matchPaths: [...]` array. */
function extractMatchPaths(content) {
  const out = [];
  const rx = /matchPaths\s*:\s*\[([^\]]+)\]/g;
  let m;
  while ((m = rx.exec(content))) {
    const strRx = /['"]([^'"]+)['"]/g;
    let s;
    while ((s = strRx.exec(m[1]))) {
      if (s[1].startsWith('/')) out.push(s[1]);
    }
  }
  return out;
}

/** Parse a page.tsx for `export const navMeta = { invokedFrom: '/...' }`. */
function extractInvokedFrom(pageContent) {
  // Find a `navMeta` object literal first — forgive multi-line + nested
  // commas by matching balanced braces lazily.
  const metaMatch = /export\s+const\s+navMeta\s*=\s*\{([\s\S]*?)\n\s*\}/m.exec(
    pageContent
  );
  if (!metaMatch) return null;
  const invokedMatch = /invokedFrom\s*:\s*['"]([^'"]+)['"]/.exec(metaMatch[1]);
  return invokedMatch ? invokedMatch[1] : null;
}

/**
 * Parse --max-orphans from CLI. The baseline decreases as orphan-sweep PRs
 * land; when it hits 0, remove the flag from package.json to enforce strict.
 * Value of 0 (or --strict) = zero tolerance.
 */
function parseMaxOrphans(argv) {
  if (argv.includes('--strict')) return 0;
  const i = argv.indexOf('--max-orphans');
  if (i >= 0 && argv[i + 1] != null) {
    const n = parseInt(argv[i + 1], 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return 0; // strict by default
}

function main() {
  const maxOrphans = parseMaxOrphans(process.argv.slice(2));
  const allPages = walkPages(APP_ROUTES).sort((a, b) =>
    a.url.localeCompare(b.url)
  );
  const staticPages = allPages.filter((p) => !/\[[^\]]+\]/.test(p.url));

  // --- Collect literal hrefs from all nav surfaces ---
  const literalHrefs = new Set();
  const exactMatchPaths = new Set();

  for (const h of extractHrefs(readFileSync(SIDEBAR, 'utf8'))) {
    literalHrefs.add(h);
  }

  for (const entry of readdirSync(APP_ROUTES, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const configPath = join(APP_ROUTES, entry.name, 'nav-config.ts');
    try {
      const content = readFileSync(configPath, 'utf8');
      for (const h of extractHrefs(content)) literalHrefs.add(h);
      // matchPaths as EXACT entries (not prefix — prefix was the old bug)
      for (const p of extractMatchPaths(content)) exactMatchPaths.add(p);
    } catch {
      // No nav-config for this module — OK, module relies on sidebar + navMeta.
    }
  }

  // --- Classify each page ---
  const orphans = [];
  const invokedFromInvalid = []; // invokedFrom value points at a non-existent URL

  const allKnownUrls = new Set(staticPages.map((p) => p.url));

  for (const { url, filePath } of staticPages) {
    if (NAV_EXCLUDE.has(url)) continue;
    if (literalHrefs.has(url)) continue;
    if (exactMatchPaths.has(url)) continue;

    // Fall through — read page.tsx and look for navMeta.invokedFrom
    let invokedFrom = null;
    try {
      invokedFrom = extractInvokedFrom(readFileSync(filePath, 'utf8'));
    } catch {
      // File unreadable — treat as orphan
    }

    if (invokedFrom) {
      // Validate: the invokedFrom target must be a real page URL (or a
      // wildcard like '/admission/leads/[id]' for dynamic parents).
      const targetIsKnown =
        allKnownUrls.has(invokedFrom) ||
        // Dynamic-route parents: strip trailing `[id]`/`[slug]` etc. and try
        // the closest static ancestor.
        [...allKnownUrls].some((u) =>
          invokedFrom.replace(/\/\[[^\]]+\][^/]*/g, '').startsWith(u)
        );
      if (!targetIsKnown) {
        invokedFromInvalid.push({ url, invokedFrom });
      }
      continue; // PASS — documented entry point
    }

    orphans.push(url);
  }

  // --- Report ---
  console.log(`[nav-check] Static pages:           ${staticPages.length}`);
  console.log(`[nav-check] Literal hrefs:          ${literalHrefs.size}`);
  console.log(`[nav-check] Exact matchPath entries:${exactMatchPaths.size}`);
  console.log(`[nav-check] NAV_EXCLUDE:            ${NAV_EXCLUDE.size}`);
  console.log(`[nav-check] Orphan count:           ${orphans.length}`);
  if (invokedFromInvalid.length > 0) {
    console.log(
      `[nav-check] Invalid invokedFrom:    ${invokedFromInvalid.length} (page exports invokedFrom but target doesn't exist)`
    );
  }

  if (orphans.length > 0) {
    console.log('');
    console.log('ORPHAN PAGES — not reachable from any nav surface:');
    for (const o of orphans) console.log(`  ${o}`);
    console.log('');
    console.log('Three ways to resolve each orphan:');
    console.log(
      '  1. Add it as a LITERAL `href` in a nav-config or lib/sidebarMenuLink.ts'
    );
    console.log(
      "     (matchPaths prefix matches DON'T count for discoverability)"
    );
    console.log(
      '  2. In the page.tsx, export `navMeta` documenting the button/row'
    );
    console.log('     that invokes the page:');
    console.log('        export const navMeta = {');
    console.log("          invokedFrom: '/parent-page-that-has-the-button',");
    console.log('        };');
    console.log(
      '  3. If genuinely system-level (callback / avatar menu / redirect root),'
    );
    console.log('     add to NAV_EXCLUDE in this file.');
  }

  if (invokedFromInvalid.length > 0) {
    console.log('');
    console.log('INVALID `invokedFrom` references — target page does not exist:');
    for (const x of invokedFromInvalid) {
      console.log(`  ${x.url}  →  invokedFrom: '${x.invokedFrom}'`);
    }
    console.log('');
    console.log(
      'Fix: either correct the invokedFrom value to an existing page,'
    );
    console.log('     or remove the navMeta export if the page is truly unused.');
  }

  console.log(`[nav-check] Max-orphans gate:      ${maxOrphans}`);

  // Invalid `invokedFrom` references ALWAYS fail — no baseline grace.
  // They indicate broken cross-references, not merely undocumented pages.
  const strictFail = invokedFromInvalid.length > 0;

  // Orphan count is compared to the baseline. Over-baseline fails.
  const orphanFail = orphans.length > maxOrphans;

  if (strictFail || orphanFail) {
    console.log('');
    if (orphanFail) {
      console.log(
        `BUILD-GATE FAIL — orphan count (${orphans.length}) exceeds max-orphans (${maxOrphans}).`
      );
      console.log(
        `Either fix the new orphan(s), or if this was intentional baseline`
      );
      console.log(
        `shrinkage, update package.json's check:nav script to --max-orphans ${orphans.length}.`
      );
    }
    if (strictFail) {
      console.log(
        `BUILD-GATE FAIL — ${invokedFromInvalid.length} page(s) export invalid invokedFrom references.`
      );
    }
    process.exit(1);
  }

  console.log('');
  if (orphans.length === 0) {
    console.log('PASS — every static page is discoverable.');
  } else {
    console.log(
      `PASS (with baseline) — ${orphans.length} orphan(s) within max-orphans=${maxOrphans} tolerance.`
    );
    console.log(
      `Tighten the gate by lowering --max-orphans in package.json as sweep PRs land.`
    );
  }
}

main();
