-- Six SECURITY DEFINER functions that `anon` can EXECUTE on production
--
-- Grants only. No function body is created, replaced or altered by this file.
--
-- All facts below were read from production on 2026-08-13 via the Supabase
-- Management API. Every one of the six is `prosecdef = true` and every one of
-- them carries the SAME ACL:
--
--     =X/postgres  postgres=X/postgres  authenticated=X/postgres  service_role=X/postgres
--      ^^^^^^^^^^
--
-- That leading `=X/` IS the grant to PUBLIC, and `anon` is a member of PUBLIC.
-- None of the six holds an `anon=X` entry of its own. So a REVOKE naming only
-- `anon` would succeed, change nothing, and report success. **The PUBLIC half of
-- `FROM anon, PUBLIC` below is the load-bearing part.** (Same shape as the four
-- functions closed on 2026-07-30 and the two closed by 20260813020000.)
--
-- Why a SECDEF function is the dangerous class: it runs as its OWNER (`postgres`
-- for all six) and therefore bypasses RLS entirely. Locking the tables it reads
-- protects nothing inside it. The only thing standing between an unauthenticated
-- caller and the function's effect is whatever guard the body happens to contain.
--
--
-- ═══ GROUP A — REVOKE anon + PUBLIC, KEEP authenticated (5) ═══
--
-- These five DO guard themselves, and the guard was proven live rather than read
-- off the source. Called as the `anon` role inside a rolled-back transaction on
-- production 2026-08-13:
--
--   fn_shift_timing_coverage  → 42501 "Not authorized to view shift timing
--                               coverage for this institution"  (line 12 RAISE)
--   fn_resolve_shift_timing   → 42501 "Not authorized to resolve shift timing
--                               for this staff member"          (line 19 RAISE)
--
-- So this is defence in depth, not an incident: nothing was reachable today. It
-- matters anyway because the shape is exactly the one that failed on 2026-07-30 —
-- each of these takes the identity it reports on AS A PARAMETER (p_staff_id,
-- p_institution_id), which is how fn_hostel_unallocated_candidates returned 49
-- learners' names, emails, gender and programme to an anonymous caller. One IF
-- statement should not be the whole perimeter.
--
-- `authenticated` MUST be preserved — these have real application callers:
--   fn_resolve_shift_timing(uuid, date)
--       lib/services/hr/shift-timing-service.ts:175
--       lib/hr/biometric/evaluate-day.ts (consumes its result)
--   fn_resolve_shift_timings_bulk(uuid[], date, date)
--       app/api/hr/attendance/import/route.ts:222
--       app/api/hr/attendance/recompute/route.ts:178
--       app/(routes)/hr/admin/shift-timings/_components/weekly-timing-grid.tsx
--   fn_save_shift_timing_week(uuid, text, uuid, date, jsonb)          [WRITES]
--       lib/services/hr/shift-timing-service.ts:157
--   fn_shift_timing_coverage(uuid, date)
--       lib/services/hr/shift-timing-service.ts:194
--   generate_hr_leave_balances_bulk(uuid, uuid[], boolean)            [WRITES]
--       lib/services/hr/leave-type-service.ts:262
--
--
-- ═══ GROUP B — REVOKE anon + PUBLIC + authenticated (1) ═══
--
--   tms_expire_stale_trips()                                    [WRITES, NO GUARD]
--
-- This one is different in kind. Verified on production 2026-08-13:
--   • NO internal permission guard. Not a weak one — none. A scan of its body for
--     is_super_admin / is_admin / user_has_permission / RAISE EXCEPTION / auth.uid
--     returns NULL. It begins writing on its first statement.
--   • ZERO application callers. `grep -rn tms_expire_stale_trips` across
--     app/ lib/ hooks/ components/ scripts/ returns nothing.
--   • Its only invoker is pg_cron job 24, `tms-expire-stale-trips`, schedule
--     `*/5 * * * *`, username `postgres`, command `select
--     public.tms_expire_stale_trips();`
--
-- What it does, cluster-wide and unscoped — it takes no arguments, so there is no
-- institution to clamp it to:
--   UPDATE public.tms_trip   SET status='expired', ended_at=now(),
--                                end_reason='auto_expiry'  WHERE status='active'
--                                AND coalesce(last_fix_at, started_at) < now() - <n> min
--   UPDATE public.tms_driver SET location_sharing_enabled=false,
--                                active_route_id=null,
--                                location_sharing_started_at=null   -- for each such driver
--
-- Today ANY holder of the public anon key — which ships inside every Next.js
-- bundle and is visible in the browser Network tab — can fire that. The estate is
-- small right now (1 active trip, 3 trips total, 31 drivers, 1 sharing location,
-- counted 2026-08-13), so this is a mechanism fix rather than incident response.
-- The function was deliberately NOT invoked during this work: it is destructive
-- and production is not a test bench.
--
-- Because pg_cron runs it as `postgres`, which is the OWNER, EXECUTE is not even
-- checked for the cron path. Revoking `authenticated` as well therefore costs
-- nothing and removes the last non-owner caller. `service_role` and `postgres`
-- keep their explicit grants and are untouched.
--
--
-- ═══ DELIBERATELY NOT TOUCHED ═══
--
-- fn_is_event_creator(uuid) and fn_is_designated_leave_approver(uuid) are also
-- SECDEF + anon-executable, and the live sweep flags them alongside these six.
-- They are NOT revoked here. They are allow-listed instead, in
-- scripts/ci/anon-exposure-functions.json, for two independent reasons that are
-- both recorded there in full. In short: they derive their entire answer from
-- auth.uid() (NULL for anon, so they can only ever return false) AND they appear
-- inside five RLS policies granted TO public, where a function is evaluated as
-- the QUERYING role — revoking anon's EXECUTE would make anon queries raise
-- `permission denied for function` instead of returning zero rows, breaking the
-- public event-registration form.
--
-- Deliberately no BEGIN/COMMIT: the Management API already wraps a batch in one
-- transaction, and leaving the file bare is what lets a reviewer rehearse it with
-- `BEGIN; <file>; <assertions>; ROLLBACK;` and have the ROLLBACK actually roll
-- back. A stray COMMIT would silently apply it.

-- ── Group A ──────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.fn_resolve_shift_timing(uuid, date)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_resolve_shift_timing(uuid, date)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_resolve_shift_timings_bulk(uuid[], date, date)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_resolve_shift_timings_bulk(uuid[], date, date)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_shift_timing_coverage(uuid, date)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_shift_timing_coverage(uuid, date)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_hr_leave_balances_bulk(uuid, uuid[], boolean)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generate_hr_leave_balances_bulk(uuid, uuid[], boolean)
  TO authenticated;

-- ── Group B ──────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.tms_expire_stale_trips()
  FROM anon, PUBLIC, authenticated;

-- ── Assertions ───────────────────────────────────────────────────────────────
-- Every intended end state, checked with has_function_privilege and raised by
-- name. A REVOKE naming a role that holds no direct grant is a successful no-op,
-- so "the statement ran" proves nothing here; only the privilege does.

DO $assert$
DECLARE
  v_fn      text;
  v_bad     text[] := ARRAY[]::text[];
  v_group_a text[] := ARRAY[
    'public.fn_resolve_shift_timing(uuid, date)',
    'public.fn_resolve_shift_timings_bulk(uuid[], date, date)',
    'public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb)',
    'public.fn_shift_timing_coverage(uuid, date)',
    'public.generate_hr_leave_balances_bulk(uuid, uuid[], boolean)'
  ];
BEGIN
  -- Group A: anon must be OUT, authenticated must be IN.
  FOREACH v_fn IN ARRAY v_group_a LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      v_bad := v_bad || format('%s: anon STILL has EXECUTE', v_fn);
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      v_bad := v_bad || format('%s: authenticated LOST EXECUTE (live callers would break)', v_fn);
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      v_bad := v_bad || format('%s: service_role LOST EXECUTE', v_fn);
    END IF;
  END LOOP;

  -- Group B: anon AND authenticated must both be OUT; the owner path survives.
  --
  -- The ::text casts are load-bearing, not decoration. `text[] || 'literal'` is
  -- ambiguous: the literal is of unknown type, PostgreSQL prefers the
  -- array || array operator, and the append fails with 22P02 "malformed array
  -- literal" — so the assertion still aborts, but naming an array-syntax error
  -- instead of the privilege that is wrong. Caught by mutation test M2 while
  -- writing this file. The FOREACH branch above is safe because format() already
  -- returns text.
  IF has_function_privilege('anon', 'public.tms_expire_stale_trips()', 'EXECUTE') THEN
    v_bad := v_bad || 'public.tms_expire_stale_trips(): anon STILL has EXECUTE'::text;
  END IF;
  IF has_function_privilege('authenticated', 'public.tms_expire_stale_trips()', 'EXECUTE') THEN
    v_bad := v_bad || 'public.tms_expire_stale_trips(): authenticated STILL has EXECUTE'::text;
  END IF;
  IF NOT has_function_privilege('postgres', 'public.tms_expire_stale_trips()', 'EXECUTE') THEN
    v_bad := v_bad || 'public.tms_expire_stale_trips(): postgres LOST EXECUTE (pg_cron job 24 would break)'::text;
  END IF;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'anon-execute revoke did not take effect: %', array_to_string(v_bad, ' | ');
  END IF;

  -- Not an assertion — a tripwire. These two must STAY anon-executable; see the
  -- header and scripts/ci/anon-exposure-functions.json. A WARNING rather than an
  -- EXCEPTION so a replay cannot fail on someone else's later decision, but loud
  -- enough that "I revoked them to make the sweep green" does not pass unnoticed.
  IF NOT has_function_privilege('anon', 'public.fn_is_event_creator(uuid)', 'EXECUTE') THEN
    RAISE WARNING 'fn_is_event_creator(uuid) is no longer anon-executable — it is used in three RLS policies granted TO public, so anon queries on event_registration_forms/_sections/_fields now RAISE instead of returning zero rows. The public event-registration form is likely broken.';
  END IF;
  IF NOT has_function_privilege('anon', 'public.fn_is_designated_leave_approver(uuid)', 'EXECUTE') THEN
    RAISE WARNING 'fn_is_designated_leave_approver(uuid) is no longer anon-executable — it is used in hla_select and hla_update on hr_leave_applications, both granted TO public.';
  END IF;
END
$assert$;

-- ROLLBACK (restores the default-PUBLIC state — only if something depended on it)
--   GRANT EXECUTE ON FUNCTION public.fn_resolve_shift_timing(uuid, date) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.fn_resolve_shift_timings_bulk(uuid[], date, date) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.fn_shift_timing_coverage(uuid, date) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.generate_hr_leave_balances_bulk(uuid, uuid[], boolean) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.tms_expire_stale_trips() TO PUBLIC, authenticated;
--
-- VERIFY, in a SEPARATE call — the Management API wraps a batch in one
-- transaction, so a check inside the apply proves nothing. No ACL may begin `=X/`:
--   SELECT p.proname, array_to_string(p.proacl, ' ') AS acl
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('fn_resolve_shift_timing','fn_resolve_shift_timings_bulk',
--                        'fn_save_shift_timing_week','fn_shift_timing_coverage',
--                        'generate_hr_leave_balances_bulk','tms_expire_stale_trips');
--
-- Then re-run the sweep itself — objects verifying is not the same as the gate
-- passing:
--   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… \
--     node scripts/ci/check-anon-exposure-live.mjs
