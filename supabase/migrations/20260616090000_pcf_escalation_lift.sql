-- =============================================================================
-- 20260616090000_pcf_escalation_lift.sql
-- Post-Class Feedback — CLOSE THE OUTER LOOP (#10).
-- Spec: specs/post-class-feedback-attendance-gate-2026-06-15.md
-- Stacked on the substrate (20260615233000_session_feedback_substrate.sql).
-- =============================================================================
-- WHY: The substrate escalates low-understanding sessions to the Principal
-- (rule: avg(understood) < 3 with >= 3 responses — see fn_scf_principal_escalations).
-- But the loop is OPEN: nothing tracks whether the Principal's follow-up actually
-- improved understanding in the NEXT session of the same class. This RPC closes
-- the rung by linking each escalated session to the next same-faculty+course
-- session and reporting the change in understanding ("lift").
--
-- DEFINITIONS (documented in the PR + the page):
--   "session"       = (faculty + course/section + date/period), per spec §3.
--   "next session"  = the EARLIEST session AFTER the escalated session's date,
--                     taught by the SAME faculty (faculty_email) for the SAME
--                     course (course_code), that has >= 1 feedback response.
--                     We mirror the escalation grouping key exactly
--                     (faculty_email + course_code within institution) so the
--                     "same class" pairing is identical to how escalations are
--                     identified. Matching is on the NEXT DATE (not next period
--                     same day) — a class meets across days, and a same-day
--                     re-teach is rare; date is the meaningful "next time taught".
--   "lift"          = avg_understood(next session) - avg_understood(escalated
--                     session). Positive = understanding improved.
--
-- SECURITY: mirrors fn_scf_principal_escalations EXACTLY —
--   - SECURITY DEFINER + SET search_path = public
--   - auth.uid() role check (super_admin / principal / HOD / dean / etc.)
--   - institution scope (super_admin sees all; others see own institution)
--   - aggregated / ANONYMOUS — never exposes an individual learner row
--   - REVOKE EXECUTE FROM anon, PUBLIC + GRANT EXECUTE TO authenticated
--
-- ADDITIVE + SAFE: read-only over session_feedback. No new tables, no writes,
-- no change to the attendance blob or the official attendance %.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_escalation_followups(p_from date, p_to date)
RETURNS TABLE (
  -- Escalated session (the trigger)
  attendance_date        date,
  period_id              text,
  course_code            text,
  course_name            text,
  faculty_email          text,
  responses              bigint,
  avg_understood         numeric,
  low_understanding      bigint,
  -- Next same-faculty+course session (the follow-up)
  next_attendance_date   date,
  next_responses         bigint,
  next_avg_understood    numeric,
  -- Computed
  lift                   numeric          -- next_avg - escalated_avg; NULL = no next session yet
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_escalation_followups: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_escalation_followups: not authorized';
  END IF;

  RETURN QUERY
  WITH
  -- Per-session aggregate over every session that has feedback in scope, keyed
  -- by the same grouping as the escalation RPC (date + period + course + faculty).
  -- institution scope is applied here so both the escalated and the "next"
  -- session are inside the caller's institution.
  sessions AS (
    SELECT f.institution_id,
           f.attendance_date AS sess_date,
           f.period_id       AS sess_period,
           f.course_code     AS sess_course_code,
           f.course_name     AS sess_course_name,
           lower(f.faculty_email) AS sess_faculty,
           f.faculty_email   AS sess_faculty_email,  -- original-cased for display
           count(*)::bigint   AS sess_responses,
           round(avg(f.understood)::numeric, 2) AS sess_avg,
           count(*) FILTER (WHERE f.understood <= 2)::bigint AS sess_low
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = v_inst)
    GROUP BY f.institution_id, f.attendance_date, f.period_id,
             f.course_code, f.course_name, lower(f.faculty_email), f.faculty_email
  ),
  -- The escalated sessions in the requested window (mirrors
  -- fn_scf_principal_escalations: >= 3 responses AND avg < 3).
  escalated AS (
    SELECT * FROM sessions s
    WHERE s.sess_date BETWEEN p_from AND p_to
      AND s.sess_responses >= 3
      AND s.sess_avg < 3
  ),
  -- For each escalated session, the EARLIEST later session of the same class
  -- (same institution + faculty + course), regardless of period. Picked by
  -- ascending date so it is the next time that class was taught.
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
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_escalation_followups(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_escalation_followups(date,date) TO authenticated;

-- PostgREST must see the new function immediately.
NOTIFY pgrst, 'reload schema';
