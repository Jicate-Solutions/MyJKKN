/**
 * deriveBreadcrumbs — pure function that turns a pathname into a breadcrumb
 * trail by walking the generated route manifest.
 *
 * Stacks on PR #360 (AutoTabNav / route-manifest.generated.ts). Every page.tsx
 * under app/(routes) ends up in ROUTE_MANIFEST, so we can derive a full
 * Home › Module › Section › Page trail from URL segments with zero per-page
 * maintenance.
 *
 * Example:
 *   deriveBreadcrumbs('/admission/marketing/chat')
 *   → [
 *       { href: '/',                         label: 'Home' },
 *       { href: '/admission',                label: 'Admission' },
 *       { href: '/admission/marketing',      label: 'Marketing' },
 *       { href: '/admission/marketing/chat', label: 'Chat' },
 *     ]
 *
 * Behaviours:
 * - Always starts with { href: '/', label: 'Home' }.
 * - For segments not in the manifest (e.g. dynamic [id] values), falls back to
 *   a humanized segment label (UUIDs and numeric IDs are kept as-is; other
 *   unknown segments are Title-Cased).
 * - Skips `/`, `/auth/*`, `/api/*` — returns `[]`.
 *
 * Pure — no React, no browser APIs. Safe to import from server components or
 * open-graph metadata generators.
 */

import { ROUTE_MANIFEST, type RouteNode } from './route-manifest.generated';

export interface BreadcrumbTrailItem {
  href: string;
  label: string;
}

/** Paths where breadcrumbs are meaningless (root, auth flows, API endpoints). */
function shouldSkip(pathname: string): boolean {
  if (!pathname || pathname === '/') return true;
  if (pathname.startsWith('/auth/') || pathname === '/auth') return true;
  if (pathname.startsWith('/api/') || pathname === '/api') return true;
  return false;
}

/** UUID v4-ish check — conservative, catches the common `[id]` shapes. */
function isUuidLike(seg: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    seg
  );
}

/** Pure-numeric id segment. */
function isNumericId(seg: string): boolean {
  return /^\d+$/.test(seg);
}

/**
 * Humanize an unknown URL segment: `my-page-name` → `My Page Name`.
 * Keeps UUIDs and numeric IDs verbatim so the crumb still disambiguates.
 */
function humanizeSegment(seg: string): string {
  if (isUuidLike(seg) || isNumericId(seg)) return seg;
  return seg
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Walk ROUTE_MANIFEST in lockstep with pathname segments. For every segment,
 * emit one crumb: from the manifest node if we can find it, otherwise from a
 * humanized fallback.
 */
export function deriveBreadcrumbs(pathname: string): BreadcrumbTrailItem[] {
  if (shouldSkip(pathname)) return [];

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [];

  const trail: BreadcrumbTrailItem[] = [
    { href: '/', label: 'Home' },
  ];

  let currentLevel: RouteNode[] = ROUTE_MANIFEST;
  let urlPrefix = '';

  for (const seg of segments) {
    urlPrefix += `/${seg}`;

    const node = currentLevel.find((n) => n.path === urlPrefix) ?? null;

    if (node) {
      trail.push({ href: node.path, label: node.label });
      currentLevel = node.children;
    } else {
      // Unknown segment — dynamic route param, unregistered page, etc.
      // Keep it in the trail so the current URL is fully represented.
      trail.push({ href: urlPrefix, label: humanizeSegment(seg) });
      currentLevel = []; // no further manifest walk is possible
    }
  }

  return trail;
}
