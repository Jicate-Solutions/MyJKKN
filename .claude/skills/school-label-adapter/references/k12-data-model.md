# K-12 Data Model — JKKN Schools on MyJKKN

Source of truth: [docs/myjkkn-jkkn-schools-phase-1/SPEC-jkkn-schools.md](docs/myjkkn-jkkn-schools-phase-1/SPEC-jkkn-schools.md)

## Contents
1. [Virtual hierarchy mapping](#1-virtual-hierarchy-mapping)
2. [Seed pattern](#2-seed-pattern)
3. [entity_type column](#3-entity_type-column)
4. [Sidebar filter implementation](#4-sidebar-filter-implementation)
5. [Adding a new entity_type](#5-adding-a-new-entity_type)
6. [Out-of-scope (Phase 2)](#6-out-of-scope-phase-2)

---

## 1. Virtual Hierarchy Mapping

A K-12 school is a **degenerate case** of the college hierarchy — same tables, different node values. Zero new tables are added.

| MyJKKN table | College value | School value |
|---|---|---|
| `institutions` | "JKKN College of Engineering" | "JKKN Matriculation Higher Secondary School" |
| `degrees` | "B.Tech", "M.Tech" | "K-12 Program" (1 virtual degree) |
| `departments` | "CSE", "Mechanical" | "Academic" (1 virtual department) |
| `programs` | "B.Tech CSE", "B.Tech Mech" | "Class 1" … "Class 12" |
| `semesters` | "Semester 1", "Semester 2" | "Term 1 2026-27", "Term 2 2026-27", "Term 3 2026-27" |
| `sections` | "A", "B", "C" | "A", "B", "C" (unchanged) |
| `courses` | "Data Structures", "Thermodynamics" | "Mathematics", "Tamil", "Science" |
| `course_mapping` | Course ↔ Program/Semester | Subject ↔ Class/Term |

Schools inherit all existing MyJKKN features for free: billing, attendance, staff, transport, hostel, library, notifications.

---

## 2. Seed Pattern

Per school institution (idempotent — re-runnable without duplicates):

```ts
// 1 virtual degree
{ degree_id: 'K12', degree_name: 'K-12 Program', degree_type: 'ug' }

// 1 virtual department
{ department_code: 'SCHOOL', department_name: 'Academic' }

// 12 programs
['Class 1', 'Class 2', ..., 'Class 12']

// 3 semesters per class per academic year
['Term 1 2026-27', 'Term 2 2026-27', 'Term 3 2026-27']

// subjects seeded as courses, linked via course_mapping
```

---

## 3. entity_type Column

```sql
-- Column already exists on the institutions table
-- Values: 'institution' (colleges, default), 'school' (K-12), 'admin_office', 'company'
-- Index:  idx_institutions_entity_type
-- Constraint: chk_entity_type
```

Default is `'institution'` — forgetting to set it on a new college is safe (no regression).

No RLS policy references `entity_type`; this is presentation-only in Phase 1.

---

## 4. Sidebar Filter Implementation

`GetRoleBasedPages(userRole)` in `lib/sidebarMenuLink.ts` is a pure function (not a hook). It cannot call `useInstitutionType()` directly. The filter is applied after the fact:

```ts
// lib/sidebarMenuLink.ts
const HIDDEN_SIDEBAR_HREFS: Record<string, string[]> = {
  school: [
    '/organizations/degrees',          // top-level menu item hidden
    '/organizations/courses/mappings', // submenu item hidden (parent stays)
  ],
};

export function filterMenuByEntityType(
  groups: MenuGroup[],
  entityType: string
): MenuGroup[] {
  const hidden = HIDDEN_SIDEBAR_HREFS[entityType] ?? [];
  if (hidden.length === 0) return groups;
  return groups
    .map(g => ({
      ...g,
      menus: g.menus
        .filter(m => !hidden.includes(m.href))
        .map(m => ({ ...m, submenus: m.submenus.filter(s => !hidden.includes(s.href)) })),
    }))
    .filter(g => g.menus.length > 0);
}
```

Consumed in `components/Navbar/menu.tsx` and `components/BottomNav/bottom-navbar.tsx`:

```ts
const { entityType } = useInstitutionType();
const groups = GetRoleBasedPages(userRole);
const visibleGroups = filterMenuByEntityType(groups, entityType);
```

`/organizations/departments` is intentionally kept visible for schools (teachers grouped as Wings).

---

## 5. Adding a New entity_type

1. Add a label block to `LABEL_MAP` in `lib/utils/school-label-adapter.ts`
2. Add a labels entry to `INSTITUTION_TYPE_LABELS` in the spec constant
3. Add a hidden-routes entry to `HIDDEN_SIDEBAR_HREFS` in `lib/sidebarMenuLink.ts` (empty array = nothing hidden)
4. Verify the DB `chk_entity_type` constraint allows the new value

---

## 6. Out-of-scope (Phase 2)

- School-specific grading (A-E vs CGPA)
- Parent portal (separate spec)
- School-specific fee structures
- Class-teacher / subject-teacher staff distinction
- School admissions flow
- Route guards for direct URL access to sidebar-hidden pages
- Cross-institution (school + college) combined reports
