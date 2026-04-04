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

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggle}
            disabled={isUpdating}
            className={cn(
              'shrink-0 transition-colors',
              size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
              favorited
                ? 'text-yellow-500 hover:text-yellow-600 dark:text-yellow-400 dark:hover:text-yellow-300'
                : 'text-muted-foreground hover:text-yellow-500 dark:hover:text-yellow-400',
              className
            )}
          >
            <Star
              size={iconSize}
              className={cn(
                'transition-all',
                favorited && 'fill-current',
                isUpdating && 'animate-pulse'
              )}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {favorited ? 'Remove from favorites' : 'Add to favorites'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
