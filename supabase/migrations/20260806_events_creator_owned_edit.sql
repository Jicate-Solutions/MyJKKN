-- Events — creator-owned edit (2026-08-06)
--
-- THE MODEL. Whoever creates an event edits it; everyone else reads it; super
-- admins do anything. Event in-charges keep their own write path — that is a
-- SEPARATE permissive policy (events_incharge_update) and permissive policies
-- OR together, so nothing here touches the tournament in-charge model.
--
-- WHAT WAS THERE. events_auth_update ended in the same clause the DELETE policy
-- did before 20260806_events_delete_permission_gate.sql:
--
--     OR institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
--
-- i.e. every user in an institution could edit every event in it. That is the
-- behaviour being replaced.
--
-- THE GRANDFATHER CLAUSE, AND WHY. `created_by` is NULL on 37 of the 40 live
-- events: no insert path ever set it (only the induction module did, 3 rows) and
-- the column had no default. A bare `created_by = auth.uid()` rule would
-- therefore leave 37 events with no editor but a super admin — every marathon
-- and tournament console included. So NULL keeps EXACTLY the old institution
-- rule, spelled out verbatim below rather than routed through
-- role_has_institution_access(), which is wider: that helper returns true for
-- any holder of an institution_scope='all' role, which would hand cross-
-- institution edit to roles that never had it. Grandfather means unchanged.
--
-- Rows converge on their own: with the DEFAULT added below, every new event has
-- a real owner and is creator-locked from birth. The 37 legacy rows can be
-- assigned an owner at any time — fn_guard_event_privileged_fields already lets
-- super_admin / admin / administrator / event_coordinator set created_by, and
-- locks everyone else out of changing it.

-- ---------------------------------------------------------------------------
-- 1. Every future event gets an owner.
-- ---------------------------------------------------------------------------
-- A column default rather than a line in each service: there are at least four
-- insert paths (the /events/create wizard, tournament, marathon, induction) and
-- a default is the only thing the fifth one cannot forget. Server-side inserts
-- on the service-role key have no auth.uid() and land NULL, which the
-- grandfather clause already handles.

ALTER TABLE public.events
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- ---------------------------------------------------------------------------
-- 2. UPDATE: creator, super admin, or a legacy row under the old rule.
-- ---------------------------------------------------------------------------
-- No WITH CHECK: for UPDATE, Postgres reuses USING as the check when WITH CHECK
-- is omitted, which is what we want — you cannot edit a row into someone else's
-- ownership. (fn_guard_event_privileged_fields independently freezes
-- created_by / institution_id / event_type on UPDATE.)

DROP POLICY IF EXISTS events_auth_update ON public.events;

CREATE POLICY events_auth_update ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR events.created_by = (SELECT auth.uid())
    OR (
      events.created_by IS NULL
      AND events.institution_id IN (
        SELECT p.institution_id
          FROM public.profiles p
         WHERE p.id = (SELECT auth.uid())
           AND p.institution_id IS NOT NULL
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. INSERT: you may not create an event owned by somebody else.
-- ---------------------------------------------------------------------------
-- fn_guard_event_privileged_fields freezes created_by, but it is a BEFORE
-- UPDATE trigger — it never sees an INSERT. Without this clause the column
-- default is merely a suggestion: a client can post created_by explicitly and
-- either plant an event under another user's name or, by nominating a colleague,
-- lock themselves out of the row they just made.
--
-- WHO MAY CREATE IS UNCHANGED — the first conjunct is the previous policy
-- verbatim, hardcoded role names and all. Rewriting the create rule is not part
-- of this change; it is called out here so the role names are not mistaken for
-- new work.

DROP POLICY IF EXISTS events_auth_insert ON public.events;

CREATE POLICY events_auth_insert ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      (SELECT public.is_super_admin())
      OR (SELECT public.get_current_user_role()) = ANY (ARRAY['super_admin', 'admin', 'administrator'])
      OR institution_id IN (
        SELECT p.institution_id
          FROM public.profiles p
         WHERE p.id = (SELECT auth.uid())
           AND p.institution_id IS NOT NULL
      )
    )
    AND (
      created_by IS NULL
      OR created_by = (SELECT auth.uid())
      OR (SELECT public.is_super_admin())
    )
  );

COMMENT ON COLUMN public.events.created_by IS
  'Owner. Defaults to auth.uid(); the only non-super-admin who may edit the row '
  '(see events_auth_update). NULL on pre-2026-08-06 rows, which fall back to the '
  'old same-institution rule.';
