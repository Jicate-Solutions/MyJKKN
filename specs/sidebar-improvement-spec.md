---
title: MyJKKN Sidebar Improvement — Developer Handoff
version: 1.0
created: 2026-04-13
session_date: 2026-04-13
status: ready-for-developer
module: navigation/sidebar
---

# MyJKKN Sidebar Improvement — Master Spec

## Problem Statement

MyJKKN's navigation has a **2,120-line monolith sidebar file** (`lib/sidebarMenuLink.ts`) containing 22 groups and 213 menu items. This causes:

1. **Merge conflict disaster** — 5 PRs overwrote Startup Studio sidebar entries within 24 hours of shipping (PR #120). Every module PR touches this file.
2. **213 items are unnavigable** — users scroll endlessly. No search, no smart surfacing.
3. **New modules are invisible** — Solve for 100, NIF Pipeline, Portfolio Intelligence exist as pages but have ZERO entries in the page registry (command palette, bottom nav, favorites all ignore them).
4. **No FAB for quick actions** — team leaders need fast "Log Paid User" and "Submit Check-in" but must navigate 4 levels deep.

## What Already Exists (Don't Rebuild)

| Component | Location | Status |
|---|---|---|
| Bottom Nav (mobile) | `components/BottomNav/` (7 files) | Built, working, renders from `sidebarMenuLink.ts` |
| Command Palette (Ctrl+K) | `components/CommandPalette/` (7 files) | Built, working, reads from `page-registry.ts` |
| Page Favorites | `hooks/use-page-favorites.ts` | Built, working |
| Page Registry | `lib/navigation/page-registry.ts` (753 lines, 106 pages) | Built, but only has `/startup-studio/events` for Startup Studio |
| Sidebar Toggle | `hooks/use-sidebar-toggle.ts`, `components/Sidebar/` | Built |
| Mobile Detection | `hooks/use-mobile.tsx` | Built |
| Role-Based Filtering | `GetRoleBasedPages()` in `sidebarMenuLink.ts` | Built |

## What to Build (5 Tasks)

### Task 1: Register SF100 + Startup Studio Pages in Page Registry (HIGHEST PRIORITY)

**File:** `lib/navigation/page-registry.ts`

Add these entries (format matches existing entries — see line 1 for pattern):

```typescript
// Startup Studio — Solve for 100
'/startup-studio/solve-for-100': {
  keywords: ['solve', '100', 'startup', 'incubation', 'paid users', 'teams'],
  description: 'Solve for 100 — 6-month startup program'
},
'/startup-studio/solve-for-100/dashboard': {
  keywords: ['my team', 'dashboard', 'check-in', 'solve 100'],
  description: 'Your team dashboard — check-ins, paid users, progress'
},
'/startup-studio/solve-for-100/admin': {
  keywords: ['admin', 'program', 'enrollments', 'verification', 'funnel'],
  description: 'Program admin — enrollments, verification queue, phase funnel'
},
'/startup-studio/solve-for-100/leaderboard': {
  keywords: ['leaderboard', 'ranking', 'teams', 'paid users'],
  description: 'Live leaderboard grouped by phase'
},
'/startup-studio/solve-for-100/mentor': {
  keywords: ['mentor', 'mentees', 'assigned teams', 'coaching'],
  description: 'Mentor dashboard — assigned teams and check-in reviews'
},
'/startup-studio/solve-for-100/exercises': {
  keywords: ['exercise', 'ICP', 'customer profile', 'homework'],
  description: 'Team exercises — Ideal Customer Profile builder and more'
},
'/startup-studio/solve-for-100/programs': {
  keywords: ['programs', 'cohort', 'batch', 'program admin'],
  description: 'Program management — create and manage cohorts'
},

// Startup Studio — Sub-modules
'/startup-studio/portfolio': {
  keywords: ['portfolio', 'intelligence', 'TRL', 'risk', 'startups'],
  description: 'Portfolio Intelligence — TRL distribution, risk heatmap'
},
'/startup-studio/nif': {
  keywords: ['NIF', 'incubation', 'pipeline', 'candidates', 'nattraja'],
  description: 'NIF Pipeline — incubation stage tracking'
},
'/startup-studio/mentors': {
  keywords: ['mentor', 'network', 'directory', 'matching'],
  description: 'Mentor Network — profiles, matching, sessions'
},
'/startup-studio/alumni': {
  keywords: ['alumni', 'graduates', 'tracking', 'outcomes'],
  description: 'Alumni Network — post-graduation outcomes'
},
'/startup-studio/kpi': {
  keywords: ['KPI', 'metrics', 'dashboard', 'compliance', 'DST', 'NIRF'],
  description: 'KPI Dashboard — compliance and impact metrics'
},
'/startup-studio/marketing': {
  keywords: ['marketing', 'campaigns', 'outreach', 'ROI'],
  description: 'Marketing Activities — campaigns and ROI tracking'
},
'/startup-studio/finance': {
  keywords: ['finance', 'grants', 'budgets', 'revenue', 'audit'],
  description: 'Finance — grants, budgets, revenue, audit'
},
'/startup-studio/governance': {
  keywords: ['governance', 'board', 'compliance', 'members'],
  description: 'Governance — board members and compliance'
},
'/startup-studio/cycles': {
  keywords: ['cycles', 'innovation', '7-step', 'AI cycle'],
  description: 'Innovation Cycles — 7-step AI-assisted model'
},
'/startup-studio/problem-bank': {
  keywords: ['problems', 'bank', 'catalog', 'tags'],
  description: 'Problem Bank — curated problem catalog'
},
```

**Impact:** After this change, typing "solve" in Command Palette (Ctrl+K) will show all SF100 pages. Bottom nav will surface Startup Studio sub-modules. Favorites will allow pinning.

**Estimated effort:** 15 minutes.

---

### Task 2: Restore Sidebar Entries (PR #139 — Already Created)

**PR:** https://github.com/Jicate-Solutions/MyJKKN/pull/139
**Status:** Ready to merge

Adds 8 sub-module entries + Solve for 100 with submenus to the Startup Studio sidebar group. Also adds `PieChart`, `Wallet`, `Scale` icon imports and MENU_PERMISSIONS entries.

**Merge and deploy.**

---

### Task 3: Split Sidebar Monolith into Modular Registry (MEDIUM PRIORITY)

**Current:** `lib/sidebarMenuLink.ts` (2,120 lines, 1 file)
**Target:**

```
lib/sidebar/
├── registry.ts                    ← Collects all module registrations (50 lines)
├── permissions.ts                 ← MENU_PERMISSIONS map (extracted, ~100 lines)
├── role-filter.ts                 ← GetRoleBasedPages() (extracted)
├── modules/
│   ├── overview.ts                ← Dashboard, AI Assistant
│   ├── user-management.ts         ← Users, Roles, Audit
│   ├── academic.ts                ← Academic Years, Courses, etc.
│   ├── admission.ts               ← Admission CRM
│   ├── startup-studio.ts          ← Events + SF100 + NIF + Portfolio + all sub-modules
│   ├── health.ts                  ← Health & Wellness
│   ├── pde.ts                     ← Learning (PDE)
│   ├── vac.ts                     ← Value Added Courses
│   ├── work-pulse.ts              ← Work Pulse
│   ├── system.ts                  ← System settings
│   └── ... (one per group)
└── utils.ts                       ← Shared helpers (pathname matching, etc.)
```

**Each module file exports:**
```typescript
// lib/sidebar/modules/startup-studio.ts
import { Rocket, Gauge, Target, Users, Award, PieChart, Megaphone, Wallet, Scale } from 'lucide-react';
import type { MenuGroup } from '../types';

export function startupStudioMenus(pathname: string): MenuGroup {
  const eventMatch = pathname.match(/\/startup-studio\/events\/([^/]+)/);
  const activeId = eventMatch?.[1] && eventMatch[1] !== 'events' ? eventMatch[1] : null;

  return {
    groupLabel: 'Startup Studio',
    menus: [
      { href: '/startup-studio/portfolio', label: 'Portfolio Intelligence', icon: Gauge, ... },
      { href: '/startup-studio/solve-for-100', label: 'Solve for 100', icon: Target, ... },
      { href: '/startup-studio/events', label: 'Events', icon: Rocket, ... },
    ]
  };
}
```

**Registry collects them:**
```typescript
// lib/sidebar/registry.ts
import { overviewMenus } from './modules/overview';
import { startupStudioMenus } from './modules/startup-studio';
// ... other imports

export function getAllMenuGroups(pathname: string): MenuGroup[] {
  return [
    overviewMenus(pathname),
    userManagementMenus(pathname),
    // ...
    startupStudioMenus(pathname),
    // ...
  ];
}
```

**Why this matters:** When a new module PR adds sidebar entries, it creates/modifies ONLY its own file (e.g., `modules/startup-studio.ts`). No merge conflicts with other modules.

**Backward compat:** `sidebarMenuLink.ts` stays as a thin wrapper that calls `getAllMenuGroups()` — existing imports don't break.

**Estimated effort:** 2-3 hours (mostly splitting existing code into separate files, no logic changes).

---

### Task 4: Add FAB (Floating Action Button) for SF100 Team Leaders (LOW PRIORITY)

**What:** A floating "+" button on the bottom-right of the screen (above bottom nav on mobile) that shows context-aware quick actions:

| Context | Actions |
|---|---|
| SF100 team member | "+ Check-in", "+ Log Paid User", "+ Customer Interview" |
| SF100 admin | "+ Create Program", "+ Run Stall Check" |
| Mentor | "+ Log Session", "+ Review Check-in" |
| Other pages | Hidden (no FAB) |

**File:** `components/FloatingActionButton/fab.tsx` (new)

Show only when `pathname.startsWith('/startup-studio/solve-for-100')` AND user has an active enrollment or admin role.

**Estimated effort:** 1 hour.

---

### Task 5: "What's New" Badge on Sidebar Items (LOW PRIORITY)

**What:** A small dot/badge on sidebar items that were added in the last 7 days. Helps users discover new modules.

**Implementation:** Store a `newUntil` date in the page registry. Sidebar component checks `new Date(newUntil) > new Date()` and renders a blue dot.

**Estimated effort:** 30 minutes.

---

## Execution Order

| # | Task | Priority | Dependencies | Ship as |
|---|---|---|---|---|
| 1 | Register SF100 pages in page-registry | **HIGHEST** | None | PR (1 file) |
| 2 | Restore sidebar entries | **HIGH** | None | PR #139 (merge) |
| 3 | Split sidebar monolith | **MEDIUM** | After #2 (needs current sidebar) | PR (refactor) |
| 4 | FAB for SF100 | **LOW** | After #1 (page registry) | PR (new component) |
| 5 | "What's New" badge | **LOW** | After #3 (modular sidebar) | PR (small feature) |

## Architecture Context

```
┌──────────────────────────────────────────────────────────────────┐
│                       Navigation System                          │
│                                                                  │
│  ┌─────────────────┐    ┌───────────────────┐                   │
│  │ sidebarMenuLink │    │  page-registry.ts  │                   │
│  │   (2120 lines)  │    │   (753 lines)      │                   │
│  │ 22 groups,      │    │   106 pages        │                   │
│  │ 213 items       │    │   keywords + desc   │                   │
│  └────────┬────────┘    └────────┬───────────┘                   │
│           │                      │                                │
│    ┌──────┴──────┐        ┌──────┴──────────┐                    │
│    │  Sidebar    │        │ Command Palette  │                    │
│    │  (desktop)  │        │   (Ctrl+K)       │                    │
│    └──────┬──────┘        └──────────────────┘                   │
│           │                                                       │
│    ┌──────┴──────┐        ┌──────────────────┐                    │
│    │ Bottom Nav  │        │  Page Favorites   │                    │
│    │  (mobile)   │        │   (pinning)       │                    │
│    └─────────────┘        └──────────────────┘                   │
│                                                                  │
│  MISSING: FAB, "What's New" badge, modular file split            │
└──────────────────────────────────────────────────────────────────┘
```

## Key Files

| File | Lines | Role |
|---|---|---|
| `lib/sidebarMenuLink.ts` | 2,120 | Monolith sidebar definition + permissions + role filter |
| `lib/navigation/page-registry.ts` | 753 | Page metadata for command palette + bottom nav |
| `components/BottomNav/bottom-navbar.tsx` | ~200 | Mobile bottom navigation (reads from sidebar) |
| `components/CommandPalette/CommandPaletteModal.tsx` | ~300 | Ctrl+K search (reads from page registry) |
| `components/Sidebar/Sidebar.tsx` | ~100 | Desktop sidebar renderer |
| `components/layout/admin-panel-layout.tsx` | ~60 | Layout that includes sidebar + bottom nav |
| `hooks/use-page-favorites.ts` | ~50 | Favorites/pinning system |
| `hooks/use-bottom-nav.ts` | ~100 | Bottom nav state management |

## Lessons Learned (from this session)

| Date | What Happened | Lesson |
|---|---|---|
| 2026-04-12 | PR #120 added 79 lines to sidebar. 5 PRs overwrote within 24 hours. | `sidebarMenuLink.ts` is a merge-conflict hotspot. Task 3 (modular split) prevents this permanently. |
| 2026-04-13 | User reported "Startup Studio not in sidebar." Verified via `git show jicate/main:` — entries gone. | Always verify with `git show jicate/main:file` before claiming production state. |
| 2026-04-13 | SF100 pages not findable via Ctrl+K or bottom nav. | Page registry is separate from sidebar. New modules must be registered in BOTH places. |

## Verification Commands

After each task, verify from production:

```bash
# Task 1: Page registry
git show jicate/main:lib/navigation/page-registry.ts | grep "solve-for-100" | wc -l
# Expected: 7+ entries

# Task 2: Sidebar entries
git show jicate/main:lib/sidebarMenuLink.ts | grep "Portfolio Intelligence\|Solve for 100\|Mentor Network" | wc -l
# Expected: 3+

# Task 3: Modular split
ls lib/sidebar/modules/ | wc -l
# Expected: 10+ module files

# Production verification
curl -s -o /dev/null -w '%{http_code}' https://www.jkkn.ai/startup-studio/solve-for-100
# Expected: 307 (auth redirect, page exists)
```
