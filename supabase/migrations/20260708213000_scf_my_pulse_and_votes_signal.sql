-- =====================================================================
-- Facilitator Pulse — student votes as the 8th board signal + My Pulse
-- =====================================================================
-- Updated: 2026-07-08 — two gaps in the "presence proven by work" doctrine:
--
-- (A) fn_scf_facilitator_pulse gains ONE output column, votes_received —
--     student Better/Same/Worse resolution answers cast on this facilitator's
--     loop-closure notes (scf_note_resolution_votes → scf_ai_suggestions,
--     domain='session_feedback'), counted by vote-created date in [p_from,
--     p_to]. TOTAL VOLUME ONLY — never the Better/Same/Worse split. The
--     k>=3-floored split lives exclusively in fn_scf_note_resolution_counts;
--     this column says "students answered N times on their notes", nothing
--     about WHAT they answered, so no individual (or tiny class) is ever
--     reconstructable from the board. Everything else — role gate, tenant
--     scoping, neutral name order — is unchanged.
--
-- (B) NEW fn_scf_my_pulse() — the facilitator's OWN signals in one place.
--     fn_scf_facilitator_pulse deliberately raises for non-leadership ("a
--     facilitator sees their own signals on their own pages"), but no single
--     own-pulse surface existed. This fn returns the SAME signal counts,
--     self-scoped to the caller (auth.uid() → profiles.email, lowercased),
--     over the last 30 days. No role gate beyond authenticated; a caller with
--     no signals gets a zero-counts row (never a raise) — the surface is
--     decorative. Self-scoping by the caller's own email IS the tenant scope.
--
-- Doctrine unchanged: NOT a scoreboard — no understanding scores, no ranks.

-- ---------------------------------------------------------------------
-- (A) Leadership board fn: adding a RETURNS column requires drop+recreate
--     (CREATE OR REPLACE cannot change an existing function's return type).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_scf_facilitator_pulse(date, date);

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
  votes_received     integer,
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
    -- Signal: student resolution votes received on this facilitator's notes.
    -- VOLUME ONLY — the Better/Same/Worse split stays behind the k>=3 floor
    -- in fn_scf_note_resolution_counts, never on this board.
    (SELECT count(*)::int FROM public.scf_note_resolution_votes rv
      JOIN public.scf_ai_suggestions sg ON sg.id = rv.suggestion_id
      WHERE lower(sg.faculty_email) = m.femail
        AND sg.domain = 'session_feedback'
        AND rv.created_at::date BETWEEN p_from AND p_to),
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

-- ---------------------------------------------------------------------
-- (B) My Pulse — the caller's OWN signals, last 30 days, one row always.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_my_pulse()
RETURNS TABLE(
  sessions_marked    integer,
  sessions_witnessed integer,
  pulses_run         integer,
  lessons_linked     integer,
  notes_received     integer,
  verdicts_given     integer,
  votes_received     integer,
  last_signal_at     timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE
  v_email text;
  -- Attendance dates are IST-local calendar dates (same convention as the
  -- loop-closure fn's action_date) — window the last 30 days in IST.
  v_to    date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_from  date := (now() AT TIME ZONE 'Asia/Kolkata')::date - 30;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_my_pulse: not authenticated';
  END IF;

  -- Self-scope: the caller's own email IS the key and the tenant boundary.
  SELECT lower(p.email) INTO v_email
  FROM public.profiles p WHERE p.id = auth.uid();

  IF v_email IS NULL OR v_email = '' THEN
    -- Nothing can be keyed to this caller — zero-counts row, never a raise
    -- (decorative surface; the card quietly shows zeros / nothing).
    RETURN QUERY SELECT 0, 0, 0, 0, 0, 0, 0, NULL::timestamptz;
    RETURN;
  END IF;

  RETURN QUERY
  WITH sess AS (
    SELECT sa.attendance_date AS ad,
           period.key         AS pid,
           period.value       AS pv
    FROM public.student_attendance sa,
         jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date BETWEEN v_from AND v_to
  ),
  -- Normalize assigned_faculty (object OR array), keep only the caller's rows.
  fac_sess AS (
    SELECT s.ad, s.pid
    FROM sess s
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(s.pv -> 'assigned_faculty') = 'array'  THEN s.pv -> 'assigned_faculty'
        WHEN jsonb_typeof(s.pv -> 'assigned_faculty') = 'object' THEN jsonb_build_array(s.pv -> 'assigned_faculty')
        ELSE '[]'::jsonb
      END) AS af(el)
    WHERE lower(COALESCE(af.el ->> 'faculty_email', '')) = v_email
  ),
  -- Aggregates without GROUP BY: always exactly one row (zeros when no signal).
  marked AS (
    SELECT count(*)::int AS n_marked,
           count(*) FILTER (
             WHERE (SELECT count(*) FROM public.session_feedback f
                    WHERE f.attendance_date = fs.ad
                      AND f.period_id       = fs.pid
                      AND lower(f.faculty_email) = v_email) >= 3
           )::int        AS n_witnessed,
           max(fs.ad)    AS last_class
    FROM fac_sess fs
  )
  SELECT
    m.n_marked,
    m.n_witnessed,
    (SELECT count(*)::int FROM public.scf_live_pulse lp
      WHERE lower(lp.faculty_email) = v_email
        AND lp.attendance_date BETWEEN v_from AND v_to),
    (SELECT count(*)::int FROM public.class_session_lesson csl
      JOIN public.profiles lb ON lb.id = csl.linked_by
      WHERE lower(lb.email) = v_email
        AND csl.attendance_date BETWEEN v_from AND v_to),
    (SELECT count(*)::int FROM public.scf_ai_suggestions sg
      WHERE lower(sg.faculty_email) = v_email
        AND sg.domain = 'session_feedback'
        AND sg.generated_at::date BETWEEN v_from AND v_to),
    (SELECT count(*)::int FROM public.scf_ai_suggestions sg
      WHERE lower(sg.faculty_email) = v_email
        AND sg.domain = 'session_feedback'
        AND sg.human_verdict_at IS NOT NULL
        AND sg.human_verdict_at::date BETWEEN v_from AND v_to),
    -- Volume only, same rule as the leadership board: the split never leaves
    -- fn_scf_note_resolution_counts' k>=3 floor.
    (SELECT count(*)::int FROM public.scf_note_resolution_votes rv
      JOIN public.scf_ai_suggestions sg ON sg.id = rv.suggestion_id
      WHERE lower(sg.faculty_email) = v_email
        AND sg.domain = 'session_feedback'
        AND rv.created_at::date BETWEEN v_from AND v_to),
    GREATEST(
      m.last_class::timestamptz,
      (SELECT max(lp.issued_at) FROM public.scf_live_pulse lp
        WHERE lower(lp.faculty_email) = v_email),
      (SELECT max(sg.human_verdict_at) FROM public.scf_ai_suggestions sg
        WHERE lower(sg.faculty_email) = v_email)
    )
  FROM marked m;
END;
$$;

-- Lock from anon (Supabase default-privileges grant EXECUTE to anon otherwise).
REVOKE EXECUTE ON FUNCTION public.fn_scf_facilitator_pulse(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_facilitator_pulse(date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_scf_my_pulse() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_my_pulse() TO authenticated;
