'use client';

/**
 * AutoTabNav — self-discovering in-page tab bar.
 *
 * Renders 0..N tiers of horizontal tab navigation derived from
 * lib/navigation/route-manifest.generated.ts (regenerated at build by
 * scripts/generate-route-manifest.ts). Each tier shows the siblings at
 * that depth of the current pathname.
 *
 * Example: on /admission/marketing/campaigns/monitoring, this renders:
 *   Tier 2: Admission siblings (Dashboard, Leads, ..., Marketing*)
 *   Tier 3: Marketing siblings (Campaigns*, Messaging, Voice, Media, Expos)
 *   Tier 4: Campaigns siblings (Monitor*, ROI, Segments)
 *
 * No per-module layout.tsx required. Drop a page.tsx anywhere → it auto-
 * appears in the right tier on its peers. Override label/icon with:
 *   export const navMeta = { label: 'My Page', icon: 'Users' }
 *
 * The component is a Client Component because it uses usePathname and
 * passes lucide icon refs (Server→Client serialization safety — same
 * pattern as LC's structure/layout.tsx).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ROUTE_MANIFEST, type RouteNode } from '@/lib/navigation/route-manifest.generated';
import { cn } from '@/lib/utils';

interface AutoTabNavProps {
  /**
   * Maximum depth (counting from URL root) to render tabs for. Default: 4.
   * Set lower if a module wants to skip the deeper tiers.
   */
  maxDepth?: number;
  /**
   * Minimum depth at which to start rendering. Default: 1
   * (skip tier 0 — sidebar already covers module-root navigation).
   */
  minDepth?: number;
  className?: string;
}

interface Tier {
  /** Depth of this tier (1 = first URL segment, 2 = second, ...) */
  depth: number;
  /** All sibling routes at this tier */
  siblings: RouteNode[];
  /** The currently-active sibling, if any */
  active: RouteNode | null;
}

function getIcon(iconName: string): LucideIcon {
  const icon = (Icons as unknown as Record<string, LucideIcon>)[iconName];
  return icon ?? Icons.FileText;
}

/**
 * Walk the manifest along pathname segments, collecting tiers as we go.
 * For each segment of the URL, find the matching node + capture its siblings.
 */
function buildTiers(pathname: string, manifest: RouteNode[]): Tier[] {
  const segments = pathname.split('/').filter(Boolean);
  const tiers: Tier[] = [];

  let currentLevel: RouteNode[] = manifest;
  let urlPrefix = '';

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    urlPrefix += `/${seg}`;

    if (currentLevel.length === 0) break;

    const active = currentLevel.find((n) => n.path === urlPrefix) ?? null;

    tiers.push({
      depth: i + 1,
      siblings: currentLevel,
      active,
    });

    if (!active) break;
    currentLevel = active.children;
  }

  // If pathname has trailing depth (e.g. landed on a parent that has children),
  // include the children as the next tier so users see their drill-down options.
  const last = tiers[tiers.length - 1];
  if (last?.active && last.active.children.length > 0) {
    tiers.push({
      depth: last.depth + 1,
      siblings: last.active.children,
      active: null,
    });
  }

  return tiers;
}

function TabBar({ tier }: { tier: Tier }) {
  if (tier.siblings.length < 2) return null; // no point in 1-tab nav

  return (
    <div className='flex flex-wrap gap-1 p-1 rounded-lg bg-muted/50 border max-w-full'>
      {tier.siblings.map((node) => {
        const Icon = getIcon(node.iconName);
        const isActive = tier.active?.path === node.path;
        return (
          <Link
            key={node.path}
            href={node.path}
            className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap',
              isActive
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Icon className='h-3.5 w-3.5' />
            {node.label}
          </Link>
        );
      })}
    </div>
  );
}

export function AutoTabNav({
  maxDepth = 4,
  minDepth = 1,
  className,
}: AutoTabNavProps) {
  const pathname = usePathname();
  const tiers = buildTiers(pathname, ROUTE_MANIFEST).filter(
    (t) => t.depth >= minDepth && t.depth <= maxDepth
  );

  // Skip if no nav-worthy tiers (root path, or all tiers have <2 siblings)
  const visible = tiers.filter((t) => t.siblings.length >= 2);
  if (visible.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {visible.map((tier) => (
        <TabBar key={tier.depth} tier={tier} />
      ))}
    </div>
  );
}
