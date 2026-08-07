-- =====================================================================
-- Industry Partners module — permission-based SELECT policy + role grant
-- =====================================================================
-- Date: 2026-08-07
-- Companion to: app/(routes)/industry-partners/**            (list + detail)
--               lib/services/cdc/industry-partner-service.ts (reads)
--               lib/constants/permissions.ts                 (cdc.industry_partners.view)
--               lib/sidebarMenuLink.ts                       (MENU_PERMISSIONS + sidebar entry)
--
-- NOT applied to production by this PR. Applying is a human decision.
-- Additive and idempotent — safe to re-run.
--
-- ---------------------------------------------------------------------
-- WHY THIS IS ADDITIVE AND NOT A REPLACEMENT
-- ---------------------------------------------------------------------
-- `public.industry_partners` already carries a legacy SELECT policy
-- (`industry_partners_select`) written in the pre-dynamic-permissions style:
--
--     institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
--     OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin)
--
-- That policy is depended on TODAY by a live read path that is NOT this module:
-- `PDEEmployerBriefingService.triggerBriefing()` (lib/services/pde-employer-briefing-service.ts)
-- selects active partners with a contact_email using the caller's cookie-scoped
-- session, reached from `POST /api/pde/placement-signals`. That route's own
-- header comment states it relies on `industry_partners` RLS to bound the read.
--
-- If this migration DROPPED the legacy policy and replaced it with a
-- permission-gated one, every caller of that route who does not hold
-- `cdc.industry_partners.view` would start reading ZERO partners — and the
-- calling code interprets zero rows as the factual claim "No active
-- industry_partners with contact_email for this institution." An RLS denial is
-- always silent (0 rows, error = null), so the breakage would be invisible in
-- logs and would look like real data.
--
-- Postgres ORs permissive policies together, so adding a second permissive
-- SELECT policy can only WIDEN visibility, never narrow it. That is the safe
-- half of the change and the only half this PR is entitled to make.
--
-- What that means honestly: the new permission key is the gate on the UI
-- surface (PermissionGuard on both pages + MENU_PERMISSIONS on both routes),
-- and at the DB layer it GRANTS cross-institution reach to roles whose
-- institution_scope allows it. It does not yet restrict same-institution reads,
-- because those were never restricted. Narrowing the legacy policy is a
-- separate, deliberate decision that must first grant the key to every role
-- that legitimately reads this table today.
--
-- No new SECURITY DEFINER function is created here; the policy composes the
-- four existing helpers (is_super_admin, is_admin, user_has_permission,
-- role_has_institution_access), all already locked down from anon.
-- =====================================================================

BEGIN;

-- RLS is already enabled on this table; assert rather than assume.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'industry_partners' AND c.relrowsecurity
  ) THEN
    EXECUTE 'ALTER TABLE public.industry_partners ENABLE ROW LEVEL SECURITY';
    RAISE NOTICE 'RLS enabled on public.industry_partners';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Permission-based SELECT policy (standard house pattern)
-- ---------------------------------------------------------------------
-- Postgres has no CREATE POLICY IF NOT EXISTS, so drop-then-create.
DROP POLICY IF EXISTS "industry_partners_select_permission" ON public.industry_partners;

CREATE POLICY "industry_partners_select_permission"
ON public.industry_partners
FOR SELECT
USING (
  (SELECT is_super_admin())
  OR (SELECT is_admin())
  OR (
    (SELECT user_has_permission('cdc.industry_partners.view'))
    AND role_has_institution_access(institution_id)
  )
);

COMMENT ON POLICY "industry_partners_select_permission" ON public.industry_partners IS
  'Dynamic-permission read path for the Industry Partners module (2026-08-07). '
  'Sits ALONGSIDE the legacy industry_partners_select policy — permissive '
  'policies OR together, so this only widens. See the migration header for why '
  'the legacy policy was not replaced.';

-- ---------------------------------------------------------------------
-- 2. Grant the key to the seeded CDC roles
-- ---------------------------------------------------------------------
-- Declaring the key in lib/constants/permissions.ts only populates the Role
-- Management UI. Without the key in custom_roles.permissions, the sidebar entry
-- is hidden and PermissionGuard denies for every non-super-admin — the module
-- would ship dark. Mirrors 20260704090200_cdc_govt_readiness_permission_backfill.sql.
--
-- COALESCE guards a NULL permissions column (jsonb NULL || x = NULL would wipe
-- every existing grant on the role).
--
-- WHICH ROLES, AND WHY THIS SET (decided 2026-08-07, after review):
-- Exactly the four that hold every sibling CDC module key. Measured live on
-- custom_roles the same day: cdc.mentors.view, cdc.industry_mentors.view and
-- cdc.view are each held by ceo, cdc_head, cdc_coordinator, managing_director —
-- the same four, no more, no less. This module takes that shape rather than
-- inventing a different one, because a directory that answers "which companies
-- do we partner with" belongs to the same audience as "which people mentor our
-- learners".
--
-- It was put to review that this "ships dark" to the other 21 roles that can
-- scan a business card and therefore CREATE rows here. That is true and it is
-- deliberate: a scanner already sees every card they saved, and where it went,
-- on /meetings/contacts/scan/saved. Contributing a row is not the same as
-- owning the directory, and widening this key to all 23 scanner roles would
-- make this the single most broadly-readable CDC surface in the product on the
-- strength of an empty table.
--
-- KNOWN GAP, pre-existing and NOT introduced here: the `administrator` role is
-- admitted by this table's RLS (via is_admin()) and by the sidebar (via
-- ADMIN_BYPASS_ROLES in lib/navigation/permission-filter.ts), but NOT by
-- PermissionGuard, which bypasses on isSuperAdmin alone — role === 'super_admin'
-- or the is_super_admin flag. So an administrator sees the menu entry and the
-- database returns their rows, while the page renders the fallback. Every other
-- CDC module (/cdc/mentors, /cdc/industry-mentors) has the identical three-layer
-- mismatch, so it is a platform-wide inconsistency to fix once, deliberately,
-- rather than to paper over here with a grant shape no sibling module uses.
UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb)
                  || jsonb_build_object('cdc.industry_partners.view', true),
    updated_at = now()
WHERE role_key IN ('ceo', 'cdc_head', 'cdc_coordinator', 'managing_director');

-- Verify only on roles that actually exist. A missing seeded role is outside
-- this additive migration's scope and must not abort the apply.
DO $$
DECLARE
  r            record;
  v_granted    boolean;
  v_checked    int := 0;
BEGIN
  FOR r IN
    SELECT role_key FROM public.custom_roles
    WHERE role_key IN ('ceo', 'cdc_head', 'cdc_coordinator', 'managing_director')
  LOOP
    SELECT COALESCE((permissions->>'cdc.industry_partners.view')::boolean, false)
      INTO v_granted
      FROM public.custom_roles
     WHERE role_key = r.role_key;

    IF NOT v_granted THEN
      RAISE EXCEPTION '% missing cdc.industry_partners.view after backfill', r.role_key;
    END IF;

    v_checked := v_checked + 1;
  END LOOP;

  IF v_checked = 0 THEN
    RAISE NOTICE 'Neither cdc_head nor cdc_coordinator exists — grant skipped (no row to update)';
  ELSE
    RAISE NOTICE 'cdc.industry_partners.view granted and verified on % CDC role(s)', v_checked;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Assert the policy landed
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'industry_partners'
      AND policyname = 'industry_partners_select_permission'
  ) THEN
    RAISE EXCEPTION 'industry_partners_select_permission was not created';
  END IF;

  RAISE NOTICE 'Industry Partners RLS migration complete';
END $$;

COMMIT;
