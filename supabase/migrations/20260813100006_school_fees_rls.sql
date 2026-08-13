-- ============================================================================
-- 20260813100006 — RLS for the school fee tables
-- ============================================================================
-- Design: docs/plans/2026-08-13-school-fee-structure-design.md §8
--
-- Pattern follows 20260506100002 (admission_fee_structures RLS) plus the
-- anon-door revoke idiom from 20260815010000.
--
-- Institution scoping uses public.role_has_institution_access(), which is
-- already CAS-aware (20260521), so a user scoped to one CAS sibling reads the
-- whole group without special-casing here.
--
-- IMPORTANT: this migration creates policies ONLY on the six new school_fee_*
-- and school_term_calendars tables. No policy on billing_student_bills,
-- billing_categories, admission_fee_structures or any other existing table is
-- created, dropped or modified.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- school_fee_plans
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_fee_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_fee_plans FROM anon, PUBLIC;

DROP POLICY IF EXISTS school_fee_plans_read ON public.school_fee_plans;
CREATE POLICY school_fee_plans_read
    ON public.school_fee_plans FOR SELECT
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('school_fees.read')
        AND public.role_has_institution_access(institution_id)
      )
    );

DROP POLICY IF EXISTS school_fee_plans_write ON public.school_fee_plans;
CREATE POLICY school_fee_plans_write
    ON public.school_fee_plans FOR ALL
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('school_fees.manage')
        AND public.role_has_institution_access(institution_id)
      )
    )
    WITH CHECK (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('school_fees.manage')
        AND public.role_has_institution_access(institution_id)
      )
    );


-- ---------------------------------------------------------------------------
-- school_fee_plan_items — scoped through the parent plan's institution
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_fee_plan_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_fee_plan_items FROM anon, PUBLIC;

DROP POLICY IF EXISTS school_fee_plan_items_read ON public.school_fee_plan_items;
CREATE POLICY school_fee_plan_items_read
    ON public.school_fee_plan_items FOR SELECT
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR EXISTS (
        SELECT 1 FROM public.school_fee_plans p
         WHERE p.id = school_fee_plan_items.plan_id
           AND public.user_has_permission('school_fees.read')
           AND public.role_has_institution_access(p.institution_id)
      )
    );

DROP POLICY IF EXISTS school_fee_plan_items_write ON public.school_fee_plan_items;
CREATE POLICY school_fee_plan_items_write
    ON public.school_fee_plan_items FOR ALL
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR EXISTS (
        SELECT 1 FROM public.school_fee_plans p
         WHERE p.id = school_fee_plan_items.plan_id
           AND public.user_has_permission('school_fees.manage')
           AND public.role_has_institution_access(p.institution_id)
      )
    )
    WITH CHECK (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR EXISTS (
        SELECT 1 FROM public.school_fee_plans p
         WHERE p.id = school_fee_plan_items.plan_id
           AND public.user_has_permission('school_fees.manage')
           AND public.role_has_institution_access(p.institution_id)
      )
    );


-- ---------------------------------------------------------------------------
-- school_term_calendars
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_term_calendars ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_term_calendars FROM anon, PUBLIC;

DROP POLICY IF EXISTS school_term_calendars_read ON public.school_term_calendars;
CREATE POLICY school_term_calendars_read
    ON public.school_term_calendars FOR SELECT
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('school_fees.read')
        AND public.role_has_institution_access(institution_id)
      )
    );

DROP POLICY IF EXISTS school_term_calendars_write ON public.school_term_calendars;
CREATE POLICY school_term_calendars_write
    ON public.school_term_calendars FOR ALL
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('school_fees.manage')
        AND public.role_has_institution_access(institution_id)
      )
    )
    WITH CHECK (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('school_fees.manage')
        AND public.role_has_institution_access(institution_id)
      )
    );


-- ---------------------------------------------------------------------------
-- school_fee_concession_schemes  (writes need school_fees.concession)
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_fee_concession_schemes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_fee_concession_schemes FROM anon, PUBLIC;

DROP POLICY IF EXISTS school_fee_schemes_read ON public.school_fee_concession_schemes;
CREATE POLICY school_fee_schemes_read
    ON public.school_fee_concession_schemes FOR SELECT
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('school_fees.read')
        AND public.role_has_institution_access(institution_id)
      )
    );

DROP POLICY IF EXISTS school_fee_schemes_write ON public.school_fee_concession_schemes;
CREATE POLICY school_fee_schemes_write
    ON public.school_fee_concession_schemes FOR ALL
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('school_fees.concession')
        AND public.role_has_institution_access(institution_id)
      )
    )
    WITH CHECK (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('school_fees.concession')
        AND public.role_has_institution_access(institution_id)
      )
    );


-- ---------------------------------------------------------------------------
-- school_fee_concession_scheme_heads — scoped through the parent scheme
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_fee_concession_scheme_heads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_fee_concession_scheme_heads FROM anon, PUBLIC;

DROP POLICY IF EXISTS school_fee_scheme_heads_read ON public.school_fee_concession_scheme_heads;
CREATE POLICY school_fee_scheme_heads_read
    ON public.school_fee_concession_scheme_heads FOR SELECT
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR EXISTS (
        SELECT 1 FROM public.school_fee_concession_schemes s
         WHERE s.id = school_fee_concession_scheme_heads.scheme_id
           AND public.user_has_permission('school_fees.read')
           AND public.role_has_institution_access(s.institution_id)
      )
    );

DROP POLICY IF EXISTS school_fee_scheme_heads_write ON public.school_fee_concession_scheme_heads;
CREATE POLICY school_fee_scheme_heads_write
    ON public.school_fee_concession_scheme_heads FOR ALL
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR EXISTS (
        SELECT 1 FROM public.school_fee_concession_schemes s
         WHERE s.id = school_fee_concession_scheme_heads.scheme_id
           AND public.user_has_permission('school_fees.concession')
           AND public.role_has_institution_access(s.institution_id)
      )
    )
    WITH CHECK (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR EXISTS (
        SELECT 1 FROM public.school_fee_concession_schemes s
         WHERE s.id = school_fee_concession_scheme_heads.scheme_id
           AND public.user_has_permission('school_fees.concession')
           AND public.role_has_institution_access(s.institution_id)
      )
    );


-- ---------------------------------------------------------------------------
-- school_fee_concession_assignments — scoped through the scheme's institution.
-- A learner may also read their OWN assignments, resolved the same two ways the
-- live bill policies resolve a learner (profiles.learner_id linkage OR email).
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_fee_concession_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_fee_concession_assignments FROM anon, PUBLIC;

DROP POLICY IF EXISTS school_fee_assignments_read ON public.school_fee_concession_assignments;
CREATE POLICY school_fee_assignments_read
    ON public.school_fee_concession_assignments FOR SELECT
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR EXISTS (
        SELECT 1 FROM public.school_fee_concession_schemes s
         WHERE s.id = school_fee_concession_assignments.scheme_id
           AND public.user_has_permission('school_fees.read')
           AND public.role_has_institution_access(s.institution_id)
      )
      OR learner_id IN (
        SELECT lp.id
          FROM public.learners_profiles lp
          JOIN public.profiles p ON p.id = (SELECT auth.uid())
         WHERE lp.id = p.learner_id
            OR p.email IN (lp.student_email, lp.college_email)
      )
    );

DROP POLICY IF EXISTS school_fee_assignments_write ON public.school_fee_concession_assignments;
CREATE POLICY school_fee_assignments_write
    ON public.school_fee_concession_assignments FOR ALL
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR EXISTS (
        SELECT 1 FROM public.school_fee_concession_schemes s
         WHERE s.id = school_fee_concession_assignments.scheme_id
           AND public.user_has_permission('school_fees.concession')
           AND public.role_has_institution_access(s.institution_id)
      )
    )
    WITH CHECK (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR EXISTS (
        SELECT 1 FROM public.school_fee_concession_schemes s
         WHERE s.id = school_fee_concession_assignments.scheme_id
           AND public.user_has_permission('school_fees.concession')
           AND public.role_has_institution_access(s.institution_id)
      )
    );


-- ---------------------------------------------------------------------------
-- school_fee_generation_runs — writes need school_fees.generate
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_fee_generation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_fee_generation_runs FROM anon, PUBLIC;

DROP POLICY IF EXISTS school_fee_generation_runs_read ON public.school_fee_generation_runs;
CREATE POLICY school_fee_generation_runs_read
    ON public.school_fee_generation_runs FOR SELECT
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('school_fees.read')
        AND public.role_has_institution_access(institution_id)
      )
    );

DROP POLICY IF EXISTS school_fee_generation_runs_write ON public.school_fee_generation_runs;
CREATE POLICY school_fee_generation_runs_write
    ON public.school_fee_generation_runs FOR ALL
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('school_fees.generate')
        AND public.role_has_institution_access(institution_id)
      )
    )
    WITH CHECK (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('school_fees.generate')
        AND public.role_has_institution_access(institution_id)
      )
    );


-- ---------------------------------------------------------------------------
-- Table privileges. RLS above is the real gate; these just make sure the
-- authenticated role can reach the tables at all.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.school_fee_plans,
    public.school_fee_plan_items,
    public.school_term_calendars,
    public.school_fee_concession_schemes,
    public.school_fee_concession_scheme_heads,
    public.school_fee_concession_assignments,
    public.school_fee_generation_runs
TO authenticated;
