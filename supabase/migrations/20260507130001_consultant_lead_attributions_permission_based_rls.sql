-- ============================================================================
-- 20260507130001 — consultant_lead_attributions RLS → permission-based gating
-- ============================================================================
-- The legacy SELECT / INSERT / UPDATE policies hardcoded `role_key = 'admission'`
-- — predating the persona split that introduced admission_staff,
-- admission_counselor, and expo_counselor as separate roles. Those personas
-- silently lose every attribution write because none of them match the literal
-- role string. The lead-create call site is best-effort try/catch, so the
-- denial is logged as a warning and the attribution is dropped on the floor —
-- referral data and commission stats drift from reality.
--
-- This migration aligns the three remaining policies with the modern pattern
-- the DELETE policy already uses (post 2026-04-17 update):
--
--   is_super_admin()
--   OR (user_has_permission(<key>) AND role_has_institution_access(institution_id))
--
-- Permission keys per lib/constants/permissions.ts:
--   - SELECT → admission.leads.view  (counselors who view attributions)
--   - INSERT/UPDATE → admission.leads.edit  (writes attribution as part of
--     the lead's referral state — admission_staff/admission/admission_counselor/
--     expo_counselor all hold this)
--
-- The DELETE policy is already permission-based; left untouched here.
-- ============================================================================

DROP POLICY IF EXISTS lead_attributions_select ON public.consultant_lead_attributions;
CREATE POLICY lead_attributions_select
    ON public.consultant_lead_attributions FOR SELECT
    USING (
      public.is_super_admin()
      OR (
        public.user_has_permission('admission.leads.view')
        AND public.role_has_institution_access(institution_id)
      )
    );

DROP POLICY IF EXISTS lead_attributions_insert ON public.consultant_lead_attributions;
CREATE POLICY lead_attributions_insert
    ON public.consultant_lead_attributions FOR INSERT
    WITH CHECK (
      public.is_super_admin()
      OR (
        public.user_has_permission('admission.leads.edit')
        AND public.role_has_institution_access(institution_id)
      )
    );

DROP POLICY IF EXISTS lead_attributions_update ON public.consultant_lead_attributions;
CREATE POLICY lead_attributions_update
    ON public.consultant_lead_attributions FOR UPDATE
    USING (
      public.is_super_admin()
      OR (
        public.user_has_permission('admission.leads.edit')
        AND public.role_has_institution_access(institution_id)
      )
    )
    WITH CHECK (
      public.is_super_admin()
      OR (
        public.user_has_permission('admission.leads.edit')
        AND public.role_has_institution_access(institution_id)
      )
    );
