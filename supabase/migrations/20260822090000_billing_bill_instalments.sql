-- =============================================================================
-- 20260822090000_billing_bill_instalments.sql
--
-- PHASE 1 of "One bill per fee, with an instalment schedule inside it"
-- (docs/plans/2026-08-21-single-bill-with-instalment-schedule-plan.md).
--
-- ADDITIVE ONLY. Creates the tranche table and the waterfall function. Nothing
-- yet writes a tranche, so every one of the 19,349 live bills behaves exactly
-- as it does today; phases 3-6 move generation, the threshold and late charges
-- onto it.
--
-- WHY THIS REPLACES SPLITTING INTO N BILLS
-- ----------------------------------------
-- Yesterday's design turned a 30/40/30 tuition schedule into THREE
-- billing_student_bills rows. Three fee items produced five bills. But tuition
-- is ONE receivable of Rs 1,00,000 that happens to be collectable in tranches —
-- the tranches are a payment schedule, not three separate debts. Splitting also
-- pushed the choice onto the cashier ("which instalment is this Rs 30,000
-- for?") when partial payment is already the norm in this system: 1,735 bills
-- are partially_paid today.
--
-- WHAT CONSTRAINS THE SHAPE
-- -------------------------
-- billing_student_bills.due_date is read by 33 database functions and 1 view,
-- every one of them assuming a bill is ONE amount with ONE due date — overdue
-- marking, aging buckets, defaulter lists, risk scores, the fee-paid ladder,
-- and late charges. The design therefore keeps that assumption TRUE (phase 4
-- makes due_date track the next unsettled tranche) rather than teaching 33
-- consumers about tranches.
--
-- ALLOCATION IS DERIVED, NEVER STORED (§3)
-- ----------------------------------------
-- A stored paid_amount per tranche is a second copy of a number the receipts
-- already determine, and second copies drift. The waterfall is computed from
-- the bill's own paid position every time it is asked for.
--
-- NO BEGIN/COMMIT: the apply path wraps this file in one transaction.
-- =============================================================================

DO $guard$
BEGIN
  IF to_regclass('public.billing_bill_instalments') IS NOT NULL THEN
    RAISE EXCEPTION 'REFUSING: billing_bill_instalments already exists — this migration already ran.';
  END IF;
  IF to_regclass('public.billing_student_bills') IS NULL THEN
    RAISE EXCEPTION 'REFUSING: billing_student_bills missing — wrong database?';
  END IF;
END
$guard$;

-- =============================================================================
-- §1 The tranche table
-- =============================================================================

CREATE TABLE public.billing_bill_instalments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     uuid NOT NULL
    REFERENCES public.billing_student_bills(id) ON DELETE CASCADE,
  sequence_no smallint NOT NULL CHECK (sequence_no >= 1),
  amount      numeric(15,2) NOT NULL CHECK (amount > 0),
  due_date    date NOT NULL,

  -- Lifecycle status the learner reaches once this tranche is covered.
  -- Validated by the phase-1 validator from the fee-structure work, which is
  -- table-agnostic: it reads only NEW.promotes_to_status_code and rejects both
  -- an unknown code and any status with gates_login = true.
  promotes_to_status_code text,

  -- Provenance. Answers "which schedule line produced this tranche?" months
  -- later, when the structure has since been edited. ON DELETE SET NULL:
  -- deleting a structure line must never delete billing history.
  fee_structure_item_schedule_id uuid
    REFERENCES public.admission_fee_structure_item_schedules(id) ON DELETE SET NULL,

  label      text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_bbi_bill_sequence UNIQUE (bill_id, sequence_no)
);

-- The waterfall orders by (due_date, sequence_no) — index it that way.
CREATE INDEX ix_bbi_bill_due ON public.billing_bill_instalments (bill_id, due_date, sequence_no);

COMMENT ON TABLE public.billing_bill_instalments IS
  'Payment schedule INSIDE one bill. The bill is the debt; these are the dates and amounts it is collectable in. Allocation of money to tranches is DERIVED (billing_bill_instalment_state), never stored. Sum of amounts must equal the bill''s final_amount — enforced by a deferred constraint trigger, and preserved across bill amount edits by trg_bbi_rescale_on_amount_change.';
COMMENT ON COLUMN public.billing_bill_instalments.promotes_to_status_code IS
  'Lifecycle status reached once this tranche is fully covered by the waterfall. NULL = no rule. Login-granting statuses are rejected at write time.';

DROP TRIGGER IF EXISTS trg_bbi_validate_status ON public.billing_bill_instalments;
CREATE TRIGGER trg_bbi_validate_status
  BEFORE INSERT OR UPDATE OF promotes_to_status_code
  ON public.billing_bill_instalments
  FOR EACH ROW EXECUTE FUNCTION public.afsis_validate_status_target();

-- =============================================================================
-- §2 The tranches must add up to the debt
-- =============================================================================
-- DEFERRED: a schedule is written as one batch, so an immediate check would
-- reject tranche 1 of 3 for not summing to the whole bill.
--
-- A schedule that does not equal the debt silently under- or over-collects, and
-- the error surfaces only when someone reconciles a term-end statement.

CREATE OR REPLACE FUNCTION public.bbi_validate_sum_equals_bill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bill_id uuid;
  v_sum     numeric(15,2);
  v_final   numeric(15,2);
  v_count   integer;
BEGIN
  -- NEW is unassigned in a plpgsql DELETE trigger; branch, never COALESCE.
  IF TG_OP = 'DELETE' THEN
    v_bill_id := OLD.bill_id;
  ELSE
    v_bill_id := NEW.bill_id;
  END IF;

  SELECT count(*), COALESCE(sum(amount), 0)
    INTO v_count, v_sum
  FROM public.billing_bill_instalments
  WHERE bill_id = v_bill_id;

  -- Removing the last tranche turns the bill back into a plain single-date
  -- bill. That is a legitimate way to undo a schedule.
  IF v_count = 0 THEN
    RETURN NULL;
  END IF;

  SELECT final_amount INTO v_final
  FROM public.billing_student_bills WHERE id = v_bill_id;

  -- The bill itself may already be gone (ON DELETE CASCADE removed both).
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF round(v_sum, 2) <> round(v_final, 2) THEN
    RAISE EXCEPTION
      'Instalments for bill % total %, but the bill is for %.', v_bill_id, v_sum, v_final
      USING ERRCODE = 'BL002',
            HINT = 'Every tranche of a bill must add up to exactly the amount owed.';
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bbi_validate_sum ON public.billing_bill_instalments;
CREATE CONSTRAINT TRIGGER trg_bbi_validate_sum
  AFTER INSERT OR UPDATE OR DELETE
  ON public.billing_bill_instalments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.bbi_validate_sum_equals_bill();

-- =============================================================================
-- §3 Keeping the invariant across bill amount edits
-- =============================================================================
-- A discount, waiver or correction rewrites billing_student_bills.final_amount.
-- Without this, a Rs 1,00,000 bill discounted to Rs 90,000 would keep tranches
-- summing to Rs 1,00,000 — the sum validator does not fire (no tranche was
-- touched), so the bill would quietly carry a schedule for money nobody owes.
--
-- Tranches are rescaled PROPORTIONALLY, with the last one absorbing rounding —
-- the same rule the split engine and computeInstalmentAmounts() already use, so
-- "30/40/30 of whatever the bill is" holds after an edit.
--
-- AFTER, not BEFORE: it rewrites a different table, and must see the committed
-- new final_amount. It deliberately does not fire when no tranche exists, which
-- is every one of the 19,349 bills alive today.

CREATE OR REPLACE FUNCTION public.bbi_rescale_on_bill_amount_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n        integer;
  v_old      numeric(15,2);
  v_new      numeric(15,2);
  v_line     record;
  v_idx      integer := 0;
  v_sum_prev numeric(15,2) := 0;
  v_amt      numeric(15,2);
BEGIN
  IF NEW.final_amount IS NOT DISTINCT FROM OLD.final_amount THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.billing_bill_instalments WHERE bill_id = NEW.id;

  IF v_n = 0 THEN
    RETURN NULL;   -- unscheduled bill: nothing to keep in step
  END IF;

  v_old := OLD.final_amount;
  v_new := NEW.final_amount;

  -- A bill reduced to zero has nothing left to schedule. Dropping the tranches
  -- is the only outcome that keeps the sum invariant true (every tranche must
  -- be > 0), and a fully-waived bill has no collection dates to speak of.
  IF v_new <= 0 THEN
    DELETE FROM public.billing_bill_instalments WHERE bill_id = NEW.id;
    RETURN NULL;
  END IF;

  -- Degenerate source: cannot scale from zero, so split the new amount evenly
  -- rather than divide by zero.
  IF v_old IS NULL OR v_old <= 0 THEN
    FOR v_line IN
      SELECT id FROM public.billing_bill_instalments
      WHERE bill_id = NEW.id ORDER BY due_date, sequence_no
    LOOP
      v_idx := v_idx + 1;
      IF v_idx < v_n THEN
        v_amt := round(v_new / v_n, 2);
      ELSE
        v_amt := v_new - v_sum_prev;
      END IF;
      v_sum_prev := v_sum_prev + v_amt;
      UPDATE public.billing_bill_instalments SET amount = v_amt WHERE id = v_line.id;
    END LOOP;
    RETURN NULL;
  END IF;

  FOR v_line IN
    SELECT id, amount FROM public.billing_bill_instalments
    WHERE bill_id = NEW.id ORDER BY due_date, sequence_no
  LOOP
    v_idx := v_idx + 1;
    IF v_idx < v_n THEN
      v_amt := round(v_line.amount * v_new / v_old, 2);
      -- Never scale a tranche to zero: amount > 0 is a CHECK, and a zero
      -- tranche is not a tranche.
      IF v_amt <= 0 THEN
        v_amt := 0.01;
      END IF;
    ELSE
      v_amt := v_new - v_sum_prev;   -- last absorbs rounding
    END IF;
    v_sum_prev := v_sum_prev + v_amt;
    UPDATE public.billing_bill_instalments SET amount = v_amt WHERE id = v_line.id;
  END LOOP;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bbi_rescale_on_amount_change ON public.billing_student_bills;
CREATE TRIGGER trg_bbi_rescale_on_amount_change
  AFTER UPDATE OF final_amount ON public.billing_student_bills
  FOR EACH ROW EXECUTE FUNCTION public.bbi_rescale_on_bill_amount_change();

-- =============================================================================
-- §4 RLS — a tranche is visible exactly when its bill is
-- =============================================================================
-- The SELECT policy is a bare EXISTS against billing_student_bills, and that is
-- the whole point: the parent has SEVEN policies (admin permissions, two
-- institution-scoped paths, and two different learner self-view linkages), and
-- Postgres applies the parent's RLS inside this subquery. Restating any of that
-- here would create a second copy free to drift from the original.
--
-- Writes are NOT inherited the same way — a learner can SELECT their own bill,
-- and must not be able to rewrite its schedule. They gate on the bill-editing
-- permissions instead.

ALTER TABLE public.billing_bill_instalments ENABLE ROW LEVEL SECURITY;

-- Supabase default privileges hand anon ALL on a new table.
REVOKE ALL ON TABLE public.billing_bill_instalments FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_bill_instalments TO authenticated;
GRANT ALL ON TABLE public.billing_bill_instalments TO service_role;

CREATE POLICY "bill_instalments_select" ON public.billing_bill_instalments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.billing_student_bills b
    WHERE b.id = billing_bill_instalments.bill_id
  )
);

CREATE POLICY "bill_instalments_write" ON public.billing_bill_instalments
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.billing_student_bills b
    WHERE b.id = billing_bill_instalments.bill_id
      AND (
        (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
        OR (public.role_has_institution_access(b.institution_id)
            AND ((SELECT public.user_has_permission('billing.bills.edit'))
              OR (SELECT public.user_has_permission('billing.schedule.update'))))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.billing_student_bills b
    WHERE b.id = billing_bill_instalments.bill_id
      AND (
        (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
        OR (public.role_has_institution_access(b.institution_id)
            AND ((SELECT public.user_has_permission('billing.bills.create'))
              OR (SELECT public.user_has_permission('billing.bills.edit'))
              OR (SELECT public.user_has_permission('billing.schedule.create'))
              OR (SELECT public.user_has_permission('billing.schedule.update'))))
      )
  )
);

-- =============================================================================
-- §5 The waterfall
-- =============================================================================
-- Money settles the OLDEST debt first, so allocation follows the calendar —
-- (due_date, sequence_no), not sequence alone. This matters: a schedule entered
-- out of chronological order (tranche 1 dated after tranche 2, which the fee
-- structure editor warns about in amber) allocates by date, so its
-- "tranche 1 -> Reserved" rule fires later than the author probably intended.
--
-- paid_on_bill comes from final_amount - balance_amount, the same expression
-- vw_learner_payment_progress has always used. update_bill_status() CLAMPS an
-- overpaid bill to balance 0, so an overpayment reads as exactly paid and
-- settles every tranche — which is the correct presentation; the surplus is a
-- refund/credit matter tracked elsewhere.

CREATE OR REPLACE FUNCTION public.billing_bill_instalment_state(p_bill_id uuid)
RETURNS TABLE (
  instalment_id    uuid,
  sequence_no      smallint,
  amount           numeric,
  due_date         date,
  allocated_amount numeric,
  outstanding      numeric,
  is_settled       boolean,
  is_due           boolean,
  promotes_to_status_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_paid numeric(15,2);
  v_line record;
  v_alloc numeric(15,2);
BEGIN
  SELECT GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount))
    INTO v_paid
  FROM public.billing_student_bills b
  WHERE b.id = p_bill_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_line IN
    SELECT i.id, i.sequence_no, i.amount, i.due_date, i.promotes_to_status_code
    FROM public.billing_bill_instalments i
    WHERE i.bill_id = p_bill_id
    ORDER BY i.due_date, i.sequence_no
  LOOP
    v_alloc := LEAST(v_paid, v_line.amount);
    v_paid  := v_paid - v_alloc;

    instalment_id           := v_line.id;
    sequence_no             := v_line.sequence_no;
    amount                  := v_line.amount;
    due_date                := v_line.due_date;
    allocated_amount        := v_alloc;
    outstanding             := v_line.amount - v_alloc;
    is_settled              := (v_alloc >= v_line.amount);
    is_due                  := (v_line.due_date <= CURRENT_DATE);
    promotes_to_status_code := v_line.promotes_to_status_code;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.billing_bill_instalment_state(uuid) IS
  'The payment waterfall for one bill: money allocated oldest-tranche-first, computed from the bill''s paid position rather than stored. Returns nothing for a bill with no schedule. Ordered by (due_date, sequence_no) because money settles the oldest debt first.';

REVOKE ALL ON FUNCTION public.billing_bill_instalment_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_bill_instalment_state(uuid)
  TO authenticated, service_role;

-- =============================================================================
-- §6 Set-wide rollup, for the threshold view and list screens
-- =============================================================================
-- The per-bill function above is a loop; a view over 19k bills cannot call it
-- per row. This does the same waterfall as pure set arithmetic:
--
--   running_before = sum of tranche amounts strictly BEFORE this one
--   allocated      = clamp(paid_on_bill - running_before, 0, amount)
--
-- which is exactly what the loop computes, without the loop.

CREATE OR REPLACE VIEW public.vw_bill_instalment_state
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    i.id            AS instalment_id,
    i.bill_id,
    i.sequence_no,
    i.amount,
    i.due_date,
    i.promotes_to_status_code,
    b.student_id,
    b.institution_id,
    b.item_category_id,
    b.academic_year_id,
    b.status        AS bill_status,
    GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount)) AS paid_on_bill,
    COALESCE(SUM(i.amount) OVER (
      PARTITION BY i.bill_id
      ORDER BY i.due_date, i.sequence_no
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0) AS running_before
  FROM public.billing_bill_instalments i
  JOIN public.billing_student_bills b ON b.id = i.bill_id
)
SELECT
  instalment_id,
  bill_id,
  student_id,
  institution_id,
  item_category_id,
  academic_year_id,
  bill_status,
  sequence_no,
  amount,
  due_date,
  promotes_to_status_code,
  LEAST(GREATEST(paid_on_bill - running_before, 0), amount) AS allocated_amount,
  amount - LEAST(GREATEST(paid_on_bill - running_before, 0), amount) AS outstanding,
  (LEAST(GREATEST(paid_on_bill - running_before, 0), amount) >= amount) AS is_settled,
  (due_date <= CURRENT_DATE) AS is_due
FROM ranked;

COMMENT ON VIEW public.vw_bill_instalment_state IS
  'Set-based form of the billing_bill_instalment_state waterfall, for the threshold view and list screens. security_invoker = true so the underlying bill RLS applies.';

REVOKE ALL ON TABLE public.vw_bill_instalment_state FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.vw_bill_instalment_state TO authenticated, service_role;
