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
-- THE SIDE DOOR, CLOSED HERE TOO. events' own UPDATE policies
-- (events_auth_update, events_edit_permission_update, events_incharge_update)
-- grant the ROW, so a creator or events.edit holder could still write
-- events.status = 'cancelled' straight through the API and skip the table above.
-- RLS cannot pin one column, so a BEFORE UPDATE OF status trigger on events
-- (trg_events_cancel_incharge_or_admin) refuses the move INTO 'cancelled' unless
-- the caller is an in-charge of that event (fn_is_event_incharge — the same test
-- the policies above use) or is_admin(). The policies themselves are unchanged.
--   · Scope: general events only. sports_tournament, marathon and induction have
--     their own consoles (DEDICATED_EVENT_CONSOLES); marathon cancels from three
--     paths with no reason (list, dashboard, race-day Emergency Stop) by ops roles
--     that are not in-charges. Widening the rule to them is the Director's call.
--   · auth.uid() IS NULL (service_role, migrations, cron) passes, the same as
--     fn_guard_event_privileged_fields.
--   · The in-charge test reads the roster as it stood BEFORE this statement, so
--     one UPDATE that adds the caller to config.incharges and cancels in the same
--     write is still refused.
--   · Leaving 'cancelled' (reinstating) is not touched.
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

-- The side door: events.status -> 'cancelled' only for an in-charge or an admin.
CREATE OR REPLACE FUNCTION public.fn_events_cancel_incharge_or_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER  -- is_admin() and fn_is_event_incharge() are already definer.
SET search_path = public
AS $$
BEGIN
  -- Trusted backend paths (service_role / migrations / cron) have no auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM 'cancelled'
     AND OLD.event_type NOT IN ('sports_tournament', 'marathon', 'induction')
     AND NOT (
       COALESCE(public.is_admin(), false)
       OR COALESCE(public.fn_is_event_incharge(OLD.id), false)
     )
  THEN
    RAISE EXCEPTION
      'Only an in-charge of this event or an admin may cancel it (event %)', OLD.id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_events_cancel_incharge_or_admin() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_events_cancel_incharge_or_admin() IS
  'BEFORE UPDATE OF status guard on events (Director 30 Sep 2026): moving a general event INTO cancelled needs fn_is_event_incharge(id) or is_admin(), the same rule as event_cancellations. sports_tournament, marathon and induction are out of scope. service_role (auth.uid() IS NULL) bypasses.';

DROP TRIGGER IF EXISTS trg_events_cancel_incharge_or_admin ON public.events;
CREATE TRIGGER trg_events_cancel_incharge_or_admin
  BEFORE UPDATE OF status ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_events_cancel_incharge_or_admin();

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

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.events'::regclass
       AND tgname = 'trg_events_cancel_incharge_or_admin'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_events_cancel_incharge_or_admin is missing on public.events';
  END IF;

  IF has_function_privilege('anon', 'public.fn_events_cancel_incharge_or_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_events_cancel_incharge_or_admin';
  END IF;

  IF has_table_privilege('anon', 'public.event_cancellations', 'SELECT')
     OR has_table_privilege('anon', 'public.event_cancellations', 'INSERT')
     OR has_table_privilege('anon', 'public.event_cancellations', 'UPDATE') THEN
    RAISE EXCEPTION 'anon has a privilege on public.event_cancellations';
  END IF;
END
$event_cancellations_incharges_assert$;
