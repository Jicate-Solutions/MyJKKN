-- =============================================================================
-- 20260630150000_scf_candidate_windows.sql
-- SCF generator cron — candidate listing must aggregate, not raw-read.
-- =============================================================================
-- The generator's candidate listing was reading session_feedback (one row PER
-- student response) and de-duping in JS. session_feedback has many rows/course,
-- so PostgREST's default ~1000-row cap would SILENTLY truncate the candidate set
-- once a window exceeds 1000 responses — dropping whole courses and even whole
-- tenants past the cap (a coverage regression flagged in PR review).
--
-- This RPC moves the DISTINCT + the >=3-response floor into the database, so the
-- cron gets ONE row per (institution, course, faculty) window — a small set
-- (number of distinct courses, not responses) with no row-cap exposure. The >=3
-- floor mirrors fn_scf_ai_signal's HAVING, so we only return tuples the signal
-- function would actually score. faculty_email is normalised the same way the
-- signal + record functions normalise it (lower(NULLIF(btrim(...)))).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_candidate_windows(
  p_from date,
  p_to   date
)
RETURNS TABLE(institution_id uuid, course_code text, faculty_email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.institution_id, c.course_code, c.faculty_email
  FROM (
    SELECT
      f.institution_id,
      f.course_code,
      lower(NULLIF(btrim(f.faculty_email), '')) AS faculty_email
    FROM public.session_feedback f
    WHERE f.attendance_date BETWEEN p_from AND p_to
      AND f.course_code IS NOT NULL
      AND f.understood IS NOT NULL          -- mirror fn_scf_ai_signal's scoreable-row basis
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

-- LOCK: service_role ONLY. This is SECURITY DEFINER and returns (institution,
-- course, faculty) tuples across ALL tenants with no per-caller scoping; its only
-- caller is the server-side cron (createServiceRoleClient). Granting `authenticated`
-- would let any logged-in user enumerate cross-tenant data — a deliberate, more
-- restrictive deviation from the usual "GRANT authenticated" anon-lock template,
-- which is only safe for RPCs that scope to auth.uid()/auth.jwt() internally.
REVOKE EXECUTE ON FUNCTION public.fn_scf_candidate_windows(date, date) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_candidate_windows(date, date) TO service_role;

NOTIFY pgrst, 'reload schema';
