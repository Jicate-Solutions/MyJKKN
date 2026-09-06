-- 2026-07-10 · SCF dashboard filter gaps + Facilitator Pulse timeout fix
--
-- 1) fn_scf_struggling_notes_sent(date,date,uuid) — NEW 3-arg overload beside
--    the 2-arg. The "Support Notes Sent" card returns no institution column,
--    so the college filter must happen server-side (same pattern as the
--    fn_scf_admin_trend / fn_scf_loop_activity 3-arg overloads: NO default on
--    the 3rd arg — a default would make 2-arg calls ambiguous).
--
-- 2) fn_scf_facilitator_pulse(date,date) — PERF REWRITE. The previous body
--    called role_has_institution_access(s.inst) PER ROW inside the fac_sess
--    CTE (once per attendance-row × period over the window) and ran a
--    correlated count(*) on session_feedback per (session, faculty) row. Under
--    a real authenticated session it exceeded its own 20s statement_timeout —
--    the admin page's Pulse card showed "canceling statement due to statement
--    timeout" and /api/academic/session-feedback/marks-coverage 500'd (it
--    calls this fn). Fix = the proven #1935 recipe: hoist the tenant scope
--    into v_insts uuid[] ONCE (filtering student_attendance BEFORE the jsonb
--    explosion), and pre-aggregate the witnessed/per-facilitator signals into
--    grouped CTEs that hash-join instead of correlated subqueries.
--    Output contract unchanged (same columns, same ORDER BY name).
--    NOTE (intended tightening): attendance rows with institution_id IS NULL
--    were previously visible to every leadership caller via the
--    role_has_institution_access(NULL)=TRUE quirk; they are now super-only —
--    consistent with the 13 fns re-gated in 20260731110000.

-- ── 1) Support-notes 3-arg overload ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_scf_struggling_notes_sent(p_from date, p_to date, p_institution_id uuid)
 RETURNS TABLE(student_id uuid, learner_name text, register_number text, department_name text, course_code text, notes_count bigint, last_note_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_struggling_notes_sent: not authenticated';
  END IF;
  -- AUDIENCE: identical gate to the 2-arg form (narrowest leadership; the
  -- note-sent roster is a subset of the trajectory roster this audience sees).
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.learner_detail.view'))
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_struggling_notes_sent: not authorized';
  END IF;
  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  SELECT
    n.learner_id AS student_id,
    NULLIF(trim(COALESCE(lp.first_name,'') || ' ' || COALESCE(lp.last_name,'')), '')::text AS learner_name,
    lp.register_number::text                                                               AS register_number,
    COALESCE(d.department_name,'Unknown')::text                                            AS department_name,
    n.course_code,
    count(*)::bigint                                                                       AS notes_count,
    max(n.generated_at)                                                                    AS last_note_at
  FROM public.scf_learner_notes n
  LEFT JOIN public.learners_profiles lp ON lp.id = n.learner_id
  LEFT JOIN public.departments d        ON d.id = lp.department_id
  WHERE (v_super OR n.institution_id = ANY(v_insts))        -- institution-scoped (super sees all)
    AND (p_institution_id IS NULL OR n.institution_id = p_institution_id)  -- college filter (never widens)
    AND n.status = 'approved'                         -- "sent" = learner-visible
    AND n.generated_at::date BETWEEN p_from AND p_to
  GROUP BY n.learner_id, lp.first_name, lp.last_name, lp.register_number, d.department_name, n.course_code
  ORDER BY max(n.generated_at) DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_struggling_notes_sent(date, date, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_struggling_notes_sent(date, date, uuid) TO authenticated;

-- ── 2) Facilitator Pulse perf rewrite ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_scf_facilitator_pulse(p_from date, p_to date)
 RETURNS TABLE(faculty_email text, faculty_name text, institution_id uuid, sessions_marked integer, sessions_witnessed integer, pulses_run integer, lessons_linked integer, notes_received integer, verdicts_given integer, votes_received integer, last_signal_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_role     text;
  v_is_super boolean;
  v_insts    uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_facilitator_pulse: not authenticated';
  END IF;

  SELECT p.role, (p.role = 'super_admin' OR p.is_super_admin = true)
    INTO v_role, v_is_super
  FROM public.profiles p WHERE p.id = auth.uid();

  -- Staff-management view: leadership/admin only. Faculty/students are
  -- rejected — a facilitator sees their own signals on their own pages.
  IF NOT (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.leadership.view')) THEN
    RAISE EXCEPTION 'fn_scf_facilitator_pulse: not authorized';
  END IF;

  -- Tenant scope HOISTED: one pass over the institutions table, not one
  -- SECURITY DEFINER call per attendance row (the per-row form is what pushed
  -- this fn past its 20s timeout — same disease as the 10.5s escalation panel).
  SELECT array_agg(i.id) INTO v_insts
  FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  WITH sess AS MATERIALIZED (
    SELECT sa.institution_id AS inst,
           sa.attendance_date AS ad,
           period.key         AS pid,
           period.value       AS pv
    FROM public.student_attendance sa,
         jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date BETWEEN p_from AND p_to
      -- Filter BEFORE the jsonb explosion: cheap array test, no per-row SECDEF.
      AND (v_is_super OR sa.institution_id = ANY(v_insts))
  ),
  -- Normalize assigned_faculty (object OR array) -> one row per (session, faculty)
  fac_sess AS MATERIALIZED (
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
  ),
  -- Witnessed = >=3 feedback rows for the same (date, period, faculty).
  -- Pre-aggregated ONCE and joined — replaces the correlated per-row count.
  fb AS MATERIALIZED (
    SELECT f.attendance_date AS ad, f.period_id AS pid, lower(f.faculty_email) AS femail
    FROM public.session_feedback f
    WHERE f.attendance_date BETWEEN p_from AND p_to
    GROUP BY 1, 2, 3
    HAVING count(*) >= 3
  ),
  marked AS (
    SELECT fs.femail,
           max(fs.inst::text)::uuid AS inst,          -- representative (display)
           count(*)::int            AS n_marked,
           count(*) FILTER (WHERE fb.femail IS NOT NULL)::int AS n_witnessed,
           max(fs.ad)               AS last_class
    FROM fac_sess fs
    LEFT JOIN fb ON fb.ad = fs.ad AND fb.pid = fs.pid AND fb.femail = fs.femail
    GROUP BY fs.femail
  ),
  -- Per-facilitator signal counts, each aggregated once (window-scoped, as before).
  pulses_n AS (
    SELECT lower(lp.faculty_email) AS femail, count(*)::int AS n
    FROM public.scf_live_pulse lp
    WHERE lp.attendance_date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  lessons_n AS (
    SELECT lower(lb.email) AS femail, count(*)::int AS n
    FROM public.class_session_lesson csl
    JOIN public.profiles lb ON lb.id = csl.linked_by
    WHERE csl.attendance_date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  notes_n AS (
    SELECT lower(sg.faculty_email) AS femail, count(*)::int AS n
    FROM public.scf_ai_suggestions sg
    WHERE sg.domain = 'session_feedback'
      AND sg.generated_at::date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  verdicts_n AS (
    SELECT lower(sg.faculty_email) AS femail, count(*)::int AS n
    FROM public.scf_ai_suggestions sg
    WHERE sg.domain = 'session_feedback'
      AND sg.human_verdict_at IS NOT NULL
      AND sg.human_verdict_at::date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  -- Student resolution votes received on this facilitator's notes.
  -- VOLUME ONLY — the Better/Same/Worse split stays behind the k>=3 floor.
  votes_n AS (
    SELECT lower(sg.faculty_email) AS femail, count(*)::int AS n
    FROM public.scf_note_resolution_votes rv
    JOIN public.scf_ai_suggestions sg ON sg.id = rv.suggestion_id
    WHERE sg.domain = 'session_feedback'
      AND rv.created_at::date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  -- last_signal_at inputs: UNWINDOWED maxes, exactly as before (the previous
  -- body's GREATEST subqueries had no date filter and, for verdicts, no domain
  -- filter — preserved verbatim so the output is row-identical).
  pulse_last AS (
    SELECT lower(lp.faculty_email) AS femail, max(lp.issued_at) AS last_at
    FROM public.scf_live_pulse lp
    GROUP BY 1
  ),
  verdict_last AS (
    SELECT lower(sg.faculty_email) AS femail, max(sg.human_verdict_at) AS last_at
    FROM public.scf_ai_suggestions sg
    GROUP BY 1
  )
  SELECT
    m.femail,
    COALESCE(pe.full_name, m.femail),
    m.inst,
    m.n_marked,
    m.n_witnessed,
    COALESCE(pn.n, 0),
    COALESCE(ln.n, 0),
    COALESCE(nn.n, 0),
    COALESCE(vn.n, 0),
    COALESCE(vt.n, 0),
    GREATEST(m.last_class::timestamptz, pl.last_at, vl.last_at)
  FROM marked m
  LEFT JOIN public.profiles pe ON lower(pe.email) = m.femail
  LEFT JOIN pulses_n     pn ON pn.femail = m.femail
  LEFT JOIN lessons_n    ln ON ln.femail = m.femail
  LEFT JOIN notes_n      nn ON nn.femail = m.femail
  LEFT JOIN verdicts_n   vn ON vn.femail = m.femail
  LEFT JOIN votes_n      vt ON vt.femail = m.femail
  LEFT JOIN pulse_last   pl ON pl.femail = m.femail
  LEFT JOIN verdict_last vl ON vl.femail = m.femail
  ORDER BY 2;  -- neutral name order — a presence board, never a leaderboard
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_facilitator_pulse(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_facilitator_pulse(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
