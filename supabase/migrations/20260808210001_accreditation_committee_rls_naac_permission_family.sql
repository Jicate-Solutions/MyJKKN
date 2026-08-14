-- 2026-08-01 FIX: realign IQAC committee RLS onto the GRANTABLE permission family.
--
-- WHY
-- The IQAC committee module has been unusable by anyone except is_super_admin()
-- / is_admin() since the compliance-unification substrate landed
-- (20260417000001_compliance_unification_substrate.sql). Two permission
-- families were introduced for the same feature and only one of them is real:
--
--   * accreditation.naac.committees.view / .create / .edit / .delete
--     — registered in lib/constants/permissions.ts, therefore grantable from
--       Role Management, and already used by the UI
--       (app/(routes)/accreditation/naac/committees/**) and by the RLS on
--       accreditation_committee_meetings + accreditation_committee_resolutions.
--
--   * accreditation.committees.view / .create / .edit / .delete   <-- NO naac segment
--     — used ONLY by the RLS on accreditation_committees and
--       accreditation_committee_members. These keys appear in ZERO rows of
--       custom_roles.permissions and in ZERO lines of
--       lib/constants/permissions.ts, so Role Management cannot grant them and
--       no role can ever satisfy them.
--
-- CONSEQUENCE: role `ceo` — the only role holding
-- accreditation.naac.committees.view = true — can open the committees page but
-- every read of accreditation_committees is denied by RLS. The page renders and
-- the query returns nothing.
--
-- FIX: point the eight policies at the grantable family. The duplicate
-- accreditation.committees.* family is deliberately NOT added to
-- permissions.ts — registering it would entrench the duplicate; removing it is
-- the point.
--
-- SHAPE PRESERVED EXACTLY. These expressions are the live production
-- expressions (read back into supabase/migrations/rls_initplan_wrap_sweep.sql
-- on 2026-07-31, which wrapped the per-row-constant helper calls in scalar
-- sub-selects for the InitPlan optimisation). The ONLY edit below is the
-- permission-key string inside each user_has_permission() call — the
-- is_super_admin() OR is_admin() OR (...) shape, the sub-select wrapping and
-- the role_has_institution_access(institution_id) conjunct are byte-identical
-- to what is live today.
--
-- NOT A GRANT. This migration changes which key is CHECKED, not who HOLDS it.
-- No role gains access here; granting accreditation.naac.committees.* to a role
-- is a separate Director decision made in Role Management.
--
-- FILE ONLY — not applied. Director-gated per CLAUDE.md.
--
-- RENAME-SAFE: 20260808210000 -> 20260808210001 — the eight expressions in this file were read back from LIVE production into supabase/migrations/rls_initplan_wrap_sweep.sql on 2026-07-31, and all eight there still name the UNGRANTABLE `accreditation.committees.*` family (members_select/committees_select .view, the four .edit, .create, .delete). That is a dated production capture showing this realignment had NOT run. supabase/SQL_FILE_INDEX.md has recorded it as "FILE ONLY, not applied" since it was written. Section 0 below independently refuses to apply if the two SELECT policies have since moved on.
--
-- ---------------------------------------------------------------------------
-- 2026-08-13 — RENUMBERED 20260808210000 -> 20260808210001, AND GUARDED
-- ---------------------------------------------------------------------------
-- This file used to share version 20260808210000 with
-- 20260808210000_soi_programme_coordinator_role.sql. The ledger keys on the
-- timestamp alone, so one version string could only ever represent one of the
-- two files and the other was permanently shadowed. Director decision
-- 2026-08-13: rename THIS file off the collision and leave the SoI file alone.
--
-- The new version is deliberately 210001 and not a fresh timestamp at the end
-- of the queue. 20260809102300_committee_roster_access.sql (APPLIED to
-- production 2026-08-05) rewrites `committees_select` and `members_select` to
-- add a roster arm, and `ALTER POLICY` REPLACES the whole expression rather
-- than adding to it. Sorting this file AFTER that one would make a from-scratch
-- replay silently drop the roster arm. 210001 keeps this file where it has
-- always sorted: before 20260809102300, where replay order is correct.
--
-- WHY THE GUARD EXISTS — READ FROM PRODUCTION 2026-08-13, NOT INFERRED.
-- The two SELECT policies that are LIVE on production today carry an arm this
-- file does not declare:
--
--   committees_select  LIVE = ... OR fn_user_is_committee_member(id)
--   members_select     LIVE = ... OR fn_user_is_committee_member(committee_id)
--                                 OR (user_id = auth.uid())
--
-- put there by 20260809102300_committee_roster_access.sql (applied 2026-08-05).
-- `ALTER POLICY` REPLACES the whole expression rather than adding to it, so
-- replaying this file against production would REMOVE that arm and lock every
-- committee member out of their own committee. The other six policies
-- (committees_insert/update/delete, members_insert/update/delete) match this
-- file exactly, so only those two are at risk — and they are the two that
-- matter.
--
-- THE SHARED VERSION WAS NEVER A SHIELD. supabase_migrations.schema_migrations
-- has NO row for 20260808210000 (checked against production 2026-08-13), so a
-- `supabase db push` has ALWAYS been free to attempt this file. The rename does
-- not remove a protection that existed; the protection never existed, and the
-- guard below is the first one this file has ever had.
--
-- So the guard refuses to run in exactly the state production is in. On a
-- genuinely from-scratch replay the roster arm is not yet present, the guard is
-- a no-op, and the eight statements run — correct in both directions.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 0. GUARD AND WRITES ARE ONE STATEMENT — ON PURPOSE
-- ---------------------------------------------------------------------------
-- The refusal and the eight ALTER POLICY statements live inside a SINGLE
-- DO block. A standalone guard block followed by eight bare ALTER POLICY
-- statements DOES NOT GUARD, and this was demonstrated by execution rather
-- than argued: under a non-transactional runner — `psql -f` at DEFAULT
-- settings (no ON_ERROR_STOP), and the Management API hand-apply path this
-- repo actually uses — the RAISE prints as an error, the runner moves to the
-- next statement, and all eight ALTERs execute anyway. Measured on the
-- production-shaped fixture: roster arm present on both SELECT policies
-- BEFORE, absent from both AFTER, psql exit code 0. A guard that the caller
-- can walk past by not passing a flag is not a guard.
--
-- A DO block is ONE statement to the server. When the RAISE EXCEPTION fires,
-- the entire block aborts and the EXECUTEs below it provably never run —
-- whatever the caller's ON_ERROR_STOP setting is. It also makes the eight
-- writes atomic with each other: if the fifth ALTER fails, the first four roll
-- back rather than leaving the policy set half-realigned.
--
-- No BEGIN;/COMMIT; of our own — an inner COMMIT would defeat the
-- BEGIN .. ROLLBACK rehearsal this repo depends on before any apply.
--
-- The eight expressions inside the EXECUTE literals are byte-identical to the
-- bare ALTER POLICY statements they replace; dollar quoting ($sql$) means the
-- embedded single quotes are not re-escaped and so cannot drift.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  v_roster_live text;
BEGIN
  -- REFUSE — the live policies carry an arm this file does not declare.
  SELECT string_agg(policyname, ', ') INTO v_roster_live
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('accreditation_committees', 'accreditation_committee_members')
     AND policyname IN ('committees_select', 'members_select')
     AND COALESCE(qual, '') LIKE '%fn_user_is_committee_member%';

  IF v_roster_live IS NOT NULL THEN
    RAISE EXCEPTION
      'refusing to apply: % already carry the roster arm from 20260809102300_committee_roster_access.sql, and ALTER POLICY would replace the whole expression and silently drop it — locking every committee member out of their own committee. That file already uses the grantable accreditation.naac.committees.* family, so this realignment is redundant on this database — mark this version applied instead of running it.',
      v_roster_live;
  END IF;

  -- WRITE — unreachable unless the guard above declined to raise.
  -- accreditation_committees
  EXECUTE $sql$ALTER POLICY "committees_select" ON public.accreditation_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))))$sql$;

  EXECUTE $sql$ALTER POLICY "committees_insert" ON public.accreditation_committees WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))))$sql$;

  EXECUTE $sql$ALTER POLICY "committees_update" ON public.accreditation_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))))$sql$;

  EXECUTE $sql$ALTER POLICY "committees_delete" ON public.accreditation_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))))$sql$;

  -- accreditation_committee_members
  -- (no institution_id column of its own — scope is inherited through the
  --  parent committee row, which is itself institution-scoped above)
  EXECUTE $sql$ALTER POLICY "members_select" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission)))$sql$;

  EXECUTE $sql$ALTER POLICY "members_insert" ON public.accreditation_committee_members WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.edit'::text) AS user_has_permission)))$sql$;

  EXECUTE $sql$ALTER POLICY "members_update" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.edit'::text) AS user_has_permission)))$sql$;

  EXECUTE $sql$ALTER POLICY "members_delete" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.edit'::text) AS user_has_permission)))$sql$;

  RAISE NOTICE 'accreditation committee RLS realigned onto accreditation.naac.committees.* (8 policies)';
END
$do$;

-- ---------------------------------------------------------------------------
-- Verification (run AFTER apply; expects 0 rows from the first query and the
-- naac family from the second)
-- ---------------------------------------------------------------------------
-- -- 1. no policy anywhere still checks the ungrantable family:
-- SELECT schemaname, tablename, policyname
-- FROM   pg_policies
-- WHERE  (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%accreditation.committees.%';
--
-- -- 2. the eight realigned policies now read the grantable family:
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM   pg_policies
-- WHERE  tablename IN ('accreditation_committees', 'accreditation_committee_members')
-- ORDER  BY tablename, policyname;
--
-- -- 3. which roles actually hold the grantable keys (0 before the separate
-- --    Director grant, except `ceo` which already holds .view):
-- SELECT role_key, role_name,
--        permissions -> 'accreditation.naac.committees.view'   AS v,
--        permissions -> 'accreditation.naac.committees.create' AS c,
--        permissions -> 'accreditation.naac.committees.edit'   AS e,
--        permissions -> 'accreditation.naac.committees.delete' AS d
-- FROM   custom_roles
-- WHERE  permissions ?| ARRAY[
--          'accreditation.naac.committees.view',
--          'accreditation.naac.committees.create',
--          'accreditation.naac.committees.edit',
--          'accreditation.naac.committees.delete'
--        ];
