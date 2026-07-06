-- ============================================================================
-- CARRE Coverage Map — Phase 2: evidence-grade auto-signals (ADDITIVE-ONLY)
-- Spec: specs/carre-coverage-phase2-auto-signals-2026-07-06.md
-- Stacks on: 20260705140000_carre_coverage.sql (fn_carre_module_coverage).
--
-- Adds a PARALLEL, clearly-labeled "auto-derived" lane to the coverage map,
-- computed from live participant data. It is NEVER merged into or allowed to
-- override the human /100 index — the page renders it in its own column.
--
-- HARD INVARIANTS (see spec §1):
--   1. Respect (RS1–RS5) is NEVER auto-scored — this function is physically
--      incapable of emitting a CARRE-RS* code (whitelist + assertion below).
--   2. Evidence-grade only — a signal exists only where the underlying table
--      has populated, experience-reflecting rows. A feature's mere existence,
--      a config flag, or an empty table is NOT a signal.
--   3. k>=3 anonymity floor — no signal below 3 participants (never a fake 0).
--
-- WHY ONLY ONE SIGNAL SHIPS (fill-rate gate, prod probe 2026-07-06):
--   * campus_living_recognition = 0 rows  -> A4/R3 would be false greens. None.
--   * session_feedback = 1,274 rows but INBOUND ONLY (no response/change field)
--       -> A3 "fast loops" / E5 "voice-changes-system" have no return leg. None.
--   * session_feedback DOES honestly support a participation signal for the
--       Academic module (below), with the active-session denominator.
--
-- ADDITIVE-ONLY GUARANTEE: this migration NEVER edits, DROPs, or
-- CREATE OR REPLACEs any existing fn_care_* / fn_carre_* function, the human
-- /100 index, or any existing table. It only ADDs fn_carre_module_auto_signals.
--
-- NOT applied to production by this file — applied via Management API AFTER
-- merge (MyJKKN deploy ships CODE, not migrations).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_carre_module_auto_signals — per-module evidence-grade auto-signals.
--
-- Returns AT MOST one row per (module_key, signal_code). A module with no
-- evidence-grade data returns NO row (the page renders "—", never a fake score).
--
-- Signal shipped: FEEDBACK_PARTICIPATION for module 'academic'
--   Of learners marked Present in a session that collected >=1 post-class
--   feedback in the last 30 days, the share who submitted their own feedback.
--   value_pct = submitted / present_in_active_sessions.  (Active-session
--   denominator — NOT platform-wide — so a scoped pilot is not divided by
--   every class on campus.)  Mirrors the present/confirmed join proven in
--   fn_scf_faculty_completion; period_id is a UUID so (date, period_id)
--   uniquely identifies a session.
--
-- LEADERSHIP-GATED (mirror of fn_carre_module_coverage): a caller without
-- audit.cycle.view / admin / super_admin gets an empty set.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_module_auto_signals()
RETURNS TABLE (
  module_key    text,
  signal_code   text,     -- neutral, non-CARRE code; NEVER a CARRE-RS* value
  label         text,
  value_pct     numeric,
  numerator     integer,  -- submitted feedback in active sessions
  denominator   integer,  -- present learners in active sessions (k-floor base)
  cohort_count  integer,  -- number of active sessions (context for the reader)
  window_days   integer,
  computed_at   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window      integer := 30;
  v_code        text    := 'FEEDBACK_PARTICIPATION';
  v_k_floor     integer := 3;
  v_present     integer;
  v_submitted   integer;
  v_sessions    integer;
BEGIN
  -- Gate 1: authenticated.
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Gate 2: leadership only (mirror of fn_carre_module_coverage).
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('audit.cycle.view')) THEN
    RETURN;
  END IF;

  -- Invariant #1, enforced in code: Respect is never auto-scored. The signal
  -- code is a fixed neutral whitelist and can never be a CARRE-RS* value.
  IF v_code ~ '^CARRE-RS' OR v_code NOT IN ('FEEDBACK_PARTICIPATION') THEN
    RAISE EXCEPTION 'fn_carre_module_auto_signals: illegal signal code %', v_code;
  END IF;

  -- --------------------------------------------------------------------------
  -- Academic · FEEDBACK_PARTICIPATION
  -- present-in-active-session slots vs those with a matching feedback row.
  -- --------------------------------------------------------------------------
  WITH fb AS (
    -- Sessions that actually ran the feedback loop (>=1 submission). period_id
    -- is a UUID -> (attendance_date, period_id) uniquely identifies a session.
    SELECT DISTINCT sf.attendance_date, sf.period_id
    FROM public.session_feedback sf
    WHERE sf.attendance_date >= (current_date - v_window)
  ),
  fb_days AS (
    SELECT DISTINCT attendance_date FROM fb
  ),
  present AS (
    -- Present (student x session) slots, from the faculty-owned attendance blob.
    -- Restricted to days that had feedback (prune) then joined to fb on period.
    SELECT sa.attendance_date,
           period.key                    AS period_id,
           (st ->> 'student_id')::uuid   AS student_id
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(sa.attendance_data) AS period
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(period.value -> 'students') = 'array'
           THEN period.value -> 'students'
           ELSE '[]'::jsonb END) AS st
    WHERE sa.attendance_data IS NOT NULL
      AND jsonb_typeof(sa.attendance_data) = 'object'
      AND sa.attendance_date >= (current_date - v_window)
      AND sa.attendance_date IN (SELECT attendance_date FROM fb_days)
      AND st ->> 'status' = 'Present'
  ),
  present_active AS (
    SELECT p.*
    FROM present p
    JOIN fb ON fb.attendance_date = p.attendance_date
           AND fb.period_id       = p.period_id
  ),
  matched AS (
    SELECT p.*,
           EXISTS (
             SELECT 1 FROM public.session_feedback f
             WHERE f.student_id      = p.student_id
               AND f.attendance_date = p.attendance_date
               AND f.period_id       = p.period_id
           ) AS submitted
    FROM present_active p
  )
  SELECT count(*)::int,
         count(*) FILTER (WHERE submitted)::int,
         count(DISTINCT (attendance_date, period_id))::int
    INTO v_present, v_submitted, v_sessions
  FROM matched;

  -- Evidence-grade + k>=3 floor: no populated rows -> NO signal (never a fake 0).
  IF v_present IS NULL OR v_present < v_k_floor THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'academic'::text,
    v_code,
    'Feedback participation'::text,
    round(v_submitted::numeric / NULLIF(v_present, 0) * 100, 0),
    v_submitted,
    v_present,
    v_sessions,
    v_window,
    now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_module_auto_signals() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_module_auto_signals() TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_carre_module_auto_signals IS
  'CARRE Coverage Map Phase 2: evidence-grade per-module AUTO-derived signals '
  '(labeled separately, never merged into the human /100). Ships '
  'FEEDBACK_PARTICIPATION for module academic = share of present learners in '
  'active feedback sessions (30d) who submitted. k>=3 floor; empty data => no '
  'row. Respect (CARRE-RS*) is never emittable. Leadership-gated '
  '(audit.cycle.view). Additive-only; edits no fn_care_*/fn_carre_*.';

-- PostgREST schema-cache reload (new function invisible to REST until this).
NOTIFY pgrst, 'reload schema';
