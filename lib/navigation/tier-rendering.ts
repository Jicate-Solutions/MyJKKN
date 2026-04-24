/**
 * tier-rendering.ts — pure tier-rendering logic extracted from AutoTabNav.
 *
 * These functions compute WHAT CHIPS render at a given pathname, without
 * any React/browser dependencies. That lets both:
 *   1. `components/navigation/auto-tab-nav.tsx` (the actual UI renderer)
 *   2. `scripts/check-nav-reachability.ts` (the CI simulator that walks
 *      chip-click reachability from the sidebar entry points)
 *
 * use exactly the same logic. Before this extraction, the simulator would
 * have duplicated the rendering rules and inevitably drifted.
 *
 * Invariant: these functions are PURE — no `document`, no `window`, no
 * React hooks. Given the same pathname + manifest + nav-configs, they
 * return the same chip tree every time. That is the contract the CI
 * reachability gate relies on.
 *
 * See: PRs that built up this logic
 *   - #406 (tier-(N+1) auto-render from current leaf)
 *   - #408 (matchPaths-only rejection)
 *   - #419 (invokedFrom cross-reference verification)
 *   - 2026-04-24 (this extraction + reachability simulator)
 */

import {
  ROUTE_MANIFEST,
  type RouteNode,
} from './route-manifest.generated';
import {
  getNavConfigForPath,
  findActiveGroup,
  type ModuleNavConfig,
  type ModuleNavGroup,
} from './nav-config';

export interface Chip {
  href: string;
  label: string;
  iconName: string;
  isActive: boolean;
}

/**
 * Walk the manifest to a URL prefix and return the node plus its children.
 *   walkManifestAt('/work-pulse')
 *     → { node: <work-pulse>, children: [<my-pulse>, <agents>, <all>, <impact>] }
 */
export function walkManifestAt(
  urlPrefix: string
): { node: RouteNode | null; children: RouteNode[] } {
  const segments = urlPrefix.split('/').filter(Boolean);
  if (segments.length === 0) return { node: null, children: ROUTE_MANIFEST };
  let level: RouteNode[] = ROUTE_MANIFEST;
  let node: RouteNode | null = null;
  let accum = '';
  for (const seg of segments) {
    accum += `/${seg}`;
    const found = level.find((n) => n.path === accum);
    if (!found) return { node: null, children: [] };
    node = found;
    level = found.children;
  }
  return { node, children: node?.children ?? [] };
}

/** Flat manifest-derived chips at the given URL depth. */
export function flatTierChips(
  pathname: string,
  depth: number
): { chips: Chip[]; rawSiblings: number; parentPrefix: string } | null {
  const segments = pathname.split('/').filter(Boolean);
  // Allow depth === segments.length + 1 so AutoTabNav renders CHILDREN of the
  // current leaf as chips (PR #406). Users can't discover children of the
  // current page otherwise — matchPaths only handles active-state.
  if (depth < 1 || depth > segments.length + 1) return null;

  const parentPrefix =
    depth === 1 ? '' : '/' + segments.slice(0, depth - 1).join('/');
  const activeSeg = segments[depth - 1]; // undefined when rendering children-of-leaf
  const activeHref = activeSeg ? parentPrefix + '/' + activeSeg : null;

  const siblings: RouteNode[] =
    depth === 1 ? ROUTE_MANIFEST : walkManifestAt(parentPrefix).children;

  if (siblings.length === 0) return null;

  return {
    chips: siblings.map((n) => ({
      href: n.path,
      label: n.label,
      iconName: n.iconName,
      isActive: activeHref !== null && n.path === activeHref,
    })),
    rawSiblings: siblings.length,
    parentPrefix: parentPrefix || '/',
  };
}

export function groupedTier2(
  config: ModuleNavConfig,
  activeGroup: ModuleNavGroup | null
): Chip[] {
  return config.groups.map((g) => ({
    href: g.href,
    label: g.label,
    iconName: g.icon,
    isActive: activeGroup?.href === g.href,
  }));
}

/**
 * For config-grouped modules, compute deeper tiers by walking the manifest.
 * `startDepth` controls where we start — tier-3 when no explicit children
 * were rendered, tier-4 when the config's group already contributed tier-3.
 *
 * Tiers with <2 chips are dropped (no 1-chip strips).
 */
export function deeperTiersFromManifest(
  pathname: string,
  startDepth = 3
): Chip[][] {
  const out: Chip[][] = [];
  const segments = pathname.split('/').filter(Boolean);
  for (let d = startDepth; d <= segments.length + 1; d++) {
    const tier = flatTierChips(pathname, d);
    if (!tier) continue;
    if (tier.chips.length < 2) continue;
    out.push(tier.chips);
  }
  return out;
}

/**
 * Given a pathname, return the full tier-chip tree AutoTabNav would render.
 * Each inner array is one tier-strip; the outer array is in render order
 * (tier-2, tier-3, tier-4, …). Tiers with <2 chips are dropped.
 *
 * This is THE function both the renderer and the reachability simulator
 * consume — their answers are identical by construction.
 */
export function resolveTiers(pathname: string): Chip[][] {
  const config = getNavConfigForPath(pathname);

  if (config) {
    const activeGroup = findActiveGroup(pathname, config);
    const tiers: Chip[][] = [groupedTier2(config, activeGroup)];

    if (activeGroup?.children && activeGroup.children.length > 0) {
      // Tier 3 from explicit children (e.g. Marketing's Campaigns/Messaging/…).
      tiers.push(
        activeGroup.children.map((c) => {
          const pathsToCheck = [c.href, ...(c.matchPaths ?? [])];
          const isActive = pathsToCheck.some((p) =>
            c.exact
              ? pathname === p
              : pathname === p || pathname.startsWith(p + '/')
          );
          return {
            href: c.href,
            label: c.label,
            iconName: c.icon,
            isActive,
          };
        })
      );
      // Tier 4+ continues to drill from the manifest.
      tiers.push(...deeperTiersFromManifest(pathname, 4));
    } else if (activeGroup) {
      tiers.push(...deeperTiersFromManifest(pathname));
    }
    return tiers.filter((t) => t.length >= 2);
  }

  // Flat fallback (module has no nav-config).
  const out: Chip[][] = [];
  const depth = pathname.split('/').filter(Boolean).length;
  for (let d = 2; d <= Math.max(depth + 1, 2); d++) {
    const tier = flatTierChips(pathname, d);
    if (!tier) continue;
    if (tier.chips.length < 2) continue;
    out.push(tier.chips);
  }
  return out;
}
