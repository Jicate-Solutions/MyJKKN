# Admission Fees — Plan 5: Fee-Change Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Roadmap:** [`2026-05-05-admission-fees-roadmap.md`](./2026-05-05-admission-fees-roadmap.md)
**Spec:** [`docs/superpowers/specs/2026-05-05-admission-fee-structure-automation-design.md`](../specs/2026-05-05-admission-fee-structure-automation-design.md)
**Predecessors:** Plan 1 ✅ · Plan 2 ✅ · Plan 3 ✅ · Plan 4 ✅

**Goal:** Handle the open question from spec §4 Q2 — what happens when a lead's matrix dimensions change after bills are already generated? Build the supersede-not-delete reconciliation flow: a Postgres trigger detects matrix-dim changes when bills exist, writes a pending event, freezes the lifecycle. An admin reviews the side-by-side delta in a new modal on `billing/onboarding`, makes per-line decisions (supplemental / credit / refund / reallocate / waive / nothing), and approves. The approval RPC supersedes old bills (NEVER deletes), creates new bills, reallocates already-paid amounts via NEW `billing_receipt_items` rows, books excess into `student_credit_balances`. Lifecycle unfreezes.

**Architecture:** Three new tables (`admission_fee_change_events`, `admission_fee_change_event_lines`, `student_credit_balances`). One column added to `billing_student_bills` (`superseded_by_bill_id`) plus a new status enum value (`superseded`). One column added to `billing_receipt_items` (`allocation_reason`). One Postgres trigger on `learners_profiles` UPDATE. One SECURITY DEFINER RPC (`admission_approve_fee_change_event`) — the load-bearing piece. Two services (`fee-change-event-service.ts` + `student-credit-balance-service.ts`). One bell-icon notification panel + per-event delta modal on `billing/onboarding`. Lifecycle freeze in `OnboardingService.markAsApproved`.

**Tech Stack:** Same as prior plans.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260509100001_create_admission_fee_change_events.sql` | events + event_lines tables |
| `supabase/migrations/20260509100002_create_student_credit_balances.sql` | credit balance table |
| `supabase/migrations/20260509100003_extend_billing_for_supersede.sql` | bill `superseded` state, `superseded_by_bill_id`, `allocation_reason` |
| `supabase/migrations/20260509100004_register_fee_change_event_permission.sql` | `admission_fees.approve_change_event` (JSONB on custom_roles) |
| `supabase/migrations/20260509100005_fee_change_event_rls.sql` | RLS for events, event_lines, credit_balances |
| `supabase/migrations/20260509100006_trigger_detect_fee_dimension_change.sql` | Postgres trigger on learners_profiles UPDATE |
| `supabase/migrations/20260509100007_rpc_admission_approve_fee_change_event.sql` | Approval RPC (load-bearing) |
| `lib/services/admission/fee-change-event-service.ts` | List + approve + reject |
| `lib/services/billing/student-credit-balance-service.ts` | List + (later) consume |
| `app/(routes)/billing/onboarding/_components/_change-events/notification-bell.tsx` | Header badge with pending count |
| `app/(routes)/billing/onboarding/_components/_change-events/events-panel.tsx` | Side panel listing pending events |
| `app/(routes)/billing/onboarding/_components/_change-events/event-review-dialog.tsx` | Per-event delta review modal |
| `app/(routes)/billing/onboarding/_components/_change-events/event-line-decision-row.tsx` | One-line decision row inside dialog |

### Modified files

| Path | What changes |
|---|---|
| `supabase/setup/01_tables.sql` | Append events + event_lines + credit_balances + bill column ALTER |
| `supabase/setup/02_functions.sql` | Append `admission_approve_fee_change_event` RPC |
| `supabase/setup/03_policies.sql` | Append RLS for new tables |
| `supabase/setup/04_triggers.sql` | Append trigger function + binding |
| `types/admission.ts` | Append types |
| `lib/services/billing/onboarding/onboarding-service.ts` | `markAsApproved` precondition: no pending fee_change_events for this learner |
| `lib/utils/admission-fees-activity-templates.ts` | Add `fee_change_event.{requested,approved,rejected}`, `bill.superseded`, `receipt_item.reallocated`, `student_credit_balance.{created,consumed}` template branches |

---

## Permission key registered in this plan

| Key | Default role grants | Used by |
|---|---|---|
| `admission_fees.approve_change_event` | super_admin, administrator | Approving / rejecting fee_change_events |

---

## Activity log events registered in this plan

`fee_change_event.requested` (from trigger context — written by service wrapper after detection) · `fee_change_event.approved` · `fee_change_event.rejected` · `bill.superseded` · `receipt_item.reallocated` · `student_credit_balance.created` · `student_credit_balance.consumed`

---

## Pre-flight checks

```sql
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables
            WHERE table_schema='public' AND table_name='admission_fee_change_events') AS events_table_exists,
  EXISTS (SELECT 1 FROM information_schema.tables
            WHERE table_schema='public' AND table_name='student_credit_balances') AS credit_table_exists,
  EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='billing_student_bills'
              AND column_name='superseded_by_bill_id') AS superseded_col_exists,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='admission_approve_fee_change_event') AS rpc_exists,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_detect_fee_dimension_change') AS trigger_exists;
```

Expected before Plan 5 starts: all five = false.

---

# PHASE A — Schema + RPC + permissions

## Task 1: Migration — `admission_fee_change_events` + `_event_lines`

**Files:**
- Create: `supabase/migrations/20260509100001_create_admission_fee_change_events.sql`
- Modify: `supabase/setup/01_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260509100001 — Create admission_fee_change_events + _event_lines
-- ============================================================================
-- Spec §6.4. Pending-review events fire when a learner's matrix dimensions
-- change after bills exist. Lifecycle is frozen until admin approves/rejects.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admission_fee_change_events (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id                  uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    trigger_field               text NOT NULL CHECK (trigger_field IN
                                ('program_id','quota_id','community_category_id',
                                 'accommodation_type_id','admission_year_id','manual')),
    -- Snapshot at moment of change
    old_program_id              uuid,
    old_quota_id                uuid,
    old_community_category_id   uuid,
    old_accommodation_type_id   uuid,
    old_admission_year_id       uuid,
    old_fee_structure_id        uuid REFERENCES public.admission_fee_structures(id),
    new_fee_structure_id        uuid REFERENCES public.admission_fee_structures(id),
    status                      text NOT NULL DEFAULT 'pending_review'
                                CHECK (status IN ('pending_review','approved','rejected')),
    reason_notes                text,
    requested_by                uuid REFERENCES public.profiles(id),
    decided_by                  uuid REFERENCES public.profiles(id),
    requested_at                timestamptz NOT NULL DEFAULT now(),
    decided_at                  timestamptz,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_fee_change_events_pending
    ON public.admission_fee_change_events (status, learner_id)
    WHERE status = 'pending_review';

CREATE INDEX IF NOT EXISTS ix_fee_change_events_learner
    ON public.admission_fee_change_events (learner_id, requested_at DESC);

DROP TRIGGER IF EXISTS trg_fee_change_events_touch ON public.admission_fee_change_events;
CREATE TRIGGER trg_fee_change_events_touch
    BEFORE UPDATE ON public.admission_fee_change_events
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TABLE IF NOT EXISTS public.admission_fee_change_event_lines (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id                uuid NOT NULL REFERENCES public.admission_fee_change_events(id) ON DELETE CASCADE,
    billing_category_id     uuid NOT NULL REFERENCES public.billing_categories(id),
    old_amount              numeric(15,2),
    new_amount              numeric(15,2),
    paid_amount_so_far      numeric(15,2) NOT NULL DEFAULT 0,
    decision                text CHECK (decision IN
                            ('apply_supplemental','issue_credit_note','refund_payment',
                             'reallocate_payment','waive_delta','do_nothing')),
    generated_artifact_id   uuid,
    decision_notes          text,
    UNIQUE (event_id, billing_category_id)
);

CREATE INDEX IF NOT EXISTS ix_fee_change_event_lines_event
    ON public.admission_fee_change_event_lines (event_id);
```

- [ ] **Step 2: Append DDL to `supabase/setup/01_tables.sql`** (idempotent).

- [ ] **Step 3: Apply via `mcp__supabase__apply_migration`** with name `20260509100001_create_admission_fee_change_events`.

- [ ] **Step 4: Verify**
```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='admission_fee_change_events') AS event_cols,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='admission_fee_change_event_lines') AS line_cols;
-- Expected: event_cols=15, line_cols=8.
```

- [ ] **Step 5: Commit** referencing Spec §6.4 + Plan Task 1.

---

## Task 2: Migration — `student_credit_balances` table

**Files:**
- Create: `supabase/migrations/20260509100002_create_student_credit_balances.sql`
- Modify: `supabase/setup/01_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260509100002 — Create student_credit_balances
-- ============================================================================
-- Spec §6.6. Per-learner credit balance entries from overpayment / fee-change
-- swap excess / refund reversal / manual. Consumed against future bills.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.student_credit_balances (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id                  uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    amount                      numeric(15,2) NOT NULL CHECK (amount >= 0),
    source                      text NOT NULL CHECK (source IN
                                ('fee_structure_change','overpayment','refund_reversal','manual')),
    source_event_id             uuid,
    is_consumed                 boolean NOT NULL DEFAULT false,
    consumed_against_bill_id    uuid REFERENCES public.billing_student_bills(id),
    consumed_at                 timestamptz,
    notes                       text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_credit_balances_student_unconsumed
    ON public.student_credit_balances (student_id, is_consumed)
    WHERE is_consumed = false;

DROP TRIGGER IF EXISTS trg_student_credit_balances_touch ON public.student_credit_balances;
CREATE TRIGGER trg_student_credit_balances_touch
    BEFORE UPDATE ON public.student_credit_balances
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
```

- [ ] **Step 2: Append to setup.**

- [ ] **Step 3: Apply.**

- [ ] **Step 4: Verify** col_count=12.

- [ ] **Step 5: Commit** referencing Spec §6.6 + Plan Task 2.

---

## Task 3: Migration — Bill schema additions for supersede + reallocation

**Files:**
- Create: `supabase/migrations/20260509100003_extend_billing_for_supersede.sql`
- Modify: `supabase/setup/01_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260509100003 — Extend billing schema for supersede + reallocation
-- ============================================================================
-- Spec §6.5. Adds:
--   billing_student_bills.superseded_by_bill_id (FK to self)
--   billing_student_bills.status now allows 'superseded'
--   billing_receipt_items.allocation_reason
-- ============================================================================

-- Add the new column
ALTER TABLE public.billing_student_bills
    ADD COLUMN IF NOT EXISTS superseded_by_bill_id uuid REFERENCES public.billing_student_bills(id);

-- Drop the existing status constraint (named per project convention) + replace
DO $$
BEGIN
    -- Find any check constraint on billing_student_bills.status
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_schema='public' AND table_name='billing_student_bills'
           AND constraint_type='CHECK'
           AND constraint_name LIKE '%status%'
    ) THEN
        EXECUTE (
            SELECT format('ALTER TABLE public.billing_student_bills DROP CONSTRAINT %I', constraint_name)
              FROM information_schema.table_constraints
             WHERE table_schema='public' AND table_name='billing_student_bills'
               AND constraint_type='CHECK'
               AND constraint_name LIKE '%status%'
             LIMIT 1
        );
    END IF;
END$$;

ALTER TABLE public.billing_student_bills
    ADD CONSTRAINT billing_student_bills_status_check
    CHECK (status IN ('unpaid','partially_paid','paid','superseded'));

-- Add allocation_reason on receipt_items
ALTER TABLE public.billing_receipt_items
    ADD COLUMN IF NOT EXISTS allocation_reason text NOT NULL DEFAULT 'original_payment'
        CHECK (allocation_reason IN
            ('original_payment','fee_structure_change_reallocation','manual_reallocation'));
```

**Note**: the DO-block dynamic constraint drop tolerates whatever the existing constraint is named (project conventions vary; could be `billing_student_bills_status_check` or just `_check1`). The ADD CONSTRAINT after re-establishes the name we want. If the dynamic discovery fails on your DB, drop the DO-block and use the explicit constraint name from `\d billing_student_bills` in psql.

- [ ] **Step 2: Append to setup.**

- [ ] **Step 3: Apply.**

- [ ] **Step 4: Verify**
```sql
SELECT column_name, is_nullable, data_type
  FROM information_schema.columns
 WHERE table_schema='public'
   AND ((table_name='billing_student_bills' AND column_name IN ('superseded_by_bill_id','status'))
     OR (table_name='billing_receipt_items' AND column_name='allocation_reason'))
 ORDER BY 1;
-- Expected: 3 rows.

-- And confirm the status check accepts 'superseded'
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'public.billing_student_bills'::regclass
   AND contype='c' AND conname LIKE '%status%';
-- Expected definition includes 'superseded'.
```

- [ ] **Step 5: Commit** referencing Spec §6.5 + Plan Task 3.

---

## Task 4: Migration — Register `admission_fees.approve_change_event` permission

**Files:**
- Create: `supabase/migrations/20260509100004_register_fee_change_event_permission.sql`

JSONB-on-`custom_roles` pattern.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260509100004 — Register admission_fees.approve_change_event
-- ============================================================================
-- Approving / rejecting fee_change_events is a high-trust operation: it
-- supersedes paid bills and reallocates payments. Only super_admin and
-- administrator (finance/admission heads).
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = permissions || '{"admission_fees.approve_change_event": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('administrator','super_admin')
   AND COALESCE(permissions->>'admission_fees.approve_change_event','false') <> 'true';
```

- [ ] **Step 2: Apply.**

- [ ] **Step 3: Verify**
```sql
SELECT role_key, (permissions ? 'admission_fees.approve_change_event') AS has_perm
  FROM public.custom_roles
 WHERE role_key IN ('administrator','super_admin')
 ORDER BY 1;
-- Expected: 2 rows, has_perm=true on both.
```

- [ ] **Step 4: Commit** referencing Spec §10.1 + Plan Task 4.

---

## Task 5: Migration — RLS for events, event_lines, credit_balances

**Files:**
- Create: `supabase/migrations/20260509100005_fee_change_event_rls.sql`
- Modify: `supabase/setup/03_policies.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260509100005 — RLS for events, event_lines, student_credit_balances
-- ============================================================================
-- Read: admission_fees.read + parent learner's institution access
-- Write: admission_fees.approve_change_event + same institution access
-- ============================================================================

ALTER TABLE public.admission_fee_change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_fee_change_event_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_credit_balances ENABLE ROW LEVEL SECURITY;

-- events
DROP POLICY IF EXISTS fee_change_events_read ON public.admission_fee_change_events;
CREATE POLICY fee_change_events_read
    ON public.admission_fee_change_events FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_change_events.learner_id
           AND public.user_has_permission('admission_fees.read')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS fee_change_events_write ON public.admission_fee_change_events;
CREATE POLICY fee_change_events_write
    ON public.admission_fee_change_events FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_change_events.learner_id
           AND public.user_has_permission('admission_fees.approve_change_event')
           AND public.role_has_institution_access(lp.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_change_events.learner_id
           AND public.user_has_permission('admission_fees.approve_change_event')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

-- event_lines (inherit via parent event)
DROP POLICY IF EXISTS fee_change_event_lines_read ON public.admission_fee_change_event_lines;
CREATE POLICY fee_change_event_lines_read
    ON public.admission_fee_change_event_lines FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.admission_fee_change_events e
         JOIN public.learners_profiles lp ON lp.id = e.learner_id
         WHERE e.id = admission_fee_change_event_lines.event_id
           AND public.user_has_permission('admission_fees.read')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS fee_change_event_lines_write ON public.admission_fee_change_event_lines;
CREATE POLICY fee_change_event_lines_write
    ON public.admission_fee_change_event_lines FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.admission_fee_change_events e
         JOIN public.learners_profiles lp ON lp.id = e.learner_id
         WHERE e.id = admission_fee_change_event_lines.event_id
           AND public.user_has_permission('admission_fees.approve_change_event')
           AND public.role_has_institution_access(lp.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.admission_fee_change_events e
         JOIN public.learners_profiles lp ON lp.id = e.learner_id
         WHERE e.id = admission_fee_change_event_lines.event_id
           AND public.user_has_permission('admission_fees.approve_change_event')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

-- credit_balances
DROP POLICY IF EXISTS student_credit_balances_read ON public.student_credit_balances;
CREATE POLICY student_credit_balances_read
    ON public.student_credit_balances FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = student_credit_balances.student_id
           AND public.user_has_permission('admission_fees.read')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS student_credit_balances_write ON public.student_credit_balances;
CREATE POLICY student_credit_balances_write
    ON public.student_credit_balances FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = student_credit_balances.student_id
           AND public.user_has_permission('admission_fees.approve_change_event')
           AND public.role_has_institution_access(lp.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = student_credit_balances.student_id
           AND public.user_has_permission('admission_fees.approve_change_event')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );
```

- [ ] **Step 2: Append to `supabase/setup/03_policies.sql`**.

- [ ] **Step 3: Apply.**

- [ ] **Step 4: Verify** 6 policies (2 per table × 3 tables):
```sql
SELECT tablename, policyname, cmd FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN ('admission_fee_change_events','admission_fee_change_event_lines','student_credit_balances')
 ORDER BY 1, 2;
-- Expected: 6 rows.
```

- [ ] **Step 5: Commit** referencing Spec §10.2 + Plan Task 5.

---

## Task 6: Migration — Postgres trigger detecting matrix-dim changes

**Files:**
- Create: `supabase/migrations/20260509100006_trigger_detect_fee_dimension_change.sql`
- Modify: `supabase/setup/04_triggers.sql`

The trigger fires AFTER UPDATE on `learners_profiles`. Logic:
1. Detect change to ANY of the matrix dimensions (`program_id, quota_id, community_category_id, accommodation_type_id, admission_year_id`)
2. Skip if `legacy_fee_mode = true` (no auto-reconcile for legacy rows)
3. Skip if NEW.legacy_fee_mode != OLD.legacy_fee_mode (the flag itself changed; not a real dim change)
4. Skip if no non-superseded bills exist for the learner (first-time enquiry edits don't trigger)
5. Skip if a `pending_review` event already exists for the learner (one event at a time)
6. Insert a row into `admission_fee_change_events` capturing OLD/NEW dim snapshots
7. Look up `old_fee_structure_id` and `new_fee_structure_id` via the dim combos
8. Insert event_lines: one per billing_category that appears in either the old or the new fee_structure_items, with old_amount / new_amount / paid_amount_so_far populated

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- 20260509100006 — Trigger: detect matrix-dim changes on learners_profiles
-- ============================================================================
-- Spec §8.4. Fires AFTER UPDATE. Inserts pending_review event when learner's
-- matrix dims change AND non-superseded bills exist AND no pending event already.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_detect_fee_dimension_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_changed_field         text;
    v_has_active_bills      boolean;
    v_has_pending_event     boolean;
    v_old_structure_id      uuid;
    v_new_structure_id      uuid;
    v_event_id              uuid;
    v_caller                uuid := auth.uid();
BEGIN
    -- Skip if legacy mode (true OR flag itself changed)
    IF NEW.legacy_fee_mode = true OR NEW.legacy_fee_mode IS DISTINCT FROM OLD.legacy_fee_mode THEN
        RETURN NEW;
    END IF;

    -- Detect which dim changed (first match wins; for activity log clarity)
    v_changed_field := CASE
        WHEN NEW.program_id IS DISTINCT FROM OLD.program_id THEN 'program_id'
        WHEN NEW.quota_id IS DISTINCT FROM OLD.quota_id THEN 'quota_id'
        WHEN NEW.community_category_id IS DISTINCT FROM OLD.community_category_id THEN 'community_category_id'
        WHEN NEW.accommodation_type_id IS DISTINCT FROM OLD.accommodation_type_id THEN 'accommodation_type_id'
        WHEN NEW.admission_year_id IS DISTINCT FROM OLD.admission_year_id THEN 'admission_year_id'
        ELSE NULL
    END;

    IF v_changed_field IS NULL THEN
        RETURN NEW;
    END IF;

    -- Skip if no active bills
    SELECT EXISTS (
        SELECT 1 FROM public.billing_student_bills
         WHERE student_id = NEW.id AND status <> 'superseded'
    ) INTO v_has_active_bills;
    IF NOT v_has_active_bills THEN
        RETURN NEW;
    END IF;

    -- Skip if a pending_review event already exists
    SELECT EXISTS (
        SELECT 1 FROM public.admission_fee_change_events
         WHERE learner_id = NEW.id AND status = 'pending_review'
    ) INTO v_has_pending_event;
    IF v_has_pending_event THEN
        RETURN NEW;
    END IF;

    -- Look up old/new fee_structure_ids
    SELECT id INTO v_old_structure_id
      FROM public.admission_fee_structures
     WHERE institution_id        = OLD.institution_id
       AND degree_id             = OLD.degree_id
       AND department_id         = OLD.department_id
       AND programme_id          = OLD.program_id
       AND quota_id              = OLD.quota_id
       AND community_category_id = OLD.community_category_id
       AND accommodation_type_id = OLD.accommodation_type_id
       AND admission_year_id     = OLD.admission_year_id
       AND status = 'active'
     LIMIT 1;

    SELECT id INTO v_new_structure_id
      FROM public.admission_fee_structures
     WHERE institution_id        = NEW.institution_id
       AND degree_id             = NEW.degree_id
       AND department_id         = NEW.department_id
       AND programme_id          = NEW.program_id
       AND quota_id              = NEW.quota_id
       AND community_category_id = NEW.community_category_id
       AND accommodation_type_id = NEW.accommodation_type_id
       AND admission_year_id     = NEW.admission_year_id
       AND status = 'active'
     LIMIT 1;

    -- Insert event row
    INSERT INTO public.admission_fee_change_events (
        learner_id, trigger_field,
        old_program_id, old_quota_id, old_community_category_id,
        old_accommodation_type_id, old_admission_year_id,
        old_fee_structure_id, new_fee_structure_id,
        requested_by
    ) VALUES (
        NEW.id, v_changed_field,
        OLD.program_id, OLD.quota_id, OLD.community_category_id,
        OLD.accommodation_type_id, OLD.admission_year_id,
        v_old_structure_id, v_new_structure_id,
        v_caller
    )
    RETURNING id INTO v_event_id;

    -- Insert event_lines: one per billing_category in old + new structure items
    --   old_amount / new_amount / paid_amount_so_far populated
    INSERT INTO public.admission_fee_change_event_lines (
        event_id, billing_category_id, old_amount, new_amount, paid_amount_so_far
    )
    SELECT
        v_event_id,
        cat_id,
        old_amount,
        new_amount,
        paid
    FROM (
        SELECT cat_id,
               MAX(old_amount) AS old_amount,
               MAX(new_amount) AS new_amount,
               COALESCE(MAX(paid), 0) AS paid
          FROM (
              SELECT fsi.billing_category_id AS cat_id,
                     fsi.amount AS old_amount,
                     NULL::numeric AS new_amount,
                     NULL::numeric AS paid
                FROM public.admission_fee_structure_items fsi
               WHERE fsi.fee_structure_id = v_old_structure_id
              UNION ALL
              SELECT fsi.billing_category_id,
                     NULL::numeric,
                     fsi.amount,
                     NULL::numeric
                FROM public.admission_fee_structure_items fsi
               WHERE fsi.fee_structure_id = v_new_structure_id
              UNION ALL
              -- paid_amount_so_far per category from existing bills
              SELECT b.item_category_id,
                     NULL::numeric,
                     NULL::numeric,
                     b.final_amount - b.balance_amount
                FROM public.billing_student_bills b
               WHERE b.student_id = NEW.id
                 AND b.status <> 'superseded'
                 AND b.item_category_id IS NOT NULL
          ) t
         GROUP BY cat_id
    ) merged;

    -- Note: activity log entry written by service-layer caller per project pattern.
    -- The trigger only writes data; the request-context user (auth.uid) is captured
    -- as requested_by for audit.

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_detect_fee_dimension_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_detect_fee_dimension_change ON public.learners_profiles;
CREATE TRIGGER trg_detect_fee_dimension_change
    AFTER UPDATE ON public.learners_profiles
    FOR EACH ROW EXECUTE FUNCTION public.trigger_detect_fee_dimension_change();
```

- [ ] **Step 2: Append to `supabase/setup/04_triggers.sql`**.

- [ ] **Step 3: Apply.**

- [ ] **Step 4: Verify**
```sql
SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.learners_profiles'::regclass
   AND tgname = 'trg_detect_fee_dimension_change';
-- Expected: 1 row.
```

- [ ] **Step 5: Commit** referencing Spec §8.4 + Plan Task 6.

---

## Task 7: Migration — `admission_approve_fee_change_event` SECURITY DEFINER RPC

**Files:**
- Create: `supabase/migrations/20260509100007_rpc_admission_approve_fee_change_event.sql`
- Modify: `supabase/setup/02_functions.sql`

The load-bearing piece. Per-line decisions:
- `apply_supplemental` — create new bill for the delta (only if delta > 0); link via `superseded_by_bill_id`
- `issue_credit_note` — create `student_credit_balances` row for the delta (only if delta < 0)
- `refund_payment` — flag for manual refund (writes a credit_balance row marked for refund); does NOT auto-refund
- `reallocate_payment` — supersede old bill, create new bill, write new `billing_receipt_items` rows allocating prior payment to new bill
- `waive_delta` / `do_nothing` — no artifact

After all decisions applied, refresh `learners_profiles.fee_items` via `admission_resolve_fee_items_for_lead`. Update event status='approved'. Return summary JSONB.

- [ ] **Step 1: Read `OnboardingService.createBillsFromProfile`** end-to-end again (Plan 4 verified its 14-column INSERT shape). The supplemental/reallocate paths in this RPC must produce bills with the same column shape.

- [ ] **Step 2: Write the RPC migration** (this is large — ~200 lines):

```sql
-- ============================================================================
-- 20260509100007 — admission_approve_fee_change_event RPC
-- ============================================================================
-- Spec §8.3.2. Atomic approval of fee_change_events with per-line decisions.
-- Any RAISE EXCEPTION rolls back everything.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admission_approve_fee_change_event(
    p_event_id        uuid,
    p_line_decisions  jsonb,           -- [{billing_category_id, decision, reallocation_amount?, decision_notes?}]
    p_refund_excess   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event             record;
    v_caller            uuid := auth.uid();
    v_decision          jsonb;
    v_line_cat_id       uuid;
    v_decision_kind     text;
    v_reallocate_amount numeric(15,2);
    v_old_amount        numeric(15,2);
    v_new_amount        numeric(15,2);
    v_paid_so_far       numeric(15,2);
    v_delta             numeric(15,2);
    v_old_bill_id       uuid;
    v_new_bill_id       uuid;
    v_credit_balance_id uuid;
    v_summary           jsonb := '{"new_bills":0,"superseded_bills":0,"credit_balances":0,"reallocations":0}'::jsonb;
    v_due_date          date := (now() + interval '30 days')::date;
    v_lead              record;
BEGIN
    -- 1. Permission
    IF NOT public.user_has_permission('admission_fees.approve_change_event') THEN
        RAISE EXCEPTION 'permission_denied: admission_fees.approve_change_event required'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Load event
    SELECT * INTO v_event
      FROM public.admission_fee_change_events
     WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found: %', p_event_id USING ERRCODE = 'P0002';
    END IF;
    IF v_event.status <> 'pending_review' THEN
        RAISE EXCEPTION 'event_not_pending: %', v_event.status;
    END IF;

    -- 3. Load lead (institution_id needed for new bills)
    SELECT id, institution_id INTO v_lead
      FROM public.learners_profiles
     WHERE id = v_event.learner_id;

    -- 4. For each decision in p_line_decisions, apply
    FOR v_decision IN SELECT * FROM jsonb_array_elements(p_line_decisions)
    LOOP
        v_line_cat_id       := (v_decision->>'billing_category_id')::uuid;
        v_decision_kind     := v_decision->>'decision';
        v_reallocate_amount := COALESCE((v_decision->>'reallocation_amount')::numeric, 0);

        -- Pull the event_line snapshot
        SELECT old_amount, new_amount, paid_amount_so_far
          INTO v_old_amount, v_new_amount, v_paid_so_far
          FROM public.admission_fee_change_event_lines
         WHERE event_id = p_event_id AND billing_category_id = v_line_cat_id;

        v_delta := COALESCE(v_new_amount, 0) - COALESCE(v_old_amount, 0);

        -- Pick the most recent active old bill in this category (for supersede / reallocate)
        SELECT id INTO v_old_bill_id
          FROM public.billing_student_bills
         WHERE student_id = v_event.learner_id
           AND item_category_id = v_line_cat_id
           AND status <> 'superseded'
         ORDER BY created_at DESC LIMIT 1;

        CASE v_decision_kind
        WHEN 'apply_supplemental' THEN
            -- Only when delta > 0
            IF v_delta > 0 THEN
                INSERT INTO public.billing_student_bills (
                    student_id, institution_id, item_category_id, bill_description,
                    due_date, quantity, unit_amount, total_amount, tax_amount, final_amount,
                    balance_amount, status, remarks, created_by
                ) VALUES (
                    v_event.learner_id, v_lead.institution_id, v_line_cat_id,
                    'Supplemental — fee structure change',
                    v_due_date, 1, v_delta, v_delta, 0, v_delta,
                    v_delta, 'unpaid',
                    'Supplemental bill for fee structure change event ' || p_event_id::text,
                    v_caller
                ) RETURNING id INTO v_new_bill_id;
                v_summary := jsonb_set(v_summary, '{new_bills}',
                    to_jsonb((v_summary->>'new_bills')::int + 1));
            END IF;

        WHEN 'issue_credit_note' THEN
            -- Only when delta < 0 (parent owes less now); credit balance covers the delta
            IF v_delta < 0 THEN
                INSERT INTO public.student_credit_balances (
                    student_id, amount, source, source_event_id, notes, created_by
                ) VALUES (
                    v_event.learner_id, ABS(v_delta), 'fee_structure_change', p_event_id,
                    'Credit note for ' || v_line_cat_id::text || ' (delta ' || v_delta::text || ')',
                    v_caller
                ) RETURNING id INTO v_credit_balance_id;
                v_summary := jsonb_set(v_summary, '{credit_balances}',
                    to_jsonb((v_summary->>'credit_balances')::int + 1));
            END IF;

        WHEN 'refund_payment' THEN
            -- Mark for manual refund — credit balance entry with notes
            IF v_paid_so_far > 0 THEN
                INSERT INTO public.student_credit_balances (
                    student_id, amount, source, source_event_id, notes, created_by
                ) VALUES (
                    v_event.learner_id, v_paid_so_far, 'fee_structure_change', p_event_id,
                    'REFUND REQUESTED — manual refund pending; original bill ' || COALESCE(v_old_bill_id::text,'(none)'),
                    v_caller
                ) RETURNING id INTO v_credit_balance_id;
                v_summary := jsonb_set(v_summary, '{credit_balances}',
                    to_jsonb((v_summary->>'credit_balances')::int + 1));
            END IF;

        WHEN 'reallocate_payment' THEN
            -- Supersede old bill, create new bill, reallocate paid amount
            IF v_old_bill_id IS NOT NULL THEN
                UPDATE public.billing_student_bills
                   SET status = 'superseded', updated_at = now()
                 WHERE id = v_old_bill_id;
                v_summary := jsonb_set(v_summary, '{superseded_bills}',
                    to_jsonb((v_summary->>'superseded_bills')::int + 1));
            END IF;
            IF COALESCE(v_new_amount, 0) > 0 THEN
                INSERT INTO public.billing_student_bills (
                    student_id, institution_id, item_category_id, bill_description,
                    due_date, quantity, unit_amount, total_amount, tax_amount, final_amount,
                    balance_amount, status, remarks, created_by
                ) VALUES (
                    v_event.learner_id, v_lead.institution_id, v_line_cat_id,
                    'Replacement — fee structure change',
                    v_due_date, 1, v_new_amount, v_new_amount, 0, v_new_amount,
                    GREATEST(0, v_new_amount - LEAST(v_paid_so_far, v_new_amount)),
                    CASE
                      WHEN v_paid_so_far >= v_new_amount THEN 'paid'
                      WHEN v_paid_so_far > 0 THEN 'partially_paid'
                      ELSE 'unpaid' END,
                    'Replacement bill for fee structure change event ' || p_event_id::text,
                    v_caller
                ) RETURNING id INTO v_new_bill_id;
                v_summary := jsonb_set(v_summary, '{new_bills}',
                    to_jsonb((v_summary->>'new_bills')::int + 1));

                -- Link supersede chain
                IF v_old_bill_id IS NOT NULL THEN
                    UPDATE public.billing_student_bills
                       SET superseded_by_bill_id = v_new_bill_id
                     WHERE id = v_old_bill_id;
                END IF;

                -- Reallocate prior payments: copy receipt_items rows pointing at old bill
                -- into NEW rows pointing at the new bill (NEVER mutate originals)
                IF v_paid_so_far > 0 AND v_old_bill_id IS NOT NULL THEN
                    INSERT INTO public.billing_receipt_items (
                        receipt_id, bill_id, amount_paid, allocation_reason
                    )
                    SELECT receipt_id,
                           v_new_bill_id,
                           LEAST(amount_paid, v_new_amount),
                           'fee_structure_change_reallocation'
                      FROM public.billing_receipt_items
                     WHERE bill_id = v_old_bill_id
                       AND allocation_reason = 'original_payment';
                    -- Increment the reallocations counter (each line that runs reallocation
                    -- counts once; the GET DIAGNOSTICS form was a draft mistake — never
                    -- assign GET DIAGNOSTICS to v_summary because it would overwrite the
                    -- JSONB with an integer).
                    v_summary := jsonb_set(v_summary, '{reallocations}',
                        to_jsonb((v_summary->>'reallocations')::int + 1));

                    -- Excess (paid > new amount) → credit_balance
                    IF v_paid_so_far > v_new_amount THEN
                        INSERT INTO public.student_credit_balances (
                            student_id, amount, source, source_event_id, notes, created_by
                        ) VALUES (
                            v_event.learner_id, v_paid_so_far - v_new_amount, 'fee_structure_change',
                            p_event_id,
                            CASE WHEN p_refund_excess
                                 THEN 'EXCESS — refund flag set; manual refund pending'
                                 ELSE 'EXCESS from reallocation; available against future bills' END,
                            v_caller
                        );
                        v_summary := jsonb_set(v_summary, '{credit_balances}',
                            to_jsonb((v_summary->>'credit_balances')::int + 1));
                    END IF;
                END IF;
            END IF;

        WHEN 'waive_delta', 'do_nothing' THEN
            -- No artifact
            NULL;

        ELSE
            RAISE EXCEPTION 'unknown_decision: %', v_decision_kind;
        END CASE;

        -- Persist the decision + artifact id back on the event_line
        UPDATE public.admission_fee_change_event_lines
           SET decision              = v_decision_kind,
               generated_artifact_id = COALESCE(v_new_bill_id, v_credit_balance_id),
               decision_notes        = v_decision->>'decision_notes'
         WHERE event_id = p_event_id AND billing_category_id = v_line_cat_id;

        v_new_bill_id := NULL;
        v_credit_balance_id := NULL;
    END LOOP;

    -- 5. Refresh resolved fee_items snapshot
    PERFORM public.admission_resolve_fee_items_for_lead(v_event.learner_id);

    -- 6. Mark event approved
    UPDATE public.admission_fee_change_events
       SET status      = 'approved',
           decided_by  = v_caller,
           decided_at  = now(),
           updated_at  = now()
     WHERE id = p_event_id;

    RETURN jsonb_build_object(
        'success', true,
        'event_id', p_event_id,
        'summary', v_summary
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_approve_fee_change_event(uuid, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_approve_fee_change_event(uuid, jsonb, boolean) TO authenticated;
```

- [ ] **Step 3: Append to `supabase/setup/02_functions.sql`**.

- [ ] **Step 4: Apply.**

- [ ] **Step 5: Verify** function exists + SECURITY DEFINER:
```sql
SELECT proname, prosecdef FROM pg_proc WHERE proname='admission_approve_fee_change_event';
-- Expected: 1 row, prosecdef=true.
```

- [ ] **Step 6: No production smoke** — like Plan 4, no candidate row exists in production with the right preconditions. Plan 6 cutover testing exercises this RPC end-to-end.

- [ ] **Step 7: Commit** referencing Spec §8.3.2 + Plan Task 7.

---

## Task 8: Type definitions

**Files:**
- Modify: `types/admission.ts` (append)

- [ ] **Step 1: Append types**

```typescript
// ============================================================================
// Fee-Change Reconciliation — Plan 5 types
// ============================================================================
// Spec §6.4, §8.3.2
// Plan: docs/superpowers/plans/2026-05-05-admission-fees-plan-05-fee-change-reconciliation.md Task 8

export type AdmissionFeeChangeEventStatus = 'pending_review' | 'approved' | 'rejected';
export type AdmissionFeeChangeEventTriggerField =
  | 'program_id' | 'quota_id' | 'community_category_id'
  | 'accommodation_type_id' | 'admission_year_id' | 'manual';
export type AdmissionFeeChangeEventLineDecision =
  | 'apply_supplemental' | 'issue_credit_note' | 'refund_payment'
  | 'reallocate_payment' | 'waive_delta' | 'do_nothing';

export interface AdmissionFeeChangeEvent {
  id: string;
  learner_id: string;
  trigger_field: AdmissionFeeChangeEventTriggerField;
  old_program_id: string | null;
  old_quota_id: string | null;
  old_community_category_id: string | null;
  old_accommodation_type_id: string | null;
  old_admission_year_id: string | null;
  old_fee_structure_id: string | null;
  new_fee_structure_id: string | null;
  status: AdmissionFeeChangeEventStatus;
  reason_notes: string | null;
  requested_by: string | null;
  decided_by: string | null;
  requested_at: string;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdmissionFeeChangeEventLine {
  id: string;
  event_id: string;
  billing_category_id: string;
  old_amount: number | null;
  new_amount: number | null;
  paid_amount_so_far: number;
  decision: AdmissionFeeChangeEventLineDecision | null;
  generated_artifact_id: string | null;
  decision_notes: string | null;
}

export interface AdmissionFeeChangeEventWithLines extends AdmissionFeeChangeEvent {
  lines: AdmissionFeeChangeEventLine[];
}

export interface ApproveFeeChangeEventDecisionInput {
  billing_category_id: string;
  decision: AdmissionFeeChangeEventLineDecision;
  reallocation_amount?: number;
  decision_notes?: string;
}

export interface ApproveFeeChangeEventResult {
  success: boolean;
  event_id: string;
  summary: {
    new_bills: number;
    superseded_bills: number;
    credit_balances: number;
    reallocations: number;
  };
}

export type StudentCreditBalanceSource =
  | 'fee_structure_change' | 'overpayment' | 'refund_reversal' | 'manual';

export interface StudentCreditBalance {
  id: string;
  student_id: string;
  amount: number;
  source: StudentCreditBalanceSource;
  source_event_id: string | null;
  is_consumed: boolean;
  consumed_against_bill_id: string | null;
  consumed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}
```

- [ ] **Step 2: Verify per-file**: `npx tsc --noEmit --skipLibCheck types/admission.ts`.

- [ ] **Step 3: Commit** referencing Plan Task 8.

---

# PHASE B — Service layer

## Task 9: `fee-change-event-service.ts`

**Files:**
- Create: `lib/services/admission/fee-change-event-service.ts`

- [ ] **Step 1: Write the service**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AdmissionFeeChangeEvent,
  AdmissionFeeChangeEventWithLines,
  ApproveFeeChangeEventDecisionInput,
  ApproveFeeChangeEventResult,
} from '@/types/admission';
import { logActivityForCurrentUser, AdmissionFeesActivityTemplates } from '@/lib/utils/activity-logger-client';

export class FeeChangeEventService {
  static async listPending(institutionId?: string): Promise<AdmissionFeeChangeEvent[]> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('admission_fee_change_events')
      .select('*, learner:learners_profiles!inner(institution_id)')
      .eq('status', 'pending_review')
      .order('requested_at', { ascending: false });
    if (institutionId) {
      query = query.eq('learner.institution_id', institutionId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as AdmissionFeeChangeEvent[];
  }

  static async getWithLines(eventId: string): Promise<AdmissionFeeChangeEventWithLines | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_change_events')
      .select('*, lines:admission_fee_change_event_lines(*)')
      .eq('id', eventId)
      .maybeSingle();
    if (error) throw error;
    return (data as AdmissionFeeChangeEventWithLines | null) ?? null;
  }

  static async approve(
    eventId: string,
    decisions: ApproveFeeChangeEventDecisionInput[],
    refundExcess = false,
  ): Promise<ApproveFeeChangeEventResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('admission_approve_fee_change_event', {
      p_event_id: eventId,
      p_line_decisions: decisions,
      p_refund_excess: refundExcess,
    });
    if (error) throw error;
    const result = data as ApproveFeeChangeEventResult;

    // Activity log from caller's session (canonical object form)
    await logActivityForCurrentUser({
      actionType: 'fee_change_event.approved',
      resourceType: 'fee_change_event',
      resourceId: eventId,
      description: AdmissionFeesActivityTemplates.fee_change_event.approved(result.summary.new_bills, result.summary.superseded_bills),
      metadata: { event_id: eventId, summary: result.summary },
    });

    return result;
  }

  static async reject(eventId: string, notes: string): Promise<AdmissionFeeChangeEvent> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_fee_change_events')
      .update({
        status: 'rejected',
        reason_notes: notes,
        decided_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .select('*')
      .single();
    if (error) throw error;

    await logActivityForCurrentUser({
      actionType: 'fee_change_event.rejected',
      resourceType: 'fee_change_event',
      resourceId: eventId,
      description: AdmissionFeesActivityTemplates.fee_change_event.rejected(notes),
      metadata: { event_id: eventId, reason: notes },
    });

    return data;
  }

  /** Used by OnboardingService.markAsApproved as a precondition check. */
  static async hasPendingForLearner(learnerId: string): Promise<boolean> {
    const supabase = createClientSupabaseClient();
    const { count, error } = await supabase
      .from('admission_fee_change_events')
      .select('id', { count: 'exact', head: true })
      .eq('learner_id', learnerId)
      .eq('status', 'pending_review');
    if (error) throw error;
    return (count ?? 0) > 0;
  }
}
```

- [ ] **Step 2: Append the new templates** to `lib/utils/admission-fees-activity-templates.ts`:

```typescript
fee_change_event: {
  approved: (newBills: number, supersededBills: number) =>
    `Fee change approved — ${newBills} new bill${newBills !== 1 ? 's' : ''}, ${supersededBills} superseded`,
  rejected: (reason: string) => `Fee change rejected: ${reason}`,
},
bill: {
  // existing auto_generated branch stays
  auto_generated: (count: number) =>
    `Auto-generated ${count} bill${count !== 1 ? 's' : ''} via account transition`,
  superseded: (count: number) => `Superseded ${count} bill${count !== 1 ? 's' : ''}`,
},
receipt_item: {
  reallocated: (count: number) => `Reallocated ${count} payment${count !== 1 ? 's' : ''} to replacement bills`,
},
student_credit_balance: {
  created:  (amount: number, source: string) => `Credit balance: ₹${amount.toLocaleString()} (${source})`,
  consumed: (amount: number, billDescription: string) => `Credit consumed: ₹${amount.toLocaleString()} against "${billDescription}"`,
},
```

- [ ] **Step 3: Verify per-file syntax** for both files.

- [ ] **Step 4: Commit** as one commit referencing Spec §8.1 + Plan Task 9.

---

## Task 10: `student-credit-balance-service.ts`

**Files:**
- Create: `lib/services/billing/student-credit-balance-service.ts`

For v1: list-only. Consumption against future bills is v1.5.

- [ ] **Step 1: Write the service**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { StudentCreditBalance } from '@/types/admission';

export class StudentCreditBalanceService {
  static async listForStudent(studentId: string, includeConsumed = false): Promise<StudentCreditBalance[]> {
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('student_credit_balances')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (!includeConsumed) query = query.eq('is_consumed', false);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  static async getUnconsumedTotal(studentId: string): Promise<number> {
    const balances = await this.listForStudent(studentId, false);
    return balances.reduce((sum, b) => sum + Number(b.amount), 0);
  }
}
```

- [ ] **Step 2: Verify per-file syntax.**

- [ ] **Step 3: Commit** referencing Plan Task 10.

---

## Task 11: Wire `OnboardingService.markAsApproved` precondition

**Files:**
- Modify: `lib/services/billing/onboarding/onboarding-service.ts`

The activation gate (`account → active`) must block when a `pending_review` event exists.

- [ ] **Step 1: Read current `markAsApproved`** to identify the right place to inject the check (likely at the top before the `balance_amount = 0` validation).

- [ ] **Step 2: Add the precondition**

```typescript
// At top of markAsApproved, after the lifecycle_status='account' validation:
import { FeeChangeEventService } from '@/lib/services/admission/fee-change-event-service';
// ...
const hasPending = await FeeChangeEventService.hasPendingForLearner(learnerId);
if (hasPending) {
  throw new Error('Cannot activate: a pending fee-change event must be resolved first');
}
```

- [ ] **Step 3: Verify per-file syntax.**

- [ ] **Step 4: Commit** referencing Plan Task 11.

---

# PHASE C — UI

## Task 12: Notification bell + events panel

**Files:**
- Create: `app/(routes)/billing/onboarding/_components/_change-events/notification-bell.tsx`
- Create: `app/(routes)/billing/onboarding/_components/_change-events/events-panel.tsx`

`notification-bell.tsx`: A small button with a bell icon + count badge (red when count > 0). On click, opens `events-panel.tsx` as a side sheet or popover. Re-fetches every 30s via `setInterval` (v1; v1.5 could use Supabase realtime).

`events-panel.tsx`: List of pending `AdmissionFeeChangeEvent` rows for the current institution. Each row is a button — click opens `<EventReviewDialog>`. Shows: learner name (lookup via separate query), trigger_field label, requested_at relative time, "Review" CTA.

- [ ] **Step 1: Write `notification-bell.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FeeChangeEventService } from '@/lib/services/admission/fee-change-event-service';
import { EventsPanel } from './events-panel';

interface Props { institutionId?: string; }

export function FeeChangeEventNotificationBell({ institutionId }: Props) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const refresh = async () => {
      try {
        const events = await FeeChangeEventService.listPending(institutionId);
        setCount(events.length);
      } catch { /* ignore — toast spam not desired here */ }
    };
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [institutionId]);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="relative">
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </Button>
      <EventsPanel open={open} onOpenChange={setOpen} institutionId={institutionId} />
    </>
  );
}
```

- [ ] **Step 2: Write `events-panel.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FeeChangeEventService } from '@/lib/services/admission/fee-change-event-service';
import type { AdmissionFeeChangeEvent } from '@/types/admission';
import { EventReviewDialog } from './event-review-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId?: string;
}

export function EventsPanel({ open, onOpenChange, institutionId }: Props) {
  const [events, setEvents] = useState<AdmissionFeeChangeEvent[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    FeeChangeEventService.listPending(institutionId).then(setEvents);
  }, [open, institutionId]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader><SheetTitle>Pending Fee Change Events</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-2">
            {events.length === 0 && <p className="text-sm text-muted-foreground">No pending events.</p>}
            {events.map((e) => (
              <button
                key={e.id}
                className="block w-full rounded border p-3 text-left hover:bg-muted"
                onClick={() => setReviewing(e.id)}
              >
                <div className="text-sm font-medium">Learner {e.learner_id.slice(0, 8)}…</div>
                <div className="text-xs text-muted-foreground">
                  Trigger: {e.trigger_field} • Requested {new Date(e.requested_at).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      {reviewing && (
        <EventReviewDialog
          eventId={reviewing}
          onOpenChange={(o) => { if (!o) { setReviewing(null); FeeChangeEventService.listPending(institutionId).then(setEvents); } }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Verify per-file syntax.**

- [ ] **Step 4: Commit** as one commit referencing Spec §9.5 + Plan Task 12.

---

## Task 13: Per-event delta review modal + line decision row

**Files:**
- Create: `app/(routes)/billing/onboarding/_components/_change-events/event-review-dialog.tsx`
- Create: `app/(routes)/billing/onboarding/_components/_change-events/event-line-decision-row.tsx`

The delta review modal is the heart of the UX. Shows side-by-side old vs new amounts per category, a decision dropdown per line, an optional "Refund excess on approval" toggle, Approve / Reject buttons.

- [ ] **Step 1: Write `event-line-decision-row.tsx`**

```tsx
'use client';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { AdmissionFeeChangeEventLine, AdmissionFeeChangeEventLineDecision } from '@/types/admission';

interface Props {
  line: AdmissionFeeChangeEventLine;
  categoryName: string;
  decision: AdmissionFeeChangeEventLineDecision | null;
  notes: string;
  onDecisionChange: (decision: AdmissionFeeChangeEventLineDecision) => void;
  onNotesChange: (notes: string) => void;
}

const DECISION_OPTIONS: { value: AdmissionFeeChangeEventLineDecision; label: string }[] = [
  { value: 'apply_supplemental', label: 'Apply supplemental bill' },
  { value: 'issue_credit_note',  label: 'Issue credit note' },
  { value: 'refund_payment',     label: 'Refund payment' },
  { value: 'reallocate_payment', label: 'Reallocate payment to new bill' },
  { value: 'waive_delta',        label: 'Waive delta' },
  { value: 'do_nothing',         label: 'Do nothing' },
];

export function EventLineDecisionRow(props: Props) {
  const { line, categoryName, decision, notes, onDecisionChange, onNotesChange } = props;
  const delta = (Number(line.new_amount ?? 0) - Number(line.old_amount ?? 0));
  return (
    <tr className="border-b">
      <td className="py-2 pr-2">{categoryName}</td>
      <td className="py-2 pr-2 text-right">{line.old_amount != null ? `₹${Number(line.old_amount).toLocaleString()}` : '—'}</td>
      <td className="py-2 pr-2 text-right">₹{Number(line.paid_amount_so_far).toLocaleString()}</td>
      <td className="py-2 pr-2 text-right">{line.new_amount != null ? `₹${Number(line.new_amount).toLocaleString()}` : '—'}</td>
      <td className={`py-2 pr-2 text-right ${delta > 0 ? 'text-amber-600' : delta < 0 ? 'text-emerald-600' : ''}`}>
        {delta > 0 ? '+' : ''}₹{Math.abs(delta).toLocaleString()}
      </td>
      <td className="py-2 pr-2">
        <Select value={decision ?? undefined} onValueChange={(v) => onDecisionChange(v as AdmissionFeeChangeEventLineDecision)}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Pick decision" /></SelectTrigger>
          <SelectContent>
            {DECISION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="py-2">
        <Input
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: Write `event-review-dialog.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import toast from 'react-hot-toast';
import { FeeChangeEventService } from '@/lib/services/admission/fee-change-event-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import type {
  AdmissionFeeChangeEventWithLines,
  AdmissionFeeChangeEventLineDecision,
} from '@/types/admission';
import { EventLineDecisionRow } from './event-line-decision-row';

interface Props {
  eventId: string;
  onOpenChange: (open: boolean) => void;
}

export function EventReviewDialog({ eventId, onOpenChange }: Props) {
  const [event, setEvent] = useState<AdmissionFeeChangeEventWithLines | null>(null);
  const [categoryNames, setCategoryNames] = useState<Map<string, string>>(new Map());
  const [decisions, setDecisions] = useState<Record<string, AdmissionFeeChangeEventLineDecision>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [refundExcess, setRefundExcess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    FeeChangeEventService.getWithLines(eventId).then(setEvent);
    BillingCategoryService.getActiveBillingCategories().then((cats) => {
      const m = new Map<string, string>();
      cats.forEach((c) => m.set(c.id, c.category_name));
      setCategoryNames(m);
    });
  }, [eventId]);

  const allDecided = !!event && event.lines.every((l) => decisions[l.billing_category_id]);

  const handleApprove = async () => {
    if (!event) return;
    setSubmitting(true);
    try {
      const decisionInputs = event.lines.map((l) => ({
        billing_category_id: l.billing_category_id,
        decision: decisions[l.billing_category_id],
        decision_notes: notes[l.billing_category_id],
      }));
      const res = await FeeChangeEventService.approve(event.id, decisionInputs, refundExcess);
      toast.success(
        `Approved — ${res.summary.new_bills} new bills, ${res.summary.superseded_bills} superseded, ${res.summary.credit_balances} credit balances`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!event || !rejectReason.trim()) return;
    setSubmitting(true);
    try {
      await FeeChangeEventService.reject(event.id, rejectReason);
      toast.success('Event rejected');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Fee Change Review</DialogTitle>
        </DialogHeader>
        {!event && <p>Loading…</p>}
        {event && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Trigger: {event.trigger_field} • Requested {new Date(event.requested_at).toLocaleString()}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th>Category</th>
                  <th className="text-right">Old</th>
                  <th className="text-right">Paid so far</th>
                  <th className="text-right">New</th>
                  <th className="text-right">Δ</th>
                  <th>Decision</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {event.lines.map((l) => (
                  <EventLineDecisionRow
                    key={l.id}
                    line={l}
                    categoryName={categoryNames.get(l.billing_category_id) ?? l.billing_category_id}
                    decision={decisions[l.billing_category_id] ?? null}
                    notes={notes[l.billing_category_id] ?? ''}
                    onDecisionChange={(d) => setDecisions((s) => ({ ...s, [l.billing_category_id]: d }))}
                    onNotesChange={(n) => setNotes((s) => ({ ...s, [l.billing_category_id]: n }))}
                  />
                ))}
              </tbody>
            </table>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={refundExcess} onCheckedChange={(c) => setRefundExcess(!!c)} />
              Refund excess instead of holding as credit balance
            </label>
            {rejecting && (
              <Textarea
                placeholder="Reason for rejection (required)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            )}
          </div>
        )}
        <DialogFooter>
          {!rejecting && (
            <>
              <Button variant="ghost" onClick={() => setRejecting(true)} disabled={submitting}>Reject…</Button>
              <Button onClick={handleApprove} disabled={!allDecided || submitting}>
                {submitting ? 'Approving…' : 'Approve'}
              </Button>
            </>
          )}
          {rejecting && (
            <>
              <Button variant="ghost" onClick={() => setRejecting(false)} disabled={submitting}>Back</Button>
              <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim() || submitting}>
                {submitting ? 'Rejecting…' : 'Confirm Reject'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Verify per-file syntax** for both files.

- [ ] **Step 4: Commit** as one commit referencing Spec §9.5 + Plan Task 13.

---

## Task 14: Wire notification bell into billing/onboarding header

**Files:**
- Modify: `app/(routes)/billing/onboarding/page.tsx` (or its header component)

- [ ] **Step 1: Read** the current `app/(routes)/billing/onboarding/page.tsx` to find where the page header lives. The bell goes in the header next to filters / action buttons.

- [ ] **Step 2: Inject the bell**:

```tsx
import { FeeChangeEventNotificationBell } from './_components/_change-events/notification-bell';
// ... in the header JSX:
<FeeChangeEventNotificationBell institutionId={selectedInstitutionId /* or undefined for cross-institution view */} />
```

- [ ] **Step 3: Verify per-file syntax.**

- [ ] **Step 4: Commit** referencing Plan Task 14.

---

# PHASE D — Final integration

## Task 15: Final smoke + roadmap update + push

- [ ] **Step 1: End-to-end smoke (read-only)**:
1. `git log --oneline -20` shows ~14-15 Plan 5 commits
2. SQL: trigger exists on learners_profiles (`SELECT tgname FROM pg_trigger WHERE tgname='trg_detect_fee_dimension_change'`)
3. SQL: RPC exists (`SELECT proname FROM pg_proc WHERE proname='admission_approve_fee_change_event'`)
4. SQL: 3 new tables present (events, event_lines, credit_balances)
5. SQL: bill `superseded` value accepted: `SELECT 'superseded'::text IN (SELECT consrc::text FROM pg_constraint WHERE conrelid='public.billing_student_bills'::regclass AND contype='c')` (or check via `pg_get_constraintdef`)
6. The notification-bell is rendered on `/billing/onboarding` (visual smoke if dev server up; otherwise grep page.tsx for the import)

- [ ] **Step 2: Mark Plan 5 ✅ in roadmap** with retrospective covering: trigger semantics (skip when legacy_fee_mode, skip when no bills, one event at a time), RPC decision-tree behavior, supersede-not-delete invariant verified, lifecycle freeze gate, v1.5 deferrals (credit balance consumption flow, refund automation).

- [ ] **Step 3: Commit + push.**

---

## Plan-5 Spec Coverage Self-Review

| Spec section | Addressed by |
|---|---|
| §6.4 fee_change_events + lines DDL | Task 1 |
| §6.5 bill superseded state + receipt_items.allocation_reason | Task 3 |
| §6.6 student_credit_balances DDL | Task 2 |
| §8.3.2 admission_approve_fee_change_event RPC | Task 7 |
| §8.4 trigger detecting matrix-dim changes | Task 6 |
| §8.1 fee-change-event-service.ts | Task 9 |
| §8.1 student-credit-balance-service.ts | Task 10 |
| §8.1 lifecycle freeze in markAsApproved | Task 11 |
| §9.5 review surface (bell + panel + dialog) | Tasks 12, 13, 14 |
| §10.1 admission_fees.approve_change_event permission | Task 4 |
| §10.2 RLS for events, lines, credit_balances | Task 5 |
| §11 activity events (fee_change_event.*, bill.superseded, receipt_item.reallocated, student_credit_balance.*) | Task 9 |

**Not in this plan (deferred to Plan 6):**
- Per-institution feature flag enforcement (the trigger fires regardless today; Plan 6 adds the flag check)
- Cutover sequencing + adoption banner refinement
- Final integration tests across the entire flow

---

## Open Items / Risks

- **Trigger over-firing**: the trigger checks `legacy_fee_mode`, `EXISTS bills`, and `EXISTS pending_event` to avoid noise. But if multiple matrix dims change in a single UPDATE statement, only the first detected field is recorded as `trigger_field` (the others are still captured via OLD/NEW snapshots). Acceptable v1.
- **RPC complexity**: ~200 lines of plpgsql. Test coverage in Plan 6.
- **`reallocate_payment` decision when `v_old_bill_id IS NULL`**: the RPC silently no-ops (no bill to supersede). UI should warn the operator if they pick this decision for a category that has no prior bill — v1 allows it (degenerate case).
- **`p_refund_excess` flag** marks credit_balances with refund-pending notes; does NOT auto-issue refunds (refund flow is manual via existing `billing_refunds` UI). v1.5 could automate.
- **Trigger doesn't run for service-side direct updates** if the service uses RPC that bypasses RLS. The trigger fires on ALL UPDATEs to learners_profiles regardless of who issued them. Verified via the no-WHERE-on-auth check above.
- **Recursive trigger guard**: the trigger calls `auth.uid()` and writes to event tables. It does NOT update `learners_profiles` so no recursion is possible.
- **Activity log on trigger context**: Postgres trigger context can write activity logs too (insert directly into `user_activity_logs`), but for Plan 5 we keep activity logs at the service layer for consistency with Plans 3+4.
- **`pre-existing` Supabase generated types stale across Plans 1-5**: the running theme. Run `npx supabase gen types typescript --linked > types/supabase.ts` before Plan 6 cutover to clean up.
