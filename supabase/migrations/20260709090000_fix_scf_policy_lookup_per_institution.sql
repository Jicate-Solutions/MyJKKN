-- ============================================================================
-- Updated: 2026-07-09 - PERF: resolve the SCF feedback-window policy ONCE per
--                       institution instead of once per session_feedback row.
--
-- WHY
-- ---
-- 20260709000100_scf_two_sided_48h_window.sql added a "generator maturity" check
-- to fn_scf_candidate_windows and fn_scf_ai_signal:
--
--     AND now() > (f.attendance_date ... ) + make_interval(hours =>
--           public.fn_get_policy_int('session_feedback.window_hours', 48, f.institution_id))
--
-- `f.institution_id` is correlated per-row, so the planner cannot hoist the call.
-- fn_get_policy_int() therefore ran once per in-window session_feedback row
-- (~23,000/run) even though only 6 distinct institutions appear in the window and
-- exactly one global `session_feedback.window_hours` policy row exists — every one
-- of those calls returned the identical constant.
--
-- Consequence: the scf-generate-suggestions cron began failing the very next run
-- after that migration landed:
--     HTTP 500 · canceling statement due to statement timeout
-- session_feedback grows ~3,300 rows/day, so this only ever got worse.
--
-- MEASURED ON PROD (2026-07-09, 23,232 rows in the 7-day window, 6 institutions)
--     grouped scan, policy fn called per row   : 13,750 ms
--     grouped scan, literal 48 (control)       :     44 ms
--     grouped scan, this fix                   :     81 ms
-- Row output is byte-identical (395 candidate rows; EXCEPT in both directions = 0).
--
-- HOW
-- ---
-- Build a {institution_id -> window_hours} map ONCE in a MATERIALIZED CTE, then
-- CROSS JOIN that single row and look the window up per row from the map.
--
--   * MATERIALIZED is load-bearing. A plain `WITH win AS (...)` is INLINED in
--     PG12+, letting the planner re-execute it on every rescan — which puts
--     fn_get_policy_int() straight back on the per-row path. (First attempt at
--     this fix did exactly that and only got 35.4s -> 32.5s.)
--   * A single-row CROSS JOIN cannot be rescanned per outer row, so the map is
--     evaluated exactly once regardless of the chosen join strategy.
--   * The map is keyed by institution_id::text with a '_null' sentinel for the
--     NULL-institution rows, so NULL is handled without a NULL-unsafe join and
--     without a sentinel UUID that could theoretically collide with a real id.
--
-- Per-institution override semantics are preserved exactly: the policy is still
-- resolved with each institution's own id, just once instead of once per row.
-- Signatures, return types, volatility, security and grants are unchanged.
--
-- Do NOT "fix" this by raising statement_timeout: the cost is O(rows-in-window)
-- and the table grows daily, the wasted work competes with ai-routine-dispatcher
-- and ai-tasks-sweep (both every 15 min), and it cannot rescue the route's
-- Vercel maxDuration=300.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_candidate_windows(p_from date, p_to date)
 RETURNS TABLE(institution_id uuid, course_code text, faculty_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- {institution_id -> window_hours}, resolved once. See migration header.
  WITH win AS MATERIALIZED (
    SELECT jsonb_object_agg(
             COALESCE(d.inst_id::text, '_null'),
             public.fn_get_policy_int('session_feedback.window_hours', 48, d.inst_id)
           ) AS m
    FROM (
      SELECT DISTINCT f.institution_id AS inst_id
      FROM public.session_feedback f
      WHERE f.attendance_date BETWEEN p_from AND p_to
        AND f.course_code IS NOT NULL
        AND f.understood IS NOT NULL
    ) d
  )
  SELECT c.institution_id, c.course_code, c.faculty_email
  FROM (
    SELECT
      f.institution_id,
      f.course_code,
      lower(NULLIF(btrim(f.faculty_email), '')) AS faculty_email
    FROM public.session_feedback f
    CROSS JOIN win w
    WHERE f.attendance_date BETWEEN p_from AND p_to
      AND f.course_code IS NOT NULL
      AND f.understood IS NOT NULL          -- mirror fn_scf_ai_signal's scoreable-row basis
      -- Generator maturity (Director, 2026-07-08): coach ONLY on sessions whose
      -- feedback window has CLOSED — the sample can no longer change (submission
      -- is rejected past the window), so the note reads a final sample instead of
      -- a still-open one. Same IST anchor + lever as fn_scf_faculty_completion.
      AND now() > (f.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
            + make_interval(hours => (w.m ->> COALESCE(f.institution_id::text, '_null'))::int)
    GROUP BY f.institution_id, f.course_code, lower(NULLIF(btrim(f.faculty_email), ''))
    HAVING count(*) >= 3                    -- mirrors MIN_RESPONSES in the cron + fn_scf_ai_signal
  ) c
  LEFT JOIN LATERAL (
    SELECT max(s.generated_at) AS last_at
    FROM public.scf_ai_suggestions s
    WHERE s.domain = 'session_feedback'
      AND s.course_code     = c.course_code
      AND s.institution_id IS NOT DISTINCT FROM c.institution_id
      AND s.faculty_email  IS NOT DISTINCT FROM c.faculty_email
  ) la ON true
  -- FAIR ROTATION: order by least-recently-suggested (never-suggested NULLS FIRST,
  -- then longest-ago) so the BATCH_CAP slice always favours the neediest courses.
  -- A fixed alphabetical sort would let early-sorting tenants permanently starve
  -- later ones once daily candidates exceed BATCH_CAP=25; this self-rotates —
  -- once a course is suggested it sorts last until the others catch up.
  ORDER BY la.last_at ASC NULLS FIRST, c.institution_id, c.course_code;
$function$;


CREATE OR REPLACE FUNCTION public.fn_scf_ai_signal(p_course_code text, p_from date, p_to date, p_institution_id uuid DEFAULT NULL::uuid, p_faculty_email text DEFAULT NULL::text)
 RETURNS TABLE(course_code text, responses bigint, low_responses bigint, avg_understood numeric, free_texts text[], session_dates date[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Same per-institution hoist as fn_scf_candidate_windows. See migration header.
  WITH win AS MATERIALIZED (
    SELECT jsonb_object_agg(
             COALESCE(d.inst_id::text, '_null'),
             public.fn_get_policy_int('session_feedback.window_hours', 48, d.inst_id)
           ) AS m
    FROM (
      SELECT DISTINCT f.institution_id AS inst_id
      FROM public.session_feedback f
      WHERE f.course_code = p_course_code
        AND f.attendance_date BETWEEN p_from AND p_to
        AND (p_institution_id IS NULL OR f.institution_id = p_institution_id)
        AND (p_faculty_email  IS NULL OR lower(f.faculty_email) = lower(p_faculty_email))
    ) d
  )
  SELECT
    p_course_code                                                          AS course_code,
    count(*)                                                               AS responses,
    count(*) FILTER (WHERE f.understood <= 2)                              AS low_responses,
    round(avg(f.understood)::numeric, 2)                                   AS avg_understood,
    array_agg(f.free_text) FILTER (
      WHERE f.free_text IS NOT NULL AND btrim(f.free_text) <> ''
    )                                                                      AS free_texts,
    -- The exact contributing session dates, so the generated note can cite them
    -- ("based on your classes on 5 Jul, 6 Jul") instead of a vague date range.
    array_agg(DISTINCT f.attendance_date ORDER BY f.attendance_date)       AS session_dates
  FROM public.session_feedback f
  CROSS JOIN win w
  WHERE f.course_code = p_course_code
    AND f.attendance_date BETWEEN p_from AND p_to
    AND (p_institution_id IS NULL OR f.institution_id = p_institution_id)
    AND (p_faculty_email  IS NULL OR lower(f.faculty_email) = lower(p_faculty_email))
    -- Generator maturity (Director, 2026-07-08): aggregate ONLY closed-window
    -- sessions — mirrors fn_scf_candidate_windows so signal and candidacy agree.
    AND now() > (f.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
          + make_interval(hours => (w.m ->> COALESCE(f.institution_id::text, '_null'))::int)
  HAVING count(*) >= 3;
$function$;


-- Grants: reproduce the live grants exactly (CREATE OR REPLACE preserves them,
-- but these are stated explicitly so the secdef-anon-revoke CI gate can see them
-- and so the intent is auditable). Verified live 2026-07-09 via
-- has_function_privilege(): candidate_windows = service_role only;
-- ai_signal = authenticated (the /api/academic/session-feedback/ai-suggest-improvement
-- route calls it with the caller's session) + service_role.
REVOKE EXECUTE ON FUNCTION public.fn_scf_candidate_windows(date, date)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_candidate_windows(date, date)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_scf_ai_signal(text, date, date, uuid, text)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_ai_signal(text, date, date, uuid, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
