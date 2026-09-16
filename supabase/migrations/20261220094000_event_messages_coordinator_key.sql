-- ─── Message registrants — admit the event coordinator ──────────────────────
-- 2026-09-16
--
-- fn_can_manage_event_messages (20261205083000) admits:
--
--     is_super_admin()
--     OR (is_admin() AND institution access)      -- is_admin() = profiles.role
--                                                 --   IN ('admin','super_admin','administrator')
--     OR fn_is_event_incharge(p_event_id)
--     OR events.created_by = auth.uid()
--
-- 'event_coordinator' is in none of those. Yet every other Event Logistics
-- policy — marathon_sponsors_auth_all, marathon_committees_auth_all,
-- marathon_incidents_auth_all, event_categories_auth_all, the budget one — uses
-- the list ARRAY['super_admin','admin','administrator','event_coordinator'],
-- which DOES include it.
--
-- So the role named for coordinating events can edit an event's sponsors, its
-- budget, its committees and its incidents, but cannot tell that event's
-- registrants the venue changed. That is an oversight in this one function, not
-- a decision — the four-name list and is_admin() simply drifted apart.
--
-- FIX: a key, following the pattern of events.registrations.view /
-- events.budget.manage / events.logistics.manage.
--
-- ── The institution test is KEPT, deliberately ──────────────────────────────
-- The new arm is institution-scoped, matching the existing is_admin() arm and
-- the function's own COMMENT: "this gate guards a registrant list and what was
-- said to it, so an admin of another college must not pass". Sending reaches
-- real people's notifications, so it stays narrower than the sponsor/budget
-- boards, whose four-name arm has no institution test at all.
--
-- CONSEQUENCE, stated plainly: granting this key does NOT let a coordinator
-- message an event at a college they cannot reach. A coordinator whose role is
-- institution_scope = 'own' and who sits at institution X still gets FALSE on an
-- event hosted by institution Y. That is the intended behaviour, not a failure
-- of this migration.
--
-- NOT granted to coo/cao — per the 2026-09-16 decision that Messages is an
-- operations tool for whoever runs the event, while executives direct the
-- organiser through Review Comments. A COO who must send can appoint themselves
-- in-charge, which the fn_is_event_incharge arm already admits.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

-- ── 1. The key ──────────────────────────────────────────────────────────────
-- administrator already passes via is_admin(); granting it here changes nothing
-- today and puts the right where Role Management can see it.
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object('events.messages.send', true),
       updated_at  = now()
 WHERE role_key IN ('event_coordinator', 'administrator')
   AND (permissions->>'events.messages.send')::boolean IS NOT TRUE;

-- ── 2. Widen the gate ───────────────────────────────────────────────────────
-- Same name and signature, so the RLS policy on event_registrant_messages and
-- the API route both pick this up with no further change.
CREATE OR REPLACE FUNCTION public.fn_can_manage_event_messages(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1
        FROM public.events e
        WHERE e.id = p_event_id
          AND (e.institution_id IS NULL OR public.role_has_institution_access(e.institution_id))
      )
    )
    OR public.fn_is_event_incharge(p_event_id)
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = p_event_id
        AND e.created_by = auth.uid()
    )
    -- Added 2026-09-16: granted in Role Management, over an institution the
    -- caller can actually reach. Same institution rule as the is_admin() arm.
    OR (
      public.user_has_permission('events.messages.send')
      AND EXISTS (
        SELECT 1
        FROM public.events e
        WHERE e.id = p_event_id
          AND (e.institution_id IS NULL OR public.role_has_institution_access(e.institution_id))
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_manage_event_messages(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_manage_event_messages(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_can_manage_event_messages(uuid) IS
  'Authority to send an event''s registrants a message and to read the log of what was already sent. Super admin; an admin WITH institution access to the event; the event in-charge (events.config->incharges); the event''s creator; or a holder of events.messages.send WITH institution access. Every non-super-admin arm is institution-tested — this gate guards a registrant list and what was said to it, so someone from another college must not pass. Deliberately not events.view.';

NOTIFY pgrst, 'reload schema';
