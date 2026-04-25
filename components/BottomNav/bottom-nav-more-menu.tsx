'use client';

/**
 * BottomNavMoreMenu — Tile Grid Edition
 *
 * Replaces the section/accordion card-grid layout with a 4-column phone
 * home-screen tile grid. Each tile is a gradient-colored icon container
 * + 2-line label. Color encodes function family (operations=slate,
 * academic=indigo, HR=rose, etc.).
 *
 * Props interface is UNCHANGED from the accordion version — bottom-navbar.tsx
 * is unmodified. The tile grid simply renders `groups` differently.
 *
 * Permission filter: NOT touched here. `groups` is the permission-filtered
 * moreNavGroups computed in bottom-navbar.tsx via GetRoleBasedPages.
 * Super-admin sees ~24 tiles; test.student sees ~4 tiles; same count as before.
 *
 * Layout (bottom-anchored, thumb-zone optimised):
 *   TOP:        drag handle + "Sections · N" header
 *   MID:        4-col tile grid (scrollable)
 *   MID-BOTTOM: amber favorites strip (horizontal chip scroll)
 *   BOTTOM:     search bar + × close button
 */

import { useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BottomNavMoreMenuProps } from './types';
import { usePageFavorites } from '@/hooks/use-page-favorites';
import { ICON_MAP } from '@/lib/navigation/page-registry';
import { BottomNavTile } from './bottom-nav-tile';
import { getTileGradient } from '@/lib/navigation/tile-gradients';

// ── Emoji map for group labels ─────────────────────────────────────────────
// Phone home-screen tiles use emoji icons inside gradient containers.
// Mirrors GROUP_ICONS in bottom-navbar.tsx but uses emoji strings
// instead of LucideIcon components (so they render naturally at 26px inside
// a solid-color gradient square without needing SVG sizing overrides).
const GROUP_EMOJI: Record<string, string> = {
  'Overview':               '🏠',
  'User Management':        '👤',
  'Applications':           '📲',
  'Application Management': '📱',
  'Organization Management':'🏢',
  'Academic Management':    '📅',
  'Campus Living':          '🏡',
  'Admission CRM':          '📋',
  'Employee Management':    '👥',
  'HR (Sprints 1-3)':       '👤',
  'Learners':               '🎓',
  'Accounts':               '💰',
  'Resource Management':    '📦',
  'Service Requests':       '🛠️',
  'Administration':         '⚙️',
  'OKR & Performance':      '🎯',
  'Learning':               '📚',
  'Health & Wellness':      '🩺',
  'Events':                 '🎉',
  'Startup Studio':         '🚀',
  'Solution Hub':           '💡',
  'Value Added Courses':    '📖',
  'Work Pulse':             '💓',
  'Learners Council':       '🎙️',
  'Faculty':                '👨‍🏫',
  'Audit Workflow':         '🔍',
  'Accreditation':          '📊',
  'System':                 '🔧',
};

/** Returns first 2 chars of label as fallback emoji */
function labelFallbackEmoji(label: string): string {
  return label.slice(0, 2);
}

export function BottomNavMoreMenu({
  groups,
  isOpen,
  onClose,
  onItemClick,
}: BottomNavMoreMenuProps) {
  const pathname = usePathname();
  const { favorites, isLoading: favoritesLoading } = usePageFavorites();
  const [searchQuery, setSearchQuery] = useState('');
  const drawerRef = useRef<HTMLDivElement>(null);

  // Drag-to-dismiss via handle
  const dragStartY = useRef<number | null>(null);
  const dragCurrentDelta = useRef<number>(0);

  if (!isOpen) return null;

  /** True if current pathname is within any menu of this group */
  function isGroupActive(group: (typeof groups)[number]): boolean {
    return group.menus.some(
      (m) => pathname === m.href || pathname.startsWith(m.href + '/')
    );
  }

  /** Navigate to the first menu item href of this group */
  function handleTileClick(group: (typeof groups)[number]) {
    const target = group.menus[0]?.href;
    if (target) {
      onItemClick(target);
      onClose();
    }
  }

  // Touch drag handlers for the handle bar
  function onHandleTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY;
    dragCurrentDelta.current = 0;
    if (drawerRef.current) {
      drawerRef.current.style.transition = 'none';
    }
  }
  function onHandleTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    dragCurrentDelta.current = delta;
    if (delta > 0 && drawerRef.current) {
      drawerRef.current.style.transform = `translateY(${delta}px)`;
    }
  }
  function onHandleTouchEnd() {
    if (drawerRef.current) {
      drawerRef.current.style.transition = '';
      drawerRef.current.style.transform = '';
    }
    if (dragCurrentDelta.current > 80) {
      onClose();
    }
    dragStartY.current = null;
    dragCurrentDelta.current = 0;
  }

  // Search filter — matches groupLabel or any sub-menu label
  const filteredGroups = searchQuery.trim()
    ? groups.filter((g) => {
        const q = searchQuery.toLowerCase();
        return (
          g.groupLabel.toLowerCase().includes(q) ||
          g.menus.some((m) => m.label.toLowerCase().includes(q))
        );
      })
    : groups;

  const totalSectionCount = groups.length;

  return (
    <>
      {/* Scrim — tap to dismiss */}
      <div
        className="fixed inset-0 bg-slate-900/50 z-[85] lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="All sections"
        className={cn(
          'fixed left-0 right-0 bottom-0 z-[90] lg:hidden',
          'bg-white dark:bg-slate-950',
          'rounded-t-[20px]',
          'shadow-[0_-10px_40px_rgba(0,0,0,0.12)]',
          'flex flex-col',
          'max-h-[92dvh]'
        )}
        style={{ willChange: 'transform' }}
        data-bottom-nav-more-drawer
      >
        {/* Drag handle */}
        <div
          className="pt-2 pb-1 flex justify-center cursor-grab active:cursor-grabbing select-none flex-shrink-0"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          aria-hidden="true"
        >
          <div className="w-12 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

        {/* Header: "Sections · N" */}
        <div className="px-4 py-2 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            Sections · {totalSectionCount}
          </span>
          <span className="text-[10px] text-slate-400">tap a tile</span>
        </div>

        {/* ── 4-column tile grid ── */}
        <div
          className="overflow-y-auto flex-1 px-2 pt-3 pb-1"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          } as React.CSSProperties}
          aria-label="Section tiles"
        >
          <div className="grid grid-cols-4 gap-1">
            {filteredGroups.map((group) => {
              const emoji =
                GROUP_EMOJI[group.groupLabel] ??
                labelFallbackEmoji(group.groupLabel);
              const gradient = getTileGradient(group.groupLabel);
              const active = isGroupActive(group);

              return (
                <BottomNavTile
                  key={group.id}
                  gradient={gradient}
                  emoji={emoji}
                  label={group.groupLabel}
                  isActive={active}
                  onClick={() => handleTileClick(group)}
                  data-tile-href={group.menus[0]?.href}
                />
              );
            })}

            {filteredGroups.length === 0 && searchQuery.trim() && (
              <div className="col-span-4 py-8 text-center text-sm text-slate-400">
                No sections match &ldquo;{searchQuery}&rdquo;
              </div>
            )}
          </div>
        </div>

        {/* ── Favorites strip (amber-accented horizontal chip scroll) ── */}
        {!favoritesLoading && favorites.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-800 bg-amber-50/40 dark:bg-amber-900/10 px-3 pt-2 pb-1.5 flex-shrink-0">
            <div className="flex items-center justify-between mb-1 px-1">
              <span className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-hidden="true" />
                Favorites · {favorites.length}
              </span>
              <span className="text-[10px] text-slate-400">swipe →</span>
            </div>
            <div
              className="flex gap-2 overflow-x-auto pb-1.5"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              aria-label="Favorite pages"
            >
              {favorites.map((fav) => {
                const FavIcon = ICON_MAP[fav.iconName] || Star;
                return (
                  <button
                    key={fav.path}
                    onClick={() => {
                      onItemClick(fav.path);
                      onClose();
                    }}
                    aria-label={fav.title}
                    className={cn(
                      'shrink-0 flex items-center gap-1.5',
                      'px-3 py-2 rounded-xl',
                      'bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800',
                      'text-[12px] text-slate-800 dark:text-slate-200 font-medium',
                      'active:scale-95 transition-transform shadow-sm cursor-pointer',
                      'whitespace-nowrap'
                    )}
                  >
                    <FavIcon
                      className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0"
                      aria-hidden="true"
                    />
                    {fav.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Bottom bar: search + × close button ── */}
        <div
          className="bg-white dark:bg-slate-950 px-3 pt-2.5 flex items-center gap-2 border-t border-slate-200 dark:border-slate-800 flex-shrink-0"
          style={{
            paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
          }}
        >
          <div className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-900 rounded-2xl flex items-center gap-2.5">
            <span className="text-slate-400 text-sm" aria-hidden="true">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search sections…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent flex-1 text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none min-w-0"
              aria-label="Search sections"
            />
          </div>
          <button
            onClick={onClose}
            aria-label="Close section menu"
            className={cn(
              'w-11 h-11 rounded-2xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900',
              'text-xl font-light flex items-center justify-center',
              'active:scale-95 transition-transform shadow-md',
              'flex-shrink-0'
            )}
          >
            ×
          </button>
        </div>
      </div>
    </>
  );
}
