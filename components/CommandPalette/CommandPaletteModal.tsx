'use client';

import { useState, useEffect, useCallback } from 'react';
import { Command } from 'cmdk';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { usePageSearch } from '@/hooks/use-page-search';
import { usePermissions } from '@/hooks/use-permissions';
import { ICON_MAP } from '@/lib/navigation/page-registry';
import { KEYBOARD_SHORTCUTS } from '@/lib/navigation/keyboard-shortcuts';
import { trackSearch } from '@/lib/navigation/search-history';
import { trackSearchAnalytics } from '@/lib/navigation/search-analytics';
import { useContextualSuggestions } from './ContextualSuggestions';
import { findRestrictedPages, RestrictedPageItem } from './RequestAccess';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Search, Star, Clock, Zap, TrendingUp, ArrowRight, FileText, Compass, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SearchResult, RecentPage } from '@/lib/navigation/types';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onPermissionsLoaded?: (perms: Record<string, boolean>, isSuperAdmin: boolean) => void;
}

export function CommandPaletteModal({ isOpen, onClose, onNavigate, onPermissionsLoaded }: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const { search, searchablePages, recentPages, frequentPages, isLoading } = usePageSearch();
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const { profile } = useAuth();
  const { permissions, isSuperAdmin } = usePermissions();

  // Contextual suggestions based on current page
  const contextualSuggestions = useContextualSuggestions(pathname);

  // Accessible paths set (for finding restricted pages)
  const accessiblePaths = new Set(searchablePages.map(p => p.path));

  // Sync permissions back to provider for keyboard shortcuts
  useEffect(() => {
    onPermissionsLoaded?.(permissions || {}, isSuperAdmin || false);
  }, [permissions, isSuperAdmin, onPermissionsLoaded]);

  // Reset query when modal opens
  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  // Perform search
  const searchResults = query.trim().length >= 2 ? search(query) : { pages: [], actions: [] };
  const hasResults = searchResults.pages.length > 0 || searchResults.actions.length > 0;
  const showEmptyState = !query.trim() || query.trim().length < 2;

  // Find restricted pages matching the query (Phase 9)
  const restrictedPages = !showEmptyState && !hasResults
    ? findRestrictedPages(query, accessiblePaths, 3)
    : !showEmptyState
    ? findRestrictedPages(query, accessiblePaths, 2)
    : [];

  const handleSelect = useCallback(
    (path: string) => {
      // Track search analytics
      if (query.trim().length >= 2 && profile?.id) {
        trackSearch(query, path);
        trackSearchAnalytics({
          userId: profile.id,
          query,
          resultsCount: searchResults.pages.length + searchResults.actions.length,
          selectedPath: path,
          institutionId: profile.institution_id || undefined,
        });
      }
      onNavigate(path);
    },
    [onNavigate]
  );

  // Get shortcut for a path
  const getShortcut = (path: string): string | undefined => {
    for (const [key, shortcut] of Object.entries(KEYBOARD_SHORTCUTS)) {
      if (shortcut.path === path) {
        return key.replace('alt+', 'Alt+').toUpperCase();
      }
    }
    return undefined;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          'overflow-hidden p-0 shadow-2xl',
          'border border-border/50',
          'dark:bg-gray-900/95 dark:backdrop-blur-xl dark:border-gray-700/50',
          isMobile ? 'max-w-[95vw] top-[5%] translate-y-0' : 'max-w-[640px] top-[20%] translate-y-0'
        )}
        // Remove default close button — Command palette closes with Escape
        onPointerDownOutside={() => onClose()}
      >
        <VisuallyHidden>
          <DialogTitle>Search pages and actions</DialogTitle>
          <DialogDescription>Use the search bar to find pages, actions, and navigate quickly</DialogDescription>
        </VisuallyHidden>
        <Command
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5"
          loop
          shouldFilter={false}
        >
          {/* Search Input */}
          <div className="flex items-center border-b px-4 dark:border-gray-700/50">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search pages, actions..."
              className={cn(
                'flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none',
                'placeholder:text-muted-foreground',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            />
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-2">
              ESC
            </kbd>
          </div>

          {/* Results Area */}
          <Command.List className="max-h-[400px] overflow-y-auto p-2">
            {/* Loading state */}
            {isLoading && (
              <Command.Loading>
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading pages...
                </div>
              </Command.Loading>
            )}

            {/* Empty state — show recents, favorites, frequent */}
            {showEmptyState && !isLoading && (
              <>
                {/* Recent Pages */}
                {recentPages.length > 0 && (
                  <Command.Group heading={
                    <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider">
                      <Clock className="h-3 w-3" /> Recent
                    </span>
                  }>
                    {recentPages.slice(0, 6).map((recent) => (
                      <RecentPageItem
                        key={recent.path}
                        recent={recent}
                        shortcut={getShortcut(recent.path)}
                        onSelect={handleSelect}
                      />
                    ))}
                  </Command.Group>
                )}

                {/* Frequently Visited */}
                {frequentPages.length > 0 && (
                  <Command.Group heading={
                    <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider">
                      <TrendingUp className="h-3 w-3" /> Frequently Used
                    </span>
                  }>
                    {frequentPages.slice(0, 5).map((freq) => (
                      <RecentPageItem
                        key={`freq-${freq.path}`}
                        recent={freq}
                        shortcut={getShortcut(freq.path)}
                        onSelect={handleSelect}
                      />
                    ))}
                  </Command.Group>
                )}

                {/* Contextual Suggestions based on current page */}
                {contextualSuggestions.length > 0 && (
                  <Command.Group heading={
                    <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider">
                      <Compass className="h-3 w-3" /> Related Pages
                    </span>
                  }>
                    {contextualSuggestions.slice(0, 4).map((page) => (
                      <SearchResultItem
                        key={`ctx-${page.path}`}
                        result={{ page, score: 0 }}
                        shortcut={getShortcut(page.path)}
                        onSelect={handleSelect}
                      />
                    ))}
                  </Command.Group>
                )}

                {/* If nothing to show */}
                {recentPages.length === 0 && frequentPages.length === 0 && contextualSuggestions.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    <Search className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>Start typing to search pages...</p>
                    <p className="text-xs mt-1 opacity-70">Search by page name, keywords, or description</p>
                  </div>
                )}
              </>
            )}

            {/* Search results */}
            {!showEmptyState && (
              <>
                {/* Page Results */}
                {searchResults.pages.length > 0 && (
                  <Command.Group heading={
                    <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider">
                      <FileText className="h-3 w-3" /> Pages
                    </span>
                  }>
                    {searchResults.pages.map((result) => (
                      <SearchResultItem
                        key={result.page.path}
                        result={result}
                        shortcut={getShortcut(result.page.path)}
                        onSelect={handleSelect}
                      />
                    ))}
                  </Command.Group>
                )}

                {/* Action Results */}
                {searchResults.actions.length > 0 && (
                  <Command.Group heading={
                    <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider">
                      <Zap className="h-3 w-3" /> Actions
                    </span>
                  }>
                    {searchResults.actions.map((result) => (
                      <SearchResultItem
                        key={`action-${result.page.path}`}
                        result={result}
                        shortcut={getShortcut(result.page.path)}
                        onSelect={handleSelect}
                      />
                    ))}
                  </Command.Group>
                )}

                {/* Restricted pages the user can't access */}
                {restrictedPages.length > 0 && (
                  <Command.Group heading={
                    <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider">
                      <Lock className="h-3 w-3" /> Restricted
                    </span>
                  }>
                    {restrictedPages.map(({ page, requiredPermission }) => (
                      <RestrictedPageItem
                        key={`locked-${page.path}`}
                        page={page}
                        permission={requiredPermission}
                      />
                    ))}
                  </Command.Group>
                )}

                {/* No results */}
                {!hasResults && restrictedPages.length === 0 && (
                  <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                    <p>No pages found for &quot;{query}&quot;</p>
                    <p className="text-xs mt-1 opacity-70">Try different keywords or check permissions</p>
                  </Command.Empty>
                )}
              </>
            )}
          </Command.List>

          {/* Footer with keyboard hints */}
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground dark:border-gray-700/50">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border px-1 py-0.5 text-[10px] dark:border-gray-600">↑↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border px-1 py-0.5 text-[10px] dark:border-gray-600">↵</kbd>
                Open
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border px-1 py-0.5 text-[10px] dark:border-gray-600">Esc</kbd>
                Close
              </span>
            </div>
            <span className="hidden sm:inline opacity-70">
              {query ? `${searchResults.pages.length + searchResults.actions.length} results` : 'Type to search'}
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SearchResultItem({
  result,
  shortcut,
  onSelect,
}: {
  result: SearchResult;
  shortcut?: string;
  onSelect: (path: string) => void;
}) {
  const { page } = result;
  const IconComponent = ICON_MAP[page.iconName] || FileText;

  return (
    <Command.Item
      value={page.path}
      onSelect={() => onSelect(page.path)}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer',
        'aria-selected:bg-accent aria-selected:text-accent-foreground',
        'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
        'hover:bg-accent/50 transition-colors'
      )}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/60 dark:bg-gray-800">
        <IconComponent className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{page.title}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
            {page.module}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {page.description}
        </p>
      </div>
      {shortcut && (
        <kbd className="hidden sm:inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground shrink-0 dark:border-gray-600">
          {shortcut}
        </kbd>
      )}
      <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-aria-selected:opacity-100 shrink-0" />
    </Command.Item>
  );
}

function RecentPageItem({
  recent,
  shortcut,
  onSelect,
}: {
  recent: RecentPage;
  shortcut?: string;
  onSelect: (path: string) => void;
}) {
  const IconComponent = ICON_MAP[recent.iconName] || FileText;
  const timeAgo = getTimeAgo(recent.visitedAt);

  return (
    <Command.Item
      value={recent.path}
      onSelect={() => onSelect(recent.path)}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer',
        'aria-selected:bg-accent aria-selected:text-accent-foreground',
        'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
        'hover:bg-accent/50 transition-colors'
      )}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/60 dark:bg-gray-800">
        <IconComponent className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">{recent.title}</span>
        <span className="text-xs text-muted-foreground">{recent.module}</span>
      </div>
      {shortcut ? (
        <kbd className="hidden sm:inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground shrink-0 dark:border-gray-600">
          {shortcut}
        </kbd>
      ) : (
        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo}</span>
      )}
    </Command.Item>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTimeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}
