-- Migration: 2026-06-05 10:45
-- Purpose:
--   Close the anon-access vulnerability on all YoY RPCs surfaced by today's
--   three-layer verification sweep (Layer 2 — API Route Matrix).
--
-- Finding:
--   All 11 RPCs in scope (10 fn_yoy_* + 1 _yoy_admission_institution helper)
--   were callable by any unauthenticated client holding the public anon key
--   (which is embedded in every Next.js client bundle and visible in DOM/
--   Network tab). They returned full admission data: institution-by-day
--   trajectory (517 rows), counselor names, deposit-leak per-program,
--   institution sanctioned-vs-admitted KPIs.
--
-- Root cause:
--   Supabase's default schema setup includes
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public
--       GRANT ALL ON FUNCTIONS TO anon, authenticated
--   This gives `anon` a DIRECT grant on every new public function — separate
--   from PUBLIC. The migration template's `REVOKE ALL FROM PUBLIC` does NOT
--   undo the direct `anon` grant. Need explicit `REVOKE FROM anon`.
--
-- Live verification (2026-06-05 ~10:39 IST):
--   - Before: anon POST /rest/v1/rpc/fn_yoy_admission_trajectory → HTTP 200,
--     517 rows of real data.
--   - After: anon POST /rest/v1/rpc/fn_yoy_admission_trajectory → HTTP 401,
--     "permission denied for function fn_yoy_admission_trajectory".
--   - service_role calls remain 200 (unaffected — bypasses GRANT checks).
--
-- Idempotent: REVOKE + GRANT are both no-ops if already in correct state.
-- Dynamically enumerates all functions to handle parameter-overload variants
-- and to catch any future fn_yoy_* / _yoy_* additions automatically.
--
-- ⚠️ Platform-wide implication:
--   This vulnerability pattern likely exists on OTHER MyJKKN RPCs beyond YoY.
--   A platform-wide audit + corrective sweep should be queued as follow-up.
--   Search: rg -t sql "GRANT EXECUTE.*TO authenticated" supabase/migrations/
--   and confirm each has a matching "REVOKE EXECUTE FROM anon" or equivalent.

DO $$
DECLARE
  rec record;
  fn_sig text;
  cnt int := 0;
BEGIN
  FOR rec IN
    SELECT proname, pg_get_function_identity_arguments(oid) AS args
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND (proname LIKE 'fn_yoy_%' OR proname = '_yoy_admission_institution')
  LOOP
    fn_sig := format('public.%I(%s)', rec.proname, rec.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', fn_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn_sig);
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'Locked down % YoY function signatures (REVOKE EXECUTE FROM anon, PUBLIC; GRANT EXECUTE TO authenticated)', cnt;
END $$;
