'use client';

/**
 * AutoTabNav — adaptive self-discovering in-page tab bar.
 *
 * TIER COUNT IS DYNAMIC — driven by the module's structure, not URL depth:
 *   - A module with a nav-config.ts (lib/navigation/nav-config.ts + per-module
 *     file) renders its grouped tabs at tier 2, then drills deeper based on
 *     the active group's children (explicit or manifest-discovered).
 *   - A module without a config renders flat from the route manifest: one
 *     tier per URL segment, all siblings shown as chips.
 *   - Tiers with <2 siblings are skipped (no 1-chip bars).
 *
 * Result: simple modules render as 2-tier (sidebar + one in-page bar);
 * complex modules render as 3-tier (module groups + sub-section); deeply
 * nested (e.g. Marketing) render as 4-tier. Never more tiers than useful.
 *
 * Tier 1 (list of all top-level modules) is always skipped — that's the
 * sidebar's job. In-page starts at tier 2.
 *
 * Client Component (usePathname + passes lucide icon refs).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ROUTE_MANIFEST,
  type RouteNode,
} from '@/lib/navigation/route-manifest.generated';
import {
  getNavConfigForPath,
  findActiveGroup,
  warnOnCrowdedTier,
  type ModuleNavConfig,
  type ModuleNavGroup,
} from '@/lib/navigation/nav-config';
import { cn } from '@/lib/utils';

interface AutoTabNavProps {
  maxDepth?: number;
  minDepth?: number;
  className?: string;
}

interface Chip {
  href: string;
  label: string;
  iconName: string;
  isActive: boolean;
}

function getIcon(iconName: string): LucideIcon {
  const icon = (Icons as unknown as Record<string, LucideIcon>)[iconName];
  return icon ?? Icons.FileText;
}

function TabBar({ chips }: { chips: Chip[] }) {
  if (chips.length < 2) return null;
  const containerRef = useRef<HTMLDivElement>(null);
  const activeHref = chips.find((c) => c.isActive)?.href ?? null;

  // Mobile-first: the chip strip is a single horizontal-scroll row (< md).
  // When the active chip may be off-screen after nav, bring it into view so
  // the user can see where they are. On desktop (md+) chips wrap, so the
  // active chip is always visible — scrollIntoView is a harmless no-op.
  useEffect(() => {
    if (!activeHref || !containerRef.current) return;
    const activeEl = containerRef.current.querySelector<HTMLElement>(
      `[data-chip-href="${CSS.escape(activeHref)}"]`
    );
    activeEl?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [activeHref]);

  return (
    <div
      ref={containerRef}
      className={cn(
        // Mobile: single horizontal-scroll strip — no more 40%-of-viewport
        // multi-row stacks on phones (82% of sessions). Desktop (md+) keeps
        // the existing wrap behaviour.
        'flex flex-nowrap md:flex-wrap gap-1 p-1 rounded-lg bg-muted/50 border',
        'overflow-x-auto md:overflow-x-visible max-w-full',
        // Hide the horizontal scrollbar; the active-chip scrollIntoView
        // above is the discoverability affordance.
        '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      {chips.map((c) => {
        const Icon = getIcon(c.iconName);
        return (
          <Link
            key={c.href}
            href={c.href}
            data-chip-href={c.href}
            className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0',
              c.isActive
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Icon className='h-3.5 w-3.5' />
            {c.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Walk the manifest to a URL prefix and return the node plus its children.
 *   walkManifestAt('/work-pulse')
 *     → { node: <work-pulse>, children: [<my-pulse>, <agents>, <all>, <impact>] }
 *
 * Use `children` to answer "what are the children of this path?" — which is
 * what callers building a tier-2+ sibling chips need (tier-N siblings =
 * tier-(N-1) parent's children).
 */
function walkManifestAt(
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
function flatTierChips(
  pathname: string,
  depth: number
): { chips: Chip[]; rawSiblings: number; parentPrefix: string } | null {
  const segments = pathname.split('/').filter(Boolean);
  // Allow depth === segments.length + 1 so AutoTabNav renders CHILDREN of the
  // current leaf as chips (e.g. on /admission/marketing/expos, show Analytics
  // + Masters as tier-4 chips). Users can't discover children of the current
  // page otherwise — matchPaths only handles active-state, not chip rendering.
  if (depth < 1 || depth > segments.length + 1) return null;

  const parentPrefix =
    depth === 1 ? '' : '/' + segments.slice(0, depth - 1).join('/');
  const activeSeg = segments[depth - 1]; // may be undefined when rendering children-of-leaf
  const activeHref = activeSeg ? parentPrefix + '/' + activeSeg : null;

  const siblings: RouteNode[] =
    depth === 1
      ? ROUTE_MANIFEST
      : walkManifestAt(parentPrefix).children;

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

function groupedTier2(
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
 */
function deeperTiersFromManifest(pathname: string, startDepth = 3): Chip[][] {
  const out: Chip[][] = [];
  const segments = pathname.split('/').filter(Boolean);
  for (let d = startDepth; d <= segments.length + 1; d++) {
    const tier = flatTierChips(pathname, d);
    if (!tier) continue;
    if (tier.chips.length < 2) continue;
    out.push(tier.chips);
    if (tier.rawSiblings > 12) {
      warnOnCrowdedTier(tier.parentPrefix, tier.rawSiblings);
    }
  }
  return out;
}

function resolveTiers(pathname: string): Chip[][] {
  const config = getNavConfigForPath(pathname);

  if (config) {
    const activeGroup = findActiveGroup(pathname, config);
    const tiers: Chip[][] = [groupedTier2(config, activeGroup)];

    if (activeGroup?.children && activeGroup.children.length > 0) {
      // Tier 3 from explicit children (e.g. Marketing's Campaigns/Messaging/…).
      tiers.push(
        activeGroup.children.map((c) => {
          // Active if pathname matches href OR any of the extra matchPaths.
          const pathsToCheck = [c.href, ...(c.matchPaths ?? [])];
          const isActive = pathsToCheck.some((p) =>
            c.exact ? pathname === p : pathname === p || pathname.startsWith(p + '/')
          );
          return {
            href: c.href,
            label: c.label,
            iconName: c.icon,
            isActive,
          };
        })
      );
      // Tier 4+ continues to drill from the manifest so users can still
      // navigate the leaves under the explicit tier-3 group (e.g. Monitor
      // / ROI / Segments under Marketing's Campaigns).
      tiers.push(...deeperTiersFromManifest(pathname, 4));
    } else if (activeGroup) {
      tiers.push(...deeperTiersFromManifest(pathname));
    }
    return tiers.filter((t) => t.length >= 2);
  }

  // Flat fallback
  const out: Chip[][] = [];
  const depth = pathname.split('/').filter(Boolean).length;
  for (let d = 2; d <= Math.max(depth + 1, 2); d++) {
    const tier = flatTierChips(pathname, d);
    if (!tier) continue;
    if (tier.chips.length < 2) continue;
    out.push(tier.chips);
    if (tier.rawSiblings > 12) {
      warnOnCrowdedTier(tier.parentPrefix, tier.rawSiblings);
    }
  }
  return out;
}

export function AutoTabNav({
  maxDepth = 4,
  minDepth = 2,
  className,
}: AutoTabNavProps) {
  const pathname = usePathname();
  if (!pathname) return null;
  if (
    pathname === '/' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api')
  ) {
    return null;
  }

  const allTiers = resolveTiers(pathname);
  // tiers[0] = tier 2, tiers[1] = tier 3, tiers[2] = tier 4
  const sliceStart = Math.max(0, minDepth - 2);
  const sliceEnd = Math.max(0, maxDepth - 1);
  const visible = allTiers.slice(sliceStart, sliceEnd);

  if (visible.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {visible.map((chips, i) => (
        <TabBar key={i} chips={chips} />
      ))}
    </div>
  );
}
