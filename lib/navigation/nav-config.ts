/**
 * NavConfig — per-module override for AutoTabNav's tier rendering.
 *
 * DEFAULT BEHAVIOR (no config): AutoTabNav renders one tier per URL segment,
 * one chip per sibling — flat. Good for simple modules (≤8 siblings per
 * tier, no natural grouping).
 *
 * WHEN YOU WANT A CONFIG: a module's tier has too many raw children for a
 * single row of chips (e.g. Campus Living has 23 top-level children), OR
 * those children fall into 3-8 natural buckets. Rather than render all 23
 * flat, declare the buckets here and AutoTabNav will show the buckets as
 * tier-2 tabs + drill into each bucket's members on tier-3.
 *
 * USAGE:
 *   // app/(routes)/campus-living/nav-config.ts
 *   import type { ModuleNavConfig } from '@/lib/navigation/nav-config';
 *
 *   const config: ModuleNavConfig = {
 *     module: 'campus-living',
 *     groups: [
 *       {
 *         label: 'Residents', icon: 'UsersRound',
 *         href: '/campus-living/residents',
 *         matchPaths: ['/campus-living/residents', '/campus-living/blocks',
 *                      '/campus-living/allocations'],
 *       },
 *       { label: 'Attendance', icon: 'UserCheck',
 *         href: '/campus-living/attendance',
 *         matchPaths: ['/campus-living/attendance', '/campus-living/leave',
 *                      '/campus-living/gate-passes', '/campus-living/visitors'],
 *       },
 *       // ...5 more groups
 *     ],
 *   };
 *   export default config;
 *
 * LOOKUP ORDER:
 *   1. AutoTabNav computes which module the current pathname belongs to.
 *   2. Looks up that module's config in NAV_CONFIG_REGISTRY (below).
 *   3. If found AND the current tier matches a configured tier: renders
 *      the config's groups.
 *   4. If not found OR no matching tier: renders flat siblings from the
 *      route manifest (legacy behavior).
 *
 * TIER COUNT: number of tiers rendered is dynamic. If the module has 4
 * top-level pages and none have children, that's 1 in-page bar + sidebar =
 * 2-tier UX. If it has nested sub-sections, tier count grows accordingly.
 * The nav never forces tiers that aren't useful.
 */

import type { LucideIcon } from 'lucide-react';
import type { RouteNode } from './route-manifest.generated';

export interface ModuleNavGroup {
  /** Display label (title-cased short string) */
  label: string;
  /** lucide-react icon export name (e.g. 'UsersRound', 'UtensilsCrossed') */
  icon: string;
  /** Where the group tab links to (usually the first page in the group) */
  href: string;
  /** Pathnames that activate this group tab. Supports startsWith matching. */
  matchPaths: string[];
  /**
   * Optional explicit children to show as tier-3 when this group is active.
   * Each child can have matchPaths so a single group chip activates across
   * multiple sibling pages (e.g. Messaging group covers chat + chatbot +
   * parent-communication + re-engagement + remarketing + whatsapp-broadcast).
   * If omitted, tier-3 falls back to the auto-discovered children of the
   * current pathname from the route manifest.
   */
  children?: Array<{
    label: string;
    icon: string;
    href: string;
    /** Extra paths that also mark this child active (e.g. sibling leaves) */
    matchPaths?: string[];
    exact?: boolean;
  }>;
}

export interface ModuleNavConfig {
  /** Module slug (first URL segment, e.g. 'campus-living', 'admission') */
  module: string;
  /**
   * Tier-2 groups. Each group collapses N raw manifest siblings into
   * one logical group tab.
   */
  groups: ModuleNavGroup[];
}

/**
 * Registry of per-module nav configs. Modules NOT in this registry use the
 * default flat rendering (good for simple modules with few siblings).
 *
 * To add a new module config:
 *   1. Create app/(routes)/<module>/nav-config.ts
 *   2. Register it here (import + add to the array)
 *   3. AutoTabNav picks it up automatically
 *
 * Eager import is intentional — these configs are small (≤ 10 groups each),
 * always rendered on first nav, and bundler-stripped for unused modules via
 * tree-shaking of the ROUTE_MANIFEST.
 */
import campusLivingNav from '@/app/(routes)/campus-living/nav-config';
import admissionNav from '@/app/(routes)/admission/nav-config';
import learnersCouncilNav from '@/app/(routes)/learners-council/nav-config';
import okrNav from '@/app/(routes)/okr/nav-config';
import startupStudioNav from '@/app/(routes)/startup-studio/nav-config';
import academicNav from '@/app/(routes)/academic/nav-config';
import solutionsNav from '@/app/(routes)/solutions/nav-config';
import accreditationNav from '@/app/(routes)/accreditation/nav-config';
import auditNav from '@/app/(routes)/audit/nav-config';
import hrNav from '@/app/(routes)/hr/nav-config';

const NAV_CONFIG_REGISTRY: ModuleNavConfig[] = [
  campusLivingNav,
  admissionNav,
  learnersCouncilNav,
  okrNav,
  startupStudioNav,
  academicNav,
  solutionsNav,
  accreditationNav,
  auditNav,
  hrNav,
];

const BY_MODULE = new Map(
  NAV_CONFIG_REGISTRY.map((c) => [c.module, c])
);

/**
 * Derive the module slug from a pathname. '/campus-living/mess/caterers' →
 * 'campus-living'. Root or empty → null.
 */
export function moduleSlugFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] ?? null;
}

/**
 * Return the ModuleNavConfig for this pathname's module, or null if the
 * module has no config (flat-rendering fallback).
 */
export function getNavConfigForPath(pathname: string): ModuleNavConfig | null {
  const slug = moduleSlugFromPath(pathname);
  if (!slug) return null;
  return BY_MODULE.get(slug) ?? null;
}

/**
 * Find which group in a config matches the current pathname.
 *
 * Uses LONGEST-MATCH-WINS semantics so that a group matching
 * '/admission/marketing' beats a group matching only '/admission'.
 * This is essential when a Dashboard group's matchPaths includes the
 * module root (so bare /admission highlights Dashboard) — without
 * longest-match, deeper paths would incorrectly activate Dashboard too.
 */
export function findActiveGroup(
  pathname: string,
  config: ModuleNavConfig
): ModuleNavGroup | null {
  let best: { group: ModuleNavGroup; matchLen: number } | null = null;
  for (const group of config.groups) {
    for (const p of group.matchPaths) {
      const matches = pathname === p || pathname.startsWith(p + '/');
      if (matches && (!best || p.length > best.matchLen)) {
        best = { group, matchLen: p.length };
      }
    }
  }
  return best?.group ?? null;
}

/**
 * Dev-only warning when a manifest node has so many children that the UX
 * will be cluttered without a nav-config. Surfaces in the browser console.
 * Threshold: 12. (Tuned for desktop: ~12 chips fit comfortably on one row.)
 */
export function warnOnCrowdedTier(
  modulePath: string,
  siblingsCount: number
): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (siblingsCount <= 12) return;
  // eslint-disable-next-line no-console
  console.warn(
    `[AutoTabNav] ${modulePath} has ${siblingsCount} flat siblings. ` +
      `Consider adding a nav-config.ts to group them. ` +
      `See lib/navigation/nav-config.ts for the convention.`
  );
}

export type { RouteNode, LucideIcon };
