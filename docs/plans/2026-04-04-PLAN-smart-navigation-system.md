# Smart Navigation System — Implementation Plan

> **Created**: 2026-04-04
> **Status**: Planning Complete — Awaiting Execution
> **Estimated Phases**: 9
> **Total Tasks**: 58
> **Dependencies**: `cmdk` (installed), `fuse.js` (to install), `@dnd-kit/sortable` (to install), `zustand` (installed), `framer-motion` (installed)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Smart Navigation System                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Page Registry │  │ Search Engine │  │ Permission Filter    │  │
│  │ (Static +     │→ │ (fuse.js     │→ │ (MENU_PERMISSIONS    │  │
│  │  DB metadata) │  │  fuzzy match) │  │  + usePermissions)   │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│         ↓                  ↓                     ↓               │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Command       │  │ Favorites    │  │ Recent Pages         │  │
│  │ Palette UI    │  │ System       │  │ (localStorage +      │  │
│  │ (cmdk +       │  │ (Supabase +  │  │  usage_events)       │  │
│  │  shadcn Dialog)│  │  sidebar)    │  │                      │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│         ↓                  ↓                     ↓               │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Keyboard      │  │ Mobile       │  │ Admin Metadata       │  │
│  │ Shortcuts     │  │ Search Modal │  │ Panel                │  │
│  │ (global +     │  │ (bottom      │  │ (page_metadata       │  │
│  │  sidebar)     │  │  sheet)      │  │  CRUD)               │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/sidebarMenuLink.ts` | Menu definitions + MENU_PERMISSIONS (source of truth) |
| `components/Navbar/menu.tsx` | Sidebar menu renderer |
| `components/Navbar/CollapseMenuButton.tsx` | Expandable menu items |
| `components/BottomNav/bottom-navbar.tsx` | Mobile bottom nav |
| `hooks/use-permissions.ts` | Permission checking + role merging |
| `hooks/use-bottom-nav.ts` | Bottom nav Zustand state |
| `components/layout/admin-panel-layout.tsx` | Main layout wrapper |
| `supabase/setup/01_tables.sql` | Database schema |

## Existing Assets We Leverage

- **`cmdk` v1.0.0** — Already installed in package.json
- **`zustand` v5.0.0** — Already used for bottom nav state
- **`framer-motion` v11** — Already used for bottom nav animations
- **`MENU_PERMISSIONS`** — 450+ path→permission mappings (single source of truth)
- **`usage_events` table** — Already tracks page visits (event_type='page_visit')
- **`user_app_favorites` table** — Existing pattern for user favorites
- **`usePermissions()` hook** — Already returns merged multi-role permissions

---

## Phase 1: Page Registry & Search Engine Foundation

**Goal**: Create the central page registry that powers everything — search, favorites, recents, admin metadata. Build fuzzy search engine.

### Task 1.1: Install fuse.js dependency
**File**: `package.json`
**Action**: Install fuse.js for fuzzy text search
```bash
npm install fuse.js
```

### Task 1.2: Create PageRegistry types
**File**: `lib/navigation/types.ts` (NEW)
```typescript
import { LucideIcon } from 'lucide-react';

export interface PageEntry {
  path: string;           // Route path e.g. '/billing/invoices'
  title: string;          // Display name e.g. 'Invoices'
  keywords: string[];     // Search keywords e.g. ['bills', 'fees', 'charges']
  description: string;    // Human-readable description
  module: string;         // Module group e.g. 'billing'
  icon: LucideIcon;       // Lucide icon component
  permission?: string;    // Permission key from MENU_PERMISSIONS
  shortcut?: string;      // Keyboard shortcut e.g. 'Alt+A'
  parentPath?: string;    // Parent menu path for breadcrumbs
  isQuickAction?: boolean; // Show in Quick Actions section
  actionLabel?: string;   // e.g. 'Mark Attendance' vs page title 'Attendance'
}

export interface SearchResult {
  page: PageEntry;
  score: number;         // 0 = perfect match, 1 = worst
  matchedField: string;  // Which field matched (title, keywords, description)
}

export interface RecentPage {
  path: string;
  title: string;
  module: string;
  icon: string;          // Icon name as string for serialization
  visitedAt: string;     // ISO timestamp
  visitCount: number;    // Frequency tracking
}

export interface FavoritePage {
  id?: string;           // Supabase UUID
  path: string;
  title: string;
  module: string;
  icon: string;
  sortOrder: number;
  isPinned: boolean;     // Pinned = always visible at top of sidebar
}

export interface PageMetadata {
  id: string;
  pagePath: string;
  customTitle?: string;
  description?: string;
  keywords: string[];
  category?: string;
  isSearchable: boolean;
  updatedBy?: string;
}
```

### Task 1.3: Create the Page Registry
**File**: `lib/navigation/page-registry.ts` (NEW)
**Action**: Extract all pages from `GetPages()` in `sidebarMenuLink.ts` into a flat, searchable registry. Each entry includes default keywords and descriptions. The registry auto-imports `MENU_PERMISSIONS` for permission mapping.

Key implementation details:
- Build registry by iterating `GetPages('/')` and flattening all MenuGroups → MenuItems → Submenus
- Map each page's `href` to its permission via `MENU_PERMISSIONS[href]`
- Include default keywords generated from the page title, module name, and path segments
- Export `getPageRegistry()` function that returns the full `PageEntry[]`
- Export `getPageByPath(path: string)` helper for lookups
- Include ~20 hand-curated keyword sets for high-traffic pages (Attendance, Timetable, Invoices, Receipts, etc.)

```typescript
// Example entries (abbreviated):
const PAGE_KEYWORDS: Record<string, { keywords: string[]; description: string }> = {
  '/': { keywords: ['home', 'main', 'overview'], description: 'Main dashboard with analytics overview' },
  '/academic/attendance': { keywords: ['absent', 'present', 'roll call', 'daily attendance', 'period'], description: 'Mark and view student attendance records' },
  '/academic/timetables': { keywords: ['schedule', 'class', 'slots', 'time table', 'periods'], description: 'Create and manage class timetables' },
  '/billing/invoices': { keywords: ['bills', 'fees', 'charges', 'fee status', 'payment due', 'invoice'], description: 'View and manage student fee invoices' },
  '/billing/receipts': { keywords: ['payments', 'paid', 'collection', 'fee receipt', 'transaction'], description: 'Record and view fee payment receipts' },
  '/billing/schedule': { keywords: ['fee structure', 'fee plan', 'billing plan', 'charges'], description: 'Configure fee schedules and billing plans' },
  '/learners/profiles': { keywords: ['students', 'student list', 'enrollment', 'learner data'], description: 'View and manage student profiles' },
  '/staff/list': { keywords: ['faculty', 'teachers', 'facilitators', 'employee'], description: 'View and manage staff/faculty members' },
  '/organizations/departments': { keywords: ['dept', 'division', 'faculty group'], description: 'Manage organizational departments' },
  '/organizations/programs': { keywords: ['course program', 'degree', 'bca', 'mca', 'bsc'], description: 'Manage academic programs and courses' },
  '/admission/leads': { keywords: ['enquiry', 'prospect', 'new student', 'inquiry'], description: 'Manage admission leads and enquiries' },
  '/admission/applications': { keywords: ['apply', 'admission form', 'applicant'], description: 'Process admission applications' },
  '/service-requests': { keywords: ['helpdesk', 'complaint', 'issue', 'support ticket'], description: 'Submit and track service requests' },
  '/resource-management/resources': { keywords: ['rooms', 'labs', 'equipment', 'assets'], description: 'Manage physical resources and assets' },
  '/work-pulse': { keywords: ['daily work', 'task log', 'work report', 'productivity'], description: 'Track daily work activities and submissions' },
  '/vac': { keywords: ['value added', 'extra course', 'additional learning', 'skill'], description: 'Browse value-added courses and enroll' },
  // ... more entries
};
```

### Task 1.4: Create the Search Engine
**File**: `lib/navigation/search-engine.ts` (NEW)
**Action**: Wrap fuse.js with permission-aware filtering, recency boosting, and result grouping.

Key implementation:
- Initialize Fuse instance with PageEntry[] and search keys: `title` (weight 0.4), `keywords` (weight 0.3), `description` (weight 0.2), `module` (weight 0.1)
- `search(query, permissions, userRole)` → returns filtered `SearchResult[]`
- Permission filter: exclude pages where user lacks the required permission
- Recency boost: if page is in recent pages list, boost its score by 1.5x
- Group results by type: `Pages`, `Quick Actions`
- Threshold: 0.4 (fuse.js default is 0.6 — tighter matching)
- Max results: 15

### Task 1.5: Create permission filter utility
**File**: `lib/navigation/permission-filter.ts` (NEW)
**Action**: Utility that filters PageEntry[] based on user's permissions from `usePermissions()`.

```typescript
export function filterByPermissions(
  pages: PageEntry[],
  permissions: Record<string, boolean>,
  isSuperAdmin: boolean,
  userRole: string
): PageEntry[] {
  return pages.filter(page => {
    if (!page.permission) return true;
    if (isSuperAdmin) return true;
    if (permissions[page.permission]) return true;
    // Special: 'view_dashboard' and 'view_profile' are universal
    if (['view_dashboard', 'view_profile'].includes(page.permission)) return true;
    return false;
  });
}
```

### Task 1.6: Create Recent Pages tracker
**File**: `lib/navigation/recent-pages.ts` (NEW)
**Action**: localStorage-based recent page tracker with frequency counting.

Key implementation:
- `trackPageVisit(page: { path, title, module, icon })` — adds/updates entry
- `getRecentPages(limit = 10)` — returns sorted by most recent
- `getFrequentPages(limit = 5)` — returns sorted by visit count
- `clearRecentPages()` — reset
- Store in localStorage key: `myjkkn_recent_pages`
- Max entries: 50 (FIFO eviction)
- Each entry: `{ path, title, module, icon, visitedAt, visitCount }`

### Task 1.7: Create usePageSearch hook
**File**: `hooks/use-page-search.ts` (NEW)
**Action**: React hook that combines registry, search engine, and permissions.

```typescript
export function usePageSearch() {
  const { permissions, isSuperAdmin, userProfile } = usePermissions();
  
  // Memoized filtered registry
  const searchablePages = useMemo(() => 
    filterByPermissions(getPageRegistry(), permissions, isSuperAdmin, userProfile?.role || ''),
    [permissions, isSuperAdmin, userProfile?.role]
  );
  
  // Search function
  const search = useCallback((query: string): SearchResult[] => {
    return searchEngine.search(query, searchablePages);
  }, [searchablePages]);
  
  // Recent pages
  const recentPages = getRecentPages(8);
  const frequentPages = getFrequentPages(5);
  
  return { search, searchablePages, recentPages, frequentPages };
}
```

---

## Phase 2: Command Palette UI (Ctrl+K / Cmd+K)

**Goal**: Build the full command palette modal using `cmdk` + shadcn Dialog. This is the primary navigation improvement.

### Task 2.1: Create CommandPalette component
**File**: `components/CommandPalette/CommandPaletteModal.tsx` (NEW)
**Action**: Full command palette using `cmdk` library inside shadcn Dialog.

Structure:
```
┌─────────────────────────────────────────┐
│ 🔍 Search pages, actions...    Esc ✕   │
├─────────────────────────────────────────┤
│ (Empty state - no query)                │
│                                         │
│ ⏱ Recent                                │
│   📋 Daily Attendance       academic    │
│   💰 Fee Collection         billing     │
│                                         │
│ ⭐ Favorites                             │
│   📋 Timetable              academic    │
│                                         │
│ ⚡ Quick Actions                         │
│   + Mark Attendance                     │
│   + Generate Invoice                    │
│                                         │
│ 🔥 Popular This Week                    │
│   📊 Analytics Dashboard    overview    │
│                                         │
├─────────────────────────────────────────┤
│ (Typing state - with query)             │
│                                         │
│ 📄 Pages                                │
│   💰 Fee Schedule           billing     │
│   💰 Invoices               billing     │
│                                         │
│ ⚡ Actions                               │
│   + Generate Fee Invoice                │
├─────────────────────────────────────────┤
│ Ctrl+K to open · ↑↓ navigate · ↵ open  │
└─────────────────────────────────────────┘
```

Key implementation:
- Use `<Command>` from cmdk as root
- Wrap in shadcn `<Dialog>` for overlay/backdrop
- `<Command.Input>` with placeholder "Search pages, actions, people..."
- `<Command.List>` with groups: Recent, Favorites, Quick Actions, Popular
- `<Command.Item>` for each result — shows icon, title, module badge, shortcut hint
- `<Command.Empty>` for no results state with helpful suggestion
- Navigation: clicking/Enter on item → `router.push(path)` + close palette
- Show keyboard shortcut hints on the right side of each item (e.g., `Alt+A`)
- Footer bar showing keyboard hints: "↑↓ Navigate · ↵ Open · Esc Close"
- Dark mode styling matching the app's existing dark cinema theme

### Task 2.2: Create CommandPaletteProvider
**File**: `components/CommandPalette/CommandPaletteProvider.tsx` (NEW)
**Action**: Global provider that listens for Ctrl+K / Cmd+K keyboard shortcut.

Key implementation:
- Context provider wrapping the app
- `useEffect` with `keydown` listener for `Ctrl+K` / `Cmd+K`
- `e.preventDefault()` to prevent browser default (Chrome address bar)
- State: `isOpen`, `setIsOpen`
- Also expose `openCommandPalette()` function for programmatic opening (mobile button)
- Track page visits: on route change, call `trackPageVisit()` from recent-pages.ts

### Task 2.3: Create search result item component
**File**: `components/CommandPalette/SearchResultItem.tsx` (NEW)
**Action**: Individual search result row with icon, title, module badge, description preview, and shortcut hint.

```
┌──────────────────────────────────────────────┐
│ 📋 Daily Attendance                   Alt+A  │
│    Mark and view student attendance  academic │
└──────────────────────────────────────────────┘
```

### Task 2.4: Create Quick Actions section
**File**: `components/CommandPalette/QuickActions.tsx` (NEW)
**Action**: Context-aware quick actions based on user's role and current page.

Default quick actions (permission-filtered):
- Mark Attendance → `/academic/attendance`
- Generate Invoice → `/billing/invoices/new`
- Add New Student → `/learners/enquiries/new`
- Create Timetable → `/academic/timetables/new`
- New Service Request → `/service-requests/new`
- Add Lead → `/admission/leads/new`

### Task 2.5: Integrate provider into root layout
**File**: `components/layout/admin-panel-layout.tsx`
**Action**: Wrap children with `<CommandPaletteProvider>`.

Add import and wrap:
```typescript
import { CommandPaletteProvider } from '@/components/CommandPalette/CommandPaletteProvider';

// Inside return:
<CommandPaletteProvider>
  {/* existing layout content */}
</CommandPaletteProvider>
```

### Task 2.6: Add search trigger button to sidebar header
**File**: `components/Navbar/menu.tsx`
**Action**: Add a small search icon button at the top of the sidebar that opens the command palette. Shows "Ctrl+K" hint.

```
┌────────────────────────┐
│ 🔍 Search...   Ctrl+K  │  ← New button
├────────────────────────┤
│ ⭐ Favorites            │
│ ...existing menu...     │
```

### Task 2.7: Track page visits on route changes
**File**: `components/CommandPalette/CommandPaletteProvider.tsx`
**Action**: Add `usePathname()` watcher that calls `trackPageVisit()` on every route change, building up the recent pages list automatically.

---

## Phase 3: Favorites & Pinning System

**Goal**: Let users star/favorite pages and pin them to sidebar top. Synced to Supabase for cross-device persistence.

### Task 3.1: Create Supabase table — `user_page_favorites`
**File**: `supabase/setup/01_tables.sql` (UPDATE — append)
```sql
-- User Page Favorites (Navigation)
-- Updated: 2026-04-04 - Smart Navigation System
CREATE TABLE IF NOT EXISTS user_page_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  page_path TEXT NOT NULL,
  display_title TEXT NOT NULL,
  module_name TEXT,
  icon_name TEXT,
  sort_order INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, page_path)
);

CREATE INDEX idx_user_page_favorites_user ON user_page_favorites(user_id);
CREATE INDEX idx_user_page_favorites_pinned ON user_page_favorites(user_id, is_pinned) WHERE is_pinned = true;

-- RLS Policies
ALTER TABLE user_page_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own favorites" ON user_page_favorites
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Task 3.2: Create Supabase migration
**File**: `supabase/migrations/20260404_add_user_page_favorites.sql` (NEW)
**Action**: Same SQL as above, wrapped in migration format for deployment.

### Task 3.3: Create favorites service
**File**: `lib/services/navigation/favorites-service.ts` (NEW)
**Action**: Supabase CRUD for user_page_favorites.

Methods:
- `getUserFavorites(userId)` → `FavoritePage[]` sorted by sort_order
- `addFavorite(userId, page)` → insert
- `removeFavorite(userId, pagePath)` → delete
- `updateFavoriteOrder(userId, favorites[])` → batch update sort_order
- `togglePin(userId, pagePath, isPinned)` → update is_pinned
- `isFavorite(userId, pagePath)` → boolean check

### Task 3.4: Create React Query hooks for favorites
**File**: `hooks/use-page-favorites.ts` (NEW)
**Action**: React Query hooks wrapping the favorites service.

```typescript
export function usePageFavorites() {
  // Query: fetch all favorites
  const { data: favorites } = useQuery({
    queryKey: ['page-favorites', userId],
    queryFn: () => FavoritesService.getUserFavorites(userId)
  });
  
  // Mutations
  const addFavorite = useMutation({ ... });
  const removeFavorite = useMutation({ ... });
  const reorderFavorites = useMutation({ ... });
  const togglePin = useMutation({ ... });
  
  // Helper
  const isFavorite = (path: string) => favorites?.some(f => f.path === path);
  
  return { favorites, addFavorite, removeFavorite, reorderFavorites, togglePin, isFavorite };
}
```

### Task 3.5: Create FavoriteStar toggle component
**File**: `components/Favorites/FavoriteStar.tsx` (NEW)
**Action**: Star icon button that toggles favorite status for any page.

- Filled star = favorited, outline star = not favorited
- Click toggles with optimistic update
- Shows tooltip: "Add to favorites" / "Remove from favorites"
- Can be placed on any page header

### Task 3.6: Create FavoritesSidebarSection component
**File**: `components/Favorites/FavoritesSidebarSection.tsx` (NEW)
**Action**: Collapsible "Favorites" section at the top of the sidebar.

Features:
- Shows favorited pages as clickable links with icons
- Pinned items always visible (even when section collapsed)
- Empty state: "Star pages to add favorites"
- Max display: 10 items (scrollable if more)
- Dark mode styled to match existing sidebar

### Task 3.7: Install @dnd-kit/sortable for drag reorder
**Action**: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

### Task 3.8: Add drag-reorder to favorites section
**File**: `components/Favorites/FavoritesSidebarSection.tsx` (UPDATE)
**Action**: Wrap favorites list with `@dnd-kit/sortable` for drag-and-drop reordering.

- Drag handle icon on the left of each item
- On drop: update sort_order via `reorderFavorites` mutation
- Smooth animation during drag (using framer-motion)

### Task 3.9: Integrate favorites section into sidebar
**File**: `components/Navbar/menu.tsx` (UPDATE)
**Action**: Add `<FavoritesSidebarSection />` between the search button and the first menu group.

### Task 3.10: Add FavoriteStar to page headers
**File**: Create a reusable page header wrapper or add to existing page headers.
**Action**: Add the star toggle to common page header patterns so users can favorite from any page.

---

## Phase 4: Recent Pages & Trending

**Goal**: Show recently visited and popular pages in command palette and optionally in sidebar.

### Task 4.1: Create RecentPagesSidebarSection
**File**: `components/RecentPages/RecentPagesSidebarSection.tsx` (NEW)
**Action**: Collapsible "Recent" section below Favorites in sidebar.

- Shows last 5 visited pages
- Each item: icon + title + time ago ("2m ago", "1h ago")
- Click navigates to page
- "Clear recent" button
- Collapsible (default collapsed to save space)

### Task 4.2: Integrate recent pages into sidebar
**File**: `components/Navbar/menu.tsx` (UPDATE)
**Action**: Add `<RecentPagesSidebarSection />` below favorites section.

```
Sidebar:
├── 🔍 Search...            Ctrl+K
├── ⭐ Favorites
│   ├── ★ Daily Attendance
│   └── ★ Fee Collection
├── ⏱ Recent
│   ├── Timetable - BCA S3    2m ago
│   └── Invoice #1234         1h ago
├── ─────────────────────
├── 🏠 Dashboard
├── ...existing menu groups...
```

### Task 4.3: Create Popular Pages component for command palette
**File**: `components/CommandPalette/PopularPages.tsx` (NEW)
**Action**: Query `usage_events` to find most-visited pages across the institution this week.

- Server action or API route: `SELECT module, COUNT(*) FROM usage_events WHERE institution_id = $1 AND event_type = 'page_visit' AND created_at > NOW() - INTERVAL '7 days' GROUP BY module ORDER BY count DESC LIMIT 5`
- Show in command palette empty state under "Popular This Week" section
- Cached with React Query (staleTime: 1 hour)

### Task 4.4: Create useRecentPages hook
**File**: `hooks/use-recent-pages.ts` (NEW)
**Action**: Hook that provides recent pages from localStorage with auto-refresh on route change.

---

## Phase 5: Keyboard Shortcuts System

**Goal**: Global keyboard shortcuts for common pages + show shortcut hints in sidebar menu items.

### Task 5.1: Define keyboard shortcut registry
**File**: `lib/navigation/keyboard-shortcuts.ts` (NEW)
**Action**: Define global keyboard shortcuts for high-traffic pages.

```typescript
export const KEYBOARD_SHORTCUTS: Record<string, { path: string; label: string }> = {
  'alt+d': { path: '/', label: 'Dashboard' },
  'alt+a': { path: '/academic/attendance', label: 'Attendance' },
  'alt+t': { path: '/academic/timetables', label: 'Timetables' },
  'alt+s': { path: '/learners/profiles', label: 'Students' },
  'alt+b': { path: '/billing/invoices', label: 'Invoices' },
  'alt+r': { path: '/billing/receipts', label: 'Receipts' },
  'alt+n': { path: '/admin/notifications', label: 'Notifications' },
  'alt+l': { path: '/admission/leads', label: 'Leads' },
  'alt+w': { path: '/work-pulse', label: 'Work Pulse' },
  'alt+p': { path: '/profile', label: 'Profile' },
  'alt+h': { path: '/service-requests', label: 'Help Desk' },
};
```

### Task 5.2: Create global keyboard shortcut listener
**File**: `components/CommandPalette/CommandPaletteProvider.tsx` (UPDATE)
**Action**: Add keyboard event listener for all defined shortcuts.

- Listen for `keydown` events
- Match against `KEYBOARD_SHORTCUTS` registry
- Check if user has permission for the target page before navigating
- Ignore when focus is in input/textarea elements
- `router.push(path)` on match

### Task 5.3: Show shortcut hints in sidebar menu items
**File**: `components/Navbar/menu.tsx` (UPDATE)
**Action**: For menu items that have a matching keyboard shortcut, show the shortcut badge on the right side.

```
├── 📋 Attendance            Alt+A
├── 📅 Timetables            Alt+T
├── 👥 Students              Alt+S
```

- Only show when sidebar is expanded (not in collapsed icon-only mode)
- Use a subtle badge style: `text-xs text-muted-foreground bg-muted px-1 rounded`
- Map shortcuts by matching the menu item's `href` against `KEYBOARD_SHORTCUTS`

### Task 5.4: Show shortcut hints in CollapseMenuButton
**File**: `components/Navbar/CollapseMenuButton.tsx` (UPDATE)
**Action**: Same shortcut hints for collapsible menu parent items.

### Task 5.5: Create keyboard shortcuts help dialog
**File**: `components/CommandPalette/KeyboardShortcutsHelp.tsx` (NEW)
**Action**: A dialog showing all available keyboard shortcuts. Triggered by `?` key or from command palette.

```
┌──────────────────────────────────────┐
│ ⌨ Keyboard Shortcuts                │
├──────────────────────────────────────┤
│ Navigation                           │
│   Ctrl+K     Open search             │
│   Alt+D      Dashboard               │
│   Alt+A      Attendance              │
│   Alt+T      Timetables              │
│   Alt+S      Students                │
│   Alt+B      Invoices                │
│   Alt+R      Receipts                │
│   Alt+N      Notifications           │
│   Esc        Close dialog            │
│                                      │
│ Search                               │
│   ↑↓         Navigate results        │
│   Enter      Open selected           │
│   Esc        Close search            │
└──────────────────────────────────────┘
```

---

## Phase 6: Breadcrumbs Navigation

**Goal**: Show hierarchy breadcrumbs on every page for context and lateral navigation.

### Task 6.1: Create breadcrumb data generator
**File**: `lib/navigation/breadcrumbs.ts` (NEW)
**Action**: Generate breadcrumb trail from current pathname using page registry.

```typescript
export function generateBreadcrumbs(pathname: string, registry: PageEntry[]): BreadcrumbItem[] {
  // Split pathname: '/academic/attendance/reports' → ['academic', 'attendance', 'reports']
  // Look up each segment in registry for title/icon
  // Return: [{ title: 'Academic', path: '/academic' }, { title: 'Attendance', path: '/academic/attendance' }, { title: 'Reports', path: '/academic/attendance/reports' }]
}
```

Special handling:
- Dynamic segments like `[id]` → show entity name if available (via page context)
- Root (`/`) → "Dashboard"
- Siblings dropdown: clicking a breadcrumb segment shows other pages at that level

### Task 6.2: Create Breadcrumbs component
**File**: `components/Breadcrumbs/Breadcrumbs.tsx` (NEW)
**Action**: Responsive breadcrumb bar.

Desktop view:
```
Dashboard > Academic > Attendance > Reports
```

Mobile view (truncated):
```
... > Attendance > Reports
```

Features:
- Each segment is a clickable link
- Current page (last segment) is bold/non-clickable
- Separator: `>` or `/` chevron icon
- Optional: clicking a segment shows dropdown of sibling pages at that level
- Styled with `text-sm text-muted-foreground`

### Task 6.3: Integrate breadcrumbs into layout
**File**: `components/layout/admin-panel-layout.tsx` (UPDATE)
**Action**: Add `<Breadcrumbs />` at the top of the main content area, below the push notification banner.

```typescript
<main>
  <PushNotificationBanner />
  <Breadcrumbs />
  <Suspense>{children}</Suspense>
</main>
```

---

## Phase 7: Mobile Search & Navigation Enhancements

**Goal**: Bring the command palette experience to mobile with a full-screen search modal. Add search to bottom nav.

### Task 7.1: Create MobileSearchModal
**File**: `components/CommandPalette/MobileSearchModal.tsx` (NEW)
**Action**: Full-screen bottom sheet version of command palette optimized for touch.

Differences from desktop:
- Full-screen overlay (not centered dialog)
- Larger tap targets (min 48px height per row)
- No keyboard shortcut hints
- Search input auto-focused with mobile keyboard
- Swipe down to close
- Recent pages shown prominently (larger cards)
- Smooth slide-up animation via framer-motion

### Task 7.2: Add search tab to bottom navbar
**File**: `components/BottomNav/bottom-navbar.tsx` (UPDATE)
**Action**: Replace one of the bottom nav tabs with a Search tab, or add a floating search button.

Option A — Replace "More" with dedicated search (preferred):
```
[Home] [Quick] [🔍 Search] [Alerts] [More]
```

Option B — Floating search button above bottom nav:
```
                            🔍 ← floating button
[Home] [Academic] [Billing] [Alerts] [More]
```

The search tab opens `MobileSearchModal` on tap.

### Task 7.3: Add favorite star to mobile page headers
**Action**: Ensure the `FavoriteStar` component works well on mobile with proper touch target size (min 44px).

### Task 7.4: Mobile breadcrumbs
**File**: `components/Breadcrumbs/Breadcrumbs.tsx` (UPDATE)
**Action**: On mobile, truncate breadcrumbs to show only last 2 segments with "..." prefix.

---

## Phase 8: Admin Page Metadata Panel

**Goal**: Let admins manage page descriptions, keywords, and searchability from within the app.

### Task 8.1: Create Supabase table — `page_metadata`
**File**: `supabase/setup/01_tables.sql` (UPDATE — append)
```sql
-- Page Metadata (Admin-managed search metadata)
-- Updated: 2026-04-04 - Smart Navigation System
CREATE TABLE IF NOT EXISTS page_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_path TEXT UNIQUE NOT NULL,
  custom_title TEXT,
  description TEXT,
  keywords TEXT[] DEFAULT '{}',
  category VARCHAR(50),
  is_searchable BOOLEAN DEFAULT true,
  updated_by UUID REFERENCES profiles(id),
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_page_metadata_path ON page_metadata(page_path);
CREATE INDEX idx_page_metadata_institution ON page_metadata(institution_id);

ALTER TABLE page_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage page metadata" ON page_metadata
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.role IN ('super_admin', 'admin') OR p.is_super_admin = true)
    )
  );

CREATE POLICY "All users can read page metadata" ON page_metadata
  FOR SELECT USING (true);
```

### Task 8.2: Create Supabase migration for page_metadata
**File**: `supabase/migrations/20260404_add_page_metadata.sql` (NEW)

### Task 8.3: Create page metadata service
**File**: `lib/services/navigation/page-metadata-service.ts` (NEW)
**Action**: CRUD service for page_metadata table.

### Task 8.4: Create React Query hooks for page metadata
**File**: `hooks/use-page-metadata.ts` (NEW)

### Task 8.5: Create admin page metadata management page
**File**: `app/(routes)/admin/page-metadata/page.tsx` (NEW)
**Action**: Data table showing all pages with editable keywords, descriptions.

Features:
- DataTable listing all registered pages
- Inline editing for keywords (tag input), description (text area)
- Toggle searchability on/off per page
- Filter by module
- Bulk import default keywords from page registry
- Permission: `super_admin` only

### Task 8.6: Create page metadata edit dialog
**File**: `app/(routes)/admin/page-metadata/edit-dialog.tsx` (NEW)
**Action**: Dialog for editing a single page's metadata.

Fields:
- Page Path (read-only)
- Custom Title (optional override)
- Description (textarea)
- Keywords (tag input — add/remove keyword chips)
- Is Searchable (toggle)

### Task 8.7: Merge admin metadata into page registry
**File**: `lib/navigation/page-registry.ts` (UPDATE)
**Action**: When loading the registry, merge any `page_metadata` entries from Supabase to override/enhance default keywords and descriptions.

Priority: Admin metadata > Default registry values

### Task 8.8: Add page metadata link to admin sidebar
**File**: `lib/sidebarMenuLink.ts` (UPDATE)
**Action**: Add "Page Metadata" menu item under Administration group.

### Task 8.9: Add permission for page metadata
**File**: `lib/sidebarMenuLink.ts` (UPDATE — MENU_PERMISSIONS)
**Action**: Add `'/admin/page-metadata': 'super_admin'` to MENU_PERMISSIONS.

---

## Phase 9: Advanced Features — Contextual Suggestions, Role Defaults, Trending

**Goal**: Polish and advanced features that elevate the navigation to enterprise-grade.

### Task 9.1: Contextual page suggestions
**File**: `components/CommandPalette/ContextualSuggestions.tsx` (NEW)
**Action**: Show related pages based on current page.

Logic:
- On student profile page → suggest "View Attendance", "View Bills", "View Grades"
- On section page → suggest "Timetable", "Students", "Attendance"
- On billing page → suggest "Receipts", "Invoices", "Reports"
- Define a `CONTEXTUAL_SUGGESTIONS` map: `Record<string, string[]>` mapping current path patterns to suggested paths

### Task 9.2: Role-based default favorites
**File**: `lib/navigation/role-defaults.ts` (NEW)
**Action**: When a user has zero favorites, auto-populate based on their role.

```typescript
const ROLE_DEFAULT_FAVORITES: Record<string, string[]> = {
  'faculty': ['/academic/attendance', '/academic/timetables', '/learners/profiles', '/work-pulse'],
  'student': ['/learners/my-timetable', '/learners/my-attendance', '/learners/my-profile'],
  'admin': ['/', '/users', '/billing/invoices', '/billing/receipts'],
  'hod': ['/academic/attendance/dashboard', '/staff/list', '/academic/timetables'],
  // ...
};
```

- On first load with empty favorites, prompt: "We've added some suggested favorites based on your role. You can customize these anytime."
- User can dismiss and customize

### Task 9.3: Search analytics tracking
**File**: `lib/navigation/search-analytics.ts` (NEW)
**Action**: Track what users search for to improve keywords over time.

- Log searches to `usage_events` with `event_type = 'search'` and `metadata = { query, results_count, selected_path }`
- Admin dashboard can view: "Top searches with no results" → know what keywords to add
- Zero-result searches highlight gaps in the page registry

### Task 9.4: Popular/Trending pages section
**File**: `components/CommandPalette/TrendingPages.tsx` (NEW)
**Action**: "Popular This Week" section in command palette.

- Query `usage_events` grouped by module for the last 7 days
- Show top 5 most-visited pages across the institution
- Personalized: exclude pages the current user visits daily (they're in "Recent" already)

### Task 9.5: "Request Access" for hidden pages
**File**: `components/CommandPalette/RequestAccess.tsx` (NEW)
**Action**: When a search matches a page the user can't access, show it as a muted result with "Request Access" button.

- Shows: "Billing Reports (requires billing.reports.view permission)"
- Click "Request Access" → creates a service request to admin
- Helps users discover features they don't know exist

### Task 9.6: Search history
**File**: `lib/navigation/search-history.ts` (NEW)
**Action**: Remember last 20 searches in localStorage.

- Show in command palette under "Recent Searches" (before Recent Pages)
- Click to re-run the search
- "Clear search history" option

### Task 9.7: Sidebar keyboard shortcut badges dark mode styling
**File**: `components/Navbar/menu.tsx` (UPDATE)
**Action**: Ensure shortcut badges use proper dark mode styling.

```
dark:bg-gray-800 dark:text-gray-400 bg-gray-100 text-gray-500
```

### Task 9.8: Update SQL_FILE_INDEX.md
**File**: `supabase/SQL_FILE_INDEX.md` (UPDATE)
**Action**: Document the new `user_page_favorites` and `page_metadata` tables.

---

## Verification Checklist

After all phases are complete, verify:

- [ ] Ctrl+K / Cmd+K opens command palette on desktop
- [ ] Search finds pages by title, keywords, and description
- [ ] Search results respect user permissions (no unauthorized pages shown)
- [ ] Recent pages update automatically on navigation
- [ ] Favorites can be added/removed with star toggle
- [ ] Favorites appear in sidebar and persist across sessions
- [ ] Favorites can be drag-reordered
- [ ] Pinned pages always visible at sidebar top
- [ ] Keyboard shortcuts navigate to correct pages
- [ ] Shortcut badges show in sidebar menu items
- [ ] Breadcrumbs show on all pages with correct hierarchy
- [ ] Mobile search modal opens from bottom nav
- [ ] Mobile search has proper touch targets
- [ ] Admin can manage page keywords/descriptions
- [ ] Admin metadata merges with default registry
- [ ] Popular pages show in command palette
- [ ] Contextual suggestions appear based on current page
- [ ] Role-based default favorites work for new users
- [ ] Search analytics logged to usage_events
- [ ] "Request Access" shown for permission-restricted pages
- [ ] All features work in dark mode
- [ ] No performance regression (page registry is memoized)

---

## Dependencies Between Phases

```
Phase 1 (Registry + Search) ─── required by all other phases
    ↓
Phase 2 (Command Palette) ──── depends on Phase 1
    ↓
Phase 3 (Favorites) ─────────── depends on Phase 1
    ↓
Phase 4 (Recent + Trending) ── depends on Phase 1, 2
    ↓
Phase 5 (Keyboard Shortcuts) ─ depends on Phase 1, 2
    ↓
Phase 6 (Breadcrumbs) ────────── depends on Phase 1
    ↓
Phase 7 (Mobile) ──────────────── depends on Phase 1, 2, 3
    ↓
Phase 8 (Admin Metadata) ─────── depends on Phase 1
    ↓
Phase 9 (Advanced) ────────────── depends on ALL previous phases
```

Phase 1 must be completed first. Phases 2, 3, 5, 6, and 8 can be parallelized after Phase 1.
