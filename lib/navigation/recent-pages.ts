import type { RecentPage } from './types';

const STORAGE_KEY = 'myjkkn_recent_pages';
const MAX_ENTRIES = 50;

// ─── Recent Pages Tracker ────────────────────────────────────────────────────
// Stores page visits in localStorage with frequency counting.
// Used to populate "Recent" section in command palette and sidebar.

function getStoredPages(): RecentPage[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function savePages(pages: RecentPage[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch {
    // localStorage might be full — trim and retry
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pages.slice(0, 20)));
    } catch {
      // Give up silently — recent pages is not critical
    }
  }
}

/**
 * Record a page visit. Updates visitedAt and increments visitCount.
 * If the page already exists, it's moved to the top (most recent).
 */
export function trackPageVisit(page: {
  path: string;
  title: string;
  module: string;
  iconName: string;
}): void {
  // Skip dynamic routes with UUIDs — they're not useful for "recent pages"
  if (/[0-9a-f]{8}-[0-9a-f]{4}/.test(page.path)) return;
  // Skip the root dashboard (always accessible, no need to track)
  if (page.path === '/') return;

  const pages = getStoredPages();
  const existingIndex = pages.findIndex(p => p.path === page.path);

  if (existingIndex >= 0) {
    // Update existing entry
    const existing = pages[existingIndex];
    pages.splice(existingIndex, 1);
    pages.unshift({
      ...existing,
      title: page.title, // Update title in case it changed
      visitedAt: new Date().toISOString(),
      visitCount: existing.visitCount + 1,
    });
  } else {
    // Add new entry
    pages.unshift({
      path: page.path,
      title: page.title,
      module: page.module,
      iconName: page.iconName,
      visitedAt: new Date().toISOString(),
      visitCount: 1,
    });
  }

  // Trim to max entries (FIFO eviction of oldest)
  savePages(pages.slice(0, MAX_ENTRIES));
}

/**
 * Get most recently visited pages.
 */
export function getRecentPages(limit: number = 10): RecentPage[] {
  return getStoredPages().slice(0, limit);
}

/**
 * Get most frequently visited pages (sorted by visit count).
 */
export function getFrequentPages(limit: number = 5): RecentPage[] {
  return [...getStoredPages()]
    .sort((a, b) => b.visitCount - a.visitCount)
    .slice(0, limit);
}

/**
 * Clear all recent pages.
 */
export function clearRecentPages(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Remove a specific page from recent history.
 */
export function removeRecentPage(path: string): void {
  const pages = getStoredPages().filter(p => p.path !== path);
  savePages(pages);
}
