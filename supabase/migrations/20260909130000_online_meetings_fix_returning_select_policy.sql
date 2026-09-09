-- Online Meetings — fix: INSERT ... RETURNING was refused for every non-super-admin.
--
-- THE BUG, found by simulating a real faculty member before shipping
--   `INSERT INTO online_meetings (...) RETURNING id` failed with 42501
--   "new row violates row-level security policy", even though every arm of the
--   INSERT policy evaluated TRUE for that user. The same INSERT without
--   RETURNING succeeded, and the row was then readable.
--
--   Cause: Postgres applies the SELECT policy as well as the INSERT policy
--   when RETURNING is used. The SELECT policy was
--       fn_om_is_host_or_manager(id) OR fn_om_is_participant(id)
--   and BOTH of those are SECURITY DEFINER functions that re-query
--   online_meetings / online_meeting_participants. Called while the INSERT is
--   still executing, they run against a snapshot that does not contain the row
--   being inserted, so both returned false and the row was rejected.
--
--   Blast radius was the whole module: OnlineMeetingService.create does
--   .insert(...).select(...).single(), which is exactly INSERT ... RETURNING.
--   Nobody but a super admin could have scheduled a meeting. It would have
--   looked like a permissions bug and been debugged as one.
--
-- THE FIX
--   Test the row's OWN columns for the host case instead of re-reading the
--   table to discover something the row already states. host_profile_id and
--   institution_id are right there in the new tuple, so no snapshot is
--   involved and RETURNING works. fn_om_is_participant stays as the last arm:
--   a participant row cannot exist for a meeting that does not exist yet, so
--   it is never the deciding arm on an INSERT, and on ordinary reads it is
--   evaluated only after the cheaper column tests have failed.
--
--   This is also faster. The common case — the host opening their own meeting —
--   now costs a column comparison rather than a SECURITY DEFINER round trip
--   per row.
--
-- WHY ONLY THIS TABLE
--   The child tables (participants, attendance, polls, agenda, minutes, action
--   items) also use fn_om_is_host_or_manager in their SELECT policies, but it
--   reads online_meetings — a DIFFERENT table whose row was committed by an
--   earlier statement. Their RETURNING is unaffected; verified after this
--   change by inserting a participant, a poll and an agenda item as the same
--   non-admin user, each with RETURNING, and by confirming an unrelated
--   faculty member still sees zero rows across all four tables.

DROP POLICY IF EXISTS online_meetings_select ON public.online_meetings;
CREATE POLICY online_meetings_select ON public.online_meetings
  FOR SELECT TO authenticated
  USING (
    host_profile_id = (SELECT auth.uid())
    OR (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('onlineMeeting:manage.all'))
      AND public.role_has_institution_access(institution_id)
    )
    OR public.fn_om_is_participant(id)
  );

-- UPDATE's WITH CHECK has the same shape of problem in reverse: on
-- UPDATE ... RETURNING the SELECT policy above now passes on the new tuple's
-- own columns, but the WITH CHECK still re-read the table. Same treatment, and
-- for the same reason.
DROP POLICY IF EXISTS online_meetings_update ON public.online_meetings;
CREATE POLICY online_meetings_update ON public.online_meetings
  FOR UPDATE TO authenticated
  USING (public.fn_om_is_host_or_manager(id))
  WITH CHECK (
    host_profile_id = (SELECT auth.uid())
    OR (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('onlineMeeting:manage.all'))
      AND public.role_has_institution_access(institution_id)
    )
  );
