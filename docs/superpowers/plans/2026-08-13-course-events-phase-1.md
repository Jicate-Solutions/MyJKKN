# Course Events — Phase 1 (Schema Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the complete database foundation for the Course Events module — 11 new tables with RLS, the `courses.*` permission catalogue and its role grants, the `jkkn_identities` extension that lets an external participant hold a permanent JKKN ID, and generated types — so that Phase 2 can build UI against a schema that is already correct and already protected.

**Architecture:** Seven migrations applied in dependency order. Every table ships with its RLS policies **in the same migration** — a table must never exist unprotected, even briefly. Balances are derived by trigger, never by application code. The module mints no identifiers: it calls the existing `fn_issue_jkkn_id`.

**Tech Stack:** PostgreSQL 15 (Supabase), applied via `mcp__supabase__apply_migration`. TypeScript 5 / Next.js 16 for the catalogue files. Verification is SQL assertions + `mcp__ide__getDiagnostics` + `npx tsx scripts/check-permission-audit-coverage.ts`.

**Spec:** `docs/superpowers/specs/2026-08-13-course-events-design.md`

---

## Global Constraints

- **Branch:** `feat/course-events-module`. Do not commit to `main` — it is protected and requires a PR.
- **There is NO test suite in this repo.** Never write "run the tests" and never claim tests pass. The test cycle for a migration is: apply it, then run a **verification SQL query** whose expected output is stated in the step. For TypeScript, use `mcp__ide__getDiagnostics` — never full `tsc` (3–4 min, OOMs under ~10 GB heap).
- **Every migration file must contain its real SQL body.** When applying via `mcp__supabase__apply_migration`, also write the identical SQL to `supabase/migrations/<name>.sql`. Never leave a `SELECT 1;` placeholder — it hides column-name typos.
- **Migration filenames:** `supabase/migrations/YYYYMMDDHHMMSS_name.sql`. Use the timestamps given in each task so ordering is deterministic.
- **RLS function calls must be wrapped in a subselect** — `(SELECT public.is_super_admin())`, not `public.is_super_admin()`. Postgres then evaluates them once per query instead of once per row. This repo has a dedicated migration (`rls_initplan_wrap_hot_tables.sql`) that retrofitted exactly this; do not create new work for it.
- **`user_has_permission` has two overloads** — `(text)` and `(uuid, text)`. RLS policies use the **single-argument** form, which resolves `auth.uid()` internally.
- **Never hardcode a role name in SQL.** Gate on permission keys via `user_has_permission`, and on tenancy via `role_has_institution_access(institution_id)`.
- **`REVOKE ... FROM anon`, not `FROM PUBLIC` alone.** Supabase's `ALTER DEFAULT PRIVILEGES` grants to `anon` and `authenticated` directly, so revoking only from `PUBLIC` leaves `anon` holding access.
- **`DROP FUNCTION` discards the function's ACL.** Any drop-and-recreate must re-apply its `REVOKE`/`GRANT` in the same migration.
- All money columns are `numeric(12,2)`. All tables carry `institution_id uuid NOT NULL`.
- Declaring a permission key in `permissions.ts` grants nothing. It must also be written into `custom_roles.permissions` JSONB by migration, or pages render empty.

---

## File Structure

**Created — migrations**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260813100000_course_events_core.sql` | `course_events`, `course_packages`, `course_package_installments`, sum-check trigger, RLS |
| `supabase/migrations/20260813100100_course_sessions_and_reservations.sql` | `course_sessions`, `resource_reservations.course_session_id`, widened CHECK, RLS |
| `supabase/migrations/20260813100200_course_registration_forms.sql` | 3 form-builder tables, RLS |
| `supabase/migrations/20260813100300_course_applications_enrollments.sql` | `course_applications`, `course_enrollments`, RLS, additive participant policies for earlier tables |
| `supabase/migrations/20260813100400_course_billing.sql` | `course_bills`, `course_bill_payments`, balance-derivation triggers, RLS |
| `supabase/migrations/20260813100500_jkkn_identity_external_participant.sql` | `jkkn_identities` third person kind + `profile_id` + widened issuer |
| `supabase/migrations/20260813100600_course_permissions_and_role.sql` | `profiles.is_external_participant`, `courses.*` role grants, Course Participant role |

**Modified — catalogue & types**

| File | Change |
|---|---|
| `lib/constants/permissions.ts` | New `Courses` entry in `PERMISSION_CATEGORIES` |
| `lib/constants/table-module-map.ts` | `['course_', 'Courses']` in `MODULE_PREFIXES` |
| `lib/permissions-audit/module-mappings.ts` | `'Courses': 'courses'` in `MODULE_TO_CATEGORY_KEY` |
| `types/supabase.ts` | Regenerated — all 11 tables plus the two altered ones |

**Also mirrored (repo convention):** after each migration is applied, append its objects to the reference files in `supabase/setup/` — `01_tables.sql`, `02_functions.sql`, `03_policies.sql`, `04_triggers.sql`. See `supabase/MODULE_DEVELOPMENT_WORKFLOW.md`.

---

## Task 1: Permission catalogue and audit coverage

Do this first. It is the only task with a runnable gate, and later RLS policies reference these key strings.

**Files:**
- Modify: `lib/constants/permissions.ts`
- Modify: `lib/constants/table-module-map.ts:67` (`MODULE_PREFIXES`)
- Modify: `lib/permissions-audit/module-mappings.ts:118` (`MODULE_TO_CATEGORY_KEY`)

**Interfaces:**
- Consumes: nothing.
- Produces: the 15 permission key strings below. Every later RLS policy and the Task 7 role-grant migration use them verbatim. A typo here is silent — the policy compiles and denies everyone.

```
courses.view                  courses.create                courses.edit
courses.delete                courses.packages.manage       courses.forms.manage
courses.sessions.manage       courses.applications.view     courses.applications.decide
courses.enrollments.manage    courses.billing.view          courses.billing.manage
courses.attendance.mark       courses.certificates.issue    courses.participant.self
```

- [ ] **Step 1: Read the surrounding shape**

Read `lib/constants/permissions.ts` around line 2456 (the `Events` category). Confirm each entry is `{ name, key, permissions: [{ key, label }] }` and that `key` values in `PERMISSION_CATEGORIES` are unique — a duplicate category `key` silently collapses two modules into one in Role Management.

- [ ] **Step 2: Add the `Courses` category**

Insert immediately after the `Events` category object in `PERMISSION_CATEGORIES`:

```typescript
  // Course Events (2026-08-13). Paid, multi-session learning courses open to
  // learners, staff and external participants. See
  // docs/superpowers/specs/2026-08-13-course-events-design.md
  //
  // `courses.participant.self` is the ONLY key held by the Course Participant
  // role an external registrant is given at approval. It grants read of their
  // own enrollment, bills and receipts and nothing else — it is never bundled
  // into an admin key.
  {
    name: 'Courses',
    key: 'courses',
    permissions: [
      { key: 'courses.view', label: 'View Courses' },
      { key: 'courses.create', label: 'Create Courses' },
      { key: 'courses.edit', label: 'Edit Courses' },
      { key: 'courses.delete', label: 'Delete Courses (cascades packages, sessions, forms)' },
      { key: 'courses.packages.manage', label: 'Manage Course Packages & Installment Plans' },
      { key: 'courses.forms.manage', label: 'Manage Course Registration Forms' },
      { key: 'courses.sessions.manage', label: 'Manage Course Sessions & Venue Holds' },
      { key: 'courses.applications.view', label: 'View Course Applications' },
      { key: 'courses.applications.decide', label: 'Approve/Reject Course Applications (issues a JKKN ID)' },
      { key: 'courses.enrollments.manage', label: 'Manage Course Enrollments (withdraw, change package)' },
      { key: 'courses.billing.view', label: 'View Course Bills & Receipts' },
      { key: 'courses.billing.manage', label: 'Manage Course Billing (void bills, record offline payments)' },
      { key: 'courses.attendance.mark', label: 'Mark Course Session Attendance' },
      { key: 'courses.certificates.issue', label: 'Issue Course Certificates' },
      { key: 'courses.participant.self', label: 'View Own Course Enrollment & Bills (participant)' },
    ],
  },
```

- [ ] **Step 3: Map the table prefix to the module**

In `lib/constants/table-module-map.ts`, add to the `MODULE_PREFIXES` array (line 67). Order matters if prefixes overlap; `course_` does not overlap any existing prefix, so append it alphabetically among its neighbours:

```typescript
  ['course_', 'Courses'],
```

- [ ] **Step 4: Confirm the module→category mapping resolves — no edit required**

**CORRECTED 2026-08-13 (was wrong in the first draft).** `MODULE_TO_CATEGORY_KEY` is **not** a literal object you insert into. Since the 2026-04-27 refactor it is `Object.freeze()`d and built programmatically at `module-mappings.ts:118`:

```typescript
Object.fromEntries(getAllModuleNames().map((m) => [m, deriveCategoryKey(m)]))
```

and `deriveCategoryKey` (line 68) lowercases the module name, replaces whitespace with underscores, and returns it if it matches a `PERMISSION_CATEGORIES` key. `'Courses'` normalizes to `'courses'`, which Step 2 just added — so the mapping resolves with **zero code change** to this file.

Do **not** add `Courses: 'courses'` to `MODULE_CATEGORY_OVERRIDES`. That map exists for names that do *not* normalize (`'Social Ads' → 'social'`). A redundant entry returns exactly what derivation returns and misleads the next reader into thinking every module needs one.

Verify rather than assume — Step 5's gate is the proof. If it passes with this file untouched, the mapping resolved.

Do **not** add anything to `ROUTE_PREFIX_TO_MODULE` yet. That map is keyed on routes in `MENU_PERMISSIONS`, and Phase 1 adds no routes. Adding a prefix for a route that does not exist is harmless but misleading; Phase 2 adds `['/courses', 'Courses']` at the same time it adds the menu entry.

- [ ] **Step 5: Run the coverage gate**

Run: `npx tsx scripts/check-permission-audit-coverage.ts`

Expected: exits 0. If it reports `[category] Module "Courses" has no PERMISSION_CATEGORIES key mapping`, Step 4 was missed. If it reports `maps to category "courses" but no such key exists`, the `key: 'courses'` in Step 2 is wrong or misspelled.

- [ ] **Step 6: Typecheck the three files**

Run `mcp__ide__getDiagnostics` on `lib/constants/permissions.ts`, `lib/constants/table-module-map.ts`, and `lib/permissions-audit/module-mappings.ts`.

Expected: no errors. A trailing-comma or missing-brace error here is common because these are very large object literals.

- [ ] **Step 7: Commit**

```bash
git add lib/constants/permissions.ts lib/constants/table-module-map.ts lib/permissions-audit/module-mappings.ts
git commit -m "feat(courses): add courses.* permission catalogue and audit coverage mappings"
```

---

## Task 2: Core course tables — events, packages, installments

**Files:**
- Create: `supabase/migrations/20260813100000_course_events_core.sql`

**Interfaces:**
- Consumes: `courses.view`, `courses.create`, `courses.edit`, `courses.packages.manage` from Task 1.
- Produces: tables `course_events`, `course_packages`, `course_package_installments`. Task 3 FKs to `course_events(id)`; Task 4 FKs to `course_events(id)`; Task 5 FKs to `course_events(id)` and `course_packages(id)`. Also produces `public.fn_course_package_amounts_chk()`, reused by two constraint triggers.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260813100000_course_events_core.sql`:

```sql
-- =====================================================================
-- Course Events — core: courses, priced packages, installment templates
-- Phase 1 of docs/superpowers/specs/2026-08-13-course-events-design.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. course_events
-- ---------------------------------------------------------------------
-- `status` deliberately has NO 'closed' value. Whether applications are
-- accepted is decided solely by the application_opens_at/closes_at
-- window. Two independent switches governing one behaviour is how intake
-- states drift apart.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_events (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id           uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  title                    text NOT NULL,
  slug                     text NOT NULL,
  code                     text,
  description              text,
  mode                     text NOT NULL DEFAULT 'offline'
                             CHECK (mode IN ('offline','online','hybrid')),
  status                   text NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft','published','completed','cancelled')),
  start_date               date,
  end_date                 date,
  application_opens_at     timestamptz,
  application_closes_at    timestamptz,
  total_seats              int CHECK (total_seats IS NULL OR total_seats > 0),
  venue_text               text,
  cover_image_url          text,
  year                     int,
  edition_number           int,
  previous_course_event_id uuid REFERENCES public.course_events(id) ON DELETE SET NULL,
  created_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_events_slug_format_chk
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT course_events_date_order_chk
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT course_events_application_window_chk
    CHECK (application_closes_at IS NULL OR application_opens_at IS NULL
           OR application_closes_at >= application_opens_at),
  CONSTRAINT course_events_slug_uniq UNIQUE (institution_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_course_events_institution
  ON public.course_events (institution_id, status);
CREATE INDEX IF NOT EXISTS idx_course_events_previous
  ON public.course_events (previous_course_event_id)
  WHERE previous_course_event_id IS NOT NULL;

COMMENT ON TABLE public.course_events IS
  'A paid, multi-session learning course conducted by an institution. Open to learners, staff and external participants.';
COMMENT ON COLUMN public.course_events.previous_course_event_id IS
  'Lineage for a course repeated yearly. Set by fn_clone_course_event (Phase 7).';

-- ---------------------------------------------------------------------
-- 2. course_packages — priced tiers
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id uuid NOT NULL REFERENCES public.course_events(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  total_amount    numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  currency        text NOT NULL DEFAULT 'INR',
  seat_cap        int CHECK (seat_cap IS NULL OR seat_cap > 0),
  sale_opens_at   timestamptz,
  sale_closes_at  timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  display_order   int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_packages_name_uniq UNIQUE (course_event_id, name),
  CONSTRAINT course_packages_sale_window_chk
    CHECK (sale_closes_at IS NULL OR sale_opens_at IS NULL
           OR sale_closes_at >= sale_opens_at)
);

CREATE INDEX IF NOT EXISTS idx_course_packages_event
  ON public.course_packages (course_event_id) WHERE is_active;

COMMENT ON COLUMN public.course_packages.seat_cap IS
  'NULL means unlimited. Waitlisting when a cap is reached is out of scope for v1.';

-- ---------------------------------------------------------------------
-- 3. course_package_installments — the schedule template
-- ---------------------------------------------------------------------
-- Due dates are ABSOLUTE. A cohort course has one schedule everybody
-- pays to; enrollment-relative offsets are explicitly out of scope.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_package_installments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id     uuid NOT NULL REFERENCES public.course_packages(id) ON DELETE CASCADE,
  installment_no smallint NOT NULL CHECK (installment_no >= 1),
  label          text,
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  due_date       date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_package_installments_no_uniq UNIQUE (package_id, installment_no)
);

CREATE INDEX IF NOT EXISTS idx_course_package_installments_package
  ON public.course_package_installments (package_id, installment_no);

-- ---------------------------------------------------------------------
-- 4. Integrity: installments must sum to the package price
-- ---------------------------------------------------------------------
-- A package whose parts do not add up to its price is the single most
-- damaging thing that can silently ship here: bills would be generated
-- that can never reach a zero balance, so the participant could never
-- become 'confirmed' and could never attend.
--
-- DEFERRABLE INITIALLY DEFERRED so a multi-row edit may pass through an
-- inconsistent state inside a transaction but can never COMMIT one.
--
-- A package with ZERO installments is allowed — it is a draft being
-- built. Bill generation (Phase 4) refuses such a package separately.
-- Rejecting it here would force every package insert to carry its whole
-- schedule in the same statement.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_course_package_amounts_chk()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_package_id uuid;
  v_total      numeric(12,2);
  v_sum        numeric(12,2);
  v_count      int;
BEGIN
  -- One function, two triggers: the installments table exposes
  -- package_id, the packages table exposes id.
  IF TG_TABLE_NAME = 'course_packages' THEN
    v_package_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_package_id := COALESCE(NEW.package_id, OLD.package_id);
  END IF;

  SELECT total_amount INTO v_total
    FROM public.course_packages
   WHERE id = v_package_id;

  -- The package itself was deleted in this transaction (ON DELETE
  -- CASCADE removed its installments). Nothing left to reconcile.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(amount), 0), count(*)
    INTO v_sum, v_count
    FROM public.course_package_installments
   WHERE package_id = v_package_id;

  IF v_count > 0 AND v_sum <> v_total THEN
    RAISE EXCEPTION
      'Course package % has % installments totalling % but its price is %. The schedule must add up to the price.',
      v_package_id, v_count, v_sum, v_total
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.fn_course_package_amounts_chk() IS
  'Constraint-trigger body shared by course_packages and course_package_installments: the installment schedule must sum to the package price at COMMIT. Zero installments is permitted (draft package).';

CREATE CONSTRAINT TRIGGER trg_course_package_installments_sum
AFTER INSERT OR UPDATE OR DELETE ON public.course_package_installments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_course_package_amounts_chk();

CREATE CONSTRAINT TRIGGER trg_course_packages_total_sum
AFTER UPDATE OF total_amount ON public.course_packages
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_course_package_amounts_chk();

-- ---------------------------------------------------------------------
-- 5. updated_at maintenance
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_courses_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_course_events_touch
  BEFORE UPDATE ON public.course_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_packages_touch
  BEFORE UPDATE ON public.course_packages
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_package_installments_touch
  BEFORE UPDATE ON public.course_package_installments
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
-- Participant-visibility policies are ADDITIVE and are added in
-- 20260813100300 (they reference course_enrollments, which does not
-- exist yet). Until then these tables are staff-only, which is the safe
-- direction to be wrong in.
-- ---------------------------------------------------------------------
ALTER TABLE public.course_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_packages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_package_installments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.course_events               FROM anon, PUBLIC;
REVOKE ALL ON public.course_packages             FROM anon, PUBLIC;
REVOKE ALL ON public.course_package_installments FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_events               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_packages             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_package_installments TO authenticated;

CREATE POLICY course_events_select ON public.course_events
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_events_insert ON public.course_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.create'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_events_update ON public.course_events
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.edit'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.edit'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_events_delete ON public.course_events
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR ((SELECT public.user_has_permission('courses.delete'))
        AND public.role_has_institution_access(institution_id))
  );

-- Packages and installments: read follows courses.view, write follows
-- courses.packages.manage. Installments have no institution_id of their
-- own, so they inherit tenancy through their package.
CREATE POLICY course_packages_select ON public.course_packages
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_packages_manage ON public.course_packages
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.packages.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.packages.manage'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_package_installments_select ON public.course_package_installments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND EXISTS (
          SELECT 1 FROM public.course_packages p
           WHERE p.id = course_package_installments.package_id
             AND public.role_has_institution_access(p.institution_id)))
  );

CREATE POLICY course_package_installments_manage ON public.course_package_installments
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.packages.manage'))
        AND EXISTS (
          SELECT 1 FROM public.course_packages p
           WHERE p.id = course_package_installments.package_id
             AND public.role_has_institution_access(p.institution_id)))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.packages.manage'))
        AND EXISTS (
          SELECT 1 FROM public.course_packages p
           WHERE p.id = course_package_installments.package_id
             AND public.role_has_institution_access(p.institution_id)))
  );
```

- [ ] **Step 2: Apply the migration**

Apply with `mcp__supabase__apply_migration`, name `20260813100000_course_events_core`, passing the **exact SQL above**. Confirm the identical text is also saved at `supabase/migrations/20260813100000_course_events_core.sql`.

- [ ] **Step 3: Verify the tables, constraints and RLS exist**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT c.relname,
       c.relrowsecurity                                            AS rls_on,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('course_events','course_packages','course_package_installments')
 ORDER BY 1;
```

Expected exactly:

| relname | rls_on | policies |
|---|---|---|
| course_events | true | 4 |
| course_package_installments | true | 2 |
| course_packages | true | 2 |

If `rls_on` is false for any row, the table is readable by every authenticated user — stop and fix before continuing.

- [ ] **Step 4: Prove the sum-check trigger actually fires**

This is the highest-value assertion in the whole task. Run:

```sql
DO $$
DECLARE
  v_inst uuid;
  v_course uuid;
  v_pkg uuid;
BEGIN
  SELECT id INTO v_inst FROM public.institutions LIMIT 1;

  INSERT INTO public.course_events (institution_id, title, slug)
  VALUES (v_inst, 'TRIGGER PROBE', 'trigger-probe-delete-me')
  RETURNING id INTO v_course;

  INSERT INTO public.course_packages (course_event_id, institution_id, name, total_amount)
  VALUES (v_course, v_inst, 'Probe', 250000.00)
  RETURNING id INTO v_pkg;

  -- Deliberately WRONG: 3 x 50,000 = 150,000, not 250,000.
  INSERT INTO public.course_package_installments (package_id, installment_no, amount, due_date)
  VALUES (v_pkg, 1, 50000, '2026-09-01'),
         (v_pkg, 2, 50000, '2026-12-01'),
         (v_pkg, 3, 50000, '2027-03-01');

  -- LOAD-BEARING. The trigger is DEFERRABLE INITIALLY DEFERRED, so it is
  -- evaluated at COMMIT — and this block never commits, because the RAISE
  -- below aborts it. Without this line the probe reports "PROBE FAILED"
  -- whether the trigger is attached or not: a false negative every time.
  -- SET CONSTRAINTS ALL IMMEDIATE forces the check to run right here.
  SET CONSTRAINTS ALL IMMEDIATE;

  RAISE EXCEPTION 'PROBE FAILED — the sum check did not fire';
END $$;
```

Expected: the statement **fails** with
`ERROR: 23514: Course package … has 3 installments totalling 150000.00 but its price is 250000.00`
and a `CONTEXT` line naming `SQL statement "SET CONSTRAINTS ALL IMMEDIATE"` — that context is the proof the trigger fired at the forced check, not somewhere else.

If you instead see `PROBE FAILED — the sum check did not fire`, the trigger is not attached — investigate before continuing. Either outcome rolls the whole `DO` block back, so no probe rows survive.

- [ ] **Step 4a: Positive control — a CORRECT schedule must be accepted**

A trigger that raised unconditionally would also pass Step 4. Prove it does not:

```sql
DO $$
DECLARE
  v_inst uuid; v_course uuid; v_pkg uuid; v_sum numeric;
BEGIN
  SELECT id INTO v_inst FROM public.institutions LIMIT 1;

  INSERT INTO public.course_events (institution_id, title, slug)
  VALUES (v_inst, 'POSITIVE CONTROL', 'positive-control-delete-me')
  RETURNING id INTO v_course;

  INSERT INTO public.course_packages (course_event_id, institution_id, name, total_amount)
  VALUES (v_course, v_inst, 'Regular', 250000.00) RETURNING id INTO v_pkg;

  -- CORRECT: 4 x 62,500 = 250,000.
  INSERT INTO public.course_package_installments (package_id, installment_no, amount, due_date)
  VALUES (v_pkg, 1, 62500, '2026-09-01'), (v_pkg, 2, 62500, '2026-12-01'),
         (v_pkg, 3, 62500, '2027-03-01'), (v_pkg, 4, 62500, '2027-06-01');

  SET CONSTRAINTS ALL IMMEDIATE;

  SELECT sum(amount) INTO v_sum
    FROM public.course_package_installments WHERE package_id = v_pkg;

  RAISE EXCEPTION 'POSITIVE CONTROL OK - correct schedule accepted, sum=%', v_sum;
END $$;
```

Expected: fails with `P0001: POSITIVE CONTROL OK - correct schedule accepted, sum=250000.00`.

Reaching that line means the constraint check passed. Any `23514` here means the trigger rejects valid data.

- [ ] **Step 5: Confirm the probe left nothing behind**

```sql
SELECT count(*) AS leftovers FROM public.course_events WHERE slug = 'trigger-probe-delete-me';
```

Expected: `0`.

- [ ] **Step 6: Mirror into the setup reference files**

Append the three `CREATE TABLE` statements to `supabase/setup/01_tables.sql`, the two functions to `02_functions.sql`, the policies to `03_policies.sql`, and the triggers to `04_triggers.sql`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260813100000_course_events_core.sql supabase/setup/
git commit -m "feat(courses): course_events, course_packages and installment templates with RLS

Installment schedules are held to their package price by a DEFERRABLE
constraint trigger — a package whose parts do not sum to its price would
generate bills that can never reach a zero balance, so the participant
could never become confirmed and could never attend."
```

---

## Task 3: Sessions and the venue-booking seam

**Files:**
- Create: `supabase/migrations/20260813100100_course_sessions_and_reservations.sql`

**Interfaces:**
- Consumes: `course_events(id)` from Task 2; `courses.view`, `courses.sessions.manage` from Task 1.
- Produces: `course_sessions(id)`, and a new nullable `resource_reservations.course_session_id`. Phase 2's venue-hold service writes that column.

**This task modifies `resource_reservations`, a live shared table other modules depend on.** It is the only place Phase 1 reaches into existing infrastructure.

- [ ] **Step 1: Record the pre-change state of the constraint**

```sql
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.resource_reservations'::regclass
   AND conname = 'resource_reservations_event_or_session_check';
```

Expected: one row, `CHECK ((NOT ((event_id IS NOT NULL) AND (session_id IS NOT NULL))))`.

If this returns zero rows, the constraint has already been altered by someone else — stop and re-read the table before proceeding.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260813100100_course_sessions_and_reservations.sql`:

```sql
-- =====================================================================
-- Course Events — sessions, and the link into Resource Management
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.course_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id   uuid NOT NULL REFERENCES public.course_events(id) ON DELETE CASCADE,
  institution_id    uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  session_no        int,
  title             text,
  session_date      date NOT NULL,
  start_time        time NOT NULL,
  end_time          time NOT NULL,
  trainer_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  trainer_name      text,
  venue_resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL,
  venue_text        text,
  reservation_id    uuid REFERENCES public.resource_reservations(id) ON DELETE SET NULL,
  is_cancelled      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_sessions_time_order_chk CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_course_sessions_event
  ON public.course_sessions (course_event_id, session_date);
CREATE INDEX IF NOT EXISTS idx_course_sessions_date
  ON public.course_sessions (session_date) WHERE NOT is_cancelled;

COMMENT ON TABLE public.course_sessions IS
  'One scheduled sitting of a course. Each session holds its OWN venue reservation, so a weekend bootcamp books only the Saturdays it uses rather than blocking a hall for months.';
COMMENT ON COLUMN public.course_sessions.trainer_name IS
  'Free text for an external trainer who has no profile. Use trainer_profile_id for internal staff.';

CREATE TRIGGER trg_course_sessions_touch
  BEFORE UPDATE ON public.course_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

-- ---------------------------------------------------------------------
-- resource_reservations: a third owner kind
-- ---------------------------------------------------------------------
-- This is a FK to a DIFFERENT table than the existing event_id and
-- session_id links, so it does not create a second FK to one table and
-- therefore does not disturb any PostgREST embed on this table.
--
-- The old CHECK forbade event_id and session_id being set together. The
-- replacement generalises that to "at most one owner" across all three,
-- using num_nonnulls rather than three pairwise NOT-AND clauses.
-- ---------------------------------------------------------------------
ALTER TABLE public.resource_reservations
  ADD COLUMN IF NOT EXISTS course_session_id uuid
  REFERENCES public.course_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.resource_reservations
  DROP CONSTRAINT IF EXISTS resource_reservations_event_or_session_check;

ALTER TABLE public.resource_reservations
  ADD CONSTRAINT resource_reservations_single_owner_check
  CHECK (num_nonnulls(event_id, session_id, course_session_id) <= 1);

CREATE INDEX IF NOT EXISTS idx_resource_reservations_course_session
  ON public.resource_reservations (course_session_id)
  WHERE course_session_id IS NOT NULL;

COMMENT ON COLUMN public.resource_reservations.course_session_id IS
  'Set when this reservation was raised to hold a venue for one course session. Mutually exclusive with event_id and session_id.';

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.course_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_sessions FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_sessions TO authenticated;

CREATE POLICY course_sessions_select ON public.course_sessions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_sessions_manage ON public.course_sessions
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.sessions.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.sessions.manage'))
        AND public.role_has_institution_access(institution_id))
  );
```

- [ ] **Step 3: Apply the migration**

Apply with `mcp__supabase__apply_migration`, name `20260813100100_course_sessions_and_reservations`. Save the identical SQL to the migrations folder.

- [ ] **Step 4: Verify the reservation constraint was replaced, not merely dropped**

```sql
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.resource_reservations'::regclass
   AND contype = 'c'
   AND (conname LIKE '%owner%' OR conname LIKE '%event_or_session%');
-- The parentheses are load-bearing. AND binds tighter than OR, so without
-- them this reads as
--   (conrelid = … AND contype = 'c' AND conname LIKE '%owner%')
--   OR (conname LIKE '%event_or_session%')
-- and the second branch is unscoped by conrelid — it would match a
-- similarly-named constraint on ANY table and report a false result.
```

Expected: exactly one row named `resource_reservations_single_owner_check`, defined as
`CHECK ((num_nonnulls(event_id, session_id, course_session_id) <= 1))`.
The old `resource_reservations_event_or_session_check` must be **absent**. If both are present, or neither, stop.

- [ ] **Step 5: Prove existing reservations still satisfy the new constraint**

A widened CHECK is only safe if live rows already pass it. Postgres validates on `ADD CONSTRAINT`, so a failure would have aborted Step 3 — this step confirms the data is intact rather than that the DDL ran.

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE num_nonnulls(event_id, session_id, course_session_id) > 1) AS violating
  FROM public.resource_reservations;
```

Expected: `violating = 0`.

- [ ] **Step 6: Verify course_sessions RLS**

```sql
SELECT c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'course_sessions';
```

Expected: `rls_on = true`, `policies = 2`.

- [ ] **Step 7: Mirror and commit**

Append to `supabase/setup/01_tables.sql`, `03_policies.sql`, `04_triggers.sql`.

```bash
git add supabase/migrations/20260813100100_course_sessions_and_reservations.sql supabase/setup/
git commit -m "feat(courses): course_sessions and the resource_reservations venue seam

Adds a third owner column to resource_reservations and generalises the
two-way mutual-exclusion CHECK to num_nonnulls(...) <= 1. The FK targets a
different table than the existing event_id/session_id links, so no
PostgREST embed on resource_reservations is affected."
```

---

## Task 4: Registration form builder tables

**Files:**
- Create: `supabase/migrations/20260813100200_course_registration_forms.sql`

**Interfaces:**
- Consumes: `course_events(id)` from Task 2; `courses.view`, `courses.forms.manage` from Task 1.
- Produces: `course_registration_forms(id)`, `course_registration_form_sections(id)`, `course_registration_form_fields(id)`. Task 5's `course_applications.form_id` FKs to the first.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260813100200_course_registration_forms.sql`:

```sql
-- =====================================================================
-- Course Events — registration form builder
-- =====================================================================
-- Modelled on event_registration_forms AFTER its 2026-07-31 fix. In the
-- original events schema, fields hung off a form only via section_id
-- while three separate call sites filtered them by event_id; the moment
-- a second form existed it silently rendered every other form's fields.
-- Here form_id is on the field from the first migration and field_key is
-- unique per FORM, not per course.
--
-- There is deliberately NO fee column on a form. A course's price lives
-- on the PACKAGE the applicant chooses. Two fee sources feeding one
-- payment was rejected in the events module as a genuine hazard.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.course_registration_forms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id uuid NOT NULL REFERENCES public.course_events(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name            text NOT NULL,
  slug            text NOT NULL,
  description     text,
  display_order   int NOT NULL DEFAULT 0,
  is_enabled      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_registration_forms_slug_uniq UNIQUE (course_event_id, slug),
  CONSTRAINT course_registration_forms_slug_format_chk
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

COMMENT ON COLUMN public.course_registration_forms.is_enabled IS
  'Defaults to FALSE. A new or cloned form must never silently open a second live intake on a running course.';

CREATE TABLE IF NOT EXISTS public.course_registration_form_sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       uuid NOT NULL REFERENCES public.course_registration_forms(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.course_registration_form_fields (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       uuid NOT NULL REFERENCES public.course_registration_forms(id) ON DELETE CASCADE,
  section_id    uuid REFERENCES public.course_registration_form_sections(id) ON DELETE CASCADE,
  field_key     text NOT NULL,
  label         text NOT NULL,
  field_type    text NOT NULL
                  CHECK (field_type IN ('text','textarea','number','email','phone',
                                        'date','select','multiselect','checkbox',
                                        'radio','file')),
  is_required   boolean NOT NULL DEFAULT false,
  options       jsonb NOT NULL DEFAULT '[]'::jsonb,
  placeholder   text,
  help_text     text,
  validation    jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_registration_form_fields_key_uniq UNIQUE (form_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_course_reg_forms_event
  ON public.course_registration_forms (course_event_id, display_order);
CREATE INDEX IF NOT EXISTS idx_course_reg_sections_form
  ON public.course_registration_form_sections (form_id, display_order);
CREATE INDEX IF NOT EXISTS idx_course_reg_fields_form
  ON public.course_registration_form_fields (form_id, display_order);

CREATE TRIGGER trg_course_reg_forms_touch
  BEFORE UPDATE ON public.course_registration_forms
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_reg_sections_touch
  BEFORE UPDATE ON public.course_registration_form_sections
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_reg_fields_touch
  BEFORE UPDATE ON public.course_registration_form_fields
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
-- The PUBLIC application page does NOT read these tables through anon
-- RLS. It goes through a service-role API route (Phase 3), exactly as
-- the events public-register route does. anon holds nothing here.
-- ---------------------------------------------------------------------
ALTER TABLE public.course_registration_forms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_registration_form_sections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_registration_form_fields    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.course_registration_forms         FROM anon, PUBLIC;
REVOKE ALL ON public.course_registration_form_sections FROM anon, PUBLIC;
REVOKE ALL ON public.course_registration_form_fields   FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_registration_forms         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_registration_form_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_registration_form_fields   TO authenticated;

CREATE POLICY course_registration_forms_select ON public.course_registration_forms
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_registration_forms_manage ON public.course_registration_forms
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND public.role_has_institution_access(institution_id))
  );

-- Sections and fields inherit tenancy through their form.
CREATE POLICY course_reg_sections_select ON public.course_registration_form_sections
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_sections.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  );

CREATE POLICY course_reg_sections_manage ON public.course_registration_form_sections
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_sections.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_sections.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  );

CREATE POLICY course_reg_fields_select ON public.course_registration_form_fields
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_fields.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  );

CREATE POLICY course_reg_fields_manage ON public.course_registration_form_fields
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_fields.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_fields.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  );
```

- [ ] **Step 2: Apply the migration**

Apply with `mcp__supabase__apply_migration`, name `20260813100200_course_registration_forms`. Save identical SQL to the migrations folder.

- [ ] **Step 3: Verify tables, RLS and the field uniqueness rule**

```sql
SELECT c.relname, c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'                    -- tables ONLY; without this the
   AND c.relname LIKE 'course_registration_form%'  -- constraint-backing
 ORDER BY 1;                              -- indexes match the name too
```

Expected: three rows, each `rls_on = true`, each `policies = 2`.

`relkind = 'r'` is load-bearing: `pg_class` holds indexes as well as tables, and
`course_registration_form_fields_key_uniq` matches this `LIKE` pattern. Without the
filter the result set is padded with index rows carrying `rls_on = false`, which reads
as a failure that isn't one.

- [ ] **Step 4: Verify `field_key` is unique per FORM, not per course**

This is the specific bug the events module had to retrofit; assert it directly.

```sql
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.course_registration_form_fields'::regclass
   AND contype = 'u';
```

Expected: exactly one row — `course_registration_form_fields_key_uniq`, defined as
`UNIQUE (form_id, field_key)`.
If it reads `UNIQUE (course_event_id, field_key)` or references `section_id`, the migration was mistyped: two monthly forms would then be unable to both ask "phone".

- [ ] **Step 5: Confirm `anon` holds nothing**

```sql
-- Scope by an EXPLICIT list, never `LIKE 'course%'`. Three PRE-EXISTING
-- academic-catalogue tables — courses, course_mappings,
-- course_competency_mapping — match that pattern and DO grant ALL to anon
-- (Supabase's ALTER DEFAULT PRIVILEGES default). They are out of scope here,
-- but a LIKE-scoped query reports them and turns a passing check into a
-- false failure. See the note below.
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN (
     'course_events','course_packages','course_package_installments',
     'course_sessions','course_registration_forms',
     'course_registration_form_sections','course_registration_form_fields',
     'course_applications','course_enrollments','course_bills',
     'course_bill_payments')
   AND grantee IN ('anon','PUBLIC');
```

Expected: **zero rows**. Any row here means the public application page could read or write directly, bypassing the service-role route.

- [ ] **Step 6: Mirror and commit**

```bash
git add supabase/migrations/20260813100200_course_registration_forms.sql supabase/setup/
git commit -m "feat(courses): registration form builder tables with RLS

Fields carry form_id from the first migration and field_key is unique per
form, not per course — the events module had to retrofit exactly this
after a second form silently rendered every other form's fields."
```

---

## Task 5: Applications and enrollments

**Files:**
- Create: `supabase/migrations/20260813100300_course_applications_enrollments.sql`

**Interfaces:**
- Consumes: `course_events(id)`, `course_packages(id)` (Task 2); `course_registration_forms(id)` (Task 4); existing `event_external_participants(id)`, `learners_profiles(id)`, `profiles(id)`.
- Produces: `course_applications(id)`, `course_enrollments(id)`. Task 6's `course_bills.enrollment_id` FKs to `course_enrollments(id)`. Also produces the **additive participant SELECT policies** for `course_events`, `course_packages`, `course_package_installments` and `course_sessions`, which could not be written earlier because they reference `course_enrollments`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260813100300_course_applications_enrollments.sql`:

```sql
-- =====================================================================
-- Course Events — applications (screening gate) and enrollments
-- =====================================================================
-- event_external_participants is REUSED rather than duplicated. It
-- already upserts by phone and already carries linked_profile_id, which
-- is the bridge to a JKKN identity. A course-specific person table would
-- mean the same human who ran the marathon and took the course exists as
-- two unlinked rows. This is a deliberate, named dependency from courses
-- onto an event_* table.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.course_applications (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id         uuid NOT NULL REFERENCES public.course_events(id) ON DELETE CASCADE,
  institution_id          uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  form_id                 uuid REFERENCES public.course_registration_forms(id) ON DELETE SET NULL,
  package_id              uuid REFERENCES public.course_packages(id) ON DELETE SET NULL,
  applicant_type          text NOT NULL CHECK (applicant_type IN ('learner','staff','external')),
  profile_id              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  learner_id              uuid REFERENCES public.learners_profiles(id) ON DELETE SET NULL,
  external_participant_id uuid REFERENCES public.event_external_participants(id) ON DELETE SET NULL,
  applicant_name          text NOT NULL,
  applicant_email         text,
  applicant_phone         text NOT NULL,
  custom_fields           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','shortlisted','approved','rejected','withdrawn')),
  decided_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at              timestamptz,
  decision_note           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- The identity anchor must match the declared type. Written per type
  -- rather than as a blanket num_nonnulls(...) >= 1, because a STAFF
  -- applicant has neither a learner record nor an external-participant
  -- record — only a profile.
  CONSTRAINT course_applications_identity_chk CHECK (
       (applicant_type = 'learner'  AND learner_id              IS NOT NULL)
    OR (applicant_type = 'staff'    AND profile_id              IS NOT NULL)
    OR (applicant_type = 'external' AND external_participant_id IS NOT NULL)
  ),
  CONSTRAINT course_applications_decision_chk
    CHECK (status NOT IN ('approved','rejected') OR decided_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_course_applications_event_status
  ON public.course_applications (course_event_id, status);
CREATE INDEX IF NOT EXISTS idx_course_applications_phone
  ON public.course_applications (applicant_phone);

CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id         uuid NOT NULL REFERENCES public.course_events(id) ON DELETE RESTRICT,
  institution_id          uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  application_id          uuid UNIQUE REFERENCES public.course_applications(id) ON DELETE SET NULL,
  package_id              uuid NOT NULL REFERENCES public.course_packages(id) ON DELETE RESTRICT,
  participant_type        text NOT NULL CHECK (participant_type IN ('learner','staff','external')),
  -- NOT NULL: identity provisioning runs BEFORE the enrollment insert, in
  -- the same transaction. With a nullable column Postgres treats every
  -- NULL as distinct, so the UNIQUE below would enforce nothing.
  profile_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  learner_id              uuid REFERENCES public.learners_profiles(id) ON DELETE SET NULL,
  external_participant_id uuid REFERENCES public.event_external_participants(id) ON DELETE SET NULL,
  enrollment_number       text UNIQUE,
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','confirmed','payment_overdue',
                                              'withdrawn','completed','cancelled')),
  total_payable           numeric(12,2) NOT NULL CHECK (total_payable >= 0),
  total_paid              numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
  balance                 numeric(12,2) NOT NULL,
  refundable_amount       numeric(12,2) NOT NULL DEFAULT 0 CHECK (refundable_amount >= 0),
  refund_status           text CHECK (refund_status IS NULL
                                      OR refund_status IN ('pending_offline','recorded')),
  withdrawn_at            timestamptz,
  withdrawal_reason       text,
  enrolled_at             timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_enrollments_identity_chk CHECK (
       (participant_type = 'learner'  AND learner_id IS NOT NULL)
    OR (participant_type = 'staff'    AND learner_id IS NULL
                                      AND external_participant_id IS NULL)
    OR (participant_type = 'external' AND external_participant_id IS NOT NULL)
  ),
  CONSTRAINT course_enrollments_withdrawal_chk
    CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL),
  CONSTRAINT course_enrollments_person_uniq UNIQUE (course_event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_event_status
  ON public.course_enrollments (course_event_id, status);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_profile
  ON public.course_enrollments (profile_id);

COMMENT ON COLUMN public.course_enrollments.total_payable IS
  'A SNAPSHOT of course_packages.total_amount taken at enrollment. Repricing a package later must never silently re-price people already enrolled.';

CREATE TRIGGER trg_course_applications_touch
  BEFORE UPDATE ON public.course_applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_enrollments_touch
  BEFORE UPDATE ON public.course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.course_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.course_applications FROM anon, PUBLIC;
REVOKE ALL ON public.course_enrollments  FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_enrollments  TO authenticated;

CREATE POLICY course_applications_select ON public.course_applications
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.applications.view'))
        AND public.role_has_institution_access(institution_id))
    OR profile_id = (SELECT auth.uid())
  );

CREATE POLICY course_applications_decide ON public.course_applications
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.applications.decide'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.applications.decide'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_enrollments_select ON public.course_enrollments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.enrollments.manage'))
        AND public.role_has_institution_access(institution_id))
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
    OR profile_id = (SELECT auth.uid())
  );

CREATE POLICY course_enrollments_manage ON public.course_enrollments
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.enrollments.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.enrollments.manage'))
        AND public.role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- Additive participant visibility for the tables created earlier
-- ---------------------------------------------------------------------
-- These are SEPARATE policies, not widened admin policies. Multiple
-- PERMISSIVE policies on one command are OR'd, so adding a policy grants
-- exactly this narrow extra read and cannot loosen the admin rule.
--
-- A participant sees the course, packages, installment plan and session
-- schedule for a course they are enrolled on — and nothing else.
-- ---------------------------------------------------------------------
CREATE POLICY course_events_participant_select ON public.course_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_enrollments e
     WHERE e.course_event_id = course_events.id
       AND e.profile_id = (SELECT auth.uid())
  ));

CREATE POLICY course_packages_participant_select ON public.course_packages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_enrollments e
     WHERE e.package_id = course_packages.id
       AND e.profile_id = (SELECT auth.uid())
  ));

CREATE POLICY course_package_installments_participant_select
  ON public.course_package_installments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_enrollments e
     WHERE e.package_id = course_package_installments.package_id
       AND e.profile_id = (SELECT auth.uid())
  ));

CREATE POLICY course_sessions_participant_select ON public.course_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_enrollments e
     WHERE e.course_event_id = course_sessions.course_event_id
       AND e.profile_id = (SELECT auth.uid())
  ));
```

- [ ] **Step 2: Apply the migration**

Apply with `mcp__supabase__apply_migration`, name `20260813100300_course_applications_enrollments`. Save identical SQL to the migrations folder.

- [ ] **Step 3: Verify the staff identity CHECK does not reject a staff enrollment**

The blanket `num_nonnulls(...) >= 1` form of this constraint would reject every staff row. Prove the per-type form accepts one:

```sql
DO $$
DECLARE
  v_inst uuid; v_course uuid; v_pkg uuid; v_prof uuid;
BEGIN
  SELECT id INTO v_inst   FROM public.institutions LIMIT 1;
  SELECT id INTO v_prof   FROM public.profiles WHERE institution_id IS NOT NULL LIMIT 1;

  INSERT INTO public.course_events (institution_id, title, slug)
  VALUES (v_inst, 'STAFF CHECK PROBE', 'staff-check-probe-delete-me')
  RETURNING id INTO v_course;

  INSERT INTO public.course_packages (course_event_id, institution_id, name, total_amount)
  VALUES (v_course, v_inst, 'Probe', 1000.00) RETURNING id INTO v_pkg;

  -- A staff participant: profile only, no learner_id, no external id.
  INSERT INTO public.course_enrollments
    (course_event_id, institution_id, package_id, participant_type,
     profile_id, total_payable, balance)
  VALUES (v_course, v_inst, v_pkg, 'staff', v_prof, 1000.00, 1000.00);

  RAISE NOTICE 'PROBE OK — staff enrollment accepted';
  RAISE EXCEPTION 'rollback probe';
END $$;
```

Expected: `NOTICE: PROBE OK — staff enrollment accepted`, then the block aborts with `rollback probe` so nothing persists. If it instead fails on `course_enrollments_identity_chk`, the constraint was mistyped.

- [ ] **Step 4: Confirm the probe left nothing behind**

```sql
SELECT count(*) AS leftovers FROM public.course_events WHERE slug = 'staff-check-probe-delete-me';
```

Expected: `0`.

- [ ] **Step 5: Verify policy counts, including the additive ones**

```sql
SELECT c.relname, (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('course_events','course_packages','course_package_installments',
                     'course_sessions','course_applications','course_enrollments')
 ORDER BY 1;
```

Expected:

| relname | policies |
|---|---|
| course_applications | 2 |
| course_enrollments | 2 |
| course_events | 5 |
| course_package_installments | 3 |
| course_packages | 3 |
| course_sessions | 3 |

The counts for the four earlier tables must each have gone up by exactly one — that is the additive participant policy.

- [ ] **Step 6: Mirror and commit**

```bash
git add supabase/migrations/20260813100300_course_applications_enrollments.sql supabase/setup/
git commit -m "feat(courses): applications screening gate and enrollments with RLS

Identity CHECKs are written per participant_type rather than as a blanket
num_nonnulls, because a staff participant has neither a learner record nor
an external-participant record. profile_id is NOT NULL so the one-enrollment
-per-person UNIQUE actually enforces something."
```

---

## Task 6: Billing tables and the balance-derivation triggers

**Files:**
- Create: `supabase/migrations/20260813100400_course_billing.sql`

**Interfaces:**
- Consumes: `course_enrollments(id)` from Task 5; `razorpay_accounts(id)` (existing); `courses.billing.view`, `courses.billing.manage` from Task 1.
- Produces: `course_bills(id)`, `course_bill_payments(id)`, and `public.fn_course_recompute_balances()`. Phase 5's payment service relies on the trigger doing all balance arithmetic — it writes only `course_bill_payments` rows.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260813100400_course_billing.sql`:

```sql
-- =====================================================================
-- Course Events — bills, payments, and derived balances
-- =====================================================================
-- billing_student_bills is NOT reused: its student_id is a NOT NULL FK
-- to learners_profiles and an external participant is not a learner.
-- These tables are keyed to an ENROLLMENT, which may belong to a learner,
-- a staff member or an external person. billing_student_bills is
-- untouched by this module.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.course_bills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   uuid NOT NULL REFERENCES public.course_enrollments(id) ON DELETE RESTRICT,
  course_event_id uuid NOT NULL REFERENCES public.course_events(id) ON DELETE RESTRICT,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  bill_number     text NOT NULL UNIQUE,
  installment_no  smallint NOT NULL CHECK (installment_no >= 1),
  label           text,
  total_amount    numeric(12,2) NOT NULL CHECK (total_amount > 0),
  paid_amount     numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance_amount  numeric(12,2) NOT NULL,
  due_date        date NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','partially_paid','paid','overdue','voided')),
  voided_at       timestamptz,
  void_reason     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_bills_installment_uniq UNIQUE (enrollment_id, installment_no),
  CONSTRAINT course_bills_void_chk
    CHECK (status <> 'voided' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_course_bills_enrollment
  ON public.course_bills (enrollment_id, installment_no);
CREATE INDEX IF NOT EXISTS idx_course_bills_overdue
  ON public.course_bills (due_date)
  WHERE status IN ('pending','partially_paid');

CREATE TABLE IF NOT EXISTS public.course_bill_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id             uuid NOT NULL REFERENCES public.course_bills(id) ON DELETE RESTRICT,
  enrollment_id       uuid NOT NULL REFERENCES public.course_enrollments(id) ON DELETE RESTRICT,
  institution_id      uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  receipt_number      text UNIQUE,
  amount_paid         numeric(12,2) NOT NULL CHECK (amount_paid > 0),
  payment_mode        text NOT NULL
                        CHECK (payment_mode IN ('razorpay','cash','neft','cheque','dd')),
  payment_date        date NOT NULL DEFAULT CURRENT_DATE,
  razorpay_order_id   text,
  razorpay_payment_id text,
  razorpay_signature  text,
  razorpay_account_id uuid REFERENCES public.razorpay_accounts(id) ON DELETE SET NULL,
  transaction_ref     text UNIQUE,
  gateway_response    jsonb,
  status              text NOT NULL DEFAULT 'initiated'
                        CHECK (status IN ('initiated','success','failed','refunded')),
  captured_at         timestamptz,
  recorded_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- An offline payment is somebody's assertion; record whose.
  CONSTRAINT course_bill_payments_offline_chk
    CHECK (payment_mode = 'razorpay' OR recorded_by IS NOT NULL)
);

-- Idempotency. Razorpay settles through TWO paths — the browser callback
-- and the server webhook — and both fire for the same payment. This index
-- makes a duplicate settlement a constraint violation the caller can
-- swallow, rather than a second credit.
CREATE UNIQUE INDEX IF NOT EXISTS course_bill_payments_rzp_payment_uniq
  ON public.course_bill_payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_course_bill_payments_bill
  ON public.course_bill_payments (bill_id) WHERE status = 'success';

CREATE TRIGGER trg_course_bills_touch
  BEFORE UPDATE ON public.course_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_bill_payments_touch
  BEFORE UPDATE ON public.course_bill_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

-- ---------------------------------------------------------------------
-- Derived balances
-- ---------------------------------------------------------------------
-- Application code NEVER writes paid_amount, balance_amount, total_paid,
-- balance or a non-terminal enrollment status. All of it is derived here.
--
-- Two rules that are easy to get wrong and expensive to get wrong:
--   * VOIDED bills are excluded from every total. A withdrawal voids the
--     unpaid future installments; if they still counted, the enrollment
--     would hold a permanent non-zero balance and could never leave
--     payment_overdue.
--   * withdrawn / cancelled / completed are TERMINAL. The money columns
--     still refresh, but the status is not recomputed over the top.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_course_recompute_balances()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_bill_id       uuid;
  v_enrollment_id uuid;
  v_paid          numeric(12,2);
  v_total         numeric(12,2);
  v_due           date;
  v_status        text;
  v_e_payable     numeric(12,2);
  v_e_paid        numeric(12,2);
  v_overdue       boolean;
  v_e_status      text;
BEGIN
  v_bill_id := COALESCE(NEW.bill_id, OLD.bill_id);

  SELECT COALESCE(sum(amount_paid), 0)
    INTO v_paid
    FROM public.course_bill_payments
   WHERE bill_id = v_bill_id
     AND status = 'success';

  SELECT total_amount, due_date, status, enrollment_id
    INTO v_total, v_due, v_status, v_enrollment_id
    FROM public.course_bills
   WHERE id = v_bill_id;

  IF NOT FOUND THEN
    RETURN NULL;   -- bill removed in this transaction
  END IF;

  UPDATE public.course_bills
     SET paid_amount    = v_paid,
         balance_amount = v_total - v_paid,
         status = CASE
                    WHEN v_status = 'voided'   THEN 'voided'
                    WHEN v_total - v_paid <= 0 THEN 'paid'
                    WHEN v_due < CURRENT_DATE  THEN 'overdue'
                    WHEN v_paid > 0            THEN 'partially_paid'
                    ELSE 'pending'
                  END,
         updated_at = now()
   WHERE id = v_bill_id;

  -- Roll up to the enrollment, excluding voided bills entirely.
  SELECT COALESCE(sum(total_amount), 0),
         COALESCE(sum(paid_amount), 0),
         bool_or(balance_amount > 0 AND due_date < CURRENT_DATE)
    INTO v_e_payable, v_e_paid, v_overdue
    FROM public.course_bills
   WHERE enrollment_id = v_enrollment_id
     AND status <> 'voided';

  SELECT status INTO v_e_status
    FROM public.course_enrollments
   WHERE id = v_enrollment_id;

  UPDATE public.course_enrollments
     SET total_paid = v_e_paid,
         balance    = v_e_payable - v_e_paid,
         status = CASE
                    -- terminal states are never recomputed over
                    WHEN v_e_status IN ('withdrawn','cancelled','completed')
                      THEN v_e_status
                    WHEN v_e_payable - v_e_paid <= 0 THEN 'confirmed'
                    WHEN COALESCE(v_overdue, false) THEN 'payment_overdue'
                    ELSE 'active'
                  END,
         updated_at = now()
   WHERE id = v_enrollment_id;

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.fn_course_recompute_balances() IS
  'Sole writer of course_bills.paid_amount/balance_amount/status and course_enrollments.total_paid/balance/status. Voided bills are excluded from rollups; withdrawn/cancelled/completed are terminal.';

CREATE TRIGGER trg_course_bill_payments_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.course_bill_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_course_recompute_balances();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.course_bills         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_bill_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.course_bills         FROM anon, PUBLIC;
REVOKE ALL ON public.course_bill_payments FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_bills         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_bill_payments TO authenticated;

CREATE POLICY course_bills_select ON public.course_bills
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.billing.view'))
        AND public.role_has_institution_access(institution_id))
    OR EXISTS (SELECT 1 FROM public.course_enrollments e
                WHERE e.id = course_bills.enrollment_id
                  AND e.profile_id = (SELECT auth.uid()))
  );

CREATE POLICY course_bills_manage ON public.course_bills
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.billing.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.billing.manage'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_bill_payments_select ON public.course_bill_payments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.billing.view'))
        AND public.role_has_institution_access(institution_id))
    OR EXISTS (SELECT 1 FROM public.course_enrollments e
                WHERE e.id = course_bill_payments.enrollment_id
                  AND e.profile_id = (SELECT auth.uid()))
  );

CREATE POLICY course_bill_payments_manage ON public.course_bill_payments
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.billing.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.billing.manage'))
        AND public.role_has_institution_access(institution_id))
  );
```

- [ ] **Step 2: Apply the migration**

Apply with `mcp__supabase__apply_migration`, name `20260813100400_course_billing`. Save identical SQL to the migrations folder.

- [ ] **Step 3: Prove the derivation trigger computes a partial payment correctly**

> **These probes need no `SET CONSTRAINTS`, unlike Task 2's.** `trg_course_bill_payments_recompute` is an ordinary `AFTER … FOR EACH ROW` trigger, not a `CONSTRAINT TRIGGER`, so it fires as the INSERT statement completes and the following `SELECT`s read its results directly. Do not add `SET CONSTRAINTS ALL IMMEDIATE` here — there is no deferred constraint to force. The same applies to the identity-CHECK probes in Tasks 5 and 7: an ordinary table `CHECK` is evaluated at INSERT time, never deferred.

This is the most important assertion in Phase 1. Run:

```sql
DO $$
DECLARE
  v_inst uuid; v_course uuid; v_pkg uuid; v_prof uuid; v_enr uuid; v_bill uuid;
  v_bill_status text; v_bill_bal numeric; v_enr_status text; v_enr_bal numeric;
BEGIN
  SELECT id INTO v_inst FROM public.institutions LIMIT 1;
  SELECT id INTO v_prof FROM public.profiles WHERE institution_id IS NOT NULL LIMIT 1;

  INSERT INTO public.course_events (institution_id, title, slug)
  VALUES (v_inst, 'BILLING PROBE', 'billing-probe-delete-me') RETURNING id INTO v_course;

  INSERT INTO public.course_packages (course_event_id, institution_id, name, total_amount)
  VALUES (v_course, v_inst, 'Probe', 250000.00) RETURNING id INTO v_pkg;

  INSERT INTO public.course_enrollments
    (course_event_id, institution_id, package_id, participant_type,
     profile_id, total_payable, balance)
  VALUES (v_course, v_inst, v_pkg, 'staff', v_prof, 250000.00, 250000.00)
  RETURNING id INTO v_enr;

  INSERT INTO public.course_bills
    (enrollment_id, course_event_id, institution_id, bill_number,
     installment_no, total_amount, balance_amount, due_date)
  VALUES (v_enr, v_course, v_inst, 'PROBE-0001', 1, 100000.00, 100000.00, '2027-01-01')
  RETURNING id INTO v_bill;

  -- Partial: 40,000 of 100,000.
  INSERT INTO public.course_bill_payments
    (bill_id, enrollment_id, institution_id, amount_paid, payment_mode, status, recorded_by)
  VALUES (v_bill, v_enr, v_inst, 40000.00, 'cash', 'success', v_prof);

  SELECT status, balance_amount INTO v_bill_status, v_bill_bal
    FROM public.course_bills WHERE id = v_bill;
  SELECT status, balance INTO v_enr_status, v_enr_bal
    FROM public.course_enrollments WHERE id = v_enr;

  RAISE NOTICE 'bill: status=% balance=% | enrollment: status=% balance=%',
    v_bill_status, v_bill_bal, v_enr_status, v_enr_bal;

  RAISE EXCEPTION 'rollback probe';
END $$;
```

Expected NOTICE, exactly:
`bill: status=partially_paid balance=60000.00 | enrollment: status=active balance=60000.00`

Read it carefully. `balance=60000.00` on the enrollment (not `210000.00`) is correct: the rollup sums **bills that exist**, and only one 100,000 bill has been generated. If the bill status reads `pending`, the trigger did not fire. If the enrollment balance is unchanged at `250000.00`, the rollup half of the trigger is broken.

- [ ] **Step 4: Prove a voided bill drops out of the rollup**

```sql
DO $$
DECLARE
  v_inst uuid; v_course uuid; v_pkg uuid; v_prof uuid; v_enr uuid;
  v_b1 uuid; v_b2 uuid; v_enr_status text; v_enr_bal numeric;
BEGIN
  SELECT id INTO v_inst FROM public.institutions LIMIT 1;
  SELECT id INTO v_prof FROM public.profiles WHERE institution_id IS NOT NULL LIMIT 1;

  INSERT INTO public.course_events (institution_id, title, slug)
  VALUES (v_inst, 'VOID PROBE', 'void-probe-delete-me') RETURNING id INTO v_course;
  INSERT INTO public.course_packages (course_event_id, institution_id, name, total_amount)
  VALUES (v_course, v_inst, 'Probe', 100000.00) RETURNING id INTO v_pkg;
  INSERT INTO public.course_enrollments
    (course_event_id, institution_id, package_id, participant_type, profile_id,
     total_payable, balance)
  VALUES (v_course, v_inst, v_pkg, 'staff', v_prof, 100000.00, 100000.00)
  RETURNING id INTO v_enr;

  INSERT INTO public.course_bills
    (enrollment_id, course_event_id, institution_id, bill_number, installment_no,
     total_amount, balance_amount, due_date)
  VALUES (v_enr, v_course, v_inst, 'VOIDPROBE-1', 1, 50000.00, 50000.00, '2027-01-01')
  RETURNING id INTO v_b1;

  INSERT INTO public.course_bills
    (enrollment_id, course_event_id, institution_id, bill_number, installment_no,
     total_amount, balance_amount, due_date, status, voided_at, void_reason)
  VALUES (v_enr, v_course, v_inst, 'VOIDPROBE-2', 2, 50000.00, 50000.00, '2027-04-01',
          'voided', now(), 'withdrawal probe')
  RETURNING id INTO v_b2;

  -- Pay bill 1 in full. Bill 2 is voided, so the enrollment should settle.
  INSERT INTO public.course_bill_payments
    (bill_id, enrollment_id, institution_id, amount_paid, payment_mode, status, recorded_by)
  VALUES (v_b1, v_enr, v_inst, 50000.00, 'neft', 'success', v_prof);

  SELECT status, balance INTO v_enr_status, v_enr_bal
    FROM public.course_enrollments WHERE id = v_enr;
  RAISE NOTICE 'enrollment: status=% balance=%', v_enr_status, v_enr_bal;

  RAISE EXCEPTION 'rollback probe';
END $$;
```

Expected NOTICE, exactly: `enrollment: status=confirmed balance=0.00`

If it reads `balance=50000.00`, the rollup is counting voided bills and a withdrawn participant would be permanently stuck.

- [ ] **Step 5: Confirm both probes left nothing behind**

```sql
SELECT count(*) AS leftovers FROM public.course_events
 WHERE slug IN ('billing-probe-delete-me','void-probe-delete-me');
```

Expected: `0`.

- [ ] **Step 6: Verify the Razorpay idempotency index exists**

```sql
SELECT indexdef FROM pg_indexes
 WHERE schemaname = 'public' AND indexname = 'course_bill_payments_rzp_payment_uniq';
```

Expected: a `CREATE UNIQUE INDEX … ON public.course_bill_payments USING btree (razorpay_payment_id) WHERE (razorpay_payment_id IS NOT NULL)`. Without the `WHERE` clause, only one row could ever have a NULL payment id and every offline payment after the first would fail.

- [ ] **Step 7: Mirror and commit**

```bash
git add supabase/migrations/20260813100400_course_billing.sql supabase/setup/
git commit -m "feat(courses): course bills, payments and trigger-derived balances

Application code never writes a balance. Razorpay settles through both a
browser callback and a server webhook; deriving in a trigger plus a partial
unique index on razorpay_payment_id makes a duplicate settlement a no-op
rather than a second credit. Voided bills are excluded from rollups."
```

---

## Task 7: Extend the JKKN identity register

**Files:**
- Create: `supabase/migrations/20260813100500_jkkn_identity_external_participant.sql`

**Interfaces:**
- Consumes: existing `jkkn_identities`, `fn_issue_jkkn_id(text, uuid, uuid)`, `fn_jkkn_id_check_digit(text)`.
- Produces: `fn_issue_jkkn_id(text, uuid, uuid, uuid)` — the **4-argument** signature Phase 4's approval service calls as `fn_issue_jkkn_id('external_participant', NULL, NULL, <profile_id>)`, returning `jsonb {ok, identity_id, jkkn_id, person_kind, attempts}`.

**Read the spec section §8.2 before starting.** This modifies a deliberately dormant system that someone designed carefully.

- [ ] **Step 1: Confirm the register is still empty and dormant**

```sql
SELECT (SELECT count(*) FROM public.jkkn_identities)        AS identities,
       (SELECT count(*) FROM public.jkkn_identity_aliases)  AS aliases;
```

Expected: `0` and `0`. If either is non-zero, someone has begun issuing IDs — **stop** and re-confirm the plan with the user, because the constraint changes below would then be operating on live identity data.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260813100500_jkkn_identity_external_participant.sql`:

```sql
-- =====================================================================
-- JKKN identity — a third person kind: external_participant
-- =====================================================================
-- Course Events issues permanent IDs to external participants who are
-- neither learners nor staff. Rather than mint a second, differently
-- formatted identifier, this extends the existing register so there is
-- ONE pool and one format. An external participant who later enrols as a
-- learner keeps the same row and the same number — which is the whole
-- point of that register.
-- =====================================================================

-- 1. Third person kind ------------------------------------------------
ALTER TABLE public.jkkn_identities
  DROP CONSTRAINT jkkn_identities_person_kind_chk;

ALTER TABLE public.jkkn_identities
  ADD CONSTRAINT jkkn_identities_person_kind_chk
  CHECK (person_kind IN ('learner','team_member','both','external_participant'));

-- 2. A link for a person who is neither a learner nor staff -----------
ALTER TABLE public.jkkn_identities
  ADD COLUMN IF NOT EXISTS profile_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_jkkn_identities_profile
  ON public.jkkn_identities (profile_id)
  WHERE profile_id IS NOT NULL;

COMMENT ON COLUMN public.jkkn_identities.profile_id IS
  'Link for an external participant, who has a profile but is neither a learner nor staff. Deliberately left unconstrained for the other kinds so that an external participant who later enrols keeps this row, this number, and both links.';

-- 3. Widen the link-shape CHECK ---------------------------------------
-- The first three clauses are preserved VERBATIM from the original
-- migration. Only the fourth is new.
ALTER TABLE public.jkkn_identities
  DROP CONSTRAINT jkkn_identities_link_shape_chk;

ALTER TABLE public.jkkn_identities
  ADD CONSTRAINT jkkn_identities_link_shape_chk CHECK (
       (person_kind = 'learner'              AND team_member_id     IS NULL)
    OR (person_kind = 'team_member'          AND learner_profile_id IS NULL)
    OR (person_kind = 'both')
    OR (person_kind = 'external_participant' AND learner_profile_id IS NULL
                                             AND team_member_id     IS NULL)
  );

-- 4. Widen the issuer -------------------------------------------------
-- This is a DROP, not a CREATE OR REPLACE. Adding a defaulted 4th
-- parameter alongside the 3-arg version creates an OVERLOAD: a
-- three-argument call would then match both and fail with 42725
-- "function is not unique". The old signature must go.
--
-- DROP FUNCTION also discards the function's ACL, so the REVOKE/GRANT is
-- re-applied below — without it EXECUTE reverts to PUBLIC, including anon.
DROP FUNCTION IF EXISTS public.fn_issue_jkkn_id(text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_issue_jkkn_id(
  p_person_kind        text,
  p_learner_profile_id uuid DEFAULT NULL,
  p_team_member_id     uuid DEFAULT NULL,
  p_profile_id         uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_attempt   int;
  v_six       text;
  v_candidate text;
  v_id        uuid;
  v_existing  text;
BEGIN
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.issue')
  ) THEN
    RAISE EXCEPTION 'Not authorised to issue a JKKN ID'
      USING ERRCODE = '42501';
  END IF;

  IF p_person_kind IS NULL
     OR p_person_kind NOT IN ('learner','team_member','both','external_participant') THEN
    RAISE EXCEPTION 'person_kind must be learner, team_member, both or external_participant (got %)', p_person_kind
      USING ERRCODE = '22023';
  END IF;

  IF p_person_kind IN ('learner', 'both') THEN
    IF p_learner_profile_id IS NULL THEN
      RAISE EXCEPTION 'A % identity needs a learner profile', p_person_kind
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.learners_profiles WHERE id = p_learner_profile_id) THEN
      RAISE EXCEPTION 'No learner profile %', p_learner_profile_id
        USING ERRCODE = '23503';
    END IF;
  ELSIF p_learner_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'A % identity must not carry a learner profile', p_person_kind
      USING ERRCODE = '22023';
  END IF;

  IF p_person_kind IN ('team_member', 'both') THEN
    IF p_team_member_id IS NULL THEN
      RAISE EXCEPTION 'A % identity needs a team member', p_person_kind
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_team_member_id) THEN
      RAISE EXCEPTION 'No team member %', p_team_member_id
        USING ERRCODE = '23503';
    END IF;
  ELSIF p_team_member_id IS NOT NULL THEN
    RAISE EXCEPTION 'A % identity must not carry a team member', p_person_kind
      USING ERRCODE = '22023';
  END IF;

  -- New kind: an external participant is anchored on a profile only.
  IF p_person_kind = 'external_participant' THEN
    IF p_profile_id IS NULL THEN
      RAISE EXCEPTION 'An external_participant identity needs a profile'
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
      RAISE EXCEPTION 'No profile %', p_profile_id
        USING ERRCODE = '23503';
    END IF;
  ELSIF p_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only an external_participant identity is issued against a profile'
      USING ERRCODE = '22023';
  END IF;

  -- One person, one number, for life.
  SELECT jkkn_id INTO v_existing
    FROM public.jkkn_identities
   WHERE (p_learner_profile_id IS NOT NULL AND learner_profile_id = p_learner_profile_id)
      OR (p_team_member_id     IS NOT NULL AND team_member_id     = p_team_member_id)
      OR (p_profile_id         IS NOT NULL AND profile_id         = p_profile_id)
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'This person already holds JKKN ID %. A person is issued one number for life; to record a new capacity, update person_kind on the existing row.', btrim(v_existing)
      USING ERRCODE = '23505';
  END IF;

  FOR v_attempt IN 1..20 LOOP
    v_six       := (100000 + floor(random() * 900000))::int::text;
    v_candidate := v_six || '-' || public.fn_jkkn_id_check_digit(v_six);

    INSERT INTO public.jkkn_identities (
      jkkn_id, person_kind, learner_profile_id, team_member_id, profile_id, issued_by
    )
    VALUES (
      v_candidate, p_person_kind, p_learner_profile_id, p_team_member_id, p_profile_id, auth.uid()
    )
    ON CONFLICT (jkkn_id) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok',          true,
        'identity_id', v_id,
        'jkkn_id',     v_candidate,
        'person_kind', p_person_kind,
        'attempts',    v_attempt
      );
    END IF;
  END LOOP;

  RAISE EXCEPTION 'Could not find an unused JKKN ID in 20 attempts. The 900,000-number pool is close to exhausted or something is wrong.'
    USING ERRCODE = '53400';
END;
$fn$;

COMMENT ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid, uuid) IS
  'Issues ONE permanent JKKN ID to a person who does not already hold one. Kinds: learner, team_member, both, external_participant (Course Events, 2026-08-13). Admin-gated on users.jkkn_id.issue. Numbers are drawn at random from 100000..999999 so an ID card never reveals intake volume or joining order.';

-- DROP FUNCTION discarded the ACL. Restore it.
REVOKE EXECUTE ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid, uuid) TO authenticated;

-- 5. RLS on the new column --------------------------------------------
-- jkkn_identities policies gate on users.jkkn_id.view / .issue and are
-- column-agnostic, so adding profile_id needs no policy change. Asserted
-- in the verification step rather than assumed.
```

- [ ] **Step 3: Apply the migration**

Apply with `mcp__supabase__apply_migration`, name `20260813100500_jkkn_identity_external_participant`. Save identical SQL to the migrations folder.

- [ ] **Step 4: Verify there is exactly ONE issuer signature**

The single most likely failure of this task is leaving both signatures in place.

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'fn_issue_jkkn_id';
```

Expected: **exactly one row**, `args = text, uuid, uuid, uuid`.

If two rows come back, the 3-arg version survived: every existing 3-argument call site will now fail with `42725 function is not unique`. Drop the old one before continuing.

- [ ] **Step 5: Verify the grants were restored**

```sql
SELECT grantee, privilege_type
  FROM information_schema.routine_privileges
 WHERE routine_schema = 'public' AND routine_name = 'fn_issue_jkkn_id'
 ORDER BY grantee;
```

Expected: `authenticated / EXECUTE` present; **no row for `PUBLIC` and no row for `anon`**. If `PUBLIC` appears, the REVOKE after the DROP was missed and any anonymous caller can mint identities.

- [ ] **Step 6: Verify the widened constraints**

```sql
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.jkkn_identities'::regclass
   AND conname IN ('jkkn_identities_person_kind_chk','jkkn_identities_link_shape_chk')
 ORDER BY 1;
```

Expected: `person_kind` includes `'external_participant'`; `link_shape` has four clauses, with the original three unchanged.

- [ ] **Step 7: Prove an external participant can be issued an ID**

```sql
DO $$
DECLARE
  v_prof uuid;
  v_res  jsonb;
BEGIN
  SELECT id INTO v_prof FROM public.profiles ORDER BY created_at DESC LIMIT 1;

  -- SECURITY DEFINER + the permission gate: run as a superuser session
  -- (the MCP connection is), so is_super_admin()/is_admin() may be false
  -- and auth.uid() NULL. Insert directly to prove the CONSTRAINTS accept
  -- the shape; the issuer's own gate is exercised in Phase 4 from a real
  -- session.
  INSERT INTO public.jkkn_identities (jkkn_id, person_kind, profile_id)
  VALUES ('123456-' || public.fn_jkkn_id_check_digit('123456'),
          'external_participant', v_prof);

  RAISE NOTICE 'PROBE OK — external_participant identity accepted';
  RAISE EXCEPTION 'rollback probe';
END $$;
```

Expected: `NOTICE: PROBE OK — external_participant identity accepted`, then rollback via `rollback probe`.

If it fails on `jkkn_identities_link_shape_chk`, the fourth clause is wrong. If it fails on `jkkn_identities_check_digit_chk`, `fn_jkkn_id_check_digit` was not called correctly in the probe.

- [ ] **Step 8: Confirm the register is still empty**

```sql
SELECT count(*) AS identities FROM public.jkkn_identities;
```

Expected: `0`. The register must remain dormant after Phase 1 — nothing is issued until Phase 4 runs an approval.

- [ ] **Step 9: Mirror and commit**

Append the constraint changes to `supabase/setup/01_tables.sql` and the new issuer body to `02_functions.sql`, replacing the old 3-arg version there.

```bash
git add supabase/migrations/20260813100500_jkkn_identity_external_participant.sql supabase/setup/
git commit -m "feat(identity): third person kind external_participant on jkkn_identities

Course Events issues permanent IDs from the EXISTING register rather than
minting a second identifier. The issuer is dropped and recreated with a 4th
parameter (a defaulted arg alongside the 3-arg version would be an overload,
yielding 42725 on every existing call) and its ACL is re-applied, because
DROP FUNCTION discards it."
```

---

## Task 8: Role grants, participant role, and generated types

The final task. Until the grants land, every `courses.*` key exists in the catalogue but is held by nobody, so every page would render empty.

**Files:**
- Create: `supabase/migrations/20260813100600_course_permissions_and_role.sql`
- Modify: `types/supabase.ts`

**Interfaces:**
- Consumes: the 15 key strings from Task 1; all tables from Tasks 2–6.
- Produces: `profiles.is_external_participant`; a `custom_roles` row with `role_key = 'course_participant'`; and `types/supabase.ts` entries for all 13 changed tables, without which `.from('course_events')` fails typecheck with a TS2769 cascade.

- [ ] **Step 1: Get the target role list from the user — do not derive it**

**Do not select roles by querying for a similar existing key.** Measured on 2026-08-13, `events.view` is held by 25+ active roles including `driver`, `client`, `cohort_member` and `anti_ragging_member`. It is an over-granted key, and using it as a proxy would hand `courses.billing.manage` and `users.jkkn_id.issue` — the ability to approve a ₹2.5 lakh enrollment and mint a permanent identity — to a driver.

Use this query only to *show the user the menu*, never to pick from it automatically:

```sql
SELECT role_key, role_name, institution_scope
  FROM public.custom_roles
 WHERE is_active AND NOT is_system_role
 ORDER BY role_name;
```

The user names the `role_key` values. Record them; they are the literal array in Step 2. If the user has not yet answered, **stop here** — Tasks 1–7 are complete and committed, and this task is safe to pause in front of.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260813100600_course_permissions_and_role.sql`. Replace `'<CONFIRMED_ROLE_KEYS>'` with the array confirmed in Step 1:

```sql
-- =====================================================================
-- Course Events — role grants, participant role, external-profile flag
-- =====================================================================
-- Declaring a key in lib/constants/permissions.ts grants nothing. A key
-- only exists for a role once it is in that role's custom_roles.permissions
-- JSONB. Without this migration every /courses page renders empty.
-- =====================================================================

-- 1. Hard discriminator for an external participant --------------------
-- NOT inferred from institution_id IS NULL. This codebase has a
-- documented antipattern where a missing institution is coerced into a
-- real-looking parameter, and several places branch on institution scope
-- to decide visibility. A profile that can log in and has no institution
-- is a shape this app has never had; it gets an explicit flag.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_external_participant boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_external_participant
  ON public.profiles (is_external_participant)
  WHERE is_external_participant;

COMMENT ON COLUMN public.profiles.is_external_participant IS
  'TRUE for a person provisioned solely to take a paid course. They have institution_id NULL, hold only courses.participant.self, and are confined to the /my-courses portal.';

-- 2. Administration keys onto existing roles ---------------------------
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object(
         'courses.view',                 true,
         'courses.create',               true,
         'courses.edit',                 true,
         'courses.packages.manage',      true,
         'courses.forms.manage',         true,
         'courses.sessions.manage',      true,
         'courses.applications.view',    true,
         'courses.applications.decide',  true,
         'courses.enrollments.manage',   true,
         'courses.billing.view',         true,
         'courses.billing.manage',       true,
         'courses.attendance.mark',      true,
         'courses.certificates.issue',   true,
         -- Approval issues a permanent JKKN ID, so the deciding role
         -- needs the issuer's own gate too. Granted here rather than by
         -- widening fn_issue_jkkn_id, which stays admin-gated.
         'users.jkkn_id.issue',          true
       ),
       updated_at = now()
 WHERE role_key = ANY (ARRAY['<CONFIRMED_ROLE_KEYS>']);

-- courses.delete is deliberately NOT bundled above. It cascades packages,
-- sessions, forms, applications and enrollments; grant it from Role
-- Management deliberately, per role. Super admins pass via
-- user_has_permission()'s own bypass.

-- 3. The Course Participant role ---------------------------------------
-- Exactly ONE key. This role is assigned to every externally provisioned
-- participant, so anything added here is granted to every outside person
-- holding a login.
INSERT INTO public.custom_roles
  (role_key, role_name, description, is_system_role, is_active,
   institution_scope, permissions, module_scopes)
VALUES
  ('course_participant',
   'Course Participant',
   'A person enrolled on a paid course. Sees only their own enrollment, bills and receipts, and is confined to the /my-courses portal. Assigned automatically at application approval.',
   true, true, 'none',
   jsonb_build_object('courses.participant.self', true),
   '{}'::jsonb)
ON CONFLICT (role_key) DO UPDATE
   SET permissions = jsonb_build_object('courses.participant.self', true),
       is_active   = true,
       updated_at  = now();
```

- [ ] **Step 3: Apply the migration**

Apply with `mcp__supabase__apply_migration`, name `20260813100600_course_permissions_and_role`. Save identical SQL to the migrations folder.

- [ ] **Step 4: Verify the grants actually landed**

```sql
SELECT role_key,
       permissions ? 'courses.view'                AS has_view,
       permissions ? 'courses.billing.manage'      AS has_billing,
       permissions ? 'users.jkkn_id.issue'         AS can_issue_id,
       permissions ? 'courses.delete'              AS has_delete
  FROM public.custom_roles
 WHERE permissions ? 'courses.view' OR role_key = 'course_participant'
 ORDER BY role_key;
```

Expected: each confirmed administration role shows `has_view = true`, `has_billing = true`, `can_issue_id = true`, `has_delete = false`. If a row shows `has_delete = true`, the delete key was wrongly bundled — remove it.

- [ ] **Step 5: Verify the participant role holds exactly one key**

```sql
SELECT role_key, institution_scope, jsonb_object_keys(permissions) AS granted_key
  FROM public.custom_roles
 WHERE role_key = 'course_participant';
```

Expected: exactly **one** row, `granted_key = courses.participant.self`, `institution_scope = none`.

More than one row here means an external participant holds a permission beyond their own record — stop and remove it.

- [ ] **Step 6: Regenerate the database types**

Run `mcp__supabase__generate_typescript_types` and merge the output into `types/supabase.ts`.

- [ ] **Step 7: Verify all 13 tables are registered in the types**

Confirm `types/supabase.ts` now contains entries for:

```
course_events                       course_packages
course_package_installments         course_sessions
course_registration_forms           course_registration_form_sections
course_registration_form_fields     course_applications
course_enrollments                  course_bills
course_bill_payments
```

plus the altered `resource_reservations` (with `course_session_id`), `profiles` (with `is_external_participant`) and `jkkn_identities` (with `profile_id`).

A missing table produces a TS2769 cascade at the first `.from('…')` call in Phase 2, which is confusing to diagnose from the error alone.

- [ ] **Step 8: Typecheck**

Run `mcp__ide__getDiagnostics` on `types/supabase.ts`.

Expected: no errors. Note that `getDiagnostics` does not catch duplicate identifiers across a merge — if the generator appended rather than replaced a table block, search the file for a duplicated `course_events:` key manually.

- [ ] **Step 9: Re-run the permission audit gate**

Run: `npx tsx scripts/check-permission-audit-coverage.ts`

Expected: exits 0. This is the same gate as Task 1 Step 5; re-running it confirms nothing in Tasks 2–8 broke the mapping.

- [ ] **Step 10: Mirror and commit**

```bash
git add supabase/migrations/20260813100600_course_permissions_and_role.sql types/supabase.ts supabase/setup/
git commit -m "feat(courses): role grants, Course Participant role, and generated types

Declaring a permission key grants nothing — it must be written into
custom_roles.permissions or every page renders empty. courses.delete is
deliberately excluded from the bundle because it cascades enrollments and
bills. The participant role holds exactly one key."
```

---

## Phase 1 completion criteria

Do not report Phase 1 complete until all of the following are observed, not assumed:

1. `npx tsx scripts/check-permission-audit-coverage.ts` exits 0.
2. All 11 `course_*` tables exist with `relrowsecurity = true`.
3. `information_schema.role_table_grants` returns **zero rows** for `anon`/`PUBLIC` on any `course_*` table.
4. `pg_proc` holds **exactly one** `fn_issue_jkkn_id`, with 4 arguments, and `PUBLIC` has no EXECUTE on it.
5. Both billing probes (Task 6 Steps 3 and 4) produced their exact expected NOTICE.
6. `jkkn_identities` still holds 0 rows.
7. No probe rows survive: `SELECT count(*) FROM course_events WHERE slug LIKE '%-delete-me'` returns 0.
8. `mcp__ide__getDiagnostics` is clean on `types/supabase.ts`, `lib/constants/permissions.ts`, `lib/constants/table-module-map.ts`, `lib/permissions-audit/module-mappings.ts`.

**Do not claim tests pass.** There is no test suite. State exactly which of the above you ran and what each returned.

---

## Notes for Phase 2

- `ROUTE_PREFIX_TO_MODULE` gains `['/courses', 'Courses']` at the same time `MENU_PERMISSIONS` gains the `/courses` entry — the reachability and sidebar gates check them together.
- `proxy.ts` gains `'/learn/'` and `'/api/public/courses/'` in `PUBLIC_PATH_PREFIXES` in Phase 3, when the public pages first exist.
- Bill generation must refuse a package with zero installments. The Task 2 constraint trigger deliberately permits a draft package to have none.
- **`fn_course_recompute_balances` derives the enrollment balance from the bills that EXIST**, not from `total_payable`. That is correct only because every installment bill is generated upfront at enrollment. If Phase 4 ever generates bills lazily, an enrollment would reach `balance = 0` and flip to `confirmed` after paying only the first installment. Generate the full schedule in one transaction, or change the rollup to compare against `total_payable`.
