-- ─── Event tasks — tournament managers may write them on tournaments ────────
-- 2026-09-18 · BUG-004569, BUG-004565
--
-- The COO opened a tournament, saw the committee task box and the assignee
-- dropdown, typed a task, and got a row-level-security refusal. The UI and the
-- database disagreed about who manages a tournament:
--
--   UI  (useTournamentAccess, canManageTournament):
--       super admin OR sports.tournaments.manage OR event in-charge
--   RLS (fn_can_manage_committee_tasks):
--       super admin OR role in (super_admin, admin, administrator,
--       event_coordinator) OR event in-charge
--
-- sports.tournaments.manage is held by coo, sports_coordinator and jicate_staff
-- — none of them on the role list — so every committee-task insert they made
-- failed with 42501. fn_can_manage_event_level_tasks had the same gap, which is
-- why the Pending Tasks card told them "Only a super admin or the event
-- in-charge can change this list".
--
-- Both functions gain ONE arm: sports.tournaments.manage, and only when the
-- event is a sports_tournament. Marathon, induction, cultural and every other
-- event type keep exactly the authority they had. sports.tournaments.manage is
-- a manage key; students do not hold it (contrast events.view, which they do).
--
-- Everything else is the live body (pg_get_functiondef, 2026-09-18), unchanged.
-- fn_can_read_event_tasks calls fn_can_manage_event_level_tasks, so the same
-- people can now also read tournament tasks — they could already, through its
-- non-student institution arm.
--
-- ci:allow-secdef-authenticated SELF-SCOPED: both functions take only an event
-- id and answer whether auth.uid() may write that event's tasks. authenticated
-- must hold EXECUTE because the event_tasks RLS policies call them as the
-- signed-in user, and use-event-task-access.ts asks the same question.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

CREATE OR REPLACE FUNCTION public.fn_can_manage_committee_tasks(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.get_current_user_role() = ANY (
         ARRAY['super_admin', 'admin', 'administrator', 'event_coordinator']
       )
    OR public.fn_is_event_incharge(p_event_id)
    -- Tournament managers, on tournaments only (2026-09-18).
    OR (
      public.user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = p_event_id
          AND e.event_type = 'sports_tournament'
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_manage_committee_tasks(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_manage_committee_tasks(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_can_manage_committee_tasks(uuid) IS
  'Authority to add/edit/delete a committee prep-task. Super admin, admin/administrator/event_coordinator, the event in-charge, or — on a sports_tournament only — a holder of sports.tournaments.manage. Committee leads and assignees are granted separately.';

CREATE OR REPLACE FUNCTION public.fn_can_manage_event_level_tasks(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.fn_is_event_incharge(p_event_id)
    -- Induction keeps its per-event roster in its own table rather than in
    -- events.config->incharges. Guarded with to_regclass so this function still
    -- resolves on a database where the induction module was never installed.
    OR (
      to_regclass('public.induction_event_coordinators') IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.induction_event_coordinators c
        WHERE c.event_id = p_event_id
          AND c.user_id = (SELECT auth.uid())
      )
    )
    -- Tournament managers, on tournaments only (2026-09-18).
    OR (
      public.user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = p_event_id
          AND e.event_type = 'sports_tournament'
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_manage_event_level_tasks(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_manage_event_level_tasks(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
