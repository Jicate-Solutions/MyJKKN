-- =============================================================================
-- 20260821180000_fee_structure_item_schedules.sql
--
-- PHASE 1 of "Fee Structure — per-item due dates, split thresholds & status
-- rules" (docs/plans/2026-08-21-fee-structure-dynamic-schedules-plan.md).
--
-- SCHEMA ONLY. Nothing in this file changes the behaviour of a single existing
-- row: every column added defaults to today's semantics, the new table starts
-- empty, and no function or trigger that generates bills is touched here.
-- Phases 2-4 wire the generation and promotion engines to what this declares.
--
-- WHAT THE MODULE COULD NOT EXPRESS BEFORE
-- ----------------------------------------
-- admission_fee_structure_items held only (category, amount, is_optional,
-- sort_order, applies_to, applies_year_of_study). A due date existed nowhere in
-- the fee structure module at all — both bill-generation paths hardcoded
-- `now() + 30 days`:
--     admission_account_transition_with_bills   v_due_date := (now() + interval '30 days')
--     onboarding-service.ts:411                 dueDate.setDate(dueDate.getDate() + 30)
-- and the fee-paid threshold that drives account -> reserved -> admitted was a
-- single pooled percentage over the learner's whole bill book, with no way to
-- say "30% of Tuition specifically".
--
-- THREE THINGS THIS DECLARES
--   1. A due date per fee item — offset from an anchor, or an absolute date.
--      This alone fixes the static due date, WITHOUT any splitting.
--   2. An optional split of one item into ordered instalments, each with its
--      own size and its own due date.
--   3. Per-instalment `promotes_to_status_code`: settling THAT instalment
--      promotes the learner to that lifecycle status.
--
-- WHY THE COLUMNS MIRROR billing_instalment_plan_lines
-- -----------------------------------------------------
-- The split ARITHMETIC already exists and is live:
-- billing_instalment_split_for_learner (20260825013000) is consumed by BOTH
-- generation paths precisely so a learner's schedule cannot differ by path.
-- Its plan lines size by `share_percent XOR fixed_amount` and date by
-- `due_date XOR due_offset_days`, with the LAST line absorbing rounding. This
-- table repeats that shape column for column so phase 2 can extend the one
-- engine with a second config source rather than fork a second engine. The
-- legacy programme-grain plans stay in place as a dormant fallback (decision
-- D2); the item schedule wins where both match.
--
-- PERMISSIONS: deliberately NO new keys. The schedule is a child of a fee
-- structure item, so it inherits admission_fees.read / admission_fees.manage
-- through the same nested-EXISTS policy shape the items table already uses.
-- Those two keys are already granted to 7 roles (Administrator, Admission
-- Officer, Admission Staff, ...), so this ships reachable rather than
-- declaring a key no role holds — the silent-empty-page trap.
--
-- NO BEGIN/COMMIT: the apply path wraps this file in one transaction, and an
-- inner COMMIT would defeat a BEGIN..ROLLBACK rehearsal.
-- =============================================================================

-- §0 GUARD — refuse to run twice, or against a database this file misreads.
DO $guard$
BEGIN
  IF to_regclass('public.admission_fee_structure_items') IS NULL THEN
    RAISE EXCEPTION 'REFUSING: admission_fee_structure_items missing — wrong database?';
  END IF;
  IF to_regclass('public.billing_student_bills') IS NULL THEN
    RAISE EXCEPTION 'REFUSING: billing_student_bills missing — wrong database?';
  END IF;
  IF to_regclass('public.admission_fee_structure_item_schedules') IS NOT NULL THEN
    RAISE EXCEPTION 'REFUSING: admission_fee_structure_item_schedules already exists — this migration already ran.';
  END IF;
END
$guard$;

-- =============================================================================
-- §1 Structure-level default due offset
-- =============================================================================
-- The fallback when an item names no due date of its own. DEFAULT 30 reproduces
-- the hardcoded `now() + 30 days` exactly, so all 236 existing structures keep
-- emitting the due dates they emit today until somebody edits one.

ALTER TABLE public.admission_fee_structures
  ADD COLUMN default_due_offset_days integer NOT NULL DEFAULT 30
    CONSTRAINT chk_afs_default_due_offset CHECK (default_due_offset_days >= 0);

COMMENT ON COLUMN public.admission_fee_structures.default_due_offset_days IS
  'Days after the bill-generation date that an item with no due date of its own falls due. DEFAULT 30 reproduces the previously hardcoded +30 days in both generation paths.';

-- =============================================================================
-- §2 Per-item due date + split opt-in
-- =============================================================================
-- schedule_mode = 'single' (the default on all 946 existing rows) is today's
-- behaviour: one bill for the item. 'split' hands the item to the schedule
-- lines in §3.
--
-- due_anchor is an ITEM-level concept, inherited by every line of that item —
-- a line chooses offset-vs-absolute, the item says what an offset counts from.
-- Keeping one anchor per item avoids a per-line anchor that could disagree
-- between instalments of the same fee.

ALTER TABLE public.admission_fee_structure_items
  ADD COLUMN schedule_mode   text NOT NULL DEFAULT 'single'
    CONSTRAINT chk_afsi_schedule_mode CHECK (schedule_mode IN ('single','split')),
  ADD COLUMN due_anchor      text NOT NULL DEFAULT 'generation_date'
    CONSTRAINT chk_afsi_due_anchor
    CHECK (due_anchor IN ('generation_date','academic_year_start','fixed_date')),
  ADD COLUMN due_offset_days integer
    CONSTRAINT chk_afsi_due_offset CHECK (due_offset_days >= 0),
  ADD COLUMN due_date        date;

-- A 'fixed_date' anchor on a SINGLE item must actually carry the date. A split
-- item's dates live on its lines, so the item-level date is not required there.
ALTER TABLE public.admission_fee_structure_items
  ADD CONSTRAINT chk_afsi_fixed_date_present
  CHECK (due_anchor <> 'fixed_date' OR schedule_mode = 'split' OR due_date IS NOT NULL);

COMMENT ON COLUMN public.admission_fee_structure_items.schedule_mode IS
  'single = one bill for this item (default, today''s behaviour). split = expand into the ordered instalments in admission_fee_structure_item_schedules.';
COMMENT ON COLUMN public.admission_fee_structure_items.due_anchor IS
  'What a due_offset_days counts from, for this item and every schedule line under it: generation_date (the account-transition date), academic_year_start (academic_years.start_date), or fixed_date (use the absolute due_date instead).';
COMMENT ON COLUMN public.admission_fee_structure_items.due_offset_days IS
  'Days after due_anchor this item falls due. NULL falls back to admission_fee_structures.default_due_offset_days. Ignored when schedule_mode = ''split'' (the lines own their dates).';
COMMENT ON COLUMN public.admission_fee_structure_items.due_date IS
  'Absolute due date, used when due_anchor = ''fixed_date''. Ignored when schedule_mode = ''split''.';

-- =============================================================================
-- §3 The schedule lines — ordered instalments of ONE fee item
-- =============================================================================

CREATE TABLE public.admission_fee_structure_item_schedules (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_structure_item_id   uuid NOT NULL
    REFERENCES public.admission_fee_structure_items(id) ON DELETE CASCADE,
  sequence_no             integer NOT NULL CHECK (sequence_no >= 1),

  -- Size: exactly one of the two, mirroring billing_instalment_plan_lines.
  share_percent           numeric(7,4) CHECK (share_percent > 0 AND share_percent <= 100),
  fixed_amount            numeric(12,2) CHECK (fixed_amount > 0),

  -- Date: exactly one. An offset counts from the parent item's due_anchor.
  due_offset_days         integer CHECK (due_offset_days >= 0),
  due_date                date,

  -- The status rule (decision D1). NULL = this instalment promotes nobody.
  -- Validated by trg_afsis_validate_status below, not by an FK:
  -- admission_statuses has no unique constraint on `code` to point at.
  promotes_to_status_code text,

  label                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_afsis_amount_exactly_one
    CHECK ((share_percent IS NULL) <> (fixed_amount IS NULL)),
  CONSTRAINT chk_afsis_due_exactly_one
    CHECK ((due_offset_days IS NULL) <> (due_date IS NULL)),
  CONSTRAINT uq_afsis_item_sequence UNIQUE (fee_structure_item_id, sequence_no)
);

CREATE INDEX ix_afsis_item ON public.admission_fee_structure_item_schedules
  (fee_structure_item_id, sequence_no);

COMMENT ON TABLE public.admission_fee_structure_item_schedules IS
  'Ordered instalments of one admission_fee_structure_items row. Size by exactly one of share_percent / fixed_amount; date by exactly one of due_offset_days (from the parent item''s due_anchor) / due_date. The LAST instalment absorbs rounding — the split engine sizes it as the item total minus the sum of the earlier instalments — so instalments sum EXACTLY to the item amount. promotes_to_status_code names the lifecycle status a learner reaches when THAT instalment is settled.';
COMMENT ON COLUMN public.admission_fee_structure_item_schedules.promotes_to_status_code IS
  'admission_statuses.code (scope=learner) the learner is promoted to once this instalment''s bill is settled. NULL = no rule. Statuses with gates_login = true (i.e. active) are rejected: granting a portal login stays a human decision (decision D3).';

DROP TRIGGER IF EXISTS trg_afsis_touch ON public.admission_fee_structure_item_schedules;
CREATE TRIGGER trg_afsis_touch
  BEFORE UPDATE ON public.admission_fee_structure_item_schedules
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- =============================================================================
-- §4 Status-target validation (decision D3)
-- =============================================================================
-- Row-level and immediate: a bad status code is a typo in the authoring UI, and
-- the author should hear about it on save, not at commit.

CREATE OR REPLACE FUNCTION public.afsis_validate_status_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gates_login boolean;
BEGIN
  IF NEW.promotes_to_status_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.gates_login INTO v_gates_login
  FROM public.admission_statuses s
  WHERE s.scope = 'learner'
    AND s.code  = NEW.promotes_to_status_code
    AND s.is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'promotes_to_status_code "%" is not an active learner-scope admission status.',
      NEW.promotes_to_status_code
      USING ERRCODE = 'FS001';
  END IF;

  -- D3: item rules may reach reserved / admitted, never a login-granting status.
  -- This mirrors the `gates_login = false` filter the promotion engine has always
  -- applied to the global ladder, so the rule surface cannot outrun it.
  IF v_gates_login THEN
    RAISE EXCEPTION
      'Status "%" grants portal login and cannot be reached automatically from a fee schedule.',
      NEW.promotes_to_status_code
      USING ERRCODE = 'FS001',
            HINT    = 'Promotion into a login-granting status stays a manual decision.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_afsis_validate_status
  ON public.admission_fee_structure_item_schedules;
CREATE TRIGGER trg_afsis_validate_status
  BEFORE INSERT OR UPDATE OF promotes_to_status_code
  ON public.admission_fee_structure_item_schedules
  FOR EACH ROW EXECUTE FUNCTION public.afsis_validate_status_target();

-- =============================================================================
-- §5 Schedule shape validation — DEFERRED
-- =============================================================================
-- Must be a DEFERRABLE INITIALLY DEFERRED constraint trigger: the authoring UI
-- writes a whole schedule as one batch, and an immediate check would reject
-- line 1 of a 30/30/40 split for summing to 30.
--
-- Checked at commit, for any item touched:
--   · at least 2 lines (a 1-line "split" is just a single bill with extra steps)
--   · sequence_no contiguous from 1 (the engine orders by it and the UI
--     renders n/N from it — a gap silently mislabels every later instalment)
--   · if EVERY line sizes by percent, the percents sum to exactly 100
-- A mixed percent/fixed schedule skips the sum check: the last line absorbs
-- whatever remains, which is the whole point of the last-absorbs rule.

CREATE OR REPLACE FUNCTION public.afsis_validate_schedule_shape()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- NOT COALESCE(NEW.…, OLD.…): in a PL/pgSQL DELETE trigger NEW is unassigned,
  -- and touching NEW.anything raises "record new is not assigned yet" before
  -- COALESCE ever sees a value. Branch on TG_OP instead.
  v_item_id      uuid;
  v_count        integer;
  v_max_seq      integer;
  v_all_percent  boolean;
  v_percent_sum  numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_item_id := OLD.fee_structure_item_id;
  ELSE
    v_item_id := NEW.fee_structure_item_id;
  END IF;

  SELECT count(*), max(sequence_no),
         bool_and(share_percent IS NOT NULL),
         COALESCE(sum(share_percent), 0)
    INTO v_count, v_max_seq, v_all_percent, v_percent_sum
  FROM public.admission_fee_structure_item_schedules
  WHERE fee_structure_item_id = v_item_id;

  -- Deleting the last line is how you turn a split back into a single bill.
  IF v_count = 0 THEN
    RETURN NULL;
  END IF;

  IF v_count < 2 THEN
    RAISE EXCEPTION
      'A split fee item needs at least 2 instalments (item % has %).', v_item_id, v_count
      USING ERRCODE = 'FS002';
  END IF;

  IF v_max_seq <> v_count THEN
    RAISE EXCEPTION
      'Instalment numbers for item % must run 1..% with no gaps (highest is %).',
      v_item_id, v_count, v_max_seq
      USING ERRCODE = 'FS002';
  END IF;

  IF v_all_percent AND round(v_percent_sum, 4) <> 100 THEN
    RAISE EXCEPTION
      'Instalment percentages for item % must total 100%% (they total %).',
      v_item_id, round(v_percent_sum, 4)
      USING ERRCODE = 'FS002';
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_afsis_validate_shape
  ON public.admission_fee_structure_item_schedules;
CREATE CONSTRAINT TRIGGER trg_afsis_validate_shape
  AFTER INSERT OR UPDATE OR DELETE
  ON public.admission_fee_structure_item_schedules
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.afsis_validate_schedule_shape();

-- =============================================================================
-- §6 RLS — inherited from the parent fee structure, item policies mirrored
-- =============================================================================
-- Same nested-EXISTS shape as fee_structure_items_read/_write, one level
-- deeper. Different tables in the subquery, so no same-table RLS recursion.

ALTER TABLE public.admission_fee_structure_item_schedules ENABLE ROW LEVEL SECURITY;

-- Supabase default privileges hand anon (holder of the publishable key embedded
-- in every bundle) ALL on a new table. Revoke before anything else.
REVOKE ALL ON TABLE public.admission_fee_structure_item_schedules FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.admission_fee_structure_item_schedules TO authenticated;
GRANT ALL ON TABLE public.admission_fee_structure_item_schedules TO service_role;

CREATE POLICY "fee_structure_item_schedules_read"
ON public.admission_fee_structure_item_schedules
FOR SELECT USING (
  EXISTS (
    SELECT 1
      FROM public.admission_fee_structure_items fsi
      JOIN public.admission_fee_structures fs ON fs.id = fsi.fee_structure_id
     WHERE fsi.id = admission_fee_structure_item_schedules.fee_structure_item_id
       AND (SELECT public.user_has_permission('admission_fees.read'))
       AND public.role_has_institution_access(fs.institution_id)
  )
);

CREATE POLICY "fee_structure_item_schedules_write"
ON public.admission_fee_structure_item_schedules
FOR ALL USING (
  EXISTS (
    SELECT 1
      FROM public.admission_fee_structure_items fsi
      JOIN public.admission_fee_structures fs ON fs.id = fsi.fee_structure_id
     WHERE fsi.id = admission_fee_structure_item_schedules.fee_structure_item_id
       AND (SELECT public.user_has_permission('admission_fees.manage'))
       AND public.role_has_institution_access(fs.institution_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
      FROM public.admission_fee_structure_items fsi
      JOIN public.admission_fee_structures fs ON fs.id = fsi.fee_structure_id
     WHERE fsi.id = admission_fee_structure_item_schedules.fee_structure_item_id
       AND (SELECT public.user_has_permission('admission_fees.manage'))
       AND public.role_has_institution_access(fs.institution_id)
  )
);

-- =============================================================================
-- §7 Instalment identity on the bill
-- =============================================================================
-- Today a split bill announces itself only inside bill_description, as the text
-- " — Instalment 1/3". That is unqueryable, unsortable, and — load-bearing for
-- phase 2 — gives the once-per-learner trigger no way to tell three instalments
-- of ONE tuition fee from three duplicate tuition bills.
--
-- instalment_group_id is that missing identity: one uuid per split fee item per
-- learner, shared by its instalments. Phase 2 teaches
-- billing_enforce_once_per_learner to treat one group as one logical bill,
-- which is what unblocks splitting 1 Year Tuition Fee / Application Fee /
-- University Fee / Uniform Fee — all four carry once_per_learner = true.
--
-- fee_structure_item_id is the other half: it is how the promotion engine in
-- phase 4 walks a paid bill back to the schedule line that names a status.

ALTER TABLE public.billing_student_bills
  ADD COLUMN instalment_group_id   uuid,
  ADD COLUMN instalment_no         smallint
    CONSTRAINT chk_bsb_instalment_no CHECK (instalment_no IS NULL OR instalment_no >= 1),
  ADD COLUMN instalment_count      smallint
    CONSTRAINT chk_bsb_instalment_count CHECK (instalment_count IS NULL OR instalment_count >= 2),
  ADD COLUMN fee_structure_item_id uuid
    REFERENCES public.admission_fee_structure_items(id) ON DELETE SET NULL;

-- All three instalment columns travel together or not at all.
ALTER TABLE public.billing_student_bills
  ADD CONSTRAINT chk_bsb_instalment_triplet
  CHECK (
    (instalment_group_id IS NULL AND instalment_no IS NULL AND instalment_count IS NULL)
    OR
    (instalment_group_id IS NOT NULL AND instalment_no IS NOT NULL
     AND instalment_count IS NOT NULL AND instalment_no <= instalment_count)
  );

-- Partial: 19,139 existing bills carry NULL here and stay out of the index.
CREATE INDEX ix_bsb_instalment_group
  ON public.billing_student_bills (instalment_group_id, instalment_no)
  WHERE instalment_group_id IS NOT NULL;

-- The promotion engine's lookup in phase 4: "bills of this learner that came
-- from a scheduled fee item".
CREATE INDEX ix_bsb_fee_structure_item
  ON public.billing_student_bills (student_id, fee_structure_item_id)
  WHERE fee_structure_item_id IS NOT NULL;

COMMENT ON COLUMN public.billing_student_bills.instalment_group_id IS
  'Shared by every instalment bill of ONE split fee item for ONE learner. NULL for an unsplit bill. billing_enforce_once_per_learner treats a group as one logical bill, so a once_per_learner category can still be split while a genuinely duplicate second bill is still rejected.';
COMMENT ON COLUMN public.billing_student_bills.instalment_no IS
  'Position within instalment_group_id, 1-based. Replaces parsing " — Instalment 1/3" out of bill_description.';
COMMENT ON COLUMN public.billing_student_bills.instalment_count IS
  'Total instalments in this bill''s group, denormalised so a single row renders "2/3" without a second query.';
COMMENT ON COLUMN public.billing_student_bills.fee_structure_item_id IS
  'The admission_fee_structure_items row this bill was generated from, when it came from a fee structure. Lets the promotion engine walk a settled bill back to the schedule line that names a lifecycle status. ON DELETE SET NULL: deleting a structure item must never delete billing history.';
