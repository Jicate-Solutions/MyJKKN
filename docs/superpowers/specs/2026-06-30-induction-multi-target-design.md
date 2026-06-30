# Induction Multi-Institution / Degree / Department Targeting — Design Spec

- **Date:** 2026-06-30
- **Page:** `/events/induction/new` (`app/(routes)/events/induction/new/page.tsx`)
- **Status:** Approved design, pending implementation plan
- **Author:** Boobalan + Claude (brainstormed)

## 1. Goal

Let an induction be targeted at **multiple institutions** combined, optionally
narrowed to **specific degrees** and/or **specific departments**, and have
auto-enrollment include only the matching freshers. Replaces today's single
institution + "this college / all colleges" toggle + "UG/PG" filter with one
coherent multi-select targeting model.

## 2. Confirmed decisions (from Q&A)

| Decision | Choice |
|---|---|
| Targeting model | **Replace** the single-institution + this/all-colleges + UG/PG controls |
| Institutions | **Multi-select, required (≥1)** |
| Degrees | **Specific degrees, multi-select, OPTIONAL** (empty = all); cascades from institutions |
| Departments | **Multi-select, OPTIONAL** (empty = all); cascades from institutions (+ degrees) |
| Filter combination | **AND across dimensions, OR within** a dimension |
| Storage | **Array columns** on `induction_programs` (not junction tables) |
| Existing inductions | **Back-compat by fallback, no backfill** |
| Owning `institution_id` | **= first selected institution** (primary) |

## 3. Data model

Add to `public.induction_programs`:
```sql
ALTER TABLE public.induction_programs
  ADD COLUMN IF NOT EXISTS target_institution_ids uuid[],   -- enrolling institutions (>=1 for new rows)
  ADD COLUMN IF NOT EXISTS target_degree_ids      uuid[],   -- NULL/empty = all degrees
  ADD COLUMN IF NOT EXISTS target_department_ids  uuid[];   -- NULL/empty = all departments
```
- `institution_id` is unchanged and remains the **owning/primary** institution
  (= `target_institution_ids[1]`) — consumed by the polls/pulse features
  (`induction_programs.institution_id`), coordinator scoping, and RLS.
- `enroll_scope` (NOT NULL) and `degree_type_filter` columns **stay** for
  back-compat; the new create flow leaves them at defaults / null and the engine
  ignores them when the target arrays are present.
- IDs are flat sets. Departments are institution-specific UUIDs, so a flat
  `target_department_ids` already expresses per-college choices — no matrix.

## 4. Back-compat (no backfill)

The enrollment engine **prefers the new arrays and falls back to legacy** when
`target_institution_ids IS NULL`:
- New inductions: filter by `target_institution_ids` / `target_degree_ids` /
  `target_department_ids`.
- Existing inductions (arrays NULL): keep the current behavior
  (`institution_id` + `enroll_scope` + `degree_type_filter`).
Zero data migration; old inductions are untouched and re-runnable.

## 5. Enrollment filter (the core change)

In `fn_induction_preview_enroll` (live preview) and `fn_induction_auto_enroll`
(actual enroll), the matched-learners CTE becomes:
```sql
FROM public.learners_profiles lp
JOIN public.admission_years ay ON ay.id = lp.admission_year_id
LEFT JOIN public.degrees d ON d.id = lp.degree_id
WHERE ay.year = p_admission_year
  AND lp.lifecycle_status IN ('reserved','admitted','account')
  AND lp.institution_id = ANY(p_institution_ids)
  AND (p_degree_ids     IS NULL OR cardinality(p_degree_ids)=0     OR lp.degree_id     = ANY(p_degree_ids))
  AND (p_department_ids IS NULL OR cardinality(p_department_ids)=0 OR lp.department_id = ANY(p_department_ids))
```
The preview JSON gains a **`by_department`** breakdown (name + count) alongside
the existing `by_institution` / `by_program` / `sample`.

## 6. RPC signatures (extend; keep old ones working)

- `fn_induction_create_program(…existing…, p_institution_ids uuid[], p_degree_ids uuid[], p_department_ids uuid[])`
  Sets `institution_id = p_institution_ids[1]` and the three arrays. Legacy
  params (`p_institution_id`, `p_enroll_scope`, `p_degree_type_filter`) remain
  accepted for back-compat but the new form sends the arrays.
- `fn_induction_preview_enroll(…existing…, p_institution_ids uuid[], p_degree_ids uuid[], p_department_ids uuid[])`
  New array params (defaulted NULL). When `p_institution_ids` is non-null it
  drives the filter; else legacy behavior. Adds `by_department` to the result.
- `fn_induction_auto_enroll(p_event_id)` — reads the target arrays off the
  program row; legacy fallback when NULL.

**Authorization (all three):** `is_super_admin() OR is_admin()`, OR
`user_has_permission('induction.manage')` AND `role_has_institution_access(x)`
for **every** institution in `p_institution_ids` (not just one). Closes the
multi-tenant gap when a coordinator targets institutions they don't own.

All remain `SECURITY DEFINER SET search_path=public`, anon-locked /
authenticated-granted (matching the existing functions).

## 7. Service (`lib/services/induction/induction-service.ts`)

- `createProgram` input gains `institutionIds: string[]`, `degreeIds?: string[]`,
  `departmentIds?: string[]` (drops `enrollScope` / `degreeTypeFilter` from the
  new call path; passes the arrays to the RPC).
- `previewEnroll` params gain the same three arrays.
- `PreviewEnrollResult` gains `by_department: { department: string; count: number }[]`.

## 8. UI (`/events/induction/new/page.tsx`)

- **Institution** → multi-select (reuse an existing multi-select component if the
  repo has one — search `components/ui` for `multi-select`/`combobox`; else a
  compact checkbox-popover). ≥1 required. Replaces the single dropdown + the
  "this/all colleges" toggle (`enrollScope` state removed).
- **Degrees** → optional multi-select; options fetched for the selected
  institutions (union). Replaces the UG/PG toggle (`degreeTypeFilter` removed).
- **Departments** → optional multi-select; options fetched for the selected
  institutions (+ degrees).
- **Admission year** → `useGroupAdmissionYears` already takes an institution-id
  array; feed it the selected institution set.
- **Preview** and **Create** pass the three arrays; the preview panel renders the
  new `by_department` breakdown.

## 9. Edge cases

- 0 institutions selected → disable Preview/Create ("pick at least one institution").
- A degree/department whose parent institution is later deselected → prune it
  from the selection (cascade reset), so the saved arrays never reference a
  deselected institution.
- Coordinator lacks access to one of the selected institutions → RPC raises
  (authorization §6); the form surfaces the error.
- Empty degree/department arrays must be treated as "all" (NULL or
  `cardinality=0`), never as "match nothing".

## 10. Verification plan

- `mcp__ide__getDiagnostics` per touched TS file (no full `tsc`); rely on the
  PR-scoped TypeCheck CI gate.
- Apply migration; confirm the 3 columns + updated RPC signatures exist.
- Manual: create an induction targeting 2 institutions + 1 degree + 2
  departments; Preview shows the correct matched count + by-department
  breakdown; create; confirm only matching learners are enrolled. Verify an
  existing (pre-change) induction still previews/enrolls via the legacy path.
- Confirm a coordinator without access to a selected institution is rejected.
