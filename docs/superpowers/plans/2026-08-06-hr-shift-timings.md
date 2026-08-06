# HR Shift Timings — Implementation Plan

**Date:** 2026-08-06
**Scope:** Phase 1 — institution-wise shift-timing configuration in the HR admin module.
**Out of scope (Phase 2):** biometric punch ingestion and attendance evaluation. Designed for, not built here.

---

## 1. Why a new module (investigation summary)

Five parallel audits (DB schema/RLS, app layer, staff model, biometric pipeline, RBAC conventions) established the following. **Every table involved has 0 rows** — nothing here is live, so there is no data migration and no rollback risk.

### 1.1 Four partial representations of "shift timing" already exist

| # | Object | Has | Missing | Verdict |
|---|---|---|---|---|
| A | `hr_shift_templates` + `hr_shift_assignments` + `hr_shift_swap_requests` (service + hooks + 4 pages) | single `start_time`/`end_time`, `institution_id`, `is_global`, free-text `category` (hostel/security/…), per-staff assignment, rotation, swaps | day-of-week, half-day split, grace, teaching/non-teaching | **REMOVED 2026-08-06** (revised decision — see §1.5). Tables dropped, application files deleted. One flow, not two. |
| B | `hr_work_schedules` (table only, surfaced via generic `/hr/policies/[table]`) | `grace_minutes` (10), `working_days_mask` (63 = Mon–Sat), lunch window, `cadre_id` | institution scoping, half-day split | **Do not extend** — see §1.2. |
| C | `platform_policies` key `hr.working_schedule`, `scope_type='institution'` | `by_role_type.{teaching,non_teaching}`, `working_days_per_week`, `second_saturday_holiday` | machine-readable schema; only 2 of 14 institutions populated; no reader anywhere | **Superseded.** Right *grain*, wrong *storage*. |
| D | `hr_attendance_status_types.late_grace_minutes` | a grace column | belongs on the schedule, not the status | Vestigial; leave. |

Live values in C, for reference when HR reviews the seed:

- **JKKN College of Engineering and Technology** — teaching 08:30–16:30, non-teaching 08:30–17:00
- **JKKN Dental College and Hospital** — teaching 09:00–17:00, non-teaching 08:30–17:00

Both carry `second_saturday_holiday: true`, `working_days_per_week: 6`.

### 1.2 The finding that rules out `hr_work_schedules`

Its RLS is a single `ALL` policy:

```sql
hr_work_schedules_tenant_isolation
  qual = with_check = (hr_organization_id = auth_hr_organization_id() OR is_super_admin())
```

`auth_hr_organization_id()` reads `user_hr_access`, **a table containing exactly one row in the entire database**. For every other user it returns `NULL`, so the predicate is never true and the table is **invisible and unwritable — silently, with no error**. `hr_public_holidays` has the identical defect.

### 1.3 The requirement none of them can express

First half **09:00–13:00**, second half **12:30–16:30**. These **overlap by 30 minutes**. That is not a lunch break, so `lunch_start`/`lunch_end` structurally cannot model it. New columns are required regardless of which table wins.

### 1.4 Tenancy and category axes (decided by data, not preference)

| Axis | Decision | Evidence |
|---|---|---|
| Tenancy | **`institution_id`** | NOT NULL on all 861 staff; it is what `role_has_institution_access()` gates on. `institutions` ↔ `hr_organizations` is strictly 1:1 (`UNIQUE (institution_id)`), so `hr_organization_id` buys nothing and drags in the broken helper of §1.2. |
| Staff category | **`staff.category_id → employment_categories.id`** | Populated for **861/861**. `employment_categories` has a real `is_teaching` boolean and **no institution scoping**, so it is safe to FK. |
| Rejected: `staff.role_type` | unusable | all 861 rows = `'teacher'`. |
| Rejected: `hr_staff_details.cadre_id` | unusable | only 314/861 staff resolve to a cadre; 3 of 14 orgs have no cadres seeded. |
| Rejected: `hr_staff_details.hr_organization_id` | unusable | covers 583/861 and **contradicts `staff.institution_id` on 15 live staff** (13 Main Office people whose HR home is a college). |

Cross-institution staff are not a concern: `hr_staff_institution_allocation` has 0 rows and no staff email appears under two institutions.

### 1.5 Confirmed decisions

| Question | Decision |
|---|---|
| Phase 1 scope | Shift-timing config only |
| Category grain | teaching / non-teaching, **plus** optional per-category override; most specific wins |
| Late rule | Record `late_by_minutes`, flag LATE, **day still counts full** |
| Half-day credit | **Must cover the window** — IN ≤ half start (+grace on first half) AND OUT ≥ half end |
| Seed | All 14 institutions with 09:00–13:00 / 12:30–16:30, grace 5; HR edits after |
| History | **Effective-dated** — edits supersede, never overwrite |
| Legacy | **REVISED mid-implementation.** Initially "leave alone"; the user then directed removal — *"if the old shift module is not be used then remove the codebase … do not confuse the two modules separately."* Condition verified (all 3 tables 0 rows; only 2 stale comments referenced them), so the legacy module was dropped. Lost with it: per-employee rotating rosters and shift-swap requests — neither was ever used, and no trigger ever materialised an approved swap. |
| Week pattern | Sunday/week-off non-working **+** second-Saturday holiday. *Short single-session Saturday not required.* |

---

## 2. Data model

### 2.1 `hr_shift_timings`

```sql
CREATE TABLE public.hr_shift_timings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy. institution_id is the only total path from a staff row and is the
  -- axis role_has_institution_access() gates on. Deliberately NOT hr_organization_id:
  -- auth_hr_organization_id() reads user_hr_access, which has 1 row DB-wide, so any
  -- policy built on it returns zero rows to every non-super-admin. See plan §1.2.
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

  -- Most specific wins at resolution:
  --   'category'     -> exact employment_category_id
  --   'teaching'     -> employment_categories.is_teaching = true
  --   'non_teaching' -> employment_categories.is_teaching = false
  staff_scope text NOT NULL CHECK (staff_scope IN ('teaching','non_teaching','category')),
  employment_category_id uuid NULL REFERENCES public.employment_categories(id) ON DELETE CASCADE,

  -- ISO-8601: 1=Mon .. 7=Sun. Matches EXTRACT(ISODOW FROM date) exactly.
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),

  is_working_day boolean NOT NULL DEFAULT true,

  -- The two half-day session windows. They MAY overlap (09:00-13:00 / 12:30-16:30)
  -- — that is the real JKKN pattern and the reason lunch_start/lunch_end cannot be reused.
  first_half_start  time NULL,
  first_half_end    time NULL,
  second_half_start time NULL,
  second_half_end   time NULL,

  -- Applies to first_half_start ONLY. Confirmed requirement: morning punch only.
  grace_minutes integer NOT NULL DEFAULT 0 CHECK (grace_minutes BETWEEN 0 AND 240),

  -- 2nd Saturday of the month is non-working. Only meaningful when day_of_week = 6.
  second_saturday_holiday boolean NOT NULL DEFAULT false,

  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date NULL,

  notes text NULL,
  is_active boolean NOT NULL DEFAULT true,

  created_by uuid NULL REFERENCES public.profiles(id),
  updated_by uuid NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_shift_timings_scope_category_chk CHECK (
    (staff_scope =  'category' AND employment_category_id IS NOT NULL) OR
    (staff_scope <> 'category' AND employment_category_id IS NULL)
  ),

  CONSTRAINT hr_shift_timings_times_present_chk CHECK (
    (is_working_day = false
       AND first_half_start IS NULL AND first_half_end IS NULL
       AND second_half_start IS NULL AND second_half_end IS NULL)
    OR
    (is_working_day = true
       AND first_half_start IS NOT NULL AND first_half_end IS NOT NULL
       AND second_half_start IS NOT NULL AND second_half_end IS NOT NULL)
  ),

  -- Overlap between halves is ALLOWED; inversion is not.
  CONSTRAINT hr_shift_timings_order_chk CHECK (
    is_working_day = false OR (
      first_half_end   > first_half_start  AND
      second_half_end  > second_half_start AND
      second_half_start >= first_half_start AND
      second_half_end   >= first_half_end
    )
  ),

  CONSTRAINT hr_shift_timings_second_saturday_chk CHECK (
    second_saturday_holiday = false OR day_of_week = 6
  ),

  CONSTRAINT hr_shift_timings_effective_chk CHECK (
    effective_until IS NULL OR effective_until > effective_from
  )
);
```

**Uniqueness — the guard nothing else in this schema has.** The audit found *zero* unique constraints on `hr_shift_templates`, `hr_shift_assignments`, `hr_work_schedules` or `hr_biometric_punches`; duplicate and overlapping config rows are all currently legal. Do not repeat that:

```sql
-- One live row per (institution, scope, category, weekday).
-- COALESCE because Postgres treats NULLs as distinct in a plain UNIQUE index,
-- which would let unlimited duplicate 'teaching' rows through.
CREATE UNIQUE INDEX hr_shift_timings_current_uq
  ON public.hr_shift_timings (
    institution_id,
    staff_scope,
    COALESCE(employment_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    day_of_week
  )
  WHERE effective_until IS NULL AND is_active;

CREATE INDEX hr_shift_timings_lookup
  ON public.hr_shift_timings (institution_id, day_of_week, effective_from DESC)
  WHERE is_active;

CREATE TRIGGER hr_shift_timings_updated_at
  BEFORE UPDATE ON public.hr_shift_timings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

### 2.2 Effective dating semantics

- A **correction** (typo in a time) → plain `UPDATE` of the live row.
- A **scheduled change** ("new hours from 1 Sep") → set `effective_until = <new date>` on the live row and `INSERT` a successor with `effective_from = <new date>`. Both happen in one service method so they cannot half-apply.
- The partial unique index only covers rows with `effective_until IS NULL`, so superseded history accumulates freely without collisions.

---

## 3. Resolver RPC

`SECURITY DEFINER` and **self-authorizing** — the repo has been bitten by DEFINER RPCs callable by `authenticated` that trusted their caller.

```sql
CREATE OR REPLACE FUNCTION public.fn_resolve_shift_timing(
  p_staff_id uuid,
  p_date     date
)
RETURNS TABLE (
  timing_id uuid, institution_id uuid, staff_scope text,
  employment_category_id uuid, day_of_week smallint, is_working_day boolean,
  first_half_start time, first_half_end time,
  second_half_start time, second_half_end time,
  grace_minutes integer, grace_deadline time, matched_by text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_institution_id uuid; v_category_id uuid; v_is_teaching boolean;
  v_dow smallint; v_second_sat boolean;
BEGIN
  IF NOT (
    is_super_admin() OR is_admin()
    OR EXISTS (SELECT 1 FROM staff s WHERE s.id = p_staff_id AND s.profile_id = auth.uid())
    OR (user_has_permission('hr.shift_timings.view')
        AND EXISTS (SELECT 1 FROM staff s
                    WHERE s.id = p_staff_id AND role_has_institution_access(s.institution_id)))
  ) THEN
    RAISE EXCEPTION 'Not authorized to resolve shift timing for this staff member'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.institution_id, s.category_id, ec.is_teaching
    INTO v_institution_id, v_category_id, v_is_teaching
  FROM staff s
  JOIN employment_categories ec ON ec.id = s.category_id
  WHERE s.id = p_staff_id;

  IF v_institution_id IS NULL THEN RETURN; END IF;

  v_dow := EXTRACT(ISODOW FROM p_date)::smallint;
  -- Nth Saturday = ceil(day_of_month / 7); the 2nd falls on days 8..14.
  v_second_sat := (v_dow = 6 AND EXTRACT(DAY FROM p_date) BETWEEN 8 AND 14);

  RETURN QUERY
  SELECT
    t.id, t.institution_id, t.staff_scope, t.employment_category_id, t.day_of_week,
    CASE WHEN v_second_sat AND t.second_saturday_holiday THEN false ELSE t.is_working_day END,
    CASE WHEN v_second_sat AND t.second_saturday_holiday THEN NULL ELSE t.first_half_start  END,
    CASE WHEN v_second_sat AND t.second_saturday_holiday THEN NULL ELSE t.first_half_end    END,
    CASE WHEN v_second_sat AND t.second_saturday_holiday THEN NULL ELSE t.second_half_start END,
    CASE WHEN v_second_sat AND t.second_saturday_holiday THEN NULL ELSE t.second_half_end   END,
    t.grace_minutes,
    CASE WHEN v_second_sat AND t.second_saturday_holiday OR NOT t.is_working_day THEN NULL
         ELSE (t.first_half_start + make_interval(mins => t.grace_minutes))::time END,
    CASE WHEN v_second_sat AND t.second_saturday_holiday THEN 'second_saturday_holiday'
         ELSE t.staff_scope END
  FROM hr_shift_timings t
  WHERE t.institution_id = v_institution_id
    AND t.day_of_week    = v_dow
    AND t.is_active
    AND t.effective_from <= p_date
    AND (t.effective_until IS NULL OR t.effective_until > p_date)
    AND (
      (t.staff_scope = 'category'     AND t.employment_category_id = v_category_id) OR
      (t.staff_scope = 'teaching'     AND v_is_teaching) OR
      (t.staff_scope = 'non_teaching' AND NOT v_is_teaching)
    )
  ORDER BY CASE t.staff_scope WHEN 'category' THEN 0 ELSE 1 END,  -- most specific wins
           t.effective_from DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_resolve_shift_timing(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_shift_timing(uuid, date) TO authenticated;
```

### 3.1 Coverage RPC — prevents the silent-empty-state class of bug

`fn_shift_timing_coverage(p_institution_id uuid, p_date date)` returns one row per employment category present in that institution: `category_name`, `is_teaching`, `staff_count`, `resolved_timing_id`, `resolved_via`. Any row with a NULL `resolved_timing_id` is staff with **no timing on that date**. The admin page renders this as a warning strip.

This matters because the data is genuinely uneven — Main Office is 114/114 non-teaching, and the two schools are 100% teaching. Empty cells are legitimate, so the UI must distinguish "correctly empty" from "misconfigured".

---

## 4. RLS + permissions

### 4.1 New keys

`lib/constants/permissions.ts`, HR category:

```ts
{ key: 'hr.shift_timings.view',   label: 'View Shift Timing Configuration' },
{ key: 'hr.shift_timings.manage', label: 'Configure Shift Timings' },
```

**Both must also be granted by migration or the page renders for nobody.** Grant to `hr_admin` and `hr_head` — the two roles that already hold every attendance-admin key (`hr.attendance.override`, `.view_all`, `.thresholds.write`). Use the value-guard idiom, not a key-presence guard:

```sql
UPDATE public.custom_roles
   SET permissions = permissions
                   || jsonb_build_object('hr.shift_timings.view', true)
                   || jsonb_build_object('hr.shift_timings.manage', true),
       updated_at = now()
 WHERE role_key IN ('hr_admin','hr_head')
   AND COALESCE((permissions->>'hr.shift_timings.manage')::boolean, false) = false;
```

`NOT (permissions ? 'key')` would skip the ~63 roles that carry keys explicitly set to `false`.

### 4.2 Policies

Mirrors the `hr_attendance_status_types` idiom verbatim. The `(SELECT fn())` wrapping is load-bearing — it forces once-per-query evaluation and is the fix for the 57014 statement-timeout class of bug.

```sql
ALTER TABLE public.hr_shift_timings ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_shift_timings_select ON public.hr_shift_timings FOR SELECT USING (
     (SELECT is_super_admin())
  OR (SELECT is_admin())
  OR ((SELECT user_has_permission('hr.shift_timings.view'))   AND role_has_institution_access(institution_id))
  OR ((SELECT user_has_permission('hr.shift_timings.manage')) AND role_has_institution_access(institution_id))
);

CREATE POLICY hr_shift_timings_insert ON public.hr_shift_timings FOR INSERT WITH CHECK (
     (SELECT is_super_admin()) OR (SELECT is_admin())
  OR ((SELECT user_has_permission('hr.shift_timings.manage')) AND role_has_institution_access(institution_id))
);

CREATE POLICY hr_shift_timings_update ON public.hr_shift_timings FOR UPDATE USING (
     (SELECT is_super_admin()) OR (SELECT is_admin())
  OR ((SELECT user_has_permission('hr.shift_timings.manage')) AND role_has_institution_access(institution_id))
);

CREATE POLICY hr_shift_timings_delete ON public.hr_shift_timings FOR DELETE USING (
     (SELECT is_super_admin())
  OR ((SELECT is_admin()) AND (SELECT user_has_permission('hr.shift_timings.manage'))
      AND role_has_institution_access(institution_id))
);
```

Note the contrast with the existing shift stack: `hr_shift_templates` gates writes on `is_super_admin() OR is_admin()` with **no permission key at all**, which locks out custom roles like HR Head that hold every other HR key. This module does not repeat that.

---

## 5. Application layer

### 5.1 Files

| File | Purpose |
|---|---|
| `types/hr-shift-timings.ts` | `HRShiftTiming` / `Insert` / `Update` / `Filters`; `DAY_OF_WEEK_OPTIONS`; `STAFF_SCOPE_OPTIONS`; pure helpers `computeGraceDeadline`, `isSecondSaturday`, `validateTimingRow` |
| `lib/services/hr/shift-timing-service.ts` | static class; `list`, `getWeek`, `saveWeek`, `scheduleChange`, `resolveForStaff`, `getCoverage` |
| `hooks/hr/use-shift-timings.ts` | `const KEY = 'hr-shift-timings'`; query + mutations with invalidation |
| `app/(routes)/hr/admin/shift-timings/page.tsx` | admin page |
| `app/(routes)/hr/admin/shift-timings/_components/weekly-timing-grid.tsx` | the editor |
| `app/(routes)/hr/admin/shift-timings/_components/coverage-warning.tsx` | uncovered-category strip |

**Service-shape note.** `CLAUDE.md` says services extend `BaseService`, but **no HR service does** — all take `supabase: SupabaseClient` as the first argument. This plan follows the local HR convention for consistency with its ~20 siblings, while being rigorous about the two things `BaseService` would otherwise have given us:

- **Institution filtering happens in SQL** (`.eq('institution_id', …)`), never in JS. `ShiftService.listAssignmentsForInstitution` does the opposite — `.limit(500)` then filters in JS at `shift-service.ts:408-413` — which will silently drop rows the moment that table is populated.
- **Every mutation destructures `{ error }` and checks it.** `shift-service.ts:381-384` and `:490-493` swallow join errors and render `'—'`, so an RLS denial is indistinguishable from missing data.

Flag if you would rather deviate from HR convention and extend `BaseService` instead.

### 5.2 Query keys

`lib/query/query-keys.ts` has **no `hr` section and no HR importer** — a group added there would be dead code. Follow `hooks/hr/use-hr-leave-types.ts:12`: a module-local `const KEY`.

### 5.3 UI

Page shape follows `/hr/admin/leave-types` (PermissionGuard + ContentLayout + PageBreadcrumb + Card + `HrInstitutionSelect`), **not** `/hr/admin/shift-templates` — that one has no permission key and asks admins to paste raw institution UUIDs into a text box.

The editor is a **weekly grid**, not a flat table. A 7-rows-per-scope DataTable would render your Mon–Fri/Saturday split as 14 opaque rows:

```
Institution: [JKKN College of Engineering and Technology ▾]    Effective from: [2026-08-06]

Scope:  ( Teaching )  ( Non-teaching )  [ + category override ▾ ]

  Day    Working   First half        Second half       Grace
  Mon      [x]     09:00 – 13:00     12:30 – 16:30     5 min
  Tue      [x]     09:00 – 13:00     12:30 – 16:30     5 min
  Wed      [x]     09:00 – 13:00     12:30 – 16:30     5 min
  Thu      [x]     09:00 – 13:00     12:30 – 16:30     5 min
  Fri      [x]     09:00 – 13:00     12:30 – 16:30     5 min
  Sat      [x]     09:00 – 13:00     12:30 – 16:30     5 min   [x] 2nd Sat holiday
  Sun      [ ]        —                 —               —

  [ Copy Monday to Mon–Fri ]                      [ Cancel ]  [ Save week ]

  ! 3 categories in this institution have no timing: Security (15), Driver (31), Ayaah (107)
```

- `<Input type="time">` for every time field — real pickers, unlike the plain text inputs used today.
- **"Copy Monday to Mon–Fri"** is the key affordance; it maps directly onto "Mon–Fri one timing, Saturday another".
- Grace is per-day and labelled *"applies to the first-half start only"*.
- Category override is additive: pick a category, get a second grid whose rows take precedence.
- `saveWeek` writes all 7 rows in one call so a week is never half-saved.

---

## 6. Seed

14 institutions × {teaching, non_teaching} × 7 days = **196 rows**.

| Field | Value |
|---|---|
| Mon–Sat | `is_working_day = true`, 09:00–13:00 / 12:30–16:30, `grace_minutes = 5` |
| Sat | additionally `second_saturday_holiday = true` |
| Sun | `is_working_day = false`, all times NULL |
| `effective_from` | seed date |

Seed is idempotent (`WHERE NOT EXISTS` on the live-row unique key) so re-running is safe.

**Flag for HR review after seeding:** Engineering and Dental currently declare different hours in `platform_policies` (§1.1). The seed overwrites nothing — those blobs are unread by any code — but those two institutions should confirm 09:00/12:30/16:30 is intended for them.

---

## 7. Registration checklist

Every one of these or the page is invisible, unreachable, or fails a build gate.

- [ ] `supabase/migrations/<ts>_hr_shift_timings.sql` — table, indexes, trigger, RLS
- [ ] `supabase/migrations/<ts>_hr_shift_timings_functions.sql` — resolver + coverage RPCs
- [ ] `supabase/migrations/<ts>_hr_shift_timings_permissions.sql` — grants
- [ ] `supabase/migrations/<ts>_hr_shift_timings_seed.sql` — 196 rows
- [ ] Mirror into `supabase/setup/01_tables.sql`, `02_functions.sql`, `03_policies.sql`, `04_triggers.sql`
- [ ] `types/supabase.ts` — register the table (omitting it cascades TS2769)
- [ ] `types/hr-shift-timings.ts`, service, hook, page, components
- [ ] `lib/constants/permissions.ts` — declare both keys
- [ ] `lib/sidebarMenuLink.ts` `MENU_PERMISSIONS` — `'/hr/admin/shift-timings': 'hr.shift_timings.manage'`
- [ ] `lib/sidebarMenuLink.ts` menu tree — entry under the `/hr/admin` submenus array
- [ ] `npm run gen:routes` and commit `lib/navigation/route-manifest.generated.ts`
- [ ] `app/(routes)/hr/admin/page.tsx` — add the card

**Not needed:** `lib/permissions-audit/module-mappings.ts` — `['/hr', 'Staff']` already covers `/hr/admin/*`.

---

## 8. Verification

There is no test runner in this repo. "Done" means observed, not assumed.

1. `mcp__ide__getDiagnostics` clean on every touched file (full `tsc` OOMs).
2. `npm run check:menus && npm run check:sidebar && npm run check:reachability && npm run check:audit-coverage`.
3. SQL assertions against the live DB:
   - 196 seed rows; every institution has both scopes for all 7 days.
   - `fn_resolve_shift_timing` returns `matched_by='teaching'` for a Teaching-category staff member on a Wednesday.
   - Same staff on a Sunday → `is_working_day = false`.
   - Same staff on **Sat 2026-08-08** (2nd Saturday) → `matched_by='second_saturday_holiday'`, `is_working_day=false`; on **Sat 2026-08-01** → working.
   - Insert a `staff_scope='category'` row for Security and confirm a Security staff member resolves to it, not the non-teaching row.
   - Duplicate live row insert → rejected by `hr_shift_timings_current_uq`.
   - `second_half_start = 12:30` with `first_half_end = 13:00` → **accepted** (overlap is the point).
   - `first_half_end < first_half_start` → rejected.
4. Browser, as a **non-super-admin holding only `hr.shift_timings.manage`** — this is the check that matters. Confirm the page loads, the institution picker is scoped, and saving persists. Super-admin passing proves nothing; it bypasses RLS.
5. Confirm the coverage strip lists Security/Driver/Ayaah as uncovered before an override is added, and clears after.

---

## 9. Deliberately deferred

| Item | Why |
|---|---|
| Punch ingestion + evaluation engine | Phase 2. The resolver RPC and the "cover the window" rule are specified here so it drops in. |
| Widening the importer beyond `faculty`/`hod` | `app/api/hr/attendance/import/route.ts:227` hardcodes `FACULTY_ROLES`; non-teaching staff cannot be imported today. Phase 2. |
| Persisting raw punches | The importer keeps only earliest-in/latest-out and discards intermediates, so nothing survives re-evaluation. Phase 2 needs `hr_biometric_punches` populated with a dedup index and an FK on `employee_id`. |
| SELECT/INSERT policies on `hr_attendance_records` | Both absent — no user can read or insert. Phase 2. |
| Short single-session Saturday | Not required. Cheap later: drop NOT NULL enforcement in `hr_shift_timings_times_present_chk`. |
| Late-accumulation policy (N lates = deduction) | Late is flag-only for now. Additive when wanted. |
| Public-holiday integration | `hr_public_holidays` is empty and invisible (§1.2); `institution_leaves` (32 rows) is an academic closure calendar with no staff dimension. Needs its own decision. |

## 10. Known defects found but NOT fixed here

Recorded so they are not lost. Fixing them was declined for this phase.

| Defect | Location |
|---|---|
| `ShiftService.listAssignmentsForInstitution` filters institution in JS after `.limit(500)` | `lib/services/hr/shift-service.ts:344,408-413` |
| HR dashboard holiday banner selects `name` from `institution_leaves`, which has `leave_name` — PostgREST 42703, swallowed | `lib/services/hr/dashboard-service.ts:779` |
| `hr_work_schedules` / `hr_public_holidays` invisible to every non-super-admin | `auth_hr_organization_id()` + `user_hr_access` (1 row) |
| `regularization-service.ts` embeds `hr_employees`, a table that does not exist — every read fails | `lib/services/hr/regularization-service.ts:123` |
| `hr_biometric_punches.employee_id` has no FK; no dedup index | table DDL |
