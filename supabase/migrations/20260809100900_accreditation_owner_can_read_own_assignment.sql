-- ============================================================================
-- Let a named accreditation owner READ the row that names them.
--
-- Date: 2026-08-02
-- Status: ✅ APPLIED TO PRODUCTION 2026-08-04 under Director authorisation.
--         Rehearsed in BEGIN..ROLLBACK; residue verified 0 in a SEPARATE call.
--         Pre-checked that the live policy is named exactly
--         accred_metric_owners_select, so DROP..CREATE replaces it in place
--         rather than leaving a second permissive policy beside it — verified
--         after apply by catalog: still 2 policies on the table, and only the
--         SELECT one carries the owner_user_id self-read. The new predicate is
--         a strict superset of the old (it adds owner_user_id = auth.uid()
--         and nothing else), so no reader lost access.
-- Companion to: /accreditation/my-gaps (the per-owner worklist)
--
-- THE PROBLEM
-- -----------
-- The live SELECT policy on public.accreditation_metric_owners is, verbatim
-- from pg_policies on 2026-08-02:
--
--     is_super_admin()
--     OR is_admin()
--     OR (user_has_permission('accreditation.naac.narrative.view')
--         AND role_has_institution_access(institution_id))
--
-- It carries NO clause for the person the row is about. An owner who does not
-- hold accreditation.naac.narrative.view cannot read their own assignment.
--
-- Measured on the live role table the same day:
--   accreditation.view                 → 6 roles  (ceo, registrar, coo,
--                                        accreditation_officer, principal, hod)
--   accreditation.naac.narrative.view  → 5 roles  (the same, minus ceo)
--
-- So `ceo` — and every Senior Learner, warden or coordinator IQAC might name as
-- an owner — can open the worklist page and is structurally unable to see a
-- single one of their own assignments. RLS denial is silent (zero rows, no
-- error), so the page cannot tell that apart from owning nothing, and would
-- tell an owner "nothing is assigned to you" while work sat against their name.
--
-- WHY THIS IS THE NARROWEST POSSIBLE FIX
-- --------------------------------------
-- The clause added below is `owner_user_id = (select auth.uid())`. It grants
-- exactly one thing: the ability to see rows that already name you. It gives no
-- cross-visibility of anyone else's workload, and it is a SELECT clause only —
-- assigning stays where it was, behind accreditation.naac.narrative.manage on
-- the separate FOR ALL policy, which is untouched here.
--
-- This is deliberately NOT the usual "widen the permission" move, which would
-- be wrong: answering an assignment is not the same act as making one, and
-- handing every prospective owner the manage key would let each of them
-- reassign anybody. The same reasoning already produced the SECURITY DEFINER
-- fn_accreditation_acknowledge_ownership, which lets an owner ANSWER without
-- holding manage (Director decision 8, 2026-08-01). This migration closes the
-- half of that decision that was left open: an owner could answer, but could
-- not SEE what they were answering.
--
-- Precedent in this same schema: the sibling table
-- public.accreditation_metric_narratives has carried `OR owner_user_id =
-- auth.uid()` in its SELECT policy since 20260725071500. The owners table was
-- simply never given the matching clause.
--
-- The (select auth.uid()) wrapper matches the initplan-optimised form the rest
-- of these policies were rewritten into by rls_initplan_wrap_sweep.sql, so the
-- planner evaluates it once per statement rather than once per row.
--
-- NO SECURITY DEFINER FUNCTION IS CREATED OR REPLACED BY THIS FILE, so there is
-- no anon/PUBLIC grant to re-assert. The table's own grants are untouched.
--
-- Verify after applying (as a real owner, not as service_role):
--   select id, body_code, metric_code, assignment_status
--     from public.accreditation_metric_owners;
--   -- must return that person's own rows and nobody else's.
-- ============================================================================

DROP POLICY IF EXISTS accred_metric_owners_select ON public.accreditation_metric_owners;

CREATE POLICY accred_metric_owners_select ON public.accreditation_metric_owners
  FOR SELECT USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    -- The person this row names can always read it. Self-scoped: this returns
    -- nobody else's assignments to them.
    OR owner_user_id = (SELECT auth.uid())
    OR ((SELECT user_has_permission('accreditation.naac.narrative.view'))
        AND role_has_institution_access(institution_id))
  );

COMMENT ON POLICY accred_metric_owners_select ON public.accreditation_metric_owners IS
  'Admins and accreditation.naac.narrative.view holders read their institutions'' rows; the named owner always reads their own. Self-read added 2026-08-02 for /accreditation/my-gaps — without it an assigned owner reads zero rows silently and is told nothing is assigned to them.';
