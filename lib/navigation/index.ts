// Smart Navigation System — Public API
export type { PageEntry, SearchResult, RecentPage, FavoritePage, PageMetadata } from './types';
export { getPageRegistry, getPageByPath, getPagesByModule, invalidateRegistry, ICON_MAP } from './page-registry';
export { searchPages, groupSearchResults, invalidateSearchIndex } from './search-engine';
export { filterByPermissions, isPageAccessible } from './permission-filter';
export { trackPageVisit, getRecentPages, getFrequentPages, clearRecentPages, removeRecentPage } from './recent-pages';
export { KEYBOARD_SHORTCUTS, getShortcutForPath, formatShortcutKey, parseKeyboardEvent } from './keyboard-shortcuts';
export { generateBreadcrumbs, getSiblingPages } from './breadcrumbs';
export { getDefaultFavoritesForRole, ROLE_DEFAULT_FAVORITES } from './role-defaults';
export { trackSearch, getSearchHistory, clearSearchHistory } from './search-history';
export { trackSearchAnalytics } from './search-analytics';
