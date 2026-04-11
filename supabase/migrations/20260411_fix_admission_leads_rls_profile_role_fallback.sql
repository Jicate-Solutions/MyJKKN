-- ============================================================
-- Fix: admission_leads RLS — profile-role 'admission' fallback
-- Date:    2026-04-11
-- Bugs:    BUG-003226 — Unable to create lead (42501 row-level security)
--          BUG-003225 — Unable to view Gayathri's lead detail (PGRST116 0 rows)
--          BUG-003219 — Unable to view walk-in lead detail (PGRST116 0 rows)
--          BUG-003218 — Unable to open caller lead detail (PGRST116 blocks
--                       rendering BEFORE PR #112's stage-history fix can run)
--
-- Context:
--   Users whose profiles.role='admission' but whose user_roles entry is out
--   of sync (e.g. has 'faculty') fall through all three branches of the
--   existing leads_select / leads_update policies, so RLS filters them out
--   of every read and reject every update. leads_insert already has a
--   profile-role multi-fallback, but 'admission' is missing from its list.
--   Observed symptom: the leads LIST page works (service-role API bypass)
--   while any single-lead DETAIL view fails with PGRST116. BUG-003218's
--   stage-history fix from PR #112 cannot even run because the lead detail
--   page crashes at the admission_leads fetch.
--
-- Fix:
--   Add a profiles.role multi-fallback branch to leads_select, leads_insert,
--   and leads_update that accepts: 'super_admin', 'admin', 'staff',
--   'institution_admin', 'administrator', 'admission'.
--   (leads_insert already has the first five; we're adding 'admission'.)
--   leads_delete is intentionally left untouched — destructive operations
--   keep their narrower permission set.
--
-- Why this is safe:
--   • Read access is EXPANDED, not restricted. No existing user loses access.
--   • The new branch mirrors the pattern already present in leads_insert, so
--     the semantics match what production already considers trusted.
--   • Expo team-member policies (leads_select_expo_team_member,
--     leads_insert_expo_team_member) are untouched.
--   • leads_delete is untouched — still super_admin / custom-role / same
--     institution only.
-- ============================================================

-- ------------------------------------------------------------
-- 1. leads_select — add profile-role multi-fallback including 'admission'
-- ------------------------------------------------------------
DROP POLICY IF EXISTS leads_select ON public.admission_leads;

CREATE POLICY leads_select ON public.admission_leads
  FOR SELECT
  TO authenticated
  USING (
    -- Existing: same institution as the user
    institution_id = auth_institution_id()
    -- Existing: super_admin via profiles
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'super_admin'
    )
    -- Existing: custom admission role via user_roles
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = auth.uid()
        AND cr.role_key = 'admission'
    )
    -- NEW: profile-role multi-fallback (includes 'admission')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN (
          'admin',
          'super_admin',
          'staff',
          'institution_admin',
          'administrator',
          'admission'
        )
    )
  );

COMMENT ON POLICY leads_select ON public.admission_leads IS
  'SELECT access for leads. Added profile-role multi-fallback on 2026-04-11 to unblock users whose profiles.role=admission but whose user_roles entry is out of sync. See 20260411_fix_admission_leads_rls_profile_role_fallback.sql.';

-- ------------------------------------------------------------
-- 2. leads_insert — add 'admission' to the existing profile-role array
-- ------------------------------------------------------------
-- This policy already has a 5-role profile fallback array. We replace the
-- whole policy so we can expand that array (Postgres doesn't support
-- in-place policy USING/WITH CHECK mutation).
DROP POLICY IF EXISTS leads_insert ON public.admission_leads;

CREATE POLICY leads_insert ON public.admission_leads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Existing: same institution as the user
    institution_id = auth_institution_id()
    -- Existing: super_admin via profiles
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'super_admin'
    )
    -- Existing: custom admission role via user_roles
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = auth.uid()
        AND cr.role_key = 'admission'
    )
    -- Existing profile-role array: added 'admission'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN (
          'admin',
          'super_admin',
          'staff',
          'institution_admin',
          'administrator',
          'admission'
        )
    )
    -- Existing: active education consultant
    OR EXISTS (
      SELECT 1 FROM public.education_consultants ec
      JOIN public.consultant_institutions ci
        ON ci.consultant_id = ec.id
       AND ci.status = 'active'
      WHERE ec.user_id = auth.uid()
    )
  );

COMMENT ON POLICY leads_insert ON public.admission_leads IS
  'INSERT access for leads. Added admission to existing profile-role fallback array on 2026-04-11. See 20260411_fix_admission_leads_rls_profile_role_fallback.sql.';

-- ------------------------------------------------------------
-- 3. leads_update — add profile-role multi-fallback including 'admission'
-- ------------------------------------------------------------
DROP POLICY IF EXISTS leads_update ON public.admission_leads;

CREATE POLICY leads_update ON public.admission_leads
  FOR UPDATE
  TO authenticated
  USING (
    -- Existing: same institution as the user
    institution_id = auth_institution_id()
    -- Existing: assigned counselor on the lead
    OR assigned_counselor_id = auth.uid()
    -- Existing: super_admin via profiles
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'super_admin'
    )
    -- Existing: custom admission role via user_roles
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = auth.uid()
        AND cr.role_key = 'admission'
    )
    -- NEW: profile-role multi-fallback (includes 'admission')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN (
          'admin',
          'super_admin',
          'staff',
          'institution_admin',
          'administrator',
          'admission'
        )
    )
  );

COMMENT ON POLICY leads_update ON public.admission_leads IS
  'UPDATE access for leads. Added profile-role multi-fallback on 2026-04-11 to mirror SELECT. See 20260411_fix_admission_leads_rls_profile_role_fallback.sql.';

-- ============================================================
-- Not touched (on purpose):
--   • leads_delete — destructive action, conservative scope preserved
--   • leads_select_expo_team_member — expo-specific, unaffected
--   • leads_insert_expo_team_member — expo-specific, unaffected
-- ============================================================
