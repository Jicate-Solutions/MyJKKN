-- ============================================================================
-- Fresher Induction — session-effectiveness self-improving loop (#1)
-- File: 20260629160000_induction_session_effectiveness_loop.sql | Date: 2026-06-29
-- Spec: Goal #1 of the session-effectiveness program (continuation 2026-06-29).
--
-- WHAT: re-points the PROVEN academic SCF verifier pattern (next-session lift)
-- onto induction event_sessions, at a per-TOPIC grain on the batch-rotation fast
-- path: most induction topics run Batch A then Batch B (same title, later
-- start_at), so a weak topic can be measured -> tipped -> re-measured in HOURS
-- (vs the annual cohort loop in 20260628130000).
--
-- HONEST MEASUREMENT (user decision 2026-06-29 — "never withhold help; correct for
-- luck statistically"): a session that scored low once tends to score higher on
-- re-run by REGRESSION TO THE MEAN, with no intervention. So a raw re-run lift
-- proves nothing. The loop estimates the no-treatment expected re-run score from
-- topics that re-ran WITHOUT a tip (the naturally-occurring control — no help is
-- ever withheld) and credits the tip only with the lift ABOVE that:
--     rtm_expected = mu + rho*(input_avg - mu)            -- shrinkage to the mean
--     net_effect   = rerun_avg - rtm_expected
--   where mu = mean topic rating, rho = corr(run1_avg, run2_avg) over UNTREATED
--   pairs. With < p_min_pairs untreated pairs, rho is unstable -> the loop reports
--   measure_status='insufficient_rtm_data' and net_effect NULL (never a fabricated
--   number). "100% effective" is asymptotic, never claimed literally.
--
-- TOPIC IDENTITY: event_sessions has no topic_key, so a topic = (event_id,
-- normalized title). The batch re-run is the next session of that topic by
-- start_at. Coordinators must title a topic's batch runs identically (documented).
--
-- WHY A DEDICATED TABLE (not scf_ai_suggestions): the cohort loop's "one memory"
-- directive was about not forking the cohort VERIFIER. This is a different loop —
-- per-session grain + RTM-control columns (rerun linkage, rtm_expected, net_effect)
-- that the shared table has no place for. It reuses the SCF DISCIPLINE
-- (detect -> suggest -> measure-vs-baseline -> feed forward), not its storage.
--
-- Security: the generator/verifier fns are service_role only (cron + AI route);
-- the resource-person/coordinator summary reader is authenticated + gated. All
-- new RPCs anon-locked.
-- ============================================================================

-- ── normalize a session title into a topic key (whitespace-collapsed, lowered) ─
CREATE OR REPLACE FUNCTION public.fn_induction_norm_topic(p_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(regexp_replace(COALESCE(p_title, ''), '\s+', ' ', 'g')));
$$;
-- pure helper (no data access); the DEFINER fns call it internally as owner, so
-- locking anon/PUBLIC is safe and keeps the anon-exposure audit clean.
REVOKE EXECUTE ON FUNCTION public.fn_induction_norm_topic(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_norm_topic(text) TO authenticated, service_role;

-- ── the per-topic loop memory (one row per treated topic per event) ──────────
CREATE TABLE IF NOT EXISTS public.induction_session_effectiveness (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  event_id           uuid NOT NULL REFERENCES public.events(id)       ON DELETE CASCADE,
  topic_key          text NOT NULL,
  -- run 1 (the weak first delivery that earned a tip)
  first_session_id   uuid REFERENCES public.event_sessions(id) ON DELETE SET NULL,
  window_start       timestamptz,
  input_avg          numeric,
  input_responses    integer,
  -- the AI improvement tip
  suggestion         jsonb,
  model              text,
  generated_at       timestamptz NOT NULL DEFAULT now(),
  -- run 2 (the next-batch re-run) + the honest outcome
  rerun_session_id   uuid REFERENCES public.event_sessions(id) ON DELETE SET NULL,
  rerun_avg          numeric,
  rerun_responses    integer,
  raw_lift           numeric,    -- rerun_avg - input_avg (confounded by RTM)
  rtm_expected_avg   numeric,    -- mu + rho*(input_avg - mu)
  net_effect         numeric,    -- rerun_avg - rtm_expected_avg (the honest effect)
  measure_status     text NOT NULL DEFAULT 'pending'
                       CHECK (measure_status IN ('pending','measured','insufficient_rtm_data')),
  outcome_measured_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_induction_session_effectiveness UNIQUE (event_id, topic_key)
);
CREATE INDEX IF NOT EXISTS idx_ise_event   ON public.induction_session_effectiveness(event_id);
CREATE INDEX IF NOT EXISTS idx_ise_pending ON public.induction_session_effectiveness(measure_status);

COMMENT ON TABLE public.induction_session_effectiveness IS
  'Per-topic session-effectiveness loop memory (induction). One row per weak topic that earned an AI improvement tip; the verifier fills the next-batch re-run outcome with an RTM-corrected net_effect. Sibling of the cohort loop (scf_ai_suggestions domain=induction) — same SCF discipline, per-session grain, own RTM control.';

DROP TRIGGER IF EXISTS trg_ise_touch_updated_at ON public.induction_session_effectiveness;
CREATE TRIGGER trg_ise_touch_updated_at BEFORE UPDATE ON public.induction_session_effectiveness
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();

ALTER TABLE public.induction_session_effectiveness ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ise_super_admin ON public.induction_session_effectiveness;
CREATE POLICY ise_super_admin ON public.induction_session_effectiveness
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ── 1. candidate detection — weak first-run topics that have NO tip yet ──────
-- A "topic" is (event_id, normalized title). run1 = the earliest session of the
-- topic with >= p_min_responses feedback. A candidate is a topic whose run1_avg
-- is below p_threshold and that has no loop row yet (so the cron tips it once).
-- The re-run need NOT exist yet — the whole point is to tip BEFORE Batch B.
CREATE OR REPLACE FUNCTION public.fn_induction_session_loop_candidates(
  p_event_id      uuid,
  p_threshold     numeric DEFAULT 3.5,
  p_min_responses int     DEFAULT 3
)
RETURNS TABLE (
  event_id          uuid,
  institution_id    uuid,
  topic_key         text,
  first_session_id  uuid,
  title             text,
  window_start      timestamptz,
  input_avg         numeric,
  input_responses   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH inst AS (
    SELECT ip.institution_id FROM public.induction_programs ip WHERE ip.event_id = p_event_id
  ),
  per_session AS (
    SELECT s.id AS session_id, s.event_id, public.fn_induction_norm_topic(s.title) AS topic_key,
           s.title, s.start_at,
           count(f.*)::int AS n, round(avg(f.rating), 2) AS avg_r
    FROM public.event_sessions s
    JOIN public.event_session_feedback f ON f.session_id = s.id
    WHERE s.event_id = p_event_id
    GROUP BY s.id, s.event_id, public.fn_induction_norm_topic(s.title), s.title, s.start_at
    HAVING count(f.*) >= p_min_responses
  ),
  ranked AS (
    SELECT ps.*, row_number() OVER (PARTITION BY ps.topic_key ORDER BY ps.start_at ASC) AS rn
    FROM per_session ps
  ),
  run1 AS ( SELECT * FROM ranked WHERE rn = 1 )
  SELECT r.event_id, (SELECT institution_id FROM inst), r.topic_key, r.session_id, r.title,
         r.start_at, r.avg_r, r.n
  FROM run1 r
  WHERE r.avg_r < p_threshold
    AND NOT EXISTS (
      SELECT 1 FROM public.induction_session_effectiveness e
      WHERE e.event_id = r.event_id AND e.topic_key = r.topic_key
    );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_loop_candidates(uuid,numeric,int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_loop_candidates(uuid,numeric,int) TO service_role;

-- ── 2. record an AI tip for a weak topic (idempotent per event+topic) ────────
CREATE OR REPLACE FUNCTION public.fn_induction_record_session_tip(
  p_event_id         uuid,
  p_institution_id   uuid,
  p_topic_key        text,
  p_first_session_id uuid,
  p_window_start     timestamptz,
  p_input_avg        numeric,
  p_input_responses  int,
  p_suggestion       jsonb,
  p_model            text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_event_id IS NULL OR p_topic_key IS NULL OR p_institution_id IS NULL THEN
    RAISE EXCEPTION 'fn_induction_record_session_tip: event_id, institution_id, topic_key required';
  END IF;
  INSERT INTO public.induction_session_effectiveness (
    institution_id, event_id, topic_key, first_session_id, window_start,
    input_avg, input_responses, suggestion, model
  ) VALUES (
    p_institution_id, p_event_id, p_topic_key, p_first_session_id, p_window_start,
    p_input_avg, p_input_responses, p_suggestion, p_model
  )
  ON CONFLICT (event_id, topic_key) DO UPDATE SET
    suggestion = EXCLUDED.suggestion, model = EXCLUDED.model,
    input_avg = EXCLUDED.input_avg, input_responses = EXCLUDED.input_responses,
    generated_at = now(), updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_record_session_tip(uuid,uuid,text,uuid,timestamptz,numeric,int,jsonb,text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_induction_record_session_tip(uuid,uuid,text,uuid,timestamptz,numeric,int,jsonb,text) TO service_role;

-- ── 3. the RTM-corrected verifier — close the loop honestly ──────────────────
-- For each event with pending/unmeasured treated topics, find each topic's run2
-- (next session of the topic by start_at with >= p_min_responses), estimate the
-- RTM curve (mu, rho) from UNTREATED re-run pairs in that event, and write the
-- honest net_effect. Never withholds help; the "control" is the untreated pairs.
CREATE OR REPLACE FUNCTION public.fn_induction_measure_session_effectiveness(
  p_event_id      uuid    DEFAULT NULL,   -- NULL = all events with pending rows
  p_threshold     numeric DEFAULT 3.5,
  p_min_responses int     DEFAULT 3,
  p_min_pairs     int     DEFAULT 5       -- min untreated pairs to trust rho
)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event uuid;
  -- RTM baseline = linear regression of run2 on run1 over UNTREATED pairs:
  --   E[run2|run1] = v_intercept + v_slope*run1   (regr_*, the correct estimator;
  --   corr() would be wrong when run1/run2 spreads differ).
  v_intercept numeric; v_slope numeric; v_pairs int;
  v_updated int := 0; v_n int;
BEGIN
  FOR v_event IN
    SELECT DISTINCT e.event_id FROM public.induction_session_effectiveness e
    WHERE (p_event_id IS NULL OR e.event_id = p_event_id)
      AND e.measure_status <> 'measured'
  LOOP
    -- build per-topic run1/run2 averages for this event
    CREATE TEMP TABLE _ise_runs ON COMMIT DROP AS
    WITH per_session AS (
      SELECT public.fn_induction_norm_topic(s.title) AS topic_key, s.id AS session_id, s.start_at,
             count(f.*)::int AS n, avg(f.rating)::numeric AS avg_r
      FROM public.event_sessions s
      JOIN public.event_session_feedback f ON f.session_id = s.id
      WHERE s.event_id = v_event
      GROUP BY public.fn_induction_norm_topic(s.title), s.id, s.start_at
      HAVING count(f.*) >= p_min_responses
    ),
    ranked AS (
      SELECT ps.*, row_number() OVER (PARTITION BY ps.topic_key ORDER BY ps.start_at ASC) AS rn
      FROM per_session ps
    )
    SELECT r1.topic_key,
           r1.avg_r AS run1_avg, r1.session_id AS run1_session,
           r2.avg_r AS run2_avg, r2.session_id AS run2_session, r2.n AS run2_n
    FROM (SELECT * FROM ranked WHERE rn = 1) r1
    LEFT JOIN (SELECT * FROM ranked WHERE rn = 2) r2 USING (topic_key);

    -- RTM baseline from UNTREATED pairs (run1 NOT weak, run2 exists): regress
    -- run2 on run1. regr_slope/intercept are NULL with <2 points or zero x-variance.
    SELECT count(*)::int,
           regr_intercept(run2_avg, run1_avg)::numeric,
           regr_slope(run2_avg, run1_avg)::numeric
      INTO v_pairs, v_intercept, v_slope
    FROM _ise_runs
    WHERE run2_avg IS NOT NULL AND run1_avg >= p_threshold;

    -- update each treated row that now has a matured run2
    IF v_pairs >= p_min_pairs AND v_slope IS NOT NULL THEN
      UPDATE public.induction_session_effectiveness e
      SET rerun_session_id = rr.run2_session,
          rerun_avg        = rr.run2_avg,
          rerun_responses  = rr.run2_n,
          raw_lift         = round(rr.run2_avg - e.input_avg, 2),
          rtm_expected_avg = round(v_intercept + v_slope * e.input_avg, 2),
          net_effect       = round(rr.run2_avg - (v_intercept + v_slope * e.input_avg), 2),
          measure_status   = 'measured',
          outcome_measured_at = now(),
          updated_at       = now()
      FROM _ise_runs rr
      WHERE e.event_id = v_event AND e.topic_key = rr.topic_key
        AND rr.run2_avg IS NOT NULL
        AND e.measure_status <> 'measured';
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSE
      -- run2 exists but we cannot estimate RTM yet → record raw, flag honestly
      UPDATE public.induction_session_effectiveness e
      SET rerun_session_id = rr.run2_session,
          rerun_avg        = rr.run2_avg,
          rerun_responses  = rr.run2_n,
          raw_lift         = round(rr.run2_avg - e.input_avg, 2),
          rtm_expected_avg = NULL,
          net_effect       = NULL,
          measure_status   = 'insufficient_rtm_data',
          outcome_measured_at = now(),
          updated_at       = now()
      FROM _ise_runs rr
      WHERE e.event_id = v_event AND e.topic_key = rr.topic_key
        AND rr.run2_avg IS NOT NULL
        AND e.measure_status <> 'measured';
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;

    v_updated := v_updated + v_n;
    DROP TABLE IF EXISTS _ise_runs;
  END LOOP;

  RETURN v_updated;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_measure_session_effectiveness(uuid,numeric,int,int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_induction_measure_session_effectiveness(uuid,numeric,int,int) TO service_role;

COMMENT ON FUNCTION public.fn_induction_measure_session_effectiveness(uuid,numeric,int,int) IS
  'RTM-corrected verifier for the per-session induction loop. net_effect = rerun_avg - (mu + rho*(input_avg-mu)), rho/mu from untreated re-run pairs. < p_min_pairs untreated pairs => measure_status=insufficient_rtm_data, net_effect NULL (never fabricated). service_role only.';

-- ── 4. summary reader — resource person (their sessions) / coordinator / admin ─
-- A credited speaker sees the loop rows for sessions they led; a coordinator/admin
-- with induction.view + institution access sees all of the event's loop rows.
CREATE OR REPLACE FUNCTION public.fn_induction_session_loop_summary(p_event_id uuid)
RETURNS TABLE (
  topic_key        text,
  first_session_id uuid,
  input_avg        numeric,
  input_responses  integer,
  suggestion       jsonb,
  rerun_avg        numeric,
  raw_lift         numeric,
  rtm_expected_avg numeric,
  net_effect       numeric,
  measure_status   text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid; v_is_coord boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_loop_summary: not authenticated'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_loop_summary: not an induction event'; END IF;

  v_is_coord := is_super_admin() OR is_admin()
                OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst));

  RETURN QUERY
  SELECT e.topic_key, e.first_session_id, e.input_avg, e.input_responses, e.suggestion,
         e.rerun_avg, e.raw_lift, e.rtm_expected_avg, e.net_effect, e.measure_status
  FROM public.induction_session_effectiveness e
  WHERE e.event_id = p_event_id
    AND (
      v_is_coord
      -- a resource person sees only loop rows for a session they are credited on
      OR EXISTS (
        SELECT 1 FROM public.event_session_speakers sp
        WHERE sp.profile_id = auth.uid()
          AND sp.session_id IN (e.first_session_id, e.rerun_session_id)
      )
    )
  ORDER BY e.net_effect DESC NULLS LAST, e.input_avg ASC;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_loop_summary(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_loop_summary(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
