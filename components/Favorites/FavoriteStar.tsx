'use client';

import { Star } from 'lucide-react';
import { usePageFavorites } from '@/hooks/use-page-favorites';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface FavoriteStarProps {
  pagePath: string;
  pageTitle: string;
  module: string;
  iconName: string;
  size?: 'sm' | 'md';
  /**
   * When true, render as a labelled pill ("Favorite" / "Favorited") instead of
   * an icon-only star. Use in prominent spots (page header) where the control
   * must be obviously discoverable. Defaults to false so compact contexts
   * (sidebar rows, menus) stay icon-only.
   */
  showLabel?: boolean;
  className?: string;
}

/**
 * Star toggle button for favoriting/unfavoriting a page.
 * Place on any page header to let users add it to their favorites.
 */
export function FavoriteStar({
  pagePath,
  pageTitle,
  module,
  iconName,
  size = 'md',
  showLabel = false,
  className,
}: FavoriteStarProps) {
  const { isFavorite, addFavorite, removeFavorite } = usePageFavorites();
  const favorited = isFavorite(pagePath);
  const isUpdating = addFavorite.isPending || removeFavorite.isPending;

  const handleToggle = () => {
    if (isUpdating) return;

    if (favorited) {
      removeFavorite.mutate(pagePath);
    } else {
      addFavorite.mutate({ path: pagePath, title: pageTitle, module, iconName });
    }
  };

  const iconSize = size === 'sm' ? 14 : 18;
  // Accessible name + native tooltip — without this the button renders as
  // "(no name)" for screen readers and gives no hover hint on what it does.
  const label = favorited ? 'Remove from favorites' : 'Add to favorites';

  const star = (
    <Star
      size={iconSize}
      className={cn(
        'transition-all',
        favorited && 'fill-current',
        isUpdating && 'animate-pulse'
      )}
    />
  );

  // ── Labelled pill variant: an unmistakable "Favorite" / "Favorited" button ──
  if (showLabel) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleToggle}
        disabled={isUpdating}
        aria-label={label}
        aria-pressed={favorited}
        title={label}
        className={cn(
          'h-8 shrink-0 gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors',
          favorited
            ? 'border-yellow-400/60 bg-yellow-50 text-yellow-600 hover:bg-yellow-100 dark:border-yellow-400/40 dark:bg-yellow-400/10 dark:text-yellow-300'
            : 'text-muted-foreground hover:border-yellow-400/60 hover:text-yellow-600 dark:hover:text-yellow-300',
          className
        )}
      >
        {star}
        <span>{favorited ? 'Favorited' : 'Favorite'}</span>
      </Button>
    );
  }

  // ── Icon-only variant (compact contexts: sidebar rows, menus) ──
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggle}
            disabled={isUpdating}
            aria-label={label}
            aria-pressed={favorited}
            title={label}
            className={cn(
              'shrink-0 transition-colors',
              size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
              favorited
                ? 'text-yellow-500 hover:text-yellow-600 dark:text-yellow-400 dark:hover:text-yellow-300'
                : 'text-muted-foreground hover:text-yellow-500 dark:hover:text-yellow-400',
              className
            )}
          >
            {star}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
