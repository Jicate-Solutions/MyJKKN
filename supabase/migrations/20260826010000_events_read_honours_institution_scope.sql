-- ============================================================================
-- events_auth_read: honour custom_roles.institution_scope = 'all'
--
-- Date: 2026-08-17
--
-- SYMPTOM
--   A role configured in Role Management as "Institution Access Scope =
--   All Institutions (Cross-institutional)" still sees only its own
--   institution's events. Reported for `induction_lead`; the Induction module
--   reads the `events` table (induction programmes ARE events), so the events
--   SELECT policy is what actually decides visibility.
--
--   Measured live 2026-08-17: krishnaveni_a@jkkn.ac.in holds `induction_lead`
--   as their PRIMARY role with institution_scope='all' and can see 11 of 49
--   events — their own institution only.
--
-- ROOT CAUSE
--   The live events_auth_read predicate is:
--       is_super_admin()
--    OR get_current_user_role() = ANY('super_admin','admin','administrator','event_coordinator')
--    OR institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
--
--   It never consults institution_scope. There is no branch anywhere in it that
--   could return true for a cross-institutional role, so the Role Management
--   setting is inert for this table. (`get_current_user_role()` is additionally
--   primary-only — `SELECT role FROM profiles` — and its hardcoded list does not
--   contain induction_lead, so that branch cannot help either.)
--
-- THE FIX — ADDITIVE ONLY
--   Append one OR branch calling user_has_all_institution_access(), which is the
--   platform's existing STABLE SECURITY DEFINER helper for exactly this question:
--
--       SELECT EXISTS (SELECT 1 FROM user_roles ur
--                      JOIN custom_roles cr ON cr.id = ur.role_id
--                      WHERE ur.user_id = auth.uid() AND cr.institution_scope = 'all')
--
--   It reads user_roles, so it honours institution_scope on SECONDARY roles too
--   (8 of the 9 induction-role holders carry the role as non-primary).
--
--   Every pre-existing branch is reproduced VERBATIM. No user loses access:
--   the own-institution branch is untouched, so this can only ever widen.
--
-- BLAST RADIUS (measured, not estimated)
--   164 users hold at least one institution_scope='all' role. They gain SELECT
--   on events outside their own institution — 49 events across 9 institutions
--   today. Largest holder groups: staff_counselor (52), admission_counselor (41),
--   super_admin (12, already unaffected via the is_super_admin branch),
--   learner_counselor (11). This is the documented meaning of "Cross-institutional".
--
-- NOT IN SCOPE (deliberately — see the same defect, decide separately)
--   events_auth_insert and events_auth_update hardcode own-institution in the
--   same way, so a cross-institutional role still cannot CREATE or EDIT an event
--   for another institution. Fixing reads without writes is the correct minimal
--   response to the reported symptom; the write side is a separate decision
--   because it grants mutation, not just visibility.
--
--   events_auth_delete already calls role_has_institution_access(institution_id),
--   so after this migration SELECT and DELETE finally agree on this table.
--
-- InitPlan NOTE
--   The new call is wrapped as (SELECT ...) to match the surrounding branches and
--   the repo's rls_initplan_wrap convention, so the planner folds it into a
--   once-per-statement InitPlan rather than evaluating it per row.
-- ============================================================================

DROP POLICY IF EXISTS events_auth_read ON public.events;

CREATE POLICY events_auth_read ON public.events
FOR SELECT
USING (
    (SELECT public.is_super_admin())
    OR ((SELECT public.get_current_user_role()) = ANY (ARRAY[
          'super_admin'::text, 'admin'::text, 'administrator'::text, 'event_coordinator'::text
        ]))
    OR (institution_id IN (
          SELECT profiles.institution_id
            FROM public.profiles
           WHERE profiles.id = (SELECT auth.uid())
             AND profiles.institution_id IS NOT NULL
        ))
    -- NEW: honours Role Management "All Institutions (Cross-institutional)".
    OR (SELECT public.user_has_all_institution_access())
);

NOTIFY pgrst, 'reload schema';
