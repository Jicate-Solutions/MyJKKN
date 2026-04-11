# SPEC: JKKN Schools on MyJKKN Platform

**Status:** Draft — awaiting approval
**Author:** Omm + Claude
**Date:** 2026-04-11
**Scope:** Add K-12 schools to MyJKKN as first-class institutions without forking the data model.

---

## 1. Problem

JKKN runs two schools alongside its colleges. Today MyJKKN is built for higher education: every row in `sections`, `course_mapping`, `students`, etc. carries `degree_id`, `department_id`, `program_id`, `semester_id` foreign keys. Schools don't have degrees or semesters in the college sense — they have classes (1–12) and terms. The user's question: *how do we add schools without forking the platform?*

## 2. The Insight (one paragraph)

A school is not a new entity — it is a **degenerate case** of the college hierarchy. The existing tables (`degrees`, `departments`, `programs`, `semesters`, `sections`, `courses`) are structurally generic; only their names borrow higher-ed vocabulary. A K-12 school fits the same tree, with different node values:

| MyJKKN table | College value | School value |
|---|---|---|
| `institutions` | "JKKN College of Engineering" | "JKKN Matriculation Higher Secondary School" |
| `degrees` | "B.Tech", "M.Tech" | "K-12 Program" (one virtual degree) |
| `departments` | "CSE", "Mechanical" | "Academic" (one virtual department) |
| `programs` | "B.Tech CSE", "B.Tech Mech" | **"Class 1", "Class 2", … "Class 12"** |
| `semesters` | "Semester 1", "Semester 2" | **"Term 1 2026-27", "Term 2 2026-27", "Term 3 2026-27"** |
| `sections` | "A", "B", "C" | "A", "B", "C" (same) |
| `courses` | "Data Structures", "Thermodynamics" | **"Mathematics", "Tamil", "Science"** |
| `course_mapping` | Course ↔ Program/Semester | Subject ↔ Class/Term |

**Consequence:** zero new tables, zero shadow schemas. Schools inherit every existing MyJKKN feature for free: billing, attendance, staff, transport, hostel, library, notifications, bug reports.

The only thing that differs is *presentation* — the labels and forms users see.

## 3. Scope

### In-scope (Phase 1 — this spec)
1. Add `institution_kind` enum column to `institutions` (`'college' | 'school'`, default `'college'`)
2. Create label-mapping hook (`useInstitutionKind`) that returns the kind and a label dictionary
3. Conditionally relabel "Program → Class", "Semester → Term", "Course → Subject" in the Organization module UI
4. Conditionally hide fields that don't apply to schools (degree selector, department selector — auto-fill behind the scenes with the virtual K-12 values)
5. Seed script for the 2 JKKN schools with virtual degree/department/program(classes)/semester(terms)
6. Sidebar filter: hide "Degrees" and "Course Mapping" UI for school users (they don't need these — the virtual entities are managed automatically)

### Out-of-scope (Phase 2+)
- School-specific grading (A-E instead of CGPA) — current grades module works with numeric percentages, which schools also use for now
- Parent portal (separate SPEC)
- School-specific fee structures (use existing billing with different fee head names)
- Class-teacher / subject-teacher distinction (use existing staff roles)
- School admissions flow (use existing admission CRM with different template)

Phase 2 will be scoped as a separate spec once Phase 1 is live and schools are using the platform.

## 4. Data Model Changes

### 4.1 Schema Migration

```sql
-- Add institution_kind column
ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS institution_kind VARCHAR(20) NOT NULL DEFAULT 'college'
  CHECK (institution_kind IN ('college', 'school'));

CREATE INDEX IF NOT EXISTS idx_institutions_kind ON public.institutions(institution_kind);

COMMENT ON COLUMN public.institutions.institution_kind IS
  'Education level: college (higher ed) or school (K-12). Determines UI labels and hidden fields. Does NOT affect data model — both use the same tables.';
```

### 4.2 Seed Data (per school)

For each school institution:
- 1 virtual degree: `{ degree_id: 'K12', degree_name: 'K-12 Program', degree_type: 'ug' }`
- 1 virtual department: `{ department_code: 'SCHOOL', department_name: 'Academic' }`
- 12 programs: Class 1 through Class 12 (each maps to one real grade)
- 3 semesters per grade per academic year: Term 1, Term 2, Term 3
- Subjects as courses, mapped to classes via `course_mapping`

The seed script is idempotent — re-runnable without creating duplicates.

## 5. UI Layer

### 5.1 Label Map

```ts
// lib/constants/institution-kind-labels.ts
export const INSTITUTION_KIND_LABELS = {
  college: {
    degree: 'Degree',
    department: 'Department',
    program: 'Program',
    semester: 'Semester',
    course: 'Course',
    section: 'Section',
    student: 'Student',
    faculty: 'Faculty',
  },
  school: {
    degree: 'Stream',          // rarely shown — hidden in most forms
    department: 'Wing',        // rarely shown — hidden in most forms
    program: 'Class',          // "Class 6", "Class 10"
    semester: 'Term',          // "Term 1 2026-27"
    course: 'Subject',         // "Mathematics", "Science"
    section: 'Section',        // unchanged
    student: 'Student',        // unchanged
    faculty: 'Teacher',        // "Class Teacher", "Subject Teacher"
  },
} as const;
```

### 5.2 Hook

```ts
// lib/hooks/use-institution-kind.ts
export function useInstitutionKind() {
  const { profile } = usePermissions();
  const { data: institution } = useInstitution(profile?.institution_id);

  const kind = institution?.institution_kind ?? 'college';
  const labels = INSTITUTION_KIND_LABELS[kind];
  const isSchool = kind === 'school';
  const isCollege = kind === 'college';

  return { kind, labels, isSchool, isCollege };
}
```

### 5.3 Conditional rendering pattern

```tsx
const { labels, isSchool } = useInstitutionKind();

<Label>{labels.program}</Label>  {/* "Program" or "Class" */}
{!isSchool && <DegreeSelector />}  {/* hidden for schools */}
```

### 5.4 Sidebar filter

The production sidebar is defined in `lib/sidebarMenuLink.ts` (2131 lines) which exports a pure function `GetRoleBasedPages(userRole)` consumed by `components/Navbar/menu.tsx` and `components/BottomNav/bottom-navbar.tsx`. It is NOT a React hook and cannot call `useInstitutionKind()` directly.

**Approach**: Export a second pure function from `sidebarMenuLink.ts`:

```ts
export function filterMenuByInstitutionKind(
  groups: MenuGroup[],
  kind: InstitutionKind
): MenuGroup[] {
  const hidden = HIDDEN_SIDEBAR_HREFS[kind];
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

Then in `menu.tsx` / `bottom-navbar.tsx`:

```ts
const { kind } = useInstitutionKind();
const groups = GetRoleBasedPages(userRole);
const visibleGroups = filterMenuByInstitutionKind(groups, kind);
```

**Real hidden routes** (corrected from the insight draft — the folder is `organizations` plural, not `organization`):
- `/organizations/degrees` — top-level, hidden for school
- `/organizations/courses/mappings` — submenu, hidden for school (parent "Courses → Subjects" stays)

`/organizations/departments` is kept visible for schools because they still group teachers (labelled "Wing" in school UI).

## 6. Testing Plan

1. **Migration applies cleanly** on staging (`hhprjbgknupaplivtoib`) without touching existing rows.
2. **Existing colleges still work** — `institution_kind` defaults to `'college'`, all college pages render identically.
3. **Create a test school** via the seed script. Login as a school-scoped user. Verify:
   - Sidebar hides Degrees and Course Mapping
   - "Class 6" appears in the Programs list (labeled "Classes")
   - "Term 1 2026-27" appears in Semesters (labeled "Terms")
   - Subjects appear in Courses (labeled "Subjects")
4. **Browser test** via `/browser-test` skill: screenshot a school view AND a college view side-by-side to confirm the same data model renders two different UIs.

## 7. Rollout

1. Apply migration to **staging** Supabase (`hhprjbgknupaplivtoib`)
2. Build + type-check locally on `ommdev/omm-dev`
3. Browser test both kinds (college and school) on `jkkn.ai/dev` or local
4. Open PR to `Jicate-Solutions/MyJKKN` main for Phase 1
5. After user confirms merge → trigger Vercel deploy hook
6. Apply migration to **production** Supabase only after code is live
7. Seed 2 real JKKN schools via admin panel or seed script
8. User acceptance test on production

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Existing RLS policies assume `institution_type` determines behavior | `institution_kind` is a new column — no existing policy references it. Zero RLS changes in Phase 1. |
| Someone adds a college and forgets to set `institution_kind` | Default is `'college'`. Forgetting = safe. |
| Reports that group by "Program" get mixed "Class 6" and "B.Tech CSE" | Reports already filter by `institution_id`. A report for a school institution will only see its own classes. Cross-institution reports will need an `institution_kind` filter — add in Phase 2 when we have a school reporting requirement. |
| School teachers try to use college-only features (e.g., CGPA calculation) | Sidebar hides those features for school kind. Direct URL access still works — acceptable for Phase 1, will add route guard in Phase 2. |

## 9. Open Questions (to answer during rollout, NOT blocking)

- What are the exact names of the 2 JKKN schools? (Will ask user when seeding.)
- Do schools need a parent-login portal? (Phase 2 — separate spec.)
- Does JKKN want unified reports across schools + colleges? (Probably yes — Phase 2.)

## 10. Success Criteria

✅ Colleges continue working with zero regression
✅ 2 JKKN schools exist as institutions with `institution_kind='school'`
✅ Principal of a school logs in and sees "Class 6 - Section A" instead of "Program - Section A"
✅ A student created under a school institution shows up in the same `students` table (verify via Supabase)
✅ Attendance for a school section uses the same `daily_attendance` table as college sections
✅ Build passes, type-check clean, browser test green on both college and school views

---

**Next step after approval:** Apply migration to staging, write the hook + label map, patch the sidebar, ship Phase 1 PR.
