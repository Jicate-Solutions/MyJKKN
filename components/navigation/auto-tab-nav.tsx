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
 * Permission filtering: chips are filtered using MENU_PERMISSIONS (same map
 * the sidebar uses). A chip whose href has no entry in MENU_PERMISSIONS is
 * always shown. During the async permission load, all chips are visible to
 * prevent a flash-of-disappearance race. TabBar's existing <2-chip guard
 * still applies after filtering.
 *
 * Client Component (usePathname + passes lucide icon refs).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { resolveTiers, type Chip } from '@/lib/navigation/tier-rendering';
import { findActiveGroup, getNavConfigForPath } from '@/lib/navigation/nav-config';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { MENU_PERMISSIONS, normalizeRoute } from '@/lib/sidebarMenuLink';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import { useIsHosteler } from '@/hooks/campus-living/use-is-hosteler';
import {
  useIsSoiCoordinator,
  withSoiCoordinatorNavAccess,
} from '@/hooks/school-of-influence/use-soi-coordinator-nav-access';

interface AutoTabNavProps {
  maxDepth?: number;
  minDepth?: number;
  className?: string;
}

function getIcon(iconName: string): LucideIcon {
  const icon = (Icons as unknown as Record<string, LucideIcon>)[iconName];
  return icon ?? Icons.FileText;
}

interface TabBarProps {
  chips: Chip[];
  adapt: (label: string) => string;
}

/** Width of the softened edge that signals "there are more tabs this way". */
const EDGE_FADE_PX = 32;
const EDGE_FADE = `${EDGE_FADE_PX}px`;

function TabBar({ chips, adapt }: TabBarProps) {
  // EVERY HOOK RUNS BEFORE THE <2-CHIP GUARD, AND MUST STAY THAT WAY.
  //
  // The guard used to sit on the first line, above useRef/useEffect. That is a
  // rules-of-hooks violation with a delayed fuse: React tags each fiber with
  // static flags (RefStatic, PassiveStatic) describing which hook KINDS the
  // component uses, and treats them as immutable. A render that calls the hooks
  // followed by one that early-returns recomputes those flags as empty, and
  // renderWithHooks reports:
  //
  //   "Internal React error: Expected static flag was missing."
  //
  // It fired on real pages (/hr/leave/requests) because chip counts CHANGE
  // ACROSS RENDERS FOR THE SAME FIBER. canShowChip returns true for everything
  // while usePermissions is loading -- deliberately, to avoid a
  // flash-of-disappearance -- so a tier renders with 2+ chips, then drops below
  // 2 once permissions resolve. The parent keys these by index, so that is an
  // in-place update of one fiber, not an unmount.
  //
  // Returning null after the hooks is free: the effect's own
  // `!containerRef.current` guard makes it a no-op when nothing is rendered.
  const containerRef = useRef<HTMLDivElement>(null);
  // Which side(s) currently have tabs scrolled out of sight.
  const [hidden, setHidden] = useState({ start: false, end: false });
  const activeHref = chips.find((c) => c.isActive)?.href ?? null;

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft > 1;
    const end = maxScroll > 1 && el.scrollLeft < maxScroll - 1;
    // `scroll` fires on every frame of a swipe. Passing a fresh object literal
    // to setHidden defeats React's Object.is bailout — a new object is never
    // Object.is-equal to the old one — so the whole strip would re-render on
    // each of those frames even though the two booleans almost never change.
    // Keep the previous object unless a boolean actually flipped.
    setHidden((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end }
    );
  }, []);

  // Mobile-first: the chip strip is a single horizontal-scroll row (< md).
  // Bring the active chip into view so the user can see where they are, but
  // scroll the least amount that does it, and stop once the chip clears the
  // faded edge — otherwise the one tab that must stay readable is the one
  // half-dissolved against the strip edge. When the active chip already has
  // that clearance nothing moves, so the first tab is not sliced for nothing.
  // On desktop (md+) chips wrap and there is no scroll, so this is a no-op.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (activeHref) {
      const activeEl = el.querySelector<HTMLElement>(
        `[data-chip-href="${CSS.escape(activeHref)}"]`
      );
      if (activeEl) {
        const strip = el.getBoundingClientRect();
        const chip = activeEl.getBoundingClientRect();
        const gapLeft = chip.left - strip.left;
        const gapRight = strip.right - chip.right;
        // scrollBy clamps itself at both ends of the strip.
        if (gapLeft < EDGE_FADE_PX) {
          el.scrollBy({ left: gapLeft - EDGE_FADE_PX, behavior: 'smooth' });
        } else if (gapRight < EDGE_FADE_PX) {
          el.scrollBy({ left: EDGE_FADE_PX - gapRight, behavior: 'smooth' });
        }
      }
    }
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [activeHref, chips.length, measure]);

  // No 1-chip bars. A single chip is a label, not a choice.
  if (chips.length < 2) return null;

  // A tab sliced flat by the viewport edge reads as a rendering fault. Fading
  // the content out over the last EDGE_FADE_PX of whichever side still has
  // tabs behind it turns the same cut into a "keep swiping" cue. Only the
  // chips are masked — the strip's border and background stay crisp.
  const fadeStart = hidden.start ? EDGE_FADE : '0px';
  const fadeEnd = hidden.end ? EDGE_FADE : '0px';
  const edgeMask =
    hidden.start || hidden.end
      ? `linear-gradient(to right, transparent 0px, #000 ${fadeStart}, #000 calc(100% - ${fadeEnd}), transparent 100%)`
      : undefined;

  return (
    // Outer box carries the strip's border and background so the mask below
    // only softens the tabs, never the frame around them.
    <div className='rounded-lg bg-muted/50 border max-w-full'>
      <div
        ref={containerRef}
        style={
          edgeMask ? { maskImage: edgeMask, WebkitMaskImage: edgeMask } : undefined
        }
        className={cn(
          // Mobile: single horizontal-scroll strip — no more 40%-of-viewport
          // multi-row stacks on phones (82% of sessions). Desktop (md+) keeps
          // the existing wrap behaviour.
          'flex flex-nowrap md:flex-wrap gap-1 p-1',
          'overflow-x-auto md:overflow-x-visible max-w-full',
          // Hide the horizontal scrollbar; the edge fade above is the
          // discoverability affordance instead.
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
              {adapt(c.label)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}


export function AutoTabNav({
  maxDepth = 4,
  minDepth = 2,
  className,
}: AutoTabNavProps) {
  const pathname = usePathname();
  const adaptFn = useAdaptiveLabels();
  const adapt = typeof adaptFn === 'function' ? adaptFn : (label: string) => label;
  const { permissions: rolePermissions, isSuperAdmin, isLoading } = usePermissions();
  // An appointed School of Influence coordinator holds no cohort.manage key, so
  // every chip of their own programme was filtered away and the tab strip they
  // needed rendered empty (BUG-005799 / BUG-005800). Visibility only — each
  // screen still authorises the caller in the database when opened.
  const isSoiCoordinator = useIsSoiCoordinator();
  const permissions = withSoiCoordinatorNavAccess(rolePermissions, isSoiCoordinator);

  const isCampusLiving = !!pathname && pathname.startsWith('/campus-living');
  const { data: isHosteler } = useIsHosteler(isCampusLiving);
  // A pure hostel resident: holds my_hostel.view, is NOT staff (no dashboard.view),
  // is super-admin-exempt, and is an actual hosteler. Such a user sees ONLY the
  // My Hostel bucket in campus-living; admins/wardens are unaffected.
  const residentOnlyCampusLiving =
    isCampusLiving && !isSuperAdmin && isHosteler === true &&
    permissions['campus_living.my_hostel.view'] === true &&
    permissions['campus_living.dashboard.view'] !== true;

  if (!pathname) return null;
  if (
    pathname === '/' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api')
  ) {
    return null;
  }

  const canShowChip = (href: string): boolean => {
    if (isLoading) return true;
    if (isSuperAdmin) return true;
    const perm = MENU_PERMISSIONS[normalizeRoute(href)];
    if (!perm) return true;
    return permissions[perm] === true;
  };

  const allTiers = resolveTiers(pathname);
  // tiers[0] = tier 2, tiers[1] = tier 3, tiers[2] = tier 4
  const sliceStart = Math.max(0, minDepth - 2);
  const sliceEnd = Math.max(0, maxDepth - 1);

  // A nav-config group that declares its screens as explicit children renders
  // them at tier 3. When those screens live one folder DEEPER than the group
  // (School of Influence's five admin pages, 2026-08-13), the manifest walk
  // reaches the same folder at tier 4 and paints a second, identical strip.
  // Drop the repeat. Empty for every group without explicit children, so this
  // is inert everywhere else.
  const activeNavConfig = getNavConfigForPath(pathname);
  const activeGroup = activeNavConfig
    ? findActiveGroup(pathname, activeNavConfig)
    : null;
  const explicitChildHrefs = new Set(
    (activeGroup?.children ?? []).map((c) => normalizeRoute(c.href))
  );

  const visible = allTiers
    .slice(sliceStart, sliceEnd)
    .map((chips, tierIdx) =>
      chips.filter((c) => {
        // tiers[1] IS the explicit-children strip; anything below it repeating
        // one of those hrefs is the manifest saying the same thing twice.
        if (
          sliceStart + tierIdx > 1 &&
          explicitChildHrefs.has(normalizeRoute(c.href))
        ) {
          return false;
        }
        // My Marks has its own richer in-page switcher (MarksViewTabs with
        // descriptions), so suppress the auto Internal/Result sub-tabs. The
        // trailing slash keeps the "My Marks" parent chip (/learners/my-marks)
        // in the section tier — only its children are dropped.
        if (normalizeRoute(c.href).startsWith('/learners/my-marks/')) {
          return false;
        }
        // LC Structure has its own richer in-page sub-nav (SectionSubNav in
        // learners-council/structure/layout.tsx with Portfolio Committees /
        // Terms / Verticals), so suppress the duplicate auto sub-tabs. The
        // trailing slash keeps the "Structure" parent chip in the section
        // tier — only its children are dropped.
        if (normalizeRoute(c.href).startsWith('/learners-council/structure/')) {
          return false;
        }
        // Same for YUVA Chapters — its layout renders SectionSubNav
        // (Chapters / Members), so the auto sub-tabs would duplicate it.
        if (normalizeRoute(c.href).startsWith('/learners-council/yuva/')) {
          return false;
        }
        if (
          residentOnlyCampusLiving &&
          tierIdx === 0 &&
          !normalizeRoute(c.href).startsWith('/campus-living/my-hostel')
        ) {
          return false;
        }
        return canShowChip(c.href);
      })
    )
    // Belt-and-suspenders: even if the generated manifest or an admin-side
    // override produces two chips with the same href, dedupe here so we
    // never trip React's "two children with the same key" warning in TabBar.
    .map((chips) => {
      const seen = new Set<string>();
      return chips.filter((c) => {
        if (seen.has(c.href)) return false;
        seen.add(c.href);
        return true;
      });
    });

  if (visible.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {visible.map((chips, i) => (
        <TabBar key={i} chips={chips} adapt={adapt} />
      ))}
    </div>
  );
}
