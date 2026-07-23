# Hostel Residents Current-Year Billing Status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, per hosteler on the Campus Living → Residents → Learners tab, their current-academic-year billing rollup (bills generated? paid/partial/unpaid? + Billed/Paid/Outstanding amounts), fetched from the billing module.

**Architecture:** A new SECURITY DEFINER aggregate RPC returns per-student current-year bill rollups (scoped to the caller's accessible institutions), batched over each page of the Learners table. The hostel bill-generation RPC is extended to stamp `academic_year_id` so hostel bills are included. Two display columns are added.

**Tech Stack:** Postgres (plpgsql RPCs), Supabase RLS, Next.js 16 / React 19, TanStack Table (`DataTable`), Shadcn UI. **No test runner** — verify via `mcp__ide__getDiagnostics`, SQL checks, and manual browser smoke.

**Spec:** `docs/superpowers/specs/2026-06-06-hostel-residents-current-year-billing-status-design.md`

---

## Pre-flight
- Branch: confirm with the user whether to work on `main` (recent precedent) or a feature branch. The working tree should be clean (prior features pushed).
- Verified facts used below: `_user_accessible_institutions()` returns `uuid[]` (all institutions for super-admin, the accessible set otherwise, empty for no-access). `campus_living.residents.view` is a real catalog key (permissions.ts:1290) held by the residents-page roles. `v_learner_hostelites.id` = `learners_profiles.id` = `billing_student_bills.student_id`. `billing_student_bills.balance_amount` = per-bill outstanding (0 when paid). Zero hostel bills exist (no backfill).
- The path `.git/index.lock` has gone stale repeatedly (background GitHub Desktop). If a git command fails on the lock, check `ls -la .git/index.lock` age (>1hr / 0 bytes ⇒ `rm -f` it).

---

## Task 1: Stamp `academic_year_id` on hostel-generated bills

**Files:**
- Create: `supabase/migrations/20260606120000_stamp_academic_year_on_hostel_generated_bills.sql`
- Modify: `supabase/setup/02_functions.sql` (mirror)

- [ ] **Step 1: Write the migration (full `CREATE OR REPLACE`)**

Create `supabase/migrations/20260606120000_stamp_academic_year_on_hostel_generated_bills.sql` with EXACTLY this body (it is the current function plus `academic_year_id` added to BOTH inserts; everything else is unchanged):

```sql
-- Stamp academic_year_id on hostel-generated bills so they appear in the
-- academic-year-based billing rollup on /campus-living/residents (Learners tab).
-- Value = the learner's current academic year (lp.academic_year_id, already in
-- scope). Only the two INSERT column-lists/values change vs the prior version.

CREATE OR REPLACE FUNCTION public.campus_living_generate_hostel_year_bills(p_hostel_year_id uuid, p_learner_ids uuid[], p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result      jsonb := '[]'::jsonb;
  v_learner     uuid;
  lp            learners_profiles%ROWTYPE;
  v_year        int;
  v_academic    jsonb;
  v_hostel      jsonb;
  v_item        jsonb;
  v_proposed    jsonb;
  v_skipped     jsonb;
  v_new         int;
  v_exists      boolean;
  v_cat         uuid;
  v_pkg         uuid;
  v_src         text;
BEGIN
  -- permission gate (reuse campus_living.fees.config or the new fees.generate key)
  IF NOT public.user_has_permission('campus_living.fees.config') THEN
    RAISE EXCEPTION 'permission denied: campus_living.fees.config' USING ERRCODE = '42501';
  END IF;

  FOREACH v_learner IN ARRAY p_learner_ids LOOP
    SELECT * INTO lp FROM learners_profiles WHERE id = v_learner;
    CONTINUE WHEN NOT FOUND;
    -- hostellers only
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM accommodation_types a WHERE a.id = lp.accommodation_type_id AND a.code = 'hostel');

    v_year     := COALESCE(public.fn_learner_year_of_study(v_learner), 1);
    v_academic := public.admission_resolve_fee_items_readonly(v_learner, v_year);
    v_hostel   := public.campus_living_resolve_hostel_fee(v_learner, p_hostel_year_id);
    v_proposed := '[]'::jsonb; v_skipped := '[]'::jsonb; v_new := 0;

    -- academic items (fee_source='academic', keyed by billing_category_id)
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_academic,'[]'::jsonb)) LOOP
      v_cat := (v_item->>'billing_category_id')::uuid; v_src := 'academic';
      SELECT EXISTS(SELECT 1 FROM billing_student_bills b
        WHERE b.student_id = v_learner AND b.hostel_year_id = p_hostel_year_id
          AND b.item_category_id = v_cat AND b.fee_source IN ('academic','hostel_category')
          AND b.status NOT IN ('cancelled','superseded')) INTO v_exists;
      IF v_exists THEN v_skipped := v_skipped || (v_item || jsonb_build_object('fee_source','academic'));
      ELSE
        v_proposed := v_proposed || (v_item || jsonb_build_object('fee_source',v_src));
        IF NOT p_dry_run THEN
          INSERT INTO billing_student_bills (student_id, institution_id, item_category_id,
            hostel_year_id, fee_source, applies_year_of_study, academic_year_id, bill_description, due_date,
            quantity, unit_amount, total_amount, final_amount, balance_amount, status)
          VALUES (v_learner, lp.institution_id, v_cat, p_hostel_year_id, v_src, v_year, lp.academic_year_id,
            v_item->>'category_name', now()+interval '30 day', 1,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric, 'unpaid')
          ON CONFLICT DO NOTHING;  -- partial unique index is the final guard
        END IF;
        v_new := v_new + 1;
      END IF;
    END LOOP;

    -- hostel/mess items (fee_source from resolver: hostel_package | hostel_category)
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_hostel,'[]'::jsonb)) LOOP
      v_src := v_item->>'fee_source'; v_cat := NULLIF(v_item->>'category_id','')::uuid;
      v_pkg := NULLIF(v_item->>'package_id','')::uuid;
      IF v_src = 'hostel_package' THEN
        SELECT EXISTS(SELECT 1 FROM billing_student_bills b WHERE b.student_id=v_learner
          AND b.hostel_year_id=p_hostel_year_id AND b.package_id=v_pkg
          AND b.fee_source='hostel_package' AND b.status NOT IN ('cancelled','superseded')) INTO v_exists;
      ELSE
        SELECT EXISTS(SELECT 1 FROM billing_student_bills b WHERE b.student_id=v_learner
          AND b.hostel_year_id=p_hostel_year_id AND b.item_category_id=v_cat
          AND b.fee_source IN ('academic','hostel_category') AND b.status NOT IN ('cancelled','superseded')) INTO v_exists;
      END IF;
      IF v_exists THEN v_skipped := v_skipped || v_item;
      ELSE
        v_proposed := v_proposed || v_item;
        IF NOT p_dry_run THEN
          INSERT INTO billing_student_bills (student_id, institution_id, item_category_id,
            hostel_year_id, package_id, fee_source, academic_year_id, bill_description, due_date,
            quantity, unit_amount, total_amount, final_amount, balance_amount, status)
          VALUES (v_learner, lp.institution_id, v_cat, p_hostel_year_id, v_pkg, v_src, lp.academic_year_id,
            v_item->>'category_name', now()+interval '30 day', 1,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric, 'unpaid')
          ON CONFLICT DO NOTHING;  -- partial unique index is the final guard
        END IF;
        v_new := v_new + 1;
      END IF;
    END LOOP;

    v_result := v_result || jsonb_build_object(
      'learner_id', v_learner, 'year_of_study', v_year,
      'proposed', v_proposed, 'skipped', v_skipped, 'new_count', v_new);
  END LOOP;

  RETURN v_result;
END $function$;
```

- [ ] **Step 2: Apply the migration**

Use MCP `mcp__supabase__apply_migration`, name `stamp_academic_year_on_hostel_generated_bills`, query = the exact body above (commit the real body — no placeholder).

- [ ] **Step 3: Verify both inserts now carry `academic_year_id`**

Run `mcp__supabase__execute_sql`:
```sql
select (length(pg_get_functiondef(oid)) > 0) as exists,
       (pg_get_functiondef(oid) like '%academic_year_id, bill_description%') as academic_insert_has_col,
       (pg_get_functiondef(oid) like '%fee_source, academic_year_id, bill_description%') as hostel_insert_has_col
from pg_proc where proname='campus_living_generate_hostel_year_bills';
```
Expected: all three `true` (the academic insert ends `...applies_year_of_study, academic_year_id, bill_description...`; the hostel insert ends `...package_id, fee_source, academic_year_id, bill_description...`). Both patterns include `academic_year_id, bill_description`, so `academic_insert_has_col` and `hostel_insert_has_col` both match; if either is false, the column wasn't added to that insert — fix and re-apply.

- [ ] **Step 4: Mirror into the setup reference file**

In `supabase/setup/02_functions.sql`, find the existing `CREATE OR REPLACE FUNCTION public.campus_living_generate_hostel_year_bills` definition (Grep for it) and replace its body with the Step-1 body verbatim (so the reference file matches prod). If it is not present in that file, append the Step-1 body under the campus-living section.

- [ ] **Step 5: Commit**

```bash
git add "supabase/migrations/20260606120000_stamp_academic_year_on_hostel_generated_bills.sql" "supabase/setup/02_functions.sql"
git commit -m "feat(campus-living): stamp academic_year_id on hostel-generated bills

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Aggregate RPC `campus_living_get_hostelite_bill_status`

**Files:**
- Create: `supabase/migrations/20260606120500_campus_living_get_hostelite_bill_status.sql`
- Modify: `supabase/setup/02_functions.sql` (mirror)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260606120500_campus_living_get_hostelite_bill_status.sql`:

```sql
-- Per-student current-academic-year billing rollup for the Campus Living
-- Residents → Learners tab. SECURITY DEFINER so campus-living operators (who
-- typically lack billing.schedule.view) can read aggregates; scoped to the
-- caller's accessible institutions to prevent cross-institution leakage.

CREATE OR REPLACE FUNCTION public.campus_living_get_hostelite_bill_status(p_student_ids uuid[])
RETURNS TABLE (
  student_id uuid,
  academic_year_id uuid,
  academic_year_name text,
  bill_count integer,
  total_billed numeric,
  total_paid numeric,
  total_outstanding numeric,
  payment_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('campus_living.residents.view') THEN
    RAISE EXCEPTION 'permission denied: campus_living.residents.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH students AS (
    SELECT lp.id AS sid, lp.academic_year_id AS ayid
    FROM learners_profiles lp
    WHERE lp.id = ANY(p_student_ids)
      AND lp.institution_id = ANY(public._user_accessible_institutions())
  ),
  agg AS (
    SELECT b.student_id AS sid,
           count(*)::int AS bill_count,
           COALESCE(sum(b.final_amount), 0) AS total_billed,
           COALESCE(sum(b.balance_amount), 0) AS total_outstanding
    FROM billing_student_bills b
    JOIN students s ON s.sid = b.student_id
    WHERE s.ayid IS NOT NULL
      AND b.academic_year_id = s.ayid
      AND b.status NOT IN ('cancelled', 'superseded')
    GROUP BY b.student_id
  )
  SELECT
    s.sid,
    s.ayid,
    ay.academic_year_name::text,
    COALESCE(a.bill_count, 0)::int,
    COALESCE(a.total_billed, 0)::numeric,
    (COALESCE(a.total_billed, 0) - COALESCE(a.total_outstanding, 0))::numeric,
    COALESCE(a.total_outstanding, 0)::numeric,
    (CASE
      WHEN COALESCE(a.bill_count, 0) = 0 THEN 'none'
      WHEN COALESCE(a.total_outstanding, 0) <= 0 THEN 'paid'
      WHEN (COALESCE(a.total_billed, 0) - COALESCE(a.total_outstanding, 0)) > 0 THEN 'partial'
      ELSE 'unpaid'
    END)::text
  FROM students s
  LEFT JOIN agg a ON a.sid = s.sid
  LEFT JOIN academic_years ay ON ay.id = s.ayid;
END
$function$;

GRANT EXECUTE ON FUNCTION public.campus_living_get_hostelite_bill_status(uuid[]) TO authenticated;
```

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration`, name `campus_living_get_hostelite_bill_status`, query = the exact body above.

- [ ] **Step 3: Verify with real hosteler IDs**

Run `mcp__supabase__execute_sql` (this runs as the privileged MCP role; the permission gate uses `user_has_permission` which may behave differently here — if it raises, that's expected under MCP; the goal is to confirm the function parses, the columns resolve, and the shape is right):
```sql
-- grab a couple of real hosteler ids
with ids as (select id from v_learner_hostelites limit 3)
select * from public.campus_living_get_hostelite_bill_status(array(select id from ids));
```
Expected: up to 3 rows (one per accessible student), each with `payment_status` in (none/paid/partial/unpaid) and numeric totals. Most will be `bill_count=0`/`none` today (no hostel bills; academic bills only have academic_year_id where tagged). If it errors on the permission gate under MCP, instead verify shape with a temporary gate-bypass check is NOT allowed — just confirm the function was created:
```sql
select proname, pg_get_function_result(oid) from pg_proc where proname='campus_living_get_hostelite_bill_status';
```
Expected: one row, result type = the `TABLE(...)` signature.

- [ ] **Step 4: Mirror into setup reference**

Append the Step-1 body (function + GRANT) to `supabase/setup/02_functions.sql` under the campus-living section.

- [ ] **Step 5: Commit**

```bash
git add "supabase/migrations/20260606120500_campus_living_get_hostelite_bill_status.sql" "supabase/setup/02_functions.sql"
git commit -m "feat(campus-living): add campus_living_get_hostelite_bill_status aggregate RPC

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Types — `HosteliteBillStatus`

**Files:**
- Modify: `types/campus-living.ts`

- [ ] **Step 1: Add the type and field**

In `types/campus-living.ts`, add a new exported interface (place near the `LearnerHostelite` interface):
```ts
export interface HosteliteBillStatus {
  bill_count: number;
  total_billed: number;
  total_paid: number;
  total_outstanding: number;
  payment_status: 'none' | 'paid' | 'partial' | 'unpaid';
  academic_year_name: string | null;
}
```
Then add this optional field to the `LearnerHostelite` interface (find `export interface LearnerHostelite { ... }` and add inside it):
```ts
  // Current-academic-year billing rollup, merged in by LearnersTab.fetchData
  // from campus_living_get_hostelite_bill_status (not part of v_learner_hostelites).
  bill_status?: HosteliteBillStatus;
```

- [ ] **Step 2: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `types/campus-living.ts`. Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add types/campus-living.ts
git commit -m "feat(campus-living): add HosteliteBillStatus type for resident bill rollup

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Service method `getBillStatusForStudents`

**Files:**
- Modify: `lib/services/campus-living/learner-hostelite-service.ts`

- [ ] **Step 1: Import the type**

In the existing type import block (the `import { ... } from '@/types/campus-living';`), add `HosteliteBillStatus` to the named imports.

- [ ] **Step 2: Add the method to `LearnerHosteliteService`**

Add this method inside the `LearnerHosteliteService` class (e.g. after `listAvailableYears`):
```ts
  // ── Current-year billing rollup for a page of hostelers ───────────────
  // Batched, non-fatal cross-module read. Calls the SECURITY DEFINER RPC
  // campus_living_get_hostelite_bill_status (scoped to accessible institutions)
  // so campus-living operators without billing.schedule.view can still see
  // per-student rollups. Returns a Map keyed by student_id (= learner id).
  static async getBillStatusForStudents(
    studentIds: string[],
  ): Promise<Map<string, HosteliteBillStatus>> {
    const map = new Map<string, HosteliteBillStatus>();
    if (!studentIds.length) return map;
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc(
        'campus_living_get_hostelite_bill_status',
        { p_student_ids: studentIds },
      );
      if (error) {
        logger.error(
          'campus-living/learner-hostelite',
          'getBillStatusForStudents failed',
          error,
        );
        return map; // non-fatal — table still lists residents without billing cols
      }
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        map.set(String(row.student_id), {
          bill_count: Number(row.bill_count ?? 0),
          total_billed: Number(row.total_billed ?? 0),
          total_paid: Number(row.total_paid ?? 0),
          total_outstanding: Number(row.total_outstanding ?? 0),
          payment_status:
            (row.payment_status as HosteliteBillStatus['payment_status']) ?? 'none',
          academic_year_name: (row.academic_year_name as string | null) ?? null,
        });
      }
    } catch (err) {
      logger.error(
        'campus-living/learner-hostelite',
        'getBillStatusForStudents unexpected',
        err,
      );
    }
    return map;
  }
```

- [ ] **Step 3: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `lib/services/campus-living/learner-hostelite-service.ts`. Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "lib/services/campus-living/learner-hostelite-service.ts"
git commit -m "feat(campus-living): getBillStatusForStudents service for resident bill rollup

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Merge bill status into the Learners table rows

**Files:**
- Modify: `app/(routes)/campus-living/residents/_components/learners-tab.tsx` (`fetchData`)

- [ ] **Step 1: Merge the rollup in `fetchData`**

In `learners-tab.tsx`, locate the `fetchData` callback. After the line `const { data, count } = await LearnerHosteliteService.listHostelites(...)` and before the `const limit = ...` line, add:
```ts
      // Batched, non-fatal billing rollup for the visible page (merged onto rows
      // so the new columns can read row.original.bill_status without N+1).
      const statusMap = await LearnerHosteliteService.getBillStatusForStudents(
        data.map((d) => d.id),
      );
      const rows = data.map((d) => ({ ...d, bill_status: statusMap.get(d.id) }));
```
Then change the returned `data:` field from `data` to `rows`:
```ts
      return {
        success: true,
        data: rows,
        pagination: {
          page: params.page,
          limit,
          total_pages: Math.max(1, Math.ceil(count / limit)),
          total_items: count,
        },
      };
```

- [ ] **Step 2: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `learners-tab.tsx`. Expected: no new errors (the merged row type is `LearnerHostelite & { bill_status?: ... }`, assignable to `LearnerHostelite` since `bill_status` is optional on the type from Task 3).

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/campus-living/residents/_components/learners-tab.tsx"
git commit -m "feat(campus-living): fetch & merge current-year bill rollup into Learners rows

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Add the two columns

**Files:**
- Modify: `app/(routes)/campus-living/residents/_components/learners-columns.tsx`

- [ ] **Step 1: Import the currency formatter**

At the top of `learners-columns.tsx`, add:
```ts
import { formatCurrency } from '@/lib/utils';
```
(Same helper the billing list columns use; default call `formatCurrency(amount)` returns an INR string.)

- [ ] **Step 2: Define the two columns inside `getLearnerColumns`**

Inside `getLearnerColumns`, before the `const actionsCol` definition, add:
```tsx
  const billsCol: ColumnDef<LearnerHostelite> = {
    id: 'current_year_bills',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Current-Year Bills' />
    ),
    cell: ({ row }) => {
      const s = row.original.bill_status;
      if (!s) return <span className='text-sm text-muted-foreground'>—</span>;
      const generated = s.bill_count > 0;
      return (
        <div className='flex flex-col gap-0.5'>
          {generated ? (
            <Badge className='border-transparent bg-green-100 text-green-800 hover:bg-green-100 w-fit'>
              Generated ({s.bill_count})
            </Badge>
          ) : (
            <Badge variant='secondary' className='w-fit'>
              Not generated
            </Badge>
          )}
          {generated && (
            <span className='text-xs text-muted-foreground'>
              Billed {formatCurrency(s.total_billed)}
            </span>
          )}
        </div>
      );
    },
    enableSorting: false,
    size: 170,
  };

  const paymentCol: ColumnDef<LearnerHostelite> = {
    id: 'payment_status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Payment' />
    ),
    cell: ({ row }) => {
      const s = row.original.bill_status;
      if (!s || s.bill_count === 0) {
        return <span className='text-sm text-muted-foreground'>—</span>;
      }
      const cfg = {
        paid: { label: 'Paid', cls: 'bg-green-100 text-green-800 hover:bg-green-100' },
        partial: { label: 'Partial', cls: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
        unpaid: { label: 'Unpaid', cls: 'bg-orange-100 text-orange-800 hover:bg-orange-100' },
        none: { label: '—', cls: '' },
      } as const;
      const c = cfg[s.payment_status] ?? cfg.none;
      return (
        <div
          className='flex flex-col gap-0.5'
          title={s.academic_year_name ?? undefined}
        >
          <Badge className={`border-transparent w-fit ${c.cls}`}>{c.label}</Badge>
          <span className='text-xs text-muted-foreground'>
            Paid {formatCurrency(s.total_paid)} · Out {formatCurrency(s.total_outstanding)}
          </span>
        </div>
      );
    },
    enableSorting: false,
    size: 190,
  };
```

- [ ] **Step 3: Insert the columns into the returned array**

In the `return [ ... ]` at the end of `getLearnerColumns`, add `billsCol` and `paymentCol` immediately before `actionsCol`:
```tsx
  return [
    rollCol,
    nameCol,
    ...(h.isSuperAdmin ? [institutionCol] : []),
    degreeCol,
    programCol,
    semesterCol,
    genderCol,
    blockCol,
    billsCol,
    paymentCol,
    actionsCol,
  ];
```

- [ ] **Step 4: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `learners-columns.tsx`. Expected: no new errors (`Badge` is already imported; `formatCurrency` added in Step 1; `bill_status` is on `LearnerHostelite` from Task 3).

- [ ] **Step 5: Manual browser check**

`npm run dev`, open `/campus-living/residents?tab=learners` (ideally as a non-super-admin warden role with `campus_living.residents.view`). Confirm: the two columns render; students with academic bills tagged to their current academic year show "Generated (N)" + Paid/Out amounts; others show "Not generated"/"—"; no console errors; the list still loads if the RPC errors (columns just show —).

- [ ] **Step 6: Commit**

```bash
git add "app/(routes)/campus-living/residents/_components/learners-columns.tsx"
git commit -m "feat(campus-living): show current-year bill status + amounts on Learners tab

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)
- `mcp__ide__getDiagnostics` clean on all touched TS files.
- SQL: re-run the Task-2 Step-3 check; confirm both RPCs exist with correct signatures.
- Manual end-to-end as a non-super-admin warden:
  1. Learners tab shows the two new columns populated.
  2. A hosteler with academic bills in their current academic year shows Generated + correct Paid/Outstanding.
  3. Run the "Generate Hostel-Year Bills" tab for a learner (real, non-dry-run) → the new hostel bill carries `academic_year_id` (verify via SQL) and appears in the Learners-tab rollup.
  4. A student with no `academic_year_id` shows "—".

## Self-review notes (coverage vs spec)
- Spec §5.1 → Task 1; §5.2 → Task 2; §5.5 types → Task 3; §5.3 service → Task 4; §5.4 wiring → Task 5; §5.6 columns → Task 6. All covered.
- Gotchas honored: definer scoped to `_user_accessible_institutions()` + catalog permission key (Task 2); `{ error }` checked + non-fatal billing fetch (Task 4); skip RPC on empty ids (Task 4); generation RPC dedup/ON CONFLICT untouched (Task 1).
