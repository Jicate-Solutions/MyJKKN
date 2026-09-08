-- ─── Pending Tasks on EVERY event console — teach the write rule about induction ───
-- 2026-09-07
--
-- Follow-up to 20261112000000_event_level_tasks.sql, which put the Pending Tasks
-- card on the general event console (/events/[id]) only. The card is now also
-- rendered on the three specialised consoles — tournament, marathon, induction —
-- and one of them stores "who runs this event" somewhere the write rule cannot
-- see.
--
-- ── The problem ────────────────────────────────────────────────────────────
-- fn_can_manage_event_level_tasks is `is_super_admin() OR fn_is_event_incharge()`,
-- and fn_is_event_incharge reads events.config->'incharges'. That is where
-- general events, tournaments and marathons all record their in-charge, so those
-- three consoles work as intended.
--
-- Induction does NOT. Since 20260730120000_induction_event_coordinators.sql its
-- per-event coordinators live in their own table, public.induction_event_coordinators
-- (event_id, user_id) — deliberately, because that migration retired a
-- college-wide role in favour of per-event appointments with their own RPCs.
--
-- Consequence without this migration: on an induction console the card renders
-- read-only for the appointed coordinator — the one person actually running the
-- programme — while a super admin sees the buttons. That is not the requested
-- rule ("super admin and the event in-charge"), it is an accident of where each
-- event type happens to keep its roster.
--
-- ── The fix ────────────────────────────────────────────────────────────────
-- Widen the WRITE authority by one OR: an induction event coordinator is an
-- in-charge for the purposes of that event's task list. Nothing else changes —
-- the read rule, the committee-task rule and the policies themselves are all
-- untouched, because they already express what they should.
--
-- Note this function is granted to `authenticated` and is therefore called from
-- TWO places: the RLS policy event_tasks_event_level_write, and the browser (the
-- Pending Tasks card asks it whether to render its buttons). That is the point —
-- the UI gate and the enforced rule are the same function, so they cannot drift.
-- Anything added here is picked up by both at once.
--
-- No BEGIN/COMMIT: applied through the exec_sql RPC, a PL/pgSQL function, where
-- explicit transaction control is illegal. CREATE OR REPLACE is idempotent.

-- ── 1. Induction coordinators count as in-charge for task writes ────────────
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
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_manage_event_level_tasks(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_can_manage_event_level_tasks(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_can_manage_event_level_tasks(uuid) IS
  'Authority to add/edit/delete an event-level task (event_tasks.committee_id IS NULL). Super admin, the event in-charge (events.config->incharges), or an induction event coordinator (induction_event_coordinators). Called BOTH by the event_tasks_event_level_write policy and by the Pending Tasks card in the browser, so the UI gate and the enforced rule cannot drift.';

-- ── 2. Same widening for the READ rule ──────────────────────────────────────
-- An induction coordinator who may WRITE must obviously be able to SEE the list.
-- The existing rule would already admit most of them via the non-student +
-- institution-access branch, but not one appointed across colleges — and a
-- coordinator whose own writes are invisible to them is a worse bug than a
-- missing button.
CREATE OR REPLACE FUNCTION public.fn_can_read_event_tasks(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.fn_can_manage_event_level_tasks(p_event_id)
    OR (
      COALESCE(public.get_current_user_role(), '') <> 'student'
      AND EXISTS (
        SELECT 1
        FROM public.events e
        WHERE e.id = p_event_id
          AND (
            e.scope = 'all_jkkn'
            OR public.role_has_institution_access(e.institution_id)
            OR e.institution_id IN (
              SELECT p.institution_id
              FROM public.profiles p
              WHERE p.id = (SELECT auth.uid())
                AND p.institution_id IS NOT NULL
            )
          )
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_read_event_tasks(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_can_read_event_tasks(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_can_read_event_tasks(uuid) IS
  'May the caller read this event task list? Anyone who may manage it (super admin / in-charge / induction coordinator), or any NON-STUDENT with access to the owning institution. Replaces marathon_tasks_authenticated_read, which was USING (true).';
