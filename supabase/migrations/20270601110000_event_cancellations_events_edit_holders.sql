-- Events — holders of events.edit may record a cancellation (Director's ruling
-- 29 Sep 2026: "if you can edit, you can cancel")
--
-- ⚠️ DEPENDS ON 20261204113700_events_cancellation_reason_and_stamp.sql BEING
-- APPLIED (#4098). That file creates public.event_cancellations and the three
-- policies altered here; this one fails on a database without them. The wave
-- applies pending files in version order, so it runs after that file.
--
-- WHY. #4086 (28 Sep) added events_edit_permission_update: a holder of
-- events.edit may UPDATE any event at an institution their role reaches. The
-- cancel button writes TWO things — a row in event_cancellations first, then
-- events.status — and that table's policies were written on 13 Sep, before
-- events.edit existed. So an events.edit holder who is not the creator, the
-- in-charge or a super admin could edit the event but every cancel failed at the
-- first write ("Could not record why this event is being cancelled, so nothing
-- was changed").
--
-- WHAT CHANGES. Each of the three policies gains the same clause events uses:
--     user_has_permission('events.edit') AND role_has_institution_access(e.institution_id)
-- SELECT is included because the cancel is an upsert (INSERT … ON CONFLICT DO
-- UPDATE), which needs the existing row to be visible too.
--
-- Nothing else changes: every existing condition is kept word for word; anon
-- still has no access at all.
--
-- ALTER POLICY, not DROP/CREATE: the policies are never absent, even for an
-- instant.

ALTER POLICY "event_cancellations_auth_read" ON public.event_cancellations
  USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.events e
       WHERE e.id = event_cancellations.event_id
         AND (
           e.institution_id IN (
             SELECT p.institution_id FROM public.profiles p
              WHERE p.id = (SELECT auth.uid()) AND p.institution_id IS NOT NULL
           )
           OR e.created_by = (SELECT auth.uid())
           OR public.fn_is_event_incharge(e.id)
           OR (
             (SELECT public.user_has_permission('events.edit'))
             AND public.role_has_institution_access(e.institution_id)
           )
         )
    )
  );

ALTER POLICY "event_cancellations_auth_write" ON public.event_cancellations
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
       WHERE e.id = event_cancellations.event_id
         AND (
           (SELECT public.is_super_admin())
           OR e.created_by = (SELECT auth.uid())
           OR (
             e.created_by IS NULL
             AND e.institution_id IN (
               SELECT p.institution_id FROM public.profiles p
                WHERE p.id = (SELECT auth.uid()) AND p.institution_id IS NOT NULL
             )
           )
           OR public.fn_is_event_incharge(e.id)
           OR (
             (SELECT public.user_has_permission('events.edit'))
             AND public.role_has_institution_access(e.institution_id)
           )
         )
    )
  );

ALTER POLICY "event_cancellations_auth_update" ON public.event_cancellations
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
       WHERE e.id = event_cancellations.event_id
         AND (
           (SELECT public.is_super_admin())
           OR e.created_by = (SELECT auth.uid())
           OR (
             e.created_by IS NULL
             AND e.institution_id IN (
               SELECT p.institution_id FROM public.profiles p
                WHERE p.id = (SELECT auth.uid()) AND p.institution_id IS NOT NULL
             )
           )
           OR public.fn_is_event_incharge(e.id)
           OR (
             (SELECT public.user_has_permission('events.edit'))
             AND public.role_has_institution_access(e.institution_id)
           )
         )
    )
  );

-- Assert: the clause is present on all three, and anon still has nothing.
DO $event_cancellations_editors_assert$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(polname, ', ') INTO v_missing
    FROM pg_policy
   WHERE polrelid = 'public.event_cancellations'::regclass
     AND polname IN ('event_cancellations_auth_read',
                     'event_cancellations_auth_write',
                     'event_cancellations_auth_update')
     AND coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), '')
         NOT LIKE '%events.edit%';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'events.edit clause missing on: %', v_missing;
  END IF;

  IF has_table_privilege('anon', 'public.event_cancellations', 'SELECT')
     OR has_table_privilege('anon', 'public.event_cancellations', 'INSERT')
     OR has_table_privilege('anon', 'public.event_cancellations', 'UPDATE') THEN
    RAISE EXCEPTION 'anon has a privilege on public.event_cancellations';
  END IF;
END
$event_cancellations_editors_assert$;
