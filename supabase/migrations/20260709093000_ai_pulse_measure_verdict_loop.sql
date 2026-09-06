-- ============================================================================
-- Updated: 2026-07-09 - AI Pulse: close Measure + Verdict on the weekly cycle.
--
-- WHY
-- ---
-- On the four-gate loop test (1 Generate -> 2 Act -> 3 Measure-vs-baseline ->
-- 4 Feed-forward), AI Pulse scored 1 and 2 only. It had NO measure fn and NO
-- verdict fn, while SCF / induction / mess all do. So /admin/loops reviewed it
-- with eyes, not outcomes, and nothing ever emitted "goal met / goal missed".
--
-- WHAT THE MISSING JUDGE HID (verified live 2026-07-09)
-- AI Pulse is a FOUR-STAGE FUNNEL:
--     learn (Thu live session) -> apply in your domain (event_submissions)
--     -> AI Lab / Gold (config.ai_pulse.gold_selections) -> publish on dept IG
-- The rotation engine drafts hundreds of teams every week, and stages 2-4 have
-- produced ZERO rows, ever:
--     cycle    teams  members  submissions  gold  publications
--     06-18      247     1156            0     0             0
--     06-25      236     1105            0     0             0
--     07-02      226     1055            0     0             0
--     07-09      144      642            0     0             0
-- Grading only engaged-attendance would have reported "10% engaged" and stayed
-- silent about 853 teams producing nothing. So the verdict grades the FUNNEL,
-- and names the stage where it dies (`stage_reached`).
--
-- DISCIPLINE INHERITED FROM THE EXISTING LOOPS (do not re-derive)
--  * Baseline and outcome use the IDENTICAL estimator, recomputed at measure
--    time. Baseline is the AVG OF PRIOR PER-CYCLE RATIOS -- never sum()/sum().
--    (That fan-out is exactly the bug 20260628020000_fix_scf_measure_baseline_
--    doublecount.sql was written to kill.)
--  * RTM correction: regress outcome on baseline over the UNTREATED departments
--    (no prior intervention) and subtract the expected regression. Too few
--    untreated pairs => measure_status='insufficient_rtm_data', net_effect NULL.
--    NEVER fabricate. (Mirrors fn_induction_measure_session_effectiveness.)
--  * Idempotent: 'measured' rows are never re-measured -- gated in BOTH the
--    candidate filter and the UPDATE's WHERE.
--  * Batch measure fn is service_role only (it bypasses RLS and spans tenants).
--    Verdict + confound are authenticated and self-scope by institution.
--
-- GRAIN
--   dept rows  (dept_id NOT NULL): the RTM/confound substrate. Attendance is
--     attributed via profile_id -> profiles.department_id (matches the heatmap,
--     which also drops null-dept learners: 2 of 201 rows today).
--   program row (dept_id IS NULL): ONE per cycle, counts ALL attendance and all
--     submissions -- the lossless KPI the phase-2 gate refers to.
--   *** NEVER SUM THE TWO GRAINS TOGETHER *** (double-counts every attributed
--   learner). RTM and the confound check filter dept_id IS NOT NULL.
--
-- ATTRIBUTION
--   A team may span departments, so a submission is attributed to the department
--   of its SUBMITTER (event_submissions.submitted_by -> profiles.department_id):
--   single-valued, no fan-out. Gold is already department-keyed in
--   config.ai_pulse.gold_selections. The program row counts everything, so
--   nothing is lost.
--
-- SIGNAL DEFINITIONS mirror lib/services/ai-pulse/ai-pulse-pde-bridge-service.ts
-- so the judge and the PDE bridge read the same reality:
--   domain_sync  = non-empty description/solution_summary OR a non-Instagram proof URL
--   publication  = a proof URL matching instagram.com/(p|reel|reels|tv)/<shortcode>
--   above target = that post's latest ig_post_metrics.reach >= ig_reach_threshold
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Engagement predicate, in SQL. Mirrors isEngagedFromGates (2-of-3: joined /
--    present-at-end / quiz; polls EXCLUDED) and isPresentAtEnd from
--    lib/services/ai-pulse/live-session-service.ts. Baseline AND outcome both
--    call this, so the estimator is identical by construction.
--    IMMUTABLE + no data access => NOT SECURITY DEFINER.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_hhmm_minus(p_hhmm text, p_min int)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT lpad((GREATEST((split_part(p_hhmm,':',1)::int*60
                       + split_part(p_hhmm,':',2)::int) - p_min, 0) / 60)::text, 2, '0')
      || ':' ||
         lpad((GREATEST((split_part(p_hhmm,':',1)::int*60
                       + split_part(p_hhmm,':',2)::int) - p_min, 0) % 60)::text, 2, '0');
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_hhmm_minus(text,int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_hhmm_minus(text,int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_is_engaged(p_signals jsonb, p_end_hhmm text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $fn$
  -- The literal 5 mirrors STAY_TOLERANCE_MINUTES in live-session-service.ts.
  -- It is a sensor-fidelity constant (it must equal the TS value so this judge
  -- agrees with the heatmap and digest), NOT a policy knob.
  SELECT (
      COALESCE((COALESCE(p_signals,'{}'::jsonb)->>'joined_within_5min')::boolean, false)::int
    + (
        -- present at end: took the LIVE quiz (proxy for the dead heartbeat), or
        -- the heartbeat itself reached within 5 min of session end.
        (jsonb_typeof(COALESCE(p_signals,'{}'::jsonb)->'quiz_score') = 'number'
           AND COALESCE((COALESCE(p_signals,'{}'::jsonb)->>'quiz_async_makeup')::boolean, false) = false)
        OR (COALESCE(COALESCE(p_signals,'{}'::jsonb)->>'stayed_until','') <> ''
           AND p_end_hhmm IS NOT NULL
           AND (COALESCE(p_signals,'{}'::jsonb)->>'stayed_until') >= public.fn_ai_pulse_hhmm_minus(p_end_hhmm, 5))
      )::int
    + COALESCE((COALESCE(p_signals,'{}'::jsonb)->>'quiz_passed')::boolean, false)::int
  ) >= 2;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_is_engaged(jsonb,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_is_engaged(jsonb,text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. Outcome table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_pulse_cycle_outcomes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id            uuid NOT NULL REFERENCES public.startup_events(id) ON DELETE CASCADE,
  dept_id             uuid REFERENCES public.departments(id) ON DELETE CASCADE, -- NULL = program rollup
  institution_id      uuid,
  demo_date           date,

  -- stage 1: learn
  attendance_count    int NOT NULL DEFAULT 0,
  engaged_count       int NOT NULL DEFAULT 0,
  engaged_rate        numeric,
  -- stage 2-4: produce
  teams_count         int NOT NULL DEFAULT 0,
  domain_sync_count   int NOT NULL DEFAULT 0,
  gold_count          int NOT NULL DEFAULT 0,
  publication_count   int NOT NULL DEFAULT 0,
  publication_above_target_count int NOT NULL DEFAULT 0,
  artifact_count      int NOT NULL DEFAULT 0,     -- distinct submissions
  agency_yield        numeric,                    -- artifact_count / engaged_count  <- headline

  -- where the funnel died
  stage_reached       text NOT NULL DEFAULT 'no_attendance'
                        CHECK (stage_reached IN ('no_attendance','no_engagement','no_domain_sync',
                                                 'no_gold','no_publication','complete')),

  -- baseline / RTM (dept grain only carries net_effect)
  baseline_rate       numeric,
  baseline_n          int,
  raw_lift            numeric,
  rtm_expected_rate   numeric,
  net_effect          numeric,

  -- AUTOMATIC verdict vs the target dials -- this is the "goal met / goal missed"
  -- emission that tier 3 never made.
  goal_target_engaged numeric,
  goal_target_yield   numeric,
  goal_status         text NOT NULL DEFAULT 'pending'
                        CHECK (goal_status IN ('pending','goal_met','goal_missed','insufficient_data')),

  -- HUMAN verdict: the causal control label (treatment vs naturally-occurring control)
  human_verdict       text CHECK (human_verdict IS NULL OR human_verdict IN
                                  ('intervened','partial','not_intervened')),
  human_verdict_by    uuid,
  human_verdict_at    timestamptz,
  human_verdict_note  text,

  measure_status      text NOT NULL DEFAULT 'pending'
                        CHECK (measure_status IN ('pending','measured','insufficient_baseline',
                                                  'insufficient_rtm_data','insufficient_data')),
  outcome_measured_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- NULLS NOT DISTINCT (PG15+; prod is 15.0006) makes the single dept-NULL program
-- row unique per cycle and lets ON CONFLICT (cycle_id, dept_id) target it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_pulse_cycle_outcomes
  ON public.ai_pulse_cycle_outcomes (cycle_id, dept_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_apco_dept   ON public.ai_pulse_cycle_outcomes(dept_id);
CREATE INDEX IF NOT EXISTS idx_apco_status ON public.ai_pulse_cycle_outcomes(measure_status);
CREATE INDEX IF NOT EXISTS idx_apco_inst   ON public.ai_pulse_cycle_outcomes(institution_id);

DROP TRIGGER IF EXISTS trg_apco_touch ON public.ai_pulse_cycle_outcomes;
CREATE TRIGGER trg_apco_touch BEFORE UPDATE ON public.ai_pulse_cycle_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.ai_pulse_cycle_outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS apco_select ON public.ai_pulse_cycle_outcomes;
CREATE POLICY apco_select ON public.ai_pulse_cycle_outcomes
  FOR SELECT TO authenticated USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('aiPulse:dept.heatmap') AND role_has_institution_access(institution_id))
  );
-- No INSERT/UPDATE/DELETE policy on purpose: measure writes come from the
-- service-role DEFINER fn; verdict writes go through fn_ai_pulse_set_verdict.
REVOKE ALL    ON public.ai_pulse_cycle_outcomes FROM anon, PUBLIC;
GRANT  SELECT ON public.ai_pulse_cycle_outcomes TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. The measure fn (gate 3). service_role only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_measure_cycle_outcomes(p_min_age_days int DEFAULT NULL)
RETURNS TABLE(rows_written int, measured int, insufficient int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_min_age int; v_min_att int; v_window int; v_min_pairs int; v_reach int;
  v_t_engaged numeric; v_t_yield numeric;
  v_written int := 0; v_measured int := 0;
BEGIN
  -- dials (CONFIG MANDATE: zero hardcoded knobs)
  SELECT COALESCE(p_min_age_days,
         (SELECT (value_jsonb#>>'{}')::int FROM ai_pulse_policies WHERE config_key='measure_min_age_days' AND is_active), 3)
    INTO v_min_age;
  SELECT COALESCE((SELECT (value_jsonb#>>'{}')::int     FROM ai_pulse_policies WHERE config_key='measure_min_attendance'    AND is_active), 5)    INTO v_min_att;
  SELECT COALESCE((SELECT (value_jsonb#>>'{}')::int     FROM ai_pulse_policies WHERE config_key='measure_baseline_window'   AND is_active), 3)    INTO v_window;
  SELECT COALESCE((SELECT (value_jsonb#>>'{}')::int     FROM ai_pulse_policies WHERE config_key='measure_min_rtm_pairs'     AND is_active), 5)    INTO v_min_pairs;
  SELECT COALESCE((SELECT (value_jsonb#>>'{}')::int     FROM ai_pulse_policies WHERE config_key='ig_reach_threshold'        AND is_active), 500)  INTO v_reach;
  -- Targets are stored as INT PERCENTAGES, matching the house convention
  -- (quiz_pass_threshold_live = 40). data_type='float' is permitted by the CHECK
  -- but no policy row has ever used it, so the Policies-editor float render path
  -- is untested -- do not be the first to exercise it.
  SELECT COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='engaged_attendance_target_pct' AND is_active), 70) / 100.0 INTO v_t_engaged;
  SELECT COALESCE((SELECT (value_jsonb#>>'{}')::numeric FROM ai_pulse_policies WHERE config_key='agency_yield_target_pct'       AND is_active), 10) / 100.0 INTO v_t_yield;

  WITH cyc AS (
    SELECT se.id AS cycle_id,
           se.host_institution_id AS host_inst,
           se.demo_date::date AS demo_date,
           COALESCE(se.config->'ai_pulse'->>'session_end_time','19:30') AS end_hhmm,
           se.config->'ai_pulse'->'gold_selections' AS gold
    FROM public.startup_events se
    WHERE se.config->>'kind' = 'ai_pulse'
      AND se.demo_date IS NOT NULL
      AND COALESCE(se.status,'') <> 'cancelled'
      AND se.demo_date::date <= (current_date - v_min_age)   -- matured past the make-up window
  ),
  att AS (
    SELECT c.cycle_id, c.demo_date, c.host_inst, p.department_id AS dept_id,
           public.fn_ai_pulse_is_engaged(a.engagement_signals, c.end_hhmm) AS engaged
    FROM cyc c
    JOIN public.ai_pulse_live_attendance a
      ON a.event_id = c.cycle_id AND a.day_type = 'live_session'
    LEFT JOIN public.profiles p ON p.id = a.profile_id
  ),
  sub AS (   -- one row per submission, attributed to the SUBMITTER's department
    SELECT c.cycle_id, s.id AS submission_id, p.department_id AS dept_id,
      ( COALESCE(btrim(s.description),'') <> ''
        OR COALESCE(btrim(s.solution_summary),'') <> ''
        OR EXISTS (SELECT 1 FROM unnest(COALESCE(s.proof_urls,'{}'::text[])) AS u(url)
                    WHERE u.url IS NOT NULL AND u.url !~* 'instagram\.com/')
      ) AS is_domain_sync,
      EXISTS (SELECT 1 FROM unnest(COALESCE(s.proof_urls,'{}'::text[])) AS u(url)
               WHERE u.url ~* 'instagram\.com/') AS has_ig,
      ( SELECT max(mm.reach)
        FROM unnest(COALESCE(s.proof_urls,'{}'::text[])) AS u(url)
        JOIN LATERAL (
          SELECT substring(u.url from 'instagram\.com/(?:[^/?#]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)') AS code
        ) sc ON true
        JOIN public.ig_posts ip ON sc.code IS NOT NULL AND ip.permalink ILIKE '%' || sc.code || '%'
        JOIN LATERAL (
          SELECT m2.reach FROM public.ig_post_metrics m2
          WHERE m2.post_id = ip.id ORDER BY m2.snapshot_at DESC LIMIT 1
        ) mm ON true
      ) AS best_reach
    FROM cyc c
    JOIN public.event_submissions s ON s.event_id = c.cycle_id
    LEFT JOIN public.profiles p ON p.id = s.submitted_by
  ),
  reg_dept AS (
    SELECT DISTINCT c.cycle_id, r.id AS registration_id, p.department_id AS dept_id
    FROM cyc c
    JOIN public.event_registrations r ON r.event_id = c.cycle_id
    LEFT JOIN public.event_team_members m ON m.registration_id = r.id
    LEFT JOIN public.profiles p ON p.id = m.profile_id
  ),
  gold_d AS (
    SELECT c.cycle_id, (e.k)::uuid AS dept_id,
           COALESCE(jsonb_array_length(e.v->'submission_ids'), 0)::int AS gold_count
    FROM cyc c
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(c.gold)='object' THEN c.gold ELSE '{}'::jsonb END) AS e(k,v)
    WHERE e.k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND jsonb_typeof(e.v->'submission_ids') = 'array'
  ),

  -- ---- dept grain -----------------------------------------------------------
  units_d AS (
    SELECT t.cycle_id, t.dept_id, c.demo_date, d.institution_id,
           COALESCE(a.attendance_count,0)  AS attendance_count,
           COALESCE(a.engaged_count,0)     AS engaged_count,
           COALESCE(t.teams_count,0)       AS teams_count,
           COALESCE(s.domain_sync_count,0) AS domain_sync_count,
           COALESCE(g.gold_count,0)        AS gold_count,
           COALESCE(s.publication_count,0) AS publication_count,
           COALESCE(s.pub_above,0)         AS publication_above_target_count,
           COALESCE(s.artifact_count,0)    AS artifact_count
    FROM (SELECT cycle_id, dept_id, count(DISTINCT registration_id)::int AS teams_count
            FROM reg_dept WHERE dept_id IS NOT NULL GROUP BY 1,2) t
    JOIN cyc c ON c.cycle_id = t.cycle_id
    LEFT JOIN public.departments d ON d.id = t.dept_id
    LEFT JOIN (SELECT cycle_id, dept_id, count(*)::int AS attendance_count,
                      count(*) FILTER (WHERE engaged)::int AS engaged_count
                 FROM att WHERE dept_id IS NOT NULL GROUP BY 1,2) a
           ON a.cycle_id = t.cycle_id AND a.dept_id = t.dept_id
    LEFT JOIN (SELECT cycle_id, dept_id,
                      count(*) FILTER (WHERE is_domain_sync)::int AS domain_sync_count,
                      count(*) FILTER (WHERE has_ig)::int AS publication_count,
                      count(*) FILTER (WHERE has_ig AND COALESCE(best_reach,0) >= v_reach)::int AS pub_above,
                      count(*)::int AS artifact_count
                 FROM sub WHERE dept_id IS NOT NULL GROUP BY 1,2) s
           ON s.cycle_id = t.cycle_id AND s.dept_id = t.dept_id
    LEFT JOIN gold_d g ON g.cycle_id = t.cycle_id AND g.dept_id = t.dept_id
  ),
  -- ---- program grain (lossless: ALL attendance, ALL submissions) -------------
  units_p AS (
    SELECT c.cycle_id, NULL::uuid AS dept_id, c.demo_date, c.host_inst AS institution_id,
           COALESCE(a.attendance_count,0)  AS attendance_count,
           COALESCE(a.engaged_count,0)     AS engaged_count,
           COALESCE(t.teams_count,0)       AS teams_count,
           COALESCE(s.domain_sync_count,0) AS domain_sync_count,
           COALESCE(g.gold_count,0)        AS gold_count,
           COALESCE(s.publication_count,0) AS publication_count,
           COALESCE(s.pub_above,0)         AS publication_above_target_count,
           COALESCE(s.artifact_count,0)    AS artifact_count
    FROM cyc c
    LEFT JOIN (SELECT cycle_id, count(*)::int AS attendance_count,
                      count(*) FILTER (WHERE engaged)::int AS engaged_count
                 FROM att GROUP BY 1) a ON a.cycle_id = c.cycle_id
    LEFT JOIN (SELECT cycle_id, count(DISTINCT registration_id)::int AS teams_count
                 FROM reg_dept GROUP BY 1) t ON t.cycle_id = c.cycle_id
    LEFT JOIN (SELECT cycle_id,
                      count(*) FILTER (WHERE is_domain_sync)::int AS domain_sync_count,
                      count(*) FILTER (WHERE has_ig)::int AS publication_count,
                      count(*) FILTER (WHERE has_ig AND COALESCE(best_reach,0) >= v_reach)::int AS pub_above,
                      count(*)::int AS artifact_count
                 FROM sub GROUP BY 1) s ON s.cycle_id = c.cycle_id
    LEFT JOIN (SELECT cycle_id, sum(gold_count)::int AS gold_count FROM gold_d GROUP BY 1) g
           ON g.cycle_id = c.cycle_id
  ),
  units AS (SELECT * FROM units_d UNION ALL SELECT * FROM units_p),
  rate AS (
    SELECT u.*,
           CASE WHEN u.attendance_count > 0
                THEN round(u.engaged_count::numeric / u.attendance_count, 4) END AS engaged_rate,
           CASE WHEN u.engaged_count > 0
                THEN round(u.artifact_count::numeric / u.engaged_count, 4) END AS agency_yield
    FROM units u
  ),
  -- baseline = AVG of this unit's OWN prior per-cycle engaged ratios.
  -- One ratio per prior cycle (LATERAL LIMIT window). NEVER sum()/sum().
  base AS (
    SELECT r.cycle_id, r.dept_id,
           round(avg(pr.engaged_rate), 4) AS baseline_rate,
           count(*)::int                  AS baseline_n
    FROM rate r
    JOIN LATERAL (
      SELECT r2.engaged_rate
      FROM rate r2
      WHERE r2.dept_id IS NOT DISTINCT FROM r.dept_id
        AND r2.demo_date < r.demo_date
        AND r2.cycle_id <> r.cycle_id
        AND r2.attendance_count >= v_min_att
        AND r2.engaged_rate IS NOT NULL
      ORDER BY r2.demo_date DESC
      LIMIT v_window
    ) pr ON true
    GROUP BY r.cycle_id, r.dept_id
  ),
  -- treated = this department was intervened on in an EARLIER cycle
  units2 AS (
    SELECT r.*, b.baseline_rate, b.baseline_n,
           EXISTS (SELECT 1 FROM public.ai_pulse_interventions i
                   JOIN public.startup_events se2 ON se2.id = i.cycle_id
                   WHERE i.dept_id = r.dept_id AND se2.demo_date::date < r.demo_date) AS treated
    FROM rate r
    LEFT JOIN base b ON b.cycle_id = r.cycle_id AND b.dept_id IS NOT DISTINCT FROM r.dept_id
  ),
  -- RTM line per cycle, fitted over UNTREATED dept units only
  regr AS (
    SELECT cycle_id,
           count(*) FILTER (WHERE NOT treated AND baseline_rate IS NOT NULL) AS pairs,
           regr_intercept(engaged_rate, baseline_rate) FILTER (WHERE NOT treated AND baseline_rate IS NOT NULL) AS intercept,
           regr_slope(engaged_rate, baseline_rate)     FILTER (WHERE NOT treated AND baseline_rate IS NOT NULL) AS slope
    FROM units2
    WHERE dept_id IS NOT NULL
    GROUP BY cycle_id
  ),
  scored AS (
    SELECT u.*, g.pairs, g.intercept, g.slope,
      CASE
        WHEN u.attendance_count < v_min_att THEN NULL
        WHEN u.baseline_rate IS NULL THEN NULL
        WHEN u.dept_id IS NOT NULL AND g.pairs >= v_min_pairs AND g.slope IS NOT NULL
             -- regr_intercept/regr_slope return double precision; round() has no
             -- (double precision, int) overload, so cast before rounding.
             THEN round((g.intercept + g.slope * u.baseline_rate)::numeric, 4)
        ELSE NULL
      END AS rtm_expected_rate,
      -- where the funnel died
      CASE
        WHEN u.attendance_count = 0                     THEN 'no_attendance'
        WHEN u.engaged_count = 0                        THEN 'no_engagement'
        WHEN u.artifact_count = 0                       THEN 'no_domain_sync'
        WHEN u.gold_count = 0                           THEN 'no_gold'
        WHEN u.publication_above_target_count = 0       THEN 'no_publication'
        ELSE 'complete'
      END AS stage_reached,
      -- the "goal met / goal missed" emission tier 3 never made
      CASE
        WHEN u.attendance_count < v_min_att THEN 'insufficient_data'
        WHEN COALESCE(u.engaged_rate,0) >= v_t_engaged
         AND COALESCE(u.agency_yield,0) >= v_t_yield   THEN 'goal_met'
        ELSE 'goal_missed'
      END AS goal_status
    FROM units2 u
    LEFT JOIN regr g ON g.cycle_id = u.cycle_id
    WHERE NOT EXISTS (                       -- idempotency: candidate gate
      SELECT 1 FROM public.ai_pulse_cycle_outcomes o
      WHERE o.cycle_id = u.cycle_id
        AND o.dept_id IS NOT DISTINCT FROM u.dept_id
        AND o.measure_status = 'measured'
    )
  ),
  ins AS (
    INSERT INTO public.ai_pulse_cycle_outcomes AS o (
      cycle_id, dept_id, institution_id, demo_date,
      attendance_count, engaged_count, engaged_rate,
      teams_count, domain_sync_count, gold_count, publication_count,
      publication_above_target_count, artifact_count, agency_yield, stage_reached,
      baseline_rate, baseline_n, raw_lift, rtm_expected_rate, net_effect,
      goal_target_engaged, goal_target_yield, goal_status,
      measure_status, outcome_measured_at
    )
    SELECT s.cycle_id, s.dept_id, s.institution_id, s.demo_date,
           s.attendance_count, s.engaged_count, s.engaged_rate,
           s.teams_count, s.domain_sync_count, s.gold_count, s.publication_count,
           s.publication_above_target_count, s.artifact_count, s.agency_yield, s.stage_reached,
           s.baseline_rate, s.baseline_n,
           CASE WHEN s.baseline_rate IS NOT NULL AND s.engaged_rate IS NOT NULL
                THEN round(s.engaged_rate - s.baseline_rate, 4) END,
           s.rtm_expected_rate,
           CASE WHEN s.rtm_expected_rate IS NOT NULL AND s.engaged_rate IS NOT NULL
                THEN round(s.engaged_rate - s.rtm_expected_rate, 4) END,
           v_t_engaged, v_t_yield, s.goal_status,
           CASE
             WHEN s.attendance_count < v_min_att   THEN 'insufficient_data'
             WHEN s.baseline_rate IS NULL          THEN 'insufficient_baseline'
             WHEN s.rtm_expected_rate IS NOT NULL  THEN 'measured'
             WHEN s.dept_id IS NULL                THEN 'measured'  -- program grain has no control group by construction
             ELSE 'insufficient_rtm_data'
           END,
           now()
    FROM scored s
    ON CONFLICT (cycle_id, dept_id) DO UPDATE SET
      institution_id = EXCLUDED.institution_id, demo_date = EXCLUDED.demo_date,
      attendance_count = EXCLUDED.attendance_count, engaged_count = EXCLUDED.engaged_count,
      engaged_rate = EXCLUDED.engaged_rate, teams_count = EXCLUDED.teams_count,
      domain_sync_count = EXCLUDED.domain_sync_count, gold_count = EXCLUDED.gold_count,
      publication_count = EXCLUDED.publication_count,
      publication_above_target_count = EXCLUDED.publication_above_target_count,
      artifact_count = EXCLUDED.artifact_count, agency_yield = EXCLUDED.agency_yield,
      stage_reached = EXCLUDED.stage_reached,
      baseline_rate = EXCLUDED.baseline_rate, baseline_n = EXCLUDED.baseline_n,
      raw_lift = EXCLUDED.raw_lift, rtm_expected_rate = EXCLUDED.rtm_expected_rate,
      net_effect = EXCLUDED.net_effect,
      goal_target_engaged = EXCLUDED.goal_target_engaged,
      goal_target_yield = EXCLUDED.goal_target_yield,
      goal_status = EXCLUDED.goal_status,
      measure_status = EXCLUDED.measure_status,
      outcome_measured_at = now(), updated_at = now()
    WHERE o.measure_status <> 'measured'      -- idempotency: UPDATE gate
    RETURNING o.measure_status AS ms
  )
  SELECT count(*)::int, count(*) FILTER (WHERE ms = 'measured')::int
    INTO v_written, v_measured
  FROM ins;

  rows_written := v_written;
  measured     := v_measured;
  insufficient := v_written - v_measured;
  RETURN NEXT;
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_measure_cycle_outcomes(int) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_measure_cycle_outcomes(int) TO service_role;


-- ---------------------------------------------------------------------------
-- 4. Human verdict (the causal control label). authenticated; self-scoped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_set_verdict(
  p_cycle_id uuid, p_dept_id uuid, p_verdict text, p_note text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_inst uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_ai_pulse_set_verdict: not authenticated';
  END IF;
  IF p_verdict NOT IN ('intervened','partial','not_intervened') THEN
    RAISE EXCEPTION 'fn_ai_pulse_set_verdict: invalid verdict "%" -- must be intervened, partial or not_intervened', p_verdict;
  END IF;
  IF p_cycle_id IS NULL THEN
    RAISE EXCEPTION 'fn_ai_pulse_set_verdict: cycle_id required';
  END IF;

  SELECT o.institution_id INTO v_inst
  FROM public.ai_pulse_cycle_outcomes o
  WHERE o.cycle_id = p_cycle_id AND o.dept_id IS NOT DISTINCT FROM p_dept_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ai_pulse_set_verdict: no outcome row for this cycle/department yet';
  END IF;

  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('aiPulse:dept.intervene') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_ai_pulse_set_verdict: not authorized for this institution';
  END IF;

  UPDATE public.ai_pulse_cycle_outcomes
     SET human_verdict = p_verdict, human_verdict_by = auth.uid(),
         human_verdict_at = now(), human_verdict_note = p_note, updated_at = now()
   WHERE cycle_id = p_cycle_id AND dept_id IS NOT DISTINCT FROM p_dept_id;
  RETURN true;
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_set_verdict(uuid,uuid,text,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_set_verdict(uuid,uuid,text,text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 5. Falsification: does intervening actually lift engagement beyond RTM?
--    If 'intervened' ~= 'not_intervened', the lift is regression/drift, and this
--    loop is a self-reinforcing echo, not a moat.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_loop_confound_check(p_institution_id uuid DEFAULT NULL)
RETURNS TABLE(verdict text, n bigint, avg_net_effect numeric, avg_raw_lift numeric,
              stddev_net_effect numeric, avg_engaged_rate numeric, avg_agency_yield numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT COALESCE(o.human_verdict,'(unset)'),
         count(*)::bigint,
         round(avg(o.net_effect),4), round(avg(o.raw_lift),4),
         round(stddev_samp(o.net_effect),4), round(avg(o.engaged_rate),4),
         round(avg(o.agency_yield),4)
  FROM public.ai_pulse_cycle_outcomes o
  WHERE o.dept_id IS NOT NULL                       -- dept grain only; never mix grains
    AND o.measure_status IN ('measured','insufficient_rtm_data')
    AND (p_institution_id IS NULL OR o.institution_id = p_institution_id)
    AND (is_super_admin() OR is_admin() OR role_has_institution_access(o.institution_id))
  GROUP BY COALESCE(o.human_verdict,'(unset)')
  ORDER BY 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_loop_confound_check(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_loop_confound_check(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 6. Feed-forward reader (gate 4). service_role only -- consumed by the crons.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_prior_dept_outcome(
  p_dept_id uuid, p_exclude_cycle_id uuid DEFAULT NULL
) RETURNS TABLE(cycle_id uuid, demo_date date, engaged_rate numeric, agency_yield numeric,
                baseline_rate numeric, raw_lift numeric, net_effect numeric,
                stage_reached text, goal_status text, human_verdict text, measure_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT o.cycle_id, o.demo_date, o.engaged_rate, o.agency_yield, o.baseline_rate,
         o.raw_lift, o.net_effect, o.stage_reached, o.goal_status,
         o.human_verdict, o.measure_status
  FROM public.ai_pulse_cycle_outcomes o
  WHERE o.dept_id = p_dept_id
    AND o.measure_status IN ('measured','insufficient_rtm_data')
    AND (p_exclude_cycle_id IS NULL OR o.cycle_id <> p_exclude_cycle_id)
  ORDER BY o.demo_date DESC
  LIMIT 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_prior_dept_outcome(uuid,uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_prior_dept_outcome(uuid,uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
