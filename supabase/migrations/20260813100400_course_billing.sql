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
