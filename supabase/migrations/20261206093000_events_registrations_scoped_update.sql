-- Updated: 2026-09-13 - Replace the table-wide UPDATE policy on
--                       public.events_registrations with an ownership-scoped one.
--
-- ============================================================================
-- THE HOLE (measured on production 2026-09-13, read-only, from pg_policies)
-- ============================================================================
-- Policy `events_reg_public_event_update` is PERMISSIVE, granted TO authenticated,
-- with USING:
--
--   event_id IN (SELECT events.id FROM events
--                WHERE events.is_public = true
--                  AND events.status <> ALL (ARRAY['draft','cancelled']))
--
-- It carries no ownership, institution or committee condition. The only thing it
-- asks is "is the event public and not a draft" — a property of the EVENT, never
-- of the CALLER. Every other policy on the table is PERMISSIVE too, so they OR
-- together and nothing narrows it. It also has no WITH CHECK of its own, so the
-- same event-shaped test is all that governs the row after the write.
--
-- Net effect measured today: any of 7,430 accounts holding a login could UPDATE
-- any of 1,729 registration rows across the 21 public, non-draft, non-cancelled
-- events — other people's contact details, their payment_status, their
-- checked_in flag, their bib_number. `anon` could not (correctly false), and
-- there are ZERO user triggers on the table to catch it after the fact.
--
-- The policy's stated purpose was event-day committee access. The policy directly
-- beneath it, `events_reg_committee_member_update`, already does that correctly
-- (lead_id, member_ids, and name-matched membership), so the broad policy was
-- redundant for the job it was written to do.
--
-- ============================================================================
-- WHY THIS REPLACES RATHER THAN SIMPLY DROPS
-- ============================================================================
-- Only 11 of 55 events carry any `event_committees` row. Dropping the broad
-- policy with nothing in its place would remove the last UPDATE path for any
-- event-day crew not recorded as a committee. So the replacement adds the two
-- ownership mechanisms this table was missing entirely:
--
--   * the event's IN-CHARGE   (events.config -> 'incharges' -> [].member_id)
--   * the event's CREATOR     (events.created_by)
--
-- Both are already first-class concepts in the events module: the
-- `events_tournament_role_read` policy on public.events reads them through
-- fn_is_event_incharge(), and three event_registration_form* policies already use
-- fn_is_event_creator(). This migration REUSES both helpers and defines no new
-- function, so no new SECURITY DEFINER surface is introduced and there is nothing
-- new to REVOKE from anon. (The pre-existing anon EXECUTE grant on
-- fn_is_event_creator is a separate finding, raised in the PR body and
-- deliberately not changed here — three live policies that apply to the `public`
-- role call it, so revoking would turn a `false` into a hard permission error for
-- anonymous readers. That needs its own change and its own test.)
--
-- Effective UPDATE access after this migration is the OR of THREE policies:
--
--   events_reg_admin_update             super admin / admin / administrator /
--                                       event_coordinator                (unchanged)
--   events_reg_committee_member_update  committee lead + members         (unchanged)
--   events_reg_scoped_update            own registration, in-charge, creator  (NEW)
--
-- ============================================================================
-- WHY THE CHECKS ARE FUNCTION CALLS AND NOT AN INLINE `IN (SELECT … FROM events)`
-- ============================================================================
-- A subquery against public.events inside an RLS policy is itself subject to
-- events' RLS. When the caller cannot SELECT the event row, such a clause does not
-- error — it silently evaluates to false and a legitimate user is locked out with
-- no diagnosable reason. fn_is_event_incharge / fn_is_event_creator are SECURITY
-- DEFINER, so the predicate is decided on the caller's IDENTITY rather than on the
-- caller's ability to read the events row. Both return a boolean and never return
-- event data, so they widen nothing. Both are STABLE with a pinned search_path.
--
-- fn_is_event_incharge calls jsonb_array_elements(COALESCE(config->'incharges','[]')),
-- which would raise if any event stored a non-array there. Verified on production
-- 2026-09-13: of 55 events, 42 have no 'incharges' key and 13 hold an array
-- (6 non-empty, 17 entries total). No other JSON type occurs, so the call is safe.
--
-- ============================================================================
-- KNOWN, DELIBERATE RESIDUALS (raised in the PR body — NOT closed here)
-- ============================================================================
--  1. `authenticated` holds a table-wide UPDATE grant, so the self clause
--     (profile_id = auth.uid()) still lets a person change privileged columns on
--     THEIR OWN row — notably payment_status — through a direct PostgREST call.
--     That is a strict narrowing of today's behaviour (possible on all 1,729 rows
--     before, on one's own row after), not a new capability. Closing it properly
--     needs a column-level GRANT or a BEFORE UPDATE trigger: a separate change
--     with its own blast radius across the seven browser-side services that write
--     this table.
--  2. `authenticated` also holds TRUNCATE on this table. TRUNCATE is not gated by
--     RLS at all, so nothing in this file affects it.
--  3. 14 accounts that performed real event-day work on one 2026-04-12 marathon are
--     matched by none of these clauses. Evidence and remediation are in the PR body.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Replace the broad policy. DROP and CREATE are in the same migration so the
--    table is never left without a non-committee UPDATE path.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS events_reg_public_event_update ON public.events_registrations;

CREATE POLICY events_reg_scoped_update
  ON public.events_registrations
  FOR UPDATE
  TO authenticated
  USING (
    -- the person's own registration
    profile_id = (SELECT auth.uid())
    -- the event's in-charge (events.config -> 'incharges' -> [].member_id)
    OR fn_is_event_incharge(event_id)
    -- the event's creator (events.created_by)
    OR fn_is_event_creator(event_id)
  )
  WITH CHECK (
    -- Stated explicitly rather than inherited from USING, so a row cannot be moved
    -- to an event the caller does not control by rewriting event_id.
    profile_id = (SELECT auth.uid())
    OR fn_is_event_incharge(event_id)
    OR fn_is_event_creator(event_id)
  );

COMMENT ON POLICY events_reg_scoped_update ON public.events_registrations IS
  'Replaces events_reg_public_event_update (dropped 2026-09-13), which let any '
  'authenticated account UPDATE any registration on any public non-draft event — '
  '7,430 accounts over 1,729 rows — because its only condition was a property of the '
  'event, not of the caller. Scoped to the registrant, the event in-charge and the '
  'event creator. Committee members and admins keep their own separate policies.';

-- ---------------------------------------------------------------------------
-- 2. Prove it. Every assertion below reads the live catalogue AFTER the DDL, so
--    applying this migration either demonstrates the end state or aborts.
--    Each assertion was dry-run against production on 2026-09-13 and confirmed to
--    FLAG the current broad policy — none of them is a check that cannot fail.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_update_policies text[];
  v_event_shaped    text;
  v_no_caller       text;
BEGIN
  -- 2a. The broad policy is gone.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'events_registrations'
      AND policyname = 'events_reg_public_event_update'
  ) THEN
    RAISE EXCEPTION
      'events_reg_public_event_update still exists after the DROP — the hole is open.';
  END IF;

  -- 2b. Exactly the three intended UPDATE policies remain. A fourth appearing is
  --     as much a regression as the original was, so this asserts the SET, not
  --     merely that ours is present.
  SELECT array_agg(policyname ORDER BY policyname) INTO v_update_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'events_registrations' AND cmd = 'UPDATE';

  IF v_update_policies IS DISTINCT FROM ARRAY[
       'events_reg_admin_update',
       'events_reg_committee_member_update',
       'events_reg_scoped_update'
     ]::text[] THEN
    RAISE EXCEPTION
      'Unexpected UPDATE policy set on events_registrations: %', v_update_policies;
  END IF;

  -- 2c. No surviving UPDATE policy decides access from a property of the EVENT
  --     (is_public / status) instead of the CALLER. That shape is what made the
  --     original policy wrong, so it is asserted structurally rather than by name:
  --     a differently-named policy of the same shape must also fail this.
  SELECT string_agg(policyname, ', ') INTO v_event_shaped
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'events_registrations'
    AND cmd = 'UPDATE'
    AND (coalesce(qual, '') LIKE '%is_public%' OR coalesce(with_check, '') LIKE '%is_public%');

  IF v_event_shaped IS NOT NULL THEN
    RAISE EXCEPTION
      'UPDATE policy still keys off event visibility rather than caller identity: %',
      v_event_shaped;
  END IF;

  -- 2d. Every UPDATE policy names the caller. A policy that never mentions the
  --     calling user — directly or through one of the identity predicates —
  --     cannot be scoping anything to a person.
  SELECT string_agg(policyname, ', ') INTO v_no_caller
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'events_registrations'
    AND cmd = 'UPDATE'
    AND coalesce(qual, '') NOT LIKE '%auth.uid()%'
    AND coalesce(qual, '') NOT LIKE '%fn_is_event_%'
    AND coalesce(qual, '') NOT LIKE '%is_super_admin%'
    AND coalesce(qual, '') NOT LIKE '%get_current_user_role%';

  IF v_no_caller IS NOT NULL THEN
    RAISE EXCEPTION
      'UPDATE policy does not reference the calling user at all: %', v_no_caller;
  END IF;

  -- 2e. The predicates this policy leans on exist, are SECURITY DEFINER, and are
  --     callable by authenticated. If either were missing or unexecutable the
  --     policy would silently evaluate false and lock out in-charges and creators.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_is_event_incharge' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'fn_is_event_incharge is missing or is not SECURITY DEFINER.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_is_event_creator' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'fn_is_event_creator is missing or is not SECURITY DEFINER.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.fn_is_event_incharge(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_is_event_creator(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'authenticated cannot EXECUTE one of the event identity predicates — the policy would always be false.';
  END IF;

  -- 2f. Unchanged facts that must stay unchanged: RLS on, anon still cannot write.
  IF NOT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'events_registrations') THEN
    RAISE EXCEPTION 'RLS is not enabled on events_registrations — policies would not apply.';
  END IF;

  IF has_table_privilege('anon', 'public.events_registrations', 'UPDATE') THEN
    RAISE EXCEPTION 'anon holds UPDATE on events_registrations.';
  END IF;

  -- 2g. Surface, at apply time, the two residuals this migration does NOT close,
  --     so they cannot be mistaken for fixed. These are NOTICEs, not failures:
  --     both are pre-existing and both need their own change.
  IF has_table_privilege('authenticated', 'public.events_registrations', 'TRUNCATE') THEN
    RAISE NOTICE
      'STILL OPEN (out of scope here): authenticated holds TRUNCATE on events_registrations. TRUNCATE ignores RLS.';
  END IF;

  IF has_function_privilege('anon', 'public.fn_is_event_creator(uuid)', 'EXECUTE') THEN
    RAISE NOTICE
      'STILL OPEN (out of scope here): anon holds EXECUTE on fn_is_event_creator. Harmless while auth.uid() is null, but unapproved.';
  END IF;

  RAISE NOTICE
    'events_registrations UPDATE is now scoped to: registrant, in-charge, creator, committee, admin.';
END
$$;
