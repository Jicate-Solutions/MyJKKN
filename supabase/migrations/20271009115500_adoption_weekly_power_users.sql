-- =============================================================================
-- Adoption: the weekly Power Users report (Director 2026-10-09 09:54 IST)
-- =============================================================================
-- Moves the adoption desk's hand-made Monday "Power Users" report into MyJKKN.
-- The report itself is plain SQL (this file). A model is used ONLY for the chat
-- agenda of each top-10 person, through the ₹0 Max lane (ai_jobs), never here.
--
-- WHAT THIS FILE ADDS (add only — no existing object is changed):
--   1. table adoption_power_user_weeks — one row per IST week (Monday start):
--      the computed report (payload) and the agenda job ids (agenda_jobs,
--      user_id -> ai_jobs.id). RLS on; SELECT for super admins only; no write
--      policy (only the service-role route writes).
--   2. policy adoption.power_users.exclude_institution_ids — colleges left out
--      of the report completely. Seeded with Jicate Solutions and JKKN College
--      of Arts and Science (Aided).
--   3. fn_adoption_power_users(p_week_start date) RETURNS jsonb — SECURITY
--      DEFINER, STABLE, service_role only. Reads usage_events for the IST week
--      [p_week_start 00:00 IST, +7 days) and returns:
--        top                          10 people, with names (super admins only)
--        one_day_staff                up to 5 staff who came on one day only
--        one_day_learners_by_college  COUNTS ONLY, never names
--        window, excluded_institution_ids
--      Never counted: super admins (role or flag), anyone whose college is in
--      the policy list (their profile's college, OR the college on ANY of their
--      events that week — usage_events can be written from the browser, so an
--      event's college can only add an exclusion, never lift one), test
--      accounts (email starting 'test' or name starting 'test '), and usage
--      with no profile.
--      A module, and a (module, feature) pair, counts only if 3+ counted people
--      used it that week (usage_events can be written from the browser); a visit
--      with no feature counts whenever its module does.
--      FAILS CLOSED: a missing, switched-off, draft or malformed policy row
--      (including a null or any other non-text item in the list) raises, so
--      the run stops instead of reporting the excluded colleges.
--   3b. fn_adoption_power_user_weeks_merge_jobs — merges agenda job ids into
--      the week row; raises if the week row is missing.
--   3c. fn_adoption_agenda_supersede_stale — cancels ONE agenda job that has
--      sat queued/running for over 24 h, so the route can queue a fresh one.
--   4. ai_job_types 'adoption.chat_agenda' — a copy of 'improvement.rank_ideas'
--      (glue template {{prompt}}, interactive=false, max lane, seat_owner),
--      except max_inflight = 10: one weekly run queues up to 10 agendas
--      (MAX_AGENDAS in lib/adoption/power-users.ts), so all of them may be in
--      flight at once.
--   5. ai_routine_schedules 'adoption-weekly-power-users' — Mondays 10:50 IST,
--      dispatcher-managed (after the 10:33 adoption-daily-tick).
--
-- Messages nobody. Does not touch the daily tick or any table it owns.
-- Rehearsal: supabase/tests/adoption/25_power_users.sql (run.sh).
-- =============================================================================

-- ---------------------------------------------------------------------
-- 1) the weekly store
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.adoption_power_user_weeks (
  week_start  date PRIMARY KEY,
  computed_at timestamptz NOT NULL DEFAULT now(),
  payload     jsonb NOT NULL,
  agenda_jobs jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT adoption_power_user_weeks_monday_chk CHECK (EXTRACT(ISODOW FROM week_start) = 1)
);
COMMENT ON TABLE public.adoption_power_user_weeks IS
  'Weekly Power Users report (one row per IST week, Monday start). payload = fn_adoption_power_users output; agenda_jobs = user_id -> ai_jobs.id of that person''s adoption.chat_agenda job. Names inside: super admins only.';

ALTER TABLE public.adoption_power_user_weeks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "adoption_power_user_weeks_select_super_admin" ON public.adoption_power_user_weeks;
CREATE POLICY "adoption_power_user_weeks_select_super_admin" ON public.adoption_power_user_weeks
  FOR SELECT TO authenticated USING ((SELECT is_super_admin()));
REVOKE ALL ON public.adoption_power_user_weeks FROM anon, authenticated;
GRANT SELECT ON public.adoption_power_user_weeks TO authenticated;
GRANT ALL ON public.adoption_power_user_weeks TO service_role;

-- ---------------------------------------------------------------------
-- 2) the colleges left out
-- ---------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_category, is_system, is_active, publication_state)
SELECT
  'adoption.power_users.exclude_institution_ids',
  'global',
  NULL,
  '["479eac7f-3e5b-479e-bd91-dee9e0186b9b", "a33138b6-4eea-4675-941f-1071bf88b127"]'::jsonb,
  'Colleges the weekly Power Users report leaves out completely (nobody from them is ranked, listed or counted, and no chat agenda is made for them). Starts with Jicate Solutions and JKKN College of Arts and Science (Aided). An empty list [] leaves nobody out. If this row is missing, switched off, a draft or not a list of college ids, the weekly report does not run.',
  'array',
  'major',
  'analytics',
  true,
  true,
  'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'adoption.power_users.exclude_institution_ids'
     AND scope_type = 'global' AND scope_id IS NULL
);

-- ---------------------------------------------------------------------
-- 3) the report
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_adoption_power_users(p_week_start date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start    timestamptz;
  v_end      timestamptz;
  v_raw      jsonb;
  v_excluded uuid[];
  v_prev_top jsonb;
  v_top      jsonb;
  v_staff    jsonb;
  v_learners jsonb;
BEGIN
  IF p_week_start IS NULL OR EXTRACT(ISODOW FROM p_week_start) <> 1 THEN
    RAISE EXCEPTION 'fn_adoption_power_users: week_start must be a Monday (got %)', p_week_start;
  END IF;

  -- The IST week [Monday 00:00 IST, next Monday 00:00 IST).
  v_start := p_week_start::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_end   := v_start + interval '7 days';

  -- Fail closed on the exclusion list: without it the run would rank the
  -- developers' own college and make agenda jobs for them.
  SELECT pp.value INTO v_raw
    FROM public.platform_policies pp
   WHERE pp.policy_key = 'adoption.power_users.exclude_institution_ids'
     AND pp.scope_type = 'global' AND pp.scope_id IS NULL AND pp.is_active
     AND COALESCE(pp.publication_state, 'published') = 'published'
   LIMIT 1;
  IF v_raw IS NULL OR jsonb_typeof(v_raw) <> 'array' THEN
    RAISE EXCEPTION 'fn_adoption_power_users: policy adoption.power_users.exclude_institution_ids is missing, off, a draft or not a list';
  END IF;
  -- A JSON null would become a NULL college id, and `x = ANY (list with a NULL)`
  -- is NULL for every other college, which would silently drop everyone.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_raw) AS e WHERE jsonb_typeof(e) <> 'string') THEN
    RAISE EXCEPTION 'fn_adoption_power_users: policy adoption.power_users.exclude_institution_ids holds something that is not a college id';
  END IF;
  BEGIN
    SELECT COALESCE(array_agg(x::uuid), '{}'::uuid[]) INTO v_excluded
      FROM jsonb_array_elements_text(v_raw) AS x;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'fn_adoption_power_users: policy adoption.power_users.exclude_institution_ids holds something that is not a college id';
  END;

  -- Last week's stored top 10, for the NEW badge. No row = nobody is NEW.
  SELECT w.payload->'top' INTO v_prev_top
    FROM public.adoption_power_user_weeks w
   WHERE w.week_start = p_week_start - 7;

  WITH ev AS (
    SELECT e.user_id, e.module, e.feature, e.event_type, e.institution_id, e.created_at,
           (e.created_at AT TIME ZONE 'Asia/Kolkata')::date AS ist_day
      FROM public.usage_events e
     WHERE e.created_at >= v_start AND e.created_at < v_end
  ),
  -- A part of MyJKKN counts only if its name looks like a real route
  -- (lower-case, digits, / _ . -, at most 64 characters) AND at least 3
  -- different people used it that week. usage_events can be written from the
  -- browser, so a single person inventing module names can neither climb the
  -- ranking nor put free text into the agenda prompt.
  -- The 3 people are counted only among people the report itself counts (a
  -- profile, not a super admin, not a test account, not an excluded college),
  -- so excluded or test accounts cannot vouch for an invented name.
  --
  -- People left out for their college: the profile's college is excluded, OR
  -- ANY of their events that week carries an excluded college. The event's
  -- college comes from the browser, so it can only add an exclusion — tagging
  -- the latest events with another college no longer lifts one.
  excluded_people AS (
    SELECT DISTINCT ev.user_id
      FROM ev
      LEFT JOIN public.profiles xp ON xp.id = ev.user_id
     WHERE xp.institution_id = ANY (v_excluded)
        OR ev.institution_id = ANY (v_excluded)
  ),
  vouch_ev AS (
    SELECT ev.user_id, ev.module, ev.feature
      FROM ev
      JOIN public.profiles vp ON vp.id = ev.user_id
     WHERE COALESCE(vp.role, '') <> 'super_admin'
       AND COALESCE(vp.is_super_admin, false) = false
       AND NOT (COALESCE(vp.email, '') ILIKE 'test%' OR COALESCE(vp.full_name, '') ILIKE 'test %')
       AND ev.user_id NOT IN (SELECT x.user_id FROM excluded_people x)
  ),
  valid_modules AS (
    SELECT v.module
      FROM vouch_ev v
     WHERE v.module ~ '^[a-z0-9_/.-]{1,64}$'
     GROUP BY v.module
    HAVING count(DISTINCT v.user_id) >= 3
  ),
  -- The same 3-people rule for each (module, feature) pair, so a real module
  -- with invented feature names (x1 ... x5000) cannot lift "features used".
  valid_features AS (
    SELECT v.module, COALESCE(v.feature, '') AS feature
      FROM vouch_ev v
     WHERE v.module ~ '^[a-z0-9_/.-]{1,64}$'
       AND COALESCE(v.feature, '') ~ '^[a-z0-9_/.:-]{0,64}$'
     GROUP BY v.module, COALESCE(v.feature, '')
    HAVING count(DISTINCT v.user_id) >= 3
    -- A visit with no feature is not an invented name: it counts whenever the
    -- module itself counts (at most one per real module, so it cannot be gamed).
    UNION
    SELECT vm.module, '' FROM valid_modules vm
  ),
  per_user AS (
    SELECT ev.user_id,
           count(DISTINCT (ev.module, COALESCE(ev.feature, ''))) FILTER (
             WHERE (ev.module, COALESCE(ev.feature, '')) IN (SELECT vf.module, vf.feature FROM valid_features vf)) AS features_used,
           -- the tie-breakers count only events on real modules too, so a burst of
           -- browser-written events on made-up names cannot lift anyone
           count(*) FILTER (WHERE ev.event_type IN ('create', 'update', 'export')
                              AND ev.module IN (SELECT vm.module FROM valid_modules vm))         AS records_saved,
           count(*) FILTER (WHERE ev.module IN (SELECT vm.module FROM valid_modules vm))         AS total_events,
           count(DISTINCT ev.ist_day)                                                                AS active_days,
           max(ev.ist_day)                                                                           AS last_day,
           (array_agg(ev.institution_id ORDER BY ev.created_at DESC)
              FILTER (WHERE ev.institution_id IS NOT NULL))[1]                                       AS event_institution_id
      FROM ev
     GROUP BY ev.user_id
  ),
  people AS (
    SELECT pu.*,
           p.full_name, p.role, p.created_at AS profile_created_at,
           COALESCE(p.institution_id, pu.event_institution_id) AS institution_id
      FROM per_user pu
      JOIN public.profiles p ON p.id = pu.user_id
     WHERE COALESCE(p.role, '') <> 'super_admin'
       AND COALESCE(p.is_super_admin, false) = false
       AND NOT (COALESCE(p.email, '') ILIKE 'test%' OR COALESCE(p.full_name, '') ILIKE 'test %')
  ),
  kept AS (
    SELECT pe.*, i.name AS institution_name
      FROM people pe
      LEFT JOIN public.institutions i ON i.id = pe.institution_id
     WHERE pe.user_id NOT IN (SELECT x.user_id FROM excluded_people x)
  ),
  ranked AS (
    SELECT k.*,
           row_number() OVER (ORDER BY k.features_used DESC, k.records_saved DESC,
                                       k.total_events DESC, k.user_id) AS rnk
      FROM kept k
  ),
  -- One active day in the week, an account older than the week, and nothing
  -- at all since the end of that one day (IST).
  one_day AS (
    SELECT k.*
      FROM kept k
     WHERE k.active_days = 1
       AND k.profile_created_at < v_end - interval '7 days'
       AND NOT EXISTS (
             SELECT 1 FROM public.usage_events later
              WHERE later.user_id = k.user_id
                AND later.created_at >= ((k.last_day + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'user_id', r.user_id, 'full_name', r.full_name, 'role', r.role,
              'institution_id', r.institution_id, 'institution_name', r.institution_name,
              'features_used', r.features_used, 'records_saved', r.records_saved,
              'active_days', r.active_days, 'total_events', r.total_events,
              'is_new', (jsonb_typeof(v_prev_top) = 'array' AND NOT EXISTS (
                           SELECT 1 FROM jsonb_array_elements(v_prev_top) pt
                            WHERE pt->>'user_id' = r.user_id::text)),
              'modules', (SELECT COALESCE(jsonb_agg(jsonb_build_object('module', m.module, 'count', m.n)
                                                    ORDER BY m.n DESC, m.module), '[]'::jsonb)
                            FROM (SELECT ev.module, count(*) AS n FROM ev
                                   WHERE ev.user_id = r.user_id
                                     AND ev.module IN (SELECT vm.module FROM valid_modules vm)
                                   GROUP BY ev.module ORDER BY count(*) DESC, ev.module LIMIT 15) m)
            ) ORDER BY r.rnk), '[]'::jsonb)
       FROM ranked r WHERE r.rnk <= 10),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'user_id', s.user_id, 'full_name', s.full_name, 'role', s.role,
              'institution_id', s.institution_id, 'institution_name', s.institution_name,
              'features_used', s.features_used, 'records_saved', s.records_saved,
              'active_days', s.active_days, 'total_events', s.total_events, 'last_day', s.last_day
            ) ORDER BY s.features_used DESC, s.records_saved DESC, s.total_events DESC, s.user_id), '[]'::jsonb)
       FROM (SELECT * FROM one_day o WHERE COALESCE(o.role, '') <> 'student'
              ORDER BY o.features_used DESC, o.records_saved DESC, o.total_events DESC, o.user_id
              LIMIT 5) s),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'institution_id', c.institution_id, 'institution_name', c.institution_name, 'count', c.n
            ) ORDER BY c.n DESC, c.institution_name NULLS LAST), '[]'::jsonb)
       FROM (SELECT o.institution_id, o.institution_name, count(*) AS n
               FROM one_day o WHERE o.role = 'student'
              GROUP BY o.institution_id, o.institution_name) c)
  INTO v_top, v_staff, v_learners;

  RETURN jsonb_build_object(
    'week_start', p_week_start,
    'window', jsonb_build_object('start', v_start, 'end', v_end),
    'excluded_institution_ids', to_jsonb(v_excluded),
    'top', v_top,
    'one_day_staff', v_staff,
    'one_day_learners_by_college', v_learners
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_power_users(date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_power_users(date) TO service_role;

-- ---------------------------------------------------------------------
-- 3b) record agenda job ids by MERGING, never by replacing the whole map
-- ---------------------------------------------------------------------
-- Two runs at the same moment each add their own ids. A read-modify-write of
-- the whole agenda_jobs map would let the later writer drop the earlier one's
-- ids; `||` inside one UPDATE takes the row lock, so both survive. Only the
-- route (service role) calls it.
CREATE OR REPLACE FUNCTION public.fn_adoption_power_user_weeks_merge_jobs(p_week_start date, p_jobs jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_jobs IS NULL OR jsonb_typeof(p_jobs) <> 'object' THEN
    RAISE EXCEPTION 'p_jobs must be a json object of user_id -> job id';
  END IF;
  UPDATE public.adoption_power_user_weeks
     SET agenda_jobs = COALESCE(agenda_jobs, '{}'::jsonb) || p_jobs
   WHERE week_start = p_week_start;
  -- No week row = the ids would be dropped while the route reports success.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_adoption_power_user_weeks_merge_jobs: no week row for %', p_week_start;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_power_user_weeks_merge_jobs(date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_power_user_weeks_merge_jobs(date, jsonb) TO service_role;

-- ---------------------------------------------------------------------
-- 3c) retire ONE agenda job that has been stuck for over 24 h
-- ---------------------------------------------------------------------
-- The dedupe guard blocks a second live job for the same person and week, so a
-- job the drain never picked up would block that person for ever and every
-- re-run would answer 500. The route calls this for such a job, then queues a
-- fresh one. Only an adoption.chat_agenda job, only while still live, only if
-- requested over 24 h ago — so a job the drain has just taken is left alone.
-- Returns true when the job was cancelled.
CREATE OR REPLACE FUNCTION public.fn_adoption_agenda_supersede_stale(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_jobs
     SET status = 'canceled',
         error = 'superseded: queued over 24 h and never finished; the weekly power users run queued a fresh job',
         completed_at = now()
   WHERE id = p_job_id
     AND job_type = 'adoption.chat_agenda'
     AND status IN ('pending', 'claimed', 'running')
     AND requested_at < now() - interval '24 hours';
  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_agenda_supersede_stale(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_agenda_supersede_stale(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 4) the agenda job type (copy of improvement.rank_ideas)
-- ---------------------------------------------------------------------
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled,
   input_schema, expected_seconds, provider, model_id)
VALUES
  ('adoption.chat_agenda',
   'Adoption — weekly chat agenda for one power user (Max lane)',
   'Writes 3 short questions and 2-4 topics for a chat with one of last week''s top-10 MyJKKN users, from that person''s own usage only (modules used, records saved, active days, their own recent bug reports). Returns strict JSON {questions, topics}. Shown on /admin/adoption to super admins.',
   '{{prompt}}',
   'none', 'job.result', false, 'max', 'seat_owner', 10, true, true,
   '[{"key":"prompt","type":"textarea","label":"Assembled agenda prompt","required":true}]'::jsonb,
   45, 'anthropic', 'claude-sonnet-4-6')
-- A row made by an earlier copy of this file (max_inflight 3) is raised to 10;
-- nothing else on an existing row is touched, and a higher value is kept.
ON CONFLICT (job_type) DO UPDATE
  SET max_inflight = GREATEST(public.ai_job_types.max_inflight, EXCLUDED.max_inflight);

-- ---------------------------------------------------------------------
-- 5) the clock — Mondays 10:50 IST, dispatcher-managed
-- ---------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules (routine_id, enabled, days_of_week, minute_of_day, managed)
VALUES
  ('adoption-weekly-power-users', true, '{1}', 650, true)
ON CONFLICT (routine_id) DO NOTHING;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.ai_routine_schedules WHERE routine_id = 'adoption-weekly-power-users') <> 1 THEN
    RAISE EXCEPTION 'adoption-weekly-power-users schedule row missing after seed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_job_types WHERE job_type = 'adoption.chat_agenda') THEN
    RAISE EXCEPTION 'adoption.chat_agenda job type missing after seed';
  END IF;
  IF has_function_privilege('anon', 'public.fn_adoption_power_users(date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_adoption_power_users(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_adoption_power_users is callable by a client role';
  END IF;
  IF has_function_privilege('anon', 'public.fn_adoption_power_user_weeks_merge_jobs(date, jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_adoption_power_user_weeks_merge_jobs(date, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_adoption_power_user_weeks_merge_jobs is callable by a client role';
  END IF;
  IF has_function_privilege('anon', 'public.fn_adoption_agenda_supersede_stale(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_adoption_agenda_supersede_stale(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_adoption_agenda_supersede_stale is callable by a client role';
  END IF;
  IF (SELECT max_inflight FROM public.ai_job_types WHERE job_type = 'adoption.chat_agenda') < 10 THEN
    RAISE EXCEPTION 'adoption.chat_agenda max_inflight is below the 10 agendas one run queues';
  END IF;
END $$;
