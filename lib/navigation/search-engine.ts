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
 * @param favorites - Optional set of paths to boost (favorited pages). Each
 *                    match gets its fuse score lowered by 0.15 (capped at 0)
 *                    so it sorts above equivalent non-favorited matches.
 * @returns Sorted SearchResult array
 */
export function searchPages(
  query: string,
  pages: PageEntry[],
  limit: number = 15,
  favorites?: ReadonlySet<string>
): SearchResult[] {
  if (!query.trim()) return [];

  const fuse = getFuseInstance(pages);
  // Fetch a wider window when we're going to re-sort for favorites, so a
  // boosted-but-lower-ranked favorite can climb into the top `limit`.
  const fetchLimit = favorites && favorites.size > 0 ? Math.max(limit * 2, limit + 10) : limit;
  const results = fuse.search(query, { limit: fetchLimit });

  const normalizedQuery = query.trim().toLowerCase();

  const mapped: SearchResult[] = results.map((result) => {
    let score = result.score ?? 1;
    const title = result.item.title.toLowerCase();

    // Label-match boosts layered on top of fuse's fuzzy score so "Leads"
    // typed by a user always ranks exact-title matches above substring-only
    // matches. Each rung is additive toward 0 (best possible score).
    if (title === normalizedQuery) score = Math.max(0, score - 0.35);
    else if (title.startsWith(normalizedQuery)) score = Math.max(0, score - 0.2);
    else if (title.includes(normalizedQuery)) score = Math.max(0, score - 0.1);

    // Favorites nudge — small enough to not override a clearly-better match
    // (a title-exact non-favorite beats a favorite with only a keyword hit).
    if (favorites && favorites.has(result.item.path)) {
      score = Math.max(0, score - 0.15);
    }

    return { page: result.item, score };
  });

  // Re-sort by the adjusted score and trim to the requested limit.
  mapped.sort((a, b) => a.score - b.score);
  return mapped.slice(0, limit);
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
