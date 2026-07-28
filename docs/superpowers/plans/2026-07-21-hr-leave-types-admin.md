# HR Leave Types & Entitlement Management — Implementation Plan

> **For agentic team members:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the team member leave catalog out of the shared `leave_types` table into a dedicated `hr_leave_types` table managed from HR Admin, and add a balance generator so team members can actually apply for leave.

**Architecture:** A single transactional migration creates `hr_leave_types`, copies the 66 team member rows **preserving their UUIDs** (so every foreign-key value stays byte-identical and only constraint targets move), repoints five HR foreign keys, resolves two blocking cross-module references, then deletes the originals. A `SECURITY DEFINER` RPC materializes per-employee balances for an academic year. A new HR Admin page provides CRUD over the catalog.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript 5 (strict OFF), Supabase (Postgres + RLS), TanStack Query v5, Shadcn UI, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-21-hr-leave-types-design.md`

## Global Constraints

- **There is no test suite in this repo.** No `npm test` harness exists. Never claim "tests pass". Verification means: SQL assertions, `mcp__ide__getDiagnostics` on touched files, the `check:*` gates, and exercising the feature in a browser.
- **Typecheck per file — NOT with a full `npm run typecheck`** (3-4 minutes, OOMs under ~10GB heap).
  - `mcp__ide__getDiagnostics` is the intended tool, but **it is unavailable in this session and in subagents** (confirmed in Task 2). Use this substitute, which Task 2 validated:

    ```bash
    # scoped typecheck — write a temporary include-only tsconfig, run, delete
    cat > tsconfig.scoped.json <<'EOF'
    { "extends": "./tsconfig.json", "include": ["PATH/TO/FILE.ts"] }
    EOF
    npx tsc --noEmit -p tsconfig.scoped.json; rm tsconfig.scoped.json
    ```
  - **Expect pre-existing errors in files you did not touch** — strict mode is off and `typescript.ignoreBuildErrors` is true. Only errors in your own files are yours to fix.
- **Never fire-and-forget a Supabase mutation.** Always destructure `{ error }` and check it. try/catch does NOT catch RLS denials or constraint violations.
- **Supabase errors are plain objects, not `Error` instances.** `err instanceof Error` always falls through. Use `getErrorMessage()` from `@/lib/utils`.
- **`institutionId || ''` is an antipattern** — `||` coerces `undefined` → `''`, which flows through as a real UUID parameter and matches zero rows. Use `??`.
- **Nullable UUID form fields defaulting to `''` crash inserts with 22P02.** Normalize `'' → null` before insert.
- **A new table MUST be registered in `types/supabase.ts`** or `.from('hr_leave_types')` fails typecheck (TS2769 cascade).
- **Commit the real SQL body** to `supabase/migrations/` — never a `SELECT 1;` placeholder.
- **A permission key does nothing until granted to roles via migration.** Test the VALUE (`(permissions->>k)::boolean IS TRUE`), not key presence — 63 roles carry HR keys set to `false`.
- **Migration filenames:** `YYYYMMDDHHMMSS_name.sql` in `supabase/migrations/`.
- Branch: `feat/hr-leave-types-admin` (already created; spec committed at `636606fa6`).

## Verified Preconditions

Confirmed against production on 2026-07-21. Re-assert in Task 1; abort if any differ.

| Fact | Value |
|---|---|
| `leave_types WHERE scope='staff'` | 66 |
| `leave_types WHERE scope='learner'` | 9 |
| All 66 resolve to an `hr_organization` | yes — 0 dropped, 0 institutions with multiple orgs |
| `hr_leave_balances` | 2,358 rows / 393 team members |
| `hr_leave_applications` | 0 rows |
| `hr_leave_type_entitlements` | 33 rows |
| `hr_leave_policies` pointing at team member types | 0 (constraint exists, CASCADE) |
| `institution_leaves` pointing at team member types | **20 (RESTRICT — blocks delete)** |
| `leave_approval_chains` pointing at team member types | **3 (CASCADE — silent delete)** |
| `hr_staff_details.cadre_id` populated | **0 of 543** |
| Test user | Boobalan A, team member `403db380-17b6-46dc-91ed-b8403deeaf9c`, JKKN Testing Institution |
| Testing Institution AY 2026-2027 | `f88b7054-f52a-4940-9a41-4e0682f13ac7` |

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260721120000_hr_leave_types_split.sql` | Create table, copy rows, repoint FKs, resolve conflicts, delete originals, RLS |
| `supabase/migrations/20260721120100_generate_hr_leave_balances_rpc.sql` | Balance generator RPC |
| `supabase/migrations/20260721120200_hr_leave_types_permission_grants.sql` | Grant the 3 new permission keys |
| `types/supabase.ts` | Register `hr_leave_types` (generated types) |
| `types/hr-leave-types.ts` | **Create** — `HRLeaveType`, Insert/Update, filters |
| `lib/services/hr/leave-type-service.ts` | **Create** — CRUD + `generateBalances` |
| `hooks/hr/use-hr-leave-types.ts` | **Create** — React Query wrappers |
| `lib/services/hr/leave-service.ts` | Modify — repoint 4 query sites |
| `hooks/use-academic-years.ts` | Modify — date-bracketed year selection |
| `app/(routes)/hr/leave/{apply,balance,encashment}/page.tsx` | Modify — consume corrected selection |
| `app/(routes)/hr/admin/leave-types/page.tsx` | **Create** — catalog CRUD |
| `app/(routes)/hr/admin/leave-balances/page.tsx` | **Create** — generator UI |
| `lib/constants/permissions.ts`, `lib/sidebarMenuLink.ts`, `lib/permissions-audit/module-mappings.ts`, `app/(routes)/hr/nav-config.ts` | Modify — nav + permission wiring |

---

# STAGE A — Migration & Rewiring

## Task 1: Create `hr_leave_types` and migrate the catalog

**Files:**
- Create: `supabase/migrations/20260721120000_hr_leave_types_split.sql`

**Interfaces:**
- Produces: table `public.hr_leave_types` with all columns listed below; `leave_types` reduced to `scope IN ('learner','institution')`.

- [ ] **Step 1: Assert preconditions before writing anything**

Run via the Supabase MCP `execute_sql` tool:

```sql
SELECT
  (SELECT count(*) FROM leave_types WHERE scope='staff') AS staff_types,
  (SELECT count(*) FROM leave_types lt WHERE lt.scope='staff'
     AND NOT EXISTS (SELECT 1 FROM hr_organizations o WHERE o.institution_id = lt.institution_id)) AS unresolvable,
  (SELECT count(*) FROM institution_leaves il JOIN leave_types lt ON lt.id=il.leave_type_id WHERE lt.scope='staff') AS holiday_refs,
  (SELECT count(*) FROM leave_approval_chains c JOIN leave_types lt ON lt.id=c.leave_type_id WHERE lt.scope='staff') AS chain_refs;
```

Expected: `staff_types=66, unresolvable=0, holiday_refs=20, chain_refs=3`.
If any differ, STOP and report — the migration below is calibrated to these numbers.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260721120000_hr_leave_types_split.sql`:

```sql
-- HR Leave Types split — dedicated staff catalog.
--
-- WHY: leave_types served two audiences behind a `scope` discriminator, and
-- hr_leave_types was a VIEW over it. HR leave needs fields academic leave
-- never will (carry-forward, encashment, accrual, eligibility), and the
-- shared table made the staff catalog un-manageable from the HR module.
--
-- SAFETY: rows are copied with their EXISTING UUIDs, so every FK value stays
-- byte-identical. Only constraint targets move. No balance data is mutated.
--
-- Two cross-module references block a naive delete and are handled explicitly:
--   institution_leaves    — 20 rows, ON DELETE RESTRICT → would hard-fail
--   leave_approval_chains —  3 rows, ON DELETE CASCADE  → would silently vanish

BEGIN;

-- 1. Drop the view that currently occupies this name.
DROP VIEW IF EXISTS public.hr_leave_types;

-- 2. The real table.
CREATE TABLE public.hr_leave_types (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id        uuid NOT NULL REFERENCES public.hr_organizations(id) ON DELETE CASCADE,
  leave_type_code           varchar NOT NULL,
  leave_type_name           varchar NOT NULL,
  description               text,
  color_code                varchar NOT NULL DEFAULT '#6B7280',
  display_order             integer NOT NULL DEFAULT 0,
  is_active                 boolean NOT NULL DEFAULT true,

  duration_type             varchar NOT NULL DEFAULT 'full'
                              CHECK (duration_type IN ('full','first_half','second_half','hourly')),
  allow_half_day            boolean NOT NULL DEFAULT false,
  allow_hourly              boolean NOT NULL DEFAULT false,

  skip_weekends             boolean NOT NULL DEFAULT true,
  skip_holidays             boolean NOT NULL DEFAULT true,

  requires_approval         boolean NOT NULL DEFAULT true,
  is_paid                   boolean NOT NULL DEFAULT true,
  min_advance_notice_days   integer NOT NULL DEFAULT 0,
  max_continuous_days       integer,
  requires_documents        boolean NOT NULL DEFAULT false,
  document_required_after_days integer,
  default_entitled_days     numeric NOT NULL DEFAULT 0,

  valid_from                timestamptz NOT NULL DEFAULT now(),
  valid_until               timestamptz,
  superseded_by             uuid REFERENCES public.hr_leave_types(id),

  -- HR-specific (design D3)
  allow_carry_forward       boolean NOT NULL DEFAULT false,
  max_carry_forward_days    numeric,
  is_encashable             boolean NOT NULL DEFAULT false,
  max_encashable_days       numeric,
  accrual_type              varchar NOT NULL DEFAULT 'none'
                              CHECK (accrual_type IN ('none','annual','monthly')),
  accrual_rate              numeric NOT NULL DEFAULT 0,
  applicable_gender         varchar NOT NULL DEFAULT 'all'
                              CHECK (applicable_gender IN ('all','male','female')),
  applicable_cadre_ids      uuid[],

  created_by                uuid,
  updated_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_leave_types_org_code_unique UNIQUE (hr_organization_id, leave_type_code)
);

CREATE INDEX idx_hlt_org_active ON public.hr_leave_types(hr_organization_id, is_active);

-- 3. Copy the 66 staff rows, PRESERVING ids.
--    Join to hr_organizations verified 1:1 — 66/66 resolve, no institution
--    maps to more than one org, so no row is silently dropped.
INSERT INTO public.hr_leave_types (
  id, hr_organization_id, leave_type_code, leave_type_name, description,
  color_code, display_order, is_active, duration_type, allow_half_day,
  allow_hourly, skip_weekends, skip_holidays, requires_approval, is_paid,
  min_advance_notice_days, max_continuous_days, requires_documents,
  document_required_after_days, default_entitled_days, valid_from, valid_until,
  created_by, updated_by, created_at, updated_at
)
SELECT
  lt.id, o.id, lt.leave_type_code, lt.leave_type_name, lt.description,
  lt.color_code, lt.display_order, lt.is_active, lt.duration_type, lt.allow_half_day,
  lt.allow_hourly, lt.skip_weekends, lt.skip_holidays, lt.requires_approval, lt.is_paid,
  lt.min_advance_notice_days, lt.max_continuous_days, lt.requires_documents,
  lt.document_required_after_days, lt.default_entitled_days, lt.valid_from, lt.valid_until,
  lt.created_by, lt.updated_by, lt.created_at, lt.updated_at
FROM public.leave_types lt
JOIN public.hr_organizations o ON o.institution_id = lt.institution_id
WHERE lt.scope = 'staff';

-- 4. Repoint the five HR foreign keys onto the new table.
ALTER TABLE public.hr_leave_balances
  DROP CONSTRAINT hr_leave_balances_leave_type_id_fkey,
  ADD  CONSTRAINT hr_leave_balances_leave_type_id_fkey
       FOREIGN KEY (leave_type_id) REFERENCES public.hr_leave_types(id);

ALTER TABLE public.hr_leave_applications
  DROP CONSTRAINT hr_leave_applications_leave_type_id_fkey,
  ADD  CONSTRAINT hr_leave_applications_leave_type_id_fkey
       FOREIGN KEY (leave_type_id) REFERENCES public.hr_leave_types(id);

ALTER TABLE public.hr_leave_type_entitlements
  DROP CONSTRAINT hr_leave_type_entitlements_leave_type_id_fkey,
  ADD  CONSTRAINT hr_leave_type_entitlements_leave_type_id_fkey
       FOREIGN KEY (leave_type_id) REFERENCES public.hr_leave_types(id) ON DELETE CASCADE;

ALTER TABLE public.hr_leave_encashments
  DROP CONSTRAINT hr_leave_encashments_leave_type_id_fkey,
  ADD  CONSTRAINT hr_leave_encashments_leave_type_id_fkey
       FOREIGN KEY (leave_type_id) REFERENCES public.hr_leave_types(id);

ALTER TABLE public.hr_leave_policies
  DROP CONSTRAINT hr_leave_policies_leave_type_id_fkey,
  ADD  CONSTRAINT hr_leave_policies_leave_type_id_fkey
       FOREIGN KEY (leave_type_id) REFERENCES public.hr_leave_types(id) ON DELETE CASCADE;

-- 5a. leave_types.scope is CHECK-constrained to ('learner','staff','both').
--     The holiday labels below are a third audience — neither learner nor
--     staff. 'both' would be actively wrong: it means "learners AND staff",
--     so any query filtering scope IN ('learner','both') for the Academic
--     page AND any filtering scope IN ('staff','both') would both pick these
--     up, reintroducing the cross-audience contamination this split removes.
--     'both' currently has 0 rows, so widening the constraint is safe.
ALTER TABLE public.leave_types DROP CONSTRAINT leave_types_scope_check;
ALTER TABLE public.leave_types ADD  CONSTRAINT leave_types_scope_check
  CHECK (scope::text = ANY (ARRAY['learner','staff','both','institution']::text[]));

-- 5. institution_leaves (20 rows, RESTRICT). These are institution HOLIDAY
--    periods that borrowed a staff leave type purely as a LABEL.
--    hr_calc_leave_days reads institution_leaves by DATE RANGE only and never
--    reads leave_type_id, so relabelling does not change day-count behaviour.
--    Create one scope='institution' label per (institution, code) still in use,
--    then repoint.
INSERT INTO public.leave_types (
  institution_id, leave_type_code, leave_type_name, description, scope,
  color_code, is_active, duration_type
)
SELECT DISTINCT
  il.institution_id,
  lt.leave_type_code,
  lt.leave_type_name,
  'Institution holiday label (migrated from staff leave type)',
  'institution',
  lt.color_code,
  true,
  'full'
FROM public.institution_leaves il
JOIN public.leave_types lt ON lt.id = il.leave_type_id
WHERE lt.scope = 'staff'
ON CONFLICT DO NOTHING;

UPDATE public.institution_leaves il
SET leave_type_id = newlt.id
FROM public.leave_types oldlt, public.leave_types newlt
WHERE il.leave_type_id = oldlt.id
  AND oldlt.scope = 'staff'
  AND newlt.scope = 'institution'
  AND newlt.institution_id  = il.institution_id
  AND newlt.leave_type_code = oldlt.leave_type_code;

-- 6. leave_approval_chains (3 rows, CASCADE). Staff leave routes through
--    hr_approval_flows (flow_for='leave_approval'), so chain rows pointing at
--    staff types are orphaned config. Delete EXPLICITLY and loudly rather than
--    letting the cascade do it invisibly.
DO $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.leave_approval_chains c
  USING public.leave_types lt
  WHERE lt.id = c.leave_type_id AND lt.scope = 'staff';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % orphaned leave_approval_chains rows referencing staff types', v_deleted;
END $$;

-- 7. Remove the staff rows from the shared catalog.
DELETE FROM public.leave_types WHERE scope = 'staff';

-- 8. Post-conditions — abort the transaction on any mismatch.
DO $$
DECLARE
  v_new    integer;
  v_stale  integer;
  v_orphan integer;
  v_holi   integer;
BEGIN
  SELECT count(*) INTO v_new    FROM public.hr_leave_types;
  SELECT count(*) INTO v_stale  FROM public.leave_types WHERE scope = 'staff';
  SELECT count(*) INTO v_orphan FROM public.hr_leave_balances b
    WHERE NOT EXISTS (SELECT 1 FROM public.hr_leave_types t WHERE t.id = b.leave_type_id);
  SELECT count(*) INTO v_holi   FROM public.institution_leaves il
    WHERE NOT EXISTS (SELECT 1 FROM public.leave_types t WHERE t.id = il.leave_type_id);

  IF v_new <> 66 THEN RAISE EXCEPTION 'Expected 66 hr_leave_types, got %', v_new; END IF;
  IF v_stale <> 0  THEN RAISE EXCEPTION 'Stale staff rows remain in leave_types: %', v_stale; END IF;
  IF v_orphan <> 0 THEN RAISE EXCEPTION 'Orphaned hr_leave_balances rows: %', v_orphan; END IF;
  IF v_holi <> 0   THEN RAISE EXCEPTION 'Orphaned institution_leaves rows: %', v_holi; END IF;
END $$;

-- 9. RLS. Mirrors 20260721065226_hr_leave_rls_permission_retrofit: gate reads
--    on org membership, writes on an explicit permission key.
ALTER TABLE public.hr_leave_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY hlt_select ON public.hr_leave_types
  FOR SELECT TO authenticated
  USING (
    hr_organization_id IN (
      SELECT o.id FROM public.hr_organizations o
      JOIN public.staff s ON s.institution_id = o.institution_id
      WHERE s.profile_id = auth.uid()
    )
    OR public.user_has_permission('hr.leave.types.manage')
  );

CREATE POLICY hlt_write ON public.hr_leave_types
  FOR ALL TO authenticated
  USING      (public.user_has_permission('hr.leave.types.manage'))
  WITH CHECK (public.user_has_permission('hr.leave.types.manage'));

COMMIT;
```

- [ ] **Step 3: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool with name `hr_leave_types_split` and the full SQL body above.

Expected: success, with a `NOTICE` reporting 3 deleted chain rows. If any `RAISE EXCEPTION` fires, the whole transaction rolls back — read the message, fix, retry.

- [ ] **Step 4: Verify post-state**

```sql
SELECT
  (SELECT count(*) FROM hr_leave_types) AS hr_types,
  (SELECT count(*) FROM leave_types WHERE scope='staff') AS stale_staff,
  (SELECT count(*) FROM leave_types WHERE scope='learner') AS learner,
  (SELECT count(*) FROM leave_types WHERE scope='institution') AS holiday_labels,
  (SELECT count(*) FROM hr_leave_balances) AS balances_intact,
  (SELECT count(*) FROM hr_leave_balances b
     WHERE NOT EXISTS (SELECT 1 FROM hr_leave_types t WHERE t.id=b.leave_type_id)) AS orphans;
```

Expected: `hr_types=66, stale_staff=0, learner=9, holiday_labels≥2, balances_intact=2358, orphans=0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260721120000_hr_leave_types_split.sql
git commit -m "feat(hr/leave): split staff leave catalog into hr_leave_types

Copies 66 staff types out of the shared leave_types table preserving their
UUIDs, so all 2358 hr_leave_balances FK values stay byte-identical and only
constraint targets move.

Handles two blocking cross-module references found in production:
institution_leaves holds 20 ON DELETE RESTRICT rows using staff types as
holiday labels (relabelled to new scope='institution' types; hr_calc_leave_days
reads that table by date range only, so day-counting is unaffected), and
leave_approval_chains holds 3 ON DELETE CASCADE rows deleted explicitly rather
than silently.

Post-conditions are asserted inside the transaction and roll back on mismatch.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Register the table in TypeScript

**Files:**
- Modify: `types/supabase.ts`
- Create: `types/hr-leave-types.ts`

**Interfaces:**
- Produces: `HRLeaveType`, `HRLeaveTypeInsert`, `HRLeaveTypeUpdate`, `HRLeaveTypeFilters` — consumed by Tasks 3, 6, 8, 9, 10.

- [ ] **Step 1: Regenerate Supabase types**

Use the Supabase MCP `generate_typescript_types` tool and merge the `hr_leave_types` block into `types/supabase.ts`. Confirm the generated block includes all 8 new columns (`allow_carry_forward`, `max_carry_forward_days`, `is_encashable`, `max_encashable_days`, `accrual_type`, `accrual_rate`, `applicable_gender`, `applicable_cadre_ids`).

- [ ] **Step 2: Create the domain types**

Create `types/hr-leave-types.ts`:

```typescript
/**
 * HR Leave Types — staff leave catalog.
 *
 * Backed by the hr_leave_types TABLE (not the old view over leave_types).
 * Keys on hr_organization_id, not institution_id — the org↔institution
 * mapping is 1:1 and resolving it here removes the translation the apply
 * page used to perform.
 */

// LeaveDurationType already exists at types/hr.ts:237 and is used by
// hr_leave_applications. Re-export rather than redeclaring — two independent
// unions of the same four values drift the moment one is edited.
export type { LeaveDurationType } from '@/types/hr';
import type { LeaveDurationType } from '@/types/hr';

export type LeaveAccrualType = 'none' | 'annual' | 'monthly';
export type LeaveApplicableGender = 'all' | 'male' | 'female';

export interface HRLeaveType {
  id: string;
  hr_organization_id: string;
  leave_type_code: string;
  leave_type_name: string;
  description: string | null;
  color_code: string;
  display_order: number;
  is_active: boolean;

  duration_type: LeaveDurationType;
  allow_half_day: boolean;
  allow_hourly: boolean;

  skip_weekends: boolean;
  skip_holidays: boolean;

  requires_approval: boolean;
  is_paid: boolean;
  min_advance_notice_days: number;
  max_continuous_days: number | null;
  requires_documents: boolean;
  document_required_after_days: number | null;
  default_entitled_days: number;

  valid_from: string;
  valid_until: string | null;
  superseded_by: string | null;

  allow_carry_forward: boolean;
  max_carry_forward_days: number | null;
  is_encashable: boolean;
  max_encashable_days: number | null;
  accrual_type: LeaveAccrualType;
  accrual_rate: number;
  applicable_gender: LeaveApplicableGender;
  applicable_cadre_ids: string[] | null;

  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type HRLeaveTypeInsert = Omit<
  HRLeaveType,
  'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
> & { id?: string };

export type HRLeaveTypeUpdate = Partial<
  Omit<HRLeaveType, 'id' | 'hr_organization_id' | 'created_at' | 'updated_at'>
>;

export interface HRLeaveTypeFilters {
  hr_organization_id?: string;
  is_active?: boolean;
  search?: string;
}

export const ACCRUAL_TYPE_LABELS: Record<LeaveAccrualType, string> = {
  none: 'No accrual (granted up-front)',
  annual: 'Annual',
  monthly: 'Monthly',
};

export const APPLICABLE_GENDER_LABELS: Record<LeaveApplicableGender, string> = {
  all: 'All staff',
  male: 'Male only',
  female: 'Female only',
};
```

- [ ] **Step 3: Typecheck**

Run `mcp__ide__getDiagnostics` on `types/hr-leave-types.ts` and `types/supabase.ts`.
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add types/hr-leave-types.ts types/supabase.ts
git commit -m "feat(hr/leave): register hr_leave_types in TypeScript

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Repoint the leave flow at `hr_leave_types`

**Files:**
- Modify: `lib/services/hr/leave-service.ts` (4 query sites)

**Interfaces:**
- Consumes: `hr_leave_types` table (Task 1).

- [ ] **Step 1: Find every site**

```bash
cd "D:/Projects/MyJKKN" && grep -n "leave_types" lib/services/hr/leave-service.ts
```

Expected: 4 matches — in `applyLeave` (the `.from('leave_types')` fetch), `getBalance` (embedded join), `getCalendar`, and the encashment path.

- [ ] **Step 2: Rewrite the `applyLeave` catalog fetch**

In `lib/services/hr/leave-service.ts`, replace the leave-type fetch at the top of `applyLeave`:

```typescript
    // 1. Fetch leave type from the HR catalog. The table is staff-only by
    //    construction, so the old .eq('scope','staff') filter is gone.
    const { data: leaveType, error: ltErr } = await supabase
      .from('hr_leave_types')
      .select('*')
      .eq('id', payload.leave_type_id)
      .maybeSingle();
    if (ltErr) throw ltErr;
    if (!leaveType) throw new Error('Leave type not found');
```

- [ ] **Step 3: Rewrite the `getBalance` embed**

Replace the embedded select in `getBalance`:

```typescript
    const { data, error } = await supabase
      .from('hr_leave_balances')
      .select(`
        *,
        hr_leave_types:leave_type_id (
          leave_type_name,
          leave_type_code,
          duration_type,
          allow_half_day,
          allow_hourly
        )
      `)
      .eq('employee_id', employeeId)
      .eq('academic_year_id', academicYearId);
    if (error) throw error;
```

Then update the row-mapping immediately below it. The existing code reads the embed under the old alias — find the line shaped like:

```typescript
      leave_type_name: (row as any).leave_types?.leave_type_name,
```

and change every `.leave_types?.` accessor in that mapping block to `.hr_leave_types?.`. The embed alias must match the FK target renamed in Task 1, or PostgREST returns *"could not find a relationship between hr_leave_balances and leave_types"*.

Verify the mapping compiles and no old alias survives:

```bash
grep -n "leave_types?\." lib/services/hr/leave-service.ts | grep -v "hr_leave_types"
```

Expected: no output.

- [ ] **Step 4: Repoint the remaining two sites**

Apply the same `.from('leave_types')` → `.from('hr_leave_types')` change (dropping any `scope` filter) in `getCalendar` and the encashment query. Use the grep output from Step 1 to confirm none remain:

```bash
grep -n "'leave_types'" lib/services/hr/leave-service.ts
```

Expected: no output.

- [ ] **Step 4b: Repoint the four sites OUTSIDE leave-service.ts**

Task 1's review found these by grep after the migration had already run. All read team member leave types from the now-empty `leave_types`. Change each `.from('leave_types')` to `.from('hr_leave_types')` and drop any `.eq('scope','staff')`:

| File | Line | What breaks without the fix |
|---|---|---|
| `lib/services/hr/dashboard-service.ts` | 345 | **LIVE REGRESSION** — "Active Leave Types" KPI silently reads 0 |
| `app/api/hr/leave/applications/route.ts` | 118 | Notification text falls back to generic `'Leave'` |
| `app/api/hr/leave/applications/[id]/approve/route.ts` | 52 | same |
| `app/api/hr/leave/applications/[id]/reject/route.ts` | 54 | same |
| `app/api/staff/notify/route.ts` | 171, 222 | same — **outside the sweep paths below; easy to miss** |

The dashboard KPI is the only one users can see today (0 applications exist, so the notification paths are dormant) — but all become live once Stage B generates balances and people start applying.

**Do NOT touch `lib/services/academic/leave-management-service.ts`** — that is the Academic/learner service and must keep reading `leave_types`.

- [ ] **Step 5: Sweep for anything missed**

```bash
grep -rn "from('leave_types')" lib/ app/ | grep -v node_modules | grep -v "services/academic/"
```

Expected: no output. Any hit is a staff-leave site that would now fail loudly or silently read empty — fix it before continuing.

- [ ] **Step 5b: Mirror the schema change into supabase/setup/**

CLAUDE.md requires migrations be mirrored into the `supabase/setup/` reference files. `supabase/setup/05_views.sql:855-920` still defines the dropped `hr_leave_types` VIEW and labels it *"LOAD-BEARING — DO NOT DROP WITHOUT REFACTOR"*, which is now stale and actively misleading.

Replace that view definition with a comment recording that `hr_leave_types` became a real table in `20260721120000_hr_leave_types_split.sql`, and noting that the three policy RPCs (`hr_policy_history`, `hr_policy_diff`, `hr_policy_restore`) carry `'hr_leave_types'` in an `EXECUTE format(...)` allowlist whose JSON shape changed — the old view aliased `leave_type_name → name` and `leave_type_code → code`; the table does not. Those RPCs are currently unreachable (`features/hr/policies/registry.ts:48-53` removed `hr_leave_types` from `POLICY_TABLES` on 2026-04-15), but the mismatch becomes live if it is ever re-registered.

- [ ] **Step 6: Typecheck**

Run `mcp__ide__getDiagnostics` on `lib/services/hr/leave-service.ts`.
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/services/hr/leave-service.ts
git commit -m "feat(hr/leave): repoint leave flow at hr_leave_types

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Fix the academic-year picker

**Files:**
- Modify: `hooks/use-academic-years.ts`
- Modify: `app/(routes)/hr/leave/apply/page.tsx:49-52`
- Modify: `app/(routes)/hr/leave/balance/page.tsx`
- Modify: `app/(routes)/hr/leave/encashment/page.tsx`

**Interfaces:**
- Produces: `useCurrentAcademicYear(institutionId)` returning `{ data: AcademicYear | null, isLoading }` — consumed by the three pages.

**Why:** `use-academic-years.ts:13-14` orders `academic_year_name` descending as **text**, and the pages take `[0]`. Institutions have future years flagged `is_active`, so `'2030-2031' > '2026-2027'` lexically — Pharmacy resolves to 2030-2031 and Dental to 2028-2029. Names are also unreliable (some carry trailing spaces, e.g. `'2026-2027 '`).

- [ ] **Step 1: Add a date-bracketed selector**

Append to `hooks/use-academic-years.ts`:

```typescript
/**
 * The academic year that actually contains today, for one institution.
 *
 * Never sort by academic_year_name — it is TEXT, so '2030-2031' > '2026-2027',
 * and several rows carry trailing spaces ('2026-2027 '). Institutions
 * pre-create future years with is_active=true, so a name-desc [0] pick
 * silently resolves years up to five years out.
 *
 * Falls back to the most recently STARTED active year when today sits in a
 * gap between configured years.
 */
export function useCurrentAcademicYear(institutionId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: ['academic-year-current', institutionId],
    enabled: !!institutionId,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];

      const { data: bracketing, error: bracketErr } = await supabase
        .from('academic_years')
        .select('*')
        .eq('is_active', true)
        .eq('institution_id', institutionId!)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('start_date', { ascending: false })
        .limit(1);
      if (bracketErr) throw bracketErr;
      if (bracketing && bracketing.length > 0) return bracketing[0];

      const { data: fallback, error: fallbackErr } = await supabase
        .from('academic_years')
        .select('*')
        .eq('is_active', true)
        .eq('institution_id', institutionId!)
        .lte('start_date', today)
        .order('start_date', { ascending: false })
        .limit(1);
      if (fallbackErr) throw fallbackErr;
      return fallback?.[0] ?? null;
    },
  });
}
```

- [ ] **Step 2: Consume it in the apply page**

In `app/(routes)/hr/leave/apply/page.tsx`, replace the import and the `activeAcademicYearId` memo (lines ~24 and ~49-52):

```typescript
import { useAcademicYears, useCurrentAcademicYear } from '@/hooks/use-academic-years';
```

```typescript
  // Pick the year that CONTAINS today, not the lexically-highest active name.
  const { data: currentYear, isLoading: yearsFetching } =
    useCurrentAcademicYear(institutionId);
  const yearsLoading = yearsFetching || mappingsLoading;
  const activeAcademicYearId = currentYear?.id ?? '';
```

Remove the now-unused `useAcademicYears(institutionId)` call and the `academicYearsResp` memo from this file.

- [ ] **Step 3: Apply the same change to balance and encashment pages**

Both `app/(routes)/hr/leave/balance/page.tsx` and `app/(routes)/hr/leave/encashment/page.tsx` select a year the same way. Replace their selection logic with `useCurrentAcademicYear(institutionId)` exactly as in Step 2. The balance page also renders a year dropdown — keep the dropdown (it lists all active years via `useAcademicYears`) but make its **default selection** `currentYear?.id`.

- [ ] **Step 4: Verify the selection is now correct**

```sql
SELECT i.name AS institution, ay.academic_year_name, ay.start_date, ay.end_date
FROM academic_years ay JOIN institutions i ON i.id = ay.institution_id
WHERE ay.is_active AND CURRENT_DATE BETWEEN ay.start_date AND ay.end_date
ORDER BY i.name;
```

Expected: one row per institution, all naming 2026-2027 — no 2030-2031 or 2028-2029.

- [ ] **Step 5: Typecheck**

Run `mcp__ide__getDiagnostics` on all four modified files.
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add hooks/use-academic-years.ts "app/(routes)/hr/leave/apply/page.tsx" "app/(routes)/hr/leave/balance/page.tsx" "app/(routes)/hr/leave/encashment/page.tsx"
git commit -m "fix(hr/leave): select the academic year containing today

academic_year_name is TEXT, so a name-desc sort put '2030-2031' first.
Institutions pre-create future years with is_active=true, so Pharmacy
requested balances for 2030-2031 and Dental for 2028-2029 — years with no
balance rows, producing a silent empty leave-type dropdown.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# STAGE B — Balance Generator (the outage ends here)

## Task 5: `generate_hr_leave_balances` RPC

**Files:**
- Create: `supabase/migrations/20260721120100_generate_hr_leave_balances_rpc.sql`

**Interfaces:**
- Produces: `generate_hr_leave_balances(uuid, uuid, boolean) RETURNS jsonb` — consumed by Tasks 6 and 7.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260721120100_generate_hr_leave_balances_rpc.sql`:

```sql
-- Materialize hr_leave_balances for one org and academic year.
--
-- WHY: no code path has ever written this table. The 2358 existing rows were
-- seeded once by migration and never refreshed, so every staff member hit
-- "No leave balance configured for this academic year" once the seeded year
-- passed.
--
-- ORDERING REQUIREMENT: run this BEFORE anyone applies. hr_trig_update_leave_balance
-- inserts (entitled=0, used=total_days) on approval when no row exists,
-- producing a permanently negative balance that then blocks the employee.

CREATE OR REPLACE FUNCTION public.generate_hr_leave_balances(
  p_hr_org_id        uuid,
  p_academic_year_id uuid,
  p_dry_run          boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_created   integer := 0;
  v_skipped   integer := 0;
  v_fallback  jsonb   := '[]'::jsonb;
  v_inst_id   uuid;
  v_prior_ay  uuid;
  v_start     date;
  r           record;
BEGIN
  -- SECURITY DEFINER functions callable by `authenticated` must authorize
  -- themselves — the caller's RLS does not apply inside this body.
  IF NOT public.user_has_permission('hr.leave.balance.manage') THEN
    RAISE EXCEPTION 'Insufficient permission: hr.leave.balance.manage required';
  END IF;

  SELECT institution_id INTO v_inst_id FROM public.hr_organizations WHERE id = p_hr_org_id;
  IF v_inst_id IS NULL THEN
    RAISE EXCEPTION 'Unknown hr_organization_id %', p_hr_org_id;
  END IF;

  SELECT start_date INTO v_start FROM public.academic_years WHERE id = p_academic_year_id;
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Unknown academic_year_id %', p_academic_year_id;
  END IF;

  -- Prior year = same institution, greatest end_date strictly before this
  -- year's start_date. NEVER order by academic_year_name — it is TEXT and
  -- some values carry trailing spaces.
  SELECT id INTO v_prior_ay
  FROM public.academic_years
  WHERE institution_id = v_inst_id AND end_date < v_start
  ORDER BY end_date DESC
  LIMIT 1;

  FOR r IN
    SELECT
      s.id  AS staff_id,
      s.staff_id AS staff_code,
      s.first_name,
      s.last_name,
      d.cadre_id,
      t.id  AS leave_type_id,
      t.default_entitled_days,
      t.allow_carry_forward,
      t.max_carry_forward_days,
      e.entitled_days AS cadre_entitled
    FROM public.staff s
    CROSS JOIN public.hr_leave_types t
    LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
    LEFT JOIN public.hr_leave_type_entitlements e
           ON e.leave_type_id = t.id AND e.cadre_id = d.cadre_id
    WHERE s.institution_id = v_inst_id
      AND s.is_active
      AND t.hr_organization_id = p_hr_org_id
      AND t.is_active
      -- Eligibility filters (design D3)
      AND (t.applicable_cadre_ids IS NULL OR d.cadre_id = ANY(t.applicable_cadre_ids))
      AND (
        t.applicable_gender = 'all'
        OR lower(coalesce(s.gender, '')) = t.applicable_gender
      )
  LOOP
    DECLARE
      v_entitled numeric;
      v_carried  numeric := 0;
    BEGIN
      -- D6: cadre entitlement when resolvable, else the type default.
      v_entitled := COALESCE(r.cadre_entitled, r.default_entitled_days);

      IF r.cadre_entitled IS NULL THEN
        v_fallback := v_fallback || jsonb_build_object(
          'staff_code', r.staff_code,
          'name', trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')),
          'reason', CASE WHEN r.cadre_id IS NULL
                         THEN 'no cadre assigned'
                         ELSE 'no entitlement row for cadre' END
        );
      END IF;

      IF r.allow_carry_forward AND v_prior_ay IS NOT NULL THEN
        SELECT GREATEST(0, (b.entitled + b.carried_forward - b.used))
          INTO v_carried
        FROM public.hr_leave_balances b
        WHERE b.employee_id      = r.staff_id
          AND b.leave_type_id    = r.leave_type_id
          AND b.academic_year_id = v_prior_ay;

        v_carried := COALESCE(v_carried, 0);
        IF r.max_carry_forward_days IS NOT NULL THEN
          v_carried := LEAST(v_carried, r.max_carry_forward_days);
        END IF;
      END IF;

      IF p_dry_run THEN
        v_created := v_created + 1;
      ELSE
        INSERT INTO public.hr_leave_balances (
          employee_id, leave_type_id, academic_year_id, hr_organization_id,
          entitled, used, carried_forward
        ) VALUES (
          r.staff_id, r.leave_type_id, p_academic_year_id, p_hr_org_id,
          v_entitled, 0, v_carried
        )
        ON CONFLICT (employee_id, leave_type_id, academic_year_id) DO NOTHING;

        IF FOUND THEN v_created := v_created + 1;
        ELSE            v_skipped := v_skipped + 1;
        END IF;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run',       p_dry_run,
    'created',       v_created,
    'skipped',       v_skipped,
    'prior_year_id', v_prior_ay,
    'fallback_count', jsonb_array_length(v_fallback),
    'fallback',      v_fallback
  );
END $$;

REVOKE ALL ON FUNCTION public.generate_hr_leave_balances(uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_hr_leave_balances(uuid, uuid, boolean) TO authenticated;
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase MCP `apply_migration`, name `generate_hr_leave_balances_rpc`.

- [ ] **Step 3: Dry-run against JKKN Testing Institution**

```sql
SELECT public.generate_hr_leave_balances(
  '93044df2-9cfe-49eb-bb77-6aa0964c788e'::uuid,   -- JKKN Testing Institution org
  'f88b7054-f52a-4940-9a41-4e0682f13ac7'::uuid,   -- AY 2026-2027
  true                                             -- dry run
);
```

Expected: `dry_run: true`, `created > 0`, and `fallback_count` equal to `created` — because `hr_staff_details.cadre_id` is 0/543 populated, every row must currently fall back to the type default. A `fallback_count` of 0 means the eligibility join is wrong; investigate before writing.

- [ ] **Step 4: Run for real**

```sql
SELECT public.generate_hr_leave_balances(
  '93044df2-9cfe-49eb-bb77-6aa0964c788e'::uuid,
  'f88b7054-f52a-4940-9a41-4e0682f13ac7'::uuid,
  false
);
```

- [ ] **Step 5: Verify the test user is unblocked**

```sql
SELECT t.leave_type_name, b.entitled, b.used, b.carried_forward
FROM hr_leave_balances b
JOIN hr_leave_types t ON t.id = b.leave_type_id
WHERE b.employee_id = '403db380-17b6-46dc-91ed-b8403deeaf9c'
  AND b.academic_year_id = 'f88b7054-f52a-4940-9a41-4e0682f13ac7'
ORDER BY t.leave_type_name;
```

Expected: 6 rows (Casual, Compensatory Off, Half Pay, On-Duty, Permission, Vacation) with `used = 0`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260721120100_generate_hr_leave_balances_rpc.sql
git commit -m "feat(hr/leave): add generate_hr_leave_balances RPC

Materializes per-employee balances for an academic year from cadre
entitlements, falling back to the leave type default when no cadre resolves
(currently every staff member — hr_staff_details.cadre_id is 0/543 populated).

Idempotent via ON CONFLICT on the real (employee, type, year) constraint.
Self-authorizes on hr.leave.balance.manage since SECURITY DEFINER bypasses
the caller's RLS.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Service + hooks for the catalog and generator

**Files:**
- Create: `lib/services/hr/leave-type-service.ts`
- Create: `hooks/hr/use-hr-leave-types.ts`

**Interfaces:**
- Consumes: `HRLeaveType*` types (Task 2), `generate_hr_leave_balances` RPC (Task 5).
- Produces: `HRLeaveTypeService.{list,create,update,remove,generateBalances}`; hooks `useHRLeaveTypes`, `useCreateHRLeaveType`, `useUpdateHRLeaveType`, `useDeleteHRLeaveType`, `useGenerateBalances` — consumed by Tasks 7 and 10.

- [ ] **Step 1: Write the service**

Create `lib/services/hr/leave-type-service.ts`:

```typescript
/**
 * HR Leave Types service.
 *
 * Static class, SupabaseClient passed as first argument — mirrors
 * ShiftService / RecruitmentJobsService.
 *
 * Supabase errors are plain objects, not Error instances, so every call
 * destructures { error } and throws it. try/catch alone does NOT surface RLS
 * denials or constraint violations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRLeaveType,
  HRLeaveTypeFilters,
  HRLeaveTypeInsert,
  HRLeaveTypeUpdate,
} from '@/types/hr-leave-types';

export interface GenerateBalancesResult {
  dry_run: boolean;
  created: number;
  skipped: number;
  prior_year_id: string | null;
  fallback_count: number;
  fallback: Array<{ staff_code: string; name: string; reason: string }>;
}

export class HRLeaveTypeService {
  static async list(
    supabase: SupabaseClient,
    filters: HRLeaveTypeFilters = {}
  ): Promise<HRLeaveType[]> {
    let query = supabase
      .from('hr_leave_types')
      .select('*')
      .order('display_order', { ascending: true })
      .order('leave_type_name', { ascending: true });

    // `??` not `||` — `||` coerces undefined to '' which is sent as a real
    // uuid parameter and matches zero rows.
    if (filters.hr_organization_id != null) {
      query = query.eq('hr_organization_id', filters.hr_organization_id);
    }
    if (filters.is_active != null) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters.search) {
      query = query.or(
        `leave_type_name.ilike.%${filters.search}%,leave_type_code.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as HRLeaveType[];
  }

  static async create(
    supabase: SupabaseClient,
    payload: HRLeaveTypeInsert
  ): Promise<HRLeaveType> {
    const { data, error } = await supabase
      .from('hr_leave_types')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveType;
  }

  static async update(
    supabase: SupabaseClient,
    id: string,
    patch: HRLeaveTypeUpdate
  ): Promise<HRLeaveType> {
    const { data, error } = await supabase
      .from('hr_leave_types')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveType;
  }

  /**
   * Soft-archive. Hard delete is intentionally not exposed: hr_leave_balances
   * and hr_leave_applications FK to this table, so removing a type in use
   * would either fail or orphan history.
   */
  static async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('hr_leave_types')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  }

  static async generateBalances(
    supabase: SupabaseClient,
    hrOrgId: string,
    academicYearId: string,
    dryRun: boolean
  ): Promise<GenerateBalancesResult> {
    const { data, error } = await supabase.rpc('generate_hr_leave_balances', {
      p_hr_org_id: hrOrgId,
      p_academic_year_id: academicYearId,
      p_dry_run: dryRun,
    });
    if (error) throw error;
    return data as GenerateBalancesResult;
  }
}
```

- [ ] **Step 2: Write the hooks**

Create `hooks/hr/use-hr-leave-types.ts`:

```typescript
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { HRLeaveTypeService } from '@/lib/services/hr/leave-type-service';
import type {
  HRLeaveTypeFilters,
  HRLeaveTypeInsert,
  HRLeaveTypeUpdate,
} from '@/types/hr-leave-types';

const KEY = 'hr-leave-types';

export function useHRLeaveTypes(filters: HRLeaveTypeFilters = {}) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: () => HRLeaveTypeService.list(supabase, filters),
  });
}

export function useCreateHRLeaveType() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (payload: HRLeaveTypeInsert) =>
      HRLeaveTypeService.create(supabase, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateHRLeaveType() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: HRLeaveTypeUpdate }) =>
      HRLeaveTypeService.update(supabase, id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteHRLeaveType() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (id: string) => HRLeaveTypeService.remove(supabase, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useGenerateBalances() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({
      hrOrgId,
      academicYearId,
      dryRun,
    }: {
      hrOrgId: string;
      academicYearId: string;
      dryRun: boolean;
    }) =>
      HRLeaveTypeService.generateBalances(supabase, hrOrgId, academicYearId, dryRun),
    onSuccess: (_data, vars) => {
      if (!vars.dryRun) {
        qc.invalidateQueries({ queryKey: ['hr-leave-balance'] });
      }
    },
  });
}
```

- [ ] **Step 3: Typecheck**

Run `mcp__ide__getDiagnostics` on both new files.
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/services/hr/leave-type-service.ts hooks/hr/use-hr-leave-types.ts
git commit -m "feat(hr/leave): HRLeaveTypeService and React Query hooks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Balance generator page

**Files:**
- Create: `app/(routes)/hr/admin/leave-balances/page.tsx`

**Interfaces:**
- Consumes: `useGenerateBalances` (Task 6), `useHrOrgMappings`, `useAcademicYears`.

- [ ] **Step 1: Write the page**

Create `app/(routes)/hr/admin/leave-balances/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useGenerateBalances } from '@/hooks/hr/use-hr-leave-types';
import type { GenerateBalancesResult } from '@/lib/services/hr/leave-type-service';
import { getErrorMessage } from '@/lib/utils';

export default function GenerateLeaveBalancesPage() {
  const { mappings, institutionIdByOrg } = useHrOrgMappings();
  const [hrOrgId, setHrOrgId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [result, setResult] = useState<GenerateBalancesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const institutionId = hrOrgId ? institutionIdByOrg.get(hrOrgId) : undefined;
  const { data: yearsResp } = useAcademicYears(institutionId);
  const mutation = useGenerateBalances();

  const run = async (dryRun: boolean) => {
    setError(null);
    try {
      const res = await mutation.mutateAsync({ hrOrgId, academicYearId, dryRun });
      setResult(res);
    } catch (err) {
      // Supabase errors are plain objects, not Error instances.
      setError(getErrorMessage(err));
      setResult(null);
    }
  };

  const canRun = !!hrOrgId && !!academicYearId && !mutation.isPending;

  return (
    <PermissionGuard module="hr.leave.balance" action="manage">
      <ContentLayout title="Generate Leave Balances">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/admin">Admin</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Leave Balances</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="mt-4">
          <CardHeader><CardTitle>Generate balances for an academic year</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Run this <strong>before</strong> team members apply for leave. Approving leave with no
                balance row creates one with zero entitlement and non-zero usage, leaving a
                permanently negative balance. Always preview first.
              </AlertDescription>
            </Alert>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Organization</Label>
                <Select value={hrOrgId} onValueChange={(v) => { setHrOrgId(v); setAcademicYearId(''); setResult(null); }}>
                  <SelectTrigger><SelectValue placeholder="Select an organization" /></SelectTrigger>
                  <SelectContent>
                    {mappings.map((m) => (
                      <SelectItem key={m.hr_organization_id} value={m.hr_organization_id}>
                        {m.organization_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Academic Year</Label>
                <Select value={academicYearId} onValueChange={(v) => { setAcademicYearId(v); setResult(null); }} disabled={!hrOrgId}>
                  <SelectTrigger><SelectValue placeholder="Select an academic year" /></SelectTrigger>
                  <SelectContent>
                    {(yearsResp?.data ?? []).map((y) => (
                      <SelectItem key={y.id} value={y.id}>{y.academic_year_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" disabled={!canRun} onClick={() => run(true)}>
                {mutation.isPending ? 'Working…' : 'Preview (dry run)'}
              </Button>
              <Button disabled={!canRun || !result?.dry_run} onClick={() => run(false)}>
                Generate
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {result && (
              <div className="border rounded-md p-4 space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  {result.dry_run ? 'Preview' : 'Generated'}
                </div>
                <p className="text-sm">
                  {result.dry_run ? 'Would create' : 'Created'} <strong>{result.created}</strong> balance rows
                  {result.skipped > 0 && <> · <strong>{result.skipped}</strong> already existed</>}
                </p>
                {result.fallback_count > 0 && (
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-1">
                      <strong>{result.fallback_count}</strong> used the leave type default because no
                      cadre entitlement resolved:
                    </p>
                    <ul className="max-h-48 overflow-y-auto list-disc pl-5">
                      {result.fallback.slice(0, 100).map((f, i) => (
                        <li key={`${f.staff_code}-${i}`}>{f.staff_code} {f.name} — {f.reason}</li>
                      ))}
                    </ul>
                    {result.fallback.length > 100 && <p className="mt-1">…and {result.fallback.length - 100} more</p>}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </ContentLayout>
    </PermissionGuard>
  );
}
```

- [ ] **Step 2: Confirm the `useHrOrgMappings` surface**

```bash
cd "D:/Projects/MyJKKN" && grep -n "return\|export function\|orgs" hooks/hr/use-hr-org-mappings.ts
```

**Verified answer — do NOT invent a surface.** The hook returns `{ mappings, orgIdByInstitution, institutionIdByOrg, isLoading, error }`. There is **no `orgs` array**; do not add one. Use `mappings`, typed:

```typescript
export interface HrOrgMapping {
  institution_id: string;
  hr_organization_id: string;
  organization_name: string;
}
```

It is backed by the SECURITY DEFINER RPC `fn_hr_orgs_for_institutions`, which returns **only organizations for institutions the caller can access**. So the dropdown is already institution-scoped, and it complements the `role_has_institution_access` guard inside `generate_hr_leave_balances` — the UI cannot offer an org the RPC would then reject.

- [ ] **Step 3: Typecheck**

Run `mcp__ide__getDiagnostics` on the new page.
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/hr/admin/leave-balances/page.tsx" hooks/hr/use-hr-org-mappings.ts
git commit -m "feat(hr/leave): admin page to generate leave balances

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# STAGE C — Leave Types CRUD

## Task 8: HR Leave Types admin page

**Files:**
- Create: `app/(routes)/hr/admin/leave-types/page.tsx`
- Create: `app/(routes)/hr/admin/leave-types/_components/leave-type-form-dialog.tsx`

**Interfaces:**
- Consumes: `useHRLeaveTypes`, `useCreateHRLeaveType`, `useUpdateHRLeaveType`, `useDeleteHRLeaveType` (Task 6); `HRLeaveType*` types (Task 2).

- [ ] **Step 1: Write the form dialog**

Create `app/(routes)/hr/admin/leave-types/_components/leave-type-form-dialog.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateHRLeaveType, useUpdateHRLeaveType } from '@/hooks/hr/use-hr-leave-types';
import { ACCRUAL_TYPE_LABELS, APPLICABLE_GENDER_LABELS } from '@/types/hr-leave-types';
import type { HRLeaveType, LeaveAccrualType, LeaveApplicableGender, LeaveDurationType } from '@/types/hr-leave-types';
import { getErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  hrOrgId: string;
  leaveType?: HRLeaveType | null;
}

const EMPTY = {
  leave_type_code: '', leave_type_name: '', description: '',
  color_code: '#6B7280', display_order: 0, is_active: true,
  duration_type: 'full' as LeaveDurationType, allow_half_day: false, allow_hourly: false,
  skip_weekends: true, skip_holidays: true,
  requires_approval: true, is_paid: true,
  min_advance_notice_days: 0, max_continuous_days: '' as number | '' ,
  requires_documents: false, document_required_after_days: '' as number | '',
  default_entitled_days: 0,
  allow_carry_forward: false, max_carry_forward_days: '' as number | '',
  is_encashable: false, max_encashable_days: '' as number | '',
  accrual_type: 'none' as LeaveAccrualType, accrual_rate: 0,
  applicable_gender: 'all' as LeaveApplicableGender,
};

export function LeaveTypeFormDialog({ open, onOpenChange, hrOrgId, leaveType }: Props) {
  const [form, setForm] = useState({ ...EMPTY });
  const create = useCreateHRLeaveType();
  const update = useUpdateHRLeaveType();
  const isEdit = !!leaveType;

  useEffect(() => {
    if (!open) return;
    if (leaveType) {
      setForm({
        ...EMPTY,
        ...leaveType,
        description: leaveType.description ?? '',
        max_continuous_days: leaveType.max_continuous_days ?? '',
        document_required_after_days: leaveType.document_required_after_days ?? '',
        max_carry_forward_days: leaveType.max_carry_forward_days ?? '',
        max_encashable_days: leaveType.max_encashable_days ?? '',
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [open, leaveType]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Numeric fields left blank must go to the DB as null, not '' — an empty
  // string sent for a numeric/uuid column raises 22P02.
  const nullable = (v: number | '') => (v === '' ? null : Number(v));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      hr_organization_id: hrOrgId,
      description: form.description || null,
      max_continuous_days: nullable(form.max_continuous_days),
      document_required_after_days: nullable(form.document_required_after_days),
      max_carry_forward_days: nullable(form.max_carry_forward_days),
      max_encashable_days: nullable(form.max_encashable_days),
      applicable_cadre_ids: null,
      valid_from: leaveType?.valid_from ?? new Date().toISOString(),
      valid_until: leaveType?.valid_until ?? null,
      superseded_by: leaveType?.superseded_by ?? null,
    };

    try {
      if (isEdit) {
        await update.mutateAsync({ id: leaveType!.id, patch: payload });
        toast.success('Leave type updated');
      } else {
        await create.mutateAsync(payload as never);
        toast.success('Leave type created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Add'} Leave Type</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Identity</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="code">Code</Label>
                <Input id="code" value={form.leave_type_code}
                  onChange={(e) => set('leave_type_code', e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={form.leave_type_name}
                  onChange={(e) => set('leave_type_name', e.target.value)} required />
              </div>
            </div>
            <div>
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" value={form.description}
                onChange={(e) => set('description', e.target.value)} />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Duration &amp; day counting</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Duration type</Label>
                <Select value={form.duration_type}
                  onValueChange={(v) => set('duration_type', v as LeaveDurationType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full day</SelectItem>
                    <SelectItem value="first_half">First half</SelectItem>
                    <SelectItem value="second_half">Second half</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="entitled">Default entitled days</Label>
                <Input id="entitled" type="number" step="0.5" value={form.default_entitled_days}
                  onChange={(e) => set('default_entitled_days', Number(e.target.value))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              {([
                ['allow_half_day', 'Allow half day'],
                ['allow_hourly', 'Allow hourly'],
                ['skip_weekends', 'Skip weekends'],
                ['skip_holidays', 'Skip holidays'],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form[k]} onCheckedChange={(c) => set(k, !!c)} />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Policy</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="notice">Min advance notice (days)</Label>
                <Input id="notice" type="number" min="0" value={form.min_advance_notice_days}
                  onChange={(e) => set('min_advance_notice_days', Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="maxcont">Max continuous days (blank = unlimited)</Label>
                <Input id="maxcont" type="number" min="1" value={form.max_continuous_days}
                  onChange={(e) => set('max_continuous_days', e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.requires_approval} onCheckedChange={(c) => set('requires_approval', !!c)} />
                Requires approval
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_paid} onCheckedChange={(c) => set('is_paid', !!c)} />
                Paid leave
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.requires_documents} onCheckedChange={(c) => set('requires_documents', !!c)} />
                Requires documents
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Carry-forward, encashment &amp; accrual</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.allow_carry_forward} onCheckedChange={(c) => set('allow_carry_forward', !!c)} />
                  Allow carry-forward
                </label>
                <Input type="number" step="0.5" placeholder="Max carry-forward days"
                  disabled={!form.allow_carry_forward} value={form.max_carry_forward_days}
                  onChange={(e) => set('max_carry_forward_days', e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.is_encashable} onCheckedChange={(c) => set('is_encashable', !!c)} />
                  Encashable
                </label>
                <Input type="number" step="0.5" placeholder="Max encashable days"
                  disabled={!form.is_encashable} value={form.max_encashable_days}
                  onChange={(e) => set('max_encashable_days', e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div>
                <Label>Accrual</Label>
                <Select value={form.accrual_type} onValueChange={(v) => set('accrual_type', v as LeaveAccrualType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACCRUAL_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Applicable to</Label>
                <Select value={form.applicable_gender} onValueChange={(v) => set('applicable_gender', v as LeaveApplicableGender)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPLICABLE_GENDER_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write the list page**

Create `app/(routes)/hr/admin/leave-types/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Plus, Pencil, Archive } from 'lucide-react';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import { useHRLeaveTypes, useDeleteHRLeaveType } from '@/hooks/hr/use-hr-leave-types';
import { LeaveTypeFormDialog } from './_components/leave-type-form-dialog';
import type { HRLeaveType } from '@/types/hr-leave-types';
import { getErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';

export default function HRLeaveTypesPage() {
  const { mappings } = useHrOrgMappings();
  const [hrOrgId, setHrOrgId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HRLeaveType | null>(null);

  const { data: types, isLoading } = useHRLeaveTypes(
    hrOrgId ? { hr_organization_id: hrOrgId } : {}
  );
  const archive = useDeleteHRLeaveType();

  const onArchive = async (t: HRLeaveType) => {
    try {
      await archive.mutateAsync(t.id);
      toast.success(`${t.leave_type_name} archived`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <PermissionGuard module="hr.leave.types" action="manage">
      <ContentLayout title="HR Leave Types">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/admin">Admin</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Leave Types</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="mt-4">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div className="w-72">
                <Label>Organization</Label>
                <Select value={hrOrgId} onValueChange={setHrOrgId}>
                  <SelectTrigger><SelectValue placeholder="All organizations" /></SelectTrigger>
                  <SelectContent>
                    {mappings.map((m) => (
                      <SelectItem key={m.hr_organization_id} value={m.hr_organization_id}>
                        {m.organization_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={!hrOrgId} onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Add Leave Type
              </Button>
            </div>

            {!hrOrgId && (
              <p className="text-sm text-muted-foreground">
                Select an organization to add a leave type. Leave types are scoped per organization.
              </p>
            )}

            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

            {!isLoading && (types ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No leave types configured.</p>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              {(types ?? []).map((t) => (
                <div key={t.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full" style={{ background: t.color_code }} />
                        {t.leave_type_name}
                        {!t.is_active && <Badge variant="secondary">Archived</Badge>}
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{t.leave_type_code}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setDialogOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {t.is_active && (
                        <Button size="icon" variant="ghost" onClick={() => onArchive(t)}>
                          <Archive className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{t.default_entitled_days} days</Badge>
                    <Badge variant="outline">{t.duration_type}</Badge>
                    {t.is_paid && <Badge variant="outline">Paid</Badge>}
                    {t.allow_carry_forward && <Badge variant="outline">Carry-forward</Badge>}
                    {t.is_encashable && <Badge variant="outline">Encashable</Badge>}
                    {t.applicable_gender !== 'all' && <Badge variant="outline">{t.applicable_gender}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <LeaveTypeFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          hrOrgId={hrOrgId}
          leaveType={editing}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
```

- [ ] **Step 3: Typecheck**

Run `mcp__ide__getDiagnostics` on both new files.
Expected: no errors. If `toast` from `sonner` is not the project's toast, check `components/ui/` and match the existing import.

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/hr/admin/leave-types/"
git commit -m "feat(hr/leave): HR Leave Types admin page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Permission keys, grants, and navigation

**Files:**
- Modify: `lib/constants/permissions.ts`
- Modify: `lib/sidebarMenuLink.ts`
- Modify: `lib/permissions-audit/module-mappings.ts`
- Modify: `app/(routes)/hr/nav-config.ts`
- Create: `supabase/migrations/20260721120200_hr_leave_types_permission_grants.sql`

- [ ] **Step 1: Catalog the new keys**

In `lib/constants/permissions.ts`, in the HR section near the existing `hr.leave.*` entries (~line 690), add:

```typescript
      { key: 'hr.leave.types.manage', label: 'Manage HR Leave Types' },
      { key: 'hr.leave.balance.manage', label: 'Generate Leave Balances' },
```

Keys must be unique across the whole catalog — `check:permissions` fails on duplicates.

- [ ] **Step 2: Add MENU_PERMISSIONS entries**

In `lib/sidebarMenuLink.ts`, alongside the other `/hr/admin/*` entries (~line 318-336):

```typescript
  '/hr/admin/leave-types': 'hr.leave.types.manage',
  '/hr/admin/leave-balances': 'hr.leave.balance.manage',
```

**A missing entry means default-DENY**, and the page silently 302s.

- [ ] **Step 3: Add the sidebar rows**

In the HR Admin submenu array in `lib/sidebarMenuLink.ts` (~line 2127), add alongside the existing admin child entries:

```typescript
            { href: '/hr/admin/leave-types', label: 'Leave Types', active: pathname.startsWith('/hr/admin/leave-types') },
            { href: '/hr/admin/leave-balances', label: 'Leave Balances', active: pathname.startsWith('/hr/admin/leave-balances') },
```

- [ ] **Step 4: Verify the permissions audit map already covers these routes**

`lib/permissions-audit/module-mappings.ts` uses **longest-prefix matching**, and line 240 already contains:

```typescript
  ['/hr', 'Staff'],
```

`/hr/admin/leave-types` and `/hr/admin/leave-balances` therefore resolve to the `Staff` module with no edit. **Do not add more specific entries** — a redundant longer prefix would work but adds drift. Confirm with:

```bash
cd "D:/Projects/MyJKKN" && npm run check:audit-coverage
```

Expected: pass. If it fails naming these routes, only then add `['/hr/admin', 'Staff']`.

- [ ] **Step 5: Add the routes to nav-config matchPaths**

`app/(routes)/hr/nav-config.ts` ends with an Admin group that has **no `children` array** (lines 253-258). `check-nav-reachability.ts` only counts URLs appearing as a literal `href` or an exact `matchPaths` entry, so extend `matchPaths`:

```typescript
    {
      label: 'Admin',
      icon: 'Settings',
      href: '/hr/admin',
      matchPaths: ['/hr/admin', '/hr/admin/leave-types', '/hr/admin/leave-balances'],
    },
```

Without this, the two new routes count as unreachable and push `check:reachability` toward its `--max-unreachable 60` ceiling.

**Not applicable:** `components/BottomNav/bottom-nav-more-menu.tsx` — `GROUP_TILE_GRADIENTS` is keyed by *groupLabel*, and these routes join the existing "Admin" group rather than creating a new one. No edit needed.

- [ ] **Step 6: Write the grants migration**

Create `supabase/migrations/20260721120200_hr_leave_types_permission_grants.sql`:

```sql
-- Grant the new HR leave admin keys.
--
-- A key declared in lib/constants/permissions.ts does NOTHING until it is
-- present in custom_roles.permissions. Pages render empty without this.
--
-- Granted to roles that already hold hr.dashboard.view TRUE — the gate every
-- other /hr/admin/* route uses. Test by VALUE, not key presence: 63 roles
-- carry HR keys explicitly set to false.

UPDATE public.custom_roles
SET permissions = permissions
  || jsonb_build_object('hr.leave.types.manage', true)
  || jsonb_build_object('hr.leave.balance.manage', true)
WHERE (permissions->>'hr.dashboard.view')::boolean IS TRUE;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.custom_roles
  WHERE (permissions->>'hr.leave.types.manage')::boolean IS TRUE;
  RAISE NOTICE 'hr.leave.types.manage granted to % roles', v_count;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'No role received hr.leave.types.manage — pages would render empty';
  END IF;
END $$;
```

- [ ] **Step 7: Apply and verify grants by value**

Apply via Supabase MCP `apply_migration`, name `hr_leave_types_permission_grants`. Then:

```sql
SELECT
  count(*) FILTER (WHERE (permissions->>'hr.leave.types.manage')::boolean IS TRUE)   AS types_manage,
  count(*) FILTER (WHERE (permissions->>'hr.leave.balance.manage')::boolean IS TRUE) AS balance_manage
FROM custom_roles;
```

Expected: both > 0.

- [ ] **Step 7b: Complete the deferred cross-tenant verification from Task 5**

Task 5's `generate_hr_leave_balances` RPC carries an institution guard added in response to a HIGH security finding. Its negative case could not be verified at the time, because no role held `hr.leave.balance.manage` — every non-super-admin was stopped at the permission gate *before* reaching the institution check. Step 7 has now granted that key, so the guard is finally reachable. Verify it:

```sql
-- Pick a non-super-admin profile that HOLDS hr.leave.balance.manage but whose
-- roles do NOT grant access to JKKN Testing Institution.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<that-profile-uuid>","role":"authenticated"}';
SELECT public.generate_hr_leave_balances(
  '93044df2-9cfe-49eb-bb77-6aa0964c788e'::uuid,   -- Testing Institution org
  'f88b7054-f52a-4940-9a41-4e0682f13ac7'::uuid,
  true
);
ROLLBACK;
```

Expected: `RAISE EXCEPTION 'Access denied: you do not have access to institution …'` — **not** a successful dry-run result. If it succeeds, the guard is ineffective and that is a Critical finding: report it rather than proceeding.

If no such profile exists (i.e. every holder of the key also has access to every institution), say so plainly rather than claiming a verification you did not perform.

- [ ] **Step 8: Regenerate the route manifest and run the gates**

```bash
cd "D:/Projects/MyJKKN" && npm run gen:routes && npm run check:sidebar && npm run check:reachability && npm run check:audit-coverage
```

Expected: all pass. Note `check:menus` fails at HEAD on an unrelated pre-existing issue (`/system` has no `MENU_PERMISSIONS` entry) — not a regression.

- [ ] **Step 9: Commit**

```bash
git add lib/constants/permissions.ts lib/sidebarMenuLink.ts lib/permissions-audit/module-mappings.ts "app/(routes)/hr/nav-config.ts" lib/navigation/route-manifest.generated.ts supabase/migrations/20260721120200_hr_leave_types_permission_grants.sql
git commit -m "feat(hr/leave): permission keys, grants and navigation for leave admin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: End-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Assert the database end state**

```sql
SELECT
  (SELECT count(*) FROM hr_leave_types) AS hr_types,
  (SELECT count(*) FROM leave_types WHERE scope='staff') AS stale,
  (SELECT count(*) FROM hr_leave_balances
     WHERE academic_year_id='f88b7054-f52a-4940-9a41-4e0682f13ac7') AS testing_inst_2026_27,
  (SELECT count(*) FROM hr_leave_balances b
     WHERE NOT EXISTS (SELECT 1 FROM hr_leave_types t WHERE t.id=b.leave_type_id)) AS orphans;
```

Expected: `hr_types=66, stale=0, testing_inst_2026_27 > 0, orphans=0`.

- [ ] **Step 2: Typecheck every touched file**

Run `mcp__ide__getDiagnostics` on each file listed in the File Structure table.
Expected: no errors.

- [ ] **Step 3: Browser test as the reporting user**

Start the dev server:

```bash
cd "D:/Projects/MyJKKN" && npm run dev
```

Log in as **faculty@jkkn.ac.in** (Boobalan A, JEI001) — **a plain faculty role, not super-admin**. Super-admin bypasses the permission checks that matter here.

Navigate to `http://localhost:3000/hr/leave/apply` and confirm:
- The Leave Type dropdown lists 6 types with "— N day(s) available"
- The "No leave balance configured…" alert is **gone**
- Selecting a type, dates and a reason enables **Submit Application**
- Submitting creates a row: `SELECT count(*) FROM hr_leave_applications;` returns 1

- [ ] **Step 4: Browser test the admin pages**

As an HR admin role, confirm `/hr/admin/leave-types` lists types for a selected organization and that create/edit/archive round-trip. Confirm `/hr/admin/leave-balances` dry-run reports a fallback count equal to the created count.

- [ ] **Step 5: Confirm the academic page is unaffected**

Navigate to `/academic/leaves/settings/types`. It should now list only the 9 learner types plus the new holiday labels — no team member types.

- [ ] **Step 6: Final commit and push**

```bash
cd "D:/Projects/MyJKKN" && git push -u origin feat/hr-leave-types-admin
```

Then open a PR — `main` is protected and requires a PR plus checks.

---

# Deferred to a follow-up plan (Stage D)

Not in scope here:

- `/hr/admin/leave-entitlements` — cadre × leave type matrix UI
- `/hr/admin/staff-cadres` — bulk cadre assignment for 740 team members, suggested from the 165 distinct `staff.designation` strings

Until Stage D ships, every team member receives `default_entitled_days` from the leave type. This is expected and reported by the generator's fallback list — not a defect. Per-cadre entitlements become meaningful only once cadres are assigned (`hr_staff_details.cadre_id` is currently 0 of 543).

Also still open from the spec, unchanged by this plan:
- Leave application comments are broken (column drift: code writes `body`/`author_id`, table has `comment`/`commenter_id` plus a NOT NULL `hr_organization_id` never supplied)
- No document uploader is wired — `documents` is always sent as `[]`
