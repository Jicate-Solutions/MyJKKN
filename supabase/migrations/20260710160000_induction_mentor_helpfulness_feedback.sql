-- ============================================================================
-- Fresher Induction — Senior Peer Mentor monthly HELPFULNESS rating (Director
-- decision, 2026-07-10). Measures whether the mentoring programme actually
-- helps first-years by asking the freshers themselves: a 1-5 "did your mentor
-- help you this month?" + optional comment, tied to each scheduled monthly
-- check-in (public.event_sessions.kind = 'mentor_checkin', added by
-- 20260710130000_induction_monthly_mentor_checkins.sql — first beat 15 Aug 2026).
--
-- Mirrors the day/program feedback pattern exactly (20260730110000_*):
--   table (admin-only RLS, real access via DEFINER RPCs) + submit/summary/mine
-- with one addition — a quiet HONESTY CROSS-CHECK RPC that compares each
-- mentor's average fresher rating for the month against whether that mentor
-- actually performed the check-in (marked attendance for their group on that
-- session, via fn_induction_volunteer_mark_attendance /
-- event_session_attendance.marked_by). A fresher politely rating an absent
-- mentor highly is flagged there, not trusted — this is the admin surface's
-- headline, not shown to the fresher (keeping the cross-check quiet/ungameable).
--
-- No new opt-in toggle column: the feature is naturally gated by the EXISTING
-- monthly-check-in cadence (a college must already run "Schedule monthly
-- check-ins") and by the fresher having a current mentor group assignment.
-- Empty until 15 Aug 2026 beats + freshers answer — that is correct, not a bug.
-- ============================================================================

-- ── 1. induction_mentor_month_feedback — one rating per fresher per check-in ─
CREATE TABLE IF NOT EXISTS public.induction_mentor_month_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES public.event_sessions(id) ON DELETE CASCADE,   -- the specific monthly check-in
  learner_id      UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE, -- the fresher rating
  volunteer_id    UUID NOT NULL REFERENCES public.induction_feedback_volunteers(id) ON DELETE CASCADE, -- their mentor AT TIME OF RATING (snapshot, survives reassignment)
  institution_id  UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT immf_session_learner_uniq UNIQUE (session_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_immf_event     ON public.induction_mentor_month_feedback(event_id);
CREATE INDEX IF NOT EXISTS idx_immf_session   ON public.induction_mentor_month_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_immf_learner   ON public.induction_mentor_month_feedback(learner_id);
CREATE INDEX IF NOT EXISTS idx_immf_volunteer ON public.induction_mentor_month_feedback(volunteer_id);

DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.induction_mentor_month_feedback;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.induction_mentor_month_feedback
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();

-- raw table locked; all real access via the gated DEFINER RPCs below, same
-- posture as event_day_feedback / event_program_feedback.
ALTER TABLE public.induction_mentor_month_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS induction_mentor_month_feedback_admin ON public.induction_mentor_month_feedback;
CREATE POLICY induction_mentor_month_feedback_admin ON public.induction_mentor_month_feedback FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 2. fresher: MY scheduled monthly check-ins that have come due, with my
--    current mentor's name and my existing rating (pre-fill). Self-scoping —
--    empty until I have a mentor group assignment AND at least one check-in's
--    start_at has passed. Mirrors fn_induction_my_day_feedback's shape.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_my_mentor_checkins(p_event_id UUID)
RETURNS TABLE (
  session_id  UUID,
  month_label TEXT,
  start_at    TIMESTAMPTZ,
  mentor_name TEXT,
  rating      INTEGER,
  comment     TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner UUID;
  v_vol_id  UUID;
  v_mentor_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_mentor_checkins: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;

  -- my CURRENT mentor group assignment for this event (no group yet -> nothing to rate)
  SELECT g.volunteer_id INTO v_vol_id
  FROM public.induction_feedback_volunteer_group g
  WHERE g.event_id = p_event_id AND g.learner_id = v_learner;
  IF v_vol_id IS NULL THEN RETURN; END IF;

  SELECT btrim(coalesce(mlp.first_name,'') || ' ' || coalesce(mlp.last_name,''))::text INTO v_mentor_name
  FROM public.induction_feedback_volunteers v
  JOIN public.learners_profiles mlp ON mlp.id = v.learner_id
  WHERE v.id = v_vol_id;

  RETURN QUERY
  SELECT s.id,
         to_char(s.start_at, 'FMMonth YYYY')::text,
         s.start_at,
         v_mentor_name,
         f.rating,
         f.comment
  FROM public.event_sessions s
  LEFT JOIN public.induction_mentor_month_feedback f
    ON f.session_id = s.id AND f.learner_id = v_learner
  WHERE s.event_id = p_event_id
    AND s.kind = 'mentor_checkin'
    AND s.start_at <= now()   -- only ask once the check-in has actually come due
  ORDER BY s.start_at;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_my_mentor_checkins(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_mentor_checkins(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. fresher: submit/update MY 1-5 "did your mentor help you this month?" +
--    optional comment for one scheduled check-in. Self, must be enrolled and
--    currently assigned to a mentor group; stamps the CURRENT volunteer_id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_submit_mentor_month_feedback(
  p_session_id UUID, p_rating INTEGER, p_comment TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner UUID; v_event UUID; v_inst UUID; v_vol_id UUID; v_start TIMESTAMPTZ; v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_mentor_month_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_mentor_month_feedback: not a learner'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'fn_induction_submit_mentor_month_feedback: rating must be 1-5';
  END IF;

  SELECT s.event_id, s.start_at INTO v_event, v_start
  FROM public.event_sessions s WHERE s.id = p_session_id AND s.kind = 'mentor_checkin';
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'fn_induction_submit_mentor_month_feedback: not a mentor check-in session';
  END IF;
  IF v_start > now() THEN
    RAISE EXCEPTION 'fn_induction_submit_mentor_month_feedback: this check-in hasn''t happened yet';
  END IF;

  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_mentor_month_feedback: not an induction event'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.induction_enrollment ie
    WHERE ie.event_id = v_event AND ie.learner_id = v_learner
  ) THEN
    RAISE EXCEPTION 'fn_induction_submit_mentor_month_feedback: not enrolled in this induction';
  END IF;

  SELECT g.volunteer_id INTO v_vol_id
  FROM public.induction_feedback_volunteer_group g
  WHERE g.event_id = v_event AND g.learner_id = v_learner;
  IF v_vol_id IS NULL THEN
    RAISE EXCEPTION 'fn_induction_submit_mentor_month_feedback: no mentor assigned yet';
  END IF;

  INSERT INTO public.induction_mentor_month_feedback
    (event_id, session_id, learner_id, volunteer_id, institution_id, rating, comment)
  VALUES (v_event, p_session_id, v_learner, v_vol_id, v_inst, p_rating, p_comment)
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment,
    volunteer_id = EXCLUDED.volunteer_id, updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_mentor_month_feedback(UUID, INTEGER, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_mentor_month_feedback(UUID, INTEGER, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. admin / coordinator: the HONESTY CROSS-CHECK — per mentor, per check-in
--    month, the average fresher rating alongside whether that mentor actually
--    performed the check-in (marked attendance for their group on that
--    session). flagged = a good average rating (>=4) with NO recorded
--    check-in activity from the mentor — the headline of the admin surface.
--    Same 3-way gate as the sibling coordinator-retrofit RPCs on this page
--    (fn_induction_list_feedback_volunteers, 20260730140000_*).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_mentor_helpfulness_crosscheck(p_event_id UUID)
RETURNS TABLE (
  volunteer_id      UUID,
  mentor_name       TEXT,
  session_id        UUID,
  month_label       TEXT,
  start_at          TIMESTAMPTZ,
  group_size        INTEGER,
  rating_count      INTEGER,
  avg_rating        NUMERIC,
  mentor_checked_in BOOLEAN,
  flagged           BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_mentor_helpfulness_crosscheck: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_mentor_helpfulness_crosscheck: not authorized';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      v.id AS volunteer_id,
      btrim(coalesce(mlp.first_name,'') || ' ' || coalesce(mlp.last_name,''))::text AS mentor_name,
      s.id AS session_id,
      to_char(s.start_at, 'FMMonth YYYY')::text AS month_label,
      s.start_at,
      (SELECT count(*)::int FROM public.induction_feedback_volunteer_group g
         WHERE g.volunteer_id = v.id) AS group_size,
      count(f.id)::int AS rating_count,
      round(avg(f.rating), 2) AS avg_rating,
      EXISTS (
        SELECT 1 FROM public.event_session_attendance esa
        JOIN public.profiles mp ON mp.id = esa.marked_by
        WHERE esa.session_id = s.id AND mp.learner_id = v.learner_id
      ) AS mentor_checked_in
    FROM public.event_sessions s
    CROSS JOIN public.induction_feedback_volunteers v
    LEFT JOIN public.learners_profiles mlp ON mlp.id = v.learner_id
    LEFT JOIN public.induction_mentor_month_feedback f
      ON f.session_id = s.id AND f.volunteer_id = v.id
    WHERE s.event_id = p_event_id
      AND s.kind = 'mentor_checkin'
      AND v.event_id = p_event_id
    GROUP BY v.id, v.learner_id, mlp.first_name, mlp.last_name, s.id, s.start_at
    HAVING count(f.id) > 0   -- only surface months that actually have a fresher rating — no noise before beats land
  )
  SELECT
    base.volunteer_id, base.mentor_name, base.session_id, base.month_label, base.start_at,
    base.group_size, base.rating_count, base.avg_rating, base.mentor_checked_in,
    (base.avg_rating >= 4 AND NOT base.mentor_checked_in) AS flagged
  FROM base
  ORDER BY flagged DESC, base.start_at, base.mentor_name;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_mentor_helpfulness_crosscheck(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_mentor_helpfulness_crosscheck(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
