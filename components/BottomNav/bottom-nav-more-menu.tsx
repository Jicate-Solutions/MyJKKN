'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Star, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BottomNavMoreMenuProps } from './types';
import { BottomNavItem } from './bottom-nav-item';
import { usePageFavorites } from '@/hooks/use-page-favorites';
import { useCommandPalette } from '@/components/CommandPalette/CommandPaletteProvider';
import { ICON_MAP } from '@/lib/navigation/page-registry';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';

// Inline gradient map keyed by groupLabel — no separate file needed (~28 entries).
// Strategy: option 2 from PR spec (inline at call site, Tailwind gradient classes).
// Keys MUST match the canonical groupLabel values emitted by GetRoleBasedPages
// (see `lib/sidebarMenuLink.ts`). Family colors:
//   slate=ops/admin · blue=apps · indigo/violet=academic · rose=people/HR
//   amber/orange=living-wellness · pink/fuchsia=admissions/innovation
//   emerald/teal/sky=finance-resources · cyan=performance/compliance · zinc=system
// If a label isn't found, falls back to the default primary gradient in BottomNavItem.
// Tier-D Holographic gradients — 3-color stops per module (was 2-color flat).
// Recalibrated 2026-04-27 for Gen Alpha "fall in love at first sight". The
// `via-` middle stop adds chromatic depth that reads as iridescence under
// the animated conic-gradient shimmer (see bottom-nav-item.tsx tile variant).
// Module identity preserved: each gradient anchors on the previous family
// color but bridges through a complementary hue (e.g. rose → pink → rose,
// indigo → purple → indigo).
export const GROUP_TILE_GRADIENTS: Record<string, string> = {
  // Operations / Admin — slate family with chromatic accents
  'Overview':                'bg-gradient-to-br from-slate-400 via-slate-500 to-slate-700',
  'User Management':         'bg-gradient-to-br from-slate-300 via-blue-400 to-slate-600',
  'Organization':            'bg-gradient-to-br from-slate-500 via-indigo-500 to-slate-800',
  'Administration':          'bg-gradient-to-br from-zinc-400 via-purple-500 to-zinc-700',

  // Applications
  'Applications':            'bg-gradient-to-br from-blue-400 via-cyan-500 to-blue-700',

  // Academic family — indigo / violet / purple
  'Academic':                'bg-gradient-to-br from-indigo-400 via-purple-500 to-indigo-700',
  'Learners':                'bg-gradient-to-br from-indigo-500 via-violet-500 to-indigo-800',
  'Faculty':                 'bg-gradient-to-br from-violet-400 via-fuchsia-500 to-violet-700',
  'Learning & Courses':      'bg-gradient-to-br from-purple-400 via-pink-500 to-purple-700',
  'Learners Council':        'bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700',

  // People / HR — warm rose
  'Human Resources':         'bg-gradient-to-br from-rose-400 via-pink-500 to-rose-700',

  // Living / Wellness — amber / orange
  'Campus Living':           'bg-gradient-to-br from-amber-400 via-orange-500 to-amber-700',
  'Health & Wellness':       'bg-gradient-to-br from-orange-400 via-rose-500 to-orange-700',
  'Work Pulse':              'bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-600',

  // Admissions / Innovation — pink / fuchsia
  'Admission CRM':           'bg-gradient-to-br from-pink-400 via-rose-500 to-pink-700',
  'Events':                  'bg-gradient-to-br from-fuchsia-400 via-pink-500 to-fuchsia-700',
  'Startup Studio':          'bg-gradient-to-br from-fuchsia-500 via-purple-500 to-fuchsia-800',
  'Solution Hub':            'bg-gradient-to-br from-pink-400 via-fuchsia-500 to-purple-600',

  // Finance / Resources — emerald / teal / sky
  'Billing & Accounts':      'bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-700',
  'Resources':               'bg-gradient-to-br from-teal-400 via-cyan-500 to-teal-700',
  'Service Requests':        'bg-gradient-to-br from-sky-400 via-blue-500 to-sky-700',

  // Performance / Compliance — cyan / sky
  'OKR':                     'bg-gradient-to-br from-cyan-400 via-blue-500 to-cyan-700',
  'Audit Workflow':          'bg-gradient-to-br from-cyan-500 via-teal-500 to-cyan-800',
  'Accreditation':           'bg-gradient-to-br from-sky-500 via-indigo-500 to-sky-800',

  // System
  'System':                  'bg-gradient-to-br from-zinc-600 via-slate-600 to-zinc-900',

  // Favorites pseudo-key (used by the favorites tile rendering)
  'Favorites':               'bg-gradient-to-br from-amber-400 via-yellow-500 to-orange-500',
};

export function BottomNavMoreMenu({
  groups,
  isOpen,
  onClose,
  onItemClick
}: BottomNavMoreMenuProps) {
  const pathname = usePathname();
  const { favorites, isLoading: favoritesLoading } = usePageFavorites();

  const { open: openCommandPalette } = useCommandPalette();

  // Drill-down state: when a multi-module group tile is tapped, replace the
  // tile grid with a list view showing that group's modules. Tap-back returns
  // to the tile grid. Reset whenever the parent sheet closes so re-opening
  // always lands on the tile grid (matches phone home-screen mental model).
  const [drillIntoGroupId, setDrillIntoGroupId] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen) setDrillIntoGroupId(null);
  }, [isOpen]);

  const handleItemClick = (href: string) => {
    onItemClick(href);
    onClose();
  };

  // ONE TILE PER GROUP (phone home-screen pattern).
  // Permission filter is IDENTICAL to before — `groups` is already permission-filtered.
  //
  // Tap behavior + chevron affordance both split by `topLevelPeers.length`:
  //   - Single-peer group → tile navigates directly to the peer's href. No
  //     chevron. Peer's in-page ModuleNav handles deeper navigation per
  //     PR #486's design intent.
  //   - Multi-peer group  → chevron in tile bottom-right. Tap opens drill-
  //     down list view containing only the top-level peer modules (NOT
  //     deep submenus). Mirrors the desktop sidebar grouping pattern: user
  //     picks a peer, lands on its root, in-page tabs handle the rest.
  //
  // `topLevelPeers` is permission-filtered by construction (built from
  // `matched.menus` which came from `filteredPages`). So the chevron
  // promises ONLY what the user can actually access.
  //
  // After BOS is added to MODULES (separate PR), Academic auto-becomes
  // multi-peer without changing this code — the criterion is data-driven.
  const groupTiles = groups
    .filter((g) => g.menus.length > 0)
    .map((group) => ({
      key: group.id,
      label: group.groupLabel,
      icon: group.icon,
      href: group.topLevelPeers[0]?.href ?? group.menus[0].href,
      hasMultipleModules: group.topLevelPeers.length > 1,
      // Drill-down content: top-level peers only (Decision C from
      // /assumption-thrash 2026-04-26). User goes peer → module root →
      // in-page tabs handle the rest.
      drillItems: group.topLevelPeers,
      isActive: group.menus.some(
        (m) => pathname === m.href || pathname.startsWith(m.href + '/')
      ),
      tileGradient: GROUP_TILE_GRADIENTS[group.groupLabel] ?? undefined
    }));

  const drillGroup = drillIntoGroupId
    ? groupTiles.find((t) => t.key === drillIntoGroupId) ?? null
    : null;

  const handleTileClick = (tile: (typeof groupTiles)[number]) => {
    if (tile.hasMultipleModules) {
      setDrillIntoGroupId(tile.key);
    } else {
      handleItemClick(tile.href);
    }
  };

  const handleSearchClick = () => {
    onClose();
    // Defer so drawer close animation doesn't conflict with palette open
    setTimeout(() => openCommandPalette(), 200);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="h-[88vh] rounded-t-3xl flex flex-col z-[90] p-0 [&>button]:hidden"
      >
        <SheetHeader className="px-4 pt-3 pb-2 flex-shrink-0 flex flex-row items-center justify-between space-y-0">
          {drillGroup ? (
            <>
              <button
                onClick={() => setDrillIntoGroupId(null)}
                className="flex items-center gap-1 text-base font-semibold -ml-1 px-1 py-0.5 rounded hover:bg-muted/50 active:bg-muted"
                aria-label="Back to all menus"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
                <SheetTitle className="text-base font-semibold">
                  {drillGroup.label}
                </SheetTitle>
              </button>
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                {drillGroup.drillItems.length} items
              </span>
            </>
          ) : (
            <>
              <SheetTitle className="text-base font-semibold">All Menus</SheetTitle>
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                {groupTiles.length} sections
              </span>
            </>
          )}
        </SheetHeader>

        {/* Scrollable content — tile grid by default, list view when drilled into a group */}
        <div
          className="flex-1 overflow-y-auto px-3 pt-2 pb-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <style jsx>{`
            div::-webkit-scrollbar { display: none; }
          `}</style>

          {drillGroup ? (
            // DRILL-DOWN LIST VIEW: top-level peer modules only (Decision C
            // from /assumption-thrash). User picks a peer → navigates to
            // module root → in-page ModuleNav handles deeper navigation.
            // This restores PR #486's "in-page tabs handle depth" design
            // intent while still solving the original gap (peer modules 2..N
            // were silently unreachable from the More drawer when sidebar
            // collapsed them under one entry).
            <div className="flex flex-col gap-1">
              {drillGroup.drillItems.map((menu, index) => {
                const Icon = menu.icon;
                const isActive =
                  pathname === menu.href ||
                  pathname.startsWith(menu.href + '/');
                return (
                  <motion.button
                    key={menu.href}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{
                      opacity: 1,
                      x: 0,
                      transition: { delay: index * 0.02 }
                    }}
                    onClick={() => handleItemClick(menu.href)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors',
                      'active:scale-[0.99]',
                      isActive
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-background border-border/40 text-foreground hover:bg-muted/50'
                    )}
                  >
                    <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-muted/60 flex items-center justify-center">
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span className="flex-1 text-left text-sm font-medium truncate">
                      {menu.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={2} />
                  </motion.button>
                );
              })}
            </div>
          ) : groupTiles.length > 0 ? (
            <div className="grid grid-cols-4 gap-1">
              {groupTiles.map((tile, index) => (
                <motion.div
                  key={tile.key}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    transition: { delay: index * 0.015 }
                  }}
                >
                  <BottomNavItem
                    id={tile.key}
                    icon={tile.icon}
                    label={tile.label}
                    isActive={tile.isActive}
                    hasSubmenu={tile.hasMultipleModules}
                    hideIndicator
                    variant="tile"
                    tileGradient={tile.tileGradient}
                    onClick={() => handleTileClick(tile)}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
              No additional menus available
            </div>
          )}
        </div>

        {/* BOTTOM ZONE — sticky thumb-zone controls */}
        <div className="flex-shrink-0 border-t border-border/40 bg-background">
          {/* Favorites — horizontal scroll strip */}
          {!favoritesLoading && favorites.length > 0 && (
            <div className="px-3 pt-2.5 pb-2 bg-yellow-500/[0.04] dark:bg-yellow-500/[0.06] border-b border-border/40">
              <div className="flex items-center justify-between mb-1.5 px-1">
                <span className="text-[10px] uppercase tracking-wider text-yellow-700 dark:text-yellow-500 font-bold flex items-center gap-1">
                  <Star className="h-3 w-3 fill-current" strokeWidth={2.5} />
                  Favorites · {favorites.length}
                </span>
                {favorites.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">swipe →</span>
                )}
              </div>
              <div
                className="flex gap-2 overflow-x-auto pb-1.5"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {favorites.map((fav) => {
                  const Icon = ICON_MAP[fav.iconName] || Star;
                  const isActive =
                    pathname === fav.path ||
                    pathname.startsWith(fav.path + '/');
                  return (
                    <button
                      key={fav.path}
                      onClick={() => handleItemClick(fav.path)}
                      className={cn(
                        'shrink-0 px-3 py-2 rounded-xl flex items-center gap-1.5',
                        'text-[12px] font-medium shadow-sm',
                        'border transition-colors',
                        'active:scale-95',
                        isActive
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-background border-yellow-500/30 text-foreground hover:bg-yellow-500/10'
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} />
                      <span className="whitespace-nowrap">{fav.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search bar (left, full-width) + Close button (right, thumb-zone) */}
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-3">
            <button
              onClick={handleSearchClick}
              className={cn(
                'flex-1 flex items-center gap-2.5 px-4 py-3',
                'bg-muted/60 hover:bg-muted/80 rounded-2xl',
                'text-sm text-muted-foreground transition-colors',
                'active:scale-[0.98]'
              )}
              aria-label="Open search"
            >
              <Search className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span className="flex-1 text-left">Search anything…</span>
              <kbd className="hidden sm:inline-flex text-[10px] font-mono px-1.5 py-0.5 bg-background border border-border/60 rounded">
                ⌘K
              </kbd>
            </button>
            <button
              onClick={onClose}
              className={cn(
                'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
                'bg-foreground text-background',
                'active:scale-95 transition-transform shadow-md'
              )}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
