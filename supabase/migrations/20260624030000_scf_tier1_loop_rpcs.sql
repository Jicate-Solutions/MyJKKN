-- 2026-06-24 — Session-feedback learning loop, Tier-1 "cheap wins" RPCs.
-- Roadmap: specs/session-feedback-loop-ai-assist-roadmap-2026-06-23.md (B1 + C3).
--
-- Two self-scoped reads that put the loop's already-existing machinery on the
-- right desks:
--   1) fn_scf_faculty_followups  — the TEACHER's own "topics to revisit" (their
--      low-understanding sessions + whether the next same-class session improved).
--      A self-scoped clone of fn_scf_principal_escalations' lift RPC
--      (fn_scf_escalation_followups): identical RETURNS TABLE + body, the only
--      change is the auth gate — role/institution scope is replaced by
--      "rows where lower(faculty_email) = caller's email" (the resolution used by
--      fn_scf_faculty_summary). So the existing EscalationFollowupRow + FollowupCell
--      render it unchanged.
--   2) fn_scf_my_impact          — the STUDENT's private "your voice this term"
--      receipt: their OWN feedback rows (participation) + whether each flagged
--      session's class improved next time. Anonymity: the function returns only a
--      derived `improved` boolean, gated on a k>=3 responses floor on BOTH the
--      flagged session and its next session — never a raw class average — so a
--      small class can't be de-anonymised from the receipt.
--
-- Both are SECURITY DEFINER + REVOKE anon/PUBLIC + GRANT authenticated (the
-- mandatory new-RPC lock, CLAUDE.md). Neither returns another learner's identity
-- or any individual rating.

-- ============================================================================
-- 1) fn_scf_faculty_followups — teacher's own low sessions + the lift.
--    Mirrors fn_scf_escalation_followups exactly except for the auth gate and the
--    institution-scope swap (self-scope to the caller's faculty_email).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_scf_faculty_followups(p_from date, p_to date)
RETURNS TABLE(
  attendance_date date,
  period_id text,
  course_code text,
  course_name text,
  faculty_email text,
  responses bigint,
  avg_understood numeric,
  low_understanding bigint,
  next_attendance_date date,
  next_responses bigint,
  next_avg_understood numeric,
  lift numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_faculty_followups: not authenticated';
  END IF;
  -- Self-scope: resolve the caller's email (same as fn_scf_faculty_summary). No
  -- role gate — a teacher only ever sees rows for sessions they themselves taught.
  SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH
  sessions AS (
    SELECT f.institution_id,
           f.attendance_date AS sess_date,
           f.period_id       AS sess_period,
           f.course_code     AS sess_course_code,
           f.course_name     AS sess_course_name,
           lower(f.faculty_email) AS sess_faculty,
           f.faculty_email   AS sess_faculty_email,
           count(*)::bigint   AS sess_responses,
           round(avg(f.understood)::numeric, 2) AS sess_avg,
           count(*) FILTER (WHERE f.understood <= 2)::bigint AS sess_low
    FROM public.session_feedback f
    WHERE lower(f.faculty_email) = lower(v_email)   -- the only scope: the caller's own sessions
    GROUP BY f.institution_id, f.attendance_date, f.period_id,
             f.course_code, f.course_name, lower(f.faculty_email), f.faculty_email
  ),
  escalated AS (
    SELECT * FROM sessions s
    WHERE s.sess_date BETWEEN p_from AND p_to
      AND s.sess_responses >= 3
      AND s.sess_avg < 3
  ),
  paired AS (
    SELECT e.*,
           n.sess_date      AS nxt_date,
           n.sess_responses AS nxt_responses,
           n.sess_avg       AS nxt_avg
    FROM escalated e
    LEFT JOIN LATERAL (
      SELECT s2.sess_date, s2.sess_responses, s2.sess_avg
      FROM sessions s2
      WHERE s2.institution_id = e.institution_id
        AND s2.sess_faculty   = e.sess_faculty
        AND s2.sess_course_code IS NOT DISTINCT FROM e.sess_course_code
        AND s2.sess_date > e.sess_date
      ORDER BY s2.sess_date ASC
      LIMIT 1
    ) n ON true
  )
  SELECT p.sess_date         AS attendance_date,
         p.sess_period        AS period_id,
         p.sess_course_code   AS course_code,
         p.sess_course_name   AS course_name,
         p.sess_faculty_email AS faculty_email,
         p.sess_responses     AS responses,
         p.sess_avg           AS avg_understood,
         p.sess_low           AS low_understanding,
         p.nxt_date           AS next_attendance_date,
         p.nxt_responses      AS next_responses,
         p.nxt_avg            AS next_avg_understood,
         CASE WHEN p.nxt_avg IS NULL THEN NULL
              ELSE round((p.nxt_avg - p.sess_avg)::numeric, 2) END AS lift
  FROM paired p
  ORDER BY p.sess_avg ASC, p.sess_date DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_faculty_followups(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_faculty_followups(date, date) TO authenticated;

-- ============================================================================
-- 2) fn_scf_my_impact — student's private "your voice this term" receipt.
--    One row per session the learner gave feedback on (their participation),
--    plus whether the class improved next time (the loop-close), masked to a
--    k>=3 anonymity floor. Returns NO raw class average — only the boolean.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_scf_my_impact(p_from date, p_to date)
RETURNS TABLE(
  attendance_date date,
  course_code text,
  course_name text,
  my_understood smallint,
  flagged boolean,
  next_attendance_date date,
  improved boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_my_impact: not authenticated';
  END IF;
  -- The learner identity used on the feedback row is learners_profiles.id
  -- (resolved from profile_id = auth.uid()), exactly as fn_scf_submit_feedback writes it.
  SELECT lp.id INTO v_lp
  FROM public.learners_profiles lp
  WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;   -- caller is not a learner → empty receipt

  RETURN QUERY
  WITH
  -- Per-class aggregate (institution + date + period + course + faculty). No
  -- course_name in the key so each session is exactly one row (course_name is
  -- read from the learner's own row below). Used only to derive the lift; the
  -- averages themselves never leave this function.
  sessions AS (
    SELECT f.institution_id,
           f.attendance_date AS sess_date,
           f.period_id       AS sess_period,
           f.course_code     AS sess_course_code,
           lower(f.faculty_email) AS sess_faculty,
           count(*)::bigint   AS sess_responses,
           round(avg(f.understood)::numeric, 2) AS sess_avg
    FROM public.session_feedback f
    GROUP BY f.institution_id, f.attendance_date, f.period_id,
             f.course_code, lower(f.faculty_email)
  ),
  -- The learner's OWN feedback rows in the window (their participation ledger).
  mine AS (
    SELECT f.institution_id,
           f.attendance_date,
           f.period_id,
           f.course_code,
           f.course_name,
           lower(f.faculty_email) AS faculty,
           f.understood AS my_understood
    FROM public.session_feedback f
    WHERE f.student_id = v_lp
      AND f.attendance_date BETWEEN p_from AND p_to
  ),
  paired AS (
    SELECT m.*,
           cur.sess_responses AS cur_responses,
           cur.sess_avg       AS cur_avg,
           n.sess_date        AS nxt_date,
           n.sess_responses   AS nxt_responses,
           n.sess_avg         AS nxt_avg
    FROM mine m
    -- The class aggregate for the learner's own session.
    LEFT JOIN sessions cur
      ON  cur.institution_id    = m.institution_id
      AND cur.sess_date         = m.attendance_date
      AND cur.sess_period       = m.period_id
      AND cur.sess_course_code IS NOT DISTINCT FROM m.course_code
      AND cur.sess_faculty      = m.faculty
    -- The next time that same class (course + faculty) was taught, any period.
    LEFT JOIN LATERAL (
      SELECT s2.sess_date, s2.sess_responses, s2.sess_avg
      FROM sessions s2
      WHERE s2.institution_id    = m.institution_id
        AND s2.sess_faculty      = m.faculty
        AND s2.sess_course_code IS NOT DISTINCT FROM m.course_code
        AND s2.sess_date > m.attendance_date
      ORDER BY s2.sess_date ASC
      LIMIT 1
    ) n ON true
  )
  SELECT p.attendance_date,
         p.course_code,
         p.course_name,
         p.my_understood,
         (p.my_understood <= 2) AS flagged,
         p.nxt_date AS next_attendance_date,
         -- improved = did the class average rise next time? Only revealed when BOTH
         -- the session and its next session have >= 3 responses (k-anonymity floor);
         -- otherwise NULL ("awaiting"), so no individual rating can be inferred.
         CASE
           WHEN p.cur_avg IS NULL OR p.nxt_avg IS NULL THEN NULL
           WHEN COALESCE(p.cur_responses, 0) < 3 OR COALESCE(p.nxt_responses, 0) < 3 THEN NULL
           ELSE (p.nxt_avg > p.cur_avg)
         END AS improved
  FROM paired p
  ORDER BY p.attendance_date DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_my_impact(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_my_impact(date, date) TO authenticated;

-- Refresh PostgREST's schema cache so the new RPCs are callable immediately.
NOTIFY pgrst, 'reload schema';
