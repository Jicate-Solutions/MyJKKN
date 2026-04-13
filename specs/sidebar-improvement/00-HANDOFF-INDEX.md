# Sidebar Improvement — Quick Start

## For the Developer

**Read order:**
1. This file (2 min)
2. `../sidebar-improvement-spec.md` — master spec with all 5 tasks (10 min)
3. Start with Task 1 (page registry — 15 min, highest impact)

## TL;DR

MyJKKN has a 2,120-line sidebar monolith that keeps getting overwritten by merge conflicts. 14 Startup Studio sub-module pages exist in the codebase but are invisible to users — not in the command palette, bottom nav, or favorites.

**5 tasks, ordered by priority:**
1. Register 16 SF100 pages in `page-registry.ts` (15 min, unlocks Ctrl+K + bottom nav + favorites)
2. Merge PR #139 to restore sidebar entries (already created)
3. Split the monolith into `lib/sidebar/modules/*.ts` (2-3 hours, prevents future overwrites)
4. Add FAB for SF100 quick actions (1 hour)
5. Add "What's New" badge on new sidebar items (30 min)

## Key Files to Touch

| Task | File(s) | Action |
|---|---|---|
| 1 | `lib/navigation/page-registry.ts` | Add 16 entries |
| 2 | PR #139 (merge only) | No code change needed |
| 3 | `lib/sidebarMenuLink.ts` → split into `lib/sidebar/modules/` | Refactor |
| 4 | `components/FloatingActionButton/fab.tsx` (new) | Create |
| 5 | `lib/navigation/page-registry.ts` + sidebar renderer | Add `newUntil` field |

## Don't Rebuild These (Already Exist)

- Bottom Nav → `components/BottomNav/` (7 files)
- Command Palette → `components/CommandPalette/` (7 files)
- Page Favorites → `hooks/use-page-favorites.ts`
- Role-based filtering → `GetRoleBasedPages()` in sidebar
- Mobile detection → `hooks/use-mobile.tsx`
