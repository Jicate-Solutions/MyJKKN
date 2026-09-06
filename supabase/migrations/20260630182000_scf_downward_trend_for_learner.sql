-- 20260630182000_scf_downward_trend_for_learner.sql
-- SCF self-improving loop · LEARNER LANE · #2 trigger for the AI-reserved path.
--
-- The 2nd-time (carry-forward) re-ask is personalised with a cheap TEMPLATE for everyone
-- (see feedback-dialog.tsx). We RESERVE an AI-written, per-learner note for the few learners
-- who are genuinely struggling: those whose last 3 same-course ratings form a DOWNWARD trend.
--
-- This fn is that TRIGGER — the honest, real detector. It returns one row per course where the
-- calling learner's most-recent 3 ratings are non-increasing with a net decline. A future
-- server-side cron (holding a real API key — a subscription cannot power production AI) reads
-- this to decide WHICH learners get a generated note; the actual Claude call is STUBBED for now
-- (documented seam in hooks/use-learner-loop.ts + loop-closure card). The template path works today.
--
-- Identity-scoped: resolves v_lp from auth.uid() (== profiles.id == learners_profiles.profile_id)
-- and reads only this learner's own session_feedback rows (student_id == learners_profiles.id).

CREATE OR REPLACE FUNCTION public.fn_scf_downward_trend_for_learner()
RETURNS TABLE(
  course_code   text,
  course_name   text,
  ratings       smallint[],  -- last 3 ratings, OLDEST -> NEWEST
  rated_on      date[],      -- their dates, aligned to ratings
  net_decline   smallint,    -- ratings[1] - ratings[3] (>0 means dropped)
  is_downward   boolean      -- always true in returned rows (this fn returns only downward courses)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_downward_trend_for_learner: not authenticated';
  END IF;
  SELECT lp.id INTO v_lp
  FROM public.learners_profiles lp
  WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH per_date AS (
    -- One understood value per (course, attendance_date). Same-day async+live_poll
    -- rows must NOT supply 2 of the "3 classes in a row that felt harder" — collapse
    -- to one row per class date first (keep the most-flagged, earliest).
    SELECT DISTINCT ON (f.course_code, f.attendance_date)
           f.course_code,
           f.course_name,
           f.understood,
           f.attendance_date,
           f.created_at
    FROM public.session_feedback f
    WHERE f.student_id = v_lp
      AND f.course_code IS NOT NULL
      AND f.understood IS NOT NULL
    ORDER BY f.course_code, f.attendance_date, f.understood ASC, f.created_at ASC
  ),
  ranked AS (
    -- The learner's own rated CLASS-DATES per course, newest first.
    SELECT pd.course_code,
           pd.course_name,
           pd.understood,
           pd.attendance_date,
           ROW_NUMBER() OVER (
             PARTITION BY pd.course_code
             ORDER BY pd.attendance_date DESC, pd.created_at DESC
           ) AS rn
    FROM per_date pd
  ),
  last3 AS (
    -- Keep courses with at least 3 rated sessions; collapse the latest 3 (oldest->newest)
    -- into aligned arrays. r[1]=oldest of the 3, r[3]=newest overall.
    -- NOTE: qualify every column with the source alias `r` — unqualified course_code /
    -- course_name would be ambiguous with this fn's RETURNS TABLE output columns of the
    -- same name (a plpgsql variable-vs-column collision that only surfaces at execution).
    SELECT r.course_code,
           max(r.course_name) AS course_name,
           array_agg(r.understood      ORDER BY r.attendance_date ASC, r.rn DESC) AS ratings,
           array_agg(r.attendance_date ORDER BY r.attendance_date ASC, r.rn DESC) AS rated_on
    FROM ranked r
    WHERE r.rn <= 3
    GROUP BY r.course_code
    HAVING count(*) = 3
  )
  SELECT l.course_code,
         l.course_name,
         l.ratings::smallint[],
         l.rated_on::date[],
         (l.ratings[1] - l.ratings[3])::smallint AS net_decline,
         true                                    AS is_downward
  FROM last3 l
  -- "Downward trend across 3 sessions": non-increasing AND a net drop,
  -- AND the most-recent class actually wasn't good (<= 3 / "OK or worse").
  -- The floor keeps the AI-reserve honest: a dip from a high base (e.g. 5,5,4)
  -- is NOT a struggling learner and must not trigger an "are you okay, here's
  -- support" message — that would erode trust. Genuine slides (4,3,2 / 3,2,1) stay.
  WHERE l.ratings[1] >= l.ratings[2]
    AND l.ratings[2] >= l.ratings[3]
    AND l.ratings[1] >  l.ratings[3]
    AND l.ratings[3] <= 3
  ORDER BY (l.ratings[1] - l.ratings[3]) DESC, l.course_code;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_downward_trend_for_learner() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_downward_trend_for_learner() TO authenticated;

NOTIFY pgrst, 'reload schema';
