-- =====================================================================
-- SCF self-improving loop · AI-written support note for struggling learners
-- Migration: 2026-06-30 — scf_learner_notes table + 3 RPCs
-- =====================================================================
-- Closes the LAST unbuilt piece of the loop. When a learner has rated a course
-- harder across 3 classes in a row (the SAME downward-trend definition as
-- fn_scf_downward_trend_for_learner — non-increasing, net drop, most-recent <= 3),
-- a daily cron asks Claude to draft a SHORT, warm, private support note and
-- persists it here. Decisions (Director, 2026-06-30 via AskUserQuestion):
--   * FREQUENCY: a fresh note every week the learner is still sliding (the cron
--     regenerates if the latest note for that learner+course is >= ~7 days old).
--   * FALLBACK: the learner sees the AI note ONLY when one exists — never a
--     template line. (The old downward-trend template in feedback-dialog.tsx is
--     removed in the same change.)
--   * VISIBILITY: leadership (narrowest — principal/dean/institution-admin/super)
--     can see THAT a note was sent to a named student and WHEN; never the wording.
--
-- Privacy model (the note TEXT is load-bearing-private):
--   * scf_learner_notes has RLS ENABLED with NO policies -> anon & authenticated
--     get deny-all on DIRECT table access. The cron writes via the service-role
--     client (RLS-bypassing). ALL reads go through the two SECURITY DEFINER RPCs
--     below, which scope by identity (learner self) or role (leadership).
--   * fn_scf_my_struggling_note() returns the note TEXT ONLY to the learner who
--     owns it. fn_scf_struggling_notes_sent() returns existence + timing to
--     leadership and NEVER the text. The note-sent roster is a SUBSET of the named
--     trajectory roster (same audience already sees it) -> no new exposure.
-- =====================================================================

-- ── TABLE ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scf_learner_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id     uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id uuid,                  -- institution of the struggling course (leadership scoping)
  course_code    text NOT NULL,
  course_name    text,
  note           text NOT NULL,         -- the AI-written note (PRIVATE to the learner)
  model          text,                  -- model id that generated it
  net_decline    smallint,              -- ratings[1]-ratings[3] at generation (context; never shown)
  week_of        date NOT NULL,         -- Monday of the week this note covers (weekly-regen bucket)
  generated_at   timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- One note per learner+course+week (weekly regen while still struggling).
CREATE UNIQUE INDEX IF NOT EXISTS uq_scf_learner_notes_learner_course_week
  ON public.scf_learner_notes (learner_id, course_code, week_of);
-- Learner's latest-note read.
CREATE INDEX IF NOT EXISTS ix_scf_learner_notes_learner_generated
  ON public.scf_learner_notes (learner_id, generated_at DESC);
-- Leadership note-sent signal (institution-scoped, time-windowed).
CREATE INDEX IF NOT EXISTS ix_scf_learner_notes_inst_generated
  ON public.scf_learner_notes (institution_id, generated_at DESC);

ALTER TABLE public.scf_learner_notes ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: anon & authenticated get deny-all on direct access.
-- Writes = service-role cron (bypasses RLS). Reads = the SECURITY DEFINER RPCs below.
REVOKE ALL ON public.scf_learner_notes FROM anon, authenticated;

COMMENT ON TABLE public.scf_learner_notes IS
  'AI-written private support notes for learners on a downward understanding trend. '
  'Text is private to the learner (fn_scf_my_struggling_note); leadership sees only '
  'note-sent existence/timing (fn_scf_struggling_notes_sent). Written by the '
  'scf-learner-notes cron via service role; RLS-enabled with no policies.';

-- ── RPC 1: learner self-read (returns the note TEXT, to its owner only) ─────────
CREATE OR REPLACE FUNCTION public.fn_scf_my_struggling_note()
RETURNS TABLE(course_code text, course_name text, note text, generated_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_my_struggling_note: not authenticated';
  END IF;
  -- Identity chain: auth.uid() -> learners_profiles.profile_id -> lp.id
  -- (mirrors fn_scf_downward_trend_for_learner). The note.learner_id == lp.id.
  SELECT lp.id INTO v_lp
  FROM public.learners_profiles lp
  WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT n.course_code, n.course_name, n.note, n.generated_at
  FROM public.scf_learner_notes n
  WHERE n.learner_id = v_lp
  ORDER BY n.generated_at DESC
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_my_struggling_note() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_my_struggling_note() TO authenticated;

-- ── RPC 2: leadership note-sent signal (existence + timing; NEVER the text) ─────
CREATE OR REPLACE FUNCTION public.fn_scf_struggling_notes_sent(p_from date, p_to date)
RETURNS TABLE(
  student_id      uuid,
  learner_name    text,
  register_number text,
  department_name text,
  course_code     text,
  notes_count     bigint,
  last_note_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_struggling_notes_sent: not authenticated';
  END IF;
  -- AUDIENCE: narrowest leadership — principal/dean/institution-admin/super only.
  -- IDENTICAL gate to fn_scf_learner_trajectory. HOD/coordinator are intentionally
  -- EXCLUDED. The note-sent roster is a SUBSET of the named trajectory roster this
  -- same audience already sees, so it adds no new per-learner exposure — and the
  -- note's WORDING is never returned here.
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','principal']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_struggling_notes_sent: not authorized';
  END IF;

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
  WHERE (v_super OR n.institution_id = v_inst)        -- institution-scoped (super sees all)
    AND n.generated_at::date BETWEEN p_from AND p_to
  GROUP BY n.learner_id, lp.first_name, lp.last_name, lp.register_number, d.department_name, n.course_code
  ORDER BY max(n.generated_at) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_struggling_notes_sent(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_struggling_notes_sent(date, date) TO authenticated;

-- ── RPC 3: service-role candidate listing for the cron ──────────────────────────
-- Lists EVERY learner currently on a downward trend for a course, across all
-- institutions. Mirrors fn_scf_downward_trend_for_learner's definition exactly
-- (DISTINCT ON same-day dedup; latest 3 rated class-dates; non-increasing; net
-- drop; most-recent <= 3) but learner-agnostic + a recency floor so the cron only
-- notes learners CURRENTLY sliding. service_role-only (the cron's identity); never
-- callable by anon/authenticated.
CREATE OR REPLACE FUNCTION public.fn_scf_downward_trend_all(p_recent_within_days integer DEFAULT 30)
RETURNS TABLE(
  learner_id     uuid,
  institution_id uuid,
  course_code    text,
  course_name    text,
  ratings        smallint[],
  rated_on       date[],
  net_decline    smallint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH per_date AS (
    -- One understood value per (learner, course, class-date): same-day async+live_poll
    -- rows must not supply 2 of the "3 in a row". Keep the lowest (most-flagged), earliest.
    SELECT DISTINCT ON (f.student_id, f.course_code, f.attendance_date)
           f.student_id, f.course_code, f.course_name, f.institution_id,
           f.understood, f.attendance_date, f.created_at
    FROM public.session_feedback f
    WHERE f.course_code IS NOT NULL
      AND f.understood IS NOT NULL
    ORDER BY f.student_id, f.course_code, f.attendance_date, f.understood ASC, f.created_at ASC
  ),
  ranked AS (
    SELECT pd.student_id, pd.course_code, pd.course_name, pd.institution_id,
           pd.understood, pd.attendance_date,
           ROW_NUMBER() OVER (PARTITION BY pd.student_id, pd.course_code
                              ORDER BY pd.attendance_date DESC, pd.created_at DESC) AS rn
    FROM per_date pd
  ),
  last3 AS (
    -- latest 3 rated class-dates per (learner, course); arrays oldest->newest.
    -- Qualify every column with `r` — unqualified course_code/course_name would
    -- collide with this fn's RETURNS TABLE output columns (a plpgsql ambiguity that
    -- only surfaces at execution). institution_id = the institution of the MOST
    -- RECENT rated session (rn=1) for that course.
    SELECT r.student_id,
           r.course_code,
           max(r.course_name)                                  AS course_name,
           (array_agg(r.institution_id ORDER BY r.rn ASC))[1]  AS institution_id,
           array_agg(r.understood      ORDER BY r.attendance_date ASC, r.rn DESC) AS ratings,
           array_agg(r.attendance_date ORDER BY r.attendance_date ASC, r.rn DESC) AS rated_on
    FROM ranked r
    WHERE r.rn <= 3
    GROUP BY r.student_id, r.course_code
    HAVING count(*) = 3
  )
  SELECT l.student_id AS learner_id,
         l.institution_id,
         l.course_code,
         l.course_name,
         l.ratings::smallint[],
         l.rated_on::date[],
         (l.ratings[1] - l.ratings[3])::smallint AS net_decline
  FROM last3 l
  WHERE l.ratings[1] >= l.ratings[2]       -- non-increasing across the 3
    AND l.ratings[2] >= l.ratings[3]
    AND l.ratings[1] >  l.ratings[3]       -- a genuine net drop
    AND l.ratings[3] <= 3                  -- most-recent was OK-or-worse (honesty floor)
    AND l.rated_on[3] >= (CURRENT_DATE - p_recent_within_days)  -- currently sliding
  ORDER BY (l.ratings[1] - l.ratings[3]) DESC, l.student_id, l.course_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_downward_trend_all(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_downward_trend_all(integer) TO service_role;

-- Reload PostgREST schema cache so the new RPCs are callable immediately.
NOTIFY pgrst, 'reload schema';
