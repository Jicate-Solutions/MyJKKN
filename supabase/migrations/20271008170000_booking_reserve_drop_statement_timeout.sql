-- 20271008170000_booking_reserve_drop_statement_timeout.sql
--
-- Correction to 20271008160000 (deep review on #4275, 8 Oct 2026, consensus
-- LOW). fn_ai_booking_reserve was created with a function-level
-- `SET statement_timeout = '10s'`. PostgreSQL starts the statement timer when
-- the OUTER statement begins, and a function-level SET does not restart it, so
-- that setting never limited the call — the "10 s cap" claimed in the comments
-- and in SQL_FILE_INDEX.md did not exist. This removes the setting so nothing
-- claims a limit that is not there. The real bounds are unchanged:
--   * `lock_timeout = '5s'` (function level) does apply: it is checked each time
--     the function waits for the per-owner advisory lock;
--   * the door (lib/mcp/personal-door.ts) puts its own 15 s deadline on every
--     step before booking and 25 s on the booking itself.
-- ALTER FUNCTION … RESET only; the function body is untouched.

ALTER FUNCTION public.fn_ai_booking_reserve(uuid, uuid, integer, integer, integer, integer)
  RESET statement_timeout;

DO $$
DECLARE
  v_cfg text[];
BEGIN
  SELECT proconfig INTO v_cfg
    FROM pg_proc
   WHERE oid = 'public.fn_ai_booking_reserve(uuid, uuid, integer, integer, integer, integer)'::regprocedure;
  IF v_cfg @> ARRAY['statement_timeout=10s'] THEN
    RAISE EXCEPTION 'statement_timeout is still set on fn_ai_booking_reserve';
  END IF;
  IF NOT (v_cfg @> ARRAY['lock_timeout=5s']) THEN
    RAISE EXCEPTION 'fn_ai_booking_reserve lost its lock_timeout';
  END IF;
END $$;
