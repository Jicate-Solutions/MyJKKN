-- ============================================================================
-- Migration: 20260808105500_health_sports_certificate_visibility.sql
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
-- THE WRITE SIDE (added round 3, section 4 below)
--   The certificate UPLOAD had the mirror-image defect: the server action
--   authenticated the caller and then wrote with the service-role client,
--   deliberately bypassing cdc_docs_write — so any of 7,225 authenticated
--   profiles could put a file in the bucket. The action now authorizes against
--   the achievement row first (owner learner / accreditation.certificates.manage
--   / admin). Section 4 puts the SAME rule in storage RLS, so a learner session
--   can write its OWN path and nothing else, and the action's service-role
--   fallback stops being taken the day this is applied. Until then the fallback
--   is what keeps the button alive, behind the gate.
--
-- Rollback: drop the three functions/policies created here and restore the two
-- policies quoted verbatim in their comments below; the storage INSERT policy in
-- section 4 is new, so rolling it back is a plain DROP POLICY.
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

-- ── 4. The write door ───────────────────────────────────────────────────────
-- The upload half of the same defect. Production today carries only:
--   cdc_docs_write ON storage.objects FOR INSERT TO public
--     WITH CHECK ((bucket_id = 'cdc-docs') AND is_cdc_staff())
-- which refuses a learner session outright — which is why the server action
-- reached for the service-role client and, in doing so, let ANY signed-in
-- account write to the bucket. The action is now gated; this policy removes its
-- reason to be privileged at all, by letting a learner session write exactly one
-- place: under its OWN learner id, inside this feature's prefix.
--
-- cdc_docs_write is left byte-for-byte untouched. Permissive policies combine
-- with OR, so this can only widen — and it widens by exactly the prefix that
-- section 3 just carved out of the blanket read.

CREATE OR REPLACE FUNCTION public.fn_may_attach_learner_certificate(p_learner_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_learner uuid;
BEGIN
  IF v_uid IS NULL OR p_learner_id IS NULL THEN
    RETURN false;
  END IF;

  -- Takes TEXT, not uuid, and casts defensively: the argument is a path segment
  -- of an object being written, so a malformed value must DENY, not raise 22P02
  -- out of a policy expression.
  BEGIN
    v_learner := p_learner_id::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  -- Every branch COALESCEd: a SECDEF guard that returns NULL falls through and
  -- GRANTS.
  IF COALESCE(public.is_super_admin(), false)
     OR COALESCE(public.is_admin(), false) THEN
    RETURN true;
  END IF;

  -- (a) The learner the certificate belongs to.
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_uid AND p.learner_id = v_learner
  ) THEN
    RETURN true;
  END IF;

  -- (b) The IQAC / accreditation side — the same key that verifies a row, so an
  --     officer can file evidence on a learner's behalf. Deliberately NOT the
  --     read key `.view`: attaching evidence is a write.
  RETURN COALESCE(public.user_has_permission('accreditation.certificates.manage'), false);
END;
$$;

COMMENT ON FUNCTION public.fn_may_attach_learner_certificate(text) IS
  'May the CURRENT caller attach a certificate for this learner? Owner, the accreditation/IQAC side (accreditation.certificates.manage), or the admin bypass. Identity comes from auth.uid() only — the argument is a path segment naming the LEARNER whose folder is being written, never the caller, so there is no caller-supplied identity to forge.';

-- Supabase's default privileges GRANT EXECUTE on every new function to anon
-- SEPARATELY from PUBLIC, so revoking only one of them is a no-op.
REVOKE EXECUTE ON FUNCTION public.fn_may_attach_learner_certificate(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_may_attach_learner_certificate(text) TO authenticated;

DROP POLICY IF EXISTS cdc_docs_write_sports_certificate ON storage.objects;

CREATE POLICY cdc_docs_write_sports_certificate ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'cdc-docs'
    -- prefix / <learner_id> / <achievement_id> / <file>, exactly as the server
    -- action derives it. The learner id is read back out of the path and checked
    -- against the caller, so a hand-rolled upload cannot land in someone else's
    -- folder.
    AND name LIKE 'sports-achievement-certificates/%/%/%'
    AND public.fn_may_attach_learner_certificate(split_part(name, '/', 2))
  );
