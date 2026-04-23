#!/usr/bin/env node
/**
 * Nav-coverage assertion.
 *
 * Fails with exit code 1 if any static `page.tsx` in `app/(routes)/` has no
 * nav surface pointing at it. A "nav surface" is either:
 *   - an `href` in `lib/sidebarMenuLink.ts`, or
 *   - an `href` / `matchPaths` entry in any `app/(routes)/<module>/nav-config.ts`
 *     (the AutoTabNav registry).
 *
 * A page is reachable if any nav surface equals the URL OR is a prefix
 * (because AutoTabNav's manifest drilldown discovers deeper pages under
 * any matched group).
 *
 * Pages listed in NAV_EXCLUDE are intentionally not surfaced in nav
 * (OAuth callbacks, top-bar avatar menu, module redirect landings).
 *
 * Run: `npm run check-nav` or `node scripts/assert-nav-coverage.mjs`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROUTES = 'app/(routes)';
const SIDEBAR = 'lib/sidebarMenuLink.ts';

/**
 * Pages that intentionally have no sidebar / nav-config entry.
 * When adding a new page that legitimately shouldn't be in nav
 * (callback pages, avatar-menu targets, redirect landings), add
 * it here with a one-line comment explaining why.
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

  // SSO / admin-only one-shots (reachable by deep link, not nav)
  '/admin/saml',
  '/admin/reset-driver-passwords',
  '/system',

  // Module root landings — children are in sidebar, root itself is a
  // redirect-to-first-child page
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

function walkPages(dir, urlBase = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (/^\[.+\]$/.test(entry.name)) continue; // dynamic route — skip
      const segment = /^\(.*\)$/.test(entry.name) ? '' : '/' + entry.name;
      out.push(...walkPages(fullPath, urlBase + segment));
    } else if (entry.name === 'page.tsx') {
      out.push(urlBase || '/');
    }
  }
  return out;
}

function extractHrefs(content) {
  const out = [];
  const rx = /['"]?href['"]?\s*:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = rx.exec(content))) {
    if (m[1].startsWith('/')) out.push(m[1]);
  }
  return out;
}

function extractMatchPaths(content) {
  const out = [];
  // Matches both single-line and multi-line matchPaths arrays
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

function main() {
  const allPages = walkPages(APP_ROUTES).sort();
  const staticPages = allPages.filter((p) => !/\[[^\]]+\]/.test(p));

  let navSurfaces = [];
  navSurfaces.push(...extractHrefs(readFileSync(SIDEBAR, 'utf8')));

  for (const entry of readdirSync(APP_ROUTES, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const configPath = join(APP_ROUTES, entry.name, 'nav-config.ts');
    try {
      const content = readFileSync(configPath, 'utf8');
      navSurfaces.push(...extractHrefs(content));
      navSurfaces.push(...extractMatchPaths(content));
    } catch {
      // no nav-config — OK, module uses default flat rendering
    }
  }

  navSurfaces = [...new Set(navSurfaces)].sort();

  const isReachable = (page) => {
    if (NAV_EXCLUDE.has(page)) return true;
    for (const ns of navSurfaces) {
      if (ns === '/') continue;
      if (page === ns || page.startsWith(ns + '/')) return true;
    }
    return false;
  };

  const orphans = staticPages.filter((p) => !isReachable(p));

  console.log(`[nav-check] Static pages:    ${staticPages.length}`);
  console.log(`[nav-check] Nav surfaces:    ${navSurfaces.length}`);
  console.log(`[nav-check] NAV_EXCLUDE:     ${NAV_EXCLUDE.size}`);
  console.log(`[nav-check] Orphan count:    ${orphans.length}`);

  if (orphans.length > 0) {
    console.log('');
    console.log('Orphan pages (exist in code, no nav entry points to them):');
    for (const o of orphans) console.log(`  ${o}`);
    console.log('');
    console.log('To fix each:');
    console.log('  - add an href in `lib/sidebarMenuLink.ts`, OR');
    console.log('  - extend a module\'s `app/(routes)/<module>/nav-config.ts`');
    console.log('    (href / matchPaths / children), OR');
    console.log('  - add to `NAV_EXCLUDE` in this file if the page intentionally');
    console.log('    lives outside the sidebar (callback / avatar menu).');
    process.exit(1);
  }

  console.log('');
  console.log('PASS — every static page.tsx is reachable from some nav surface.');
}

main();
