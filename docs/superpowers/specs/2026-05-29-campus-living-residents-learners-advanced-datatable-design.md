# Design — Advanced DataTable + Cascade Filters for the Hostel Residents → Learners tab

**Date:** 2026-05-29
**Route:** `/campus-living/residents` (Learners tab)
**Status:** Approved (pending spec review)

## 1. Problem & Goal

The **Learners** tab on `/campus-living/residents` currently renders a plain
shadcn `<Table>` driven by the `useLearnerHostelites` React Query hook, with a
fixed set of inline filters (search, hostel type, institution, block,
year-of-study, gender) and a hardcoded `pageSize=100`.

**Goal:** Replace it with the shared **advanced `DataTable`**
(`@/components/data-table/data-table`) — the same component the Learners
Profiles module uses — carrying the **academic-cascade advanced filters** from
Learners Profiles (Institution → Degree → Department → Program → Semester →
Section → Academic Year + Gender), **plus** the existing hostel-specific filters
(Hostel type, Block, Year-of-study). Keep per-row detail/edit/remove actions and
add Export.

**Population is unchanged:** only `learners_profiles` rows with
`accommodation_type = 'HOSTEL'`, surfaced through the `v_learner_hostelites`
view. Mutations continue to target `learners_profiles` (view is read-only).

## 2. Approved decisions

| Decision | Choice |
|----------|--------|
| Filter set | Full academic cascade (like Profiles) **+** keep hostel-type / block / year filters |
| Toolbar actions | Keep current per-row actions (detail drawer, edit, remove) + **Export**. No bulk row-selection/delete. |
| Display columns | Keep current (Roll, Name, Email, Hostel, Institution, Gender) **+ add Program + Block** |
| Quick search | Use the DataTable's **built-in toolbar search** (replaces the standalone search box) |

## 3. Architecture — four layers move together

### Layer 1 — Database: extend `v_learner_hostelites` (migration)

The view today exposes none of the cascade FKs and no program/block display
names. All six FKs exist on `learners_profiles` (verified). `CREATE OR REPLACE
VIEW` to add:

- **Filter FKs:** `degree_id`, `department_id`, `program_id`, `semester_id`,
  `section_id`, `academic_year_id` (passthrough from `lp.*`).
- **Display names:** `program_name` (LEFT JOIN `programs`),
  `current_block_name` + `current_block_code` (LEFT JOIN `hostel_blocks` on the
  already-joined `ha.block_id`).

Untouched: the `WHERE lp.accommodation_type = 'HOSTEL'` clause, the existing
`admission_years` / `batches` joins, the computed `year_of_study` /
`year_source`, and the active-allocation LEFT JOIN. No new RLS (views inherit
base-table RLS; all joined tables already have policies).

Mirror the final view body into `supabase/setup/05_views.sql`. Commit the real
SQL body to `supabase/migrations/` (no `SELECT 1;` placeholder).

**Migration file:** `supabase/migrations/20260529_extend_v_learner_hostelites_cascade.sql`

Sketch of the added select-list items (exact list finalized in the plan):

```sql
CREATE OR REPLACE VIEW public.v_learner_hostelites AS
SELECT
  lp.id, lp.first_name, lp.last_name, lp.roll_number,
  lp.student_email, lp.college_email, lp.gender, lp.institution_id,
  lp.accommodation_type, lp.hostel_type, lp.hostel_fee, lp.dayscholar_fee,
  lp.father_name, lp.mother_name, lp.admission_year_id,
  -- NEW: cascade FKs for filter pushdown
  lp.degree_id, lp.department_id, lp.program_id,
  lp.semester_id, lp.section_id, lp.academic_year_id,
  -- NEW: display names
  pr.program_name,
  ay.program_start_year, ay.program_end_year,
  <existing year_of_study CASE …> AS year_of_study,
  ha.block_id   AS current_block_id,
  ha.room_id    AS current_room_id,
  ha.bed_id     AS current_bed_id,
  ha.id         AS current_allocation_id,
  hb.name       AS current_block_name,   -- NEW
  hb.code       AS current_block_code,   -- NEW
  <existing year_source CASE …> AS year_source
FROM learners_profiles lp
  LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN batches b          ON b.id  = lp.batch_id
  LEFT JOIN programs pr        ON pr.id = lp.program_id           -- NEW
  LEFT JOIN hostel_allocations ha ON ha.learner_id = lp.id
                                  AND ha.status = 'active'::allocation_status_enum
  LEFT JOIN hostel_blocks hb   ON hb.id = ha.block_id             -- NEW
WHERE lp.accommodation_type = 'HOSTEL'::text;
```

> Note: confirm the program-name column is `programs.program_name` during the
> plan (consistent with `ProgramService` usage). Use LEFT JOINs only — an
> `!inner`-style join would silently drop hostelites with null FKs.

### Layer 2 — Service: `LearnerHosteliteService.listHostelites`

File: `lib/services/campus-living/learner-hostelite-service.ts`

- Add the new view columns to `VIEW_SELECT`: the 6 cascade FKs, `program_name`,
  `current_block_name`, `current_block_code`.
- Add `.eq()` filter pushdown for `degree_id`, `department_id`, `program_id`,
  `semester_id`, `section_id`, `academic_year_id` (each guarded by presence).
- Keep existing pushdown for `hostel_type`, `year_of_study`, `gender` (ilike),
  `block_id` (incl. `UNASSIGNED_BLOCK` → `.is('current_block_id', null)`), and
  `search` (`.or()` over roll/name/email).
- Thread `sortBy` / `sortOrder` (default `roll_number` asc) in addition to the
  existing `page` / `pageSize`. Keep the `{ data, count }` return; the UI
  closure maps it to the DataTable's `{ success, data, pagination }`.

### Layer 3 — Types: `types/campus-living.ts`

- Extend `LearnerHostelitesFilters` with: `degree_id?`, `department_id?`,
  `program_id?`, `semester_id?`, `section_id?`, `academic_year_id?`,
  `sortBy?`, `sortOrder?: 'asc'|'desc'`.
- Extend `LearnerHostelite` with: the 6 cascade FKs, `program_name?`,
  `current_block_name?`, `current_block_code?`.

### Layer 4 — UI (`app/(routes)/campus-living/residents/_components/`)

**`learners-columns.tsx`** (new) — factory
`getLearnerColumns({ canEdit, isSuperAdmin, instName, onView, onEdit, onRemove }): ColumnDef<LearnerHostelite>[]`:
Roll · Name (button → `onView`) · Email · Hostel (badge) · **Program**
(`program_name`) · **Block** (`current_block_name`/code, "Unassigned" when null)
· Institution (super-admin only) · Gender · Actions (View / Edit (gated) /
Remove). No `select` checkbox column.

**`learners-filters.tsx`** (new) — collapsible **Advanced Filters** panel modeled
on `profiles-filters.tsx`:
- Academic cascade with child-reset handlers (Institution → Degree → Department
  → Program → Semester → Section → Academic Year) + Gender.
- **Plus** Hostel type, Block (with "Unassigned" sentinel), Year-of-study (chips
  or select using `listAvailableYears`).
- Institution scope via `useInstitutionsWithAccess` + `canSelectAcrossInstitutions`
  (NOT `isSuperAdmin`) — non-multi-institution users get their institution
  auto-selected & locked.
- Applies via a **Search** button that writes URL params (and resets `page=1`);
  a **Clear All Filters** button. Cascade option lists fetched from
  `DegreeService` / `DepartmentService` / `ProgramService` / `SemesterService` /
  `SectionService` / `AcademicYearService` and `useHostelBlocksForFilter`.

**`learners-tab.tsx`** (rewrite) — renders `<LearnersFilters>` + `<DataTable>`:
- `fetchData(params)` reads filter params via `useSearchParams()`, merges with
  the DataTable's `{ page, limit, search, sort_by, sort_order }`, calls
  `LearnerHosteliteService.listHostelites(effectiveInstitutionId, mergedFilters,
  params.page, params.limit)`, returns `DataFetchResult`.
  The closure must capture the URL filter params so its identity changes when
  they change → DataTable refetches (deps include `fetchDataFn` at
  `data-table.tsx:415`).
- `DataTable` config: `enableUrlState: true`, `enableRowSelection: false`,
  `enableExport: false` (custom button), `idField: 'id'`.
- `renderToolbarContent` → Export button (CSV/XLSX; reuse existing export
  utility or a small dialog).
- Keep existing drawers/dialogs (`LearnerDetailDrawer`, `EditHosteliteDrawer`,
  `RemoveHosteliteDialog`, `AddLearnerToHostelDialog`) wired via column handlers
  + local state. "Add Learner to Hostel" button stays above the table.

## 4. Data flow

```
LearnersFilters ──writes URL params──▶ URL (?institution_id=&program_id=&…)
       ▲                                   │
  user clicks Search                       │ useSearchParams()
                                           ▼
                                   learners-tab.tsx
                                           │ builds fetchData closure (captures filter params)
                                           ▼
DataTable (owns page/pageSize/search/sort via its toolbar + URL)
   └─ on [page,pageSize,search,sort,fetchDataFn] change ──▶ fetchData()
        └─ LearnerHosteliteService.listHostelites(instId, mergedFilters, page, limit)
             └─ supabase.from('v_learner_hostelites')  (+ .eq cascade pushdown)
```

## 5. Scope boundaries (YAGNI)

- No bulk row-selection / bulk delete.
- Non-learners tab untouched.
- Mutations unchanged (still `learners_profiles`).
- No new permission keys — reuse `campus_living.residents.edit`.

## 6. Risks & guards

- **LEFT JOINs only** in the view — null `program_id` / no active allocation must
  not drop the learner row.
- **Year-of-study** is a computed view column; keep its existing `.eq` pushdown.
- **Block "Unassigned"** sentinel (`current_block_id IS NULL`) preserved.
- **Gender** casing drift handled by `.ilike` (existing behavior).
- **Built-in search** must hit the same roll/name/email `.or()` so results match
  today's behavior.
- **No regressions for other `useLearnerHostelites` consumers** (allocations/new,
  gate-passes/new) — they call `listHostelites` with the same or fewer args;
  new params are optional/additive.

## 7. Verification

- `mcp__ide__getDiagnostics` clean on every touched TS/TSX file.
- View change applied via `apply_migration`; real SQL committed to
  `supabase/migrations/` + mirrored to `supabase/setup/05_views.sql`.
- Manual browser check as a non-super-admin warden role: Learners tab loads,
  cascade + hostel filters narrow correctly, Program/Block columns render
  (incl. "Unassigned"), detail/edit/remove + Export work, pagination/sort work.
- Confirm `/campus-living/allocations/new` and `/campus-living/gate-passes/new`
  still load hostelites (shared service).

## 8. Affected files

| File | Change |
|------|--------|
| `supabase/migrations/20260529_extend_v_learner_hostelites_cascade.sql` | new — view extension |
| `supabase/setup/05_views.sql` | mirror new view body |
| `lib/services/campus-living/learner-hostelite-service.ts` | new filters + select cols + sort |
| `types/campus-living.ts` | extend `LearnerHostelitesFilters` + `LearnerHostelite` |
| `app/(routes)/campus-living/residents/_components/learners-columns.tsx` | new — column factory |
| `app/(routes)/campus-living/residents/_components/learners-filters.tsx` | new — cascade + hostel filter panel |
| `app/(routes)/campus-living/residents/_components/learners-tab.tsx` | rewrite to DataTable |
| `app/(routes)/campus-living/residents/_hooks/use-residents-filter-url.ts` | adjust/retire if superseded by URL-param filters |
