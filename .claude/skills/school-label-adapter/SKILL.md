---
name: school-label-adapter
description: Work with MyJKKN's institution-type label adaptation system in lib/utils/school-label-adapter.ts. Use when: (1) adding a UI string that should differ between colleges (default English) and K-12 schools — "Program"→"Class", "Semester"→"Term", "Course"→"Subject", "Department"→"Wing", "Degree"→"Stream"; (2) wiring a component to adaptLabel() or the useInstitutionType hook; (3) implementing conditional rendering that hides/shows fields based on institution type (e.g. hide DegreeSelector for schools); (4) updating the sidebar filterMenuByEntityType hidden routes; (5) adding a new entity_type with its own label set. Also use when any UI text must stay in sync across the college/school label boundary.
---

# School Label Adapter

## Label Map (current — school entity_type only)

All mappings are in [lib/utils/school-label-adapter.ts](lib/utils/school-label-adapter.ts). Colleges get the default English string (no entry needed). Schools remap:

| Default (college) | School |
|---|---|
| Degree / Degrees | Stream / Streams |
| Department / Departments | Wing / Wings |
| Program / Programs | Class / Classes |
| Semester / Semesters | Term / Terms |
| Course / Courses | Subject / Subjects |
| `degree` / `department` / `program` / `semester` / `course` | `stream` / `wing` / `class` / `term` / `subject` |

Strings already in the map:
- **Titles**: `Degrees`, `Degree`, `Departments`, `Department`, `Programs`, `Program`, `Semesters`, `Semester`, `Courses`, `Course`, `Course Mappings`
- **Help text**: `Manage academic degrees/departments/programs/semesters/courses`; `Manage departments and their details`
- **Filters**: `All Degrees/Departments/Programs/Semesters/Courses`
- **Column labels**: `Program ID`, `Program Name`, `Degree ID`, `Degree Name`, `Degree Details`, `Edit Degree`, `New Degree`, `Add a new degree`, `Department ID`, `Department Name`
- **Placeholders**: `Search programs/degrees/departments/semesters/courses...`
- **Count text** (lowercase plural): `degrees`, `programs`, `departments`, `semesters`, `terms`, `courses`

## Adding a New Mapping

Edit the `'school'` block in `lib/utils/school-label-adapter.ts`. Add both case forms when the string appears in UI as both:

```ts
'Faculty': 'Teacher',
'Faculties': 'Teachers',
'faculty': 'teacher',
```

All call sites using `adaptLabel()` or the hook pick it up automatically — no other files change.

## Using adaptLabel() — non-JSX contexts

```ts
import { adaptLabel } from '@/lib/utils/school-label-adapter';
import { useInstitutionType } from '@/hooks/use-institution-type';

const { institutionType } = useInstitutionType();

// column headers, toast messages, breadcrumbs:
const label = adaptLabel('Programs', institutionType); // → "Classes" for school
```

## Using useInstitutionType Hook — React components

```tsx
const { labels, isSchool, institutionType } = useInstitutionType();

// Adapted full UI string:
<Label>{adaptLabel('Programs', institutionType)}</Label>

// Conditional rendering — hide college-only UI:
{!isSchool && <DegreeSelector />}
{!isSchool && <CourseMappingTab />}
```

`labels` is the short-form object (`labels.program`, `labels.semester`, `labels.course`).
Use `labels.xxx` for inline labels within sentences. Use `adaptLabel()` for full standalone strings (page titles, placeholders, help text).

Hook source: `hooks/use-institution-type.ts`; returns `{ entityType, labels, isSchool, isCollege }`.

## Sidebar Hidden Routes

For `entity_type = 'school'`, these hrefs are filtered out by `filterMenuByEntityType` in `lib/sidebarMenuLink.ts`:

- `/organizations/degrees` — top-level menu item
- `/organizations/courses/mappings` — submenu only (parent "Courses → Subjects" stays)

`/organizations/departments` remains visible (school teachers are grouped as Wings).

To hide an additional route for schools: add the href to `HIDDEN_SIDEBAR_HREFS['school']` in `lib/sidebarMenuLink.ts`.

## For structural / data-model work

Read [references/k12-data-model.md](references/k12-data-model.md) when working on:
- How Class 1–12 map onto `programs` / Terms onto `semesters`
- Seeding a new school institution
- Cross-institution report filtering by entity_type
- Adding a new `entity_type` beyond `'school'` and `'institution'`
- Full sidebar filter implementation pattern
