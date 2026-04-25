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
 *   2. The page.tsx exports `navMeta.invokedFrom = '/parent-page'` — a
 *      documented button/row-click entry point (for Create/Edit forms,
 *      detail views, KPI-card drill-downs, etc.). The invokedFrom value
 *      must itself be a known page URL, AND the child must be genuinely
 *      reachable from that parent. See rule 4 below.
 *   3. The page URL is in the `NAV_EXCLUDE` allowlist below — for genuine
 *      system pages (OAuth callbacks, avatar-menu targets, redirect roots).
 *   4. `invokedFrom` verification (2026-04-24, closes matchPaths's twin hole):
 *      declaring `invokedFrom: '/X'` is PROOF only if one of these holds:
 *        (a) AUTO-RENDER: `/X` is a literal `href` somewhere AND the child
 *            URL is a direct manifest-child of `/X` (startsWith `/X/` with
 *            exactly one additional path segment). AutoTabNav (PR #406)
 *            auto-renders manifest-children of a leaf as tier-(N+1) chips,
 *            so the user reaches `/X` via its literal-href chip → lands on
 *            `/X` → sees child auto-rendered as tier-(N+1) chip → clicks.
 *        (b) SIBLING-RESCUE: the child has a manifest-sibling (same parent
 *            directory) whose URL IS a literal `href`. AutoTabNav auto-
 *            renders all manifest-children at tier-N when any sibling is
 *            a leaf, so the entire sibling group is reachable as chips.
 *        (c) EXPLICIT LINK: inside `/X`'s directory, grep finds the child
 *            URL as a literal in an href/router.push/redirect/navigate
 *            context. The button/row-click actually exists in the parent.
 *        (d) DYNAMIC-PARENT: `invokedFrom` contains `[id]`/`[slug]` etc.
 *            Can't statically verify (parent is parameterized) — accept
 *            as-is to avoid false-positives for drill-down pages.
 *      If NONE of 4a/4b/4c/4d hold, the declaration is a lie: it *looks*
 *      valid but the parent page has no actual link to the child. The gate
 *      classifies these as `invokedFromUnverified` and fails the build.
 *
 * `matchPaths` is NOT a valid coverage source. It exists in nav-configs
 * solely so AutoTabNav can resolve active-state when the user lands on a
 * sub-URL (e.g. highlight the "Expos" chip when viewing
 * `/admission/marketing/expos/analytics`). It does NOT render a chip and
 * does NOT make a page discoverable. Stuffing a sub-page URL into
 * matchPaths only hides it from the orphan detector — the user still
 * can't reach it.
 *
 * If you need to make a child page discoverable, the canonical fixes are:
 *   - Add a `children[]` entry in the parent's nav-config (renders a chip), or
 *   - Add `navMeta.invokedFrom` in the page.tsx (declares button entry), or
 *   - Rely on AutoTabNav's manifest-driven tier-(N+1) auto-rendering (PR #406)
 *     — and either expose the page via `children[]` so the detector agrees,
 *     or add `navMeta.invokedFrom` pointing at the parent leaf.
 *
 * Rationale + history: 2026-04-23 audit found 192 "prefix-covered but
 * undiscoverable" pages that the prior prefix-based detector scored as
 * zero orphans. The matchPaths-as-PASS rule was the second iteration of
 * the same hole — agents satisfied the gate by listing URLs in matchPaths
 * arrays, but users still couldn't see those pages. PR #406 made the
 * runtime auto-discover children-of-leaf via the route manifest; PR #408
 * (2026-04-24) removed matchPaths-as-PASS. Rule 4 (this change) closes
 * the twin hole: a page can declare `invokedFrom: '/X'` accurately (X is
 * a real URL) and still be invisible if the parent never actually links
 * to the child AND manifest auto-render doesn't cover it either. Same
 * shape of bug, same fix: demand structural proof, not just a declaration.
 *
 * See: `specs/mobile-sidebar-bottomnav-spec.md`,
 *      `feedback_matchpaths_dont_render_chips.md`,
 *      the "noble-laureates" critique thread (2026-04-23).
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
  '/admission', // redirects to /admission/dashboard
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

  // Admin sub-roots — redirect-to-first-child pages
  '/okr/admin', // redirects to /okr/admin/compliance
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

/** Escape regex meta-chars so a URL can be interpolated as a literal. */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert URL path `/admission/marketing/expos` → filesystem path
 * `app/(routes)/admission/marketing/expos`. Root URL `/` is invalid for
 * invokedFrom (no directory to search) — caller must skip.
 */
function urlToDirPath(url) {
  if (url === '/' || !url.startsWith('/')) return null;
  return join(APP_ROUTES, ...url.slice(1).split('/'));
}

/**
 * Cache of read file contents to avoid repeated disk I/O when many children
 * share the same parent directory.
 */
const fileCache = new Map();
function readCached(p) {
  if (fileCache.has(p)) return fileCache.get(p);
  try {
    const c = readFileSync(p, 'utf8');
    fileCache.set(p, c);
    return c;
  } catch {
    fileCache.set(p, null);
    return null;
  }
}

/**
 * Collect the files that can legitimately hold a link from a parent page at
 * URL `/X` to a child URL. Per the discoverability contract, those are:
 *   - `<dir>/page.tsx` and `<dir>/layout.tsx` (top-level route files)
 *   - Any `.tsx`/`.ts` file directly under `<dir>` (co-located components)
 *   - Anything under a subdirectory starting with `_` (Next.js private
 *     folder convention — `_components/`, `_hooks/`, `_lib/`, etc.)
 * We deliberately do NOT recurse into non-underscore subdirectories — those
 * are child route segments, not link sources from the parent.
 */
function collectLinkSourceFiles(dirPath) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      // Recurse only into private/underscore folders.
      if (entry.name.startsWith('_')) {
        // Walk arbitrarily deep inside `_*` — co-located helpers often nest.
        out.push(...walkAllTsFiles(full));
      }
      // Non-underscore dirs are child routes; skip.
    } else if (entry.isFile()) {
      if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
    }
  }
  return out;
}

/** Walk a `_*` private directory recursively for all .ts/.tsx/.js/.jsx files. */
function walkAllTsFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkAllTsFiles(full));
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Rule 4c: return true if any file in `/X`'s directory (per the
 * collectLinkSourceFiles contract) contains `childUrl` as a literal string
 * in an href/push/redirect/navigate context. Pure string-literal match;
 * doesn't catch dynamic-built URLs but accepts any template literal whose
 * prefix is the full child URL (rare edge-case for trailing query strings).
 */
function parentHasExplicitLink(invokedFromUrl, childUrl) {
  const dirPath = urlToDirPath(invokedFromUrl);
  if (!dirPath) return false;
  const files = collectLinkSourceFiles(dirPath);
  if (files.length === 0) return false;
  const esc = escapeRegex(childUrl);
  // href="/child" | href={'/child'} | href:`/child` — cover single/double/
  // backtick string literals. Keep regex pass tight to avoid false matches
  // on unrelated substrings (URL suffix boundary: `['"\`?#]` or end).
  const hrefRx = new RegExp(
    `href\\s*[:=]\\s*\\{?\\s*['"\`]${esc}(?:['"\`?#]|\\$)`
  );
  const pushRx = new RegExp(
    `(?:push|replace|redirect|navigate|prefetch)\\s*\\(\\s*['"\`]${esc}(?:['"\`?#]|\\$)`
  );
  for (const f of files) {
    const content = readCached(f);
    if (content == null) continue;
    if (hrefRx.test(content) || pushRx.test(content)) return true;
  }
  return false;
}

/**
 * Rule 4a: AutoTabNav auto-render — child is a direct manifest-child of a
 * literal href. Example: `/admission/marketing` IS a literal href, and
 * `/admission/marketing/campaigns` starts with `/admission/marketing/` with
 * exactly one additional segment. AutoTabNav renders the manifest-children
 * of a literal-href leaf as tier-(N+1) chips.
 */
function isAutoRenderedChild(invokedFromUrl, childUrl, literalHrefs) {
  if (!literalHrefs.has(invokedFromUrl)) return false;
  const prefix = invokedFromUrl === '/' ? '/' : invokedFromUrl + '/';
  if (!childUrl.startsWith(prefix)) return false;
  const rest = childUrl.slice(prefix.length);
  // Exactly one segment beyond the parent → rest has no further `/`.
  return rest.length > 0 && !rest.includes('/');
}

/**
 * Rule 4b: sibling-rescue — child has a sibling in the manifest (same
 * parent directory, same depth) whose URL IS a literal href. When a single
 * sibling is a leaf, AutoTabNav renders all manifest-children of the
 * containing parent at tier-N, so the rescued sibling group becomes
 * chip-reachable together.
 *
 * Example: `/admission/marketing/campaigns/monitoring` is a literal href
 * (Campaigns chip in nav-config). Its siblings `/campaigns/roi` and
 * `/campaigns/segments` therefore auto-render as a tier-N chip strip.
 */
function hasSiblingRescue(childUrl, allStaticUrls, literalHrefs) {
  const lastSlash = childUrl.lastIndexOf('/');
  if (lastSlash <= 0) return false;
  const parentPrefix = childUrl.slice(0, lastSlash) + '/';
  // Enumerate manifest siblings — other static URLs sharing the same parent
  // directory, at the same depth (no further `/` beyond the prefix).
  for (const u of allStaticUrls) {
    if (u === childUrl) continue;
    if (!u.startsWith(parentPrefix)) continue;
    const rest = u.slice(parentPrefix.length);
    if (!rest || rest.includes('/')) continue; // not a direct sibling
    if (literalHrefs.has(u)) return true;
  }
  return false;
}

/** Rule 4d: dynamic-parent escape hatch — `invokedFrom` contains `[x]`. */
function isDynamicParent(invokedFromUrl) {
  return /\[[^\]]+\]/.test(invokedFromUrl);
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

/**
 * Parse --max-unverified from CLI. Baseline for `invokedFromUnverified`
 * violations (rule 4): pages whose `invokedFrom` target exists but doesn't
 * actually link to the child. Pre-existing cases are absorbed by the
 * baseline; sweep PRs tighten it over time. Defaults to 0 (strict) if
 * unspecified OR if --strict is passed.
 */
function parseMaxUnverified(argv) {
  if (argv.includes('--strict')) return 0;
  const i = argv.indexOf('--max-unverified');
  if (i >= 0 && argv[i + 1] != null) {
    const n = parseInt(argv[i + 1], 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return 0; // strict by default
}

function main() {
  const argv = process.argv.slice(2);
  const maxOrphans = parseMaxOrphans(argv);
  const maxUnverified = parseMaxUnverified(argv);
  const allPages = walkPages(APP_ROUTES).sort((a, b) =>
    a.url.localeCompare(b.url)
  );
  const staticPages = allPages.filter((p) => !/\[[^\]]+\]/.test(p.url));

  // --- Collect literal hrefs from all nav surfaces ---
  const literalHrefs = new Set();
  // Tracked for INFORMATIONAL reporting only — matchPaths NEVER prove
  // discoverability (see docstring). Used after orphan classification to
  // partition orphans into "matchPaths-only" (the dangerous pattern) vs
  // truly unconfigured pages.
  const matchPathsSeen = new Set();

  for (const h of extractHrefs(readFileSync(SIDEBAR, 'utf8'))) {
    literalHrefs.add(h);
  }

  for (const entry of readdirSync(APP_ROUTES, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const configPath = join(APP_ROUTES, entry.name, 'nav-config.ts');
    try {
      const content = readFileSync(configPath, 'utf8');
      for (const h of extractHrefs(content)) literalHrefs.add(h);
      for (const p of extractMatchPaths(content)) matchPathsSeen.add(p);
    } catch {
      // No nav-config for this module — OK, module relies on sidebar + navMeta.
    }
  }

  // --- Classify each page ---
  // `orphans` = ALL pages not reachable. Reported together for the gate.
  // `matchPathsOnlyOrphans` = the SUBSET of orphans whose URL appears in
  // some nav-config's matchPaths array. These are the pages the old
  // detector considered reachable; today's tightening surfaces them as
  // the discoverability anti-pattern they always were.
  const orphans = [];
  const matchPathsOnlyOrphans = [];
  const invokedFromInvalid = []; // invokedFrom value points at a non-existent URL
  // Rule 4: invokedFrom target IS valid, but the child isn't actually
  // reachable from it (no auto-render, no sibling-rescue, no explicit link,
  // not a dynamic parent). A lying declaration.
  const invokedFromUnverified = [];

  const allKnownUrls = new Set(staticPages.map((p) => p.url));

  for (const { url, filePath } of staticPages) {
    if (NAV_EXCLUDE.has(url)) continue;
    if (literalHrefs.has(url)) continue;
    // NOTE: matchPaths is NOT a PASS check — see docstring. Coverage by
    // matchPaths only is the discoverability anti-pattern this gate exists
    // to prevent.

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
        continue; // Invalid-target already fails gate; don't also classify.
      }

      // Rule 4: verify the parent actually links to this child. A valid
      // invokedFrom URL is necessary but NOT sufficient — past the
      // matchPaths fix, this is the twin hole that a declaration alone
      // doesn't close.
      const verified =
        // 4d — dynamic parent, can't statically verify, accept.
        isDynamicParent(invokedFrom) ||
        // 4a — manifest auto-render from a literal-href parent.
        isAutoRenderedChild(invokedFrom, url, literalHrefs) ||
        // 4b — sibling-rescue (a sibling IS a literal href).
        hasSiblingRescue(url, allKnownUrls, literalHrefs) ||
        // 4c — explicit <Link>/router.push/redirect/navigate in parent dir.
        parentHasExplicitLink(invokedFrom, url);

      if (!verified) {
        invokedFromUnverified.push({ url, invokedFrom });
      }
      continue; // PASS (or unverified-fail) — either way, no generic orphan bucket.
    }

    orphans.push(url);
    if (matchPathsSeen.has(url)) matchPathsOnlyOrphans.push(url);
  }

  // --- Report ---
  console.log(`[nav-check] Static pages:           ${staticPages.length}`);
  console.log(`[nav-check] Literal hrefs:          ${literalHrefs.size}`);
  console.log(`[nav-check] matchPath entries seen: ${matchPathsSeen.size} (active-state only — NOT discoverability)`);
  console.log(`[nav-check] NAV_EXCLUDE:            ${NAV_EXCLUDE.size}`);
  console.log(`[nav-check] Orphan count:           ${orphans.length}`);
  if (matchPathsOnlyOrphans.length > 0) {
    console.log(
      `[nav-check]   ↳ matchPaths-only:    ${matchPathsOnlyOrphans.length} (pages hidden behind matchPaths — anti-pattern, see fix #1 below)`
    );
  }
  if (invokedFromInvalid.length > 0) {
    console.log(
      `[nav-check] Invalid invokedFrom:    ${invokedFromInvalid.length} (page exports invokedFrom but target doesn't exist)`
    );
  }
  if (invokedFromUnverified.length > 0) {
    console.log(
      `[nav-check] Unverified invokedFrom: ${invokedFromUnverified.length} (declared parent exists but doesn't actually link to child — see fix below)`
    );
  }

  if (orphans.length > 0) {
    console.log('');
    if (matchPathsOnlyOrphans.length > 0) {
      console.log(
        `MATCHPATHS-ONLY ORPHANS (${matchPathsOnlyOrphans.length}) — listed in matchPaths but no chip renders:`
      );
      for (const o of matchPathsOnlyOrphans) console.log(`  ${o}`);
      console.log('');
    }
    const otherOrphans = orphans.filter((o) => !matchPathsSeen.has(o));
    if (otherOrphans.length > 0) {
      console.log(
        `UNCONFIGURED ORPHANS (${otherOrphans.length}) — no nav surface at all:`
      );
      for (const o of otherOrphans) console.log(`  ${o}`);
      console.log('');
    }
    console.log('Three ways to resolve each orphan:');
    console.log(
      '  1. Add it as a LITERAL `href` in a `children[]` array in the parent'
    );
    console.log(
      '     module\'s nav-config.ts (this renders an actual chip via AutoTabNav).'
    );
    console.log(
      '     matchPaths is NOT a substitute — it only handles active-state.'
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

  if (invokedFromUnverified.length > 0) {
    console.log('');
    console.log(
      'INVOKEDFROM UNVERIFIED — declared entry point doesn\'t actually link to child:'
    );
    for (const x of invokedFromUnverified) {
      console.log(`  ${x.url}  →  invokedFrom: '${x.invokedFrom}'`);
    }
    console.log('');
    console.log(
      'The parent URL exists, but none of these proofs are true:'
    );
    console.log(
      '  (4a) `invokedFrom` is a literal href AND child is a direct'
    );
    console.log(
      '       manifest-sub-segment (auto-rendered as tier-(N+1) chip).'
    );
    console.log(
      '  (4b) Child has a sibling that IS a literal href (sibling-rescue:'
    );
    console.log(
      '       AutoTabNav auto-renders the whole manifest-sibling group).'
    );
    console.log(
      '  (4c) Parent\'s page.tsx / layout.tsx / _*/ helpers contain the'
    );
    console.log(
      '       child URL as a literal in href=/router.push/redirect/navigate.'
    );
    console.log(
      '  (4d) `invokedFrom` contains a dynamic `[id]`/`[slug]` segment.'
    );
    console.log('');
    console.log('Four ways to resolve each unverified page:');
    console.log(
      '  1. Change `invokedFrom` to a better parent — one that has the child'
    );
    console.log(
      '     as a direct sub-segment OR a manifest-sibling that\'s a literal href.'
    );
    console.log(
      '  2. Add an explicit `<Link href="/this-child">` in the parent page.'
    );
    console.log(
      '  3. Add the child to the parent\'s `children[]` in nav-config.ts so'
    );
    console.log(
      '     it becomes a literal href directly (and drop the invokedFrom).'
    );
    console.log(
      '  4. If the parent URL is truly parameterized, rewrite the invokedFrom'
    );
    console.log(
      '     to include `[id]`/`[slug]` so rule 4d applies.'
    );
  }

  console.log(`[nav-check] Max-orphans gate:      ${maxOrphans}`);
  console.log(`[nav-check] Max-unverified gate:   ${maxUnverified}`);

  // Invalid `invokedFrom` references ALWAYS fail — no baseline grace.
  // They indicate broken cross-references, not merely undocumented pages.
  const strictFail = invokedFromInvalid.length > 0;

  // Unverified `invokedFrom` declarations fail when over the baseline.
  // Mirrors the matchPaths-only sweep pattern (PR #416): pre-existing cases
  // absorbed by `--max-unverified N`, sweep PRs tighten N→0.
  const unverifiedFail = invokedFromUnverified.length > maxUnverified;

  // Orphan count is compared to the baseline. Over-baseline fails.
  const orphanFail = orphans.length > maxOrphans;

  if (strictFail || orphanFail || unverifiedFail) {
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
    if (unverifiedFail) {
      console.log(
        `BUILD-GATE FAIL — unverified invokedFrom count (${invokedFromUnverified.length}) exceeds max-unverified (${maxUnverified}).`
      );
      console.log(
        `Parent pages exist but don't actually link to the child. Either fix`
      );
      console.log(
        `per the options listed above, or if this was intentional baseline`
      );
      console.log(
        `shrinkage, update package.json's check:nav script to --max-unverified ${invokedFromUnverified.length}.`
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
  if (orphans.length === 0 && invokedFromUnverified.length === 0) {
    console.log('PASS — every static page is discoverable.');
  } else {
    const parts = [];
    if (orphans.length > 0) {
      parts.push(`${orphans.length} orphan(s) within max-orphans=${maxOrphans}`);
    }
    if (invokedFromUnverified.length > 0) {
      parts.push(
        `${invokedFromUnverified.length} unverified invokedFrom within max-unverified=${maxUnverified}`
      );
    }
    console.log(`PASS (with baseline) — ${parts.join(' + ')} tolerance.`);
    console.log(
      `Tighten the gate by lowering --max-orphans / --max-unverified in package.json as sweep PRs land.`
    );
  }
}

main();
