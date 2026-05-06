-- ============================================================================
-- 20260507100001 — Create admission_fee_adjustments table
-- ============================================================================
-- Spec §6.3. Per-enquiry first-class exceptions: scholarships, donor seats,
-- sibling rebates, management waivers, etc. delta_amount is signed: positive
-- = surcharge, negative = discount. billing_category_id NULL = global flat
-- delta against the resolved total.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admission_fee_adjustments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id          uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    billing_category_id uuid REFERENCES public.billing_categories(id),
    reason_code         text NOT NULL CHECK (reason_code IN
                          ('scholarship_merit','donor_seat','sibling_rebate','management_waiver',
                           'fee_concession','staff_ward','financial_hardship','other')),
    reason_notes        text,
    delta_amount        numeric(15,2) NOT NULL,
    applied_at          timestamptz NOT NULL DEFAULT now(),
    approved_by         uuid REFERENCES public.profiles(id),
    evidence_documents  jsonb NOT NULL DEFAULT '[]'::jsonb,
    status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','reversed')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_fee_adjustments_learner_active
    ON public.admission_fee_adjustments (learner_id, status);

CREATE INDEX IF NOT EXISTS ix_fee_adjustments_category
    ON public.admission_fee_adjustments (billing_category_id);

DROP TRIGGER IF EXISTS trg_admission_fee_adjustments_touch ON public.admission_fee_adjustments;
CREATE TRIGGER trg_admission_fee_adjustments_touch
    BEFORE UPDATE ON public.admission_fee_adjustments
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
