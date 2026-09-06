-- Events Hub — permission-gated delete (2026-08-06)
--
-- WHAT THIS FIXES. `events_auth_delete` was written as:
--
--     is_super_admin()
--     OR get_current_user_role() IN ('super_admin','admin','administrator','event_coordinator')
--     OR institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid())
--
-- That last clause is the whole problem: it grants DELETE to EVERY authenticated
-- user carrying an institution_id, which is every learner and every staff member.
-- `events.view` alone is held by the `student` role (6,272 users). None of them
-- see a delete button, but PostgREST is directly callable with their own JWT, so
-- the row was one request away from anyone. It also hardcodes role names, which
-- this repo forbids — role membership is not the authority, permission keys are.
--
-- Replaced with the catalog key `events.delete` (added to PERMISSION_CATEGORIES
-- in lib/constants/permissions.ts by the same change) AND institution access.
-- user_has_permission() already carries the super-admin bypass and the Director
-- handover path, so no separate is_super_admin() disjunct is needed here.
--
-- NO ROLE GRANTS ARE SEEDED. Deliberate: the key exists so Role Management can
-- toggle it per role, and nobody but a super admin holds it until someone makes
-- that call explicitly. Granting delete on an irreversible 43-table cascade is
-- not a migration's decision to make.
--
-- THE CASCADE IS THE REAL BLAST RADIUS. 46 foreign keys point at `events` and 43
-- are ON DELETE CASCADE — events_registrations, event_payment_transactions,
-- tournament_matches, tournament_entries, induction_enrollment, marathon_results,
-- event_budget_approvals. Deleting one row destroys money records with no backup
-- table behind them. The trigger at the bottom refuses that outright.

-- ---------------------------------------------------------------------------
-- 1. The DELETE policy — permission key, not role names.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS events_auth_delete ON public.events;

CREATE POLICY events_auth_delete ON public.events
  FOR DELETE
  TO authenticated
  USING (
    -- Wrapped in a scalar subquery so the planner evaluates this var-free
    -- SECURITY DEFINER call ONCE per query instead of once per candidate row.
    (SELECT public.user_has_permission('events.delete'))
    AND public.role_has_institution_access(events.institution_id)
  );

-- ---------------------------------------------------------------------------
-- 2. Blocker counts for the UI, read past RLS.
-- ---------------------------------------------------------------------------
-- The confirm dialog has to know what a delete would take with it BEFORE the
-- user commits. Counting from the browser would be wrong twice over: RLS filters
-- events_registrations and event_payment_transactions per viewer, so a caller who
-- cannot see the registrations would count 0 and be told the delete is safe —
-- a false negative on exactly the check that exists to prevent data loss.
--
-- SECURITY DEFINER to read the true counts, and therefore self-authorizing: a
-- function that bypasses RLS must re-check the caller itself, because being
-- callable by `authenticated` is not the same as being authorized.

CREATE OR REPLACE FUNCTION public.fn_event_delete_blockers(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_institution_id uuid;
  v_found          boolean;
  v_registrations  integer;
  v_payments       integer;
BEGIN
  SELECT e.institution_id, true
    INTO v_institution_id, v_found
    FROM public.events e
   WHERE e.id = p_event_id;

  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'Event % not found', p_event_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.user_has_permission('events.delete')
    AND public.role_has_institution_access(v_institution_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to delete this event' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_registrations
    FROM public.events_registrations r WHERE r.event_id = p_event_id;

  SELECT count(*) INTO v_payments
    FROM public.event_payment_transactions t WHERE t.event_id = p_event_id;

  RETURN jsonb_build_object(
    'registrations', v_registrations,
    'payments',      v_payments,
    'blocked',       (v_registrations > 0 OR v_payments > 0)
  );
END;
$$;

-- REVOKE from anon explicitly: revoking from PUBLIC does not remove a grant that
-- anon holds in its own right, and this function reports counts past RLS.
REVOKE ALL ON FUNCTION public.fn_event_delete_blockers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_event_delete_blockers(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_event_delete_blockers(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The guard that actually holds — refuse the destructive cascade.
-- ---------------------------------------------------------------------------
-- A dialog the user can't get past is a UI convention; this is the invariant.
-- Without it the same DELETE is reachable straight from PostgREST by anyone the
-- policy above admits, and the registrations and payment rows are gone with no
-- error and nothing to restore from.
--
-- SECURITY DEFINER for the same reason as the RPC: an RLS-filtered count inside
-- the trigger would return 0 for the very callers this is meant to stop, and the
-- guard would pass while destroying rows it could not see.
--
-- Name sorts before trg_events_naac_evidence_cleanup, so on a permitted delete
-- this runs first (BEFORE vs that trigger's AFTER makes it moot, but the ordering
-- is intentional rather than lucky).

CREATE OR REPLACE FUNCTION public.fn_events_block_delete_with_dependents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_registrations integer;
  v_payments      integer;
BEGIN
  SELECT count(*) INTO v_registrations
    FROM public.events_registrations r WHERE r.event_id = OLD.id;

  SELECT count(*) INTO v_payments
    FROM public.event_payment_transactions t WHERE t.event_id = OLD.id;

  IF v_registrations > 0 OR v_payments > 0 THEN
    RAISE EXCEPTION
      'Cannot delete event "%": % registration(s) and % payment transaction(s) '
      'would be permanently destroyed by ON DELETE CASCADE. Remove or refund '
      'them first, or move the event to Draft to take it out of circulation.',
      OLD.name, v_registrations, v_payments
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$$;

-- A trigger function has no business being callable over PostgREST, and
-- SECURITY DEFINER made this one reachable at /rest/v1/rpc/ by anon (flagged by
-- get_advisors). Postgres checks EXECUTE on a trigger function at CREATE TRIGGER
-- time, not at fire time, so revoking does not disarm the guard — verified by
-- re-running a blocked delete afterwards.
REVOKE ALL ON FUNCTION public.fn_events_block_delete_with_dependents() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_events_block_delete_with_dependents() FROM anon;
REVOKE ALL ON FUNCTION public.fn_events_block_delete_with_dependents() FROM authenticated;

DROP TRIGGER IF EXISTS trg_events_block_delete_with_dependents ON public.events;

CREATE TRIGGER trg_events_block_delete_with_dependents
  BEFORE DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_events_block_delete_with_dependents();

COMMENT ON FUNCTION public.fn_event_delete_blockers(uuid) IS
  'Events Hub delete pre-check. Returns {registrations, payments, blocked} past '
  'RLS; self-authorizes on events.delete + institution access.';

COMMENT ON FUNCTION public.fn_events_block_delete_with_dependents() IS
  'Refuses DELETE on an event holding registrations or payment transactions — '
  'those cascade away irreversibly. Enforced here so PostgREST cannot bypass it.';
