-- ============================================================================
-- Updated: 2026-07-19 - AI Pulse: Domain Starter self-improving prompt loop
--                       (PR-A of 4 -- DARK SUBSTRATE, nothing user-facing yet).
--
-- WHY
-- ---
-- Each AI Pulse cycle, AI-Max (Rs.0) should auto-generate ONE copy-paste
-- "starter prompt" tailored to what a learner studies, publish it (My AI Pulse
-- page + one notification), then MEASURE whether it was used/helped and refine
-- next cycle's prompt automatically. Auto-publish, no human gate -- quality
-- comes from the LOOP, mirroring SCF (session-feedback) and the LIVE AI Pulse
-- per-department outcome loop (20260709093000_ai_pulse_measure_verdict_loop.sql).
--
-- ONE SPINE, NOT TWO (reconciliation)
-- -----------------------------------
-- We do NOT build a parallel *_loop_playbook. The "did it help" signal is READ
-- from the existing ai_pulse_cycle_outcomes (per-department engagement lift);
-- this feature only ADDS: (a) per-topic generation, (b) publish surfaces,
-- (c) a per-topic usage ledger. The parked learner-voice feedback-loop spec
-- stays parked. ss_prompts is Solutions Hub (ss_cycles) -- untouched.
--
-- GRAIN -- HYBRID, per Director (2026-07-19): "course when available, else
-- programme". A per-learner resolver returns the FINEST topic available:
--   * course     -- learner -> learners_profiles.section_id -> timetables
--                  (is_active, same section) -> class_session_lesson.course_id.
--                  Also unions session_feedback.section_id -> course_id (future
--                  coverage; 0 today). ~4% of AI Pulse learners resolve today.
--   * programme  -- fallback: learners_profiles.program_id (100% populated).
-- Because the resolver tries course EVERY cycle, learners shift course->prog
-- automatically as timetable / class_session_lesson coverage grows -- no code
-- change. topic_type is a COLUMN, never a code fork.
--
-- CYCLE = startup_events.id where config->>'kind'='ai_pulse' (matches the live
-- measure loop). Attendance = ai_pulse_live_attendance (day_type='live_session').
--
-- LOCK DISCIPLINE (mandatory, mirrors SCF + ai_pulse loop):
--   every RPC = SECURITY DEFINER + SET search_path=public
--             + REVOKE EXECUTE FROM anon, PUBLIC + explicit GRANT.
--   cross-tenant / cron writers -> service_role ONLY. Self-scoped learner reads
--   derive the learner from auth.uid() and NEVER accept a caller-supplied id
--   (confused-deputy guard).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Substrate tables
-- ---------------------------------------------------------------------------

-- One generated starter prompt per (cycle, topic). Aggregate/authored content
-- only -- never any learner's raw text.
CREATE TABLE IF NOT EXISTS public.ai_pulse_domain_starters (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id           uuid NOT NULL REFERENCES public.startup_events(id) ON DELETE CASCADE,
  topic_type         text NOT NULL CHECK (topic_type IN ('course','programme')),
  topic_id           uuid NOT NULL,                 -- courses.id OR programs.id
  topic_label        text NOT NULL,                 -- course_name / program_name snapshot
  institution_id     uuid,
  learner_count      int  NOT NULL DEFAULT 0,       -- attendees resolving to this topic this cycle

  -- generation
  generated_prompt   text,                          -- raw model output
  final_prompt       text,                          -- published copy-paste prompt
  model              text,
  prior_context      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- prior prompt + how it landed (self-improve input)

  -- measurement (usage captured here; "did it help" read from ai_pulse_cycle_outcomes)
  views              int  NOT NULL DEFAULT 0,        -- distinct learners who viewed
  copies             int  NOT NULL DEFAULT 0,        -- distinct learners who copied
  dept_outcome_lift  numeric,                        -- rolled-up dept engagement lift for this topic
  measure_status     text NOT NULL DEFAULT 'pending' CHECK (measure_status IN ('pending','measured','insufficient')),
  outcome_measured_at timestamptz,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, topic_type, topic_id)            -- idempotent upsert key
);
ALTER TABLE public.ai_pulse_domain_starters ENABLE ROW LEVEL SECURITY;
-- Deny-all direct: all reads via fn_ai_pulse_my_domain_starters (DEFINER, self-
-- scoped) / admin fns; all writes via service_role DEFINER fns. No table policy.

-- Per-learner usage ledger (dedup so views/copies count DISTINCT learners).
CREATE TABLE IF NOT EXISTS public.ai_pulse_domain_starter_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starter_id   uuid NOT NULL REFERENCES public.ai_pulse_domain_starters(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL,
  action       text NOT NULL CHECK (action IN ('view','copy')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (starter_id, profile_id, action)            -- one per learner per action
);
ALTER TABLE public.ai_pulse_domain_starter_events ENABLE ROW LEVEL SECURITY;
-- Deny-all direct; writes via fn_ai_pulse_domain_starter_used (DEFINER, self-scoped).

CREATE INDEX IF NOT EXISTS idx_ai_pulse_domain_starters_cycle
  ON public.ai_pulse_domain_starters (cycle_id);
CREATE INDEX IF NOT EXISTS idx_ai_pulse_domain_starter_events_starter
  ON public.ai_pulse_domain_starter_events (starter_id);


-- ---------------------------------------------------------------------------
-- 2. Topic resolver (the hybrid grain, in ONE place).
--    Takes an explicit learner_id -> service_role ONLY (a caller-supplied id
--    would be a confused deputy for any authenticated user). The self-scoped
--    learner read (sec.6) calls this internally with auth.uid()'s learner_id,
--    which is safe because the inner call runs in the DEFINER (owner) context.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_learner_topics(p_learner_id uuid)
RETURNS TABLE (topic_type text, topic_id uuid, topic_label text, institution_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  -- 2a. COURSE grain (finest) -- learner's section's scheduled courses.
  RETURN QUERY
  WITH lp AS (
    SELECT l.id, l.section_id, l.program_id, l.department_id, l.institution_id AS inst_id
    FROM learners_profiles l WHERE l.id = p_learner_id
  ),
  courses_for AS (
    SELECT DISTINCT csl.course_id AS cid
    FROM lp JOIN timetables t ON t.section_id = lp.section_id AND t.is_active
            JOIN class_session_lesson csl ON csl.timetable_id = t.id
    WHERE csl.course_id IS NOT NULL
    UNION
    SELECT DISTINCT sf.course_id
    FROM lp JOIN session_feedback sf ON sf.section_id = lp.section_id
    WHERE sf.course_id IS NOT NULL
  )
  SELECT 'course'::text, c.id, c.course_name, (SELECT inst_id FROM lp)
  FROM courses_for cf JOIN courses c ON c.id = cf.cid;

  IF FOUND THEN RETURN; END IF;

  -- 2b. PROGRAMME fallback (100% populated).
  RETURN QUERY
  SELECT 'programme'::text, pr.id, pr.program_name, l.institution_id
  FROM learners_profiles l JOIN programs pr ON pr.id = l.program_id
  WHERE l.id = p_learner_id AND l.program_id IS NOT NULL;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_learner_topics(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_learner_topics(uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 3. Candidate generator (service_role, cron). For a cycle, resolve every
--    attendee to their finest topic, keep topics with >= p_min_learners, and
--    attach the prior cycle's prompt + how it landed (the self-improve input).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_domain_starter_candidates(
  p_cycle_id uuid, p_min_learners int DEFAULT 3)
RETURNS TABLE (topic_type text, topic_id uuid, topic_label text,
               institution_id uuid, learner_count int, prior_context jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH attendees AS (
    SELECT DISTINCT p.learner_id
    FROM ai_pulse_live_attendance a
    JOIN profiles p ON p.id = a.profile_id
    WHERE a.event_id = p_cycle_id AND a.day_type = 'live_session'
      AND p.learner_id IS NOT NULL
  ),
  resolved AS (
    SELECT t.topic_type, t.topic_id, t.topic_label, t.institution_id
    FROM attendees at CROSS JOIN LATERAL public.fn_ai_pulse_learner_topics(at.learner_id) t
  ),
  grouped AS (
    SELECT topic_type, topic_id,
           max(topic_label)              AS topic_label,
           max(institution_id::text)::uuid AS institution_id,
           count(*)::int                 AS learner_count
    FROM resolved
    GROUP BY topic_type, topic_id
    HAVING count(*) >= p_min_learners      -- >=3 floor: relevance + privacy
  )
  SELECT g.topic_type, g.topic_id, g.topic_label, g.institution_id, g.learner_count,
         COALESCE((
           SELECT jsonb_build_object(
                    'prior_cycle_id', d.cycle_id,
                    'prior_prompt',   d.final_prompt,
                    'prior_views',    d.views,
                    'prior_copies',   d.copies,
                    'prior_lift',     d.dept_outcome_lift)
           FROM ai_pulse_domain_starters d
           WHERE d.topic_type = g.topic_type AND d.topic_id = g.topic_id
             AND d.cycle_id <> p_cycle_id
           ORDER BY d.created_at DESC LIMIT 1
         ), '{}'::jsonb) AS prior_context
  FROM grouped g;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_candidates(uuid,int) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_candidates(uuid,int) TO service_role;


-- ---------------------------------------------------------------------------
-- 4. Record generated prompt (service_role, cron). Idempotent upsert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_record_domain_starter(p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_id uuid;
BEGIN
  INSERT INTO ai_pulse_domain_starters
    (cycle_id, topic_type, topic_id, topic_label, institution_id, learner_count,
     generated_prompt, final_prompt, model, prior_context)
  VALUES
    ((p_payload->>'cycle_id')::uuid,
     p_payload->>'topic_type',
     (p_payload->>'topic_id')::uuid,
     p_payload->>'topic_label',
     NULLIF(p_payload->>'institution_id','')::uuid,
     COALESCE((p_payload->>'learner_count')::int, 0),
     p_payload->>'generated_prompt',
     COALESCE(p_payload->>'final_prompt', p_payload->>'generated_prompt'),
     p_payload->>'model',
     COALESCE(p_payload->'prior_context','{}'::jsonb))
  ON CONFLICT (cycle_id, topic_type, topic_id) DO UPDATE
    SET generated_prompt = EXCLUDED.generated_prompt,
        final_prompt     = EXCLUDED.final_prompt,
        model            = EXCLUDED.model,
        learner_count    = EXCLUDED.learner_count,
        prior_context    = EXCLUDED.prior_context,
        updated_at       = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_record_domain_starter(jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_record_domain_starter(jsonb) TO service_role;


-- ---------------------------------------------------------------------------
-- 5. Learner read (authenticated, self-scoped). Returns the caller's current-
--    cycle starter prompt(s) for THEIR resolved topic(s). auth.uid() only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_my_domain_starters(p_cycle_id uuid)
RETURNS TABLE (starter_id uuid, topic_type text, topic_label text, final_prompt text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_learner uuid;
BEGIN
  SELECT learner_id INTO v_learner FROM profiles WHERE id = auth.uid();
  IF v_learner IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT d.id, d.topic_type, d.topic_label, d.final_prompt
  FROM public.fn_ai_pulse_learner_topics(v_learner) t
  JOIN ai_pulse_domain_starters d
    ON d.topic_type = t.topic_type AND d.topic_id = t.topic_id AND d.cycle_id = p_cycle_id
  WHERE d.final_prompt IS NOT NULL;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 6. Usage capture (authenticated, self-scoped). Dedup per learner per action,
--    then refresh distinct-learner counters on the starter row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_domain_starter_used(p_starter_id uuid, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_action NOT IN ('view','copy') THEN RAISE EXCEPTION 'bad action'; END IF;

  INSERT INTO ai_pulse_domain_starter_events (starter_id, profile_id, action)
  VALUES (p_starter_id, v_uid, p_action)
  ON CONFLICT (starter_id, profile_id, action) DO NOTHING;

  UPDATE ai_pulse_domain_starters d SET
    views  = (SELECT count(DISTINCT profile_id) FROM ai_pulse_domain_starter_events e WHERE e.starter_id = d.id AND e.action='view'),
    copies = (SELECT count(DISTINCT profile_id) FROM ai_pulse_domain_starter_events e WHERE e.starter_id = d.id AND e.action='copy'),
    updated_at = now()
  WHERE d.id = p_starter_id;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_used(uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_used(uuid,text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 7. Measure (service_role, cron). Refresh usage counters and read the "did it
--    help" signal from the LIVE per-department outcome loop (no parallel spine):
--    dept_outcome_lift = avg raw_lift of the departments this topic's attendees
--    belong to, for this cycle. Improvement-only; idempotent on measure_status.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_measure_domain_starters(p_cycle_id uuid DEFAULT NULL)
RETURNS TABLE (measured int, insufficient int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_measured int := 0; v_insuff int := 0;
BEGIN
  WITH tgt AS (
    SELECT d.id, d.cycle_id, d.topic_type, d.topic_id
    FROM ai_pulse_domain_starters d
    WHERE d.measure_status = 'pending'
      AND (p_cycle_id IS NULL OR d.cycle_id = p_cycle_id)
  ),
  lift AS (
    -- roll the topic's cycle-attendees up to their departments, avg the live lift
    SELECT t.id,
           avg(o.raw_lift) FILTER (WHERE o.raw_lift IS NOT NULL) AS dept_lift,
           count(o.raw_lift)                                     AS n_dept
    FROM tgt t
    JOIN ai_pulse_live_attendance a ON a.event_id = t.cycle_id AND a.day_type='live_session'
    JOIN profiles p2 ON p2.id = a.profile_id
    JOIN public.fn_ai_pulse_learner_topics(p2.learner_id) rt
      ON rt.topic_type = t.topic_type AND rt.topic_id = t.topic_id
    JOIN ai_pulse_cycle_outcomes o
      ON o.cycle_id = t.cycle_id AND o.dept_id = p2.department_id
    GROUP BY t.id
  )
  UPDATE ai_pulse_domain_starters d SET
    views  = (SELECT count(DISTINCT profile_id) FROM ai_pulse_domain_starter_events e WHERE e.starter_id=d.id AND e.action='view'),
    copies = (SELECT count(DISTINCT profile_id) FROM ai_pulse_domain_starter_events e WHERE e.starter_id=d.id AND e.action='copy'),
    dept_outcome_lift = l.dept_lift,
    measure_status = CASE WHEN l.n_dept > 0 THEN 'measured' ELSE 'insufficient' END,
    outcome_measured_at = now(),
    updated_at = now()
  FROM lift l WHERE d.id = l.id;
  GET DIAGNOSTICS v_measured = ROW_COUNT;

  -- topics with no matching dept outcome yet -> insufficient (still refresh usage)
  UPDATE ai_pulse_domain_starters d SET
    views  = (SELECT count(DISTINCT profile_id) FROM ai_pulse_domain_starter_events e WHERE e.starter_id=d.id AND e.action='view'),
    copies = (SELECT count(DISTINCT profile_id) FROM ai_pulse_domain_starter_events e WHERE e.starter_id=d.id AND e.action='copy'),
    measure_status = 'insufficient', outcome_measured_at = now(), updated_at = now()
  WHERE d.measure_status = 'pending' AND (p_cycle_id IS NULL OR d.cycle_id = p_cycle_id);
  GET DIAGNOSTICS v_insuff = ROW_COUNT;

  RETURN QUERY SELECT v_measured, v_insuff;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_measure_domain_starters(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_measure_domain_starters(uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 8. Seeds -- AI-Max (Rs.0) job type + config flags. All DARK until PR-B/PR-C
--    wire the cron + UI and the enabled flag is flipped.
-- ---------------------------------------------------------------------------
INSERT INTO public.ai_job_types
  (job_type, title, description, tool_set, output_target, interactive, lane,
   allow_rule, schedulable, enabled, expected_seconds, input_schema)
VALUES
  ('ai_pulse.domain_starter',
   'AI Pulse - Domain Starter prompt (loop)',
   'Generates one copy-paste starter prompt per subject/discipline each cycle; self-improves from prior usage + dept outcome.',
   'none', 'job.result', false, 'max', 'seat_owner', true, true, 40,
   '[{"key":"prompt","type":"textarea","label":"Assembled prompt","required":true}]'::jsonb)
ON CONFLICT (job_type) DO NOTHING;

INSERT INTO public.ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type, is_active)
VALUES
  ('domain_starter_enabled', 'Domain Starter: enabled',
   'Master switch for the per-subject AI starter-prompt loop (generation + publish). Kill switch.',
   'false'::jsonb, 'bool', true),
  ('domain_starter_min_learners', 'Domain Starter: min learners per topic',
   'A starter prompt is only generated for a subject/programme with at least this many attending learners (relevance + privacy floor).',
   '3'::jsonb, 'int', true)
ON CONFLICT (config_key) DO NOTHING;
