-- =============================================================================
-- 20260630191000_scf_facilitator_strengths.sql
-- Post-Class Feedback (SCF) → LEARNING-FACILITATOR STRENGTHS board.
-- The POSITIVE mirror of fn_scf_facilitator_feedback_coverage
-- (20260630120000). Spec: SCF self-improving-loop / learn-from-positive
-- (memory: project_scf_self_improving_loop + scf_loop_learn_from_positive).
-- =============================================================================
-- PROBLEM the coverage view cannot answer:
--   The coverage card shows who is DRIVING the feedback loop vs not. It is blind
--   to WHAT WORKED. The learn-from-positive upgrade now writes scf_ai_suggestions
--   rows with kind='success' — standout-positive "here's what worked, replicate
--   it" patterns (generated when a window scored avg understanding >= 4.5 with at
--   least one written comment). Those patterns are useless if no one can SEE them.
--
-- WHAT THIS ADDS:
--   fn_scf_facilitator_strengths(p_from, p_to) — per learning facilitator
--   (keyed by faculty_email, the only facilitator key scf_ai_suggestions carries):
--     success_patterns        = count of kind='success' rows in the window.
--     courses / course_count  = the distinct courses those patterns came from.
--     avg_understood          = avg input_avg_understood across the success rows
--                               (how strongly the classes landed — always >= 4.5
--                               by the generator's gate, surfaced for ranking).
--     latest_what_worked      = the most-recent pattern's `whatWorked` highlight.
--     latest_share_with_peers = its `shareWithPeers` note (the board's purpose:
--                               replicate what works + share it with peers teaching
--                               the same course).
--     latest_course_code / latest_generated_at = context for that highlight.
--
-- SUCCESS-ROW SHAPE (scf_ai_suggestions.suggestion jsonb, kind='success'):
--   { whatWorked, whyItLanded[], replicateIn[{context,how}], shareWithPeers,
--     watchNext } — produced by app/api/cron/scf-generate-suggestions.
--
-- WINDOW SEMANTICS — the positive mirror of coverage:
--   coverage's denominator is "taught sessions whose attendance_date ∈ [from,to]".
--   A success row's window_from..window_to IS exactly that set of taught sessions,
--   so this RPC filters on WINDOW OVERLAP (window_from <= p_to AND window_to >=
--   p_from), not generated_at — both cards then describe the SAME teaching period.
--
-- HONEST EMPTY STATE: counts/highlights come from REAL kind='success' rows only.
--   As of 2026-06-30 the scf_ai_suggestions table is EMPTY (the success branch of
--   the generator cron only just started). This RPC therefore returns ZERO rows
--   today, and the card MUST render a clear "no standout patterns captured yet"
--   state rather than a fabricated one.
--
-- ANONYMITY INVARIANT (inherited from the SCF substrate): the success pattern is
--   an AGGREGATE artifact about a course-window (avg understanding + a generated
--   coaching note) — it carries NO per-student understood/checklist/free_text.
--   This board exposes only those aggregate patterns; no learner content leaks.
--
-- SCOPE GATE: mirrors fn_scf_facilitator_feedback_coverage EXACTLY (verified live
--   via pg_get_functiondef 2026-06-30) — inline profile check, super_admin sees
--   ALL institutions; institution leadership (administrator/institution_admin/
--   dean/hod/principal/coordinator) sees only their own institution_id; everyone
--   else is rejected. A scoped user's `s.institution_id = v_inst` is false for the
--   NULL-institution success rows, so those never leak to a single-college user —
--   only super_admin sees them. SECURITY DEFINER + STABLE, anon-locked.
--
-- ADDITIVE + SAFE: one new function. Touches no tables, no RLS, no existing RPC.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_facilitator_strengths(p_from date, p_to date)
RETURNS TABLE (
  institution_id          uuid,
  institution_name        text,
  faculty_email           text,
  facilitator_name        text,
  designation             text,
  department_name         text,
  success_patterns        bigint,
  courses                 text[],
  course_count            bigint,
  avg_understood          numeric,
  latest_course_code      text,
  latest_what_worked      text,
  latest_share_with_peers text,
  latest_generated_at     timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_facilitator_strengths: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_facilitator_strengths: not authorized';
  END IF;

  RETURN QUERY
  -- success_rows: every kind='success' pattern whose teaching window overlaps the
  -- selected period, scoped to what the caller may see (super = all incl. NULL inst).
  WITH success_rows AS (
    SELECT
      sg.institution_id AS inst_id,
      lower(sg.faculty_email) AS faculty_email,    -- normalise so the staff-name lookup matches
      sg.course_code,
      sg.input_avg_understood,
      sg.generated_at,
      sg.suggestion
    FROM public.scf_ai_suggestions sg
    WHERE sg.kind = 'success'
      AND sg.domain = 'session_feedback'           -- SCF success rows only, not other modules' rows
      AND sg.faculty_email IS NOT NULL             -- per-facilitator board needs a key
      AND sg.window_from <= p_to
      AND sg.window_to   >= p_from                 -- window overlaps [p_from, p_to]
      AND (v_super OR sg.institution_id = v_inst)
  ),
  per_fac AS (
    SELECT
      sr.inst_id,
      sr.faculty_email,
      count(*)::bigint                        AS success_patterns,
      array_agg(DISTINCT sr.course_code)      AS courses,
      count(DISTINCT sr.course_code)::bigint  AS course_count,
      round(avg(sr.input_avg_understood), 2)  AS avg_understood,
      max(sr.generated_at)                    AS latest_generated_at
    FROM success_rows sr
    GROUP BY sr.inst_id, sr.faculty_email
  ),
  -- latest: the single most-recent success pattern per (institution, facilitator),
  -- so the board can show one concrete "what worked / share with peers" highlight.
  latest AS (
    SELECT DISTINCT ON (sr.inst_id, sr.faculty_email)
      sr.inst_id,
      sr.faculty_email,
      sr.course_code                        AS latest_course_code,
      (sr.suggestion->>'whatWorked')        AS latest_what_worked,
      (sr.suggestion->>'shareWithPeers')    AS latest_share_with_peers
    FROM success_rows sr
    ORDER BY sr.inst_id, sr.faculty_email, sr.generated_at DESC
  )
  SELECT
    pf.inst_id                                AS institution_id,
    i.name::text                              AS institution_name,
    pf.faculty_email,
    st.facilitator_name,
    st.designation,
    st.department_name,
    pf.success_patterns,
    pf.courses,
    pf.course_count,
    pf.avg_understood,
    l.latest_course_code,
    l.latest_what_worked,
    l.latest_share_with_peers,
    pf.latest_generated_at
  FROM per_fac pf
  LEFT JOIN latest l
    ON l.inst_id IS NOT DISTINCT FROM pf.inst_id   -- NULL-safe (inst_id may be NULL)
   AND l.faculty_email = pf.faculty_email
  -- Resolve a friendly facilitator name/dept from staff by email. LATERAL + LIMIT 1
  -- guarantees at most one staff row, so the name lookup cannot inflate counts even
  -- if email and institution_email both match.
  LEFT JOIN LATERAL (
    SELECT
      NULLIF(trim(COALESCE(s.first_name,'')||' '||COALESCE(s.last_name,'')), '')::text AS facilitator_name,
      COALESCE(s.designation,'')::text          AS designation,
      COALESCE(d.department_name,'Unknown')::text AS department_name
    FROM public.staff s
    LEFT JOIN public.departments d ON d.id = s.department_id
    WHERE (lower(s.email) = pf.faculty_email
        OR lower(s.institution_email) = pf.faculty_email)
      -- Scope the name lookup to the row's institution so a same-email staff in
      -- another institution can't supply the wrong name (NULL-inst rows: best-effort).
      AND (pf.inst_id IS NULL OR s.institution_id = pf.inst_id)
    LIMIT 1
  ) st ON true
  LEFT JOIN public.institutions i ON i.id = pf.inst_id
  -- Strongest replicators first: most success patterns, then most recent.
  ORDER BY pf.success_patterns DESC, pf.latest_generated_at DESC;
END;
$$;

COMMENT ON FUNCTION public.fn_scf_facilitator_strengths(date,date) IS
  'SCF learning-facilitator strengths board: per facilitator (faculty_email), the '
  'kind=success "what worked, replicate it" patterns whose teaching window overlaps '
  '[p_from,p_to] — count, courses, avg understanding, and the most-recent whatWorked '
  '/ shareWithPeers highlight. Positive mirror of fn_scf_facilitator_feedback_coverage. '
  'Aggregates only (no per-student content). super_admin sees all institutions '
  '(incl. NULL-institution rows); institution leadership sees own institution. '
  'Returns ZERO rows when no success patterns exist (honest empty state). '
  'Read-only, STABLE, SECURITY DEFINER, anon-locked.';

-- MANDATORY anon lock (CLAUDE.md: Supabase grants anon EXECUTE on new functions by default).
REVOKE EXECUTE ON FUNCTION public.fn_scf_facilitator_strengths(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_facilitator_strengths(date,date) TO authenticated;

-- PostgREST must see the new function immediately.
NOTIFY pgrst, 'reload schema';
