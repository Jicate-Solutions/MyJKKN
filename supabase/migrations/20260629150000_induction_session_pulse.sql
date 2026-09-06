-- ============================================================================
-- Fresher Induction — live in-session pulse on event_sessions
-- File: 20260629150000_induction_session_pulse.sql | Date: 2026-06-29
-- Spec: B(b) of the session-effectiveness program (continuation 2026-06-29).
--
-- WHAT: an induction-native Live Pulse, mirroring scf_live_pulse but on
-- event_sessions instead of the timetable. A credited resource person (or
-- coordinator) opens a pulse for their session; enrolled freshers of that
-- session's batch get a prominent "rate now" prompt; the resource person sees
-- LIVE anonymized totals (k>=3 floor). Auto-closes after 240 min (lazy, no cron).
--
-- KEY DIFFERENCE from scf_live_pulse: the gate is the induction ENROLLED-IN-BATCH
-- model (induction_enrollment + event_sessions.batch_id), NOT student_attendance.
-- This exactly mirrors fn_induction_submit_feedback's own gate, so the pulse can
-- never surface to a fresher who couldn't submit feedback anyway.
--
-- NO NEW WRITE PATH: students answer through the EXISTING
-- fn_induction_submit_feedback (enrolled + batch gated, upsert, refreshes
-- value_score_avg). This table holds ONLY the live lifecycle (is_open +
-- auto_close_at) + the discovery/totals anchor — it never stores feedback content.
-- (Mirrors how scf_live_pulse reused fn_scf_submit_feedback.)
--
-- Security: writes/reads flow through the SECURITY DEFINER RPCs below; only
-- super_admin gets a direct table policy (support/debug). All new RPCs anon-locked.
-- ============================================================================

-- ── 1. The live lifecycle table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.induction_session_pulse (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.event_sessions(id) ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES public.events(id)         ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id)   ON DELETE CASCADE,
  is_open         boolean     NOT NULL DEFAULT true,
  issued_at       timestamptz NOT NULL DEFAULT now(),
  auto_close_at   timestamptz NOT NULL,                 -- issued_at + 240 min (#6)
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_isp_session ON public.induction_session_pulse(session_id);
CREATE INDEX IF NOT EXISTS idx_isp_open    ON public.induction_session_pulse(is_open, auto_close_at);

COMMENT ON TABLE public.induction_session_pulse IS
  'One row per live in-session pulse for an induction event_session. Holds ONLY the live lifecycle (is_open + auto_close_at) + context. Fresher answers live in event_session_feedback via fn_induction_submit_feedback — this table never stores feedback content. Mirrors scf_live_pulse, gated by induction enrolled-in-batch instead of student_attendance.';

DROP TRIGGER IF EXISTS trg_isp_touch_updated_at ON public.induction_session_pulse;
CREATE TRIGGER trg_isp_touch_updated_at BEFORE UPDATE ON public.induction_session_pulse
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();

ALTER TABLE public.induction_session_pulse ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS induction_session_pulse_super_admin ON public.induction_session_pulse;
CREATE POLICY induction_session_pulse_super_admin ON public.induction_session_pulse
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ── helper: may the caller manage a pulse for this session? ──────────────────
-- A credited resource person of the session, a coordinator (induction.manage +
-- institution access), or super/admin. Returned via the open/close/totals fns.
CREATE OR REPLACE FUNCTION public._fn_induction_can_manage_session_pulse(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid; v_is_speaker boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT ip.institution_id INTO v_inst
  FROM public.event_sessions es
  JOIN public.induction_programs ip ON ip.event_id = es.event_id
  WHERE es.id = p_session_id;
  IF v_inst IS NULL THEN RETURN false; END IF;  -- not an induction session

  SELECT EXISTS (
    SELECT 1 FROM public.event_session_speakers sp
    WHERE sp.session_id = p_session_id AND sp.profile_id = auth.uid()
  ) INTO v_is_speaker;

  RETURN v_is_speaker
      OR is_super_admin() OR is_admin()
      OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst));
END $$;
REVOKE EXECUTE ON FUNCTION public._fn_induction_can_manage_session_pulse(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_induction_can_manage_session_pulse(uuid) TO authenticated;

-- ── 2. open a pulse — speaker/coordinator/admin; advisory-locked + idempotent ─
CREATE OR REPLACE FUNCTION public.fn_induction_open_session_pulse(p_session_id uuid)
RETURNS public.induction_session_pulse
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event uuid; v_inst uuid; v_existing public.induction_session_pulse; v_row public.induction_session_pulse;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_open_session_pulse: not authenticated'; END IF;

  SELECT es.event_id, ip.institution_id INTO v_event, v_inst
  FROM public.event_sessions es
  JOIN public.induction_programs ip ON ip.event_id = es.event_id
  WHERE es.id = p_session_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_open_session_pulse: not an induction session'; END IF;

  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_open_session_pulse: only a credited resource person or a coordinator of this institution can open a pulse';
  END IF;

  -- serialise concurrent opens for the SAME session (txn-scoped lock)
  PERFORM pg_advisory_xact_lock(hashtext('induction_pulse|' || p_session_id::text));

  -- idempotent: reuse an already-open, non-expired pulse for this session
  SELECT * INTO v_existing
  FROM public.induction_session_pulse p
  WHERE p.session_id = p_session_id AND p.is_open = true AND p.auto_close_at > now()
  ORDER BY p.issued_at DESC LIMIT 1;
  IF v_existing.id IS NOT NULL THEN RETURN v_existing; END IF;

  INSERT INTO public.induction_session_pulse (session_id, event_id, institution_id, is_open, issued_at, auto_close_at, created_by)
  VALUES (p_session_id, v_event, v_inst, true, now(), now() + interval '240 minutes', auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_open_session_pulse(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_open_session_pulse(uuid) TO authenticated;

-- ── 3. close a pulse early — same authority as open ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_close_session_pulse(p_pulse_id uuid)
RETURNS public.induction_session_pulse
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_session uuid; v_row public.induction_session_pulse;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_close_session_pulse: not authenticated'; END IF;
  SELECT session_id INTO v_session FROM public.induction_session_pulse WHERE id = p_pulse_id;
  IF v_session IS NULL THEN RAISE EXCEPTION 'fn_induction_close_session_pulse: no such pulse'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(v_session) THEN
    RAISE EXCEPTION 'fn_induction_close_session_pulse: not authorized';
  END IF;
  UPDATE public.induction_session_pulse SET is_open = false, updated_at = now()
  WHERE id = p_pulse_id RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_close_session_pulse(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_close_session_pulse(uuid) TO authenticated;

-- ── 4. learner discovery — my open pulses (enrolled + my batch only) ────────
-- Mirrors fn_induction_submit_feedback's gate: I must be enrolled in the pulse's
-- event AND the session must apply to my batch (session.batch_id NULL or = mine).
CREATE OR REPLACE FUNCTION public.fn_induction_session_pulse_for_learner()
RETURNS TABLE (
  pulse_id         uuid,
  session_id       uuid,
  event_id         uuid,
  event_name       text,
  title            text,
  day_number       integer,
  auto_close_at    timestamptz,
  already_answered boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_pulse_for_learner: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;  -- not a learner → no pulses

  RETURN QUERY
  SELECT p.id, p.session_id, p.event_id, ev.name, es.title, es.day_number, p.auto_close_at,
         EXISTS (
           SELECT 1 FROM public.event_session_feedback f
           WHERE f.session_id = p.session_id AND f.learner_id = v_learner
         ) AS already_answered
  FROM public.induction_session_pulse p
  JOIN public.event_sessions es ON es.id = p.session_id
  JOIN public.events ev         ON ev.id = p.event_id
  JOIN public.induction_enrollment ie
    ON ie.event_id = p.event_id AND ie.learner_id = v_learner          -- I'm enrolled
  WHERE p.is_open = true
    AND p.auto_close_at > now()
    AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id)             -- session is for my batch
  ORDER BY p.issued_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_pulse_for_learner() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_pulse_for_learner() TO authenticated;

-- ── 5. resource-person LIVE totals — anonymized, k>=3 floor ──────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_session_pulse_totals(p_pulse_id uuid)
RETURNS TABLE (
  is_open         boolean,
  auto_close_at   timestamptz,
  enrolled_count  integer,    -- freshers of this session's batch (the denominator)
  response_count  integer,
  suppressed      boolean,    -- true when response_count < 3 (granular fields NULL)
  avg_rating      numeric,    -- NULL when suppressed
  dist            jsonb       -- {"1":n,...,"5":n} or NULL when suppressed
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p public.induction_session_pulse;
  v_batch uuid; v_enrolled int; v_responses int; v_suppress boolean;
  v_k constant int := 3;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_pulse_totals: not authenticated'; END IF;
  SELECT * INTO v_p FROM public.induction_session_pulse WHERE id = p_pulse_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'fn_induction_session_pulse_totals: no such pulse'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(v_p.session_id) THEN
    RAISE EXCEPTION 'fn_induction_session_pulse_totals: not authorized';
  END IF;

  SELECT es.batch_id INTO v_batch FROM public.event_sessions es WHERE es.id = v_p.session_id;

  -- enrolled freshers of this session's batch (NULL batch = whole cohort)
  SELECT count(*)::int INTO v_enrolled
  FROM public.induction_enrollment ie
  WHERE ie.event_id = v_p.event_id
    AND (v_batch IS NULL OR ie.batch_id = v_batch);

  SELECT count(*)::int INTO v_responses
  FROM public.event_session_feedback f WHERE f.session_id = v_p.session_id;

  v_suppress := (v_responses < v_k);

  RETURN QUERY
  WITH fb AS (
    SELECT f.rating FROM public.event_session_feedback f WHERE f.session_id = v_p.session_id
  ),
  d AS (
    SELECT jsonb_object_agg(g.lvl::text, g.cnt) AS dist_obj
    FROM (SELECT s.lvl, (SELECT count(*) FROM fb WHERE fb.rating = s.lvl)::int AS cnt
          FROM generate_series(1,5) AS s(lvl)) g
  )
  SELECT (v_p.is_open AND v_p.auto_close_at > now())::boolean,
         v_p.auto_close_at::timestamptz,
         v_enrolled::int,
         v_responses::int,
         v_suppress::boolean,
         CASE WHEN v_suppress THEN NULL ELSE (SELECT round(avg(rating)::numeric, 2) FROM fb) END::numeric,
         CASE WHEN v_suppress THEN NULL ELSE (SELECT dist_obj FROM d) END::jsonb;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_pulse_totals(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_pulse_totals(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
