-- =====================================================================
-- Facilitator Pulse — work-evidenced presence, aggregated for leadership
-- =====================================================================
-- Updated: 2026-07-08 — Director decision: biometric becomes customary
-- (15-day batch import, separate lane); the PRIMARY presence record is the
-- work itself. This RPC aggregates every facilitator work-signal MyJKKN
-- already captures, per facilitator, over a date range:
--
--   sessions_marked     — class sessions where they are the assigned faculty
--                         (their own act; per-period, not per-day)
--   sessions_witnessed  — of those, sessions where >=3 students submitted
--                         feedback (the crowd witness — hard to fake)
--   pulses_run          — live in-class pulses they opened (strongest single
--                         presence proof: real-time, in-room)
--   lessons_linked      — lesson plans they attached to sessions
--   notes_received      — AI improvement/success notes addressed to them
--   verdicts_given      — one-tap verdicts they returned (Gate 4)
--   last_signal_at      — most recent of any signal
--
-- NOT a scoreboard: no understanding scores, no ranks (callers sort by name).
-- Presence signals only. This is a visibility layer beside the official
-- (biometric) record — HR/payroll consequences remain a policy decision.
--
-- Shape notes:
--   • assigned_faculty in the attendance blob is OBJECT OR ARRAY (~19%
--     co-taught) — normalized here via jsonb_typeof + jsonb_build_array
--     (the self-scoped fn_scf_faculty_completion reads object-form only).
--   • Authz: leadership/admin roles only (same list as fn_scf_set_verdict);
--     rows scoped by role_has_institution_access(institution_id) — the
--     role gate is INSIDE this DEFINER fn (RLS does not apply to it).
--   • witnessed floor = 3 matches the loop's MIN_RESPONSES / k-anonymity floor.

CREATE OR REPLACE FUNCTION public.fn_scf_facilitator_pulse(p_from date, p_to date)
RETURNS TABLE(
  faculty_email      text,
  faculty_name       text,
  institution_id     uuid,
  sessions_marked    integer,
  sessions_witnessed integer,
  pulses_run         integer,
  lessons_linked     integer,
  notes_received     integer,
  verdicts_given     integer,
  last_signal_at     timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE
  v_role     text;
  v_is_super boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_facilitator_pulse: not authenticated';
  END IF;

  SELECT p.role, (p.role = 'super_admin' OR p.is_super_admin = true)
    INTO v_role, v_is_super
  FROM public.profiles p WHERE p.id = auth.uid();

  -- Staff-management view: leadership/admin only (mirrors fn_scf_set_verdict's
  -- role list). Faculty/students are rejected — a facilitator sees their own
  -- signals on their own pages, not the roster of peers.
  IF NOT (v_is_super OR is_admin() OR v_role = ANY (ARRAY[
        'administrator','institution_admin','dean','hod','principal','coordinator'])) THEN
    RAISE EXCEPTION 'fn_scf_facilitator_pulse: not authorized';
  END IF;

  RETURN QUERY
  WITH sess AS (
    SELECT sa.institution_id AS inst,
           sa.attendance_date AS ad,
           period.key         AS pid,
           period.value       AS pv
    FROM public.student_attendance sa,
         jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date BETWEEN p_from AND p_to
  ),
  -- Normalize assigned_faculty (object OR array) -> one row per (session, faculty)
  fac_sess AS (
    SELECT s.inst, s.ad, s.pid,
           lower(af.el ->> 'faculty_email') AS femail
    FROM sess s
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(s.pv -> 'assigned_faculty') = 'array'  THEN s.pv -> 'assigned_faculty'
        WHEN jsonb_typeof(s.pv -> 'assigned_faculty') = 'object' THEN jsonb_build_array(s.pv -> 'assigned_faculty')
        ELSE '[]'::jsonb
      END) AS af(el)
    WHERE COALESCE(af.el ->> 'faculty_email', '') <> ''
      -- Tenant scope: super/admin pass; scoped leaders see own-institution rows.
      AND role_has_institution_access(s.inst)
  ),
  marked AS (
    SELECT fs.femail,
           max(fs.inst::text)::uuid AS inst,          -- representative (display)
           count(*)::int            AS n_marked,
           count(*) FILTER (
             WHERE (SELECT count(*) FROM public.session_feedback f
                    WHERE f.attendance_date = fs.ad
                      AND f.period_id       = fs.pid
                      AND lower(f.faculty_email) = fs.femail) >= 3
           )::int                   AS n_witnessed,
           max(fs.ad)               AS last_class
    FROM fac_sess fs
    GROUP BY fs.femail
  )
  SELECT
    m.femail,
    COALESCE(pe.full_name, m.femail),
    m.inst,
    m.n_marked,
    m.n_witnessed,
    (SELECT count(*)::int FROM public.scf_live_pulse lp
      WHERE lower(lp.faculty_email) = m.femail
        AND lp.attendance_date BETWEEN p_from AND p_to),
    (SELECT count(*)::int FROM public.class_session_lesson csl
      JOIN public.profiles lb ON lb.id = csl.linked_by
      WHERE lower(lb.email) = m.femail
        AND csl.attendance_date BETWEEN p_from AND p_to),
    (SELECT count(*)::int FROM public.scf_ai_suggestions sg
      WHERE lower(sg.faculty_email) = m.femail
        AND sg.domain = 'session_feedback'
        AND sg.generated_at::date BETWEEN p_from AND p_to),
    (SELECT count(*)::int FROM public.scf_ai_suggestions sg
      WHERE lower(sg.faculty_email) = m.femail
        AND sg.domain = 'session_feedback'
        AND sg.human_verdict_at IS NOT NULL
        AND sg.human_verdict_at::date BETWEEN p_from AND p_to),
    GREATEST(
      m.last_class::timestamptz,
      (SELECT max(lp.issued_at) FROM public.scf_live_pulse lp
        WHERE lower(lp.faculty_email) = m.femail),
      (SELECT max(sg.human_verdict_at) FROM public.scf_ai_suggestions sg
        WHERE lower(sg.faculty_email) = m.femail)
    )
  FROM marked m
  LEFT JOIN public.profiles pe ON lower(pe.email) = m.femail
  ORDER BY 2;  -- neutral name order — a presence board, never a leaderboard
END;
$$;

-- Lock from anon (Supabase default-privileges grant EXECUTE to anon otherwise).
REVOKE EXECUTE ON FUNCTION public.fn_scf_facilitator_pulse(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_facilitator_pulse(date, date) TO authenticated;
