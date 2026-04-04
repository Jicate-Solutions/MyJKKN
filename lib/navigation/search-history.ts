const STORAGE_KEY = 'myjkkn_search_history';
const MAX_ENTRIES = 20;

export interface SearchHistoryEntry {
  query: string;
  timestamp: string;
  selectedPath?: string;
}

function getStoredHistory(): SearchHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: SearchHistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Silently fail
  }
}

/**
 * Record a search query.
 */
export function trackSearch(query: string, selectedPath?: string): void {
  if (!query.trim() || query.trim().length < 2) return;

  const history = getStoredHistory();
  // Remove duplicate queries
  const filtered = history.filter(h => h.query.toLowerCase() !== query.toLowerCase());
  filtered.unshift({
    query: query.trim(),
    timestamp: new Date().toISOString(),
    selectedPath,
  });

  saveHistory(filtered.slice(0, MAX_ENTRIES));
}

/**
 * Get recent search queries.
 */
export function getSearchHistory(limit: number = 10): SearchHistoryEntry[] {
  return getStoredHistory().slice(0, limit);
}

/**
 * Clear all search history.
 */
export function clearSearchHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
