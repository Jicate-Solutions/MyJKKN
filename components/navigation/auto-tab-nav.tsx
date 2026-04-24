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
import { resolveTiers, type Chip } from '@/lib/navigation/tier-rendering';
import { cn } from '@/lib/utils';

interface AutoTabNavProps {
  maxDepth?: number;
  minDepth?: number;
  className?: string;
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
