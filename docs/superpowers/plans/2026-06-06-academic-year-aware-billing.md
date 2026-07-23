# Academic-Year-Aware Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stamp an `academic_year_id` on each student bill so multi-year courses (e.g. BDS) can distinguish year-1 from year-2 bills and track per-year payment status.

**Architecture:** Add a nullable `academic_year_id` FK column to `billing_student_bills` (mirroring the existing hostel-billing provenance columns). Capture it (required) in the manual create form and bulk-create page; surface it through the service selects/filters; group the student detail page's bills by academic year with per-year subtotals. No backfill — legacy bills stay `NULL` ("Unspecified").

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + RLS), TanStack Query, react-hook-form + Zod, Shadcn UI. **No test runner exists** — verify via `mcp__ide__getDiagnostics` per file, SQL checks, and manual browser smoke (CLAUDE.md).

**Spec:** `docs/superpowers/specs/2026-06-06-academic-year-aware-billing-design.md`

---

## Pre-flight (read before Task 1)

**WIP overlap warning.** These files currently contain *uncommitted* work for an unrelated **accommodation-type filter** feature:
`types/billing-schedule.ts`, `lib/services/billing/schedule/student-bill-service.ts`,
`lib/services/billing/schedule/student-search-service.ts`,
`app/(routes)/billing/schedule/_components/advanced-billing-schedule-filters.tsx`,
`app/(routes)/billing/schedule/_components/billing-schedule-filters.tsx`,
`app/(routes)/billing/schedule/_components/data-table-schema.ts`,
`app/(routes)/billing/schedule/students/...`, `hooks/billing/use-student-search.ts`.

- **Recommended:** commit (or stash) the accommodation-type WIP as its own commit *before* starting, so each task here can `git add <file>` cleanly without bundling the other feature.
- If you don't, accept that commits in overlapping files will include both features.
- **Always `git add` only the specific files named in each task** — never `git add -A`.
- **Re-read each overlapping file's current on-disk state before editing** (line numbers in this plan are from the pre-existing committed code and may have drifted by a few lines).

You are on branch `main`. If your workflow requires a feature branch, create one now (`git checkout -b feat/academic-year-billing`) — but note the WIP is on `main`, so coordinate with the user first.

---

## Task 1: Database — add `academic_year_id` column

**Files:**
- Create: `supabase/migrations/20260606093000_add_academic_year_id_to_billing_student_bills.sql`
- Modify: `supabase/setup/01_tables.sql` (mirror)

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260606093000_add_academic_year_id_to_billing_student_bills.sql`:

```sql
-- Academic-year-aware billing: stamp the academic year on each bill so
-- multi-year courses (e.g. BDS) can distinguish year-1 from year-2 bills and
-- track per-year payment status. Nullable by design — legacy bills and
-- automated insert paths (hostel RPC, Excel import) may leave it NULL
-- ("Unspecified"); the manual create + bulk-create forms require it.

ALTER TABLE public.billing_student_bills
  ADD COLUMN IF NOT EXISTS academic_year_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_student_bills_academic_year_id_fkey'
  ) THEN
    ALTER TABLE public.billing_student_bills
      ADD CONSTRAINT billing_student_bills_academic_year_id_fkey
      FOREIGN KEY (academic_year_id)
      REFERENCES public.academic_years(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_academic_year
  ON public.billing_student_bills (academic_year_id);

CREATE INDEX IF NOT EXISTS idx_billing_student_bills_student_academic_year
  ON public.billing_student_bills (student_id, academic_year_id);

COMMENT ON COLUMN public.billing_student_bills.academic_year_id IS
  'Academic year (academic_years.id) this bill applies to. Nullable: legacy/automated bills may be NULL; manual create + bulk-create require it.';
```

- [ ] **Step 2: Apply the migration**

Apply via MCP tool `mcp__supabase__apply_migration` with:
- name: `add_academic_year_id_to_billing_student_bills`
- query: the exact SQL body from Step 1 (commit the real body — never a `SELECT 1;` placeholder).

- [ ] **Step 3: Verify the column, FK, and indexes exist**

Run `mcp__supabase__execute_sql`:

```sql
select
  (select data_type from information_schema.columns
     where table_name='billing_student_bills' and column_name='academic_year_id') as col_type,
  (select count(*) from pg_constraint
     where conname='billing_student_bills_academic_year_id_fkey') as fk_count,
  (select count(*) from pg_indexes
     where tablename='billing_student_bills'
       and indexname in ('idx_billing_student_bills_academic_year',
                         'idx_billing_student_bills_student_academic_year')) as index_count;
```

Expected: `col_type='uuid'`, `fk_count=1`, `index_count=2`.

- [ ] **Step 4: Mirror into the setup reference file**

In `supabase/setup/01_tables.sql`, find the `CREATE TABLE ... billing_student_bills` block. Add the column alongside the other nullable provenance columns (`hostel_year_id`, `package_id`, `applies_year_of_study`):

```sql
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
```

After the table block (next to other `CREATE INDEX ... billing_student_bills` lines), add:

```sql
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_academic_year
  ON public.billing_student_bills (academic_year_id);
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_student_academic_year
  ON public.billing_student_bills (student_id, academic_year_id);
```

- [ ] **Step 5: Commit**

```bash
git add "supabase/migrations/20260606093000_add_academic_year_id_to_billing_student_bills.sql" "supabase/setup/01_tables.sql"
git commit -m "feat(billing): add academic_year_id column to billing_student_bills"
```

---

## Task 2: Register the column in the generated Database type

**Files:**
- Modify: `types/supabase.ts`

- [ ] **Step 1: Locate the table definition**

Run: `grep -n "billing_student_bills:" types/supabase.ts`
The first match is the `Tables` entry with `Row` / `Insert` / `Update` / `Relationships`.

- [ ] **Step 2: Add the column to Row, Insert, Update**

In the `billing_student_bills` `Row` object, add (place near `applies_year_of_study`):

```ts
        academic_year_id: string | null
```

In its `Insert` and `Update` objects, add:

```ts
        academic_year_id?: string | null
```

- [ ] **Step 3: Add the FK relationship**

In the `billing_student_bills` `Relationships` array, add an entry:

```ts
          {
            foreignKeyName: "billing_student_bills_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
```

- [ ] **Step 4: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `types/supabase.ts`. Expected: no new errors (commas/braces balanced).

- [ ] **Step 5: Commit**

```bash
git add types/supabase.ts
git commit -m "chore(types): register billing_student_bills.academic_year_id in Database type"
```

---

## Task 3: Domain types

**Files:**
- Modify: `types/billing-schedule.ts`

- [ ] **Step 1: Add fields to `StudentBill`**

In `interface StudentBill`, immediately after `updated_at: string;` (before the `// Related data` comment), add:

```ts
  // Academic year this bill applies to (academic_years.id). Nullable: legacy
  // and automated bills may be NULL ("Unspecified"); manual/bulk-create require it.
  academic_year_id?: string | null;
```

In the same interface's "Related data" block (e.g. after the `creator?` block), add:

```ts
  academic_year?: {
    id: string;
    academic_year_name: string;
  };
```

- [ ] **Step 2: Add field to `CreateStudentBillDto`**

In `interface CreateStudentBillDto`, immediately after `applies_year_of_study?: number | null;`, add:

```ts
  // Academic year (academic_years.id) this bill applies to. Required by the
  // manual create + bulk-create forms; flows straight into the insert.
  academic_year_id?: string | null;
```

(`UpdateStudentBillDto extends Partial<CreateStudentBillDto>` so it inherits this.)

- [ ] **Step 3: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `types/billing-schedule.ts`. Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add types/billing-schedule.ts
git commit -m "feat(billing): add academic_year_id to StudentBill + CreateStudentBillDto types"
```

---

## Task 4: Service — persist the year on create

**Files:**
- Modify: `lib/services/billing/schedule/student-bill-service.ts` (`createStudentBill`)

- [ ] **Step 1: Normalize and persist `academic_year_id` in the insert**

In `createStudentBill`, find the `.insert({ ... })` object and add the normalized field:

```ts
        .insert({
          ...billData,
          final_amount: finalAmount,
          balance_amount: finalAmount,
          quantity: billData.quantity || 1,
          tax_amount: billData.tax_amount || 0,
          academic_year_id: billData.academic_year_id || null,
          created_by: currentUserId
        })
```

(`|| null` normalizes `''`/`undefined` → `null`, avoiding Postgres `22P02`. The recurring-bills helper spreads `billData`, so generated copies inherit the year.)

- [ ] **Step 2: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `lib/services/billing/schedule/student-bill-service.ts`. Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "lib/services/billing/schedule/student-bill-service.ts"
git commit -m "feat(billing): persist academic_year_id when creating a bill"
```

---

## Task 5: Service — select, filter, and transform the year in the list query

**Files:**
- Modify: `lib/services/billing/schedule/student-bill-service.ts` (`getStudentBills`)

> Re-read `getStudentBills` first — it has accommodation-type WIP. The variable is `hasStudentFilters = hasAcademicFilters || accommodationTypeIds !== null`.

- [ ] **Step 1: Stop forcing the student join for a year-only filter**

In the `hasAcademicFilters` computation, **remove** the `filters.academic_year_id ||` line so it reads:

```ts
      const hasAcademicFilters = !!(
        filters.degree_id ||
        filters.department_id ||
        filters.program_id ||
        filters.semester_id ||
        filters.section_id
      );
```

- [ ] **Step 2: Add the bill-level year columns to BOTH selects**

In the `!inner` select (the `if (hasStudentFilters)` branch) and the plain select (the `else` branch), add these two lines to the **bill** column list, right after `updated_at,`:

```ts
            academic_year_id,
            academic_year:academic_years(id, academic_year_name),
```

- [ ] **Step 3: Remove the old student-year filter**

Inside the `if (hasStudentFilters)` filter block, **delete** this stanza:

```ts
        if (filters.academic_year_id) {
          query = query.eq(
            'student.academic_year_id',
            filters.academic_year_id
          );
        }
```

- [ ] **Step 4: Add the top-level bill-year filter**

Next to the other top-level filters (right after the `if (filters.status) { ... }` block), add:

```ts
      // Academic year now lives ON the bill (not the student's current year),
      // so filter the bill's own column. 'unspecified' → bills with no year.
      if (filters.academic_year_id === 'unspecified') {
        query = query.is('academic_year_id', null);
      } else if (filters.academic_year_id) {
        query = query.eq('academic_year_id', filters.academic_year_id);
      }
```

- [ ] **Step 5: Carry the year through the transform**

In the `.map((bill: any): StudentBill => { ... })` transform: add `academic_year_id` to the `baseBill` object (next to `updated_at: bill.updated_at`):

```ts
          updated_at: bill.updated_at,
          academic_year_id: bill.academic_year_id
```

Then, where `itemCategoryData` is derived, add:

```ts
        const academicYearData = Array.isArray(bill.academic_year)
          ? bill.academic_year[0]
          : bill.academic_year;
```

And in the returned object (after the `item_category: { ... }` block), add:

```ts
          ,
          academic_year: academicYearData
            ? {
                id: academicYearData.id,
                academic_year_name: academicYearData.academic_year_name
              }
            : undefined
```

- [ ] **Step 6: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `lib/services/billing/schedule/student-bill-service.ts`. Expected: no new errors.

- [ ] **Step 7: Verify the query against the DB (manual SQL sanity check)**

Run `mcp__supabase__execute_sql` to confirm the embed path resolves (PostgREST relationship name = FK target table):

```sql
select b.id, b.academic_year_id, ay.academic_year_name
from billing_student_bills b
left join academic_years ay on ay.id = b.academic_year_id
limit 5;
```

Expected: rows return; `academic_year_name` is null for current bills (no backfill).

- [ ] **Step 8: Commit**

```bash
git add "lib/services/billing/schedule/student-bill-service.ts"
git commit -m "feat(billing): filter & return bill academic_year in getStudentBills"
```

---

## Task 6: Service — include the year in detail/summary queries

**Files:**
- Modify: `lib/services/billing/schedule/student-bill-service.ts` (`getStudentBill`, `getStudentBillsByStudent`)
- Modify: `lib/services/billing/schedule/student-search-service.ts` (`getStudentBillingSummary`)

- [ ] **Step 1: `getStudentBill` select**

In `getStudentBill`, in the `.select(...)` string, after the `item_category:billing_categories( ... )` block, add:

```ts
          ,
          academic_year:academic_years(id, academic_year_name)
```

(The leading `*` already returns `academic_year_id`.)

- [ ] **Step 2: `getStudentBillsByStudent` select**

In `getStudentBillsByStudent`, in the `.select(...)` string, after the `item_category:billing_categories( ... )` block, add the same:

```ts
          ,
          academic_year:academic_years(id, academic_year_name)
```

- [ ] **Step 3: `getStudentBillingSummary` bills select**

In `lib/services/billing/schedule/student-search-service.ts`, `getStudentBillingSummary`, in the `billsQuery` `.select(...)` (starts `*, creator:profiles!...`), after the `item_category:billing_categories( ... )` block, add:

```ts
          ,
          academic_year:academic_years(id, academic_year_name)
```

- [ ] **Step 4: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for both edited service files. Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "lib/services/billing/schedule/student-bill-service.ts" "lib/services/billing/schedule/student-search-service.ts"
git commit -m "feat(billing): embed academic_year in bill detail & student summary queries"
```

---

## Task 7: Create / Edit form — required Academic Year selector

**Files:**
- Modify: `app/(routes)/billing/schedule/_components/student-bill-form.tsx`

- [ ] **Step 1: Import the hook**

Add near the other hook imports:

```ts
import { useAcademicYears } from '@/hooks/use-academic-years';
```

- [ ] **Step 2: Add to the Zod schema**

In `studentBillSchema`, add (after `institution_id`):

```ts
  academic_year_id: z.string().min(1, 'Academic year is required'),
```

- [ ] **Step 3: Add to all three `getInitialValues` branches**

In `getInitialValues`, add `academic_year_id` to each returned object:
- `if (bill)` branch: `academic_year_id: bill.academic_year_id || '',`
- `else if (preSelectedStudent)` branch: `academic_year_id: preSelectedStudent.academic_year_id || '',`
- `else` branch: `academic_year_id: '',`

- [ ] **Step 4: Add to both `form.reset(...)` objects in the edit/preselect `useEffect`**

In the `useEffect([bill, preSelectedStudent, form, completeStudentData])`:
- in the `if (bill)` `formValues`: `academic_year_id: bill.academic_year_id || '',`
- in the `else if (preSelectedStudent)` `formValues`: `academic_year_id: preSelectedStudent.academic_year_id || '',`

- [ ] **Step 5: Load academic years for the chosen institution**

After `const watchedValues = form.watch();`, add:

```ts
  const { data: academicYearsData } = useAcademicYears(
    watchedValues.institution_id || undefined
  );
  const academicYears = academicYearsData?.data || [];
```

- [ ] **Step 6: Default the year when a student is picked**

In `handleStudentSelect`, after `form.setValue('student_id', student.id);` add:

```ts
    if (student.academic_year_id) {
      form.setValue('academic_year_id', student.academic_year_id);
    }
```

- [ ] **Step 7: Render the selector in the "Bill Information" card**

Inside the Bill Information `<Card>`'s `<CardContent>`, immediately before the existing `due_date` `<FormField>`, add:

```tsx
              <FormField
                control={form.control}
                name='academic_year_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Academic Year *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!watchedValues.institution_id}
                    >
                      <FormControl>
                        <SelectTrigger className='w-full max-w-sm'>
                          <SelectValue
                            placeholder={
                              !watchedValues.institution_id
                                ? 'Select a student/institution first'
                                : 'Select academic year'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {academicYears.map((ay: any) => (
                          <SelectItem key={ay.id} value={ay.id}>
                            {ay.academic_year_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Which academic year this bill is for. Defaults to the
                      student&apos;s current year — change it to bill a future year.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
```

- [ ] **Step 8: Pass it through `buildBillDto`**

In `buildBillDto`, add to the returned object:

```ts
      academic_year_id: data.academic_year_id || undefined,
```

- [ ] **Step 9: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `app/(routes)/billing/schedule/_components/student-bill-form.tsx`. Expected: no new errors.

- [ ] **Step 10: Manual browser check**

Run `npm run dev`. Go to `/billing/schedule/students/<id>` → "Schedule Bill". Confirm: the Academic Year dropdown is populated for the student's institution and pre-selects the student's current year; submitting without it shows "Academic year is required"; a created bill row in `billing_student_bills` has `academic_year_id` set (verify via SQL).

- [ ] **Step 11: Commit**

```bash
git add "app/(routes)/billing/schedule/_components/student-bill-form.tsx"
git commit -m "feat(billing): require Academic Year on the create/edit bill form"
```

---

## Task 8: Bulk-create page — required Academic Year for the batch

**Files:**
- Modify: `app/(routes)/billing/schedule/bulk-create/page.tsx`

- [ ] **Step 1: Import the hook**

```ts
import { useAcademicYears } from '@/hooks/use-academic-years';
```

- [ ] **Step 2: Add to `bulkBillSchema`**

After `item_category_id`, add:

```ts
  academic_year_id: z.string().min(1, 'Academic year is required'),
```

- [ ] **Step 3: Load years for the chosen institution**

After `const watchedValues = form.watch();`, add:

```ts
  const { data: academicYearsData } = useAcademicYears(
    watchedValues.institution_id || undefined
  );
  const academicYears = academicYearsData?.data || [];
```

- [ ] **Step 4: Reset the year when institution changes**

In the institution `<Select>`'s `onValueChange`, alongside the other `form.setValue(... undefined)` resets, add:

```ts
                              form.setValue('academic_year_id', '');
```

- [ ] **Step 5: Render the selector in Step 1**

Inside Step 1's `<CardContent>` grid, after the `item_category_id` `<FormField>`, add:

```tsx
                    <FormField
                      control={form.control}
                      name='academic_year_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Academic Year</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={!watchedValues.institution_id}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    !watchedValues.institution_id
                                      ? 'Select institution first'
                                      : 'Select academic year'
                                  }
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {academicYears.map((ay: any) => (
                                <SelectItem key={ay.id} value={ay.id}>
                                  {ay.academic_year_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
```

- [ ] **Step 6: Confirm `academic_year_id` is NOT stripped before insert**

In `onSubmit`, the destructure strips only the cohort filters:

```ts
      const {
        degree_id: _degreeFilter,
        department_id: _departmentFilter,
        program_id: _programFilter,
        semester_id: _semesterFilter,
        ...billFields
      } = data;
```

`academic_year_id` is a real column — it must remain inside `...billFields` (do **not** add it to the destructure). No change needed; just verify it is absent from the strip list so it flows into `billData` → `createStudentBill`.

- [ ] **Step 7: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `app/(routes)/billing/schedule/bulk-create/page.tsx`. Expected: no new errors.

- [ ] **Step 8: Manual browser check**

On `/billing/schedule/bulk-create`: pick an institution → Academic Year populates; create a bill for ≥2 students; verify each created row has `academic_year_id` (SQL).

- [ ] **Step 9: Commit**

```bash
git add "app/(routes)/billing/schedule/bulk-create/page.tsx"
git commit -m "feat(billing): require Academic Year on bulk-create bills"
```

---

## Task 9: Student detail page — group bills by academic year (the payoff)

**Files:**
- Modify: `app/(routes)/billing/schedule/students/[id]/_components/student-bills-table.tsx`

> This refactors the render to group `filteredBills` by academic year while reusing the existing per-bill markup. Do it in three moves: (a) add helpers, (b) extract the existing row/card JSX into local render functions, (c) map over groups.

- [ ] **Step 1: Add grouping + per-group summary helpers**

After `const filteredBills = useMemo(...)`, add:

```ts
  // Group bills by the bill's own academic year. Null → "Unspecified".
  const billGroups = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; name: string; bills: StudentBill[] }
    >();
    for (const bill of filteredBills) {
      const key = bill.academic_year_id || 'unspecified';
      const name = bill.academic_year?.academic_year_name || 'Unspecified';
      if (!groups.has(key)) groups.set(key, { key, name, bills: [] });
      groups.get(key)!.bills.push(bill);
    }
    // Named years descending (e.g. 2025-2026 before 2024-2025); Unspecified last.
    return Array.from(groups.values()).sort((a, b) => {
      if (a.key === 'unspecified') return 1;
      if (b.key === 'unspecified') return -1;
      return b.name.localeCompare(a.name);
    });
  }, [filteredBills]);

  // Total / paid / outstanding + an aggregate badge for one year's bills.
  const summarizeGroup = (groupBills: StudentBill[]) => {
    const billed = groupBills.filter((b) => b.status !== 'superseded');
    const total = billed.reduce((s, b) => s + b.final_amount, 0);
    const outstanding = groupBills.reduce(
      (s, b) =>
        s +
        (['unpaid', 'partially_paid', 'overdue'].includes(b.status)
          ? b.balance_amount > 0
            ? b.balance_amount
            : b.final_amount
          : 0),
      0
    );
    const paid = Math.max(0, total - outstanding);
    const allSettled =
      billed.length > 0 &&
      billed.every((b) => b.status === 'paid' || b.status === 'cancelled');
    const label = allSettled ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
    return { total, paid, outstanding, label };
  };
```

- [ ] **Step 2: Extract the existing per-bill markup into render functions**

Inside the component (before the `return`), define `renderBillCard(bill)` and `renderBillRow(bill, index)`:
- Move the existing mobile `<Card key={bill.id}>...</Card>` JSX (the body of the current `filteredBills.map((bill) => (...))` in the mobile section) verbatim into `renderBillCard = (bill: StudentBill) => ( ... )`.
- Move the existing desktop `<TableRow key={bill.id}>...</TableRow>` JSX into `renderBillRow = (bill: StudentBill, index: number) => ( ... )`.

```ts
  const renderBillCard = (bill: StudentBill) => (
    /* paste the existing mobile <Card key={bill.id}> ... </Card> JSX here, unchanged */
  );

  const renderBillRow = (bill: StudentBill, index: number) => (
    /* paste the existing desktop <TableRow key={bill.id}> ... </TableRow> JSX here, unchanged */
  );
```

- [ ] **Step 3: Replace the mobile section with grouped output**

Replace the mobile block (`<div className='lg:hidden space-y-3'>{filteredBills.map((bill) => ( ... ))}</div>`) with:

```tsx
      {/* Mobile Card Layout — grouped by academic year */}
      <div className='lg:hidden space-y-6'>
        {billGroups.map((group) => {
          const s = summarizeGroup(group.bills);
          return (
            <div key={group.key} className='space-y-3'>
              <div className='flex items-center justify-between rounded-md bg-muted px-3 py-2'>
                <div className='font-semibold text-sm'>{group.name}</div>
                <div className='flex items-center gap-2'>
                  <span className='text-xs text-muted-foreground'>
                    {formatCurrency(s.paid)} / {formatCurrency(s.total)}
                  </span>
                  <Badge
                    className={
                      s.label === 'PAID'
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : s.label === 'PARTIAL'
                        ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                        : 'bg-orange-100 text-orange-800 border-orange-200'
                    }
                  >
                    {s.label}
                  </Badge>
                </div>
              </div>
              {group.bills.map((bill) => renderBillCard(bill))}
            </div>
          );
        })}
      </div>
```

- [ ] **Step 4: Replace the desktop section with grouped output**

Replace the desktop block (`<div className='hidden lg:block ...'><Table>...</Table></div>`) with one `<Table>` per group, each preceded by a header row of subtotals:

```tsx
      {/* Desktop Table Layout — grouped by academic year */}
      <div className='hidden lg:block space-y-6'>
        {billGroups.map((group) => {
          const s = summarizeGroup(group.bills);
          return (
            <div key={group.key} className='rounded-md border overflow-hidden'>
              <div className='flex items-center justify-between bg-muted px-4 py-2 border-b'>
                <div className='font-semibold'>{group.name}</div>
                <div className='flex items-center gap-4 text-sm'>
                  <span>Total: {formatCurrency(s.total)}</span>
                  <span className='text-green-600'>
                    Paid: {formatCurrency(s.paid)}
                  </span>
                  <span className='text-orange-600'>
                    Outstanding: {formatCurrency(s.outstanding)}
                  </span>
                  <Badge
                    className={
                      s.label === 'PAID'
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : s.label === 'PARTIAL'
                        ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                        : 'bg-orange-100 text-orange-800 border-orange-200'
                    }
                  >
                    {s.label}
                  </Badge>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className='bg-gray-50 dark:bg-gray-800'>
                    <TableHead className='w-12'></TableHead>
                    <TableHead className='font-semibold'>Category</TableHead>
                    <TableHead className='font-semibold'>Due Date</TableHead>
                    <TableHead className='text-right font-semibold'>Amount</TableHead>
                    <TableHead className='text-right font-semibold'>Balance Due</TableHead>
                    <TableHead className='text-center font-semibold'>Status</TableHead>
                    <TableHead className='text-center font-semibold'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.bills.map((bill, index) => renderBillRow(bill, index))}
                </TableBody>
              </Table>
            </div>
          );
        })}
      </div>
```

(The select-all header checkbox is dropped from the per-group header for simplicity; the per-row checkboxes and the bulk action bar above are unchanged. If you want to keep a select-all, scope it per group — optional.)

- [ ] **Step 5: Keep the empty state**

The existing `{filteredBills.length === 0 && (<Card>...</Card>)}` empty state stays as-is (after the grouped blocks).

- [ ] **Step 6: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `student-bills-table.tsx`. Expected: no new errors (confirm `Badge` and `formatCurrency` are in scope — they already are).

- [ ] **Step 7: Manual browser check**

For a student with bills across two academic years (create them via Task 7), open `/billing/schedule/students/<id>` → Bills tab. Confirm two year sections appear with independent Total/Paid/Outstanding and correct PAID/PARTIAL/UNPAID badges. Pay one year's bills (Generate Receipt) and confirm only that group flips to PAID. Legacy untagged bills appear under "Unspecified".

- [ ] **Step 8: Commit**

```bash
git add "app/(routes)/billing/schedule/students/[id]/_components/student-bills-table.tsx"
git commit -m "feat(billing): group student bills by academic year with per-year subtotals"
```

---

## Task 10: List page — Academic Year column + filter

**Files:**
- Modify: `app/(routes)/billing/schedule/_components/columns.tsx`
- Modify: `app/(routes)/billing/schedule/_components/data-table-schema.ts`
- Modify: `app/(routes)/billing/schedule/_components/advanced-billing-schedule-filters.tsx`
- Verify wiring: `app/(routes)/billing/schedule/page.tsx` (searchParams → `getStudentBills` filters)

> Re-read each file's current on-disk state first (accommodation WIP lives here).

- [ ] **Step 1: Add the column**

In `columns.tsx`, add a new `ColumnDef<StudentBill>` after the `due_date` column:

```tsx
  {
    accessorKey: 'academic_year',
    id: 'academic_year',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Academic Year' />
    ),
    size: 140,
    minSize: 120,
    maxSize: 160,
    cell: ({ row }) => (
      <span className='text-sm'>
        {row.original.academic_year?.academic_year_name ?? 'Unspecified'}
      </span>
    ),
    enableSorting: false
  },
```

- [ ] **Step 2: Ensure the search-params schema has `academic_year_id`**

Run: `grep -n "academic_year_id" app/(routes)/billing/schedule/_components/data-table-schema.ts`
If absent, add to `billingScheduleSearchParamsSchema` (near `semester_id`):

```ts
  academic_year_id: z.string().optional(),
```

- [ ] **Step 3: Add the filter control**

In `advanced-billing-schedule-filters.tsx`:
- Add import: `import { useAcademicYears } from '@/hooks/use-academic-years';`
- Inside the component, load years for the currently-selected institution filter (use the same institution value the other cascading filters use — match the existing pattern in this file; if institution isn't selected, pass `undefined`):

```ts
  const { data: academicYearsData } = useAcademicYears(
    searchParams.institution_id || undefined
  );
  const academicYears = academicYearsData?.data || [];
```

- Add a `<Select>` next to the other academic filters that calls the file's existing change handler (`handleSmartFilterChange` in this file):

```tsx
            <div className='space-y-2'>
              <Label>Academic Year</Label>
              <Select
                value={searchParams.academic_year_id || 'all'}
                onValueChange={(value) =>
                  handleSmartFilterChange(
                    'academic_year_id',
                    value === 'all' ? undefined : value
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select academic year' />
                </SelectTrigger>
                <SelectContent className='max-h-60 overflow-y-auto'>
                  <SelectItem value='all'>All Years</SelectItem>
                  <SelectItem value='unspecified'>Unspecified</SelectItem>
                  {academicYears.map((ay: any) => (
                    <SelectItem key={ay.id} value={ay.id}>
                      {ay.academic_year_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
```

- [ ] **Step 4: Verify the page passes the filter to the service**

Open `app/(routes)/billing/schedule/page.tsx`. Find where `searchParams` are mapped into the `StudentBillFilters` passed to `getStudentBills` (or the hook that calls it). Confirm `academic_year_id` is included; if the mapping enumerates fields explicitly and omits it, add `academic_year_id: searchParams.academic_year_id`.

- [ ] **Step 5: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for all four files. Expected: no new errors.

- [ ] **Step 6: Manual browser check**

On `/billing/schedule`: the list shows an Academic Year column; filtering by a year returns only that year's bills; "Unspecified" returns legacy untagged bills; "All Years" clears it.

- [ ] **Step 7: Commit**

```bash
git add "app/(routes)/billing/schedule/_components/columns.tsx" "app/(routes)/billing/schedule/_components/data-table-schema.ts" "app/(routes)/billing/schedule/_components/advanced-billing-schedule-filters.tsx" "app/(routes)/billing/schedule/page.tsx"
git commit -m "feat(billing): academic year column + filter on the bills list"
```

---

## Task 11: Single bill view — display the academic year

**Files:**
- Modify: `app/(routes)/billing/schedule/[id]/page.tsx`

- [ ] **Step 1: Read the file and locate the bill-detail fields**

Open `app/(routes)/billing/schedule/[id]/page.tsx`. Find the block that renders bill fields (Due Date, Category, Amount, etc.) from the bill object returned by `getStudentBill`.

- [ ] **Step 2: Add an Academic Year line**

Add a field rendering the year, matching the surrounding markup style. Example (adapt classnames to the file's existing field pattern):

```tsx
            <div>
              <label className='text-sm font-medium text-muted-foreground'>
                Academic Year
              </label>
              <p className='font-medium'>
                {bill.academic_year?.academic_year_name ?? 'Unspecified'}
              </p>
            </div>
```

- [ ] **Step 3: Verify diagnostics + browser**

Run `mcp__ide__getDiagnostics` for the file. Open `/billing/schedule/<bill_id>` and confirm the Academic Year shows (a freshly created bill shows its year; a legacy bill shows "Unspecified").

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/billing/schedule/[id]/page.tsx"
git commit -m "feat(billing): show academic year on the single bill view"
```

---

## Task 12 (OPTIONAL): Excel import + template Academic Year column

> Lower priority. The manual + bulk paths (Tasks 7–8) cover the primary workflow. Do this only if Excel-imported bills must also be year-tagged. Without it, imported bills are simply "Unspecified".

**Files:**
- Modify: `lib/utils/mappings/student-bill-excel-mappings.ts` (`STUDENT_BILL_TEMPLATE_HEADERS`)
- Modify: `app/api/billing/schedule/bills/template/route.ts`
- Modify: `app/api/billing/schedule/bills/import/route.ts`

- [ ] **Step 1: Add the header**

In `student-bill-excel-mappings.ts`, append `'Academic Year (optional)'` to `STUDENT_BILL_TEMPLATE_HEADERS` (becomes index 6, column G).

- [ ] **Step 2: Template — add the column + dropdown**

In `template/route.ts`:
- Add a `{ header: STUDENT_BILL_TEMPLATE_HEADERS[6], key: 'academic_year', width: 20 }` column.
- Fetch distinct active academic-year names: `supabase.from('academic_years').select('academic_year_name').eq('is_active', true).order('academic_year_name', { ascending: false })`, dedupe names.
- Add them to a second `Lists` column and a Column G list `dataValidation` with `allowBlank: true`.
- Update the Instructions sheet "OPTIONAL COLUMNS" section to mention Academic Year (must match an existing academic year name for the student's institution; blank → Unspecified).

- [ ] **Step 3: Import — resolve name → id per institution**

In `import/route.ts`:
- Add `academic_year_name: z.string().optional().nullable()` to `billRowSchema`.
- Parse cell index 6: `academic_year_name: cellToString(cells[6]) || undefined`.
- After resolving students, batch-load academic years for the institutions in play:

```ts
    const institutionIds = Array.from(
      new Set(
        Array.from(studentByRoll.values())
          .map((s) => s.institution_id)
          .filter((x): x is string => Boolean(x))
      )
    );
    const { data: acadYears } = await supabase
      .from('academic_years')
      .select('id, academic_year_name, institution_id')
      .in('institution_id', institutionIds.length ? institutionIds : ['00000000-0000-0000-0000-000000000000']);
    // key: `${institution_id}::${lower(name)}` → id
    const acadYearByInstName = new Map<string, string>();
    (acadYears ?? []).forEach((y: any) => {
      acadYearByInstName.set(
        `${y.institution_id}::${String(y.academic_year_name).trim().toLowerCase()}`,
        y.id
      );
    });
```

- In the insert-row build loop, resolve and (only on a non-blank-but-unmatched name) push a per-row error; otherwise set `academic_year_id`:

```ts
      let academicYearId: string | null = null;
      if (cleaned.academic_year_name) {
        const resolved = acadYearByInstName.get(
          `${studentMatch.institution_id}::${cleaned.academic_year_name.trim().toLowerCase()}`
        );
        if (!resolved) {
          errors.push({
            row: rowNumber,
            field: 'Academic Year',
            message: `Academic year "${cleaned.academic_year_name}" not found for this student's institution.`
          });
          continue;
        }
        academicYearId = resolved;
      }
```

- Add `academic_year_id: academicYearId` to the `insertRows.push({ ... })` object.

- [ ] **Step 4: Verify diagnostics + manual import**

Run `mcp__ide__getDiagnostics` for the three files. Download the template (`/api/billing/schedule/bills/template`), fill one row with a valid academic year name, import via `/billing/schedule/bulk-create` → confirm the created bill has `academic_year_id`; a blank year imports as NULL; a bad name yields a per-row error.

- [ ] **Step 5: Commit**

```bash
git add "lib/utils/mappings/student-bill-excel-mappings.ts" "app/api/billing/schedule/bills/template/route.ts" "app/api/billing/schedule/bills/import/route.ts"
git commit -m "feat(billing): optional Academic Year column in bill Excel import/template"
```

---

## Final verification (after all tasks)

- [ ] Run `mcp__ide__getDiagnostics` across every modified file — no new errors.
- [ ] End-to-end as a **non-super-admin billing role** (catches silent RLS/empty-state bugs):
  1. Create year-1 and year-2 tuition bills for one BDS student (set distinct years).
  2. Detail page shows two year groups with correct independent Total/Paid/Outstanding and PAID/PARTIAL/UNPAID badges.
  3. List filter by a year returns only that year; "Unspecified" returns legacy bills.
  4. Pay year-1 in full → only the year-1 group flips to PAID.
  5. Bulk-create a bill for a cohort with a chosen year → all created rows carry it.
- [ ] Confirm legacy bills (no backfill) render as "Unspecified" everywhere and are never silently dropped.

## Self-review notes (coverage vs spec)
- Spec §5.1 DB → Task 1; §5.1 supabase.ts → Task 2; §5.2 types → Task 3; §5.3 service create → Task 4, list → Task 5, detail/summary → Task 6; §5.4 form → Task 7; §5.5 bulk → Task 8; §5.7 grouped detail → Task 9; §5.8 list column+filter → Task 10; §5.9 single view → Task 11; §5.6 Excel → Task 12 (optional). All spec sections covered.
- Gotchas honored: `'' → null` normalization (Tasks 4, 7, 8); no `.eq(col, undefined)` (Task 5 guards); destructure-strip caveat (Task 8); nullable column + UI-required (Tasks 1, 7, 8).
