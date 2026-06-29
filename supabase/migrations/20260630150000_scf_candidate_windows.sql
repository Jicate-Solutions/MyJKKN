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
  SELECT
    f.institution_id,
    f.course_code,
    lower(NULLIF(btrim(f.faculty_email), '')) AS faculty_email
  FROM public.session_feedback f
  WHERE f.attendance_date BETWEEN p_from AND p_to
    AND f.course_code IS NOT NULL
  GROUP BY f.institution_id, f.course_code, lower(NULLIF(btrim(f.faculty_email), ''))
  HAVING count(*) >= 3;
$function$;

-- Mandatory anon lock (Supabase grants anon EXECUTE on every new function by default).
REVOKE EXECUTE ON FUNCTION public.fn_scf_candidate_windows(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_candidate_windows(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
