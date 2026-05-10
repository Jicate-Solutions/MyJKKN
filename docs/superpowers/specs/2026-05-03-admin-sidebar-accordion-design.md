# Admin Sidebar Accordion + Route-Driven Sub-Pages — Design Spec

**Date:** 2026-05-03
**Owner:** Boobalan (aicse@jkkn.ac.in)
**Status:** Draft v2 — revised after discovering existing nav infrastructure
**Approach:** Reuse existing route manifest + page registry + permission filter; add accordion state + render only

> **Revision note (v2):** v1 of this spec proposed building a parallel codegen pipeline with `nav.config.ts` overrides. Investigation revealed that `scripts/generate-route-manifest.ts`, `lib/navigation/route-manifest.generated.ts`, `getPagesByModule()`, `filterByPermissions()`, and the `navMeta` override convention all already exist (built for the AutoTabNav system). v2 reuses them. The visible footprint of this work shrinks from ~6 new files to **2 new files + 1 modified file**.

---

## 1. Problem

The desktop admin sidebar at `components/Sidebar/Sidebar.tsx` only renders top-level module entries (Dashboard, Admission, Meetings, Billing, etc.). Sub-pages under each module — e.g. `admission/leads`, `admission/counselors`, `admission/analytics` — are reachable only by first navigating to the module landing page and then drilling in.

This creates two problems:

1. **Discoverability** — users don't see what's available inside a module without entering it.
2. **Navigation cost** — getting to a known sub-page takes 2 clicks + a page load instead of 1 click.

The data model in `lib/sidebarMenuLink.ts:113-119` already supports recursive submenus, but the desktop renderer at `components/Navbar/menu.tsx:256-322` was deliberately set to flat-render-only as part of Wave 2b PR-S2 (per the inline comment) with the intent of moving submenus to a flyout panel. We're choosing accordion-in-sidebar instead.

## 2. Goal

Convert the desktop admin sidebar into a **single-expand accordion**: clicking a module reveals its sub-pages inline; clicking a different module collapses the previous one. Sub-page data is sourced from the existing `ROUTE_MANIFEST` (auto-generated from `app/(routes)/` folder structure).

### Success criteria

1. From any page in the app, every navigable sub-page is reachable in **at most 2 clicks** (open module + click sub-page).
2. Adding a new `app/(routes)/<module>/<sub>/page.tsx` makes it appear in the sidebar after the next `npm run gen:routes` cycle (already part of `npm run build`).
3. At most **one module's submenu** is expanded at a time across the entire sidebar.
4. The currently-expanded module **persists across page navigations** (localStorage), so navigating from `/admission/leads` to `/admission/counselors` keeps `admission` expanded.
5. **Permission filtering** continues to work via the existing `filterByPermissions()` pipeline. If all sub-pages of a module are filtered out, the module renders as a plain link to its root page.
6. **Mobile bottom nav** behavior is unchanged.
7. **In-page tab navigation** (`/admin/navigation/page-tabs` + `AutoTabNav`) is unchanged.

## 3. Out of Scope

- Mobile bottom navbar redesign — already implements the desired pattern.
- In-page tab navigation system at `/admin/navigation/page-tabs`.
- Section group headers (Academic, Admission CRM, etc. from `lib/navigation/modules.ts`) — preserved as-is.
- Favorites and Recent Pages sidebar sections — unchanged.
- Sidebar collapsed/expanded width toggle — unchanged.
- Permission system changes — we use the existing `usePermissions()` hook and existing `filterByPermissions()` without modification.
- The route manifest generator (`scripts/generate-route-manifest.ts`) — unchanged. We just become a second consumer of its output.
- `components/admin/AdminCategoryNav.tsx` and `components/admin/AdminModuleNav.tsx` — left in place. (Their relationship to the sidebar is separate from this work; if they become redundant later, that's a follow-up cleanup.)

## 4. Architecture Overview

The system has two layers — one entirely existing, one mostly new.

```
┌─────────────────────────────────────────────────────────────────────┐
│  EXISTING — no changes needed                                       │
│                                                                     │
│  scripts/generate-route-manifest.ts                                 │
│    walks app/(routes)/, reads inline `export const navMeta`         │
│    overrides, emits typed RouteNode[] tree.                         │
│    Run via `npm run gen:routes` (called from `npm run build`).      │
│                          │                                          │
│                          ▼                                          │
│  lib/navigation/route-manifest.generated.ts                         │
│    Full tree of all 540+ pages, each with { path, label, iconName, │
│    children }.                                                      │
│                          │                                          │
│                          ▼                                          │
│  lib/navigation/page-registry.ts                                    │
│    getPagesByModule(moduleSlug: string): PageEntry[]                │
│                          │                                          │
│                          ▼                                          │
│  lib/navigation/permission-filter.ts                                │
│    filterByPermissions(pages, permissions, isSuperAdmin, userRole)  │
│                          │                                          │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  NEW                                                                │
│                                                                     │
│  hooks/use-expanded-sidebar-module.ts                               │
│    Zustand store mirroring the use-bottom-nav pattern:              │
│      { expandedModule: string | null,                               │
│        toggleModule(slug),                                          │
│        setExpandedModule(slug) }                                    │
│    Persisted to localStorage under                                  │
│    `myjkkn.sidebar.expanded-module`.                                │
│                          │                                          │
│                          ▼                                          │
│  components/Navbar/menu.tsx (modified, lines 256-322)               │
│    For each module row in the flat menus loop:                      │
│      1. const subPages = getPagesByModule(moduleSlug)               │
│      2. const visible = filterByPermissions(subPages, ...)          │
│      3. const directChildren = visible.filter(p =>                  │
│           p.path.split('/').length === 3 && p.path !== moduleHref)  │
│      4. if (directChildren.length === 0) → render plain <Link>      │
│      5. else → render accordion trigger + animated <ul> when        │
│         expandedModule === moduleSlug                               │
│    On mount and on pathname change, auto-expand the module          │
│    matching the URL (only if no module currently expanded).         │
└─────────────────────────────────────────────────────────────────────┘
```

## 5. Reused Existing Infrastructure (was: §5 Codegen)

We do not build any new codegen, manifest, or override file format. Here's exactly what we reuse and where it lives:

| Concern | Existing artefact | Location |
|---|---|---|
| Walk `app/(routes)/`, emit typed tree | `generate-route-manifest.ts` (Node script) | `scripts/generate-route-manifest.ts` |
| Generated manifest output | `ROUTE_MANIFEST: RouteNode[]` | `lib/navigation/route-manifest.generated.ts` |
| Per-page label/icon override | `export const navMeta = { label, icon }` inline in `page.tsx` | Convention; reader at `scripts/generate-route-manifest.ts:103-121` |
| Module → pages lookup | `getPagesByModule(module)` | `lib/navigation/page-registry.ts:772` |
| Permission filtering | `filterByPermissions(pages, perms, isSuperAdmin, role)` | `lib/navigation/permission-filter.ts:11` |
| Page entry shape | `PageEntry { path, title, module, icon, iconName, permission?, ... }` | `lib/navigation/types.ts:5` |
| Build-time regeneration | `gen:routes` runs as first step of `build` | `package.json:7,11` |
| CI drift guard | Existing `check:reachability` + `check:menu-coverage` | `package.json:22,24` |

If we need an icon or label override for a sub-page, we add `export const navMeta = { label: 'GD/PI Rounds', icon: 'Users' }` inline in that page's `page.tsx`. We do not invent any new override file format.

## 6. Data Merge (was: §6, simplified)

Inside `components/Navbar/menu.tsx`, for each top-level module the existing renderer already iterates over:

```typescript
const moduleSlug = href.replace(/^\//, '').split('/')[0]; // '/admission' → 'admission'

import { getPagesByModule } from '@/lib/navigation/page-registry';
import { filterByPermissions } from '@/lib/navigation/permission-filter';

const subPages = getPagesByModule(moduleSlug);
const accessible = filterByPermissions(
  subPages,
  permissions,         // from usePermissions()
  isSuperAdmin,        // from usePermissions()
  userRole,            // from usePermissions()
);

// Direct children only (depth = 1 below module root):
//   '/admission' → 2 segments → SKIP (it's the parent itself)
//   '/admission/leads' → 3 segments → KEEP
//   '/admission/leads/walk-in' → 4 segments → SKIP for v1 (deep nest)
const directChildren = accessible.filter(p => {
  const segs = p.path.split('/').filter(Boolean);
  return segs.length === 2 && segs[0] === moduleSlug;
});
```

Caching: `getPageRegistry()` already memoizes the registry on first call (per the registry file's pattern). Calling `getPagesByModule()` per module per render is cheap.

If `directChildren.length === 0`, the module renders exactly as today — a plain `<Link>` to its root page. No regression for modules without sub-pages (`profile`, `ai-query`, etc.).

## 7. Render Layer (was: §7, minor edits)

### 7.1 Files modified / created

- **NEW** `hooks/use-expanded-sidebar-module.ts` — Zustand store.
- **MODIFIED** `components/Navbar/menu.tsx` — replace lines 256-322 (the `menus.map(...)` flat render) with accordion-aware rendering.

### 7.2 Zustand store

`hooks/use-expanded-sidebar-module.ts`:

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ExpandedSidebarModuleStore {
  expandedModule: string | null;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  setExpandedModule: (slug: string | null) => void;
  toggleModule: (slug: string) => void;
}

export const useExpandedSidebarModule = create<ExpandedSidebarModuleStore>()(
  persist(
    (set, get) => ({
      expandedModule: null,
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      setExpandedModule: (slug) => set({ expandedModule: slug }),
      toggleModule: (slug) =>
        set({ expandedModule: get().expandedModule === slug ? null : slug }),
    }),
    {
      name: 'myjkkn.sidebar.expanded-module',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ expandedModule: state.expandedModule }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);

export const useExpandedSidebarModuleHydration = () =>
  useExpandedSidebarModule((s) => s._hasHydrated);
```

Mirrors the `use-bottom-nav.ts` pattern (hydration tracking, partialize, persist) so future maintainers see one consistent style across sidebar and bottom nav.

### 7.3 Menu render logic

In `components/Navbar/menu.tsx:256-322`, replace the flat `<Link>` render with conditional accordion behavior:

```
if (directChildren.length === 0) {
  // Today's behavior — plain link, no chevron
  <Link href={href}>...</Link>
} else {
  // Accordion behavior
  <button onClick={() => toggleModule(moduleSlug)}>
    <Icon />
    <span>{label}</span>
    <ChevronRight className={cn(
      'transition-transform',
      expandedModule === moduleSlug && 'rotate-90'
    )} />
  </button>
  <AnimatePresence initial={false}>
    {expandedModule === moduleSlug && (
      <motion.ul
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {directChildren.map((sub) => (
          <li key={sub.path}>
            <Link href={sub.path}
                  className={cn('pl-12 ...', pathname === sub.path && 'active')}>
              <sub.icon size={14} />
              <span>{sub.title}</span>
            </Link>
          </li>
        ))}
      </motion.ul>
    )}
  </AnimatePresence>
}
```

Animation uses `motion/react` (already imported across BottomNav). The `motion.ul` height-from-0 trick matches the bottom-nav-submenu animation pattern.

### 7.4 Auto-expand on URL match

In `Menu.tsx`, on mount and on `pathname` change:

```typescript
useEffect(() => {
  const matchingModuleSlug = pathname.split('/').filter(Boolean)[0] || null;
  if (matchingModuleSlug && expandedModule === null) {
    setExpandedModule(matchingModuleSlug);
  }
}, [pathname]); // intentionally omit expandedModule from deps
```

We deliberately do **not** force-open the matching module if the user has explicitly closed something — respecting their intent. We only auto-open when nothing is expanded.

### 7.5 Visual

- Active sub-page: highlighted with the existing `variant='secondary'` style used today.
- Active parent module (URL inside it): button gets the active treatment even when collapsed.
- Chevron: `ChevronRight` from lucide-react with `rotate-90` Tailwind class when expanded.
- Indent: sub-pages indented to align with the parent label text (Tailwind `pl-12`).

### 7.6 Sidebar collapsed (90px) state

When the global sidebar is in icon-only mode (`isOpen === false`), accordion behavior is suppressed: clicking a module navigates to its root `page.tsx` directly, just like today. Every module has a root page (verified during route mapping), so no module is unreachable in this state.

## 8. navMeta Override Pattern (was: §8 Decommissioning)

If an auto-derived sub-page label or icon is wrong (e.g. `'Gd Pi'` should read `'GD/PI Rounds'`), add `navMeta` inline to that `page.tsx`:

```typescript
// app/(routes)/admission/gd-pi/page.tsx
import { Users } from 'lucide-react';

export const navMeta = {
  label: 'GD/PI Rounds',
  icon: 'Users',
};

export default function GdPiPage() { ... }
```

The codegen reads this on the next `npm run gen:routes` and writes the override into `route-manifest.generated.ts`. No additional config files.

> Note on `getAdminNavTree()` and admin nav components: investigation found `components/admin/AdminCategoryNav.tsx` and `components/admin/AdminModuleNav.tsx` exist, but no `getAdminNavTree()` function literally appears in the codebase (the v1 spec was working from an investigator-summary that didn't precisely match reality). These admin components are unrelated to the sidebar's accordion change and stay untouched. If they become redundant later, that's a separate cleanup.

## 9. Edge Cases & Error Handling

| Case | Behavior |
|---|---|
| Module folder exists but no `page.tsx` | Module not in manifest. (No landing page = not navigable.) |
| Sub-folder is dynamic (`[id]`, `[uid]`) | Skipped by existing manifest generator. |
| User has zero permissions for any sub-page of a module | `directChildren.length === 0` → renders as plain link to module root. |
| User on `/admission/leads/[id]` (deep route) | First-segment match → `admission` auto-expands; `leads` highlighted as active. |
| Sidebar collapsed (90px) | Accordion suppressed; clicking module navigates to root page. |
| Hydration race (Zustand from localStorage) | `useExpandedSidebarModuleHydration()` returns false until rehydrated; render behaves as if no module is expanded until then. Same pattern as `use-bottom-nav.ts`. |
| `getPagesByModule(slug)` returns empty | Render as plain link (no chevron). Matches the no-permission path. |
| pathname is `/` (dashboard) | `pathname.split('/').filter(Boolean)[0]` → `undefined` → no auto-expand. Correct. |

## 10. Verification

This project does not use Vitest/Jest for component-level unit tests. Quality gates are script-based health checks (`scripts/check-*.ts`) that run during `npm run build`. We follow the same convention.

### 10.1 Existing scripts that protect us automatically

- `npm run check:sidebar` — sidebar health
- `npm run check:reachability` — every page must be reachable from nav
- `npm run check:menu-coverage` — `MENU_PERMISSIONS` coverage
- `npm run gen:routes` — runs at build start; manifest drift fails the build

These already exist and require no changes. They will exercise the new accordion behavior implicitly.

### 10.2 Manual smoke test (golden path) — performed by implementer

1. Run `npm run gen:routes && npm run dev`. Sidebar shows accordion chevrons next to every module that has sub-pages.
2. Click `Admission` — sub-pages animate in.
3. Click `Meetings` — Admission collapses, Meetings expands.
4. Click `Meetings` again — Meetings collapses; nothing expanded.
5. Click `Admission > Leads` — navigates to `/admission/leads`, Admission stays expanded, `Leads` highlighted.
6. Reload the page on `/admission/leads` — Admission still expanded (localStorage), `Leads` still highlighted.
7. Switch to a low-permission user — only sub-pages they have access to appear; modules with zero accessible children render as plain link to root.
8. Collapse the sidebar to icon-only mode — accordion behavior suppressed.
9. Switch to mobile viewport — bottom nav still works exactly as before. The desktop sidebar is hidden on mobile so no overlap.

### 10.3 Browser check via Chrome DevTools MCP

After manual smoke test passes, run the same flow through Chrome DevTools MCP to confirm rendered DOM has correct ARIA semantics (`aria-expanded`, `role="button"`) and that submenu height transitions don't cause layout shift.

## 11. Migration Plan (3 phases — was: 6)

Each phase is independently shippable and revertable.

1. **Phase 1 — Add the Zustand store.** Create `hooks/use-expanded-sidebar-module.ts`. Not yet consumed anywhere. Verify `npm run typecheck` passes.

2. **Phase 2 — Wire the accordion render into `menu.tsx`.** Modify the flat render branch (lines 256-322 today) to call `getPagesByModule()` + `filterByPermissions()`, render accordion trigger when `directChildren.length > 0`, animate with `motion/react`. Run manual smoke test (§10.2). Run all `npm run check:*` health checks.

3. **Phase 3 — `navMeta` polish pass.** Walk the rendered sidebar; for any sub-page where the auto-derived label/icon is visibly wrong, add inline `export const navMeta = { ... }` to that page's `page.tsx`. Regenerate manifest. Optional polish — not a blocker.

**Total estimated diff:** ~120 LOC across 1 new file + 1 modified file + N tiny `navMeta` exports in Phase 3.

## 12. Non-Decisions / Open Questions

- **Direct children only (v1).** The accordion shows depth-1 children (e.g. `/admission/leads`). Grandchildren (e.g. `/admission/leads/walk-in`) are reachable from the leads page itself, not nested in the sidebar. *Decision: ship v1 with depth-1 only; revisit if specific modules need deeper nesting.*
- **Section group headers.** Preserved as today (Academic, Admission CRM, etc. from `lib/navigation/modules.ts`). The accordion is *within* sections.
- **Search within sidebar.** Out of scope; existing Ctrl+K palette covers it.
- **Sub-page ordering.** Currently alphabetical (the manifest generator sorts). If a specific module needs custom ordering, a per-page `navMeta.order` could be added later — but reading the existing `readNavMeta()` at `scripts/generate-route-manifest.ts:103` shows it only reads `label` and `iconName`. *Deferred: only extend if a real need surfaces.*

## 13. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `getPagesByModule()` returns pages outside the visual module (e.g. cross-module routing quirks) | Low | The function filters by `p.module.toLowerCase() === module.toLowerCase()`; module is derived from URL first segment. Matches our slug exactly. |
| Animation jank on slow devices | Low | `motion/react` honors `prefers-reduced-motion` automatically. |
| Hydration flash (server says nothing-expanded, client localStorage says admission-expanded) | Medium | Use `useExpandedSidebarModuleHydration()` to render no-expanded state until rehydration completes. Same pattern as `use-bottom-nav.ts`. |
| `filterByPermissions()` semantics differ from current sidebar's `GetRoleBasedPages()` filter | Medium | Both already use `MENU_PERMISSIONS` keys. Phase 2 manual smoke test (item 7) verifies low-permission user sees the same sub-pages they would by navigating to the module landing page. |
| Removing flat-only render breaks the Wave 2b PR-S2 intent (move submenus to flyout) | Low | Wave 2b kept the data shape exactly because future PRs would surface submenus somewhere. We're surfacing them in the sidebar instead of in a flyout — same intent, different UI. The `<SidebarFlyout>` work referenced in the comment is superseded by this spec. |
