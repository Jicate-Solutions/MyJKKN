'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Star, ChevronDown, Pin, X } from 'lucide-react';
import { usePageFavorites } from '@/hooks/use-page-favorites';
import { ICON_MAP } from '@/lib/navigation/page-registry';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FavoritePage } from '@/lib/navigation/types';

interface FavoritesSidebarSectionProps {
  isOpen: boolean | undefined;
}

/**
 * Collapsible "Favorites" section at the top of the sidebar.
 * Shows user's favorited pages with quick navigation.
 */
export function FavoritesSidebarSection({ isOpen }: FavoritesSidebarSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { favorites, pinnedFavorites, unpinnedFavorites, removeFavorite, togglePin, isLoading } = usePageFavorites();
  const pathname = usePathname();

  // Don't show if no favorites or sidebar collapsed
  if (isLoading || favorites.length === 0) return null;

  // In collapsed sidebar mode, show a star icon that expands to tooltip
  if (isOpen === false) {
    return (
      <div className="px-2 py-1">
        <div className="flex justify-center">
          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 pt-1 pb-2">
      {/* Section Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium uppercase tracking-wider',
          'text-muted-foreground hover:text-foreground transition-colors rounded-md',
          'dark:text-gray-400 dark:hover:text-white'
        )}
      >
        <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
        <span className="flex-1 text-left">Favorites</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 transition-transform',
            !isExpanded && '-rotate-90'
          )}
        />
      </button>

      {/* Favorites List */}
      {isExpanded && (
        <div className="mt-1 space-y-0.5">
          {/* Pinned items first */}
          {pinnedFavorites.map((fav) => (
            <FavoriteItem
              key={fav.path}
              favorite={fav}
              isActive={pathname === fav.path || pathname.startsWith(fav.path + '/')}
              onRemove={() => removeFavorite.mutate(fav.path)}
              onTogglePin={() => togglePin.mutate({ pagePath: fav.path, isPinned: false })}
            />
          ))}

          {/* Unpinned items */}
          {unpinnedFavorites.map((fav) => (
            <FavoriteItem
              key={fav.path}
              favorite={fav}
              isActive={pathname === fav.path || pathname.startsWith(fav.path + '/')}
              onRemove={() => removeFavorite.mutate(fav.path)}
              onTogglePin={() => togglePin.mutate({ pagePath: fav.path, isPinned: true })}
            />
          ))}
        </div>
      )}

      {/* Separator */}
      <div className="mt-2 mx-3 border-b border-border/50 dark:border-gray-700/40" />
    </div>
  );
}

// ─── Favorite Item ───────────────────────────────────────────────────────────

function FavoriteItem({
  favorite,
  isActive,
  onRemove,
  onTogglePin,
}: {
  favorite: FavoritePage;
  isActive: boolean;
  onRemove: () => void;
  onTogglePin: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const IconComponent = ICON_MAP[favorite.iconName] || Star;

  return (
    <div
      className="group relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Button
        variant={isActive ? 'secondary' : 'ghost'}
        className={cn(
          'w-full justify-start h-8 px-3 text-xs',
          !isActive && 'dark:text-gray-400 hover:dark:text-gray-200'
        )}
        asChild
      >
        <Link href={favorite.path}>
          <IconComponent className="h-3.5 w-3.5 mr-2 shrink-0" />
          <span className="truncate flex-1">{favorite.title}</span>
          {favorite.isPinned && !isHovered && (
            <Pin className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
          )}
        </Link>
      </Button>

      {/* Hover actions */}
      {isHovered && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(); }}
            className={cn(
              'h-5 w-5 flex items-center justify-center rounded-sm',
              'hover:bg-muted text-muted-foreground hover:text-foreground',
              'transition-colors'
            )}
            title={favorite.isPinned ? 'Unpin' : 'Pin to top'}
          >
            <Pin className="h-2.5 w-2.5" />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
            className={cn(
              'h-5 w-5 flex items-center justify-center rounded-sm',
              'hover:bg-destructive/10 text-muted-foreground hover:text-destructive',
              'transition-colors'
            )}
            title="Remove from favorites"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}
