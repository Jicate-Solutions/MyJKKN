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
