-- ============================================================================
-- 20260507100002 — RLS policies for admission_fee_adjustments
-- ============================================================================
-- Read: admission_fees.read + access to the parent learner's institution
-- Write: admission_fees.manage_adjustments + same institution access
-- ============================================================================

ALTER TABLE public.admission_fee_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_adjustments_read ON public.admission_fee_adjustments;
CREATE POLICY fee_adjustments_read
    ON public.admission_fee_adjustments FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_adjustments.learner_id
           AND public.user_has_permission('admission_fees.read')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS fee_adjustments_write ON public.admission_fee_adjustments;
CREATE POLICY fee_adjustments_write
    ON public.admission_fee_adjustments FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_adjustments.learner_id
           AND public.user_has_permission('admission_fees.manage_adjustments')
           AND public.role_has_institution_access(lp.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = admission_fee_adjustments.learner_id
           AND public.user_has_permission('admission_fees.manage_adjustments')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );
