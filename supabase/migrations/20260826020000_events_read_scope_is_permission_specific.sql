-- ci:allow-secdef-anon  Creates fn_has_all_institution_access_for(), which is
--   called ONLY from inside RLS policy expressions. A policy predicate is
--   evaluated with the QUERYING role's privileges, so anon must retain EXECUTE
--   or every anon-reachable policy that calls it throws permission-denied —
--   the failure mode documented at supabase/setup/03_policies.sql:3083. The
--   function answers only about auth.uid() (NULL for anon ⇒ false), so it is
--   not an oracle and discloses nothing to an anonymous caller.
--
-- ============================================================================
-- Make cross-institutional access PERMISSION-SPECIFIC, not blanket.
--
-- Date: 2026-08-17
-- Supersedes the events branch added by 20260826010000.
--
-- WHAT WENT WRONG WITH 20260826010000
--   That migration added `OR user_has_all_institution_access()` to
--   events_auth_read. That helper asks only:
--
--       "does this user hold ANY role with institution_scope = 'all'?"
--
--   It is MODULE-BLIND. It cannot tell whether the scope='all' role has
--   anything to do with events. Measured consequence, live:
--
--     testfacilitator@jkkn.ac.in holds
--         faculty            scope=own   (primary)
--         ai_pulse_champion  scope=all   (secondary)
--
--     ai_pulse_champion's 40 permission keys are aiPulse:*, health.*,
--     calendar.view and hr.*_own. It holds NO events key and NO induction key.
--     Its scope='all' means "AI Pulse cycles run across colleges" — it was
--     never meant to confer visibility of every college's events.
--
--     Yet that user could see all 49 events across 9 institutions, including
--     28 drafts, purely because one unrelated role was marked cross-institutional.
--
--   164 users hold at least one scope='all' role. Under 20260826010000 every one
--   of them reads every event on the platform regardless of what that role is for.
--
-- THE CORRECTED RULE
--   Cross-institutional breadth must be granted by the role that actually
--   carries the relevant permission — scope is evaluated PER PERMISSION, not
--   globally:
--
--       a role widens your institution scope for X
--       only if that same role also grants X.
--
--   Verified against live data:
--     induction_lead      scope=all  holds induction.view + induction.manage  → WIDENS ✅
--     ai_pulse_champion   scope=all  holds neither                            → does NOT widen ✅
--     faculty             scope=own  (irrelevant)                             → own institution ✅
--
--   That is exactly the reported expectation: removing Induction Lead should
--   remove cross-institution induction visibility, and it now does.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_has_all_institution_access_for(
    VARIADIC permission_keys text[]
)
RETURNS boolean
LANGUAGE sql
STABLE                 -- STABLE so the planner folds it into a once-per-statement
                       -- InitPlan instead of re-evaluating per row.
SECURITY DEFINER       -- must read user_roles/custom_roles regardless of caller RLS
SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM user_roles ur
          JOIN custom_roles cr ON cr.id = ur.role_id
         WHERE ur.user_id = (SELECT auth.uid())
           AND cr.institution_scope = 'all'
           AND EXISTS (
                 SELECT 1
                   FROM unnest(fn_has_all_institution_access_for.permission_keys) AS k
                  WHERE (cr.permissions ->> k)::boolean = true
               )
    );
$function$;

COMMENT ON FUNCTION public.fn_has_all_institution_access_for(text[]) IS
  'True when the caller holds a role that BOTH has institution_scope=''all'' AND grants at least one of the given permission keys. Reads user_roles, so it honours secondary roles. Use instead of user_has_all_institution_access(), which is module-blind.';

-- Rewrite the events read policy to use it. Every pre-existing branch verbatim;
-- only the blanket branch from 20260826010000 is replaced.
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
    -- Cross-institutional ONLY for a scope='all' role that actually grants an
    -- events/induction permission. Replaces the module-blind branch.
    OR (SELECT public.fn_has_all_institution_access_for(
          'events.view', 'induction.view', 'induction.manage'))
);

NOTIFY pgrst, 'reload schema';
