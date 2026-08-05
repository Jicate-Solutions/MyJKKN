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

-- ---------------------------------------------------------------------------
-- accreditation_committees
-- ---------------------------------------------------------------------------
ALTER POLICY "committees_select" ON public.accreditation_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

ALTER POLICY "committees_insert" ON public.accreditation_committees WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

ALTER POLICY "committees_update" ON public.accreditation_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

ALTER POLICY "committees_delete" ON public.accreditation_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

-- ---------------------------------------------------------------------------
-- accreditation_committee_members
-- (no institution_id column of its own — scope is inherited through the parent
--  committee row, which is itself institution-scoped by the policies above)
-- ---------------------------------------------------------------------------
ALTER POLICY "members_select" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission)));

ALTER POLICY "members_insert" ON public.accreditation_committee_members WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.edit'::text) AS user_has_permission)));

ALTER POLICY "members_update" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.edit'::text) AS user_has_permission)));

ALTER POLICY "members_delete" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.edit'::text) AS user_has_permission)));

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
