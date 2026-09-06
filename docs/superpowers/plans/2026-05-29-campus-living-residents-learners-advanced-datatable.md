# Hostel Residents → Learners tab: Advanced DataTable + Cascade Filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain `<Table>` on the `/campus-living/residents` Learners tab with the shared advanced `DataTable`, carrying the Learners-Profiles academic cascade filters (Institution → Degree → Department → Program → Semester → Section → Academic Year + Gender) plus the existing hostel filters (Hostel type, Block, Year), with Program + Block display columns, per-row detail/edit/remove actions, built-in search, and Export.

**Architecture:** Additive at every layer. The `v_learner_hostelites` view gains cascade FK columns + program/block display names (LEFT JOINs only). `LearnerHosteliteService.listHostelites` gains optional filter pushdown + sort. A new collapsible filter panel writes URL params; the tab reads them via `useSearchParams` and rebuilds the `fetchData` closure so the `DataTable` refetches (its effect depends on `fetchDataFn`).

**Tech Stack:** Next.js 16 (App Router, client component), React 19, Supabase (Postgres view + RLS), TanStack Table via `@/components/data-table/data-table`, Shadcn UI, TanStack Query (existing hooks reused for option lists).

> **Repo verification note (overrides skill's TDD/pytest steps):** This repo has **no test runner** (see `CLAUDE.md`). "Verify" means: run `mcp__ide__getDiagnostics` on each touched TS/TSX file (expect `[]`), run the SQL verification queries shown, and do the manual browser check in the final task. Do **not** write or run pytest/jest. Commit specific files only.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260529_extend_v_learner_hostelites_cascade.sql` | View extension (cascade FKs + program/block names) |
| `supabase/setup/05_views.sql` | Mirror of the new view body |
| `types/campus-living.ts` | Extend `LearnerHostelite` + `LearnerHostelitesFilters` |
| `lib/services/campus-living/learner-hostelite-service.ts` | New select columns, filter pushdown, sort |
| `app/(routes)/campus-living/residents/_components/learners-columns.tsx` | NEW — column factory |
| `app/(routes)/campus-living/residents/_components/learners-filters.tsx` | NEW — cascade + hostel filter panel |
| `app/(routes)/campus-living/residents/_components/learners-tab.tsx` | Rewrite to use `DataTable` |

---

## Task 1: Extend the `v_learner_hostelites` view (migration)

**Files:**
- Create: `supabase/migrations/20260529_extend_v_learner_hostelites_cascade.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 20260529_extend_v_learner_hostelites_cascade.sql
-- Extends v_learner_hostelites for the Hostel Residents → Learners advanced
-- DataTable: adds cascade FK columns (degree/department/program/semester/
-- section/academic_year) for filter pushdown, plus program_name and the
-- current block's name/code for display columns. LEFT JOINs only — no
-- hostelite row may be dropped by a null FK or missing active allocation.

CREATE OR REPLACE VIEW public.v_learner_hostelites AS
SELECT
  lp.id,
  lp.first_name,
  lp.last_name,
  lp.roll_number,
  lp.student_email,
  lp.college_email,
  lp.gender,
  lp.institution_id,
  lp.accommodation_type,
  lp.hostel_type,
  lp.hostel_fee,
  lp.dayscholar_fee,
  lp.father_name,
  lp.mother_name,
  lp.admission_year_id,
  -- NEW: cascade FKs for filter pushdown
  lp.degree_id,
  lp.department_id,
  lp.program_id,
  lp.semester_id,
  lp.section_id,
  lp.academic_year_id,
  -- NEW: display name
  pr.program_name,
  ay.program_start_year,
  ay.program_end_year,
  CASE
    WHEN lp.admission_year_id IS NOT NULL AND ay.program_start_year IS NOT NULL
      THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - ay.program_start_year + 1, ay.program_end_year - ay.program_start_year + 1))
    WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL
      THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM b.start_date)::integer + 1, EXTRACT(year FROM b.end_date)::integer - EXTRACT(year FROM b.start_date)::integer + 1))
    WHEN lp.enquiry_date IS NOT NULL
      THEN GREATEST(1, EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM lp.enquiry_date)::integer + 1)
    ELSE NULL::integer
  END AS year_of_study,
  ha.block_id AS current_block_id,
  ha.room_id AS current_room_id,
  ha.bed_id AS current_bed_id,
  ha.id AS current_allocation_id,
  -- NEW: display names for the current active allocation's block
  hb.name AS current_block_name,
  hb.code AS current_block_code,
  CASE
    WHEN lp.admission_year_id IS NOT NULL AND ay.program_start_year IS NOT NULL THEN 'admission_year'::text
    WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN 'batch'::text
    WHEN lp.enquiry_date IS NOT NULL THEN 'enquiry'::text
    ELSE NULL::text
  END AS year_source
FROM learners_profiles lp
  LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN batches b ON b.id = lp.batch_id
  LEFT JOIN programs pr ON pr.id = lp.program_id
  LEFT JOIN hostel_allocations ha ON ha.learner_id = lp.id
    AND ha.status = 'active'::allocation_status_enum
  LEFT JOIN hostel_blocks hb ON hb.id = ha.block_id
WHERE lp.accommodation_type = 'HOSTEL'::text;
```

- [ ] **Step 2: Confirm the program-name column before applying**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='programs'
  AND column_name IN ('program_name','name') ORDER BY column_name;
```
Expected: `program_name`. If only `name` exists, change `pr.program_name` →
`pr.name AS program_name` in the migration before applying.

- [ ] **Step 3: Apply the migration**

Apply via `mcp__supabase__apply_migration` with name
`extend_v_learner_hostelites_cascade` and the exact SQL body from Step 1.

- [ ] **Step 4: Verify the view exposes the new columns and drops no rows**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT degree_id, department_id, program_id, semester_id, section_id,
       academic_year_id, program_name, current_block_name, current_block_code
FROM v_learner_hostelites LIMIT 1;

SELECT count(*) AS hostelites FROM v_learner_hostelites;          -- expect 881
SELECT count(*) AS base FROM learners_profiles
WHERE accommodation_type='HOSTEL';                                -- must equal above
```
Expected: first query returns the 9 new columns (values may be null); the two
counts are **equal** (881) — proving the new LEFT JOINs dropped nothing.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260529_extend_v_learner_hostelites_cascade.sql
git commit -m "feat(campus-living): extend v_learner_hostelites with cascade FKs + program/block names"
```

---

## Task 2: Mirror the view body into the setup reference file

**Files:**
- Modify: `supabase/setup/05_views.sql`

- [ ] **Step 1: Locate the existing `v_learner_hostelites` definition**

Run: `grep -n "v_learner_hostelites" supabase/setup/05_views.sql`
Expected: a line with `CREATE OR REPLACE VIEW ... v_learner_hostelites`. If
absent, append the new block at the end of the file under a comment header.

- [ ] **Step 2: Replace (or append) the view body**

Replace the existing `v_learner_hostelites` `CREATE OR REPLACE VIEW … ;` block
with the **exact SQL body from Task 1 Step 1** (including the `CREATE OR REPLACE
VIEW public.v_learner_hostelites AS` line through the terminating `;`).

- [ ] **Step 3: Verify no diagnostics / no accidental edits elsewhere**

Run: `git diff --stat supabase/setup/05_views.sql`
Expected: only `05_views.sql` changed; the diff touches only the
`v_learner_hostelites` block.

- [ ] **Step 4: Commit**

```bash
git add supabase/setup/05_views.sql
git commit -m "chore(campus-living): mirror extended v_learner_hostelites into setup reference"
```

---

## Task 3: Extend the types

**Files:**
- Modify: `types/campus-living.ts` (`LearnerHostelite` ~139-165, `LearnerHostelitesFilters` ~172-180)

- [ ] **Step 1: Add the new columns to `LearnerHostelite`**

In `types/campus-living.ts`, inside `interface LearnerHostelite`, after the
existing `program_id: string | null;` line (155), add:

```typescript
  // Cascade FKs surfaced from v_learner_hostelites (advanced filters).
  degree_id?: string | null;
  semester_id?: string | null;
  section_id?: string | null;
  academic_year_id?: string | null;
  // Display names surfaced from v_learner_hostelites.
  program_name?: string | null;
  current_block_name?: string | null;
  current_block_code?: string | null;
```

- [ ] **Step 2: Add the new filter fields to `LearnerHostelitesFilters`**

Replace the body of `interface LearnerHostelitesFilters` with:

```typescript
export interface LearnerHostelitesFilters {
  institution_id?: string;
  hostel_type?: LearnerHostelType;
  search?: string;  // matches roll_number OR first_name OR last_name OR email
  // BUG-003325: year + gender + block filters via v_learner_hostelites view
  year_of_study?: number;
  gender?: 'Male' | 'Female' | 'Other';
  block_id?: BlockFilterValue;
  // Academic cascade filters (parity with Learners Profiles).
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
  // Sort (driven by the advanced DataTable column headers).
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
```

- [ ] **Step 3: Verify types**

Run `mcp__ide__getDiagnostics` on `types/campus-living.ts`.
Expected: `[]` (no errors).

- [ ] **Step 4: Commit**

```bash
git add types/campus-living.ts
git commit -m "feat(campus-living): extend LearnerHostelite + filters with cascade fields"
```

---

## Task 4: Extend `LearnerHosteliteService.listHostelites`

**Files:**
- Modify: `lib/services/campus-living/learner-hostelite-service.ts` (`VIEW_SELECT` ~27-48, `listHostelites` ~81-152)

- [ ] **Step 1: Add the new columns to `VIEW_SELECT`**

Replace the `VIEW_SELECT` array (lines ~27-48) with:

```typescript
const VIEW_SELECT = [
  'id',
  'first_name',
  'last_name',
  'student_email',
  'college_email',
  'roll_number',
  'gender',
  'father_name',
  'mother_name',
  'accommodation_type',
  'hostel_type',
  'hostel_fee',
  'dayscholar_fee',
  'institution_id',
  'admission_year_id',
  'year_of_study',
  'current_block_id',
  'current_room_id',
  'current_bed_id',
  'current_allocation_id',
  // Advanced-table additions
  'degree_id',
  'department_id',
  'program_id',
  'semester_id',
  'section_id',
  'academic_year_id',
  'program_name',
  'current_block_name',
  'current_block_code',
].join(',');
```

- [ ] **Step 2: Add cascade filter pushdown**

In `listHostelites`, immediately after the existing `block_id` filter block
(after line ~126, before the `if (filters?.search)` block), insert:

```typescript
      // Academic cascade filters (parity with Learners Profiles).
      if (filters?.degree_id) query = query.eq('degree_id', filters.degree_id);
      if (filters?.department_id) query = query.eq('department_id', filters.department_id);
      if (filters?.program_id) query = query.eq('program_id', filters.program_id);
      if (filters?.semester_id) query = query.eq('semester_id', filters.semester_id);
      if (filters?.section_id) query = query.eq('section_id', filters.section_id);
      if (filters?.academic_year_id) query = query.eq('academic_year_id', filters.academic_year_id);
```

- [ ] **Step 3: Add whitelisted sort, replacing the fixed order**

Replace the ordering/range block (lines ~137-141, the
`const from = …; query = query.order('roll_number', …).range(…)`) with:

```typescript
      const SORTABLE = new Set([
        'roll_number',
        'first_name',
        'last_name',
        'program_name',
        'current_block_name',
        'gender',
      ]);
      const sortColumn = filters?.sortBy && SORTABLE.has(filters.sortBy)
        ? filters.sortBy
        : 'roll_number';
      const ascending = (filters?.sortOrder ?? 'asc') === 'asc';

      const from = (page - 1) * pageSize;
      query = query
        .order(sortColumn, { ascending })
        .range(from, from + pageSize - 1);
```

- [ ] **Step 4: Verify types**

Run `mcp__ide__getDiagnostics` on
`lib/services/campus-living/learner-hostelite-service.ts`.
Expected: `[]`.

- [ ] **Step 5: Sanity-check pushdown against live data**

Run via `mcp__supabase__execute_sql` (pick any real program_id from the view):
```sql
SELECT program_id, count(*) FROM v_learner_hostelites
GROUP BY program_id ORDER BY count DESC LIMIT 3;
```
Expected: a non-empty grouping — confirms `program_id` is a real, filterable
column. (No code change; this verifies the filter target exists.)

- [ ] **Step 6: Commit**

```bash
git add lib/services/campus-living/learner-hostelite-service.ts
git commit -m "feat(campus-living): cascade filter pushdown + sort in listHostelites"
```

---

## Task 5: Column factory `learners-columns.tsx`

**Files:**
- Create: `app/(routes)/campus-living/residents/_components/learners-columns.tsx`

- [ ] **Step 1: Write the column factory**

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Eye } from 'lucide-react';
import type { LearnerHostelite } from '@/types/campus-living';

function fullName(l: LearnerHostelite): string {
  const parts = [l.first_name, l.last_name].filter(Boolean).map((s) => s!.trim());
  return parts.join(' ') || '(unnamed)';
}

function hostelBadge(type: LearnerHostelite['hostel_type']) {
  if (!type) return <Badge variant='outline'>Not set</Badge>;
  const label = type === 'AC HOSTEL' ? 'AC' : 'Non-AC';
  const variant = type === 'AC HOSTEL' ? 'default' : 'secondary';
  return <Badge variant={variant}>{label}</Badge>;
}

export interface LearnerColumnHandlers {
  canEdit: boolean;
  isSuperAdmin: boolean;
  instName: (id: string) => string;
  onView: (learner: LearnerHostelite) => void;
  onEdit: (learner: LearnerHostelite) => void;
  onRemove: (learner: LearnerHostelite) => void;
}

export function getLearnerColumns(
  h: LearnerColumnHandlers,
): ColumnDef<LearnerHostelite>[] {
  const cols: ColumnDef<LearnerHostelite>[] = [
    {
      accessorKey: 'roll_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Roll' />,
      cell: ({ row }) => (
        <span className='font-mono text-xs'>{row.original.roll_number ?? '—'}</span>
      ),
      size: 120,
    },
    {
      accessorKey: 'first_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
      cell: ({ row }) => (
        <button
          type='button'
          onClick={() => h.onView(row.original)}
          className='font-medium text-primary hover:underline text-left'
        >
          {fullName(row.original)}
        </button>
      ),
      size: 200,
    },
    {
      id: 'email',
      accessorFn: (r) => r.student_email ?? r.college_email ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Email' />,
      cell: ({ row }) => (
        <span className='text-xs text-muted-foreground'>
          {row.original.student_email ?? row.original.college_email ?? '—'}
        </span>
      ),
      enableSorting: false,
      size: 240,
    },
    {
      accessorKey: 'hostel_type',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Hostel' />,
      cell: ({ row }) => hostelBadge(row.original.hostel_type),
      enableSorting: false,
      size: 110,
    },
    {
      accessorKey: 'program_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Program' />,
      cell: ({ row }) => (
        <span className='text-sm'>{row.original.program_name ?? 'Not specified'}</span>
      ),
      size: 180,
    },
    {
      accessorKey: 'current_block_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Block' />,
      cell: ({ row }) => {
        const name = row.original.current_block_name;
        if (!name) return <Badge variant='outline'>Unassigned</Badge>;
        const code = row.original.current_block_code;
        return <span className='text-sm'>{name}{code ? ` (${code})` : ''}</span>;
      },
      size: 160,
    },
  ];

  if (h.isSuperAdmin) {
    cols.push({
      id: 'institution',
      accessorFn: (r) => r.institution_id,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Institution' />,
      cell: ({ row }) => (
        <span className='text-xs text-muted-foreground'>
          {h.instName(row.original.institution_id)}
        </span>
      ),
      enableSorting: false,
      size: 200,
    });
  }

  cols.push(
    {
      accessorKey: 'gender',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Gender' />,
      cell: ({ row }) => (
        <span className='text-xs capitalize'>{row.original.gender?.toLowerCase() ?? '—'}</span>
      ),
      size: 90,
    },
    {
      id: 'actions',
      header: () => <span className='sr-only'>Actions</span>,
      cell: ({ row }) => (
        <div className='flex justify-end gap-1'>
          <Button variant='ghost' size='sm' onClick={() => h.onView(row.original)} title='View details'>
            <Eye className='h-4 w-4' />
          </Button>
          {h.canEdit && (
            <Button variant='ghost' size='sm' onClick={() => h.onEdit(row.original)} title='Edit hostel details'>
              <Pencil className='h-4 w-4' />
            </Button>
          )}
          <Button
            variant='ghost'
            size='sm'
            onClick={() => h.onRemove(row.original)}
            title='Remove from hostel (mark as day scholar)'
          >
            <Trash2 className='h-4 w-4 text-destructive' />
          </Button>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 120,
    },
  );

  return cols;
}
```

- [ ] **Step 2: Verify the column-header import path exists**

Run: `ls app/(routes)/../../components/data-table/column-header.tsx` — or simply
confirm via the existing import in `learners/profiles/_components/columns.tsx:5`
(`@/components/data-table/column-header`). If the path differs, match that file.

- [ ] **Step 3: Verify types**

Run `mcp__ide__getDiagnostics` on `learners-columns.tsx`.
Expected: `[]`.

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/campus-living/residents/_components/learners-columns.tsx"
git commit -m "feat(campus-living): learner hostelite column factory for advanced table"
```

---

## Task 6: Advanced filter panel `learners-filters.tsx`

**Files:**
- Create: `app/(routes)/campus-living/residents/_components/learners-filters.tsx`

This mirrors `learners/profiles/_components/profiles-filters.tsx` (cascade +
child-reset + Search button writing URL params) and adds Hostel type / Block /
Year. URL param keys: `institution_id, degree_id, department_id, program_id,
semester_id, section_id, academic_year_id, gender, hostel_type, block_id,
year_of_study`. The Search button also resets `page=1`.

- [ ] **Step 1: Write the filter panel**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { RotateCcw, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import {
  useHostelBlocksForFilter, useAvailableYears,
} from '@/hooks/campus-living/use-learner-hostelites';
import { UNASSIGNED_BLOCK } from '@/types/campus-living';

const FILTER_KEYS = [
  'institution_id', 'degree_id', 'department_id', 'program_id',
  'semester_id', 'section_id', 'academic_year_id', 'gender',
  'hostel_type', 'block_id', 'year_of_study',
] as const;

type LocalFilters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

export function LearnersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin } = usePermissions();
  const { profile } = useAuth();
  const { institutions, loading: loadingInstitutions } = useInstitutionsWithAccess();

  const canSelectAcrossInstitutions = isSuperAdmin || institutions.length > 1;
  const singleInstitutionId =
    !isSuperAdmin && institutions.length === 1 ? institutions[0].id : undefined;

  const [open, setOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const readParam = (k: string) => searchParams.get(k) ?? undefined;
  const [local, setLocal] = useState<LocalFilters>(() =>
    Object.fromEntries(FILTER_KEYS.map((k) => [k, readParam(k)])) as LocalFilters,
  );

  // Option lists
  const [degrees, setDegrees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const effectiveInst = isSuperAdmin ? local.institution_id : (profile?.institution_id ?? undefined);
  const { data: blockList } = useHostelBlocksForFilter(effectiveInst);
  const { data: availableYears } = useAvailableYears(effectiveInst);

  // Sync local state when the URL changes externally.
  useEffect(() => {
    setLocal(Object.fromEntries(FILTER_KEYS.map((k) => [k, readParam(k)])) as LocalFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Auto-select & lock the single accessible institution.
  useEffect(() => {
    if (singleInstitutionId && !local.institution_id) {
      setLocal((p) => ({ ...p, institution_id: singleInstitutionId }));
    }
  }, [singleInstitutionId, local.institution_id]);

  // Cascade option fetches (mirror profiles-filters.tsx).
  useEffect(() => {
    if (!local.institution_id) { setDegrees([]); return; }
    DegreeService.getDegrees({ institution_id: local.institution_id, page: 1, limit: 1000, isActive: true })
      .then((r) => setDegrees(r.data || [])).catch(() => setDegrees([]));
  }, [local.institution_id]);

  useEffect(() => {
    if (!local.degree_id || !local.institution_id) { setDepartments([]); return; }
    DepartmentService.getDepartments({ institution_id: local.institution_id, degree_id: local.degree_id, page: 1, limit: 1000, isActive: true })
      .then((r) => setDepartments(r.data || [])).catch(() => setDepartments([]));
  }, [local.degree_id, local.institution_id]);

  useEffect(() => {
    if (!local.degree_id || !local.department_id) { setPrograms([]); return; }
    ProgramService.getPrograms({ degree_id: local.degree_id, department_id: local.department_id, page: 1, limit: 1000, isActive: true })
      .then((r) => setPrograms(r.data || [])).catch(() => setPrograms([]));
  }, [local.degree_id, local.department_id]);

  useEffect(() => {
    if (!local.program_id) { setSemesters([]); return; }
    SemesterService.getSemestersByProgram(local.program_id)
      .then((r) => setSemesters(r || [])).catch(() => setSemesters([]));
  }, [local.program_id]);

  useEffect(() => {
    if (!local.semester_id) { setSections([]); return; }
    SectionService.getSections({ semester_id: local.semester_id, page: 1, limit: 1000, isActive: true })
      .then((r) => setSections(r.data || [])).catch(() => setSections([]));
  }, [local.semester_id]);

  useEffect(() => {
    if (!local.institution_id) { setAcademicYears([]); return; }
    AcademicYearService.getAcademicYearsByInstitution(local.institution_id)
      .then((r) => setAcademicYears(r || [])).catch(() => setAcademicYears([]));
  }, [local.institution_id]);

  // Child-reset setters
  const set = (patch: LocalFilters) => setLocal((p) => ({ ...p, ...patch }));
  const onInstitution = (v: string) => set({ institution_id: v === 'all' ? undefined : v, degree_id: undefined, department_id: undefined, program_id: undefined, semester_id: undefined, section_id: undefined, academic_year_id: undefined });
  const onDegree = (v: string) => set({ degree_id: v === 'all' ? undefined : v, department_id: undefined, program_id: undefined, semester_id: undefined, section_id: undefined });
  const onDepartment = (v: string) => set({ department_id: v === 'all' ? undefined : v, program_id: undefined, semester_id: undefined, section_id: undefined });
  const onProgram = (v: string) => set({ program_id: v === 'all' ? undefined : v, semester_id: undefined, section_id: undefined });
  const onSemester = (v: string) => set({ semester_id: v === 'all' ? undefined : v, section_id: undefined });
  const onSection = (v: string) => set({ section_id: v === 'all' ? undefined : v });
  const onAcademicYear = (v: string) => set({ academic_year_id: v === 'all' ? undefined : v });

  const apply = () => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams(searchParams.toString());
      FILTER_KEYS.forEach((k) => params.delete(k));
      Object.entries(local).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
      });
      params.set('page', '1');
      router.push(`/campus-living/residents?${params.toString()}`);
    } finally {
      setTimeout(() => setIsSearching(false), 800);
    }
  };

  const clear = () => {
    setLocal({});
    const params = new URLSearchParams(searchParams.toString());
    FILTER_KEYS.forEach((k) => params.delete(k));
    params.set('page', '1');
    router.push(`/campus-living/residents?${params.toString()}`);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className='w-full'>
      <CollapsibleTrigger asChild>
        <Button variant='outline' className='w-full justify-between'>
          Advanced Filters
          {open ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-4 pt-4'>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
          {/* Institution */}
          <Select value={local.institution_id || ''} onValueChange={onInstitution} disabled={loadingInstitutions || !canSelectAcrossInstitutions}>
            <SelectTrigger><SelectValue placeholder={!canSelectAcrossInstitutions ? 'Your institution' : 'Select Institution'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Institutions</SelectItem>
              {institutions.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Degree */}
          <Select value={local.degree_id || ''} onValueChange={onDegree} disabled={!local.institution_id}>
            <SelectTrigger><SelectValue placeholder='Select Degree' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Degrees</SelectItem>
              {degrees.map((d) => <SelectItem key={d.id} value={d.id}>{d.degree_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Department */}
          <Select value={local.department_id || ''} onValueChange={onDepartment} disabled={!local.degree_id}>
            <SelectTrigger><SelectValue placeholder='Select Department' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Departments</SelectItem>
              {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.department_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Program */}
          <Select value={local.program_id || ''} onValueChange={onProgram} disabled={!local.department_id}>
            <SelectTrigger><SelectValue placeholder='Select Program' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Programs</SelectItem>
              {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Semester */}
          <Select value={local.semester_id || ''} onValueChange={onSemester} disabled={!local.program_id}>
            <SelectTrigger><SelectValue placeholder='Select Semester' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Semesters</SelectItem>
              {semesters.map((s) => <SelectItem key={s.id} value={s.id}>{s.semester_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Section */}
          <Select value={local.section_id || ''} onValueChange={onSection} disabled={!local.semester_id}>
            <SelectTrigger><SelectValue placeholder='Select Section' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Sections</SelectItem>
              {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.section_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Academic Year */}
          <Select value={local.academic_year_id || ''} onValueChange={onAcademicYear} disabled={!local.institution_id}>
            <SelectTrigger><SelectValue placeholder='Select Academic Year' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Academic Years</SelectItem>
              {academicYears.map((a) => <SelectItem key={a.id} value={a.id}>{a.academic_year_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Gender */}
          <Select value={local.gender || ''} onValueChange={(v) => set({ gender: v === 'all' ? undefined : v })}>
            <SelectTrigger><SelectValue placeholder='Select Gender' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Genders</SelectItem>
              <SelectItem value='Male'>Male</SelectItem>
              <SelectItem value='Female'>Female</SelectItem>
              <SelectItem value='Other'>Other</SelectItem>
            </SelectContent>
          </Select>
          {/* Hostel type */}
          <Select value={local.hostel_type || ''} onValueChange={(v) => set({ hostel_type: v === 'all' ? undefined : v })}>
            <SelectTrigger><SelectValue placeholder='Hostel Type' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Hostel Types</SelectItem>
              <SelectItem value='AC HOSTEL'>AC</SelectItem>
              <SelectItem value='NON-AC HOSTEL'>Non-AC</SelectItem>
            </SelectContent>
          </Select>
          {/* Block */}
          <Select value={local.block_id || ''} onValueChange={(v) => set({ block_id: v === 'all' ? undefined : v })}>
            <SelectTrigger><SelectValue placeholder='Block' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Blocks</SelectItem>
              <SelectItem value={UNASSIGNED_BLOCK}>Unassigned</SelectItem>
              {(blockList ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Year of study */}
          <Select value={local.year_of_study || ''} onValueChange={(v) => set({ year_of_study: v === 'all' ? undefined : v })}>
            <SelectTrigger><SelectValue placeholder='Year of Study' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Years</SelectItem>
              {(availableYears && availableYears.length > 0 ? availableYears : [1, 2, 3, 4]).map((y) => (
                <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='flex justify-between pt-2'>
          <Button variant='outline' onClick={clear}>
            <RotateCcw className='mr-2 h-4 w-4' /> Clear All Filters
          </Button>
          <Button onClick={apply} disabled={isSearching} className='ml-auto'>
            <Search className='mr-2 h-4 w-4' />
            {isSearching ? 'Searching…' : 'Search Learners'}
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

- [ ] **Step 2: Verify the cascade service method signatures match**

Confirm against `learners/profiles/_components/profiles-filters.tsx:177-349`
that these calls match exactly: `DegreeService.getDegrees`,
`DepartmentService.getDepartments`, `ProgramService.getPrograms`,
`SemesterService.getSemestersByProgram`, `SectionService.getSections`,
`AcademicYearService.getAcademicYearsByInstitution`. They do (copied from there).
Also confirm option label fields: `degree_name`, `department_name`,
`program_name`, `semester_name`, `section_name`, `academic_year_name`.

- [ ] **Step 3: Verify types**

Run `mcp__ide__getDiagnostics` on `learners-filters.tsx`.
Expected: `[]`. (The `any[]` option arrays mirror profiles-filters and are
acceptable per existing repo convention.)

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/campus-living/residents/_components/learners-filters.tsx"
git commit -m "feat(campus-living): advanced cascade + hostel filter panel for learners tab"
```

---

## Task 7: Rewrite `learners-tab.tsx` to use the advanced DataTable

**Files:**
- Modify (full rewrite): `app/(routes)/campus-living/residents/_components/learners-tab.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
'use client';

// Learners tab on /campus-living/residents. Lists Learners classified as
// hostelites (learners_profiles.accommodation_type='HOSTEL') via
// v_learner_hostelites, in the shared advanced DataTable with the
// Learners-Profiles academic cascade filters + hostel filters. Mutations still
// target learners_profiles (the view is read-only).

import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import { DataTable } from '@/components/data-table/data-table';
import { LearnerHosteliteService } from '@/lib/services/campus-living/learner-hostelite-service';
import type {
  LearnerHostelite,
  LearnerHostelitesFilters,
  LearnerHostelType,
  BlockFilterValue,
} from '@/types/campus-living';
import { getLearnerColumns } from './learners-columns';
import { LearnersFilters } from './learners-filters';
import { RemoveHosteliteDialog } from './remove-hostelite-dialog';
import { AddLearnerToHostelDialog } from './add-learner-to-hostel-dialog';
import { EditHosteliteDrawer } from './edit-hostelite-drawer';
import { LearnerDetailDrawer } from './learner-detail-drawer';

export function LearnersTab() {
  const { profile } = useAuth();
  const { isSuperAdmin, permissions } = usePermissions();
  const { institutions } = useInstitutionsWithAccess();
  const searchParams = useSearchParams();

  const canEdit = isSuperAdmin || !!permissions?.['campus_living.residents.edit'];

  // Non-super-admins are pinned to their institution; super-admins use the
  // institution_id URL filter (handled inside fetchData via filters).
  const effectiveInstitutionId: string | undefined = isSuperAdmin
    ? undefined
    : (profile?.institution_id ?? undefined);

  const instName = useMemo(() => {
    const map = new Map<string, string>();
    institutions.forEach((i: { id: string; name: string }) => map.set(i.id, i.name));
    return (id: string) => map.get(id) ?? '—';
  }, [institutions]);

  // Drawer / dialog state
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<LearnerHostelite | null>(null);
  const [removeTarget, setRemoveTarget] = useState<LearnerHostelite | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Build cascade filters from URL params. The closure captures these values,
  // so its identity changes when the URL changes → DataTable refetches
  // (data-table.tsx effect deps include fetchDataFn).
  const filterParams = useMemo<Omit<LearnerHostelitesFilters, 'search' | 'sortBy' | 'sortOrder'>>(() => {
    const f: Omit<LearnerHostelitesFilters, 'search' | 'sortBy' | 'sortOrder'> = {};
    const g = (k: string) => searchParams.get(k) ?? undefined;
    if (isSuperAdmin && g('institution_id')) f.institution_id = g('institution_id');
    if (g('degree_id')) f.degree_id = g('degree_id');
    if (g('department_id')) f.department_id = g('department_id');
    if (g('program_id')) f.program_id = g('program_id');
    if (g('semester_id')) f.semester_id = g('semester_id');
    if (g('section_id')) f.section_id = g('section_id');
    if (g('academic_year_id')) f.academic_year_id = g('academic_year_id');
    if (g('gender')) f.gender = g('gender') as 'Male' | 'Female' | 'Other';
    if (g('hostel_type')) f.hostel_type = g('hostel_type') as LearnerHostelType;
    if (g('block_id')) f.block_id = g('block_id') as BlockFilterValue;
    const y = g('year_of_study');
    if (y) f.year_of_study = Number(y);
    return f;
  }, [searchParams, isSuperAdmin]);

  const fetchData = useCallback(
    async (params: {
      page: number; limit: number; search: string;
      sort_by: string; sort_order: string;
    }) => {
      const filters: LearnerHostelitesFilters = {
        ...filterParams,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
      };
      const { data, count } = await LearnerHosteliteService.listHostelites(
        effectiveInstitutionId,
        filters,
        params.page,
        params.limit,
      );
      const limit = params.limit || 50;
      return {
        success: true,
        data,
        pagination: {
          page: params.page,
          limit,
          total_pages: Math.max(1, Math.ceil(count / limit)),
          total_items: count,
        },
      };
    },
    [filterParams, effectiveInstitutionId],
  );

  const columns = useMemo(
    () =>
      getLearnerColumns({
        canEdit,
        isSuperAdmin,
        instName,
        onView: (l) => setDetailId(l.id),
        onEdit: (l) => setEditTarget(l),
        onRemove: (l) => setRemoveTarget(l),
      }),
    [canEdit, isSuperAdmin, instName],
  );

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className='mr-2 h-4 w-4' />
          Add Learner to Hostel
        </Button>
      </div>

      <LearnersFilters />

      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns}
        idField='id'
        exportConfig={{
          entityName: 'hostel-learner-residents',
          columnMapping: {},
          columnWidths: [],
          headers: [],
        }}
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: false,
        }}
      />

      {/* Drawers + dialogs */}
      <RemoveHosteliteDialog learner={removeTarget} onClose={() => setRemoveTarget(null)} />
      <EditHosteliteDrawer learner={editTarget} onClose={() => setEditTarget(null)} />
      <AddLearnerToHostelDialog open={addOpen} onOpenChange={setAddOpen} institutionId={effectiveInstitutionId} />
      <LearnerDetailDrawer
        learnerId={detailId}
        onClose={() => setDetailId(null)}
        canEdit={canEdit}
        onEdit={canEdit && detailId ? () => { setDetailId(null); } : undefined}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify the `config` keys against `TableConfig`**

Confirm `enableUrlState`, `enableDateFilter`, `enableExport`,
`enableRowSelection` exist on `TableConfig` (they're used in
`profiles-data-table.tsx:235-240`). If `enableExport: true` does not render a
toolbar export button in this repo's build, fall back to `enableExport: false`
and add a `renderToolbarContent` Export button (note in commit).

- [ ] **Step 3: Verify types**

Run `mcp__ide__getDiagnostics` on `learners-tab.tsx`.
Expected: `[]`.

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/campus-living/residents/_components/learners-tab.tsx"
git commit -m "feat(campus-living): learners tab on advanced DataTable with cascade filters + export"
```

---

## Task 8: Cleanup, regression check, and manual verification

**Files:**
- Possibly delete: `app/(routes)/campus-living/residents/_hooks/use-residents-filter-url.ts`
- Possibly delete: `app/(routes)/campus-living/residents/_components/filter-chips.tsx`

- [ ] **Step 1: Find orphaned imports from the old tab**

Run:
```bash
grep -rn "use-residents-filter-url\|useResidentsFilterUrl\|filter-chips\|FilterChips" "app/(routes)/campus-living/residents"
```
Expected after Task 7: no references except the files' own definitions. If a
file is referenced **only** by its own definition, delete it. If still
referenced elsewhere, leave it.

- [ ] **Step 2: Delete confirmed-orphan files (only if Step 1 showed no other importers)**

```bash
git rm "app/(routes)/campus-living/residents/_hooks/use-residents-filter-url.ts"
git rm "app/(routes)/campus-living/residents/_components/filter-chips.tsx"
```
(Skip any file that still has an importer.)

- [ ] **Step 3: Regression check on the shared service consumers**

Run:
```bash
grep -rn "useLearnerHostelites\|listHostelites" "app/(routes)/campus-living"
```
Confirm `allocations/new/page.tsx` and `gate-passes/new/page.tsx` still
compile — run `mcp__ide__getDiagnostics` on both. The new filter/sort fields are
optional, so their existing calls are unaffected. Expected: `[]` each.

- [ ] **Step 4: Manual browser verification**

Start dev server (`npm run dev`) and as a non-super-admin warden (and again as
super-admin), open `/campus-living/residents` → Learners tab. Confirm:
1. Table loads via the advanced DataTable (881 total for super-admin; institution
   subset for warden); Program + Block columns render, Block shows "Unassigned".
2. Toolbar **search** narrows by roll/name/email.
3. **Advanced Filters** → pick Institution → Degree → … → Program; click
   **Search Learners**; rows narrow; URL carries the params; refresh preserves them.
4. Hostel type / Block / Year filters narrow correctly; "Unassigned" block works.
5. Column header **sort** works on Roll / Name / Program / Block / Gender.
6. **Pagination** works (page size selector changes row count).
7. Row name / Eye → detail drawer; Pencil → edit (only when permitted);
   Trash → remove dialog → learner drops from list after confirm.
8. **Export** button downloads the current rows.
9. `/campus-living/allocations/new` and `/campus-living/gate-passes/new` still
   load the hostelite picker.

- [ ] **Step 5: Final commit (cleanup, if any files were deleted)**

```bash
git add -A "app/(routes)/campus-living/residents"
git commit -m "chore(campus-living): remove orphaned residents learners filter hooks"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** view extension (T1/T2) ✓; service filters+sort (T4) ✓; types (T3) ✓; columns incl. Program+Block (T5) ✓; cascade+hostel filter panel (T6) ✓; tab rewrite with DataTable + built-in search + export + kept actions (T7) ✓; YAGNI no bulk/non-learner changes ✓; risks (LEFT JOIN count check T1S4, Unassigned sentinel T5/T6, gender ilike unchanged in service, regression check T8S3) ✓.
- **Placeholder scan:** every code step contains full code; SQL/commands are concrete; the only conditional ("if `program_name` is actually `name`", "if `enableExport` doesn't render") are explicit fallbacks, not TBDs.
- **Type consistency:** `LearnerHostelitesFilters` fields (degree_id…academic_year_id, sortBy/sortOrder) defined in T3 are exactly the keys read in T4 pushdown and written in T6/T7; `LearnerHostelite.program_name / current_block_name / current_block_code` from T1/T3 are the accessorKeys used in T5; `getLearnerColumns(LearnerColumnHandlers)` signature from T5 matches the call in T7.
