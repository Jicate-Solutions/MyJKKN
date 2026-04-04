import Fuse from 'fuse.js';
import type { PageEntry, SearchResult } from './types';

// ─── Search Engine ───────────────────────────────────────────────────────────
// Wraps fuse.js with permission-aware filtering and result grouping.

const FUSE_OPTIONS: Fuse.IFuseOptions<PageEntry> = {
  keys: [
    { name: 'title', weight: 0.4 },
    { name: 'keywords', weight: 0.3 },
    { name: 'description', weight: 0.2 },
    { name: 'module', weight: 0.1 },
  ],
  threshold: 0.4,
  includeScore: true,
  minMatchCharLength: 2,
  // Use extended search for better matching
  useExtendedSearch: false,
  // Return all matches up to limit
  shouldSort: true,
};

let fuseInstance: Fuse<PageEntry> | null = null;
let lastPages: PageEntry[] | null = null;

function getFuseInstance(pages: PageEntry[]): Fuse<PageEntry> {
  // Rebuild only if pages array reference changed
  if (fuseInstance && lastPages === pages) {
    return fuseInstance;
  }
  fuseInstance = new Fuse(pages, FUSE_OPTIONS);
  lastPages = pages;
  return fuseInstance;
}

/**
 * Search pages using fuzzy matching.
 * Pages should already be permission-filtered before passing here.
 *
 * @param query - User's search input
 * @param pages - Permission-filtered page entries
 * @param limit - Max results to return (default 15)
 * @returns Sorted SearchResult array
 */
export function searchPages(
  query: string,
  pages: PageEntry[],
  limit: number = 15
): SearchResult[] {
  if (!query.trim()) return [];

  const fuse = getFuseInstance(pages);
  const results = fuse.search(query, { limit });

  return results.map(result => ({
    page: result.item,
    score: result.score ?? 1,
  }));
}

/**
 * Group search results into Pages and Quick Actions.
 */
export function groupSearchResults(results: SearchResult[]): {
  pages: SearchResult[];
  actions: SearchResult[];
} {
  const pages: SearchResult[] = [];
  const actions: SearchResult[] = [];

  for (const result of results) {
    if (result.page.isQuickAction) {
      actions.push(result);
    } else {
      pages.push(result);
    }
  }

  return { pages, actions };
}

/** Invalidate the cached Fuse instance (e.g., when admin metadata changes) */
export function invalidateSearchIndex(): void {
  fuseInstance = null;
  lastPages = null;
}
