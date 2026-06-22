-- 2026-06-22 — BUG-004075: UNNATI → UDYOG apply-tracker.
-- Learners enrolled in an UNNATI training programme must apply on the EXTERNAL
-- UDYOG website. UDYOG has no API, so "applied" is proven by the student's
-- self-reported application/reference number (NOT auto-verified).
--
-- Decisions LOCKED (Director, 2026-06-22):
--  - UDYOG is an external website (deep-link out + obligation tracker).
--  - Status flow: required -> directed (clicked the outbound link) -> applied
--    (reference number on file). The reference number is REQUIRED to reach
--    'applied' — enforced here by a CHECK constraint, not just the UI.
--  - One requirement per (learner, UNNATI programme); de-enrolling from UNNATI
--    cancels an OPEN (not-yet-applied) requirement.
--  - New cdc.udyog.* permission family (added in lib/constants/permissions.ts).

-- ---------------------------------------------------------------------------
-- 1. Obligation tracker table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_udyog_requirements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id           uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  source_programme_id  uuid REFERENCES public.cdc_training_programmes(id) ON DELETE SET NULL,
  institution_id       uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'required',  -- required | directed | applied | waived | cancelled
  udyog_reference      text,            -- student's self-reported UDYOG application/reference number
  due_date             date,
  directed_at          timestamptz,
  applied_at           timestamptz,
  waived_reason        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT cdc_udyog_requirements_unique UNIQUE (learner_id, source_programme_id),
  -- The Director's "reference number is REQUIRED to mark applied" rule, enforced
  -- at the database so no API/UI path can flip to 'applied' without proof.
  CONSTRAINT cdc_udyog_applied_needs_ref
    CHECK (status <> 'applied' OR (udyog_reference IS NOT NULL AND length(btrim(udyog_reference)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_cdc_udyog_requirements_learner     ON public.cdc_udyog_requirements (learner_id);
CREATE INDEX IF NOT EXISTS idx_cdc_udyog_requirements_status      ON public.cdc_udyog_requirements (status);
CREATE INDEX IF NOT EXISTS idx_cdc_udyog_requirements_institution ON public.cdc_udyog_requirements (institution_id);

ALTER TABLE public.cdc_udyog_requirements ENABLE ROW LEVEL SECURITY;

-- Read: CDC staff with cdc.udyog.view + institution scope; a learner sees their own
-- (forward-compat for a future learner-facing surface). super_admin/admin bypass.
DROP POLICY IF EXISTS "cdc_udyog_requirements_select" ON public.cdc_udyog_requirements;
CREATE POLICY "cdc_udyog_requirements_select" ON public.cdc_udyog_requirements
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('cdc.udyog.view') AND role_has_institution_access(institution_id))
    OR learner_id IN (SELECT learner_id FROM public.profiles WHERE id = auth.uid())
  );

-- Write: cdc.udyog.manage + institution scope (in practice writes go through the
-- service-role API; this guards any direct authenticated-client write).
DROP POLICY IF EXISTS "cdc_udyog_requirements_write" ON public.cdc_udyog_requirements;
CREATE POLICY "cdc_udyog_requirements_write" ON public.cdc_udyog_requirements
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('cdc.udyog.manage') AND role_has_institution_access(institution_id))
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('cdc.udyog.manage') AND role_has_institution_access(institution_id))
  );

DROP TRIGGER IF EXISTS trg_cdc_udyog_requirements_touch ON public.cdc_udyog_requirements;
CREATE TRIGGER trg_cdc_udyog_requirements_touch
  BEFORE UPDATE ON public.cdc_udyog_requirements
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Auto-raise on UNNATI enrollment (catches ALL enroll paths: single + bulk)
--    Non-fatal: a failure here must never abort the underlying enrollment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cdc_raise_udyog_on_unnati_enroll()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_unnati boolean := false;
  v_inst      uuid;
BEGIN
  SELECT (tt.config_key = 'unnati'), p.institution_id
    INTO v_is_unnati, v_inst
  FROM public.cdc_training_programmes p
  JOIN public.cdc_training_types tt ON tt.id = p.training_type_id
  WHERE p.id = NEW.programme_id;

  IF v_is_unnati THEN
    INSERT INTO public.cdc_udyog_requirements (learner_id, source_programme_id, institution_id, status)
    VALUES (NEW.learner_id, NEW.programme_id, v_inst, 'required')
    ON CONFLICT (learner_id, source_programme_id) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never break enrollment because of UDYOG bookkeeping.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cdc_udyog_raise ON public.cdc_training_enrollments;
CREATE TRIGGER trg_cdc_udyog_raise
  AFTER INSERT ON public.cdc_training_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.fn_cdc_raise_udyog_on_unnati_enroll();

-- ---------------------------------------------------------------------------
-- 3. Cancel an OPEN requirement when the learner de-enrolls from UNNATI (D3).
--    Applied/waived requirements are left intact (the obligation was met/closed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cdc_cancel_udyog_on_unenroll()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cdc_udyog_requirements
     SET status = 'cancelled', updated_at = now()
   WHERE learner_id = OLD.learner_id
     AND source_programme_id = OLD.programme_id
     AND status IN ('required', 'directed');
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cdc_udyog_cancel ON public.cdc_training_enrollments;
CREATE TRIGGER trg_cdc_udyog_cancel
  AFTER DELETE ON public.cdc_training_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.fn_cdc_cancel_udyog_on_unenroll();

-- Trigger functions can't be invoked through PostgREST (wrong signature), but
-- revoke anyway for defense-in-depth against Supabase's default anon grant.
REVOKE EXECUTE ON FUNCTION public.fn_cdc_raise_udyog_on_unnati_enroll() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cdc_cancel_udyog_on_unenroll()      FROM anon, PUBLIC;

-- ---------------------------------------------------------------------------
-- 4. Portal URL config (external UDYOG site). Director-editable, no code deploy.
--    Seeded empty; the tracker disables the outbound button until it's set.
-- ---------------------------------------------------------------------------
-- Idempotent via NOT EXISTS (the unique index is on (policy_key, scope_type,
-- coalesce(scope_id,...)), so a bare ON CONFLICT (policy_key) would not match).
INSERT INTO public.platform_policies (policy_key, scope_type, value, description, data_type, is_system, is_active)
SELECT
  'cdc.udyog.portal_url', 'global', '""'::jsonb,
  'External UDYOG application portal URL that UNNATI learners are directed to (BUG-004075). Set by CDC. No UDYOG API exists; application is proven by the student''s self-reported reference number.',
  'string', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies WHERE policy_key = 'cdc.udyog.portal_url'
);
