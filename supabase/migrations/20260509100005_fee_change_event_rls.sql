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
