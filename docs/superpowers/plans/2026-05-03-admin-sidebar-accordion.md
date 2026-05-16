# Admin Sidebar Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the desktop admin sidebar from a flat module list into a single-expand accordion that reveals each module's sub-pages inline, sourcing sub-page data from the existing `ROUTE_MANIFEST` infrastructure.

**Architecture:** Add a single Zustand store (`useExpandedSidebarModule`) for accordion state. Modify the flat-render branch of `components/Navbar/menu.tsx` (lines 256-322) to call `getPagesByModule()` + `filterByPermissions()` from the existing `lib/navigation/` smart-nav system, render an accordion trigger with `motion/react` height animation when sub-pages exist, and auto-expand the module matching the current URL. Polish a few `navMeta` overrides for sub-pages with awkward auto-derived labels.

**Tech Stack:** Next.js 15 App Router, React 19, Zustand 4, motion/react (post-framer-motion migration), TypeScript, Tailwind CSS, lucide-react icons, existing `lib/navigation/` smart-nav system.

**Spec:** `docs/superpowers/specs/2026-05-03-admin-sidebar-accordion-design.md`

---

## Pre-flight

Before starting, verify the working tree is clean and you're on a feature branch.

- [ ] **Step 0.1: Verify clean working tree on a feature branch**

```bash
git status
git checkout -b feat/admin-sidebar-accordion
```

Expected: working tree clean (or only contains your unrelated WIP), now on branch `feat/admin-sidebar-accordion`.

- [ ] **Step 0.2: Verify the existing nav infrastructure is in place**

```bash
ls lib/navigation/route-manifest.generated.ts lib/navigation/page-registry.ts lib/navigation/permission-filter.ts hooks/use-bottom-nav.ts
```

Expected: all four files print, no errors. (If any are missing, STOP — the spec assumes these exist.)

- [ ] **Step 0.3: Verify `getPagesByModule` and `filterByPermissions` exports**

```bash
grep -n "export function getPagesByModule" lib/navigation/page-registry.ts
grep -n "export function filterByPermissions" lib/navigation/permission-filter.ts
```

Expected: both grep commands print one matching line each.

- [ ] **Step 0.4: Run `npm run gen:routes` to ensure manifest is current**

```bash
npm run gen:routes
git status lib/navigation/route-manifest.generated.ts
```

Expected: command succeeds. If `git status` shows the file changed, commit the regenerated manifest as a separate prep commit:
```bash
git add lib/navigation/route-manifest.generated.ts
git commit -m "chore(nav): regenerate route manifest before sidebar accordion work"
```

---

## Phase 1 — Add the Zustand store

### Task 1: Create `useExpandedSidebarModule` Zustand store

**Files:**
- Create: `hooks/use-expanded-sidebar-module.ts`

- [ ] **Step 1.1: Read the reference pattern**

Run:
```bash
cat hooks/use-bottom-nav.ts
```

Expected: prints the bottom-nav store. Note the `_hasHydrated` field, `partialize`, `onRehydrateStorage` callback, and the separate `useBottomNavHydration` helper. The new store mirrors this shape.

- [ ] **Step 1.2: Create the store file**

Create `hooks/use-expanded-sidebar-module.ts` with this exact content:

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ExpandedSidebarModuleStore {
  /** Slug of the module whose accordion submenu is open, or null if none. */
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

/** Returns true once the persisted state has been read from localStorage. */
export const useExpandedSidebarModuleHydration = () =>
  useExpandedSidebarModule((s) => s._hasHydrated);
```

- [ ] **Step 1.3: Type-check**

Run:
```bash
npm run typecheck 2>&1 | grep -E "use-expanded-sidebar-module|error TS" | head -20
```

Expected: no errors mentioning `use-expanded-sidebar-module.ts`. (Other pre-existing errors elsewhere in the codebase are not your concern — this is a large project with known type debt.)

- [ ] **Step 1.4: Commit**

```bash
git add hooks/use-expanded-sidebar-module.ts
git commit -m "feat(sidebar): add useExpandedSidebarModule zustand store

Mirrors the use-bottom-nav pattern (hydration tracking, partialize,
localStorage persistence). Powers the upcoming sidebar accordion's
single-expand state machine. Not yet consumed."
```

---

## Phase 2 — Wire accordion render into menu.tsx

### Task 2: Read the current flat-render branch

**Files:**
- Read only: `components/Navbar/menu.tsx`

- [ ] **Step 2.1: Read the lines you'll replace**

Run:
```bash
sed -n '1,50p;250,330p' components/Navbar/menu.tsx
```

Expected: prints the imports plus the section around lines 256-322 (the comment "Wave 2b PR-S2: flat rendering only" + the `menus.map(...)` block).

Note the existing variables in scope: `href`, `label`, `icon: Icon`, `active`, `isOpen`, `pathname` (likely from `usePathname()` higher up).

- [ ] **Step 2.2: Locate the imports block and the existing usePermissions/usePathname usage**

Run:
```bash
grep -n "usePathname\|usePermissions\|from 'motion/react'\|AnimatePresence" components/Navbar/menu.tsx | head -20
```

Expected: at least one line for `usePathname` (probably from `next/navigation`) and a line for `usePermissions`. Note whether `motion/react` is already imported (it likely isn't in `menu.tsx` — we'll add it).

### Task 3: Add the new imports and helpers to `menu.tsx`

**Files:**
- Modify: `components/Navbar/menu.tsx` (top of file)

- [ ] **Step 3.1: Add new imports**

In `components/Navbar/menu.tsx`, immediately after the existing `lucide-react` import, add:

```typescript
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { getPagesByModule } from '@/lib/navigation/page-registry';
import { filterByPermissions } from '@/lib/navigation/permission-filter';
import {
  useExpandedSidebarModule,
  useExpandedSidebarModuleHydration,
} from '@/hooks/use-expanded-sidebar-module';
```

If `ChevronRight` is already imported from `lucide-react` elsewhere in the file (search first), merge it into the existing import instead of adding a new one.

- [ ] **Step 3.2: Verify imports compile**

Run:
```bash
npm run typecheck 2>&1 | grep "menu.tsx" | head -10
```

Expected: no new errors mentioning `menu.tsx` (pre-existing errors elsewhere can be ignored).

### Task 4: Replace the flat render branch with accordion behavior

**Files:**
- Modify: `components/Navbar/menu.tsx` (lines 256-322 — the `menus.map(...)` block inside the `<div id={`sidebar-section-${index}`} hidden={collapsed}>`)

- [ ] **Step 4.1: Add hooks at the top of the `Menu` component**

Inside the `Menu` function component, near the existing `usePathname()` / `usePermissions()` calls, add:

```typescript
const expandedModule = useExpandedSidebarModule((s) => s.expandedModule);
const toggleModule = useExpandedSidebarModule((s) => s.toggleModule);
const setExpandedModule = useExpandedSidebarModule((s) => s.setExpandedModule);
const hydrated = useExpandedSidebarModuleHydration();

// Auto-expand the module matching the current URL on mount / route change,
// but only if no module is currently expanded (respect user's manual close).
useEffect(() => {
  if (!hydrated) return;
  const slug = pathname.split('/').filter(Boolean)[0] || null;
  if (slug && expandedModule === null) {
    setExpandedModule(slug);
  }
  // intentionally omit expandedModule from deps — we only auto-set on URL change
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pathname, hydrated]);
```

If `useEffect` isn't already imported from `react`, add it to the existing `react` import line.

**Note on existing variables:** `components/Navbar/menu.tsx:40,86` already destructures `userProfile`, `permissions`, and `isSuperAdmin` at the top of the `Menu` component. You do NOT need to add new destructuring — these are already in scope. The `filterByPermissions(pages, permissions, isSuperAdmin, userRole)` call in Step 4.2 passes `userProfile?.role || ''` as the `userRole` argument. (`usePermissions()` itself does not expose a `userRole` field — the project sources the role from `userProfile?.role`. This matches the existing usage in the smart-nav system.)

- [ ] **Step 4.2: Replace the flat menus.map block (lines ~256-322)**

Find the existing block that starts with the comment `/* Wave 2b PR-S2: flat rendering only.`*/ and the `<div id={`sidebar-section-${index}`} hidden={collapsed}>` that wraps `menus.map(...)`. Replace the inner `menus.map((...) => { ... })` with this:

```tsx
{menus.map(({ href, label, icon: Icon, active }, idx) => {
  const iconName = (Icon as { displayName?: string }).displayName || 'Folder';
  const moduleName = groupLabel || 'General';

  // Derive the module slug from the href: '/admission' → 'admission'.
  // Skip Dashboard ('/') — it has no sub-pages and stays a plain link.
  const moduleSlug = href === '/' ? null : href.replace(/^\//, '').split('/')[0]!;

  // Look up sub-pages for this module from the route manifest.
  const allSubPages = moduleSlug ? getPagesByModule(moduleSlug) : [];
  const accessibleSubPages = filterByPermissions(
    allSubPages,
    permissions,
    isSuperAdmin,
    userProfile?.role || ''
  );

  // Only direct children (depth = 2 segments, e.g. /admission/leads).
  // Exclude the module root itself.
  const directChildren = accessibleSubPages.filter((p) => {
    const segs = p.path.split('/').filter(Boolean);
    return segs.length === 2 && segs[0] === moduleSlug && p.path !== href;
  });

  // Decide rendering mode:
  // - Sidebar collapsed (icon-only, isOpen===false) → always plain link
  // - No accessible direct children → plain link
  // - Otherwise → accordion
  const useAccordion = isOpen !== false && directChildren.length > 0;
  const isExpanded = useAccordion && expandedModule === moduleSlug;

  return (
    <div className='w-full group/row' key={idx}>
      <div className='flex items-center'>
        <TooltipProvider disableHoverableContent>
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              {useAccordion ? (
                <Button
                  variant={active ? 'secondary' : 'ghost'}
                  className={cn(
                    'flex-1 justify-start h-10 mb-1',
                    !active && 'dark:text-gray-400'
                  )}
                  onClick={() => toggleModule(moduleSlug!)}
                  aria-expanded={isExpanded}
                  aria-controls={`sidebar-submenu-${moduleSlug}`}
                >
                  <span className={cn(isOpen === false ? '' : 'mr-4')}>
                    <Icon size={18} />
                  </span>
                  <p
                    className={cn(
                      'max-w-[170px] truncate flex-1 text-left',
                      isOpen === false
                        ? '-translate-x-96 opacity-0'
                        : 'translate-x-0 opacity-100'
                    )}
                  >
                    {label}
                  </p>
                  <ChevronRight
                    size={16}
                    className={cn(
                      'transition-transform duration-200',
                      isExpanded && 'rotate-90'
                    )}
                  />
                </Button>
              ) : (
                <Button
                  variant={active ? 'secondary' : 'ghost'}
                  className={cn(
                    'flex-1 justify-start h-10 mb-1',
                    !active && 'dark:text-gray-400'
                  )}
                  asChild
                >
                  <Link href={href}>
                    <span className={cn(isOpen === false ? '' : 'mr-4')}>
                      <Icon size={18} />
                    </span>
                    <p
                      className={cn(
                        'max-w-[170px] truncate flex-1',
                        isOpen === false
                          ? '-translate-x-96 opacity-0'
                          : 'translate-x-0 opacity-100'
                      )}
                    >
                      {label}
                    </p>
                    {isOpen !== false && (() => {
                      const shortcut = getShortcutForPath(href);
                      return shortcut ? (
                        <kbd className='hidden lg:inline-flex h-4 select-none items-center rounded border px-1 font-mono text-[9px] font-medium text-muted-foreground dark:text-gray-400 dark:border-gray-600 dark:bg-gray-800/50 bg-muted/80 border-border/60'>
                          {shortcut}
                        </kbd>
                      ) : null;
                    })()}
                  </Link>
                </Button>
              )}
            </TooltipTrigger>
            {isOpen === false && (
              <TooltipContent side='right'>{label}</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        {isOpen !== false && (
          <FavoriteStar
            pagePath={href}
            pageTitle={label}
            module={moduleName}
            iconName={iconName}
            size='sm'
            className='opacity-0 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity mr-1'
          />
        )}
      </div>

      {/* Accordion sub-page list */}
      {useAccordion && (
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.ul
              id={`sidebar-submenu-${moduleSlug}`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className='overflow-hidden ml-2 border-l border-border/50'
            >
              {directChildren.map((sub) => {
                const SubIcon = sub.icon;
                const isActive = pathname === sub.path;
                return (
                  <li key={sub.path}>
                    <Button
                      variant={isActive ? 'secondary' : 'ghost'}
                      className={cn(
                        'w-full justify-start h-9 mb-0.5 pl-6 text-sm font-normal',
                        !isActive && 'dark:text-gray-400'
                      )}
                      asChild
                    >
                      <Link href={sub.path}>
                        <span className='mr-2'>
                          <SubIcon size={14} />
                        </span>
                        <span className='truncate'>{sub.title}</span>
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      )}
    </div>
  );
})}
```

- [ ] **Step 4.3: Type-check**

Run:
```bash
npm run typecheck 2>&1 | grep "menu.tsx" | head -10
```

Expected: no new errors mentioning `menu.tsx`. If type errors appear, the most likely causes are: (a) `usePermissions()` returns a different shape — fix the destructuring; (b) `pathname` is undefined where `useEffect` references it — add `usePathname` import.

- [ ] **Step 4.4: Run lint on the file**

Run:
```bash
npx next lint --file components/Navbar/menu.tsx
```

Expected: no errors. Warnings about `react-hooks/exhaustive-deps` on the auto-expand `useEffect` are expected and already disabled with the inline comment.

### Task 5: Manual smoke test (golden path)

**Files:** None modified — this is verification only.

- [ ] **Step 5.1: Start the dev server**

Run:
```bash
npm run dev
```

Wait until the server prints "Ready" and the local URL.

- [ ] **Step 5.2: Verify accordion appears on modules with sub-pages**

Open the app in the browser, log in as an admin user. Look at the sidebar:

Expected:
- Modules with sub-pages (Admission, Meetings, Billing, Academic, etc.) show a `▶` chevron on the right.
- Modules with no sub-pages (Dashboard, Profile, AI Query, Audit Trail, Bug Leaderboard) show NO chevron — just the plain link as before.

If a module that should have sub-pages has no chevron, run `npm run gen:routes` and reload.

- [ ] **Step 5.3: Verify single-expand behavior**

In the browser:
1. Click `Admission` — its sub-pages animate in. Chevron rotates to `▼`.
2. Click `Meetings` — Admission collapses, Meetings expands.
3. Click `Meetings` a second time — Meetings collapses; nothing is expanded.

Expected: only ever one module expanded at a time. Animation smooth (no flash).

- [ ] **Step 5.4: Verify navigation + persistence**

In the browser:
1. With Admission expanded, click `Admission > Leads`. URL changes to `/admission/leads`. Admission stays expanded. `Leads` row highlighted.
2. Reload the page (Ctrl+R). After reload, Admission is still expanded and `Leads` still highlighted.
3. Navigate via URL bar to `/billing`. Billing auto-expands (because no module was expanded after Admission was manually collapsed — verify by first clicking Admission to close it).

Expected: localStorage persists `expandedModule`. Auto-expand only triggers when nothing is currently expanded.

- [ ] **Step 5.5: Verify permission filtering**

Log out and log back in as a low-permission user (e.g. a counselor with only admission access). Open the sidebar.

Expected:
- Sub-pages the user cannot access are not in the list.
- Modules where the user has access to zero sub-pages render as plain link to root (no chevron).

If you don't have a low-permission test account handy, skip this step and document it in the PR description as "to-be-verified post-merge".

- [ ] **Step 5.6: Verify collapsed sidebar behavior**

In the browser:
1. Click the sidebar collapse toggle (the chevron at the top).
2. Sidebar collapses to icon-only mode (90px).
3. Click any module icon (e.g. Admission).

Expected: navigates directly to `/admission` (root page). No accordion. No chevron visible.

- [ ] **Step 5.7: Verify mobile bottom nav unchanged**

Resize the browser to a mobile viewport (e.g. 375px wide). Desktop sidebar disappears, bottom nav appears.

Expected: bottom nav looks and behaves exactly as before. No regressions.

- [ ] **Step 5.8: Stop the dev server**

Press `Ctrl+C` in the terminal.

### Task 6: Run the existing health checks

**Files:** None.

- [ ] **Step 6.1: Run sidebar health check**

```bash
npm run check:sidebar
```

Expected: passes.

- [ ] **Step 6.2: Run reachability check**

```bash
npm run check:reachability
```

Expected: passes (every page reachable from nav). If it fails, the accordion may have hidden a page that was previously surfaced through some other path — investigate and fix.

- [ ] **Step 6.3: Run menu coverage check**

```bash
npm run check:menus
```

Expected: passes.

- [ ] **Step 6.4: Run the type-check across the whole project**

```bash
npm run typecheck 2>&1 | tail -30
```

Expected: no NEW errors compared to pre-change baseline. (Pre-existing errors elsewhere can be ignored.)

If you want a delta, run typecheck on the base branch first and diff:
```bash
git stash && npm run typecheck > /tmp/typecheck-base.txt 2>&1; git stash pop
npm run typecheck > /tmp/typecheck-head.txt 2>&1
diff /tmp/typecheck-base.txt /tmp/typecheck-head.txt
```

### Task 7: Commit Phase 2

- [ ] **Step 7.1: Review the diff**

```bash
git diff components/Navbar/menu.tsx
```

Read the diff. Confirm:
- Imports added at the top (motion, ChevronRight, getPagesByModule, filterByPermissions, useExpandedSidebarModule).
- Hooks added inside the Menu component (expandedModule, toggleModule, setExpandedModule, hydrated, useEffect for auto-expand).
- The `menus.map(...)` block now branches on `useAccordion`.
- Permission filter properly wired.
- No accidental deletions outside the targeted block.

- [ ] **Step 7.2: Commit**

```bash
git add components/Navbar/menu.tsx
git commit -m "feat(sidebar): single-expand accordion with route-driven sub-pages

Replaces the flat menus.map render in components/Navbar/menu.tsx with
accordion behavior. Each module looks up its sub-pages via
getPagesByModule() and filterByPermissions() (existing lib/navigation
infrastructure powering the in-page tab nav). Only one module's
submenu is open at a time. State persists to localStorage. Module
matching the current URL auto-expands on mount when nothing else is.

- New hook: useExpandedSidebarModule (Phase 1, separate commit)
- Modified: components/Navbar/menu.tsx flat render branch
- Animation: motion/react height transition

Modules with no accessible sub-pages render as plain link (today's
behavior). Sidebar in icon-only mode also renders as plain link
(no accordion behavior at 90px width). Mobile bottom nav unchanged."
```

---

## Phase 3 — `navMeta` polish pass (optional)

This phase only adds inline `navMeta` overrides where the auto-derived sub-page label or icon looks wrong. It is **optional** — you can ship Phases 1 and 2 without it and add overrides incrementally as you notice them.

### Task 8: Identify sub-pages that need overrides

**Files:** None modified — investigation only.

- [ ] **Step 8.1: Walk the rendered sidebar in dev mode**

```bash
npm run dev
```

In the browser, expand each module that has sub-pages. Note any sub-page where:
- The label looks awkward (e.g. `"Gd Pi"` should be `"GD/PI Rounds"`).
- The icon is the generic `FileText` fallback and a more meaningful icon would help (e.g. a `Users` icon for `/admission/counselors`).

Write down the affected page paths in a scratch list. Stop the dev server when done.

- [ ] **Step 8.2: Confirm the override format from an existing example**

```bash
grep -rn "export const navMeta" "app/(routes)" | head -5
```

Expected: zero or a few existing examples. If none exist, the format from `scripts/generate-route-manifest.ts:103-121` is:

```typescript
export const navMeta = {
  label: 'My Custom Label',  // optional
  icon: 'Users',             // optional Lucide icon name
};
```

### Task 9: Add `navMeta` overrides

For each sub-page identified in Task 8, repeat the steps below. Example uses `app/(routes)/admission/gd-pi/page.tsx`.

**Files:**
- Modify: `app/(routes)/<module>/<sub>/page.tsx` (one or more)

- [ ] **Step 9.1: Add `navMeta` near the top of the page file**

Open the affected `page.tsx`. Immediately below the existing imports, add:

```typescript
export const navMeta = {
  label: 'GD/PI Rounds',
  icon: 'Users',
};
```

(Substitute the actual label and icon. The icon string must be a valid lucide-react export name.)

- [ ] **Step 9.2: Regenerate the manifest**

```bash
npm run gen:routes
```

- [ ] **Step 9.3: Verify the manifest picked up the override**

```bash
grep -A 2 "<the page path>" lib/navigation/route-manifest.generated.ts | head -5
```

Expected: the label / iconName in the generated manifest matches what you set.

- [ ] **Step 9.4: Run dev server and visually confirm**

```bash
npm run dev
```

Reload the sidebar, expand the affected module. The sub-page should now show the corrected label and icon. Stop the dev server.

- [ ] **Step 9.5: Commit per batch (one commit per module is fine)**

```bash
git add app/(routes)/admission/ lib/navigation/route-manifest.generated.ts
git commit -m "feat(nav): add navMeta overrides for admission sub-pages

Improves auto-derived labels and icons for sub-pages surfaced by the
new sidebar accordion. No functional change — manifest regenerated
via npm run gen:routes."
```

Repeat Task 9 for any other modules with sub-page label / icon issues.

---

## Closing

### Task 10: PR-ready check

- [ ] **Step 10.1: Run the build**

```bash
npm run build 2>&1 | tail -40
```

Expected: build succeeds. The build script runs `gen:routes`, `check:sidebar`, `check:reachability`, `check:audit-coverage`, then `next build`.

- [ ] **Step 10.2: Final visual smoke test**

```bash
npm run start
```

Open the production build in a browser, run through the golden path from Task 5 again. Everything should still work the same as in dev.

- [ ] **Step 10.3: Push the branch and open a PR**

```bash
git push -u origin feat/admin-sidebar-accordion
gh pr create --title "feat(sidebar): single-expand accordion with route-driven sub-pages" --body "$(cat <<'EOF'
## Summary
- Desktop admin sidebar now renders each module as a single-expand accordion
- Sub-pages source from existing ROUTE_MANIFEST via getPagesByModule() + filterByPermissions()
- Only one module's submenu is expanded at a time; state persists to localStorage
- Module matching the current URL auto-expands when nothing else is

## Spec
docs/superpowers/specs/2026-05-03-admin-sidebar-accordion-design.md

## Plan
docs/superpowers/plans/2026-05-03-admin-sidebar-accordion.md

## Test plan
- [ ] Click Admission → sub-pages animate in
- [ ] Click Meetings while Admission is open → Admission collapses, Meetings expands
- [ ] Click an Admission sub-page (e.g. Leads) → navigates and stays expanded
- [ ] Reload after navigating into a sub-page → expansion persists
- [ ] Sidebar in collapsed (90px) mode → no accordion, plain link navigation
- [ ] Mobile bottom nav unchanged
- [ ] Low-permission user sees only sub-pages they can access

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR created. Reply with the URL.

---

## Out-of-band notes

- **Where the existing flat-render decision lived:** the comment at `components/Navbar/menu.tsx:250-254` (Wave 2b PR-S2) explicitly preserved the `submenus[]` data shape on the data side, expecting it to be consumed by a `<SidebarFlyout>` component later. That comment block becomes obsolete after Task 4 — feel free to delete those four lines as part of Task 4's edit.

- **Why we don't change `lib/sidebarMenuLink.ts`:** the existing `MenuItem.submenus` shape is unused in this work — we bypass it and source sub-pages from the manifest directly. The shape stays in place because mobile bottom nav and other consumers may still rely on it.

- **Why we don't add unit tests:** this project uses script-based health checks (`scripts/check-*.ts`) instead of Vitest/Jest for nav. The existing `check:sidebar`, `check:reachability`, and `check:menu-coverage` scripts run in `npm run build` and will catch most regressions. If you want extra confidence, the `chrome-devtools-mcp` skill in your toolkit can drive the browser through the smoke-test steps automatically.
