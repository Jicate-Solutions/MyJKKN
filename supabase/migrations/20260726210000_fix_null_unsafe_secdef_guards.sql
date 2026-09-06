-- ============================================================================
-- Updated: 2026-07-26 — make the two NULL-unsafe super-admin guards deny on NULL.
-- ============================================================================
-- WHY: both functions guard with a BARE inline subquery:
--
--   IF NOT (SELECT (p.role = 'super_admin' OR p.is_super_admin = true)
--           FROM public.profiles p WHERE p.id = auth.uid()) THEN
--
-- When the caller has no matching `profiles` row the subquery returns NO ROWS,
-- so the scalar is NULL, `NOT NULL` is NULL, and IF treats NULL as false — the
-- branch is skipped and the RAISE never fires. The function runs. NULL must
-- mean deny; here it meant allow.
--
-- This is NOT theoretical. It does not require an absent session, only an absent
-- profiles row. Measured on production 2026-07-26: 6,801 auth.users vs 7,046
-- profiles, with 830 auth.users having NO profiles row — sampled as
-- email-confirmed, not banned, and previously signed in. `anon` holds no EXECUTE
-- on either function, but `authenticated` does, and a direct PostgREST rpc/ call
-- with such a user's own JWT bypasses the Next.js middleware that would otherwise
-- bounce them to /auth/complete-profile.
--
-- Proven in a rolled-back transaction, impersonating a real profile-less user:
--   SELECT count(*) FROM public.fn_ai_routine_schedules_list();  -- returned 46
-- Expected 'not authorized'.
--
-- FIX: COALESCE(..., false) — the same NULL-safe form fn_ai_queue_health ships.
-- Bodies are otherwise reproduced verbatim from pg_get_functiondef() on
-- production, so nothing else changes. The grants are correct as they stand;
-- the guard was the defect.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ai_routine_schedules_list()
RETURNS SETOF ai_routine_schedules
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- COALESCE is load-bearing: no profiles row -> NULL -> IF skipped -> runs.
  IF NOT COALESCE((SELECT (p.role = 'super_admin' OR p.is_super_admin = true)
                   FROM public.profiles p WHERE p.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'fn_ai_routine_schedules_list: not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.ai_routine_schedules ORDER BY routine_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_ai_routine_schedule_upsert(
  p_routine_id text,
  p_enabled boolean,
  p_days_of_week smallint[],
  p_minute_of_day smallint
)
RETURNS ai_routine_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_row public.ai_routine_schedules;
BEGIN
  -- COALESCE is load-bearing: see header. This one is a WRITE path.
  IF NOT COALESCE((SELECT (p.role = 'super_admin' OR p.is_super_admin = true)
                   FROM public.profiles p WHERE p.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'fn_ai_routine_schedule_upsert: not authorized';
  END IF;
  IF p_minute_of_day IS NULL OR p_minute_of_day < 0 OR p_minute_of_day > 1439 THEN
    RAISE EXCEPTION 'minute_of_day out of range';
  END IF;
  IF p_days_of_week IS NULL OR array_length(p_days_of_week, 1) IS NULL THEN
    RAISE EXCEPTION 'days_of_week must not be empty (a schedule with no days would silently never run)';
  END IF;
  IF NOT (p_days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]) THEN
    RAISE EXCEPTION 'days_of_week must be 0..6';
  END IF;

  INSERT INTO public.ai_routine_schedules
    (routine_id, enabled, days_of_week, minute_of_day, updated_by, updated_at)
  VALUES
    (p_routine_id, COALESCE(p_enabled, true), COALESCE(p_days_of_week, '{0,1,2,3,4,5,6}'),
     p_minute_of_day, auth.uid(), now())
  ON CONFLICT (routine_id) DO UPDATE SET
    enabled       = EXCLUDED.enabled,
    days_of_week  = EXCLUDED.days_of_week,
    minute_of_day = EXCLUDED.minute_of_day,
    updated_by    = auth.uid(),
    updated_at    = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

-- Grants restated explicitly. CREATE OR REPLACE preserves the ACL of an existing
-- function, so this is a no-op on production; it exists so a replay onto a fresh
-- database cannot inherit Supabase's default `GRANT ALL ON FUNCTIONS TO anon`.
REVOKE EXECUTE ON FUNCTION public.fn_ai_routine_schedules_list() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_routine_schedules_list() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_ai_routine_schedule_upsert(text, boolean, smallint[], smallint) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_routine_schedule_upsert(text, boolean, smallint[], smallint) TO authenticated;
