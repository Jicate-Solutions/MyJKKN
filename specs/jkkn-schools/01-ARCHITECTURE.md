# 01 — Architecture: Why This Is One Column

## The insight in one paragraph

A K-12 school is not a new entity — it is a **degenerate case of the college hierarchy** that MyJKKN already models. Every existing table (`degrees`, `departments`, `programs`, `semesters`, `sections`, `courses`, `course_mapping`, `students`) is structurally generic; only the column *names* borrow higher-ed vocabulary. A school fits the exact same tree with different node values:

| MyJKKN table | College value | School value |
|---|---|---|
| `institutions` | "JKKN College of Engineering" | "JKKN Matriculation Higher Secondary School" |
| `degrees` | "B.Tech", "M.Tech" | **"K-12 Program" (one virtual degree per school)** |
| `departments` | "CSE", "Mechanical" | **"Academic" (one virtual department per school)** |
| `programs` | "B.Tech CSE", "B.Tech Mech" | **"Class 1" … "Class 12"** |
| `semesters` | "Semester 1", "Semester 2" | **"Term 1 2026-27", "Term 2 2026-27", "Term 3 2026-27"** |
| `sections` | "A", "B", "C" | "A", "B", "C" (unchanged) |
| `courses` | "Data Structures", "Thermodynamics" | **"Mathematics", "Tamil", "Science"** |
| `course_mapping` | Course ↔ Program/Semester | Subject ↔ Class/Term |
| `students` | `{ program_id, semester_id, section_id }` | `{ program_id=ClassN, semester_id=TermN, section_id }` |
| `daily_attendance` | unchanged | unchanged |
| `billing_invoices` | unchanged | unchanged |

## What this buys us

- **Zero new tables.** The admission CRM, billing, attendance, staff, transport, hostel, library, notifications, and bug reporter all work on schools for free.
- **Zero RLS changes.** All existing policies already scope by `institution_id`. A school's data is naturally isolated from a college's data.
- **Zero backend migrations beyond one column.** No triggers to rewrite, no views to refactor, no service methods to overload.
- **A single switch point in the UI.** One hook (`useInstitutionKind`) reads the column once per session and returns the right label dictionary. Everything else is presentation.

## What changes

**Only the UI.** Specifically three things:

1. **Label words.** "Program" becomes "Class", "Semester" becomes "Term", "Course" becomes "Subject" — but only on pages rendered for a school-scoped user.
2. **Hidden sidebar items.** `/organizations/degrees` and `/organizations/courses/mappings` are hidden for schools because the virtual K-12 degree and auto-generated subject-to-class mappings are managed behind the scenes.
3. **Auto-filled hidden form fields.** When a school admin creates a new student, the `degree_id` and `department_id` form fields don't render — they're auto-populated to the virtual "K-12 Program" degree and "Academic" department for that school. (Phase 1 ships labels + sidebar filter; auto-fill is a sub-task of the Organization module polish.)

## What is explicitly NOT changing in Phase 1

- Grading scale (A-E vs percentage) — schools accept numeric percentages for now
- Parent portal — separate Phase 2 spec
- School-specific fee heads — use existing billing with different fee-head names
- Class-teacher / subject-teacher role distinction — use existing staff roles
- School admissions flow — use existing admission CRM with a different template
- Cross-institution reports that group schools + colleges — needs a Phase 2 filter

## Why this is safe

1. The new column has a default of `'college'` and a CHECK constraint. Every existing row stays exactly where it was. Every existing code path that doesn't know about `institution_kind` keeps working because the default is the pre-existing behavior.
2. The hook has a safe fallback: if the column doesn't exist yet (e.g., during the window between code deploy and migration apply), it reads `null`, coerces to `'college'`, and returns college labels. There is no crash path.
3. The sidebar filter is an identity function for `kind === 'college'` — zero performance or behavioral impact on colleges.

## The one thing that could go wrong

A cross-institution report or aggregation query that groups by `program_id` without filtering by `institution_id` would mix "Class 6" rows with "B.Tech CSE" rows in the same bucket. **This does not exist today** (all existing reports scope by institution), but if someone writes such a report in Phase 2, they'll need an `institution_kind` filter. Documented in the spec's Risks section.

## Why `institution_kind` and not `institution_type`

Both columns now exist on the `institutions` table. They mean different things:

- `institution_type` (existing): accreditation classification — values `autonomous`, `self`, `aided`
- `institution_kind` (new): education level — values `college`, `school`

Do not merge, alias, or rename these. They are orthogonal dimensions and both will be queried independently.
