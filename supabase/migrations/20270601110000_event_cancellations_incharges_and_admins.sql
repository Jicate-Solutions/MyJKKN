-- Events — only the event's in-charges and admins may cancel it (Director's
-- ruling 30 Sep 2026, 08:59, first-hand in the W12 tab)
--
-- ⚠️ DEPENDS ON 20261204113700_events_cancellation_reason_and_stamp.sql BEING
-- APPLIED (#4098). That file creates public.event_cancellations and the three
-- policies altered here; this one fails on a database without them. The wave
-- applies pending files in version order, so it runs after that file.
--
-- THE RULING. "Only the event's in-charges" may cancel, plus admins — not every
-- holder of events.edit (which, since 20260928120000, is every Senior Learner).
-- An earlier draft of this PR (29 Sep interview: "if you can edit, you can
-- cancel") was replaced by this ruling before anything went live.
--
-- WHAT CHANGES. Cancelling writes a row in event_cancellations first, then
-- events.status; recording the row is the gate.
--   · INSERT and UPDATE on event_cancellations: allowed only for an in-charge of
--     that event (fn_is_event_incharge) or an admin (is_admin(): super admins
--     and the admin / super_admin / administrator roles).
--     REMOVED from #4098's version: the event's CREATOR (unless also an
--     in-charge), and "same institution when the event has no creator".
--   · SELECT gains is_admin(), because the cancel is an upsert (INSERT … ON
--     CONFLICT DO UPDATE), which needs the existing row visible to whoever
--     writes it. Who else can READ a reason is unchanged.
--
-- CONSEQUENCE (30 Sep data): 24 live events have NO in-charge, so only an admin
-- can cancel them until someone is named in-charge; 16 of 25 live events with a
-- known creator do not list that creator as in-charge. BUG-006223's reporter is
-- the in-charge of their event, so they are covered.
--
-- NOT CHANGED: events' own UPDATE policies. A creator or events.edit holder can
-- still write events.status directly through the API; the app only cancels via
-- the two-step path above. Closing that is a separate change.
--
-- ALTER POLICY, not DROP/CREATE: the policies are never absent.

ALTER POLICY "event_cancellations_auth_read" ON public.event_cancellations
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
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
         )
    )
  );

ALTER POLICY "event_cancellations_auth_write" ON public.event_cancellations
  WITH CHECK (
    (SELECT public.is_admin())
    OR public.fn_is_event_incharge(event_cancellations.event_id)
  );

ALTER POLICY "event_cancellations_auth_update" ON public.event_cancellations
  USING (
    (SELECT public.is_admin())
    OR public.fn_is_event_incharge(event_cancellations.event_id)
  );

-- Assert the end state.
DO $event_cancellations_incharges_assert$
DECLARE
  v_expr text;
BEGIN
  SELECT coalesce(pg_get_expr(polwithcheck, polrelid), '') INTO v_expr
    FROM pg_policy
   WHERE polrelid = 'public.event_cancellations'::regclass
     AND polname = 'event_cancellations_auth_write';
  IF v_expr NOT LIKE '%fn_is_event_incharge%' OR v_expr NOT LIKE '%is_admin%'
     OR v_expr LIKE '%created_by%' OR v_expr LIKE '%events.edit%' THEN
    RAISE EXCEPTION 'event_cancellations_auth_write is not in-charge-or-admin: %', v_expr;
  END IF;

  SELECT coalesce(pg_get_expr(polqual, polrelid), '') INTO v_expr
    FROM pg_policy
   WHERE polrelid = 'public.event_cancellations'::regclass
     AND polname = 'event_cancellations_auth_update';
  IF v_expr NOT LIKE '%fn_is_event_incharge%' OR v_expr NOT LIKE '%is_admin%'
     OR v_expr LIKE '%created_by%' OR v_expr LIKE '%events.edit%' THEN
    RAISE EXCEPTION 'event_cancellations_auth_update is not in-charge-or-admin: %', v_expr;
  END IF;

  IF has_table_privilege('anon', 'public.event_cancellations', 'SELECT')
     OR has_table_privilege('anon', 'public.event_cancellations', 'INSERT')
     OR has_table_privilege('anon', 'public.event_cancellations', 'UPDATE') THEN
    RAISE EXCEPTION 'anon has a privilege on public.event_cancellations';
  END IF;
END
$event_cancellations_incharges_assert$;
