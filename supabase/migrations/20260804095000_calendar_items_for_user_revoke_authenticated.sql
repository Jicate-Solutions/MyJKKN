-- Updated: 2026-07-28 - SECURITY: close the fn_calendar_items_for_user IDOR
--
-- WHAT HAPPENED
-- -------------
-- public.fn_calendar_items_for_user(...) is SECURITY DEFINER and takes the user
-- whose calendar to return, p_user_id, as a plain caller-supplied argument. It
-- performs NO check that p_user_id is the caller. It was GRANTed EXECUTE to
-- `authenticated`, so any signed-in client holding the public anon key (which is
-- embedded in every Next.js bundle) could call it with somebody else's uuid.
--
-- Verified on production 2026-07-28: a student session passing the Director's
-- profile id read 58 of the Director's calendar items — reservations, staff
-- leave, board meetings. A live IDOR.
--
-- THE FIX (already applied to production 2026-07-28; this file records it so the
-- repo matches prod and a future deploy cannot silently undo it)
-- --------------------------------------------------------------------------
--   REVOKE EXECUTE ... FROM authenticated, anon, PUBLIC;
--
-- Nothing legitimate breaks, because no client ever called the resolver directly.
-- Both real entry points are themselves SECURITY DEFINER, so they execute the
-- resolver as its owner and bind p_user_id to an identity the caller cannot forge:
--   * public.fn_calendar_items(...)  -> p_user_id := auth.uid()          [authenticated]
--   * public.fn_calendar_ics(token)  -> p_user_id := the token's user_id [anon]
-- Verified after the revoke: the cross-user attack returns "permission denied
-- for function fn_calendar_items_for_user"; fn_calendar_items still returns the
-- Director's 58 July items; the ICS feed still renders.
--
-- WHY THE DO BLOCK
-- ----------------
-- Written to loop over every overload of the function rather than naming one
-- signature, so it stays correct regardless of the order it runs in relative to
-- 20260804100000_calendar_meeting_bookings_source.sql (which changes the
-- signature by adding p_exclude_google_synced). Re-running it is a no-op.
--
-- ALSO NOTE (Supabase-specific trap): DROP + CREATE of a function re-arms
-- Supabase's `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS
-- TO anon, authenticated`, which hands out EXECUTE again. Any migration that
-- recreates this function MUST revoke explicitly afterwards. The sibling
-- migration above does exactly that and asserts the result.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'fn_calendar_items_for_user'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', r.sig);
    RAISE NOTICE 'fn_calendar_items_for_user: revoked anon/authenticated/PUBLIC on %', r.sig;
  END LOOP;
END
$$;

-- Regression guard: fail loudly rather than ship a re-opened IDOR.
DO $$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_calendar_items_for_user'
     AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('anon',          p.oid, 'EXECUTE'));
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'fn_calendar_items_for_user is still EXECUTE-able by authenticated/anon (% overload(s)). '
      'That is a caller-supplied-p_user_id IDOR: callers must use fn_calendar_items '
      'or fn_calendar_ics instead.', v_bad;
  END IF;
END
$$;
