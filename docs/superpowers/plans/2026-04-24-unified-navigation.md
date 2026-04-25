# Unified Navigation System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardise all 34 modules onto a single navigation pattern — sidebar accordion (one group at a time, tier 2) + AutoTabNav starting at tier 3 + Sheet drawer replacing BottomNavbar on mobile.

**Architecture:** The sidebar becomes an exclusive accordion of module-group headers; clicking a header reveals that group's top-level pages as flat links. AutoTabNav's `resolveTiers()` starts at depth 3 (not 2), so it never duplicates the sidebar. The BottomNavbar system is replaced by a single `MobileSidebarSheet` component that reuses the desktop `Menu` component inside a Radix Sheet.

**Tech Stack:** Next.js 15 App Router, Zustand (persist), Radix UI Sheet, Lucide React, Tailwind CSS, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-24-unified-navigation-design.md`

---

## File Map

### Created
| File | Responsibility |
|---|---|
| `hooks/use-sidebar-accordion.ts` | Zustand store: which group is expanded (exclusive accordion, localStorage-persisted) |
| `components/navigation/mobile-sidebar-sheet.tsx` | Hamburger trigger + Sheet wrapper; renders same `<Menu />` as desktop |

### Modified
| File | What changes |
|---|---|
| `components/Navbar/menu.tsx` | Group headers become accordion triggers; groups expand/collapse exclusively |
| `lib/navigation/tier-rendering.ts` | Remove `groupedTier2()`; `resolveTiers()` starts at depth 3 |
| `components/navigation/auto-tab-nav.tsx` | `minDepth` default: `2` → `3` |
| `scripts/check-nav-reachability.ts` | Update tier-start assumption from 2 to 3 |
| `lib/sidebarMenuLink.ts` | All 34 modules: flat `MenuItem[]`, no populated `submenus[]` |
| `components/layout/admin-panel-layout.tsx` | Add Sheet, remove BottomNavbar and `pb-20` |
| `lib/navigation/nav-config.ts` | Remove tier-2 fields from `ModuleNavConfig` type if any |
| All 9 `nav-config.ts` files | Kept; role shifts from tier-2 → tier-3 source |

### Deleted
| File | Reason |
|---|---|
| `components/BottomNav/bottom-navbar.tsx` | Replaced by Sheet drawer |
| `components/BottomNav/bottom-nav-item.tsx` | Same |
| `components/BottomNav/bottom-nav-submenu.tsx` | Same |
| `components/BottomNav/bottom-nav-more-menu.tsx` | Same |
| `hooks/use-bottom-nav.ts` | Replaced by Sheet + `useSidebarAccordion` |
| `components/Navbar/CollapseMenuButton.tsx` | No callers after Phase 3 removes all `submenus[]` data |

---

## PR 1 — Sidebar Accordion Infrastructure

### Task 1.1 — Create `useSidebarAccordion` hook

**Files:**
- Create: `hooks/use-sidebar-accordion.ts`

- [ ] **Step 1.1.1: Create the file**

```typescript
// hooks/use-sidebar-accordion.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SidebarAccordionStore {
  // The groupLabel string of the currently-expanded group, or null (all collapsed).
  // Constraint: every groupLabel in sidebarMenuLink.ts must be a unique string.
  activeGroupId: string | null;
  // Exclusive setter — collapses all other groups automatically.
  setActiveGroup: (id: string | null) => void;
}

export const useSidebarAccordion = create(
  persist<SidebarAccordionStore>(
    (set) => ({
      activeGroupId: null,
      setActiveGroup: (id) => set({ activeGroupId: id }),
    }),
    {
      name: 'sidebarAccordionGroup',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
```

- [ ] **Step 1.1.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors on the new file.

- [ ] **Step 1.1.3: Commit**

```bash
git add hooks/use-sidebar-accordion.ts
git commit -m "feat(nav): add useSidebarAccordion Zustand store"
```

---

### Task 1.2 — Add accordion behavior to `menu.tsx`

**Files:**
- Modify: `components/Navbar/menu.tsx`

The current `menu.tsx` renders each `MenuGroup` with a static `<p>` label header (line 153). We replace that with a clickable accordion trigger. The group's `menus` only render when that group is the active one.

- [ ] **Step 1.2.1: Add imports at the top of `menu.tsx`**

Add after the existing import block (after line 28, before `interface MenuProps`):
```typescript
import { ChevronDown } from 'lucide-react';
import { useSidebarAccordion } from '@/hooks/use-sidebar-accordion';
import { useStore } from '@/hooks/use-store';
```

- [ ] **Step 1.2.2: Read accordion state inside `Menu` function**

Add these two lines inside `Menu()` immediately after `const pages = GetRoleBasedPages(pathname, roleData);` (after line 91):

```typescript
  const accordion = useStore(useSidebarAccordion, (s) => s);
  const activeGroupId = accordion?.activeGroupId ?? null;
  const setActiveGroup = accordion?.setActiveGroup ?? (() => {});
```

- [ ] **Step 1.2.3: Add auto-expand effect**

Add after the `accordion` lines above:

```typescript
  // Auto-expand the group that contains the active page on navigation.
  // Runs whenever pathname changes so direct-URL bookmarks open the right group.
  const prevPathnameRef = React.useRef(pathname);
  React.useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    const activeGroup = pages.find((g) => g.menus.some((m) => m.active));
    if (activeGroup?.groupLabel && activeGroup.groupLabel !== activeGroupId) {
      setActiveGroup(activeGroup.groupLabel);
    }
  }, [pathname, pages, activeGroupId, setActiveGroup]);

  // On first mount, open the group that owns the current page.
  React.useEffect(() => {
    const activeGroup = pages.find((g) => g.menus.some((m) => m.active));
    if (activeGroup?.groupLabel && !activeGroupId) {
      setActiveGroup(activeGroup.groupLabel);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount
```

Also add `import React from 'react';` if not already present (check line 1-30 of the file).

- [ ] **Step 1.2.4: Replace the group-label rendering block with an accordion trigger**

Find this block in `menu.tsx` (lines 152-171):
```typescript
                {(isOpen && groupLabel) || isOpen === undefined ? (
                  <p className='text-sm font-medium text-muted-foreground dark:text-white/80 px-4 pb-2 max-w-[248px] truncate'>
                    {groupLabel}
                  </p>
                ) : !isOpen && isOpen !== undefined && groupLabel ? (
                  <TooltipProvider>
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger className='w-full'>
                        <div className='w-full flex justify-center items-center'>
                          <Ellipsis className='h-5 w-5' />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side='right'>
                        <p>{groupLabel}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <p className='pb-2'></p>
                )}
```

Replace with:
```typescript
                {groupLabel ? (
                  isOpen !== false ? (
                    // Expanded sidebar — clickable accordion header
                    <button
                      type='button'
                      onClick={() =>
                        setActiveGroup(
                          activeGroupId === groupLabel ? null : groupLabel
                        )
                      }
                      className='w-full flex items-center justify-between px-4 pb-2 text-sm font-medium text-muted-foreground dark:text-white/80 hover:text-foreground transition-colors'
                    >
                      <span className='max-w-[200px] truncate'>{groupLabel}</span>
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                          activeGroupId === groupLabel && 'rotate-180'
                        )}
                      />
                    </button>
                  ) : (
                    // Collapsed sidebar (icon-only) — ellipsis + tooltip (unchanged)
                    <TooltipProvider>
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger className='w-full'>
                          <div className='w-full flex justify-center items-center'>
                            <Ellipsis className='h-5 w-5' />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side='right'>
                          <p>{groupLabel}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                ) : (
                  <p className='pb-2'></p>
                )}
```

- [ ] **Step 1.2.5: Wrap the `menus.map(...)` block with accordion conditional**

Find the line that opens the `menus.map(...)` render (line 172): `{menus.map(`

Wrap the entire `menus.map(...)` block:
```typescript
                {/* Only render menu items when this group is expanded (or has no label) */}
                {(!groupLabel || activeGroupId === groupLabel || isOpen === false) &&
                  menus.map(
                    ({ href, label, icon: Icon, active, submenus }, index) => {
                      // ... existing rendering code unchanged ...
                    }
                  )
                }
```

Note: `isOpen === false` (icon-only collapsed mode) shows all items so the existing dropdown-per-item behaviour continues to work without an accordion.

- [ ] **Step 1.2.6: Run type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 1.2.7: Manual smoke-test**

Start dev server (`npm run dev`). Open the sidebar:
1. All groups should be collapsed except the one matching the current page.
2. Click a different group header → it expands, the previous group collapses.
3. Navigate to a page in another module → the correct group auto-expands.
4. Collapse sidebar to icon-only → items still visible via existing dropdown behaviour.

- [ ] **Step 1.2.8: Commit**

```bash
git add components/Navbar/menu.tsx
git commit -m "feat(nav): accordion group headers in sidebar — one group open at a time"
```

---

### Task 1.3 — Open PR 1

- [ ] **Step 1.3.1: Push and open draft PR**

```bash
git push origin main   # or your feature branch
gh pr create \
  --title "feat(nav): sidebar accordion — one group open at a time (PR 1/6)" \
  --body "Adds exclusive accordion to sidebar group headers. Each module group collapses/expands independently; only one can be open at a time. State persisted to localStorage. Data unchanged — this is infrastructure only." \
  --draft
```

- [ ] **Step 1.3.2: Run type-check, confirm green**

```bash
npx tsc --noEmit
```

- [ ] **Step 1.3.3: Mark PR ready**

```bash
gh pr ready <PR_NUMBER>
```

---

## PR 2 — AutoTabNav Tier Shift

### Task 2.1 — Update `tier-rendering.ts`

**Files:**
- Modify: `lib/navigation/tier-rendering.ts`

The sidebar now owns tier 2. AutoTabNav must start at tier 3. Two changes:
1. Remove `groupedTier2()` function (lines 99-109).
2. Update `resolveTiers()` to not emit a tier-2 array and to start the flat fallback loop at depth 3.

- [ ] **Step 2.1.1: Delete `groupedTier2()` (lines 99-109)**

Remove this entire function from `lib/navigation/tier-rendering.ts`:
```typescript
export function groupedTier2(
  config: ModuleNavConfig,
  activeGroup: ModuleNavGroup | null
): Chip[] {
  return config.groups.map((g) => ({
    href: g.href,
    label: g.label,
    iconName: g.icon,
    isActive: activeGroup?.href === g.href,
  }));
}
```

- [ ] **Step 2.1.2: Update `resolveTiers()` — remove tier-2 emission and shift flat fallback**

Replace the current `resolveTiers()` function body (lines 141-184) with:

```typescript
export function resolveTiers(pathname: string): Chip[][] {
  const config = getNavConfigForPath(pathname);

  if (config) {
    const activeGroup = findActiveGroup(pathname, config);
    // Tier 2 is now the sidebar's responsibility — start at tier 3.
    const tiers: Chip[][] = [];

    if (activeGroup?.children && activeGroup.children.length > 0) {
      // Tier 3 from explicit nav-config children.
      tiers.push(
        activeGroup.children.map((c) => {
          const pathsToCheck = [c.href, ...(c.matchPaths ?? [])];
          const isActive = pathsToCheck.some((p) =>
            c.exact
              ? pathname === p
              : pathname === p || pathname.startsWith(p + '/')
          );
          return {
            href: c.href,
            label: c.label,
            iconName: c.icon,
            isActive,
          };
        })
      );
      // Tier 4+ from manifest.
      tiers.push(...deeperTiersFromManifest(pathname, 4));
    } else if (activeGroup) {
      // No explicit children — discover from manifest starting at depth 3.
      tiers.push(...deeperTiersFromManifest(pathname, 3));
    }
    return tiers.filter((t) => t.length >= 2);
  }

  // Flat fallback (module has no nav-config) — start at depth 3.
  const out: Chip[][] = [];
  const depth = pathname.split('/').filter(Boolean).length;
  for (let d = 3; d <= Math.max(depth + 1, 3); d++) {
    const tier = flatTierChips(pathname, d);
    if (!tier) continue;
    if (tier.chips.length < 2) continue;
    out.push(tier.chips);
  }
  return out;
}
```

- [ ] **Step 2.1.3: Remove unused import**

`groupedTier2` was the only use of `ModuleNavGroup` type import. Check line 30-34:
```typescript
import {
  getNavConfigForPath,
  findActiveGroup,
  type ModuleNavConfig,
  type ModuleNavGroup,   // ← remove if no longer used
} from './nav-config';
```

Remove `type ModuleNavGroup` if it has no remaining callers.

- [ ] **Step 2.1.4: Run type-check**

```bash
npx tsc --noEmit
```
Expected: no errors. Verify `groupedTier2` has no remaining import sites:
```bash
grep -r "groupedTier2" --include="*.ts" --include="*.tsx" .
```
Expected: zero results.

---

### Task 2.2 — Update `auto-tab-nav.tsx`

**Files:**
- Modify: `components/navigation/auto-tab-nav.tsx`

- [ ] **Step 2.2.1: Change `minDepth` default from `2` to `3`**

Find:
```typescript
export function AutoTabNav({
  maxDepth = 4,
  minDepth = 2,
  className,
}: AutoTabNavProps) {
```

Replace with:
```typescript
export function AutoTabNav({
  maxDepth = 4,
  minDepth = 3,
  className,
}: AutoTabNavProps) {
```

- [ ] **Step 2.2.2: Remove the local `resolveTiers` / `groupedTier2` if still duplicated**

`auto-tab-nav.tsx` was refactored in PR #441 to import from `tier-rendering.ts`. Verify it no longer defines its own `groupedTier2` or `resolveTiers`:
```bash
grep -n "groupedTier2\|resolveTiers" components/navigation/auto-tab-nav.tsx
```
Expected: only `import { resolveTiers }` line — no local definition.

- [ ] **Step 2.2.3: Run type-check**

```bash
npx tsc --noEmit
```

---

### Task 2.3 — Update `check-nav-reachability.ts`

**Files:**
- Modify: `scripts/check-nav-reachability.ts`

- [ ] **Step 2.3.1: Find tier-start references in the reachability script**

```bash
grep -n "startDepth\|minDepth\|depth.*2\|tier.*2" scripts/check-nav-reachability.ts
```

- [ ] **Step 2.3.2: Update any hardcoded depth-2 start to depth-3**

The reachability simulator uses `resolveTiers()` from `tier-rendering.ts` directly, so most of the change is automatic (it calls the same function). Search for any hardcoded `d = 2` or `startDepth = 2` in the script and change to `3`. If there are none, this step is a no-op.

- [ ] **Step 2.3.3: Run the reachability check and confirm it passes**

```bash
npx tsx scripts/check-nav-reachability.ts
```
Expected: exits 0. If orphan warnings appear, note them — they are pre-existing issues, not caused by this change.

---

### Task 2.4 — Smoke-test tier shift and open PR 2

- [ ] **Step 2.4.1: Manual visual QA — open each of these 6 URLs and check in-page tabs**

| URL | Expected tier-3 chips |
|---|---|
| `/admission/counselors` | All Counselors · Daily View · Call Logs · Reminders · Alerts · Briefing · Productivity |
| `/admission/marketing` | Campaigns · Messaging · Voice · Media · Expos |
| `/academic/timetables` | Overview · Faculty Calendar · Calendar Admin · Templates · Template Analytics · Conflicts |
| `/academic/leaves` | Leaves · Leave Calendar · On-Duty · On-Duty Approvals · On-Duty Reports · On-Duty Settings · Leave Settings · Leave Types · Leave Workflows |
| `/campus-living/residents` | Residents · Blocks · Allocations · (other children) |
| `/hr/leave` | Apply · My Applications · Approve Inbox · Calendar · Balance · Encashment |

For each URL: confirm chips appear, confirm active chip highlights correctly, confirm no tier-2 (module-level) chips are visible.

- [ ] **Step 2.4.2: Open PR 2**

```bash
git add lib/navigation/tier-rendering.ts components/navigation/auto-tab-nav.tsx scripts/check-nav-reachability.ts
git commit -m "feat(nav): AutoTabNav starts at tier 3 — sidebar owns tier 2"
git push
gh pr create \
  --title "feat(nav): AutoTabNav tier shift — start at depth 3 not 2 (PR 2/6)" \
  --body "Removes groupedTier2() from tier-rendering.ts. resolveTiers() now emits tier-3 chips as the first strip. minDepth default: 2→3. Sidebar accordion (PR 1) owns tier 2." \
  --draft
```

- [ ] **Step 2.4.3: Mark PR ready**

```bash
gh pr ready <PR_NUMBER>
npx tsc --noEmit
```

---

## PR 3 — sidebarMenuLink.ts Data Migration

### Task 3.1 — Create path-matching helper

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

- [ ] **Step 3.1.1: Add `matchesAny` helper near the top of `sidebarMenuLink.ts` (after imports)**

```typescript
/**
 * Returns true when pathname equals href exactly OR starts with href + '/'.
 * Accepts multiple hrefs (for groups that span several URL roots, e.g. Assessment
 * covers /academic/internal-marks and /academic/course-grades).
 */
function matchesAny(pathname: string, ...hrefs: string[]): boolean {
  return hrefs.some(
    (h) => pathname === h || pathname.startsWith(h + '/')
  );
}
```

- [ ] **Step 3.1.2: Commit**

```bash
git add lib/sidebarMenuLink.ts
git commit -m "refactor(nav): add matchesAny helper for multi-root active detection"
```

---

### Task 3.2 — Migrate Category 1: modern modules (expand single entry → section list)

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

Source for each module's items: the `groups[]` in its `nav-config.ts`. The icon name strings (e.g. `'CalendarDays'`) must become actual imported Lucide icons (already imported or add to the import block at the top of `sidebarMenuLink.ts`).

- [ ] **Step 3.2.1: Migrate Admission CRM group**

Find the Admission CRM group (currently has 1 menu entry). Replace its `menus: [...]` array:

```typescript
    {
      groupLabel: 'Admission CRM',
      menus: [
        { href: '/admission/dashboard',    label: 'Dashboard',    icon: LayoutGrid,       active: matchesAny(pathname, '/admission/dashboard', '/admission'), submenus: [] },
        { href: '/admission/analytics',    label: 'Analytics',    icon: LineChart,        active: matchesAny(pathname, '/admission/analytics', '/admission/group-dashboard'), submenus: [] },
        { href: '/admission/leads',        label: 'Leads',        icon: UserPlus,         active: matchesAny(pathname, '/admission/leads', '/admission/applications'), submenus: [] },
        { href: '/admission/gd-pi',        label: 'GD-PI',        icon: Award,            active: matchesAny(pathname, '/admission/gd-pi'), submenus: [] },
        { href: '/admission/counselors',   label: 'Counselors',   icon: HeadphonesIcon,   active: matchesAny(pathname, '/admission/counselors', '/admission/consultants'), submenus: [] },
        { href: '/admission/marketing',    label: 'Marketing',    icon: Megaphone,        active: matchesAny(pathname, '/admission/marketing'), submenus: [] },
        { href: '/admission/insights',     label: 'AI Insights',  icon: Sparkles,         active: matchesAny(pathname, '/admission/insights'), submenus: [] },
        { href: '/admission/data-quality', label: 'Data Quality', icon: SearchCheck,      active: matchesAny(pathname, '/admission/data-quality'), submenus: [] },
        { href: '/admission/settings',     label: 'Settings',     icon: Settings,         active: matchesAny(pathname, '/admission/settings'), submenus: [] },
      ],
    },
```

Add any missing icon imports (`HeadphonesIcon`, `SearchCheck`, `UserPlus`, `Award`, `Megaphone`, `Sparkles`) to the import block at the top of the file.

- [ ] **Step 3.2.2: Migrate Academic Management group**

```typescript
    {
      groupLabel: 'Academic Management',
      menus: [
        { href: '/academic/years',          label: 'Years',       icon: CalendarDays,    active: matchesAny(pathname, '/academic/years'), submenus: [] },
        { href: '/academic/regulations',    label: 'Regulations', icon: Bookmark,        active: matchesAny(pathname, '/academic/regulations'), submenus: [] },
        { href: '/academic/batches',        label: 'Batches',     icon: Boxes,           active: matchesAny(pathname, '/academic/batches'), submenus: [] },
        { href: '/academic/periods',        label: 'Periods',     icon: Clock,           active: matchesAny(pathname, '/academic/periods'), submenus: [] },
        { href: '/academic/timetables',     label: 'Timetables',  icon: CalendarClock,   active: matchesAny(pathname, '/academic/timetables'), submenus: [] },
        { href: '/academic/attendance',     label: 'Attendance',  icon: ClipboardCheck,  active: matchesAny(pathname, '/academic/attendance'), submenus: [] },
        { href: '/academic/internal-marks', label: 'Assessment',  icon: GraduationCap,   active: matchesAny(pathname, '/academic/internal-marks', '/academic/course-grades'), submenus: [] },
        { href: '/academic/leaves',         label: 'Leaves',      icon: CalendarX2,      active: matchesAny(pathname, '/academic/leaves', '/academic/leave-calendar', '/academic/leave-onduty'), submenus: [] },
        { href: '/academic/staff-planning', label: 'Planning',    icon: UserSearch,      active: matchesAny(pathname, '/academic/staff-planning'), submenus: [] },
        { href: '/academic/privileges',     label: 'Privileges',  icon: Shield,          active: matchesAny(pathname, '/academic/privileges'), submenus: [] },
      ],
    },
```

Ensure `CalendarClock` and `Bookmark` are in the import block (add if missing).

- [ ] **Step 3.2.3: Migrate Campus Living group**

```typescript
    {
      groupLabel: 'Campus Living',
      menus: [
        { href: '/campus-living/dashboard',  label: 'Dashboard',  icon: LayoutDashboard, active: matchesAny(pathname, '/campus-living/dashboard'), submenus: [] },
        { href: '/campus-living/residents',  label: 'Residents',  icon: UsersRound,      active: matchesAny(pathname, '/campus-living/residents', '/campus-living/blocks', '/campus-living/allocations', '/campus-living/my-hostel', '/campus-living/vacate-requests'), submenus: [] },
        { href: '/campus-living/attendance', label: 'Attendance', icon: ClipboardCheck,  active: matchesAny(pathname, '/campus-living/attendance'), submenus: [] },
        { href: '/campus-living/services',   label: 'Services',   icon: Package,         active: matchesAny(pathname, '/campus-living/services', '/campus-living/mess', '/campus-living/laundry', '/campus-living/medical'), submenus: [] },
        { href: '/campus-living/facility',   label: 'Facility',   icon: Building2,       active: matchesAny(pathname, '/campus-living/facility', '/campus-living/maintenance', '/campus-living/rooms'), submenus: [] },
        { href: '/campus-living/community',  label: 'Community',  icon: Heart,           active: matchesAny(pathname, '/campus-living/community'), submenus: [] },
        { href: '/campus-living/insights',   label: 'Insights',   icon: BarChart,        active: matchesAny(pathname, '/campus-living/insights'), submenus: [] },
        { href: '/campus-living/settings',   label: 'Settings',   icon: Settings,        active: matchesAny(pathname, '/campus-living/settings'), submenus: [] },
      ],
    },
```

Verify `UsersRound`, `LayoutDashboard`, `Package`, `Building2`, `Heart` are imported.

- [ ] **Step 3.2.4: Migrate remaining Category 1 modules**

For each of the following modules, read its `nav-config.ts` file to get the `groups[]` array, then create a flat `MenuItem[]` entry in `sidebarMenuLink.ts` following the same pattern as Steps 3.2.1–3.2.3:

- `app/(routes)/okr/nav-config.ts` → group label `'OKR & Performance'`
- `app/(routes)/accreditation/nav-config.ts` → group label `'Accreditation'`
- `app/(routes)/audit/nav-config.ts` → group label `'Audit'`
- `app/(routes)/solutions/nav-config.ts` → group label `'Solution Hub'`
- `app/(routes)/startup-studio/nav-config.ts` → group label `'Startup Studio'`
- `app/(routes)/learners-council/nav-config.ts` → group label `'Learners Council'`

Pattern to follow for each:
```typescript
{ href: group.href, label: group.label, icon: <LucideIconRef>, active: matchesAny(pathname, group.href, ...group.matchPaths), submenus: [] },
```

- [ ] **Step 3.2.5: Run type-check**

```bash
npx tsc --noEmit
```
Expected: no errors. Fix any missing icon imports shown by the compiler.

- [ ] **Step 3.2.6: Commit**

```bash
git add lib/sidebarMenuLink.ts
git commit -m "refactor(nav): expand Category 1 modules from single-entry to section lists"
```

---

### Task 3.3 — Migrate Category 2: legacy dropdown modules (flatten)

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

All `submenus: [...]` arrays are emptied. Sub-items that were in the sidebar now live only in AutoTabNav tier-3 chips (auto-discovered from the route manifest).

- [ ] **Step 3.3.1: Flatten HR group**

Find the HR group (`groupLabel: 'HR (Sprints 1-3)'` or similar). Replace its `menus[]`:

```typescript
    {
      groupLabel: 'HR',
      menus: [
        { href: '/hr',             label: 'HR Command Center',    icon: Building,      active: matchesAny(pathname, '/hr'), submenus: [] },
        { href: '/hr/employees',   label: 'Non-Staff Workforce',  icon: Users,         active: matchesAny(pathname, '/hr/employees'), submenus: [] },
        { href: '/hr/leave',       label: 'Leave',                icon: CalendarDays,  active: matchesAny(pathname, '/hr/leave'), submenus: [] },
        { href: '/hr/recruitment', label: 'Recruitment',          icon: UserSearch,    active: matchesAny(pathname, '/hr/recruitment'), submenus: [] },
        { href: '/hr/policies',    label: 'Policies',             icon: ClipboardList, active: matchesAny(pathname, '/hr/policies'), submenus: [] },
      ],
    },
```

The `Apply`, `My Applications`, `Approve Inbox`, `Calendar`, `Balance`, `Encashment` items are removed from the sidebar — they now appear as AutoTabNav tier-3 chips on `/hr/leave` (auto-discovered from manifest).

- [ ] **Step 3.3.2: Flatten Billing group**

```typescript
    {
      groupLabel: 'Billing',
      menus: [
        { href: '/billing/categories', label: 'Categories', icon: Tags,          active: matchesAny(pathname, '/billing/categories'), submenus: [] },
        { href: '/billing/schedule',   label: 'Schedule',   icon: CalendarDays,  active: matchesAny(pathname, '/billing/schedule'), submenus: [] },
        { href: '/billing/receipts',   label: 'Receipts',   icon: FileText,      active: matchesAny(pathname, '/billing/receipts'), submenus: [] },
        { href: '/billing/discounts',  label: 'Discounts',  icon: TrendingUp,    active: matchesAny(pathname, '/billing/discounts'), submenus: [] },
        { href: '/billing/refunds',    label: 'Refunds',    icon: RefreshCw,     active: matchesAny(pathname, '/billing/refunds'), submenus: [] },
        { href: '/billing/invoices',   label: 'Invoices',   icon: FileBarChart,  active: matchesAny(pathname, '/billing/invoices'), submenus: [] },
      ],
    },
```

- [ ] **Step 3.3.3: Flatten remaining Category 2 modules**

For each, remove all `submenus: [...]` entries. Promote any previously-nested items that should remain top-level to standalone `MenuItem` entries with `submenus: []`. Items that are pure sub-navigation (e.g., form sub-tabs) are dropped from the sidebar entirely — AutoTabNav discovers them from the manifest.

Modules to flatten:
- `Learners` — remove dropdown arrays, keep top-level items: Profiles, Enquiries, Applications, Analytics, Alumni, Change Requests, Privileges
- `Faculty` — flatten Innovation and PDE items to flat list
- `Organizations` — add all pages as flat items (Institutions, Degrees, Departments, Programs, Courses, Sections, Semesters, Course Mappings)
- `Resource Management` — flatten to flat items
- `Service Requests` — flatten to flat items
- `Events` — flatten Marathon items to flat items
- `VAC` — flatten to flat items

- [ ] **Step 3.3.4: Run type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3.3.5: Commit**

```bash
git add lib/sidebarMenuLink.ts
git commit -m "refactor(nav): flatten Category 2 legacy dropdown modules — sub-nav moves to in-page tabs"
```

---

### Task 3.4 — Audit Category 3 active flags

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

Category 3 modules (`admin`, `health`, `learn`, `staff`, `system`, `users`, `work-pulse`, `my-bug-reports`) already have `submenus: []` — only their `active` flags need updating from `pathname === '/x'` to `matchesAny(pathname, '/x')`.

- [ ] **Step 3.4.1: Search for bare `===` active flags in sidebarMenuLink.ts**

```bash
grep -n "pathname ===" lib/sidebarMenuLink.ts
```

- [ ] **Step 3.4.2: Replace each `pathname === '/x'` with `matchesAny(pathname, '/x')`**

Example:
```typescript
// Before
active: pathname === '/staff/list'
// After
active: matchesAny(pathname, '/staff/list')
```

Do this for every Category 3 module item.

- [ ] **Step 3.4.3: Run type-check and commit**

```bash
npx tsc --noEmit
git add lib/sidebarMenuLink.ts
git commit -m "fix(nav): Category 3 active flags use startsWith — deep URLs now highlight sidebar item"
```

---

### Task 3.5 — Verify MENU_PERMISSIONS coverage and open PR 3

- [ ] **Step 3.5.1: Collect all new hrefs added to sidebarMenuLink.ts**

```bash
grep -oP "href: '([^']+)'" lib/sidebarMenuLink.ts | sort -u
```

- [ ] **Step 3.5.2: Check each href exists in MENU_PERMISSIONS**

```bash
grep -oP "href: '([^']+)'" lib/sidebarMenuLink.ts | \
  grep -oP "'[^']+'" | \
  while read -r href; do
    href=${href//\'/}
    grep -q "\"$href\"" lib/sidebarMenuLink.ts && echo "OK: $href" || echo "MISSING: $href"
  done
```

For any `MISSING` entries, add them to the `MENU_PERMISSIONS` object with the appropriate permission key from `lib/constants/permissions.ts`.

- [ ] **Step 3.5.3: Open PR 3**

```bash
git push
gh pr create \
  --title "refactor(nav): sidebarMenuLink data migration — all 34 modules flat (PR 3/6)" \
  --body "All modules now use flat MenuItem[] with submenus: []. Category 1 single entries expanded to section lists. Category 2 dropdowns flattened. Category 3 active flags updated. Zero URL changes." \
  --draft
```

- [ ] **Step 3.5.4: Mark ready**

```bash
npx tsc --noEmit && gh pr ready <PR_NUMBER>
```

---

## PR 4 — Mobile Drawer

### Task 4.1 — Create `MobileSidebarSheet` component

**Files:**
- Create: `components/navigation/mobile-sidebar-sheet.tsx`

- [ ] **Step 4.1.1: Create the file**

```typescript
// components/navigation/mobile-sidebar-sheet.tsx
'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu as MenuIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import { Menu } from '@/components/Navbar/menu';

export function MobileSidebarSheet() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the sheet whenever the user navigates to a new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Hamburger trigger — only visible when the desktop sidebar is hidden */}
      <Button
        variant='ghost'
        size='icon'
        className='lg:hidden h-8 w-8'
        onClick={() => setOpen(true)}
        aria-label='Open navigation menu'
      >
        <MenuIcon className='h-5 w-5' />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side='left' className='w-72 p-0' aria-describedby={undefined}>
          <SheetTitle className='sr-only'>Navigation menu</SheetTitle>
          {/* Reuse the exact same Menu component as the desktop sidebar.
              isOpen={true} so labels are always visible inside the sheet. */}
          <Menu isOpen={true} />
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 4.1.2: Run type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4.1.3: Commit**

```bash
git add components/navigation/mobile-sidebar-sheet.tsx
git commit -m "feat(nav): add MobileSidebarSheet component — hamburger + Sheet reusing Menu"
```

---

### Task 4.2 — Update `admin-panel-layout.tsx`

**Files:**
- Modify: `components/layout/admin-panel-layout.tsx`

- [ ] **Step 4.2.1: Replace the entire file content**

```typescript
'use client';

import { cn } from '@/lib/utils';
import { useStore } from '@/hooks/use-store';
import { useSidebarToggle } from '@/hooks/use-sidebar-toggle';
import Sidebar from '@/components/Sidebar/Sidebar';
import { Footer } from '@/components/Footer/Footer';
import { MobileSidebarSheet } from '@/components/navigation/mobile-sidebar-sheet';
import { PushNotificationBanner } from '@/components/notifications/push-notification-banner';
import { CommandPaletteProvider } from '@/components/CommandPalette/CommandPaletteProvider';
import { KeyboardShortcutsHelp } from '@/components/CommandPalette/KeyboardShortcutsHelp';
import { Suspense } from 'react';

export default function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebar = useStore(useSidebarToggle, (state) => state);
  const isOpen = sidebar?.isOpen ?? true;

  return (
    <CommandPaletteProvider>
      <Suspense>
        <Sidebar />
      </Suspense>
      <main
        className={cn(
          'min-h-[calc(100vh_-_56px)] bg-background transition-[margin-left] ease-in-out duration-300',
          isOpen === false ? 'lg:ml-[90px]' : 'lg:ml-72'
          // pb-20 removed — no bottom nav bar any more
        )}
      >
        {/* Mobile hamburger — renders as a button that opens the Sheet sidebar */}
        <div className='flex items-center px-4 pt-3 lg:hidden'>
          <MobileSidebarSheet />
        </div>
        <PushNotificationBanner />
        <Suspense>{children}</Suspense>
      </main>
      <footer
        className={cn(
          'transition-[margin-left] ease-in-out duration-300',
          isOpen === false ? 'lg:ml-[90px]' : 'lg:ml-72'
        )}
      >
        <Footer />
      </footer>
      <KeyboardShortcutsHelp />
    </CommandPaletteProvider>
  );
}
```

Key removals vs the original:
- `useIsMobile` import and usage removed
- `isMobile && 'pb-20'` removed from `<main>` className
- `<BottomNavbar />` removed
- `MobileSidebarSheet` added (renders hamburger + Sheet)
- Footer `isMobile && 'hidden'` removed (footer visible on mobile now that bottom nav is gone)

- [ ] **Step 4.2.2: Run type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4.2.3: Commit**

```bash
git add components/layout/admin-panel-layout.tsx
git commit -m "feat(nav): replace BottomNavbar with MobileSidebarSheet in AdminPanelLayout"
```

---

### Task 4.3 — Delete BottomNav files and hook

**Files:**
- Delete: `components/BottomNav/` (all files)
- Delete: `hooks/use-bottom-nav.ts`

- [ ] **Step 4.3.1: Confirm no remaining imports**

```bash
grep -r "BottomNav\|use-bottom-nav\|useBottomNav" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules .
```

Expected: zero results (we removed the only import in Step 4.2.1).

- [ ] **Step 4.3.2: Delete the files**

```bash
rm -rf components/BottomNav/
rm hooks/use-bottom-nav.ts
```

- [ ] **Step 4.3.3: Run type-check to confirm no broken imports**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4.3.4: Commit**

```bash
git add -A
git commit -m "chore(nav): delete BottomNav component tree and use-bottom-nav hook"
```

---

### Task 4.4 — Mobile QA and open PR 4

- [ ] **Step 4.4.1: Open dev server and test on a mobile viewport (375px)**

```bash
npm run dev
```

In Chrome DevTools → set device to iPhone 12 Pro (390px wide).

Checklist:
- [ ] Hamburger button visible top-left on mobile
- [ ] Desktop sidebar NOT visible on mobile (lg:hidden hides it)
- [ ] Tap hamburger → Sheet slides in from left, width 72 (288px)
- [ ] Sheet shows all module groups with accordion behaviour
- [ ] Tap a group → expands, previous collapses
- [ ] Tap a page link → Sheet closes, navigation happens
- [ ] Sheet closes automatically on navigation (useEffect on pathname)
- [ ] AutoTabNav tier-3 chips visible below breadcrumbs on mobile (horizontal scroll)
- [ ] No bottom navigation bar visible
- [ ] Footer visible (no hidden class now)
- [ ] Content not overlapping anything (no pb-20 needed)

- [ ] **Step 4.4.2: Test on iOS Safari safe-area (notch handling)**

Verify that on a device with a notch the Sheet content isn't cut off. The Sheet component from shadcn/ui handles safe-area by default via `env(safe-area-inset-*)`. If not, add to the Sheet className:
```typescript
className='w-72 p-0 pb-safe'  // Tailwind plugin or custom CSS
```

- [ ] **Step 4.4.3: Open PR 4**

```bash
git push
gh pr create \
  --title "feat(nav): replace BottomNavbar with Sheet drawer (PR 4/6)" \
  --body "Deletes the entire BottomNav/ component tree (5 files) and use-bottom-nav hook. Adds MobileSidebarSheet which reuses the same Menu component as desktop inside a Radix Sheet. Hamburger button replaces bottom tab bar on mobile. pb-20 padding removed." \
  --draft
```

- [ ] **Step 4.4.4: Mark ready**

```bash
gh pr ready <PR_NUMBER>
```

---

## PR 5 — Nav-Config Simplification

### Task 5.1 — Verify nav-config files still work with new tier system

**Files:**
- Modify: all 9 `nav-config.ts` files (if needed)
- Modify: `lib/navigation/nav-config.ts` (type cleanup)

After PR 2, `groupedTier2()` no longer calls `config.groups`. The nav-config files' `groups[]` are only used by `findActiveGroup()` (for `matchPaths`) and `resolveTiers()` (for `children[]`). No data changes are strictly required — but clean up comments that reference tier-2.

- [ ] **Step 5.1.1: Remove the `ModuleNavGroup` type export if it was only used by `groupedTier2`**

Check `lib/navigation/nav-config.ts`:
```bash
grep -n "ModuleNavGroup" lib/navigation/nav-config.ts
grep -r "ModuleNavGroup" --include="*.ts" --include="*.tsx" .
```

If `ModuleNavGroup` is still used (e.g., by `findActiveGroup()` return type), keep it. If its only remaining use is the type export itself, it can be inlined.

- [ ] **Step 5.1.2: Update comments in each nav-config.ts that mention "tier 2 chips"**

In each of the 9 nav-config files, find comments like:
```typescript
// AutoTabNav reads this to render tier-2 chips (N buckets) + tier-3 chips
```

Update to:
```typescript
// AutoTabNav reads this for tier-3 chips when a group is active.
// Tier 2 (sidebar section items) is driven by sidebarMenuLink.ts.
```

Affected files:
- `app/(routes)/admission/nav-config.ts`
- `app/(routes)/academic/nav-config.ts`
- `app/(routes)/campus-living/nav-config.ts`
- `app/(routes)/learners-council/nav-config.ts`
- `app/(routes)/okr/nav-config.ts`
- `app/(routes)/startup-studio/nav-config.ts`
- `app/(routes)/solutions/nav-config.ts`
- `app/(routes)/accreditation/nav-config.ts`
- `app/(routes)/audit/nav-config.ts`

- [ ] **Step 5.1.3: Run nav coverage check**

```bash
npx tsx scripts/check-nav-reachability.ts
```
Expected: exits 0 (no new orphans introduced).

- [ ] **Step 5.1.4: Commit and open PR 5**

```bash
git add lib/navigation/nav-config.ts app/**/nav-config.ts
git commit -m "docs(nav): update nav-config comments — tier-3 source, not tier-2"
git push
gh pr create \
  --title "chore(nav): simplify nav-config comments post tier-shift (PR 5/6)" \
  --body "nav-config.ts files now only drive tier-3 chips and matchPaths active detection. Comments updated to reflect new role. No logic changes." \
  --draft
gh pr ready <PR_NUMBER>
```

---

## PR 6 — Dead Code Cleanup

### Task 6.1 — Delete `CollapseMenuButton.tsx`

**Files:**
- Delete: `components/Navbar/CollapseMenuButton.tsx`

- [ ] **Step 6.1.1: Confirm no callers remain**

```bash
grep -r "CollapseMenuButton" --include="*.ts" --include="*.tsx" .
```

Expected: only the definition file itself. If any other file still imports it, fix that file first.

- [ ] **Step 6.1.2: Delete**

```bash
rm components/Navbar/CollapseMenuButton.tsx
```

- [ ] **Step 6.1.3: Remove import from `menu.tsx`**

Find and delete:
```typescript
import { CollapseMenuButton } from './CollapseMenuButton';
```

- [ ] **Step 6.1.4: Verify the `submenus.length === 0` branch in `menu.tsx` now always fires**

After Phase 3 removed all `submenus: [...]` from the data, the `else` branch (which renders `<CollapseMenuButton>`) should never be reached. Simplify by removing the branch entirely from `menu.tsx`:

Find:
```typescript
                    return submenus.length === 0 ? (
                      // ... flat link rendering ...
                    ) : (
                      <div className='w-full' key={index}>
                        <CollapseMenuButton ... />
                      </div>
                    );
```

Replace with just the flat link rendering (remove the ternary — always render the flat link):
```typescript
                    return (
                      <div className='w-full group/row flex items-center' key={index}>
                        {/* ... flat link rendering (the former `submenus.length === 0` branch) ... */}
                      </div>
                    );
```

- [ ] **Step 6.1.5: Run type-check**

```bash
npx tsc --noEmit
```

---

### Task 6.2 — Remove remaining dead code

**Files:**
- Modify: `components/Navbar/menu.tsx` (remove `useIsMobile` if still imported)
- Modify: any file with leftover `pb-20` or `isMobile &&` references

- [ ] **Step 6.2.1: Check for lingering `useIsMobile` usage**

```bash
grep -rn "useIsMobile\|isMobile" --include="*.tsx" --include="*.ts" .
```

For any remaining call sites in the layout files, remove the import and usage (no longer needed since CSS breakpoints handle everything).

- [ ] **Step 6.2.2: Check for `pb-20` remnants**

```bash
grep -rn "pb-20" --include="*.tsx" --include="*.ts" .
```

Remove any found (they were for the bottom nav clearance).

- [ ] **Step 6.2.3: Check for old tablet-only Sheet hamburger code**

```bash
grep -rn "md:flex lg:hidden" --include="*.tsx" .
```

If any old Sheet trigger exists in Sidebar.tsx or elsewhere for the `md:flex lg:hidden` breakpoint, remove it — the new `MobileSidebarSheet` (with `lg:hidden`) replaces it for all non-desktop sizes.

- [ ] **Step 6.2.4: Final type-check**

```bash
npx tsc --noEmit
```
Expected: clean build, zero errors.

- [ ] **Step 6.2.5: Run the nav reachability check one final time**

```bash
npx tsx scripts/check-nav-reachability.ts
```
Expected: exits 0.

- [ ] **Step 6.2.6: Commit and open PR 6**

```bash
git add -A
git commit -m "chore(nav): delete CollapseMenuButton + remove dead mobile/submenu code (PR 6/6)"
git push
gh pr create \
  --title "chore(nav): dead code cleanup — CollapseMenuButton, useIsMobile, pb-20 (PR 6/6)" \
  --body "Final cleanup after 6-phase unified navigation migration. Deletes CollapseMenuButton.tsx (no callers), removes useIsMobile usage, removes pb-20 remnants. Simplifies menu.tsx ternary to flat link only." \
  --draft
gh pr ready <PR_NUMBER>
```

---

## Self-Review Checklist (Run Before Each PR)

| Check | Command |
|---|---|
| TypeScript clean | `npx tsc --noEmit` |
| No groupedTier2 remaining | `grep -r "groupedTier2" .` |
| No pb-20 remaining (after PR 4) | `grep -r "pb-20" .` |
| No BottomNavbar imports (after PR 4) | `grep -r "BottomNav" .` |
| No CollapseMenuButton imports (after PR 6) | `grep -r "CollapseMenuButton" .` |
| Nav reachability clean | `npx tsx scripts/check-nav-reachability.ts` |
| Sidebar accordion works (manual) | Open sidebar, click groups, confirm exclusive expand |
| AutoTabNav tier-3 shows (manual) | Navigate to `/admission/counselors`, confirm chips |
| Mobile Sheet works (manual) | 375px viewport, tap hamburger, Sheet opens |
