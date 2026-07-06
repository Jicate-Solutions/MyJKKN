-- 2026-07-01 — BUG-004309: fix "violation on submission" on /cdc/industry-mentors/new.
--
-- ROOT CAUSE: industry_mentors_insert RLS gated on hardcoded profiles.role IN
-- ('admin','institution_admin','super_admin'). A cdc_coordinator (the role that
-- actually runs the CDC Industry Mentors form) is not in that list, so every
-- submit raised RLS 42501 "new row violates row-level security policy". Same
-- class as the 2026-07-01 cdc_* multi-role fix, but industry_mentors has no cdc_
-- prefix so it was missed by that sweep. (Its policies were created out-of-band —
-- not previously tracked in supabase/migrations; this migration adopts them.)
--
-- FIX: allow CDC staff (is_cdc_staff() — multi-role aware) scoped to their own
-- institution via role_has_institution_access(institution_id), keeping the legacy
-- admin roles for back-compat. cdc_head (scope=all) + super_admin write any
-- institution; cdc_coordinator writes only their own. Verified live: coordinator
-- Muthazhahan is_cdc_staff()=true, own-inst allow=true, other-inst deny=false.

DROP POLICY IF EXISTS industry_mentors_insert ON public.industry_mentors;
CREATE POLICY industry_mentors_insert ON public.industry_mentors
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_cdc_staff() AND public.role_has_institution_access(institution_id))
    OR (EXISTS (SELECT 1 FROM public.profiles
                WHERE profiles.id = auth.uid()
                  AND profiles.role = ANY (ARRAY['admin','institution_admin','super_admin'])))
  );

NOTIFY pgrst, 'reload schema';
