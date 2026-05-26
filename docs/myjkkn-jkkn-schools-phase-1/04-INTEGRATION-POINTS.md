# 04 — Integration Points

Where in the existing 2131-line `sidebarMenuLink.ts` file (and its consumers) you need to wire in. No edits to `GetRoleBasedPages` itself.

---

## Architecture recap

```
┌────────────────────┐  1. role/permission filter
│ GetRoleBasedPages  │────────────────────────┐
│   (pure fn)        │                        │
└────────────────────┘                        ▼
                                 ┌────────────────────────────┐
                                 │ filterMenuByInstitutionKind│  2. school/college filter
                                 │   (NEW pure fn)            │
                                 └────────────────────────────┘
                                              │
                                              ▼
                              menu.tsx / bottom-navbar.tsx render
```

**Why a second pass instead of modifying `GetRoleBasedPages`:** That function is 1500+ lines of permission logic. Adding an institution_kind param would require threading it through every callsite and every sub-branch. A second-stage filter is non-invasive and can be tested independently.

---

## Integration point #1: `lib/sidebarMenuLink.ts`

**What to add:** one new export at the bottom of the file.
**Lines changed:** +20, -0. Nothing existing is modified.

### Current state (top of file, line 94-109)

```ts
interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  submenus: Array<{
    href: string;
    label: string;
    active: boolean;
  }>;
}

interface MenuGroup {
  groupLabel?: string;
  menus: MenuItem[];
}
```

These interfaces are currently private (no `export`). **Leave them private** — the filter function receives and returns `MenuGroup[]` so it doesn't need to re-export the types.

### Current state (Organization group, lines 600-670)

This is the group the filter will strip items from:

```ts
{
  groupLabel: 'Organization Management',
  menus: [
    { href: '/organizations/dashboard', label: 'Dashboard', ... },
    { href: '/organizations/institutions', label: 'Institutions', ... },
    { href: '/organizations/degrees', label: 'Degrees', ... },         // HIDDEN for school
    { href: '/organizations/departments', label: 'Departments', ... },
    { href: '/organizations/programs', label: 'Programs', ... },       // Label → "Classes"
    { href: '/organizations/semesters', label: 'Semesters', ... },     // Label → "Terms"
    { href: '/organizations/sections', label: 'Sections', ... },
    {
      href: '/organizations/courses',
      label: 'Courses',                                                 // Label → "Subjects"
      submenus: [
        { href: '/organizations/courses', label: 'All Courses' },
        { href: '/organizations/courses/mappings', label: 'Course Mappings' }, // HIDDEN for school
      ],
    },
  ],
}
```

### What to add (end of file, after `GetRoleBasedPages` closes)

```ts
import { HIDDEN_SIDEBAR_HREFS, type InstitutionKind } from '@/lib/constants/institution-kind-labels';

/**
 * Filter the sidebar menu tree to hide items that don't apply to the
 * current institution kind (college vs school).
 *
 * Called AFTER GetRoleBasedPages, as a second-stage filter.
 * Recurses into submenus so a hidden submenu doesn't drop its parent menu.
 *
 * See docs/SPEC-jkkn-schools.md.
 */
export function filterMenuByInstitutionKind(
  groups: MenuGroup[],
  kind: InstitutionKind
): MenuGroup[] {
  const hidden = HIDDEN_SIDEBAR_HREFS[kind];
  if (hidden.length === 0) return groups;

  return groups
    .map((group) => ({
      ...group,
      menus: group.menus
        .filter((menu) => !hidden.includes(menu.href))
        .map((menu) => ({
          ...menu,
          submenus: menu.submenus.filter((sub) => !hidden.includes(sub.href)),
        })),
    }))
    .filter((group) => group.menus.length > 0);
}
```

The `import` at the top of the helper is fine — `lib/sidebarMenuLink.ts` already imports from other lib paths; co-locating the import near the function it's used in is optional but acceptable. If your team prefers all imports at the top, move it to the import block (lines 1-90).

---

## Integration point #2: `components/Navbar/menu.tsx`

**What to change:** 2 new imports, 1 hook call, 1 filter call.
**Lines changed:** +5, -1.

Find this (rough shape — actual code may vary slightly):

```ts
import { GetRoleBasedPages, RolePermissionData } from '@/lib/sidebarMenuLink';
// ...
const menuList = useMemo(
  () => GetRoleBasedPages(pathname, userRoleData),
  [pathname, userRoleData]
);
```

Change to:

```ts
import {
  GetRoleBasedPages,
  filterMenuByInstitutionKind,
  RolePermissionData,
} from '@/lib/sidebarMenuLink';
import { useInstitutionKind } from '@/hooks/use-institution-kind';
// ...
const { kind } = useInstitutionKind();
const menuList = useMemo(
  () => filterMenuByInstitutionKind(
    GetRoleBasedPages(pathname, userRoleData),
    kind
  ),
  [pathname, userRoleData, kind]
);
```

**Why include `kind` in the memo deps:** When the user's institution kind changes (unlikely mid-session but possible after the `useInstitutionKind` query resolves from its initial `null` state), the filter must re-run.

---

## Integration point #3: `components/BottomNav/bottom-navbar.tsx`

Same pattern as `menu.tsx`. This component renders the mobile bottom navigation and independently consumes `GetRoleBasedPages`. The filter must be applied in both places so mobile and desktop views stay consistent.

---

## What the filter does to each user

### College user (default — 90%+ of existing users)

`kind === 'college'` → `HIDDEN_SIDEBAR_HREFS.college === []` → early return.
**Zero change to the menu tree.** Pure identity function. No re-allocation overhead (the function returns the same array reference).

### School user

`kind === 'school'` → `HIDDEN_SIDEBAR_HREFS.school === ['/organizations/degrees', '/organizations/courses/mappings']`:

1. "Organization Management" group loses the "Degrees" menu item (stripped at the `.filter(menu => !hidden.includes(menu.href))` step)
2. "Organization Management" → "Courses" keeps its parent menu, but the "Course Mappings" submenu is removed (stripped at the inner `.filter(sub => !hidden.includes(sub.href))`)
3. All other groups untouched
4. The final `.filter((group) => group.menus.length > 0)` removes any group whose entire menu list was stripped — currently no group is fully school-hidden, but this guard is future-proof

---

## Label rendering — where to use `useInstitutionKind()`

Phase 1 ships the hook, the constants, the sidebar filter. Phase 1.5 (can be the same PR or a follow-up) wires the label dictionary into the Organization module pages:

| Page | File | Change |
|---|---|---|
| Programs list | `app/(routes)/organizations/programs/page.tsx` | `<Label>{labels.programPlural}</Label>` instead of "Programs" |
| Semesters list | `app/(routes)/organizations/semesters/page.tsx` | `labels.semesterPlural` |
| Courses list | `app/(routes)/organizations/courses/page.tsx` | `labels.coursePlural` |
| Program form | (wherever the create/edit modal lives) | `{labels.program}` + `{!isSchool && <DegreeSelector />}` |
| Sections list header | `app/(routes)/organizations/sections/page.tsx` | `labels.section` (unchanged — but wire hook for consistency) |

The pattern in each:

```tsx
'use client';
import { useInstitutionKind } from '@/hooks/use-institution-kind';

export default function ProgramsPage() {
  const { labels, isSchool, isLoading } = useInstitutionKind();

  if (isLoading) return <Spinner />;  // optional

  return (
    <div>
      <h1>{labels.programPlural}</h1>   {/* "Programs" or "Classes" */}
      {!isSchool && <DegreeFilter />}   {/* hidden in school view */}
      <ProgramsTable />                  {/* unchanged data */}
    </div>
  );
}
```

**Optional for Phase 1:** If the label integration bloats the PR, ship the sidebar filter + hook + migration in Phase 1, and do the label rewrites in a Phase 1.5 follow-up PR. The spec and acceptance criteria allow either.

---

## What NOT to touch

- `GetRoleBasedPages` itself — no edits
- Any RLS policy — no edits
- Any service file (`lib/services/organizations/*`) — no edits
- Any API route (`app/api/organizations/*`) — no edits
- The `institution_type` column — do not rename, do not reuse

If you find yourself editing any of these, stop and re-read `01-ARCHITECTURE.md`. The whole point of this design is that only the UI layer changes.
