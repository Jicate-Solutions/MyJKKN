-- ============================================================================
-- events_auth_insert — honour institution scope on CREATE
-- ----------------------------------------------------------------------------
-- SYMPTOM (2026-09-22): a Chief Executive Officer (custom role `ceo`,
-- institution_scope = 'all', profile institution = CET) creating an event on
-- /events/create with Host Institution = CAS (Aided) got
--   "new row violates row-level security policy for table events".
--
-- CAUSE: events_auth_insert only admitted super_admin / admin / administrator,
-- fn_is_assigned_administrator(), or host institution_id = the caller's OWN
-- profiles.institution_id. A cross-institutional role hosting under any other
-- college was rejected. 20260826010000 fixed the same defect for SELECT and
-- deliberately left INSERT/UPDATE as a separate decision; this is that
-- decision for INSERT. events_auth_delete already calls
-- role_has_institution_access(institution_id), so after this migration
-- SELECT, INSERT and DELETE agree on who may act for which institution.
--
-- The created_by guard is unchanged: a row may only be stamped with the
-- caller's own uid (or NULL, or by a super admin).
-- ============================================================================

DROP POLICY IF EXISTS events_auth_insert ON public.events;

CREATE POLICY events_auth_insert ON public.events
FOR INSERT TO authenticated
WITH CHECK (
    (
        (SELECT public.is_super_admin())
        OR ((SELECT public.get_current_user_role()) = ANY (ARRAY[
              'super_admin'::text, 'admin'::text, 'administrator'::text
            ]))
        OR (SELECT public.fn_is_assigned_administrator())
        OR (institution_id IN (
              SELECT p.institution_id FROM public.profiles p
               WHERE p.id = (SELECT auth.uid()) AND p.institution_id IS NOT NULL
            ))
        -- NEW: cross-institutional roles (institution_scope = 'all'), CAS
        -- siblings and user_institution_access grants — same helper DELETE uses.
        OR (SELECT public.role_has_institution_access(institution_id))
    )
    AND (
        created_by IS NULL
        OR created_by = (SELECT auth.uid())
        OR (SELECT public.is_super_admin())
    )
);
