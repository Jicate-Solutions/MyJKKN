-- 2026-06-22 — BUG-004057 follow-up (#1552): persist the latest AI Career Guidance
-- report per learner so the page loads the last report on open instead of
-- regenerating (and re-spending tokens) on every view.
--
-- Decision (Director, 2026-06-22): keep the LATEST report only — OVERWRITE the
-- previous one, NOT a full history. Hence UNIQUE(learner_id) + upsert.
--
-- Writes happen ONLY through the service-role API route (app/api/cdc/career-guidance),
-- which is already gated on user_has_permission('cdc.view') + institution scope.
-- RLS below is defense-in-depth for any direct authenticated client read.
-- No SECURITY DEFINER RPC is introduced, so no anon-revoke is required.

CREATE TABLE IF NOT EXISTS public.cdc_career_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id        uuid NOT NULL UNIQUE REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id    uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  result            jsonb NOT NULL,            -- full CareerGuidanceResult (signals + guidance + meta)
  completeness_pct  integer,
  model             text,
  generated_at      timestamptz NOT NULL DEFAULT now(),
  generated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cdc_career_reports_institution
  ON public.cdc_career_reports (institution_id);

ALTER TABLE public.cdc_career_reports ENABLE ROW LEVEL SECURITY;

-- Read: CDC staff with cdc.view + institution scope (super-admin/admin bypass built in).
DROP POLICY IF EXISTS "cdc_career_reports_select" ON public.cdc_career_reports;
CREATE POLICY "cdc_career_reports_select" ON public.cdc_career_reports
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('cdc.view') AND role_has_institution_access(institution_id))
  );

-- Write: same gate. In practice writes come from the service-role route (RLS bypassed);
-- this policy only guards a hypothetical direct authenticated-client write.
DROP POLICY IF EXISTS "cdc_career_reports_write" ON public.cdc_career_reports;
CREATE POLICY "cdc_career_reports_write" ON public.cdc_career_reports
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('cdc.view') AND role_has_institution_access(institution_id))
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('cdc.view') AND role_has_institution_access(institution_id))
  );

DROP TRIGGER IF EXISTS trg_cdc_career_reports_touch ON public.cdc_career_reports;
CREATE TRIGGER trg_cdc_career_reports_touch
  BEFORE UPDATE ON public.cdc_career_reports
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
