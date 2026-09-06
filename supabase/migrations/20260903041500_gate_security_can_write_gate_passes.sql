-- ============================================================================
-- 2026-09-03 — The people who work the gate can finally read and write a pass
--
-- ⚠️ NOT APPLIED — FILE ONLY. This migration has not been run against
--    production. Apply it deliberately, with the verification below.
--
-- WHY THIS EXISTS
-- ---------------
-- The gate-pass RLS policies key on two permissions:
--   SELECT → campus_living.gate_passes.view   (or .view_own for the learner)
--   UPDATE → campus_living.gate_passes.edit
--
-- Nobody holds `.edit`. Measured on production 2026-08-06
-- (docs/audit/2026-08-06-AUDIT-campus-living-permission-keys-by-area.md §5.5):
-- 0 holders of `.edit`, while 21 people hold `verify_at_gate`, 26 hold
-- `view_block` and 12 hold `reject`. There are 14 active gate_security
-- members and recording exits and returns is their primary job.
--
-- Those three keys they DO hold are decorative: `verify_at_gate`,
-- `view_block` and `reject` are referenced by no RLS policy and no page gate
-- anywhere in the repo. And `user_has_permission` is an exact jsonb key
-- lookup — `(cr.permissions->>permission_name)::boolean = true` — with no
-- prefix or wildcard matching, so holding `view_block` does NOT satisfy
-- `view`. The guard role was designed against names that were never wired.
--
-- Hence BOTH keys, not just `.edit` as the audit suggested: with `.edit`
-- alone, gate_security and warden still cannot SELECT the row they are
-- trying to update, so the scan screen would load and find nothing.
--
-- MERGE, DO NOT REPLACE
-- ---------------------
-- 20260421000002_persona_design_pr4_rls_retrofit.sql set these roles with a
-- bare `jsonb_build_object(...)`, which REPLACES the whole permissions
-- object. Repeating that here would silently strip everything granted to
-- these roles since 2026-04-21. `permissions || jsonb_build_object(...)`
-- adds the two keys and leaves every other grant untouched.
--
-- SECOND-TABLE EFFECT, STATED ON PURPOSE
-- --------------------------------------
-- `campus_living.gate_passes.edit` also gates `hostel_access_log` (its live
-- policies key on the same permission, and permissions.ts labels the key
-- "Edit Gate Passes & Gate Access Log"). Granting it opens the gate access
-- log to these three roles as well. For a guard that is almost certainly
-- wanted — it is the log of the movements they are recording — but it is a
-- second table's worth of access and should not be discovered later.
-- Note hostel_access_log's RLS ALSO requires role_has_block_access(block_id),
-- so a warden still only sees their own block there.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- No policy is created, altered or dropped. No table is touched. The live
-- gate-pass policies already express the right rule; the rule simply had no
-- holders. Deliberately no new policy: the live policies on this table have
-- diverged from 20260421000002 (that migration's Phase 2b classified
-- hostel_gate_passes as block-scoped and generated a
-- role_has_block_access(block_id) clause, but the table has no block_id and
-- the live dump in rls_initplan_wrap_sweep.sql shows the policies WITHOUT
-- that clause). Read live pg_policies before writing any policy here.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_role   text;
  v_roles  text[] := ARRAY['gate_security', 'warden', 'chief_warden'];
  v_hit    int;
  v_total  int := 0;
BEGIN
  FOREACH v_role IN ARRAY v_roles LOOP
    UPDATE public.custom_roles
       SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
             'campus_living.gate_passes.view', true,
             'campus_living.gate_passes.edit', true
           ),
           updated_at  = now()
     WHERE role_key = v_role;

    GET DIAGNOSTICS v_hit = ROW_COUNT;
    v_total := v_total + v_hit;

    IF v_hit = 0 THEN
      RAISE EXCEPTION
        'custom_roles has no role_key %. Gate-pass grant aborted rather than silently skipped.', v_role;
    END IF;
  END LOOP;

  -- A guard whose grant did not land looks identical to a guard who was
  -- never granted: the screen is simply empty. Fail loudly instead.
  IF v_total <> array_length(v_roles, 1) THEN
    RAISE EXCEPTION 'Expected % role updates, applied %.', array_length(v_roles, 1), v_total;
  END IF;

  RAISE NOTICE 'Gate-pass view+edit granted to % roles.', v_total;
END $$;

COMMIT;

-- ============================================================================
-- VERIFY — read it back, do not trust an empty result set.
--
--   SELECT role_key,
--          permissions ->> 'campus_living.gate_passes.view' AS can_view,
--          permissions ->> 'campus_living.gate_passes.edit' AS can_edit
--     FROM public.custom_roles
--    WHERE role_key IN ('gate_security', 'warden', 'chief_warden');
--
-- Expected: three rows, both columns 'true'.
--
-- Then verify BEHAVIOURALLY, not structurally: sign in as a real
-- gate_security account, confirm the Gate Passes item now renders in the
-- sidebar, open /campus-living/gate-passes/scan, scan a card and complete
-- one movement. A super-admin login bypasses every predicate above and will
-- make a broken screen look finished.
-- ============================================================================
