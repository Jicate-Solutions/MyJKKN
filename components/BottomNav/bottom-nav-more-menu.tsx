'use client';

import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Star, Search, X } from 'lucide-react';
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
const GROUP_TILE_GRADIENTS: Record<string, string> = {
  // Operations / Admin
  'Overview':                'bg-gradient-to-br from-slate-500 to-slate-700',
  'User Management':         'bg-gradient-to-br from-slate-400 to-slate-600',
  'Organization Management': 'bg-gradient-to-br from-slate-600 to-slate-800',
  'Administration':          'bg-gradient-to-br from-zinc-500 to-zinc-700',

  // Applications
  'Applications':            'bg-gradient-to-br from-blue-500 to-blue-700',
  'Application Management':  'bg-gradient-to-br from-blue-600 to-blue-800',

  // Academic family
  'Academic Management':     'bg-gradient-to-br from-indigo-500 to-indigo-700',
  'Learners':                'bg-gradient-to-br from-indigo-600 to-indigo-800',
  'Faculty':                 'bg-gradient-to-br from-violet-500 to-violet-700',
  'Learning':                'bg-gradient-to-br from-purple-500 to-purple-700',
  'Value Added Courses':     'bg-gradient-to-br from-purple-400 to-purple-600',
  'Learners Council':        'bg-gradient-to-br from-violet-600 to-violet-800',

  // People / HR
  'Employee Management':     'bg-gradient-to-br from-rose-500 to-rose-700',
  'HR (Sprints 1-3)':        'bg-gradient-to-br from-rose-600 to-rose-800',

  // Living / Wellness
  'Campus Living':           'bg-gradient-to-br from-amber-500 to-amber-700',
  'Health & Wellness':       'bg-gradient-to-br from-orange-500 to-orange-700',
  'Work Pulse':              'bg-gradient-to-br from-yellow-500 to-amber-600',

  // Admissions / Innovation
  'Admission CRM':           'bg-gradient-to-br from-pink-500 to-pink-700',
  'Events':                  'bg-gradient-to-br from-fuchsia-500 to-fuchsia-700',
  'Startup Studio':          'bg-gradient-to-br from-fuchsia-600 to-fuchsia-800',
  'Solution Hub':            'bg-gradient-to-br from-pink-400 to-fuchsia-600',

  // Finance / Resources
  'Accounts':                'bg-gradient-to-br from-emerald-500 to-emerald-700',
  'Resource Management':     'bg-gradient-to-br from-teal-500 to-teal-700',
  'Service Requests':        'bg-gradient-to-br from-sky-500 to-sky-700',

  // Performance / Compliance
  'OKR & Performance':       'bg-gradient-to-br from-cyan-500 to-cyan-700',
  'Audit Workflow':          'bg-gradient-to-br from-cyan-600 to-cyan-800',
  'Accreditation':           'bg-gradient-to-br from-sky-600 to-sky-800',

  // System
  'System':                  'bg-gradient-to-br from-zinc-700 to-zinc-900',

  // Favorites pseudo-key (used by the favorites tile rendering)
  'Favorites':               'bg-gradient-to-br from-amber-400 to-yellow-600',
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

  const handleItemClick = (href: string) => {
    onItemClick(href);
    onClose();
  };

  // ONE TILE PER GROUP (phone home-screen pattern).
  // Permission filter is IDENTICAL to before — `groups` is already permission-filtered.
  // Each tile navigates to the group's first menu href (the canonical entry point);
  // in-page tabs (ModuleNav / SectionSubNav) handle deeper navigation, matching desktop.
  const groupTiles = groups
    .filter((g) => g.menus.length > 0)
    .map((group) => ({
      key: group.id,
      label: group.groupLabel,
      icon: group.icon,
      href: group.menus[0].href,
      isActive: group.menus.some(
        (m) => pathname === m.href || pathname.startsWith(m.href + '/')
      ),
      tileGradient: GROUP_TILE_GRADIENTS[group.groupLabel] ?? undefined
    }));

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
          <SheetTitle className="text-base font-semibold">All Menus</SheetTitle>
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
            {groupTiles.length} sections
          </span>
        </SheetHeader>

        {/* Scrollable tile grid — ONE tile per group */}
        <div
          className="flex-1 overflow-y-auto px-3 pt-2 pb-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <style jsx>{`
            div::-webkit-scrollbar { display: none; }
          `}</style>

          {groupTiles.length > 0 ? (
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
                    hasSubmenu={false}
                    hideIndicator
                    variant="tile"
                    tileGradient={tile.tileGradient}
                    onClick={() => handleItemClick(tile.href)}
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
