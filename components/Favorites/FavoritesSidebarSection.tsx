'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Star, ChevronDown, Pin, X, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePageFavorites } from '@/hooks/use-page-favorites';
import { ICON_MAP } from '@/lib/navigation/page-registry';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FavoritePage } from '@/lib/navigation/types';

interface FavoritesSidebarSectionProps {
  isOpen: boolean | undefined;
}

/**
 * Collapsible "Favorites" section at the top of the sidebar.
 * Supports drag-and-drop reordering via @dnd-kit.
 */
// Remembered rendered height of this section, so a reload can reserve the space
// before the favourites query resolves. Without it the section is 0px during
// load and then snaps to its real height (595px for 16 favourites), shoving the
// whole nav below it down — measured CLS 0.58 on /dashboard, well past Google's
// 0.25 "poor" threshold, and it lands ~400ms in, right when the menu is first
// clickable.
const FAV_HEIGHT_KEY = 'sidebar:favorites-height';

export function FavoritesSidebarSection({ isOpen }: FavoritesSidebarSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const sectionRef = useRef<HTMLDivElement>(null);
  // Starts at 0 and is filled on mount, never during render: reading
  // localStorage while rendering would desync server and client HTML.
  const [reservedHeight, setReservedHeight] = useState(0);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(FAV_HEIGHT_KEY));
    if (Number.isFinite(stored) && stored > 0) setReservedHeight(stored);
  }, []);
  const {
    favorites,
    pinnedFavorites,
    unpinnedFavorites,
    removeFavorite,
    togglePin,
    reorderFavorites,
    isLoading,
  } = usePageFavorites();
  const pathname = usePathname();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const allItems = [...pinnedFavorites, ...unpinnedFavorites];
      const oldIndex = allItems.findIndex((f) => f.path === active.id);
      const newIndex = allItems.findIndex((f) => f.path === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(allItems, oldIndex, newIndex);
        reorderFavorites.mutate(reordered.map((f) => f.path));
      }
    },
    [pinnedFavorites, unpinnedFavorites, reorderFavorites]
  );

  // Record the real rendered height so the NEXT load can reserve it. Only when
  // fully expanded and open — a collapsed section would cache a height too small
  // to prevent the shift.
  useEffect(() => {
    if (isLoading || favorites.length === 0 || isOpen === false || !isExpanded) return;
    const h = sectionRef.current?.offsetHeight;
    if (h && h > 0) window.localStorage.setItem(FAV_HEIGHT_KEY, String(h));
  }, [isLoading, favorites.length, isOpen, isExpanded]);

  // While the query is in flight, hold the space open instead of collapsing to
  // nothing. On a first-ever visit there is no remembered height (0) and this
  // renders nothing, exactly as before — every later visit is stable.
  if (isLoading) {
    return reservedHeight > 0 ? (
      <div style={{ height: reservedHeight }} aria-hidden='true' />
    ) : null;
  }

  // Don't show if no favorites or sidebar collapsed
  if (favorites.length === 0) return null;

  // In collapsed sidebar mode, show a star icon
  if (isOpen === false) {
    return (
      <div className="px-2 py-1">
        <div className="flex justify-center">
          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
        </div>
      </div>
    );
  }

  const allSortableItems = [...pinnedFavorites, ...unpinnedFavorites];

  return (
    <div ref={sectionRef} className="px-2 pt-1 pb-2">
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
        <span className="text-[9px] opacity-50">{favorites.length}</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 transition-transform',
            !isExpanded && '-rotate-90'
          )}
        />
      </button>

      {/* Favorites List with Drag & Drop */}
      {isExpanded && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={allSortableItems.map((f) => f.path)}
            strategy={verticalListSortingStrategy}
          >
            <div className="mt-1 space-y-0.5">
              {allSortableItems.map((fav) => (
                <SortableFavoriteItem
                  key={fav.path}
                  favorite={fav}
                  isActive={
                    pathname === fav.path ||
                    pathname.startsWith(fav.path + '/')
                  }
                  onRemove={() => removeFavorite.mutate(fav.path)}
                  onTogglePin={() =>
                    togglePin.mutate({
                      pagePath: fav.path,
                      isPinned: !fav.isPinned,
                    })
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Separator */}
      <div className="mt-2 mx-3 border-b border-border/50 dark:border-gray-700/40" />
    </div>
  );
}

// ─── Sortable Favorite Item ──────────────────────────────────────────────────

function SortableFavoriteItem({
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
  const adapt = useAdaptiveLabels();
  const IconComponent = ICON_MAP[favorite.iconName] || Star;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: favorite.path });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className={cn(
            'h-8 w-5 flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing',
            'text-muted-foreground/30 hover:text-muted-foreground/60',
            'opacity-0 group-hover:opacity-100 transition-opacity'
          )}
          tabIndex={-1}
        >
          <GripVertical className="h-3 w-3" />
        </button>

        {/* Link button */}
        <Button
          variant={isActive ? 'secondary' : 'ghost'}
          className={cn(
            'flex-1 justify-start h-8 px-2 text-xs',
            !isActive && 'dark:text-gray-400 hover:dark:text-gray-200'
          )}
          asChild
        >
          <Link href={favorite.path}>
            <IconComponent className="h-3.5 w-3.5 mr-2 shrink-0" />
            <span className="truncate flex-1">{adapt(favorite.title)}</span>
            {favorite.isPinned && !isHovered && (
              <Pin className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
            )}
          </Link>
        </Button>
      </div>

      {/* Hover actions */}
      {isHovered && !isDragging && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-10">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTogglePin();
            }}
            className={cn(
              'h-5 w-5 flex items-center justify-center rounded-sm',
              'hover:bg-muted text-muted-foreground hover:text-foreground',
              'transition-colors',
              favorite.isPinned && 'text-blue-500'
            )}
            title={favorite.isPinned ? 'Unpin' : 'Pin to top'}
          >
            <Pin className="h-2.5 w-2.5" />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
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
