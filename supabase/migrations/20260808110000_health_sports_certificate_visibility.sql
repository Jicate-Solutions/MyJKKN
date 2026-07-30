-- ============================================================================
-- Migration: 20260808110000_health_sports_certificate_visibility.sql
-- Date:      2026-07-30
-- Module:    health / sports achievements  (Director decision D7)
--
-- ⚠️ NOT APPLIED TO ANY DATABASE — Director-gated apply.
--    Merging and deploying this repo does NOT run migrations. Nothing here has
--    touched production; it was validated inside BEGIN..ROLLBACK only.
--
-- WHAT WAS WRONG (found by adversarial review of PR #2650, undisclosed there)
--   A learner's certificate scan became readable by EVERY signed-in person on
--   the platform the moment IQAC ticked the row. Two independent doors:
--
--     1. public.health_sports_achievements_public
--          FOR SELECT TO authenticated USING (verified = true)
--        No institution predicate, no role predicate. Any authenticated caller
--        — a learner at another college, using the anon key that ships in every
--        Next.js bundle — could read the whole verified row, certificate
--        pointer included.
--
--     2. storage.objects policy cdc_docs_read
--          USING (bucket_id = 'cdc-docs' AND auth.uid() IS NOT NULL)
--        SELECT on storage.objects is what powers bucket LISTING, so any
--        authenticated caller could enumerate every certificate path in the
--        bucket and then read it — without ever touching the table.
--
--   Measured on prod 2026-07-30 before this file: 1 row in the table, 0
--   verified, 0 with a certificate. So NOTHING has leaked yet — this closes the
--   door before the feature is used, not after.
--
-- D7 — WHO MAY SEE A CERTIFICATE (Director, live interview 2026-07-30)
--   * the LEARNER who owns it
--   * staff of THAT learner's OWN college
--   * the IQAC / accreditation side
--   * plus the standard is_super_admin() / is_admin() bypass
--   Explicitly NOT every authenticated user, and NOT a fellow learner of the
--   same college.
--
-- WHY A SECURITY DEFINER HELPER AND NOT AN INLINE PREDICATE
--   The rule needs the LEARNER's institution, which lives in
--   learners_profiles — a table that carries its own RLS. Inlined, the subquery
--   would run as the viewer, return no row for a team member who cannot read
--   that learner, and the predicate would collapse to NULL → access denied for
--   exactly the people D7 is meant to admit. A SECURITY DEFINER helper resolves
--   the institution once, honestly, and returns a plain boolean.
--
-- Rollback: drop the two objects created here and restore the two policies
-- quoted verbatim in their comments below.
-- ============================================================================

-- ── 1. The D7 rule, as one auditable function ───────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_can_view_learner_achievement(p_learner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_inst uuid;
BEGIN
  -- Unauthenticated, or nothing to check against: no.
  IF v_uid IS NULL OR p_learner_id IS NULL THEN
    RETURN false;
  END IF;

  -- Platform bypass. Every branch is COALESCEd: a SECDEF guard that returns
  -- NULL falls through and GRANTS, which is how a super-admin guard silently
  -- opened a table here once before.
  IF COALESCE(public.is_super_admin(), false)
     OR COALESCE(public.is_admin(), false) THEN
    RETURN true;
  END IF;

  -- (a) The learner who owns the record.
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_uid AND p.learner_id = p_learner_id
  ) THEN
    RETURN true;
  END IF;

  -- (b) The IQAC / accreditation side. Either accreditation certificate key is
  --     enough: `.view` is the read key and `.manage` (the verify key) implies
  --     it — an officer who may tick a certificate must be able to open it.
  IF COALESCE(public.user_has_permission('accreditation.certificates.view'), false)
     OR COALESCE(public.user_has_permission('accreditation.certificates.manage'), false) THEN
    RETURN true;
  END IF;

  -- (c) Staff of THAT learner's own college. Two conditions, both required:
  --     the viewer is a serving team member (public.staff, not merely a profile
  --     without a learner_id — that set also holds parents and service
  --     accounts), AND the platform's own institution-scope helper admits the
  --     learner's college for them. role_has_institution_access is used rather
  --     than a hand-rolled institution_id comparison so a deliberate
  --     cross-institution grant (institution_scope = 'all', or a
  --     user_institution_access row) keeps working exactly as it does
  --     everywhere else on the platform.
  SELECT lp.institution_id INTO v_inst
  FROM public.learners_profiles lp
  WHERE lp.id = p_learner_id;

  IF v_inst IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.profile_id = v_uid AND COALESCE(s.is_active, true)
  ) THEN
    RETURN false;
  END IF;

  RETURN COALESCE(public.role_has_institution_access(v_inst), false);
END;
$$;

COMMENT ON FUNCTION public.fn_can_view_learner_achievement(uuid) IS
  'D7 (2026-07-30): may the CURRENT caller see this learner''s achievement and its certificate? Owner, staff of the learner''s own college, the accreditation/IQAC side, or the admin bypass. Identity comes from auth.uid() only — p_learner_id names the ROW being read, never the caller, so there is no caller-supplied identity to forge.';

-- Supabase's default privileges GRANT EXECUTE on every new function to anon
-- SEPARATELY from PUBLIC, so revoking only one of them is a no-op.
REVOKE EXECUTE ON FUNCTION public.fn_can_view_learner_achievement(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_view_learner_achievement(uuid) TO authenticated;

-- ── 2. The table door ───────────────────────────────────────────────────────
-- Replaces, verbatim:
--   CREATE POLICY health_sports_achievements_public
--     ON public.health_sports_achievements
--     FOR SELECT TO authenticated
--     USING ((verified = true));
--
-- `verified = true` is deliberately KEPT: an unverified entry is a claim, not
-- evidence, and its owner still reads it through the untouched
-- health_sports_achievements_self policy. This migration narrows WHO may read a
-- verified row; it does not widen anything.

DROP POLICY IF EXISTS health_sports_achievements_public ON public.health_sports_achievements;

CREATE POLICY health_sports_achievements_public
  ON public.health_sports_achievements
  FOR SELECT
  TO authenticated
  USING (
    verified = true
    AND public.fn_can_view_learner_achievement(learner_id)
  );

-- ── 3. The storage door ─────────────────────────────────────────────────────
-- Replaces, verbatim:
--   CREATE POLICY cdc_docs_read ON storage.objects
--     FOR SELECT TO public
--     USING (((bucket_id = 'cdc-docs'::text) AND (auth.uid() IS NOT NULL)));
--
-- The ONLY change is the third conjunct: certificates uploaded by this feature
-- are carved out of the blanket read. Everything cdc-docs already holds is
-- untouched — verified on prod 2026-07-30, the bucket holds 14 objects across
-- bulletin-attachments / company-logos / exports / internship-offer-letters /
-- mentor-photos / offer-letters and ZERO under this prefix, so no existing CDC
-- read changes behaviour.
--
-- No replacement grant policy is added, on purpose: with the prefix carved out,
-- the ONLY way to open a certificate is the server action, which mints a
-- SHORT-LIVED signed URL with the service-role client after re-checking the D7
-- rule above. Nothing in the app reads these objects through a user session, so
-- there is no path left to widen.

DROP POLICY IF EXISTS cdc_docs_read ON storage.objects;

CREATE POLICY cdc_docs_read ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'cdc-docs'
    AND auth.uid() IS NOT NULL
    AND name NOT LIKE 'sports-achievement-certificates/%'
  );
