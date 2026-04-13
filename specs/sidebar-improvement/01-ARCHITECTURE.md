# Sidebar Improvement — Architecture

## Current Navigation System

```
┌──────────────────────────────────────────────────────────────────┐
│                       Navigation System                          │
│                                                                  │
│  DATA SOURCES:                                                   │
│  ┌─────────────────┐    ┌───────────────────┐                   │
│  │ sidebarMenuLink │    │  page-registry.ts  │                   │
│  │   (2120 lines)  │    │   (753 lines)      │                   │
│  │ 22 groups,      │    │   106 pages        │                   │
│  │ 213 items       │    │   keywords + desc   │                   │
│  │ MENU_PERMISSIONS│    │   ICON_MAP          │                   │
│  │ GetRoleBasedPages│   │                     │                   │
│  └────────┬────────┘    └────────┬───────────┘                   │
│           │                      │                                │
│  RENDERERS:                      │                                │
│  ┌──────────────┐  ┌─────────────┴──────┐  ┌─────────────────┐  │
│  │  Sidebar.tsx  │  │ CommandPalette     │  │ Page Favorites  │  │
│  │  (desktop)    │  │   Modal.tsx        │  │ use-page-       │  │
│  │  reads from   │  │   reads from       │  │ favorites.ts    │  │
│  │  sidebarMenu  │  │   page-registry    │  │ reads from      │  │
│  │  Link.ts      │  │   + trending       │  │ page-registry   │  │
│  └──────┬────────┘  └────────────────────┘  └─────────────────┘  │
│         │                                                         │
│  ┌──────┴──────────┐                                              │
│  │ BottomNavbar.tsx │ ← reads from sidebarMenuLink.ts             │
│  │ (mobile)         │   via GetRoleBasedPages()                   │
│  │ 7 component files│                                             │
│  └──────────────────┘                                             │
│                                                                   │
│  MISSING:                                                         │
│  - FloatingActionButton (context-aware quick actions)             │
│  - "What's New" badge on new sidebar items                        │
│  - Modular sidebar files (merge-conflict prevention)              │
└───────────────────────────────────────────────────────────────────┘
```

## Two Data Sources = Two Registration Points

This is the key insight. MyJKKN has TWO independent navigation data sources:

| Source | What reads it | What it controls |
|---|---|---|
| `sidebarMenuLink.ts` | Sidebar (desktop), BottomNav (mobile) | Which items appear in left sidebar and mobile bottom nav |
| `page-registry.ts` | CommandPalette (Ctrl+K), PageFavorites | Which pages are searchable, pinnable, and show trending |

**A new module must register in BOTH.** The Startup Studio sub-modules were added to the sidebar (PR #120) but NEVER to the page registry — making them invisible to command palette and favorites.

## File Inventory

| File | Lines | Role | Touch Frequency |
|---|---|---|---|
| `lib/sidebarMenuLink.ts` | 2,120 | Menu definitions + permissions + role filter | **Very high** — every module PR |
| `lib/navigation/page-registry.ts` | 753 | Page metadata (keywords, descriptions, icons) | Medium — new pages only |
| `components/BottomNav/bottom-navbar.tsx` | ~200 | Mobile bottom nav renderer | Low |
| `components/BottomNav/bottom-nav-item.tsx` | ~80 | Individual bottom nav button | Low |
| `components/BottomNav/bottom-nav-submenu.tsx` | ~120 | Expandable submenu in bottom nav | Low |
| `components/BottomNav/bottom-nav-more-menu.tsx` | ~150 | "More" overflow menu | Low |
| `components/BottomNav/bottom-nav-minimized.tsx` | ~60 | Minimized bottom nav state | Low |
| `components/BottomNav/types.ts` | ~40 | TypeScript types for bottom nav | Low |
| `components/CommandPalette/CommandPaletteModal.tsx` | ~300 | Ctrl+K search modal | Low |
| `components/CommandPalette/CommandPaletteProvider.tsx` | ~50 | React context for palette state | Low |
| `components/CommandPalette/ContextualSuggestions.tsx` | ~100 | Smart suggestions based on current page | Low |
| `components/CommandPalette/TrendingPages.tsx` | ~80 | Most-visited pages | Low |
| `components/Sidebar/Sidebar.tsx` | ~100 | Desktop sidebar renderer | Low |
| `hooks/use-bottom-nav.ts` | ~100 | Bottom nav state (expand/collapse, active item) | Low |
| `hooks/use-page-favorites.ts` | ~50 | Pin/unpin pages | Low |
| `hooks/use-sidebar-toggle.ts` | ~30 | Sidebar expand/collapse | Low |
| `hooks/use-mobile.tsx` | ~20 | `useIsMobile()` hook | Low |

## Current Startup Studio Navigation Gaps

| Page | In Sidebar? | In Page Registry? | In Ctrl+K? | In Bottom Nav? | Pinnable? |
|---|---|---|---|---|---|
| `/startup-studio/events` | Yes | Yes | Yes | Yes | Yes |
| `/startup-studio/solve-for-100` | **No** (PR #139 pending) | **No** | **No** | **No** | **No** |
| `/startup-studio/solve-for-100/dashboard` | No | No | No | No | No |
| `/startup-studio/solve-for-100/admin` | No | No | No | No | No |
| `/startup-studio/solve-for-100/leaderboard` | No | No | No | No | No |
| `/startup-studio/portfolio` | No | No | No | No | No |
| `/startup-studio/nif` | No | No | No | No | No |
| `/startup-studio/mentors` | No | No | No | No | No |
| `/startup-studio/kpi` | No | No | No | No | No |
| `/startup-studio/finance` | No | No | No | No | No |
| `/startup-studio/governance` | No | No | No | No | No |
| `/startup-studio/cycles` | No | No | No | No | No |
| `/startup-studio/problem-bank` | No | No | No | No | No |

**14 pages completely invisible to navigation.** Task 1 (page registry) + Task 2 (sidebar) fixes all of them.
