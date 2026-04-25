/**
 * Derives a PageEntry-like object for ANY pathname so the global Navbar
 * FavoriteStar always has data to render — even for pages not present in
 * the static page registry (dynamic [id] routes, deep-links, newly added
 * sub-pages, modal-launched routes, etc.).
 *
 * Resolution order:
 *   1. Exact registry match           → use registry entry
 *   2. Longest prefix registry match  → reuse parent's title/module/icon
 *      with the pathname's last-segment appended for clarity
 *   3. Pure pathname derivation       → title from last segment,
 *      module from URL prefix lookup, icon = generic FileText
 *
 * Result: every favorite-able URL has a sensible (path, title, module,
 * iconName) tuple. Pages can never silently lose their favorite affordance
 * because they're not in the registry.
 */

import { getPageRegistry } from './page-registry';
import type { PageEntry } from './types';

/**
 * URL prefixes that should NEVER show a favorite star.
 * Auth flows, API routes, error pages.
 */
const NON_FAVORITABLE_PREFIXES = [
  '/auth',
  '/api',
  '/_next',
  '/login',
  '/logout',
  '/signin',
  '/signout',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

/**
 * Maps URL prefix → human-readable module name.
 * Mirrors sidebarMenuLink.ts groupLabel values where possible.
 */
const MODULE_PREFIX_MAP: Array<{ prefix: string; module: string }> = [
  { prefix: '/admission', module: 'Admission CRM' },
  { prefix: '/academic', module: 'Academic Management' },
  { prefix: '/learners-council', module: 'Learners Council' },
  { prefix: '/learners', module: 'Learners' },
  { prefix: '/campus-living', module: 'Campus Living' },
  { prefix: '/solutions', module: 'Solution Hub' },
  { prefix: '/accreditation', module: 'Accreditation' },
  { prefix: '/okr', module: 'OKR & Performance' },
  { prefix: '/startup-studio', module: 'Startup Studio' },
  { prefix: '/faculty', module: 'Faculty' },
  { prefix: '/health', module: 'Health & Wellness' },
  { prefix: '/learn', module: 'Learning' },
  { prefix: '/work-pulse', module: 'Work Pulse' },
  { prefix: '/vac', module: 'Value Added Courses' },
  { prefix: '/billing', module: 'Billing' },
  { prefix: '/staff', module: 'Employee Management' },
  { prefix: '/hr', module: 'HR' },
  { prefix: '/organizations', module: 'Organization' },
  { prefix: '/system', module: 'System' },
  { prefix: '/admin', module: 'Administration' },
  { prefix: '/users', module: 'User Management' },
  { prefix: '/applications', module: 'Application Hub' },
  { prefix: '/application-hub', module: 'Application Hub' },
  { prefix: '/documents', module: 'Documents' },
  { prefix: '/service-requests', module: 'Service Requests' },
  { prefix: '/profile', module: 'Profile' },
  { prefix: '/dashboard', module: 'Dashboard' },
  { prefix: '/ai-query', module: 'AI Assistant' },
];

function moduleFromPath(path: string): string {
  for (const { prefix, module } of MODULE_PREFIX_MAP) {
    if (path === prefix || path.startsWith(prefix + '/')) return module;
  }
  return 'General';
}

function titleFromPath(path: string): string {
  // Strip trailing slash, take last non-empty segment
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? 'Home';

  // If the last segment looks like a UUID/id, walk back to a meaningful one
  const looksLikeId = (seg: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg) || /^\d+$/.test(seg);

  let label = last;
  let idx = segments.length - 1;
  while (idx >= 0 && looksLikeId(segments[idx]!)) {
    idx--;
    label = segments[idx] ?? label;
  }

  // dash/underscore → space, title-case
  return label
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Page';
}

export interface PageInfo {
  path: string;
  title: string;
  module: string;
  iconName: string;
}

/**
 * Returns a usable PageInfo for any pathname, or null when the page should
 * not be favoritable (auth, api, etc.).
 *
 * Always derives — never returns undefined for a "real" app route.
 */
export function derivePageInfo(pathname: string): PageInfo | null {
  if (!pathname) return null;

  // Exclude non-favoritable routes (auth, api, etc.)
  for (const skip of NON_FAVORITABLE_PREFIXES) {
    if (pathname === skip || pathname.startsWith(skip + '/')) return null;
  }

  const registry = getPageRegistry();

  // 1. Exact match
  const exact = registry.find((p) => p.path === pathname);
  if (exact) {
    return {
      path: exact.path,
      title: exact.title,
      module: exact.module,
      iconName: exact.iconName,
    };
  }

  // 2. Longest prefix match — use parent's module/icon, derive title from URL
  let bestPrefix: PageEntry | null = null;
  for (const entry of registry) {
    if (
      entry.path !== '/' &&
      pathname.startsWith(entry.path + '/') &&
      (bestPrefix === null || entry.path.length > bestPrefix.path.length)
    ) {
      bestPrefix = entry;
    }
  }
  if (bestPrefix) {
    const derivedTitle = titleFromPath(pathname);
    return {
      path: pathname,
      title:
        derivedTitle && derivedTitle !== bestPrefix.title
          ? `${bestPrefix.title} · ${derivedTitle}`
          : bestPrefix.title,
      module: bestPrefix.module,
      iconName: bestPrefix.iconName,
    };
  }

  // 3. Pure pathname derivation
  return {
    path: pathname,
    title: titleFromPath(pathname),
    module: moduleFromPath(pathname),
    iconName: 'FileText',
  };
}
