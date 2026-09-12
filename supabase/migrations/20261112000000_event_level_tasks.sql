-- ─── Event-level tasks — the event detail console's "Pending Tasks" card ─────
-- 2026-09-07
--
-- The events module already had a prep-task checklist (event_tasks, PR3), but it
-- was COMMITTEE-scoped: committee_id is NOT NULL, so a task could only exist
-- underneath an organising committee, and the only way to see one was Event
-- Logistics → Committees → expand a committee. A wizard-created lecture or
-- cultural programme that never formed committees therefore had nowhere at all
-- to record "book the auditorium" or "confirm the chief guest".
--
-- This migration promotes the SAME table to also hold tasks that belong to the
-- event itself (committee_id IS NULL), so the detail page can show one list —
-- standalone tasks plus every committee's pending tasks — instead of the module
-- growing a second, unrelated "tasks" table that would drift from this one.
--
-- ── The access rule, and why the old policies could not express it ──────────
-- Requirement: the card is READABLE by every role except students; only a super
-- admin or the event IN-CHARGE (events.config->'incharges', already resolved by
-- fn_is_event_incharge) may add or edit those tasks.
--
-- Neither half held before this migration:
--
--   * marathon_tasks_authenticated_read is `FOR SELECT USING (true)` — every
--     authenticated user, all 6,680 student profiles included, could read every
--     event's tasks.
--   * marathon_tasks_auth_all is `FOR ALL` with `WITH CHECK NULL` (so its USING
--     expression governs INSERT/UPDATE too), and its last branch matches anyone
--     whose profiles.institution_id equals the event's. That is a WRITE grant to
--     every student in the host institution.
--
-- Policies are OR'd, so neither could be narrowed by ADDING a policy — both have
-- to be replaced. That is done below.
--
-- ── Why the writes are split on committee_id rather than tightened globally ──
-- event_tasks is shared with the tournament/marathon Committees board, where
-- admins, event coordinators, committee leads and task assignees all legitimately
-- write today. Applying the strict super-admin/in-charge rule to the whole table
-- would silently break that board.
--
-- So the write policies discriminate on committee_id:
--   committee_id IS NULL      → the new event-level card. Strictly super admin or
--                               event in-charge. Exactly the requested rule.
--   committee_id IS NOT NULL  → committee prep-tasks. Existing rights preserved,
--                               MINUS the same-institution catch-all that was
--                               handing writes to students.
--
-- NULL semantics do the rest of the work for free: the surviving committee
-- policies are all of the form `committee_id IN (SELECT ...)`, and `NULL IN
-- (...)` evaluates to NULL — never true — so none of them can leak a write onto
-- an event-level row.

-- No BEGIN/COMMIT: this file reaches prod through the exec_sql RPC, a PL/pgSQL
-- function, and explicit transaction control is illegal inside one. The apply
-- script sends it in labelled chunks so a failure names its section, and every
-- statement below is idempotent, so a partial apply is repaired by re-running.

-- ── 1. A task may now belong to the event rather than to a committee ────────
ALTER TABLE public.event_tasks
  ALTER COLUMN committee_id DROP NOT NULL;

COMMENT ON COLUMN public.event_tasks.committee_id IS
  'The organising committee that owns this task, or NULL for an event-level task shown on the event detail page Pending Tasks card. Nullable since 2026-09-07; the write policies branch on it (NULL => super admin / event in-charge only).';

-- The card's only query is "pending tasks of this event", and the table is read
-- once per detail-page render.
CREATE INDEX IF NOT EXISTS idx_event_tasks_event_status
  ON public.event_tasks (event_id, status);

-- ── 2. Who may READ an event's tasks ────────────────────────────────────────
-- Super admin and the in-charge always (an in-charge may be from another
-- institution, and locking them out of their own event's list would be absurd).
-- Everyone else: any non-student with access to the owning institution.
--
-- Committee MEMBERS are deliberately absent here — they keep the separate,
-- committee_id-scoped marathon_tasks_committee_member_read policy, which is how
-- a student volunteer on a marathon committee keeps seeing that committee's
-- tasks without gaining sight of the event-level list.
CREATE OR REPLACE FUNCTION public.fn_can_read_event_tasks(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.fn_is_event_incharge(p_event_id)
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
  'May the caller read this event task list? Super admin, the event in-charge, or any NON-STUDENT with access to the owning institution. Replaces marathon_tasks_authenticated_read, which was USING (true).';

-- ── 3. Who may WRITE an EVENT-LEVEL task (committee_id IS NULL) ─────────────
-- The requested rule, and nothing wider. Note this excludes admins and event
-- coordinators by design: the card belongs to the person actually running the
-- event.
CREATE OR REPLACE FUNCTION public.fn_can_manage_event_level_tasks(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR public.fn_is_event_incharge(p_event_id);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_manage_event_level_tasks(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_can_manage_event_level_tasks(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_can_manage_event_level_tasks(uuid) IS
  'Authority to add/edit/delete an event-level task (event_tasks.committee_id IS NULL). Super admin or the event in-charge only — deliberately narrower than committee prep-task rights.';

-- ── 4. Who may WRITE a COMMITTEE task (committee_id IS NOT NULL) ────────────
-- The pre-existing marathon_tasks_auth_all role set, MINUS its same-institution
-- catch-all. Committee leads and task assignees are not listed because they keep
-- their own dedicated policies below.
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
    OR public.fn_is_event_incharge(p_event_id);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_manage_committee_tasks(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_can_manage_committee_tasks(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_can_manage_committee_tasks(uuid) IS
  'Authority to add/edit/delete a committee prep-task. Super admin, admin/administrator/event_coordinator, or the event in-charge. Committee leads and assignees are granted separately.';

-- ── 5. Replace the two over-broad policies ─────────────────────────────────
DROP POLICY IF EXISTS "marathon_tasks_authenticated_read" ON public.event_tasks;
DROP POLICY IF EXISTS "marathon_tasks_auth_all" ON public.event_tasks;

DROP POLICY IF EXISTS "event_tasks_read" ON public.event_tasks;
CREATE POLICY "event_tasks_read" ON public.event_tasks
  FOR SELECT TO authenticated
  USING (public.fn_can_read_event_tasks(event_id));

DROP POLICY IF EXISTS "event_tasks_event_level_write" ON public.event_tasks;
CREATE POLICY "event_tasks_event_level_write" ON public.event_tasks
  FOR ALL TO authenticated
  USING (committee_id IS NULL AND public.fn_can_manage_event_level_tasks(event_id))
  WITH CHECK (committee_id IS NULL AND public.fn_can_manage_event_level_tasks(event_id));

DROP POLICY IF EXISTS "event_tasks_committee_write" ON public.event_tasks;
CREATE POLICY "event_tasks_committee_write" ON public.event_tasks
  FOR ALL TO authenticated
  USING (committee_id IS NOT NULL AND public.fn_can_manage_committee_tasks(event_id))
  WITH CHECK (committee_id IS NOT NULL AND public.fn_can_manage_committee_tasks(event_id));

-- ── 6. Re-scope the assignee UPDATE policy to committee tasks ───────────────
-- marathon_tasks_member_update_own let `assigned_to = auth.uid()` update a row
-- with NO committee_id condition. Left alone, an event-level task assigned to a
-- student would be editable by that student — the one hole the committee_id
-- split does not close by itself, because this branch never mentions
-- committee_id. Recreated with the guard; committee behaviour is unchanged.
DROP POLICY IF EXISTS "marathon_tasks_member_update_own" ON public.event_tasks;
CREATE POLICY "marathon_tasks_member_update_own" ON public.event_tasks
  FOR UPDATE TO authenticated
  USING (
    committee_id IS NOT NULL
    AND (
      assigned_to = (SELECT auth.uid())
      OR assigned_to_name IN (
        SELECT p.full_name FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.full_name IS NOT NULL
      )
      OR committee_id IN (
        SELECT c.id FROM public.event_committees c
        WHERE c.lead_id = (SELECT auth.uid())
           OR c.lead_name IN (
                SELECT p.full_name FROM public.profiles p
                WHERE p.id = (SELECT auth.uid()) AND p.full_name IS NOT NULL
              )
      )
    )
  );

