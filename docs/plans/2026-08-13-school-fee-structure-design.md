# School Fee Structure — Design

**Date:** 2026-08-13
**Status:** Phases 1–7 complete and LIVE (2026-08-13). A school can be configured and billed end to end. Phases 8–10 (Excel import · lock trigger + v2 supersede · fines + parent portal) outstanding.

**Live findings (2026-08-13):** JKKN Matric has **552 active learners, all in 2026-2027**. Two gaps to resolve before generating:
- **LKG and UKG have 0 enrolled learners** despite both appearing on the fee sheet — KG admissions are not in the system for this year.
- **Standard 11 (63) and Standard 12 (126)** carry 189 learners between them but appear on **no** fee sheet supplied so far.
**Scope:** Term-wise annual fee plans for `institutions.entity_type = 'school'`, feeding the existing billing module.

---

## 1. Why this cannot reuse the college fee module

The college engine already exists and works. It is **cohort-locked by design**:

| | College (existing) | School (new) |
|---|---|---|
| Table | `admission_fee_structures` | `school_fee_plans` |
| Keyed on | 8 dimensions (institution, degree, department, programme, quota, community, accommodation, **admission_year**) | 3 dimensions (institution, **program/class**, **academic_year**) |
| Version axis | `admission_year_id` — never changes for a learner | `academic_year_id` — changes every year |
| Effect | A 2026 admit pays the 2026 sheet for all 4 years | A learner pays this year's sheet for this year's class |
| Split | Flat item list, single due date | Fee heads × 3 terms, due date per term |

`learners_profiles` already carries **both** columns:

- `admission_year_id` → cohort (what college resolves on)
- `academic_year_id` → current year (what school resolves on)

That existing split is the whole reason the two modules can coexist without touching each other. School resolution reads `academic_year_id`; college resolution keeps reading `admission_year_id`.

**Reference:** [supabase/migrations/20260506100001_create_admission_fee_structures.sql](../../supabase/migrations/20260506100001_create_admission_fee_structures.sql), [supabase/migrations/20260507100004_rpc_admission_resolve_fee_items_for_lead.sql](../../supabase/migrations/20260507100004_rpc_admission_resolve_fee_items_for_lead.sql)

---

## 2. Decisions taken

| # | Decision | Choice |
|---|---|---|
| 1 | Plan key | `institution_id + program_id + academic_year_id` (flat — no quota/community/stream) |
| 2 | Term model | Fee heads × term allocation grid (amount per head per term; blank = not charged) |
| 3 | Due dates & fines | One **term calendar per institution per academic year** — due date, fine-effective date, flat fine amount per term |
| 4 | Concessions | Named schemes + per-learner assignment |
| 5 | Fee heads | Reuse the global `billing_categories` table |
| 6 | Bill shape | One **term bill per learner** (3 per year) |
| 7 | Generation | Manual batch with dry-run preview, re-runnable |
| 8 | UI | Separate route — originally under admission settings, **moved to `/billing/school-fees` 2026-08-13** |
| 9 | Edits after billing | **Lock + new version + supersede** |
| 10 | Mid-year joiners | Always full year; reduce via concession |
| 11 | Lifecycle | `draft → active → archived`, no approver step |
| 12 | Data entry | **Both** clone-from-last-year and Excel import |

---

## 3. Constraint discovered during design — read this before building

`billing_student_bills` is **one row per fee item**, not a bill header with line items. The existing college RPC inserts one row per billing category:

```sql
INSERT INTO public.billing_student_bills (
    student_id, institution_id, item_category_id,
    bill_description, due_date, quantity,
    unit_amount, total_amount, tax_amount, final_amount,
    balance_amount, status, remarks, created_by
) VALUES (...)   -- one row per fee item
```

`billing_invoices` is **not** a demand-side grouping — its `billing_invoice_items` link to `billing_receipts`, i.e. it is a payment/receipt document.

### Consequence

"One bill per term" is implemented as **a set of `billing_student_bills` rows sharing `(student_id, academic_year_id, due_date)`**, not as a new bill-header table.

To make that set addressable without a parallel header table, stamp three columns on the generated rows:

```sql
ALTER TABLE public.billing_student_bills
  ADD COLUMN IF NOT EXISTS school_fee_plan_id uuid REFERENCES public.school_fee_plans(id),
  ADD COLUMN IF NOT EXISTS term_number smallint,
  ADD COLUMN IF NOT EXISTS fine_effective_date date;
```

`superseded_by_bill_id` **already exists** on `billing_student_bills` — the supersede decision (#9) reuses it rather than inventing a new mechanism.

`academic_year_id` also already exists on `billing_student_bills` (migration `20260606093000`).

Everything downstream — receipts, refunds, apportionment, coverage, analytics, the parent portal fees tab — keeps working unchanged, because the row shape is unchanged.

---

## 4. Data model

### 4.1 `school_fee_plans`

```sql
CREATE TABLE public.school_fee_plans (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id      uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    program_id          uuid NOT NULL REFERENCES public.programs(id),
    academic_year_id    uuid NOT NULL REFERENCES public.academic_years(id),
    version             integer NOT NULL DEFAULT 1,
    name                text NOT NULL,
    status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','active','archived')),
    locked_at           timestamptz,          -- set on first bill generation
    superseded_by       uuid REFERENCES public.school_fee_plans(id),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (institution_id, program_id, academic_year_id, version)
);

-- Exactly one ACTIVE plan per class per year
CREATE UNIQUE INDEX ux_school_fee_plans_one_active
    ON public.school_fee_plans (institution_id, program_id, academic_year_id)
    WHERE status = 'active';
```

`program_id` is the class (I STD, Grade 5) — the `school-label-adapter` already renders `Program → Class`.

### 4.2 `school_fee_plan_items` — the heads × terms grid

```sql
CREATE TABLE public.school_fee_plan_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             uuid NOT NULL REFERENCES public.school_fee_plans(id) ON DELETE CASCADE,
    billing_category_id uuid NOT NULL REFERENCES public.billing_categories(id),
    term_number         smallint NOT NULL CHECK (term_number BETWEEN 1 AND 6),
    amount              numeric(15,2) NOT NULL CHECK (amount >= 0),
    is_one_time         boolean NOT NULL DEFAULT false,
    sort_order          integer NOT NULL DEFAULT 0,
    UNIQUE (plan_id, billing_category_id, term_number)
);
```

One row per **non-blank cell**. A blank cell simply has no row — that is how "Books & Notebooks — with Term I fee" is expressed.

`is_one_time = true` marks Books and Uniform Kit: charged once, and for a mid-year joiner they attach to that learner's *first* generated term rather than being skipped.

`term_number` is capped at 6 rather than hard-coded to 3, so a school on 2 or 4 terms needs no migration.

**Worked example — IV STD, JKKN Matric, 2026-27:**

| head | T-I | T-II | T-III | total |
|---|---:|---:|---:|---:|
| Tuition Fee | 7600 | 12780 | 12780 | 33160 |
| Skill Development | — | 420 | 420 | 840 |
| Books & Notebooks (one-time) | 3405 | — | — | 3405 |
| Uniform Kit (one-time) | 3995 | — | — | 3995 |
| ECA | 1000 | 1000 | 1000 | 3000 |
| **term total** | **16000** | **14200** | **14200** | **44400** |

Tuition total 34000 matches the printed sheet. Nattraja Vidhyalaya's simpler sheet (Book + Term only) is the same table with two heads.

### 4.3 `school_term_calendars`

```sql
CREATE TABLE public.school_term_calendars (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id      uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    academic_year_id    uuid NOT NULL REFERENCES public.academic_years(id),
    term_number         smallint NOT NULL CHECK (term_number BETWEEN 1 AND 6),
    term_name           text NOT NULL,                 -- 'Term I'
    due_date            date NOT NULL,
    fine_effective_date date,                          -- NULL = no fine
    fine_amount         numeric(15,2) NOT NULL DEFAULT 0 CHECK (fine_amount >= 0),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (institution_id, academic_year_id, term_number),
    CHECK (fine_effective_date IS NULL OR fine_effective_date >= due_date)
);
```

Entered **once per school per year**; every class plan inherits it. This is one row set to maintain instead of 12.

> **Note on fines:** the existing `fn_late_charge_accrue()` ([20260815010000](../../supabase/migrations/20260815010000_late_charge_mechanism.sql)) is a *monthly compounding percentage* model and does **not** fit a flat per-term fine. School fines get their own small routine — `school_fee_apply_fines()` — that inserts a single penalty `billing_student_bills` row per overdue term bill once `fine_effective_date` has passed, guarded by a uniqueness key so re-running is idempotent. It does not modify or interfere with the college/hostel late-charge engine.

### 4.4 Concession schemes

```sql
CREATE TABLE public.school_fee_concession_schemes (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id      uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    code                text NOT NULL,
    name                text NOT NULL,                 -- 'Staff Ward'
    mode                text NOT NULL CHECK (mode IN ('percent','flat')),
    value               numeric(15,2) NOT NULL CHECK (value >= 0),
    applies_to_all_heads boolean NOT NULL DEFAULT false,
    is_active           boolean NOT NULL DEFAULT true,
    notes               text,
    UNIQUE (institution_id, code)
);

-- Which heads the scheme touches (ignored when applies_to_all_heads)
CREATE TABLE public.school_fee_concession_scheme_heads (
    scheme_id           uuid NOT NULL REFERENCES public.school_fee_concession_schemes(id) ON DELETE CASCADE,
    billing_category_id uuid NOT NULL REFERENCES public.billing_categories(id),
    PRIMARY KEY (scheme_id, billing_category_id)
);

CREATE TABLE public.school_fee_concession_assignments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id          uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    scheme_id           uuid NOT NULL REFERENCES public.school_fee_concession_schemes(id),
    academic_year_id    uuid NOT NULL REFERENCES public.academic_years(id),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (learner_id, scheme_id, academic_year_id)
);
```

Assignments are **per academic year**, so a concession does not silently roll forward.

Application order (deterministic, so re-running generation is stable):

1. Sum `percent` schemes per head, cap the total at 100%.
2. Apply the capped percent.
3. Subtract `flat` schemes, spread across that head's terms proportionally.
4. Clamp any resulting head amount at 0.

Decision #10 (full year, adjust by concession) means a late-admission waiver is just another `flat` scheme — no separate pro-rata code path.

### 4.5 `school_fee_generation_runs`

```sql
CREATE TABLE public.school_fee_generation_runs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id      uuid NOT NULL REFERENCES public.institutions(id),
    academic_year_id    uuid NOT NULL REFERENCES public.academic_years(id),
    is_dry_run          boolean NOT NULL,
    learners_matched    integer NOT NULL DEFAULT 0,
    bills_created       integer NOT NULL DEFAULT 0,
    skipped_no_plan     integer NOT NULL DEFAULT 0,
    skipped_existing    integer NOT NULL DEFAULT 0,
    result              jsonb,
    run_by              uuid REFERENCES public.profiles(id),
    run_at              timestamptz NOT NULL DEFAULT now()
);
```

Gives an audit answer to "who generated 2026-27 and when", and the dry-run/commit pair is stored side by side.

---

## 5. Resolution and generation

### 5.1 `school_fee_resolve_for_learner(p_learner_id uuid) RETURNS jsonb`

`SECURITY DEFINER`. Read-only — writes nothing, creates no bills. Used by the preview screen and the parent portal.

1. Load `institution_id`, `program_id`, `academic_year_id` from `learners_profiles`.
2. Find the `active` `school_fee_plans` row for that triple. None → return `{"matched": false}`.
3. Load the plan's items, pivot into terms.
4. Join `school_term_calendars` for due/fine dates.
5. Apply concession assignments for that learner + year.
6. Return:

```json
{
  "matched": true,
  "plan_id": "...", "version": 1,
  "class": "IV STD", "academic_year": "2026-27",
  "terms": [
    { "term_number": 1, "due_date": "2026-06-05",
      "fine_effective_date": "2026-06-16", "fine_amount": 250,
      "heads": [
        { "billing_category_id": "...", "name": "Tuition Fee",
          "gross": 7600, "concession": 3800, "net": 3800 }
      ],
      "gross": 16000, "concession": 3800, "net": 12200 }
  ],
  "year_gross": 44400, "year_concession": 16580, "year_net": 27820,
  "concessions_applied": [{ "scheme": "Staff Ward", "mode": "percent", "value": 50 }]
}
```

### 5.2 `school_fee_generate(p_institution_id, p_academic_year_id, p_dry_run boolean DEFAULT true)`

1. Select enrolled learners where `institution_id` and `academic_year_id` match, grouped by `program_id`.
2. For each, call the resolver.
3. Classify: `ready` / `skipped_no_plan` / `skipped_existing` (bills already exist for that learner+year+term).
4. `p_dry_run = true` → return the classification table, write nothing.
5. `p_dry_run = false` → within one transaction:
   - insert `billing_student_bills` rows, one per (head, term) with `net > 0`, stamped with `school_fee_plan_id`, `term_number`, `academic_year_id`, `due_date`, `fine_effective_date`
   - set `locked_at` on every plan used
   - write the `school_fee_generation_runs` row

**Idempotent.** Re-running skips learners who already have bills for that plan version. Safe to run after admitting a new batch mid-year.

### 5.3 Versioning and supersede (decision #9)

Once `locked_at` is set, the plan and its items become read-only (enforced by a `BEFORE UPDATE` trigger, not just UI).

Editing creates **v2** as a `draft` copy. Activating v2:

1. sets `superseded_by` on v1 and archives it
2. finds v1-generated bills that are **unpaid** (`balance_amount = final_amount`)
3. inserts replacement bills from v2 and points the old rows' existing `superseded_by_bill_id` at them
4. leaves paid and part-paid bills untouched, and lists them for manual follow-up

This mirrors the college `admission_fee_change_events` pattern ([20260509100001](../../supabase/migrations/20260509100001_create_admission_fee_change_events.sql)) rather than inventing a second one.

---

## 6. UI — `/billing/school-fees`

> **Moved 2026-08-13** from `/admission/settings/school-fees` to `/billing/school-fees`. The module bills learners, so it belongs beside Receipts, Discounts and Late Charges rather than under admission settings. Route folder, `MENU_PERMISSIONS` keys, sidebar entries and breadcrumbs all moved together; permission keys (`school_fees.*`) are unchanged.

Separate route (decision #8), reusing the existing components from
[app/(routes)/admission/settings/fees-structure/](<../../app/(routes)/admission/settings/fees-structure/>).

```
/billing/school-fees
├─ page.tsx                    Institution + Academic Year pickers, plan list by class
├─ term-calendar/page.tsx      Due / fine dates for the year  (enter this FIRST)
├─ concessions/page.tsx        Scheme catalogue + learner assignments
├─ generate/page.tsx           Dry-run preview → commit
├─ new/page.tsx                Single-class plan form
└─ [id]/
   ├─ page.tsx                 View / edit (read-only once locked)
   └─ version/page.tsx         Create v2 from a locked plan
```

- The institution dropdown is filtered to `entity_type = 'school'`.
- `adaptLabel()` from [lib/utils/school-label-adapter.ts](../../lib/utils/school-label-adapter.ts) already maps `Program → Class` and `Semester → Term`, so headers read correctly with no new strings.
- Sidebar entry gated in `MENU_PERMISSIONS` ([lib/constants/permissions.ts](../../lib/constants/permissions.ts)).

### Main grid

```
JKKN Matriculation Hr Sec School — 2026-27          [ Clone from 2025-26 ]  [ Import ]  [ Export ]

CLASS      TUITION   BOOKS  UNIFORM    ECA   SKILL    YEAR TOTAL   STATUS
I STD        30500    3544     3656   3000       —         40700   active   locked
II STD       31100    3544     3656   3000       —         41300   active   locked
III STD      31700    3657     4043   3000       —         42400   active
IV STD       33160    3405     3995   3000     840         44400   draft
...
XI STD           —       —        —      —       —             —   no plan
```

Clicking a class opens the heads × terms editor.

### Generate screen

```
GENERATE YEAR FEE — 2026-27
Institution: JKKN Matriculation Hr Sec School

  CLASS      LEARNERS   PLAN      STATUS
  I STD            62   v1        ready
  II STD           58   v1        ready
  III STD          54   v1        already generated
  XI STD           41   —         no active plan — skipped

  62 + 58 = 120 learners → 360 term bills

  [ Dry run ]   [ Generate ]
```

---

## 7. Data entry — clone and import (decision #12)

**Clone** — `Clone 2025-26 → 2026-27` copies every active plan for the institution as `draft` v1 rows with identical items, then the grid is edited in place. This is the normal year-on-year path.

**Import** — an Excel template shaped like the printed sheet, using the existing
[.claude/skills/import-export-advanced](../../.claude/skills/import-export-advanced/SKILL.md) pattern (template generation, row-level validation, error report, preview, commit):

| Class | Fee Head | Term I | Term II | Term III |
|---|---|---:|---:|---:|
| I STD | Tuition Fee | 7000 | 11750 | 11750 |
| I STD | Books & Notebooks | 3544 | | |
| I STD | Uniform Kit | 3656 | | |
| I STD | ECA | 1000 | 1000 | 1000 |

Validations: class must exist in that institution; fee head must exist in `billing_categories`; amounts numeric and ≥ 0; no duplicate (class, head, term); target plan must not be locked.

Import is for onboarding a new school from its existing sheet; clone is for every year after.

---

## 8. Permissions

Registered in `20260813100007`. Keys follow the **sibling admission module's format exactly** (`admission_fees.read` → `school_fees.read`), not the dotted `module.feature.verb` style used elsewhere — mixing formats produces a silent permission denial with no error.

| Key | Grants | Roles |
|---|---|---|
| `school_fees.read` | read plans, calendar, schemes, run history | accounts, accountant_assistant, administrator, super_admin |
| `school_fees.manage` | create/edit draft plans + term calendars, clone, import | accounts, administrator, super_admin |
| `school_fees.activate` | draft → active, create v2 of a locked plan | administrator, super_admin |
| `school_fees.generate` | run generation (commit) | accounts, administrator, super_admin |
| `school_fees.concession` | manage schemes and learner assignments | accounts, administrator, super_admin |

`school_fees.activate` is enforced in the **service layer**, not RLS — RLS cannot express "may change `status` but not the amounts".

RLS on every new table follows the existing pattern: institution-scoped reads via `role_has_institution_access()` (already CAS-aware), writes gated on the permission keys above. Learners and parents read their own resolved fee only, through the resolver RPC — never the plan tables directly.

---

## 9. Build order

| Phase | Deliverable | Depends on |
|---|---|---|
| 1 | ✅ **LIVE 2026-08-13** — 7 new tables + 3 columns on `billing_student_bills` + RLS + permissions + fee heads | — |
| 2 | ✅ **DONE 2026-08-13** — types, Zod schemas, service layer, React Query hooks | 1 |
| 3 | ✅ **DONE 2026-08-13** — term calendar screen + sidebar/permission registration | 2 |
| 4 | ✅ **DONE 2026-08-13** — plan list + heads×terms editor + lifecycle | 2, 3 |
| 5 | ✅ **LIVE 2026-08-13** — resolver RPC + class preview (incl. `…100011` service-role fix) | 4 |
| 6 | ✅ **DONE 2026-08-13** — concession schemes + assignments | 4 |
| 7 | ✅ **LIVE 2026-08-13** — `school_fee_generate()` + dry-run/commit screen | 5, 6 |
| 8 | Clone + Excel import/export | 4 |
| 9 | Lock/version/supersede trigger + v2 flow | 7 |
| 10 | `school_fee_apply_fines()` + parent portal fee view | 7 |

Phases 3 → 4 → 5 → 7 are the minimum for a school to bill a year. 6, 8, 9, 10 are additive.

### Phase 1 — files written (2026-08-13)

| File | Contents |
|---|---|
| `20260813100001_create_school_fee_plans.sql` | `school_fee_plans`, `school_fee_plan_items` |
| `20260813100002_create_school_term_calendars.sql` | `school_term_calendars` |
| `20260813100003_create_school_fee_concessions.sql` | `school_fee_concession_schemes`, `_scheme_heads`, `_assignments` |
| `20260813100004_create_school_fee_generation_runs.sql` | `school_fee_generation_runs` |
| `20260813100005_extend_billing_student_bills_for_school_fees.sql` | 3 nullable columns + 2 `NOT VALID` constraints |
| `20260813100006_school_fees_rls.sql` | RLS + grants on the 7 new tables |
| `20260813100007_register_school_fees_permissions.sql` | 5 `school_fees.*` keys on `custom_roles` |
| `20260813100008_validate_school_fee_bill_constraints.sql` | `VALIDATE CONSTRAINT` + 3 partial indexes |
| `20260813100009_billing_categories_applies_to_and_school_heads.sql` | `applies_to text[]` + 6 seeded school fee heads |

**Why 5 and 8 are separate files.** Migrations run one-file-per-transaction. `ADD CONSTRAINT ... NOT VALID` followed by `VALIDATE CONSTRAINT` in the *same* transaction holds the `ACCESS EXCLUSIVE` lock from the ADD across the validation scan — precisely what the `NOT VALID` pattern exists to avoid. Splitting them means the blocking lock is metadata-only and released before any scan touches this live financial table. `20260813100008` also carries a documented `CREATE INDEX CONCURRENTLY` escape hatch if `billing_student_bills` is large enough that a `SHARE`-locked index build is unacceptable.

**Applied via the Supabase SQL editor, not the CLI.** `npx supabase db push` fails in this repo with `LegacyDbPushMissingLocalError`: there is no `supabase/config.toml`, so the CLI enumerates zero local migration files while the remote history holds 2573 versions. Never run the `supabase migration repair --status reverted <2573 versions>` command it suggests — that would mark every applied migration as reverted, and a later push would try to re-run every local file including `20260422000002_wipe_billing_test_data.sql`. Reusable applier for future batches: [scripts/apply-school-fee-migrations.mjs](../../scripts/apply-school-fee-migrations.mjs).

**Verified live 2026-08-13:** 7 tables reachable · 3 columns on `billing_student_bills` all NULL · 6 fee heads seeded · 30 pre-existing categories still `{college}` (36 total) · anon blocked 401 · `school_fees.*` on 4 roles.

### Phase 2 — files written (2026-08-13)

| File | Layer |
|---|---|
| `types/school-fees.ts` | interfaces, DTOs, filters, `buildFeeGrid()` / `gridToItems()` |
| `lib/services/school-fees/school-fees-schemas.ts` | Zod schemas mirroring every DB CHECK |
| `lib/services/school-fees/school-fee-head-service.ts` | `billing_categories` filtered on `applies_to @> '{school}'` |
| `lib/services/school-fees/school-term-calendar-service.ts` | calendar CRUD + clone-with-date-shift |
| `lib/services/school-fees/school-fee-plan-service.ts` | plan CRUD, lifecycle, clone-year, next-version |
| `lib/services/school-fees/school-fee-concession-service.ts` | schemes, scheme-heads, assignments, bulk assign |
| `hooks/school-fees/use-school-fee-heads.ts` | `STABLE_DATA` tier |
| `hooks/school-fees/use-school-term-calendars.ts` | `SEMI_STABLE_DATA` + save/clone mutations |
| `hooks/school-fees/use-school-fee-plans.ts` | year grid, paginated list + CRUD, single-plan detail |
| `hooks/school-fees/use-school-fee-concessions.ts` | scheme catalogue + assignments |

Verified: `tsc --noEmit` clean repo-wide, `eslint` clean, and `buildFeeGrid()` reproduces the IV STD sheet exactly (tuition 33160 + skill 840 = 34000; year 44400).

**Two guards live in the service layer, not the form** — a second browser tab must hit the same wall as the first:
- `assertUnlocked()` rejects any edit to a plan whose `locked_at` is set (the DB trigger arrives in Phase 9).
- `delete()` refuses a locked plan outright, because the FK is `ON DELETE SET NULL` and would otherwise orphan real bills from the plan that explains their amounts.

### Phase 3 — files written (2026-08-13)

| File | Purpose |
|---|---|
| `app/(routes)/billing/school-fees/term-calendar/page.tsx` | route shell — `PermissionGuard` on `school_fees.read` |
| `…/_components/term-calendar-view.tsx` | school + academic-year pickers, empty-state warning |
| `…/_components/term-calendar-form.tsx` | `useFieldArray` term rows, `zodResolver` |
| `…/_components/term-calendar-clone-dialog.tsx` | copy another year's terms with a whole-day date shift |
| `lib/constants/permissions.ts` | new **School Fees** catalog category (5 keys) |
| `lib/sidebarMenuLink.ts` | `MENU_PERMISSIONS` entry + Settings submenu item |

**Sidebar gating decision.** The entry is gated by `school_fees.read` only — it is deliberately **not** hidden by `filterMenuByEntityType()`. That helper keys on the *user's own* institution `entity_type`, and the accounts staff who run school billing sit at an admin office, not at the school; hiding it there would lock out exactly the people who need it. The `entity_type='school'` restriction is enforced by the institution dropdown inside the page instead.

**Derived state, not effects.** The view holds only what the user explicitly picked. The single-school default, the active-year default, and the year reset on school change are all *derived* — because `academic_years` is per-institution, a year id carried over from a previous school is simply absent from the new list and falls through to the default. Three `useEffect` + `setState` pairs would have tripped `react-hooks/set-state-in-effect` and caused cascading renders.

Gates: `tsc --noEmit` 0 errors · `eslint` clean · `check:permissions` OK · `check:menu-coverage` OK · `check:audit-coverage` PASSED · `check:reachability` PASS · `check:sidebar` 0 errors.

`check:sidebar` emits one **warning**: `admission/settings/school-fees` has a child route but no `page.tsx` of its own. Phase 4 resolves it — that path is where the class fee-plan grid lands. `check:tier2-route-coverage` fails on 47 pre-existing depth-2/3 routes, none of them school-fee related, and it is not part of the `build` gate.

### Phase 4 — files written (2026-08-13)

| File | Purpose |
|---|---|
| `school-fees/page.tsx` | class fee-plan grid (also the folder landing page Phase 3 lacked) |
| `school-fees/new/page.tsx` | create a plan; institution/year/program arrive as query params |
| `school-fees/[id]/page.tsx` | view or edit one plan; read-only when locked |
| `_components/school-fee-plans-view.tsx` | class×plan table, status badges, lifecycle actions |
| `_components/fee-grid-editor.tsx` | the heads × terms grid + `editorRowsToItems` / `itemsToEditorRows` |
| `_components/plan-form.tsx` | shared create/edit shell around the grid |
| `_components/clone-year-dialog.tsx` | clone every active plan into another year as drafts |
| `_components/school-year-picker.tsx` | shared school + year selector (term calendar now uses it too) |
| `_components/school-fees-breadcrumb.tsx` | shared trail |
| `hooks/school-fees/use-school-year-selection.ts` | the selection state both screens share |

**One row per CLASS, not per plan.** A school's question is "which classes still need a 2026-27 fee?" — a plan-shaped list answers the opposite, because classes with *no* plan simply would not appear, and those are exactly the rows to check before generating bills. Only the newest non-archived plan per class is shown; older versions stay reachable from the detail page.

**Term columns come from the term calendar, not a constant.** If a school runs two terms the editor shows two columns and generation raises two bills. With no calendar the grid falls back to 3 columns and the page says so — which is also why Phase 3 had to land first.

**Blank ≠ zero.** The editor stores raw input strings so `''` and `0` stay distinguishable: a blank cell produces **no** `school_fee_plan_items` row, which is how "Books & Notebooks — with Term I fee" is expressed. `editorRowsToItems()` drops blanks on save.

**Totals ship with the plans, not as a dependent query.** `useSchoolFeePlansForYear` fetches plans and their item sums in one `queryFn`. A second query keyed off the plan ids would paint every year total as ₹0 before it resolved — on a fee screen that reads as "these plans are empty".

Gates: `tsc --noEmit` 0 errors · `eslint` clean · `check:permissions` OK · `check:menu-coverage` OK (397 hrefs) · `check:audit-coverage` PASSED · `check:sidebar` 0 errors, **school-fees folder warning resolved** · `check:reachability` PASS (52 ≤ 58; `/school-fees/new` is button-invoked from the class grid, the documented case for that count).

### Phase 5 — files written (2026-08-13)

| File | Purpose |
|---|---|
| `supabase/migrations/20260813100010_school_fee_resolve_for_learner.sql` | **the resolver** + `school_fee_resolve_preview_for_class` |
| `lib/services/school-fees/school-fee-resolution-service.ts` | thin RPC client, numeric coercion |
| `hooks/school-fees/use-school-fee-resolution.ts` | per-learner + per-class hooks, `DYNAMIC_DATA` tier |
| `_components/class-fee-preview.tsx` | opt-in learner preview on an active plan |
| `types/school-fees.ts` | `SchoolFeeResolution`, `ResolvedFeeTerm`, `ClassFeePreviewRow` |

**`20260813100010` was applied 2026-08-13.** Verified live: both RPCs resolve (no more `PGRST202`) and anon is blocked with 401.

> **⚠️ Follow-up `20260813100011` written and validated, NOT yet applied.**
> Verification found a real defect: both RPCs are `SECURITY DEFINER` and authorize on `auth.uid()`, so a **Supabase service-key call has no `auth.uid()` and was denied 42501** — API routes, cron and the parent-portal proxy all included. The fix adds `school_fee_caller_is_privileged()`, mirroring the predicate `fn_late_charge_accrue` already uses for the cron-invoked late-charge engine:
> ```sql
> COALESCE(auth.role(), '') = 'service_role'   -- Supabase service key
> OR session_user <> 'authenticator'            -- direct SQL / psql
> ```
> This adds **no exposure** — the service role already bypasses RLS on these tables, so the old behaviour only blocked legitimate callers. Both function bodies are otherwise byte-identical; a diff confirms exactly **one line changed in each**, none of it in the resolution or concession maths. Phase 10's fine cron and any server-side generation need it. Staged as `school-fee-PHASE-5b-service-role.sql`.

**Authorization is inside the function, not around it.** Both RPCs are `SECURITY DEFINER` — they must read plans, concessions and `learners_profiles` across RLS. That makes the internal check load-bearing: without it any authenticated user could read any learner's fee. Three ways in, mirroring the live bill policies: super admin/admin · `school_fees.read` + institution access · the learner themselves (`profiles.learner_id` link or email match).

**Fixed concession order, so re-running generation is stable.**
1. sum percent schemes per head, **cap the total at 100%**
2. apply the capped percent to every cell of that head
3. subtract flat schemes, spread across that head's terms in proportion to what each term still carries
4. clamp each cell at 0

Step 3 rounds per cell, so the parts can miss the intended total by a paisa. The residual is pushed onto the **largest cell** rather than left to drift — on money the head total must be exact.

**An all-heads scheme expands against the plan's heads, not a stored snapshot**, so a scheme created before a fee head existed still covers it.

**One implementation of the maths.** `school_fee_resolve_preview_for_class` calls the per-learner resolver per row rather than re-deriving totals, and there is no TypeScript copy. What a clerk previews and what Phase 7 bills cannot disagree.

**`has_term_calendar` is returned, not enforced.** A term with no calendar row still resolves (with a null `due_date`) so the preview can show the amounts; generation is what refuses it.

Gates: `tsc --noEmit` 0 errors · `eslint` clean. The 366-line plpgsql was validated by creating both functions in a throwaway schema via `exec_sql` and dropping it in the same transaction — `public` was never touched.

### Phase 6 — files written (2026-08-13)

| File | Purpose |
|---|---|
| `school-fees/concessions/page.tsx` | route shell |
| `…/_components/concessions-view.tsx` | scheme catalogue ⇄ per-year assignment list |
| `…/_components/scheme-form-dialog.tsx` | create/edit a scheme, `zodResolver` |
| `…/_components/assign-learners-dialog.tsx` | bulk assign with class filter + search |
| `SchoolFeePlanService.listEnrolledLearners()` + `useEnrolledLearners` | shared with Phase 7 |

No new tables — Phase 1 already shipped `school_fee_concession_schemes`, `_scheme_heads` and `_assignments`, and Phase 2 shipped the service. **Phase 6 is UI only.**

**`lifecycle_status = 'active'` is the enrolment marker** (`graduated` / `inactive` / `enquiry` must never be billed or offered a concession). The lookup lives in `SchoolFeePlanService` rather than the concession service precisely so Phase 7's generation uses the same definition of "enrolled".

**Already-assigned learners render checked and disabled**, so "Select all N available" never promises work it won't do. The underlying `assignBulk` is `upsert … ignoreDuplicates` on `UNIQUE (learner_id, scheme_id, academic_year_id)`, so re-running is a no-op rather than an error.

**Delete refuses when learners are assigned** and says to deactivate instead — cascading would erase the record of who was discounted and why, which is exactly what an auditor asks for.

**The "School Fee Plans" submenu had to stop owning its siblings.** Its `active` predicate matched every `/school-fees/*` path, so adding `/concessions` would have highlighted two rows at once; it now excludes both sibling screens explicitly.

Gates: `tsc --noEmit` 0 errors · `eslint` clean · `check:permissions` OK · `check:menu-coverage` OK (398 hrefs) · `check:audit-coverage` PASSED · `check:sidebar` 0 errors · `check:reachability` PASS (52 ≤ 58, unchanged).

### Phase 7 — files written (2026-08-13)

| File | Purpose |
|---|---|
| `supabase/migrations/20260813100012_school_fee_generate.sql` | `school_fee_generation_preview` + `school_fee_generate` |
| `lib/services/school-fees/school-fee-generation-service.ts` | preview / generate / run history |
| `hooks/school-fees/use-school-fee-generation.ts` | preview, dry-run, commit, invalidation |
| `school-fees/generate/page.tsx` + `_components/generate-view.tsx` | the screen |

**Applied 2026-08-13**, after `20260813100011`. Verified live: `school_fee_generation_preview` returns all 14 JKKN Matric classes with correct learner counts, and anon is blocked (401) on both RPCs.

**`school_fee_generate` is the only function in the module that writes financial records.** Guards, in firing order:

1. `school_fees.generate` + institution access
2. plan must be `status='active'` — drafts and archived are invisible to it
3. learner must be `lifecycle_status='active'`
4. **every** term the plan uses must have a `school_term_calendars` row with a `due_date`, else the whole class is refused — a bill with no due date can never be chased or fined, and half-billing a class is worse than not billing it
5. only heads whose resolved **net > 0** become rows
6. `ON CONFLICT DO NOTHING` against `ux_billing_bills_school_fee_item`

It is **INSERT-only** into `billing_student_bills` — never UPDATE, never DELETE. Every row it writes carries a non-NULL `school_fee_plan_id`, and nothing outside this module reads that column, so college and hostel billing are untouched.

**Idempotency is structural, not procedural.** Guard 6 means a retry after a network timeout physically cannot double-charge, rather than relying on the UI to prevent a second click.

**Two bugs caught while writing it, both by re-reading rather than by a test:**
- The preview was being called **twice** per commit — once for the breakdown, once for the ready plan ids. Since it resolves *every learner in the school*, that doubled the most expensive part of the run. The ids now come out of the breakdown JSON already in hand.
- `skipped_no_plan` would always have reported **0 learners**, because the learner count was sourced from a CTE that joins learners to plans — so a class with no plan contributed no rows. It now counts from the learner set directly, which is exactly the number the operator needs to see.

**Committing requires typing `GENERATE`.** The dialog states the learner count, class count and rupee total first. A single click is too easy to do by accident for something that writes hundreds of financial records.

`is_one_time` is stored but **not acted on** at generation: decision #10 bills the full year for everyone, so there is no mid-year proration for it to affect. It stays for a future pro-rata option.

Gates: `tsc --noEmit` 0 errors · `eslint` clean · `check:permissions` OK · `check:menu-coverage` OK (399 hrefs) · `check:audit-coverage` PASSED · `check:sidebar` 0 errors · `check:reachability` PASS (52 ≤ 58). SQL validated in a throwaway schema; `public` untouched.

**Not built in Phase 1 (deliberate):** the `locked_at` enforcement trigger is Phase 9, and there is no trigger asserting `institutions.entity_type = 'school'` on plan insert — a `CHECK` cannot contain a subquery, so that guard belongs in the service layer or a later trigger.

---

## 10. Open items

### Resolved 2026-08-13 (verified against the live database)

**1. Fee head visibility — CONFIRMED, built in `20260813100009`.**
`billing_categories.applies_to text[]` added, defaulting to `{college}` so every one of the ~30 existing categories keeps its current meaning and no row is UPDATEd. School screens filter `applies_to @> '{school}'`; no college query filters on it, so the column is inert for college until someone wires it.

The same migration **seeds the school heads**, because a live check showed none of them existed — `billing_categories` held only college-shaped tuition rows (`1 Year Tuition Fee` … `6 Year Tuition Fee`) and had no `Books & Notebooks`, `ECA` or `Skill Development` at all. Without the seed, `applies_to` would filter an empty set:

| category_name | kind | frequency |
|---|---|---|
| Tuition Fee | tuition | yearly |
| Books & Notebooks | other | yearly |
| Uniform Kit | other | yearly |
| ECA | other | yearly |
| Skill Development | tuition | yearly |
| School Late Fee | penalty | one-time |

`School Late Fee` is deliberately separate from the college `Late Payment Charge`, so the flat school fine never mixes into the percentage-engine's collection analytics.

`Transport Fee` stays `{college}` — school bus fees appear on neither 2026-27 sheet. Widening it later is a one-line `UPDATE`, documented at the foot of the migration.

**2. `programs` rows — CONFIRMED PRESENT.** Both schools are already keyable:

| Institution | `entity_type` | classes | rows |
|---|---|---|---|
| JKKN Matric Higher Secondary School (`MATRIC`) | school | LKG, UKG, Standard 1–12 | 14 |
| Nattraja Vidhyalya CBSE (`NV`) | school | PREKG, LKG, UKG, GRADE 1–12 | 15 |

Two mismatches to handle in the UI/import rather than the schema — neither blocks Phase 1:

- **Nattraja naming.** The fee sheet says *Pre KG / Jr.KG / Sr.KG*; the database says *PREKG / LKG / UKG*. The Excel importer needs an alias map (`Jr.KG → LKG`, `Sr.KG → UKG`), not new `programs` rows.
- **Classes with no fee sheet.** Matric has Standard 11–12 and Nattraja has GRADE 10–12 in the database, but neither appears on its 2026-27 sheet. These correctly surface as `no active plan — skipped` on the generate screen; confirm whether sheets exist for them.

### Still open (none affect the schema — can wait for Phase 3)

3. **Term count per school.** Schema allows 1–6. Confirm both schools are on 3.
4. **Fine amount.** Neither sheet states a fine. Confirm it is a flat per-term rupee amount and whether it is uniform across classes.
5. **Class coverage.** Confirm Standard 11–12 / GRADE 10–12 are genuinely out of scope, or supply their sheets.
6. **Optional heads.** Is ECA compulsory for every learner, or opt-in? Currently modelled as compulsory; opt-in would need an `is_optional` flag plus a per-learner election.
