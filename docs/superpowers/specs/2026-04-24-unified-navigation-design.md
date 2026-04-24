# Unified Navigation System — Design Spec

**Date:** 2026-04-24
**Status:** Approved for implementation planning
**Author:** Boobalan (via Claude Code brainstorming session)

---

## 1. Problem Statement

The MyJKKN codebase has 34 modules with **three inconsistent navigation patterns** that evolved independently:

| Pattern | Modules | Problem |
|---|---|---|
| Modern flat sidebar + AutoTabNav (tier 2–4) | 9 modules (Admission, Academic, Campus Living…) | In-page tier 2 duplicates what sidebar could show |
| Legacy sidebar dropdowns | 7 modules (HR, Billing, Learners…) | Sidebar grows unbounded; nested submenus inside submenus |
| Flat sidebar entries, no in-page tabs | 8 modules (Staff, Users, Admin…) | No in-page navigation at all |

Additional problems:
- **No sidebar accordion** — all submenu groups can be open simultaneously; with 34 modules the sidebar becomes an overwhelming wall of links
- **BottomNavbar is a parallel system** — 5 components + 1 Zustand store duplicating sidebar logic on mobile; high maintenance burden
- **AutoTabNav tier 2 is redundant** — for modern modules it shows the same section chips the sidebar already shows

---

## 2. Goals

1. **Unified sidebar accordion** — all modules use the same pattern: group headers collapsed by default, click to expand ONE group at a time (exclusive accordion)
2. **Standardised in-page tabs** — AutoTabNav starts at tier 3 for all modules; sidebar owns tier 2
3. **Global auto-discovery** — in-page tabs derive from route manifest by default; no per-module config required for basic cases
4. **Unified mobile** — replace the separate BottomNavbar system with a Sheet drawer that uses the same sidebar component as desktop
5. **Zero URL changes** — all existing routes remain identical; no bookmarks break

---

## 3. Out of Scope

- Changing any page URL or route structure
- Redesigning the sidebar's collapsed (icon-only) mode visuals
- Adding new pages or modules
- Changing the `AutoBreadcrumbs` system
- Rewriting `FavoritesSidebarSection`
- Changing `MENU_PERMISSIONS` permission keys

---

## 4. Design Decisions

| Question | Decision | Rationale |
|---|---|---|
| What depth shows in sidebar accordion? | Top-level pages only — no nested sub-items | Sidebar was "very large"; sub-navigation belongs in in-page tabs |
| Should tier-2 chips stay in AutoTabNav? | No — AutoTabNav starts at tier 3 | Sidebar now owns tier 2; showing both is redundant duplication |
| Mobile navigation approach? | Replace BottomNavbar with Sheet drawer using the same Menu component | Eliminates dual-system maintenance burden; one codebase for all screen sizes |
| How do in-page tabs get their content? | Hybrid: auto-manifest default + optional nav-config.ts override | Auto-manifest handles 90% of cases; nav-config covers edge cases (multi-root groups, dynamic tabs) |

---

## 5. Architecture Overview

### Desktop (≥ 1024px)

```
AdminPanelLayout
├── Sidebar (w-72 expanded / w-[90px] icon-only)
│     └── Menu
│           ├── Group A header  [collapsed]
│           ├── Group B header  [EXPANDED — active]
│           │     ├── > Section 1   (Link, active = startsWith)
│           │     ├── > Section 2   (Link)
│           │     └── > Section 3   (Link)
│           └── Group C header  [collapsed]
└── main
      ├── AutoBreadcrumbs
      ├── AutoTabNav (tier 3+)          ← starts at depth 3, NOT depth 2
      │     └── TabBar: [Sub-A][Sub-B][Sub-C][Sub-D]
      └── {children}
```

### Mobile (< 1024px)

```
AdminPanelLayout
└── main (full width, no left margin)
      ├── MobileSidebarSheet (lg:hidden)
      │     ├── SheetTrigger: [≡ hamburger button]
      │     └── SheetContent: Menu (same accordion component as desktop)
      ├── AutoTabNav (tier 3+, horizontal scroll strip)
      └── {children}
```

Note: There is no separate `MobileTopBar` component. The hamburger button is a `SheetTrigger` rendered by `MobileSidebarSheet` and positioned at the top-left of the page via absolute/fixed CSS when the sidebar is hidden (`lg:hidden`).

---

## 6. Component Design

### 6.1 New hook — `hooks/use-sidebar-accordion.ts`

```typescript
interface SidebarAccordionStore {
  activeGroupId: string | null;         // value = groupLabel string (e.g. 'Admission CRM')
  setActiveGroup: (id: string | null) => void; // exclusive — closes all others
}
// Persisted: localStorage key 'sidebarAccordionGroup'
// Default: null (all collapsed; auto-expand fires on first render via active flag check)
// Constraint: all groupLabel values in sidebarMenuLink.ts must be unique strings.
//   They currently are (verified in investigation). New groups must not reuse existing labels.
```

**Auto-expand on navigation:** On render, `menu.tsx` finds the first `MenuGroup` where `menus.some(m => m.active)` and calls `setActiveGroup(groupLabel)` if it differs from `activeGroupId`. This ensures direct URL navigation (e.g., from a bookmark to `/hr/leave/apply`) always opens the correct group.

### 6.2 Modified — `components/Navbar/menu.tsx`

**Before:**
```
MenuGroup label (static header)
  MenuItem → CollapseMenuButton (independent open/closed per item)
    Submenu → Submenu (recursive nesting)
```

**After:**
```
MenuGroup label → clickable accordion trigger (calls setActiveGroup)
  [when activeGroupId === this group's label]:
    MenuItem → simple <Link> (no CollapseMenuButton, no nesting)
    MenuItem → simple <Link>
    ...
```

- `CollapseMenuButton.tsx` is retained during Phase 1 but its nested-submenu path is disabled
- Deleted entirely in Phase 6 cleanup if no remaining callers

### 6.3 Modified — `lib/navigation/tier-rendering.ts`

**Removed:** `groupedTier2()` function (24 lines) — no longer emits tier-2 chip arrays.

**Updated:** `resolveTiers(pathname)`:

```
BEFORE:
  Config found → [tier2: groups] + [tier3: children] + [tier4+: manifest]
  No config   → [tier2: flat] + [tier3: flat] + [tier4+: flat]

AFTER:
  Config found → [tier3: activeGroup.children] + [tier4+: manifest]
  No config   → [tier3: flat depth-3 siblings] + [tier4+: flat]
```

**Updated:** `AutoTabNav` default props: `minDepth = 3` (was `2`).

### 6.4 Modified — `components/layout/admin-panel-layout.tsx`

Removals:
- `<BottomNavbar />` render
- `isMobile && 'pb-20'` class
- `useIsMobile()` import (if no other usage remains)

Additions:
- `<MobileSidebarSheet />` component (hamburger trigger + Sheet wrapper)
- `const [mobileOpen, setMobileOpen] = useState(false)`
- `useEffect(() => setMobileOpen(false), [pathname])` — auto-close on navigation

### 6.5 New component — `components/navigation/mobile-sidebar-sheet.tsx`

```typescript
interface MobileSidebarSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
// Renders: Sheet (side="left", w-72) containing <Menu isOpen={true} />
// Trigger: hamburger button (lg:hidden)
// Closes: tap outside OR pathname change (handled by parent)
```

Uses the exact same `<Menu />` component as the desktop sidebar. Same accordion hook. Same `GetPages(pathname)` data. Zero logic duplication.

### 6.6 Modified — `lib/sidebarMenuLink.ts`

Universal new shape — **no `submenus[]` populated anywhere**:

```typescript
{
  groupLabel: 'Module Name',
  menus: [
    {
      href: '/module/section-a',
      label: 'Section A',
      icon: SomeIcon,
      active: pathname === '/module/section-a' || pathname.startsWith('/module/section-a/'),
      submenus: []  // always empty
    },
    // ...
  ]
}
```

**Active flag rule:** All items use `pathname.startsWith(href + '/')` OR `pathname === href`. Never bare `===` alone. This ensures the correct accordion group auto-expands when a user lands on a deep URL.

---

## 7. Module Migration Map

### Category 1 — Modern (single entry → expanded to sections)

Source for new MenuItem list: the module's existing `nav-config.ts` `groups[].href` + `groups[].label` + `groups[].icon`.

| Module | Old sidebar | New sidebar items (flat) |
|---|---|---|
| Admission CRM | 1 entry | Dashboard, Analytics, Leads, GD-PI, Counselors, Marketing, AI Insights, Data Quality, Settings |
| Academic | 1 entry | Years, Regulations, Batches, Timetables, Attendance, Assessment, Leaves, Periods, Staff Planning |
| Campus Living | 1 entry | Dashboard, Residents, Attendance, Services, Facility, Community, Insights, Settings |
| Startup Studio | 1 entry | Portfolio, Cycles, Analytics, Mentors, Resources, Events, Settings |
| OKR | 1 entry | Dashboard, Goals, Reviews, Reports, Settings |
| Accreditation | 1 entry | NAAC, NIRF, NBA, QS, DCI, PCI, INC, NCTE, AICTE, UGC |
| Audit | 1 entry | Dashboard, Schedules, Reports, External Auditors |
| Solutions | 1 entry | Manifest-derived depth-2 sections |
| Learners Council | dropdown | Dashboard, Structure, YUVA Chapters, Activities, Selection, Issues, Settings |

### Category 2 — Legacy dropdowns (flatten submenus → MenuItem)

Sub-items removed from sidebar entirely; they appear as AutoTabNav tier-3 chips.

| Module | Removed from sidebar (→ in-page tabs) | Kept in sidebar (flat) |
|---|---|---|
| HR | Apply, My Applications, Approve, Calendar, Balance, Encashment | Command Center, Employees, Leave, Recruitment, Policies |
| Billing | Sub-pages per section | Categories, Schedule, Receipts, Discounts, Refunds, Invoices |
| Learners | Sub-pages per section | Profiles, Enquiries, Applications, Analytics, Alumni, Privileges, Leave/OnDuty |
| Faculty | Deep sub-pages | Innovation, PDE pages (flat) |
| Organizations | Course Mappings | Institutions, Degrees, Departments, Programs, Courses, Sections, Semesters |
| Resource Mgmt | Sub-pages | All resource pages flat |
| Service Requests | Sub-pages | All service request pages flat |
| Events | Sub-pages | All event pages flat |
| VAC | Sub-pages | All VAC pages flat |

### Category 3 — Already flat (standardise active flags only)

No structural change needed. Only verify `active` flags use `startsWith` pattern.

`admin`, `health`, `learn`, `staff`, `system`, `users`, `work-pulse`, `my-bug-reports`

---

## 8. Nav-Config File Changes

The 9 existing nav-config.ts files are **kept but their role narrows**:

| Old role | New role |
|---|---|
| ~~Drive tier-2 chip rendering~~ | Removed — `groupedTier2()` deleted |
| `matchPaths` → active group detection | **Kept** — still drives sidebar accordion auto-expand + which group owns tier-3 |
| `children[]` → tier-3 custom grouping | **Kept** — still provides tier-3 chips for complex multi-root groups |

**When to add a new nav-config for a migrating module:**
Only if the module has:
1. A group spanning **multiple URL roots** (e.g., Counselors + Consultants under one group)
2. **Custom labels** that differ from folder names
3. **50+ manifest children** at depth 3 that need explicit grouping

HR, Billing, Learners, Organizations, Events, VAC, Resource Management, Service Requests → **no nav-config needed**.

---

## 9. Six-Phase PR Plan

```
PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6
```

Each PR is independently deployable. The codebase is never broken between phases.

### PR 1 — Sidebar Accordion Infrastructure

**Risk:** LOW

| Action | File |
|---|---|
| NEW | `hooks/use-sidebar-accordion.ts` |
| MODIFY | `components/Navbar/menu.tsx` — accordion group triggers |
| MODIFY | `components/Navbar/CollapseMenuButton.tsx` — remove the `SubmenuRow` recursive path; keep the outer `Collapsible` shell (still used briefly by the accordion trigger until Phase 6 replaces it with a plain button) |

*Data unchanged. Accordion wraps existing sidebar data. Only one group opens at a time.*

### PR 2 — AutoTabNav Tier Shift

**Risk:** MEDIUM (global effect across all 34 modules)

| Action | File |
|---|---|
| MODIFY | `lib/navigation/tier-rendering.ts` — remove `groupedTier2()`, update `resolveTiers()` |
| MODIFY | `components/navigation/auto-tab-nav.tsx` — `minDepth = 3` |
| MODIFY | `scripts/check-nav-reachability.ts` — update tier-start assumption |

*After this PR: all modules show tier-3 chips, not tier-2. Needs visual QA across module sections.*

### PR 3 — sidebarMenuLink.ts Data Migration

**Risk:** MEDIUM-HIGH (large data change, ~400 LOC, all 34 modules)

| Action | File |
|---|---|
| MODIFY | `lib/sidebarMenuLink.ts` — Categories 1, 2, 3 migration |
| VERIFY | `lib/sidebarMenuLink.ts` MENU_PERMISSIONS — all new hrefs mapped |

*TypeScript enforces shape. Compiler catches mis-structured entries. After this PR the sidebar shows flat section lists under each expanded group.*

### PR 4 — Mobile Drawer

**Risk:** HIGH on mobile (requires device testing)

| Action | File |
|---|---|
| DELETE | `components/BottomNav/` (5 files) |
| DELETE | `hooks/use-bottom-nav.ts` |
| NEW | `components/navigation/mobile-sidebar-sheet.tsx` |
| MODIFY | `components/layout/admin-panel-layout.tsx` |

*Must test on iOS Safari + Android Chrome. Sheet must close on pathname change.*

### PR 5 — Nav-Config Simplification

**Risk:** LOW

| Action | File |
|---|---|
| MODIFY | All 9 existing `nav-config.ts` files |
| MODIFY | `lib/navigation/nav-config.ts` — update `ModuleNavConfig` type |

*CI reachability checker catches any broken path references immediately.*

### PR 6 — Dead Code Cleanup

**Risk:** VERY LOW (TypeScript catches remaining callers)

| Action | Target |
|---|---|
| DELETE | `groupedTier2()` in `tier-rendering.ts` |
| DELETE | `CollapseMenuButton.tsx` nested submenu logic (or entire file) |
| DELETE | `useIsMobile()` call sites no longer needed |
| DELETE | Old tablet-only SheetMenu hamburger code (`md:flex lg:hidden`) |
| DELETE | Any remaining `pb-20` remnants |

---

## 10. Impact Summary

| Dimension | Before | After |
|---|---|---|
| Sidebar behavior | Mixed patterns; all groups open simultaneously | Accordion; one group at a time; uniform across all 34 modules |
| In-page tabs start | Tier 2 (duplicates sidebar) | Tier 3 (sidebar owns tier 2) |
| Mobile nav | BottomNavbar (5 components + 1 hook, separate system) | Sheet drawer (same Menu component as desktop) |
| Nav-config files | 9 files driving tier-2 + tier-3 | 9 files driving tier-3 only |
| New files | — | `use-sidebar-accordion.ts`, `mobile-sidebar-sheet.tsx` |
| Deleted files | — | `BottomNav/` dir (5 files), `use-bottom-nav.ts`, `groupedTier2()` |
| PRs required | — | 6 focused, each independently deployable |
| URL changes | — | None |

---

## 11. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| PR 2 breaks a module's in-page tabs | Medium | Visual QA checklist: open each of 34 modules, verify tier-3 chips render correctly |
| PR 3 active-flag regression (wrong group auto-expands) | Medium | Write a quick test: for each module's deepest URL, assert `active` fires on at least one MenuItem in the expected group |
| PR 4 Sheet fails to close on navigation | Low | `useEffect(() => setMobileOpen(false), [pathname])` + E2E test on mobile viewport |
| PR 4 safe-area inset (iPhone notch) causes content overlap | Low | Add `env(safe-area-inset-bottom)` global CSS rule; test on iOS Safari |
| CollapseMenuButton deletion breaks a non-obvious caller | Low | TypeScript build will catch; check all import sites before deletion |
| nav-config `matchPaths` drift after migration | Low | CI `check-nav-reachability.ts` catches orphaned paths on every PR |
