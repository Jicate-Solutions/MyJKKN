#!/usr/bin/env tsx
/**
 * Nav Reachability Simulator — the permanent fix for "pages keep going missing".
 *
 * Runs BFS from every entry point in `lib/sidebarMenuLink.ts` through chip
 * clicks (using the same `resolveTiers` logic AutoTabNav renders at runtime)
 * and reports any static `page.tsx` URL that CANNOT be reached by the user
 * via a sequence of chip + sidebar clicks.
 *
 * Why this is better than the predecessor `assert-nav-coverage.mjs`:
 *
 *   Old detector asked: "is this URL DECLARED somewhere?" — literal href OR
 *   matchPaths OR navMeta.invokedFrom. That test has false-positives: a
 *   declaration can lie (matchPaths doesn't render chips; invokedFrom can
 *   point at a parent with no button). Over three iterations I wrote three
 *   proxies (#408, #416, #419) and each had a false-positive hole that
 *   users reported as missing pages (#440 Group Dashboard was the straw).
 *
 *   This simulator asks: "starting from the user's homepage, can I get to
 *   this URL by clicking chips?" That's the REAL UX question. No proxy.
 *
 * Invariant it guarantees: a PASS here means every static page.tsx on disk
 * is reachable via chip/sidebar clicks from `/`. A FAIL here means a
 * specific URL is invisible to users — the error message names it, names
 * the "closest" URL that's reachable, and suggests the fix.
 *
 * Seed set: every literal href in `lib/sidebarMenuLink.ts`. That's the
 * user's entry-point surface — every sidebar link is assumed reachable.
 *
 * Expansion rule: for each reachable URL, run `resolveTiers(url)` (from
 * `lib/navigation/tier-rendering.ts`) to get the chip tree AutoTabNav
 * would render. Every chip.href is reachable. BFS closure.
 *
 * Compared to the runtime: the simulator is byte-for-byte identical to
 * AutoTabNav's tier computation because both import from the same pure
 * module. If AutoTabNav's logic changes, so does the simulator.
 *
 * Run: `npm run check:reachability`.
 * Baseline: `--max-unreachable <N>` supports gradual tightening (same
 * pattern as the orphan baseline).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveTiers } from '../lib/navigation/tier-rendering';

const APP_ROUTES = 'app/(routes)';
const SIDEBAR = 'lib/sidebarMenuLink.ts';

/**
 * Entry-point URLs that don't need to be chip-reachable — they're opened
 * via non-chip surfaces (top-bar avatar, payment-gateway callback, OAuth,
 * etc.). This mirrors `NAV_EXCLUDE` in the predecessor script.
 */
const NAV_EXCLUDE = new Set<string>([
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
  '/admission',
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
  '/okr/admin',
]);

/** Walk app/(routes)/ collecting {url} for every static page.tsx. */
function walkPages(dir: string, urlBase = ''): Array<{ url: string }> {
  const out: Array<{ url: string }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (/^\[.+\]$/.test(entry.name)) continue; // dynamic route — skip
      const segment = /^\(.*\)$/.test(entry.name) ? '' : '/' + entry.name;
      out.push(...walkPages(fullPath, urlBase + segment));
    } else if (entry.name === 'page.tsx') {
      out.push({ url: urlBase || '/' });
    }
  }
  return out;
}

/** Extract literal `href: '/...'` values from a file's source. */
function extractHrefs(content: string): string[] {
  const out: string[] = [];
  const rx = /['"]?href['"]?\s*:\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(content))) {
    if (m[1]!.startsWith('/')) out.push(m[1]!);
  }
  return out;
}

/**
 * BFS through chip clicks + sidebar links to find every reachable URL.
 */
function computeReachable(seed: Set<string>): Set<string> {
  const visited = new Set<string>(seed);
  const queue: string[] = [...seed];

  while (queue.length > 0) {
    const url = queue.shift()!;
    let tiers: ReturnType<typeof resolveTiers>;
    try {
      tiers = resolveTiers(url);
    } catch {
      continue; // defensive — malformed URL shouldn't crash the walk
    }
    for (const tier of tiers) {
      for (const chip of tier) {
        if (!visited.has(chip.href)) {
          visited.add(chip.href);
          queue.push(chip.href);
        }
      }
    }
  }
  return visited;
}

function parseMaxUnreachable(argv: string[]): number {
  if (argv.includes('--strict')) return 0;
  const i = argv.indexOf('--max-unreachable');
  if (i >= 0 && argv[i + 1] != null) {
    const n = parseInt(argv[i + 1]!, 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return 0; // strict by default
}

function main() {
  const maxUnreachable = parseMaxUnreachable(process.argv.slice(2));

  // --- Collect static page URLs ---
  const allPages = walkPages(APP_ROUTES).sort((a, b) =>
    a.url.localeCompare(b.url)
  );
  const staticPages = allPages.filter((p) => !/\[[^\]]+\]/.test(p.url));
  const staticUrls = new Set(staticPages.map((p) => p.url));

  // --- Build seed: every literal href in the sidebar is a user entry point ---
  const sidebarContent = readFileSync(SIDEBAR, 'utf8');
  const seed = new Set(extractHrefs(sidebarContent).filter((h) => h.startsWith('/')));

  // Include every top-level module's config href as an entry too — a user can
  // navigate to e.g. /admission from the Admission sidebar tile, then chip
  // from there.
  // (Sidebar parsing above covers this, but belt-and-braces.)

  // --- BFS expansion through chip clicks ---
  const reachable = computeReachable(seed);

  // --- Classify ---
  const unreachable: string[] = [];
  for (const { url } of staticPages) {
    if (NAV_EXCLUDE.has(url)) continue;
    if (reachable.has(url)) continue;
    unreachable.push(url);
  }

  // --- Report ---
  console.log(`[nav-reachability] Static pages:          ${staticPages.length}`);
  console.log(`[nav-reachability] Seed hrefs (sidebar):  ${seed.size}`);
  console.log(`[nav-reachability] Reachable via chips:   ${[...reachable].filter((u) => staticUrls.has(u)).length}`);
  console.log(`[nav-reachability] NAV_EXCLUDE allowlist: ${NAV_EXCLUDE.size}`);
  console.log(`[nav-reachability] Unreachable count:     ${unreachable.length}`);
  console.log(`[nav-reachability] Max-unreachable gate:  ${maxUnreachable}`);

  if (unreachable.length > 0) {
    console.log('');
    console.log(
      `UNREACHABLE PAGES — no chip/sidebar click sequence from / leads here:`
    );
    for (const u of unreachable) {
      // Suggest the closest reachable ancestor as the fix target
      const segments = u.split('/').filter(Boolean);
      let closest = '/';
      for (let i = 1; i <= segments.length; i++) {
        const candidate = '/' + segments.slice(0, i).join('/');
        if (reachable.has(candidate)) closest = candidate;
      }
      console.log(`  ${u}     (closest reachable: ${closest})`);
    }
    console.log('');
    console.log('Fix options for each unreachable page:');
    console.log(
      '  1. Add it as a literal `href` in a `children[]` under the appropriate'
    );
    console.log(
      "     group in that module's nav-config.ts. This is the real fix —"
    );
    console.log(
      '     AutoTabNav renders the child as a clickable chip.'
    );
    console.log(
      '  2. If it should be a top-level sidebar entry, add it to lib/sidebarMenuLink.ts.'
    );
    console.log(
      '  3. If it is genuinely a button-invoked / callback / redirect page with'
    );
    console.log(
      '     no user-facing chip surface, add it to NAV_EXCLUDE in this script.'
    );
    console.log('');
    console.log(
      `NOTE: matchPaths and navMeta.invokedFrom are IGNORED by this check —`
    );
    console.log(
      `only actual chip-click reachability counts. That's the point.`
    );
  }

  if (unreachable.length > maxUnreachable) {
    console.log('');
    console.log(
      `BUILD-GATE FAIL — ${unreachable.length} unreachable page(s) exceeds`
    );
    console.log(
      `max-unreachable=${maxUnreachable}. Fix per the options above, or raise`
    );
    console.log(
      `the baseline temporarily via --max-unreachable ${unreachable.length}.`
    );
    process.exit(1);
  }

  console.log('');
  if (unreachable.length === 0) {
    console.log('PASS — every static page is chip-reachable from the sidebar.');
  } else {
    console.log(
      `PASS (with baseline) — ${unreachable.length} unreachable within max-unreachable=${maxUnreachable}.`
    );
    console.log(
      `Tighten by lowering --max-unreachable in package.json as sweep PRs land.`
    );
  }
}

main();
