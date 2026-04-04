import { LucideIcon } from 'lucide-react';

// ─── Page Registry Types ─────────────────────────────────────────────────────

export interface PageEntry {
  /** Route path e.g. '/billing/invoices' */
  path: string;
  /** Display name e.g. 'Invoices' */
  title: string;
  /** Search keywords e.g. ['bills', 'fees', 'charges'] */
  keywords: string[];
  /** Human-readable description */
  description: string;
  /** Module group e.g. 'billing', 'academic' */
  module: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Icon name as string (for serialization) */
  iconName: string;
  /** Permission key from MENU_PERMISSIONS */
  permission?: string;
  /** Keyboard shortcut e.g. 'Alt+A' */
  shortcut?: string;
  /** Parent menu path for breadcrumbs */
  parentPath?: string;
  /** Show in Quick Actions section of command palette */
  isQuickAction?: boolean;
  /** Label for quick action e.g. 'Mark Attendance' (different from page title) */
  actionLabel?: string;
}

// ─── Search Types ────────────────────────────────────────────────────────────

export interface SearchResult {
  page: PageEntry;
  /** fuse.js score: 0 = perfect match, 1 = worst */
  score: number;
}

// ─── Recent Pages Types ──────────────────────────────────────────────────────

export interface RecentPage {
  path: string;
  title: string;
  module: string;
  iconName: string;
  visitedAt: string;
  visitCount: number;
}

// ─── Favorites Types ─────────────────────────────────────────────────────────

export interface FavoritePage {
  id?: string;
  path: string;
  title: string;
  module: string;
  iconName: string;
  sortOrder: number;
  isPinned: boolean;
}

// ─── Page Metadata (Admin-managed) ───────────────────────────────────────────

export interface PageMetadata {
  id: string;
  pagePath: string;
  customTitle?: string;
  description?: string;
  keywords: string[];
  category?: string;
  isSearchable: boolean;
  /** Keyboard shortcut e.g. 'alt+a'. Null means no shortcut. */
  shortcutKey?: string | null;
  updatedBy?: string;
}
