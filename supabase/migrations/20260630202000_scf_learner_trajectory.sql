-- =============================================================================
-- 20260630202000_scf_learner_trajectory.sql
-- Post-Class Feedback (SCF) → PER-LEARNER UNDERSTANDING TRAJECTORY / at-risk
-- early warning (#3a). Spec: specs/post-class-feedback-attendance-gate-2026-06-15.md
-- =============================================================================
-- WHAT THIS ADDS: for each (learner, course) with enough of the learner's OWN
--   feedback rows, the SLOPE of their `understood` rating across recent sessions, so a
--   facilitator / HOD / principal gets an EARLY WARNING about a specific learner who
--   is sliding — before the term-end grade confirms it. Returns only the SLIDING set
--   (slope <= a threshold), worst-decline first, with the worst+now-struggling subset
--   flagged at_risk.
--
-- ── ANONYMITY RECONCILIATION (read before changing anything here) ─────────────
-- The SCF substrate's blanket invariant is: staff NEVER see a learner's per-session
-- candid rating (understood/checklist/free_text) — that protection is what keeps the
-- feedback honest about the TEACHER. This RPC is a DELIBERATE, NARROW exception of the
-- SAME category the platform already ships in learner_risk_assessments (a staff-facing,
-- per-learner academic risk view with names + trend_direction). It is reconciled with
-- the invariant by THREE hard mitigations, not by waiving it:
--   1. NO RAW RATINGS LEAVE THE FUNCTION. The output carries a derived `slope` (an
--      abstract per-session trend), a `sessions` count, and an `at_risk` boolean.
--      It NEVER returns any single `understood` value, half-window average, checklist,
--      or free_text. You cannot learn "what did learner X say about Tuesday's class" —
--      only "learner X's understanding of this course is trending down."
--   2. K>=3 FLOOR PER LEARNER (p_min_sessions, default 3). A trajectory is computed
--      ONLY from >= 3 of the learner's own ratings, so no single candid rating is
--      reconstructable from the trend.
--   3. MINIMAL DISCLOSURE. Only SLIDING learners (slope <= p_slope_threshold) are
--      returned — not a full roster of everyone's trend. Improving/stable learners are
--      intentionally invisible: this is a help list, not a surveillance list.
-- This exception is scoped to academic early-warning. RATIFIED by the Director on
-- 2026-06-30 (PR #1684): ship as built — named sliding learners visible to institution
-- leadership, with the three mitigations above. The de-identified (counts-only) and
-- hold-for-signoff alternatives were considered and declined. The caller-supplied
-- p_slope_threshold is clamped server-side (below) so the "sliding-only" mitigation
-- cannot be bypassed.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- SLOPE = regr_slope(understood, session_ordinal): understood points gained/lost per
--   SESSION (ordinal 1,2,3… by date), not per calendar day — so it reads as "loses
--   ~0.4 understanding points each session." Negative = sliding. Computed per learner
--   from that learner's OWN rows (never a cohort mean presented as an individual).
--
-- at_risk = sliding (slope <= threshold) AND recently struggling (avg of the learner's
--   two most recent sessions < 3). The recent average is computed INTERNALLY only to
--   set this boolean — it is never returned.
--
-- IDENTITY: session_feedback.student_id == learners_profiles.id (verified 12/12 live
--   2026-06-30; 0 match against profiles.id). Joined for name / register_number /
--   department only — the identity a facilitator needs to actually reach the learner.
--
-- SCOPE GATE: identical to fn_scf_admin_trend / fn_scf_loop_activity — super_admin
--   sees ALL institutions; institution leadership (administrator/institution_admin/
--   dean/hod/principal/coordinator) sees only their own institution; everyone else is
--   rejected. SECURITY DEFINER + STABLE, anon-locked. (Faculty self-scope — a teacher
--   seeing only their own course's sliders — is a documented v2 follow-up; v1 is the
--   leadership early-warning card.)
--
-- ADDITIVE + SAFE: one new function. Touches no tables, no RLS, no existing RPC.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_learner_trajectory(
  p_from            date,
  p_to              date,
  p_min_sessions    integer DEFAULT 3,
  p_slope_threshold numeric DEFAULT -0.15
)
RETURNS TABLE (
  institution_id    uuid,
  institution_name  text,
  student_id        uuid,
  learner_name      text,
  register_number   text,
  department_name   text,
  course_code       text,
  sessions          bigint,
  slope             numeric,
  at_risk           boolean,
  first_session     date,
  last_session      date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_learner_trajectory: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_learner_trajectory: not authorized';
  END IF;

  -- Defensive: never let a caller drop the privacy floor below 3.
  IF p_min_sessions < 3 THEN p_min_sessions := 3; END IF;
  -- PRIVACY CLAMP (review #1684 HIGH): p_slope_threshold is caller-supplied. Left
  -- unclamped, a leader could pass a positive/near-zero value to pull the FULL named
  -- roster (improving + stable learners), defeating the Director-ratified "sliding
  -- learners only / minimal disclosure" mitigation. Force it to a genuinely-declining
  -- ceiling: any value above -0.05 is reset to the -0.15 default.
  IF p_slope_threshold IS NULL OR p_slope_threshold > -0.05 THEN
    p_slope_threshold := -0.15;
  END IF;

  RETURN QUERY
  WITH ordered AS (
    SELECT f.student_id, f.course_code, f.institution_id, f.attendance_date, f.understood,
           row_number() OVER (PARTITION BY f.student_id, f.course_code, f.institution_id
                              ORDER BY f.attendance_date, f.id) AS ord
    FROM public.session_feedback f
    WHERE (v_super OR f.institution_id = v_inst)
      AND f.attendance_date BETWEEN p_from AND p_to
      AND f.course_code IS NOT NULL
  ),
  stats AS (
    SELECT o.student_id, o.course_code, o.institution_id,
           count(*)::bigint                          AS sessions,
           regr_slope(o.understood, o.ord)::numeric  AS slope_raw,  -- regr_slope is double precision; cast so round(.,3) + numeric compare work
           max(o.ord)                                AS mx,
           min(o.attendance_date)            AS first_session,
           max(o.attendance_date)            AS last_session
    FROM ordered o
    GROUP BY o.student_id, o.course_code, o.institution_id
    HAVING count(*) >= p_min_sessions
       AND regr_slope(o.understood, o.ord) IS NOT NULL
  ),
  recent2 AS (
    -- avg of each learner's TWO most recent sessions for the course — internal only.
    SELECT o.student_id, o.course_code, o.institution_id,
           avg(o.understood)::numeric AS recent_avg
    FROM ordered o
    JOIN stats st
      ON st.student_id = o.student_id
     AND st.course_code = o.course_code
     AND st.institution_id = o.institution_id
    WHERE o.ord > st.mx - 2
    GROUP BY o.student_id, o.course_code, o.institution_id
  )
  SELECT
    st.institution_id,
    i.name::text                                                                   AS institution_name,
    st.student_id,
    NULLIF(trim(COALESCE(lp.first_name,'')||' '||COALESCE(lp.last_name,'')), '')::text AS learner_name,
    lp.register_number::text                                                       AS register_number,
    COALESCE(d.department_name,'Unknown')::text                                    AS department_name,
    st.course_code,
    st.sessions,
    round(st.slope_raw, 3)                                                          AS slope,
    (COALESCE(rc.recent_avg, 5) < 3.0)                                             AS at_risk,
    st.first_session,
    st.last_session
  FROM stats st
  LEFT JOIN recent2 rc
    ON rc.student_id = st.student_id
   AND rc.course_code = st.course_code
   AND rc.institution_id = st.institution_id
  LEFT JOIN public.learners_profiles lp ON lp.id = st.student_id
  LEFT JOIN public.departments d        ON d.id = lp.department_id
  LEFT JOIN public.institutions i       ON i.id = st.institution_id
  WHERE st.slope_raw <= p_slope_threshold          -- sliding only (minimal disclosure)
  ORDER BY (COALESCE(rc.recent_avg, 5) < 3.0) DESC,  -- at-risk first
           st.slope_raw ASC                          -- steepest decline first
  -- Cap the board (review #1684 #9). Because the ORDER BY surfaces at-risk-then-
  -- steepest first, the cap can only ever drop the LEAST-declining tail — the
  -- genuinely-critical sliders are always within it, so the truncation is safe by
  -- construction (not arbitrary). Raised from 100 to 200 for headroom; a per-
  -- institution paginated view is a documented follow-up if any college ever
  -- exceeds it (today the whole platform has 3 sliders).
  LIMIT 200;
END;
$$;

COMMENT ON FUNCTION public.fn_scf_learner_trajectory(date,date,integer,numeric) IS
  'SCF per-learner understanding trajectory (early warning, #3a): for each (learner, '
  'course) with >= p_min_sessions of the learner''s OWN feedback rows, the per-session '
  'regr_slope of understood; returns only SLIDING learners (slope <= p_slope_threshold), '
  'at-risk (sliding + recent avg < 3) first. Returns a derived slope + at_risk boolean + '
  'identity only — NEVER any raw understood value (>=3-session floor + no raw ratings = '
  'no candid rating reconstructable). Deliberate, narrow exception to the SCF anonymity '
  'invariant, same category as learner_risk_assessments. super_admin sees all; '
  'institution leadership sees own institution. STABLE, SECURITY DEFINER, anon-locked.';

-- MANDATORY anon lock (CLAUDE.md: Supabase grants anon EXECUTE on new functions by default).
REVOKE EXECUTE ON FUNCTION public.fn_scf_learner_trajectory(date,date,integer,numeric) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_learner_trajectory(date,date,integer,numeric) TO authenticated;

-- PostgREST must see the new function immediately.
NOTIFY pgrst, 'reload schema';
