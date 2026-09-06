# Induction Multi-Target (Institution / Degree / Department) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an induction target multiple institutions + optional specific degrees + optional departments, and auto-enroll only the matching freshers.

**Architecture:** Add three `uuid[]` target columns to `induction_programs`; the enrollment engine (create/preview/auto-enroll RPCs) prefers them and falls back to the legacy single-institution path when they're NULL. The `/events/induction/new` form replaces its single-institution + scope + UG/PG controls with three cascading multi-selects.

**Tech Stack:** Postgres (SECURITY DEFINER RPCs), Supabase, Next.js 16 / React 19, Shadcn UI.

**Spec:** `docs/superpowers/specs/2026-06-30-induction-multi-target-design.md`

## Global Constraints

- **No test runner.** Verify via `mcp__ide__getDiagnostics` (per file; no full `tsc`), `mcp__supabase__execute_sql` structural checks, and browser. Never claim "tests pass".
- **Migrations are production-gated:** the controller authors the SQL and applies each `apply_migration` after explicit user OK; subagents author files but do not apply. Commit the real SQL to `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` (today 2026-06-30 → e.g. `20260630220000`) and mirror into `supabase/setup/` (`01_tables.sql`, `02_functions.sql`).
- **Auth rule (verbatim):** create/preview/auto-enroll authorize as `is_super_admin() OR is_admin()`, OR `user_has_permission('induction.manage')` AND `role_has_institution_access(x)` for **every** institution in the target set (not just one).
- **Empty = all:** `target_degree_ids` / `target_department_ids` NULL or `cardinality = 0` means "all" — never "match nothing".
- **Owning `institution_id` = `target_institution_ids[1]`** (the primary; consumed by polls/pulse/RLS). Keep it populated.
- **Back-compat:** the engine must keep working for existing inductions where `target_institution_ids IS NULL` (legacy `institution_id`+`enroll_scope`+`degree_type_filter`).
- **Branch:** `feat/induction-multi-target` (created; spec committed there).
- Supabase mutations always check `{ error }`.

---

### Task 1: Migration — add the three target columns

**Files:**
- Create: `supabase/migrations/20260630220000_induction_program_target_columns.sql`
- Modify (mirror): `supabase/setup/01_tables.sql`

**Interfaces:**
- Produces: `induction_programs.target_institution_ids uuid[]`, `target_degree_ids uuid[]`, `target_department_ids uuid[]`. Consumed by Task 2.

- [ ] **Step 1: Write the migration**
```sql
-- 20260630220000_induction_program_target_columns.sql
-- Multi-target induction: enrolling institutions + optional degrees/departments.
-- Arrays are filter sets consumed by the enrollment RPCs (= ANY()). institution_id
-- stays as the owning/primary institution (= target_institution_ids[1]).
ALTER TABLE public.induction_programs
  ADD COLUMN IF NOT EXISTS target_institution_ids uuid[],
  ADD COLUMN IF NOT EXISTS target_degree_ids      uuid[],
  ADD COLUMN IF NOT EXISTS target_department_ids  uuid[];

COMMENT ON COLUMN public.induction_programs.target_institution_ids IS
  'Institutions whose freshers auto-enroll (>=1 for new rows). NULL = legacy induction (use institution_id + enroll_scope).';
COMMENT ON COLUMN public.induction_programs.target_degree_ids IS
  'Optional degree filter; NULL/empty = all degrees.';
COMMENT ON COLUMN public.induction_programs.target_department_ids IS
  'Optional department filter; NULL/empty = all departments.';

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2 (controller): apply** via `mcp__supabase__apply_migration` (name `induction_program_target_columns`) after user OK.

- [ ] **Step 3: Verify columns exist**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='induction_programs' AND column_name LIKE 'target_%' ORDER BY 1;
```
Expected: 3 rows.

- [ ] **Step 4: Mirror** the `ADD COLUMN`s into `supabase/setup/01_tables.sql` (under the induction_programs section, or appended with a dated comment).

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260630220000_induction_program_target_columns.sql supabase/setup/01_tables.sql
git commit -m "feat(induction): target_* array columns on induction_programs"
```

---

### Task 2: Migration — enrollment engine v2 (create / preview / auto-enroll)

**Files:**
- Create: `supabase/migrations/20260630220100_induction_multi_target_rpcs.sql`
- Modify (mirror): `supabase/setup/02_functions.sql`

**Interfaces:**
- Consumes: Task 1 columns; existing `learners_profiles(institution_id,degree_id,department_id,admission_year_id,lifecycle_status)`, `admission_years.year`, `degrees`, `departments`, `programs`, `institutions`, `role_has_institution_access`, `induction_enrollment`.
- Produces (consumed by Task 3 service):
  - `fn_induction_create_program(p_institution_id uuid, p_academic_year_id uuid, p_name text, p_start_date timestamptz, p_end_date timestamptz, p_venue_text text, p_description text, p_admission_year integer, p_enroll_scope text, p_venue_resource_id uuid, p_degree_type_filter text, p_institution_ids uuid[], p_degree_ids uuid[], p_department_ids uuid[]) → uuid`
  - `fn_induction_preview_enroll(p_institution_id uuid, p_admission_year integer, p_enroll_scope text, p_degree_type_filter text, p_program_ids uuid[], p_institution_ids uuid[], p_degree_ids uuid[], p_department_ids uuid[]) → jsonb` (adds `by_department`)
  - `fn_induction_auto_enroll(p_event_id uuid) → integer` (reads target arrays)

- [ ] **Step 1: Write the migration** (complete bodies — the array branch fires when the target set is present, else the legacy branch)

```sql
-- 20260630220100_induction_multi_target_rpcs.sql

-- helper: does the caller have induction.manage access to EVERY institution in arr?
CREATE OR REPLACE FUNCTION public._fn_induction_can_target_institutions(p_ids uuid[])
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF is_super_admin() OR is_admin() THEN RETURN true; END IF;
  IF NOT user_has_permission('induction.manage') THEN RETURN false; END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p_ids,'{}'::uuid[])) x(iid)
    WHERE NOT role_has_institution_access(x.iid));
END $$;
REVOKE EXECUTE ON FUNCTION public._fn_induction_can_target_institutions(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_induction_can_target_institutions(uuid[]) TO authenticated;

-- CREATE PROGRAM (adds the 3 array params; owning institution_id = target_institution_ids[1])
CREATE OR REPLACE FUNCTION public.fn_induction_create_program(
  p_institution_id uuid, p_academic_year_id uuid, p_name text,
  p_start_date timestamptz, p_end_date timestamptz, p_venue_text text DEFAULT 'Campus',
  p_description text DEFAULT NULL, p_admission_year integer DEFAULT NULL,
  p_enroll_scope text DEFAULT 'institution', p_venue_resource_id uuid DEFAULT NULL,
  p_degree_type_filter text DEFAULT NULL,
  p_institution_ids uuid[] DEFAULT NULL, p_degree_ids uuid[] DEFAULT NULL, p_department_ids uuid[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_id uuid; v_slug text;
  v_scope text := COALESCE(NULLIF(p_enroll_scope,''),'institution');
  v_degree text := NULLIF(p_degree_type_filter,'');
  v_multi boolean := (p_institution_ids IS NOT NULL AND cardinality(p_institution_ids) > 0);
  v_owning uuid := CASE WHEN v_multi THEN p_institution_ids[1] ELSE p_institution_id END;
BEGIN
  IF v_multi THEN
    IF NOT public._fn_induction_can_target_institutions(p_institution_ids) THEN
      RAISE EXCEPTION 'fn_induction_create_program: not authorized for one or more selected institutions'; END IF;
  ELSE
    IF NOT (is_super_admin() OR is_admin()
            OR (user_has_permission('induction.manage') AND role_has_institution_access(p_institution_id))) THEN
      RAISE EXCEPTION 'fn_induction_create_program: not authorized'; END IF;
  END IF;
  IF v_owning IS NULL OR p_name IS NULL THEN
    RAISE EXCEPTION 'fn_induction_create_program: institution and name are required'; END IF;
  IF v_scope NOT IN ('institution','group') THEN
    RAISE EXCEPTION 'fn_induction_create_program: enroll_scope must be institution or group'; END IF;
  IF v_degree IS NOT NULL AND v_degree NOT IN ('ug','pg') THEN
    RAISE EXCEPTION 'fn_induction_create_program: degree_type_filter must be ug, pg, or null'; END IF;

  v_slug := lower(regexp_replace(coalesce(p_name,'induction'), '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);

  INSERT INTO public.events (institution_id, event_type, name, slug, venue_text, venue_resource_id,
                             start_date, end_date, description, status, created_by)
  VALUES (v_owning, 'induction', p_name, v_slug,
          CASE WHEN p_venue_resource_id IS NOT NULL THEN NULLIF(p_venue_text,'Campus') ELSE coalesce(p_venue_text,'Campus') END,
          p_venue_resource_id, p_start_date, p_end_date, p_description, 'draft', auth.uid())
  RETURNING id INTO v_event_id;

  INSERT INTO public.induction_programs (event_id, institution_id, academic_year_id, admission_year,
    enroll_scope, degree_type_filter, target_institution_ids, target_degree_ids, target_department_ids)
  VALUES (v_event_id, v_owning, p_academic_year_id, p_admission_year, v_scope, v_degree,
          CASE WHEN v_multi THEN p_institution_ids ELSE NULL END,
          NULLIF(p_degree_ids, '{}'::uuid[]),
          NULLIF(p_department_ids, '{}'::uuid[]));

  RETURN v_event_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_create_program(uuid,uuid,text,timestamptz,timestamptz,text,text,integer,text,uuid,text,uuid[],uuid[],uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_create_program(uuid,uuid,text,timestamptz,timestamptz,text,text,integer,text,uuid,text,uuid[],uuid[],uuid[]) TO authenticated;

-- PREVIEW (adds 3 array params + by_department; array branch vs legacy branch)
CREATE OR REPLACE FUNCTION public.fn_induction_preview_enroll(
  p_institution_id uuid, p_admission_year integer, p_enroll_scope text DEFAULT 'institution',
  p_degree_type_filter text DEFAULT NULL, p_program_ids uuid[] DEFAULT NULL,
  p_institution_ids uuid[] DEFAULT NULL, p_degree_ids uuid[] DEFAULT NULL, p_department_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope text := COALESCE(NULLIF(p_enroll_scope,''),'institution');
  v_multi boolean := (p_institution_ids IS NOT NULL AND cardinality(p_institution_ids) > 0);
  v_result jsonb;
BEGIN
  IF v_multi THEN
    IF NOT public._fn_induction_can_target_institutions(p_institution_ids) THEN
      RAISE EXCEPTION 'fn_induction_preview_enroll: not authorized for one or more selected institutions'; END IF;
  ELSE
    IF NOT (is_super_admin() OR is_admin()
            OR (user_has_permission('induction.manage') AND role_has_institution_access(p_institution_id))) THEN
      RAISE EXCEPTION 'fn_induction_preview_enroll: not authorized'; END IF;
  END IF;
  IF p_admission_year IS NULL THEN RAISE EXCEPTION 'fn_induction_preview_enroll: admission_year required'; END IF;

  WITH matched AS (
    SELECT lp.id, lp.institution_id, lp.program_id, lp.department_id, d.degree_type, lp.lifecycle_status,
           TRIM(CONCAT(lp.first_name,' ',COALESCE(lp.last_name,''))) AS full_name
    FROM public.learners_profiles lp
    JOIN public.admission_years ay ON ay.id = lp.admission_year_id
    LEFT JOIN public.degrees d ON d.id = lp.degree_id
    WHERE ay.year = p_admission_year
      AND lp.lifecycle_status IN ('reserved','admitted','account')
      AND (
        (v_multi AND lp.institution_id = ANY(p_institution_ids)
           AND (p_degree_ids IS NULL OR cardinality(p_degree_ids)=0 OR lp.degree_id = ANY(p_degree_ids))
           AND (p_department_ids IS NULL OR cardinality(p_department_ids)=0 OR lp.department_id = ANY(p_department_ids)))
        OR
        (NOT v_multi AND (v_scope='group' OR lp.institution_id = p_institution_id)
           AND (p_degree_type_filter IS NULL OR d.degree_type = p_degree_type_filter)
           AND (p_program_ids IS NULL OR lp.program_id = ANY(p_program_ids)))
      ))
  SELECT jsonb_build_object(
    'total',(SELECT count(*) FROM matched),'scope',CASE WHEN v_multi THEN 'targeted' ELSE v_scope END,
    'degree_type_filter',p_degree_type_filter,
    'by_institution',(SELECT coalesce(jsonb_agg(jsonb_build_object('institution',institution,'count',cnt) ORDER BY cnt DESC),'[]'::jsonb)
       FROM (SELECT i.name AS institution,count(*) cnt FROM matched m LEFT JOIN public.institutions i ON i.id=m.institution_id GROUP BY i.name) a),
    'by_program',(SELECT coalesce(jsonb_agg(jsonb_build_object('program',program,'degree_type',degree_type,'count',cnt) ORDER BY cnt DESC),'[]'::jsonb)
       FROM (SELECT coalesce(p.program_name,'(no program)') program,m.degree_type,count(*) cnt FROM matched m LEFT JOIN public.programs p ON p.id=m.program_id GROUP BY p.program_name,m.degree_type) b),
    'by_department',(SELECT coalesce(jsonb_agg(jsonb_build_object('department',department,'count',cnt) ORDER BY cnt DESC),'[]'::jsonb)
       FROM (SELECT coalesce(dep.department_name,'(no department)') department,count(*) cnt FROM matched m LEFT JOIN public.departments dep ON dep.id=m.department_id GROUP BY dep.department_name) e),
    'sample',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',full_name,'status',lifecycle_status)),'[]'::jsonb)
       FROM (SELECT full_name,lifecycle_status FROM matched ORDER BY full_name LIMIT 15) c)
  ) INTO v_result; RETURN v_result;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_preview_enroll(uuid,integer,text,text,uuid[],uuid[],uuid[],uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_preview_enroll(uuid,integer,text,text,uuid[],uuid[],uuid[],uuid[]) TO authenticated;

-- AUTO-ENROLL (reads target arrays; array branch vs legacy branch)
CREATE OR REPLACE FUNCTION public.fn_induction_auto_enroll(p_event_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inst uuid; v_year integer; v_scope text; v_degree_filter text;
  v_inst_ids uuid[]; v_degree_ids uuid[]; v_dept_ids uuid[];
  v_multi boolean; v_count integer;
BEGIN
  SELECT institution_id, admission_year, enroll_scope, degree_type_filter,
         target_institution_ids, target_degree_ids, target_department_ids
    INTO v_inst, v_year, v_scope, v_degree_filter, v_inst_ids, v_degree_ids, v_dept_ids
  FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_auto_enroll: induction program not found for event %', p_event_id; END IF;
  v_multi := (v_inst_ids IS NOT NULL AND cardinality(v_inst_ids) > 0);

  IF v_multi THEN
    IF NOT public._fn_induction_can_target_institutions(v_inst_ids) THEN
      RAISE EXCEPTION 'fn_induction_auto_enroll: not authorized'; END IF;
  ELSE
    IF NOT (is_super_admin() OR is_admin()
            OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
      RAISE EXCEPTION 'fn_induction_auto_enroll: not authorized'; END IF;
  END IF;
  IF v_year IS NULL THEN RAISE EXCEPTION 'fn_induction_auto_enroll: induction has no admission_year set'; END IF;

  INSERT INTO public.induction_enrollment (event_id, learner_id, institution_id, source)
  SELECT p_event_id, lp.id, lp.institution_id, 'auto_admission_year'
  FROM public.learners_profiles lp
  JOIN public.admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN public.degrees d ON d.id = lp.degree_id
  WHERE ay.year = v_year
    AND lp.lifecycle_status IN ('reserved','admitted','account')
    AND (
      (v_multi AND lp.institution_id = ANY(v_inst_ids)
         AND (v_degree_ids IS NULL OR cardinality(v_degree_ids)=0 OR lp.degree_id = ANY(v_degree_ids))
         AND (v_dept_ids IS NULL OR cardinality(v_dept_ids)=0 OR lp.department_id = ANY(v_dept_ids)))
      OR
      (NOT v_multi AND (v_scope='group' OR lp.institution_id = v_inst)
         AND (v_degree_filter IS NULL OR d.degree_type = v_degree_filter))
    )
  ON CONFLICT (event_id, learner_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_auto_enroll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_auto_enroll(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2 (controller): apply** via `mcp__supabase__apply_migration` (name `induction_multi_target_rpcs`) after user OK.

- [ ] **Step 3: Verify** the functions exist with the new arity:
```sql
SELECT proname, pg_get_function_identity_arguments(oid) AS args FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN ('fn_induction_create_program','fn_induction_preview_enroll','fn_induction_auto_enroll','_fn_induction_can_target_institutions')
ORDER BY proname;
```
Expected: create_program has 14 args, preview_enroll has 8 args, helper present, all anon-locked.

- [ ] **Step 4: Mirror** the 4 functions into `supabase/setup/02_functions.sql`.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260630220100_induction_multi_target_rpcs.sql supabase/setup/02_functions.sql
git commit -m "feat(induction): multi-target enrollment engine (create/preview/auto-enroll + all-institution auth)"
```

---

### Task 3: Service — `induction-service.ts`

**Files:**
- Modify: `lib/services/induction/induction-service.ts` (the `CreateInductionInput` type ~lines 20-32, `createProgram` ~62-83, `previewEnroll` ~85-101, and the `PreviewEnrollResult` type)

**Interfaces:**
- Consumes: the Task 2 RPCs.
- Produces (consumed by Task 4): `createProgram` accepting `institutionIds`/`degreeIds`/`departmentIds`; `previewEnroll` accepting the same; `PreviewEnrollResult.by_department`.

- [ ] **Step 1: Read** `lib/services/induction/induction-service.ts` lines 1-110 to see `CreateInductionInput`, `PreviewEnrollResult`, `createProgram`, `previewEnroll` exactly.

- [ ] **Step 2: Extend `CreateInductionInput`** — add:
```ts
  institutionIds?: string[];   // multi-target; when set, drives create + owning institution = [0]
  degreeIds?: string[];        // optional
  departmentIds?: string[];    // optional
```
(keep `institutionId`, `enrollScope`, `degreeTypeFilter` for back-compat callers.)

- [ ] **Step 3: Pass arrays in `createProgram`** — add to the `.rpc('fn_induction_create_program', { … })` object:
```ts
      p_institution_ids: input.institutionIds ?? null,
      p_degree_ids: input.degreeIds ?? null,
      p_department_ids: input.departmentIds ?? null,
```
For the owning `p_institution_id` legacy arg, pass `input.institutionId ?? input.institutionIds?.[0] ?? null`.

- [ ] **Step 4: Extend `previewEnroll`** — add `institutionIds?: string[]; degreeIds?: string[]; departmentIds?: string[]` to its params type, and add to the `.rpc('fn_induction_preview_enroll', { … })` object:
```ts
      p_institution_ids: params.institutionIds ?? null,
      p_degree_ids: params.degreeIds ?? null,
      p_department_ids: params.departmentIds ?? null,
```
Pass `p_institution_id: params.institutionId ?? params.institutionIds?.[0] ?? null`.

- [ ] **Step 5: Extend `PreviewEnrollResult`** — add:
```ts
  by_department: { department: string; count: number }[];
```

- [ ] **Step 6: Verify** `mcp__ide__getDiagnostics` on the file (if unavailable, re-read the edited regions for type consistency). Commit:
```bash
git add lib/services/induction/induction-service.ts
git commit -m "feat(induction): service passes target arrays + by_department"
```

---

### Task 4: UI — `/events/induction/new` three multi-selects

**Files:**
- Create: `app/(routes)/events/induction/new/_components/multi-select-popover.tsx` (only if the repo has no reusable multi-select — see Step 1)
- Modify: `app/(routes)/events/induction/new/page.tsx`

**Interfaces:**
- Consumes: `InductionService.createProgram` / `previewEnroll` (Task 3); `supabase.from('institutions'|'degrees'|'departments')`; `useGroupAdmissionYears`.

- [ ] **Step 1: Check for an existing multi-select.** Glob `components/ui/*multi*select*` and Grep `components/ui` for `MultiSelect`. If one exists with a `{ options, value, onChange }`-style API, use it and SKIP creating the component. Otherwise create `multi-select-popover.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ChevronsUpDown } from 'lucide-react';

export function MultiSelectPopover({ options, value, onChange, placeholder, disabled }: {
  options: { id: string; name: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const selected = options.filter((o) => value.includes(o.id));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="w-full justify-between font-normal">
          <span className="truncate text-left">
            {selected.length === 0 ? <span className="text-muted-foreground">{placeholder}</span>
              : selected.length <= 2 ? selected.map((o) => o.name).join(', ')
              : `${selected.length} selected`}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] max-h-64 overflow-y-auto p-1" align="start">
        {options.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">No options.</p>
        ) : options.map((o) => (
          <button type="button" key={o.id} onClick={() => toggle(o.id)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left hover:bg-accent">
            <Checkbox checked={value.includes(o.id)} className="pointer-events-none" />
            <span className="truncate">{o.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Rework `page.tsx` state.** Replace `const [institutionId, setInstitutionId] = useState('')`, `enrollScope`, `degreeTypeFilter` with:
```tsx
  const [institutionIds, setInstitutionIds] = useState<string[]>([]);
  const [degreeIds, setDegreeIds] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [degrees, setDegrees] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
```

- [ ] **Step 3: Cascade fetches.** Replace the `institutionId`-driven year scope with the array, and load degrees/departments for the selected institutions:
```tsx
  // admission years across the selected institutions (hook already takes an array)
  const { data: admissionYearOptions = [], isLoading: yearsLoading } =
    useGroupAdmissionYears(institutionIds.length ? institutionIds : []);

  useEffect(() => {
    if (!institutionIds.length) { setDegrees([]); setDepartments([]); return; }
    supabase.from('degrees').select('id,degree_name').in('institution_id', institutionIds).order('degree_name')
      .then(({ data }) => setDegrees((data ?? []).map((d: any) => ({ id: d.id, name: d.degree_name }))));
    supabase.from('departments').select('id,department_name').in('institution_id', institutionIds).order('department_name')
      .then(({ data }) => setDepartments((data ?? []).map((d: any) => ({ id: d.id, name: d.department_name }))));
  }, [institutionIds]);

  // prune degree/department picks whose institution was deselected
  useEffect(() => { setDegreeIds((p) => p.filter((id) => degrees.some((d) => d.id === id))); }, [degrees]);
  useEffect(() => { setDepartmentIds((p) => p.filter((id) => departments.some((d) => d.id === id))); }, [departments]);
  // invalidate preview on any targeting change
  useEffect(() => { setPreview(null); }, [institutionIds, admissionYear, degreeIds, departmentIds]);
```

- [ ] **Step 4: Replace the institution/enroll/degree fields** in the JSX with three `MultiSelectPopover`s (institutions required; degrees/departments optional, disabled until ≥1 institution). Update `canPreview` to `institutionIds.length > 0 && !!admissionYear`; update `handlePreview`/`handleCreate` to pass `institutionIds, degreeIds, departmentIds` instead of `institutionId/enrollScope/degreeTypeFilter`. Update the validation in `handleCreate` to require `institutionIds.length` and `admissionYear`. Render the new `preview.by_department` block (mirror the existing `by_program` list).

- [ ] **Step 5: Verify** `mcp__ide__getDiagnostics` on both files (if unavailable, Grep that `Popover`/`Checkbox` exist in `components/ui`, confirm `useGroupAdmissionYears` accepts a string[], and re-read for balanced JSX). Browser: open `/events/induction/new`, select 2 institutions → degrees/departments populate → Preview shows a count + by-department breakdown.

- [ ] **Step 6: Commit**
```bash
git add "app/(routes)/events/induction/new/page.tsx" "app/(routes)/events/induction/new/_components/multi-select-popover.tsx"
git commit -m "feat(induction): new-induction form multi-institution/degree/department targeting"
```

---

## Self-Review (plan author)

- **Spec coverage:** §3 columns → T1; §5 filter + §6 RPCs + §6 all-institution auth → T2 (`_fn_induction_can_target_institutions`, array branches, `by_department`); §7 service → T3; §8 UI → T4; §4 back-compat → the `v_multi`/legacy branch in every RPC (T2); §9 edge cases → T4 prune effects + `canPreview` guard, and `NULLIF(…,'{}')`/`cardinality=0` = "all" in T2.
- **Type consistency:** `institutionIds`/`degreeIds`/`departmentIds` (string[]) in T3 service ↔ `p_institution_ids`/`p_degree_ids`/`p_department_ids` (uuid[]) in T2 ↔ form state in T4. `PreviewEnrollResult.by_department: {department,count}[]` (T3) ↔ `'by_department'` jsonb key (T2) ↔ render (T4).
- **Open runtime checks for the implementer:** (a) `degrees`/`departments` have an `institution_id` column (used by the cascade `.in(...)`); (b) `components/ui/popover` + `checkbox` exist; (c) `useGroupAdmissionYears` accepts a plain `string[]` (the old code passed `string[] | null`).
