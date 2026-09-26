-- ============================================================================
-- 20270305090000_ai_query_schedules.sql
-- ----------------------------------------------------------------------------
-- AI Assistant — "send me this every Monday". A person can take a question they
-- asked and have it answered again on a schedule (daily / weekly on a chosen
-- weekday / monthly on a chosen date, at a time in IST), delivered to THEM by
-- email and in-app.
--
-- HOW A SCHEDULED RUN IS ANSWERED
--   A run is an ordinary ai_jobs row of job_type 'ai_query.chat' whose
--   requested_by is the schedule OWNER, so the scoped chat drain answers it with
--   the owner's own access — never more. It is inserted here, not through
--   fn_ai_enqueue, only because fn_ai_enqueue reads auth.uid() and the cron has
--   no signed-in user. Every check fn_ai_enqueue makes is repeated for the owner:
--     • job type enabled                (ai_job_types.enabled)
--     • allow_rule 'permission:<key>'   (user_has_permission(owner, key))
--     • per-person daily cap, IST day   (ai_job_types.daily_cap_per_user)
--     • per-person in-flight cap        (ai_job_types.max_inflight, same lock key)
--   plus one fn_ai_enqueue cannot make: the owner's account is still active
--   (profiles.is_active / is_login_disabled), checked explicitly here because
--   the matching guard inside user_has_permission(uuid,text)
--   (20260927020000) is FILE ONLY and may not be live.
--   A scheduled run counts toward the owner's daily cap like any other
--   question; it never gets a quota of its own.
--
--   payload = {message, conversation_id: null, schedule_id, background: true}.
--   conversation_id is null so scheduled runs do not flood "Your past chats"
--   (fn_ai_my_conversations lists only rows WITH a conversation_id). Lane D's
--   completion notifier skips any job whose payload carries schedule_id — the
--   ai-tasks-sweep cron delivers scheduled runs itself (see
--   lib/services/ai-query/schedules/schedule-sweep.ts).
--
-- WHO CAN DO WHAT
--   ai_query_schedules: RLS on; the owner may SELECT their own rows; nobody
--   writes the table directly. Create / edit / pause / resume / delete / run-now
--   go through SECURITY DEFINER RPCs pinned to auth.uid(). The enqueue, claim
--   and record functions the cron uses are service_role ONLY.
--   At most 10 ACTIVE schedules per person.
--
-- FILE ONLY — NOT APPLIED. The orchestrator applies it at merge time.
-- ============================================================================

-- ci:allow-secdef-authenticated Every function granted to authenticated here acts
--   ONLY on the caller's own rows: each one reads auth.uid() and every read/write
--   is filtered `owner_id = auth.uid()` (create inserts owner_id = auth.uid()), so
--   a signed-in person can never see or change anyone else's schedule. delete and
--   run_now carry no permission check on purpose — someone who lost AI Assistant
--   access must still be able to delete their own schedule, and run_now re-checks
--   the permission for the owner inside fn_ai_query_schedule_enqueue_run. The
--   cron-only functions (enqueue, claim, record) are revoked from authenticated.

-- ── 1. TABLE ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_query_schedules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title                text NOT NULL,
  question             text NOT NULL,
  cadence              text NOT NULL,
  weekday              smallint,                -- weekly only: 0=Sun .. 6=Sat (IST)
  day_of_month         smallint,                -- monthly only: 1..31; a short month runs on its last day
  time_ist             time NOT NULL,           -- wall-clock time in Asia/Kolkata
  channels             text[] NOT NULL DEFAULT ARRAY['in_app','email']::text[],
  active               boolean NOT NULL DEFAULT true,
  next_run_at          timestamptz NOT NULL,
  last_run_at          timestamptz,
  last_job_id          uuid REFERENCES public.ai_jobs(id) ON DELETE SET NULL,
  last_status          text NOT NULL DEFAULT 'scheduled',
  consecutive_failures integer NOT NULL DEFAULT 0,
  delivery_attempts    smallint NOT NULL DEFAULT 0,  -- claims of the CURRENT run; 3 = stuck twice (see §12)
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_query_schedules_cadence_chk CHECK (cadence IN ('daily','weekly','monthly')),
  CONSTRAINT ai_query_schedules_weekday_chk CHECK (
    (cadence = 'weekly' AND weekday BETWEEN 0 AND 6) OR (cadence <> 'weekly' AND weekday IS NULL)
  ),
  CONSTRAINT ai_query_schedules_dom_chk CHECK (
    (cadence = 'monthly' AND day_of_month BETWEEN 1 AND 31) OR (cadence <> 'monthly' AND day_of_month IS NULL)
  ),
  CONSTRAINT ai_query_schedules_channels_chk CHECK (
    cardinality(channels) >= 1 AND channels <@ ARRAY['in_app','email']::text[]
  ),
  CONSTRAINT ai_query_schedules_title_chk CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  -- 4000 = the chat's own limit (fn_ai_enqueue / 20260712201500), so any question
  -- that could be asked can be repeated.
  CONSTRAINT ai_query_schedules_question_chk CHECK (char_length(btrim(question)) BETWEEN 1 AND 4000),
  CONSTRAINT ai_query_schedules_status_chk CHECK (last_status IN (
    'scheduled',          -- created / resumed, has not run yet
    'queued',             -- a run is waiting for its answer (last_job_id)
    'delivering',         -- the cron has claimed the finished run and is sending it
    'delivered',          -- the last run reached the owner
    'failed',             -- the last run did not produce an answer
    'skipped_limit',      -- the owner had used today's question limit
    'skipped_busy',       -- the owner had too many questions still being answered
    'skipped_offline',    -- the AI Assistant was switched off at run time
    'paused_failures',    -- paused after 3 failed runs in a row
    'paused_no_access'    -- paused: the owner lost AI Assistant access or was deactivated
  )),
  CONSTRAINT ai_query_schedules_failures_chk CHECK (consecutive_failures >= 0),
  CONSTRAINT ai_query_schedules_attempts_chk CHECK (delivery_attempts >= 0)
);

COMMENT ON TABLE public.ai_query_schedules IS
  'AI Assistant scheduled questions: one row = one question answered again on a schedule (IST) '
  'and delivered to its owner by email and/or in-app. Owner-only SELECT; all writes through '
  'SECURITY DEFINER RPCs. Runs are ai_jobs rows (ai_query.chat) requested_by the owner.';

CREATE INDEX IF NOT EXISTS ai_query_schedules_owner_idx ON public.ai_query_schedules (owner_id);
CREATE INDEX IF NOT EXISTS ai_query_schedules_due_idx   ON public.ai_query_schedules (next_run_at) WHERE active;
CREATE INDEX IF NOT EXISTS ai_query_schedules_inflight_idx
  ON public.ai_query_schedules (last_run_at) WHERE last_status = 'queued';

-- ── 2. RLS: the owner reads their own rows; nobody writes directly ───────────
ALTER TABLE public.ai_query_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_query_schedules_owner_select ON public.ai_query_schedules;
CREATE POLICY ai_query_schedules_owner_select ON public.ai_query_schedules
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

REVOKE ALL ON public.ai_query_schedules FROM anon, PUBLIC;
REVOKE ALL ON public.ai_query_schedules FROM authenticated;
GRANT  SELECT ON public.ai_query_schedules TO authenticated;
GRANT  ALL    ON public.ai_query_schedules TO service_role;

-- ── 3. next_run_at maths (IST). Mirrored in lib/services/ai-query/schedules/next-run.ts
--      The next occurrence STRICTLY AFTER p_after.
--      daily   → today at time_ist, else tomorrow
--      weekly  → the next <weekday> at time_ist (today counts if the time is still ahead)
--      monthly → day_of_month of this month at time_ist, else next month; a month
--                shorter than day_of_month runs on its LAST day (31 → 30 Apr, 28/29 Feb)
--      IST has no daylight saving, so the wall clock maps 1:1 to UTC+05:30.
CREATE OR REPLACE FUNCTION public.fn_ai_query_schedule_next_run(
  p_cadence      text,
  p_weekday      smallint,
  p_day_of_month smallint,
  p_time_ist     time,
  p_after        timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
  v_local timestamp := p_after AT TIME ZONE 'Asia/Kolkata';
  v_day   date      := (p_after AT TIME ZONE 'Asia/Kolkata')::date;
  v_cand  timestamp;
  v_month date;
  v_last  date;
  i       int;
BEGIN
  IF p_cadence = 'daily' THEN
    v_cand := v_day + p_time_ist;
    IF v_cand <= v_local THEN v_cand := v_cand + interval '1 day'; END IF;
    RETURN v_cand AT TIME ZONE 'Asia/Kolkata';
  ELSIF p_cadence = 'weekly' THEN
    IF p_weekday IS NULL OR p_weekday NOT BETWEEN 0 AND 6 THEN RETURN NULL; END IF;
    v_cand := (v_day + ((p_weekday - extract(dow FROM v_day)::int + 7) % 7)) + p_time_ist;
    IF v_cand <= v_local THEN v_cand := v_cand + interval '7 days'; END IF;
    RETURN v_cand AT TIME ZONE 'Asia/Kolkata';
  ELSIF p_cadence = 'monthly' THEN
    IF p_day_of_month IS NULL OR p_day_of_month NOT BETWEEN 1 AND 31 THEN RETURN NULL; END IF;
    FOR i IN 0..1 LOOP
      v_month := (date_trunc('month', v_day) + make_interval(months => i))::date;
      v_last  := (v_month + interval '1 month' - interval '1 day')::date;
      v_cand  := (v_month + (LEAST(p_day_of_month::int, extract(day FROM v_last)::int) - 1)) + p_time_ist;
      IF v_cand > v_local THEN RETURN v_cand AT TIME ZONE 'Asia/Kolkata'; END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_query_schedule_next_run(text, smallint, smallint, time, timestamptz) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_query_schedule_next_run(text, smallint, smallint, time, timestamptz) TO service_role;

-- ── 4. Input check shared by create + update. Returns NULL when valid, else a
--      plain-English reason the dialog can show as-is.
CREATE OR REPLACE FUNCTION public.fn_ai_query_schedule_input_error(
  p_title        text,
  p_question     text,
  p_cadence      text,
  p_weekday      smallint,
  p_day_of_month smallint,
  p_time_ist     time,
  p_channels     text[]
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  IF p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 120 THEN
    RETURN 'Give the schedule a name of up to 120 characters.';
  END IF;
  IF p_question IS NULL OR char_length(btrim(p_question)) NOT BETWEEN 1 AND 4000 THEN
    RETURN 'The question must be between 1 and 4000 characters.';
  END IF;
  IF p_cadence IS NULL OR p_cadence NOT IN ('daily','weekly','monthly') THEN
    RETURN 'Choose daily, weekly or monthly.';
  END IF;
  IF p_cadence = 'weekly' AND (p_weekday IS NULL OR p_weekday NOT BETWEEN 0 AND 6) THEN
    RETURN 'Choose which day of the week.';
  END IF;
  IF p_cadence = 'monthly' AND (p_day_of_month IS NULL OR p_day_of_month NOT BETWEEN 1 AND 31) THEN
    RETURN 'Choose a date between 1 and 31.';
  END IF;
  IF p_time_ist IS NULL THEN
    RETURN 'Choose a time.';
  END IF;
  IF p_channels IS NULL OR cardinality(p_channels) < 1
     OR NOT (p_channels <@ ARRAY['in_app','email']::text[]) THEN
    RETURN 'Choose email, in-app, or both.';
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_query_schedule_input_error(text, text, text, smallint, smallint, time, text[]) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_query_schedule_input_error(text, text, text, smallint, smallint, time, text[]) TO service_role;

-- ── 5. CREATE (owner = auth.uid()) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_query_schedule_create(
  p_title        text,
  p_question     text,
  p_cadence      text,
  p_weekday      smallint,
  p_day_of_month smallint,
  p_time_ist     time,
  p_channels     text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_err     text;
  v_active  int;
  v_weekday smallint := CASE WHEN p_cadence = 'weekly'  THEN p_weekday      END;
  v_dom     smallint := CASE WHEN p_cadence = 'monthly' THEN p_day_of_month END;
  v_next    timestamptz;
  v_id      uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED'); END IF;
  IF NOT COALESCE(public.user_has_permission('ai_query.view'), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You do not have access to the AI Assistant.');
  END IF;

  v_err := public.fn_ai_query_schedule_input_error(p_title, p_question, p_cadence, v_weekday, v_dom, p_time_ist, p_channels);
  IF v_err IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', v_err); END IF;

  -- serialise this person's creates so two tabs cannot both slip under the limit
  PERFORM pg_advisory_xact_lock(hashtext('ai_query_schedules:' || v_uid::text));
  SELECT count(*) INTO v_active FROM public.ai_query_schedules WHERE owner_id = v_uid AND active;
  IF v_active >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You already have 10 active schedules. Pause or delete one first.', 'limit', 10);
  END IF;

  v_next := public.fn_ai_query_schedule_next_run(p_cadence, v_weekday, v_dom, p_time_ist, now());

  INSERT INTO public.ai_query_schedules
    (owner_id, title, question, cadence, weekday, day_of_month, time_ist, channels, next_run_at)
  VALUES
    (v_uid, btrim(p_title), btrim(p_question), p_cadence, v_weekday, v_dom, p_time_ist,
     ARRAY(SELECT DISTINCT unnest(p_channels) ORDER BY 1), v_next)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'next_run_at', v_next);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_query_schedule_create(text, text, text, smallint, smallint, time, text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_query_schedule_create(text, text, text, smallint, smallint, time, text[]) TO authenticated;

-- ── 6. UPDATE (own rows only). Re-times the next run from now. ───────────────
CREATE OR REPLACE FUNCTION public.fn_ai_query_schedule_update(
  p_id           uuid,
  p_title        text,
  p_question     text,
  p_cadence      text,
  p_weekday      smallint,
  p_day_of_month smallint,
  p_time_ist     time,
  p_channels     text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_err     text;
  v_weekday smallint := CASE WHEN p_cadence = 'weekly'  THEN p_weekday      END;
  v_dom     smallint := CASE WHEN p_cadence = 'monthly' THEN p_day_of_month END;
  v_next    timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED'); END IF;
  IF NOT COALESCE(public.user_has_permission('ai_query.view'), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You do not have access to the AI Assistant.');
  END IF;

  v_err := public.fn_ai_query_schedule_input_error(p_title, p_question, p_cadence, v_weekday, v_dom, p_time_ist, p_channels);
  IF v_err IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', v_err); END IF;

  v_next := public.fn_ai_query_schedule_next_run(p_cadence, v_weekday, v_dom, p_time_ist, now());

  UPDATE public.ai_query_schedules
     SET title        = btrim(p_title),
         question     = btrim(p_question),
         cadence      = p_cadence,
         weekday      = v_weekday,
         day_of_month = v_dom,
         time_ist     = p_time_ist,
         channels     = ARRAY(SELECT DISTINCT unnest(p_channels) ORDER BY 1),
         next_run_at  = v_next,
         updated_at   = now()
   WHERE id = p_id AND owner_id = v_uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Schedule not found.'); END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'next_run_at', v_next);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_query_schedule_update(uuid, text, text, text, smallint, smallint, time, text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_query_schedule_update(uuid, text, text, text, smallint, smallint, time, text[]) TO authenticated;

-- ── 7. PAUSE / RESUME (own rows only). Resume re-checks access + the limit,
--      clears the failure count and re-times the next run from now. ───────────
CREATE OR REPLACE FUNCTION public.fn_ai_query_schedule_set_active(p_id uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  s        public.ai_query_schedules%ROWTYPE;
  v_active int;
  v_next   timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED'); END IF;
  IF p_active IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Say whether to pause or resume.'); END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ai_query_schedules:' || v_uid::text));
  SELECT * INTO s FROM public.ai_query_schedules WHERE id = p_id AND owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Schedule not found.'); END IF;

  IF NOT p_active THEN
    UPDATE public.ai_query_schedules SET active = false, updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('ok', true, 'id', s.id, 'active', false);
  END IF;

  IF s.active THEN
    RETURN jsonb_build_object('ok', true, 'id', s.id, 'active', true, 'next_run_at', s.next_run_at);
  END IF;
  IF NOT COALESCE(public.user_has_permission('ai_query.view'), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You do not have access to the AI Assistant.');
  END IF;
  SELECT count(*) INTO v_active FROM public.ai_query_schedules WHERE owner_id = v_uid AND active;
  IF v_active >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You already have 10 active schedules. Pause or delete one first.', 'limit', 10);
  END IF;

  v_next := public.fn_ai_query_schedule_next_run(s.cadence, s.weekday, s.day_of_month, s.time_ist, now());
  UPDATE public.ai_query_schedules
     SET active = true,
         next_run_at = v_next,
         consecutive_failures = 0,
         last_status = CASE WHEN s.last_status IN ('paused_failures','paused_no_access') THEN 'scheduled' ELSE s.last_status END,
         updated_at = now()
   WHERE id = s.id;
  RETURN jsonb_build_object('ok', true, 'id', s.id, 'active', true, 'next_run_at', v_next);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_query_schedule_set_active(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_query_schedule_set_active(uuid, boolean) TO authenticated;

-- ── 8. DELETE (own rows only). Past answers stay in ai_jobs. ─────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_query_schedule_delete(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED'); END IF;
  DELETE FROM public.ai_query_schedules WHERE id = p_id AND owner_id = v_uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Schedule not found.'); END IF;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_query_schedule_delete(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_query_schedule_delete(uuid) TO authenticated;

-- ── 9. ENQUEUE ONE RUN — the single body behind the cron and "Run now".
--      Granted to NOBODY: only the two wrappers below (SECURITY DEFINER, so they
--      run as the owner of this function) can reach it.
--      p_run_now = false → the cron: must be active and due; advances next_run_at.
--      p_run_now = true  → the owner pressed "Run now": runs even while paused,
--                          does not move next_run_at.
--      Returns {ok, status, job_id?, next_run_at?, cap?, used?}. status is one of
--        queued | not_found | not_due | in_flight | busy
--        | paused_no_access | skipped_offline | skipped_limit | skipped_busy
CREATE OR REPLACE FUNCTION public.fn_ai_query_schedule_enqueue_run(p_schedule_id uuid, p_run_now boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $fn$
DECLARE
  s          public.ai_query_schedules%ROWTYPE;
  t          public.ai_job_types%ROWTYPE;
  v_ok       boolean;
  v_used     int;
  v_inflight int;
  v_job      uuid;
  v_next     timestamptz;
BEGIN
  SELECT * INTO s FROM public.ai_query_schedules WHERE id = p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'status', 'not_found'); END IF;

  IF NOT p_run_now AND (NOT s.active OR s.next_run_at > now()) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_due');
  END IF;
  -- a run still waiting for its answer, or being sent, is in flight: a new run
  -- must not overwrite last_job_id under it (§12 recovers a stuck one)
  IF s.last_status IN ('queued','delivering') THEN
    RETURN jsonb_build_object('ok', false, 'status', 'in_flight', 'job_id', s.last_job_id);
  END IF;

  -- the next occurrence (cron only). A skipped run still moves on, so one bad
  -- day never piles up into a burst of catch-up runs.
  v_next := CASE WHEN p_run_now THEN s.next_run_at
                 ELSE public.fn_ai_query_schedule_next_run(s.cadence, s.weekday, s.day_of_month, s.time_ist, now()) END;

  -- (a) the owner is still an active, sign-in-able account …
  v_ok := EXISTS (SELECT 1 FROM public.profiles p
                   WHERE p.id = s.owner_id
                     AND COALESCE(p.is_active, true)
                     AND NOT COALESCE(p.is_login_disabled, false));
  -- (b) … and still holds the job type's permission. Resolved from the job
  --     type's allow_rule exactly as fn_ai_enqueue does, but for the OWNER.
  SELECT * INTO t FROM public.ai_job_types WHERE job_type = 'ai_query.chat';
  IF v_ok AND FOUND THEN
    IF t.allow_rule = 'seat_owner' THEN
      v_ok := EXISTS (SELECT 1 FROM public.ai_model_config
                       WHERE feature_key = 'ai_query.natural_language' AND is_active
                         AND COALESCE(config_json->'max_lane_user_ids','[]'::jsonb) ? s.owner_id::text);
    ELSIF t.allow_rule LIKE 'permission:%' THEN
      v_ok := COALESCE(public.user_has_permission(s.owner_id, substring(t.allow_rule from 12)), false);
    ELSE
      v_ok := true;
    END IF;
  END IF;
  IF NOT COALESCE(v_ok, false) THEN
    UPDATE public.ai_query_schedules
       SET active = false, last_status = 'paused_no_access', updated_at = now()
     WHERE id = s.id;
    RETURN jsonb_build_object('ok', false, 'status', 'paused_no_access');
  END IF;

  -- (c) the AI Assistant is switched on
  IF t.job_type IS NULL OR NOT t.enabled THEN
    IF NOT p_run_now THEN
      UPDATE public.ai_query_schedules
         SET next_run_at = v_next, last_status = 'skipped_offline', updated_at = now()
       WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'status', 'skipped_offline', 'next_run_at', v_next);
  END IF;

  -- (d) the per-person daily cap — counted exactly as fn_ai_enqueue counts it
  IF t.daily_cap_per_user IS NOT NULL THEN
    SELECT count(*) INTO v_used FROM public.ai_jobs
     WHERE requested_by = s.owner_id AND job_type = t.job_type AND status <> 'canceled'
       AND (requested_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date;
    IF v_used >= t.daily_cap_per_user THEN
      IF NOT p_run_now THEN
        UPDATE public.ai_query_schedules
           SET next_run_at = v_next, last_status = 'skipped_limit', updated_at = now()
         WHERE id = s.id;
      END IF;
      RETURN jsonb_build_object('ok', false, 'status', 'skipped_limit', 'cap', t.daily_cap_per_user,
                                'used', v_used, 'next_run_at', v_next);
    END IF;
  END IF;

  -- (e) the per-person in-flight cap, under fn_ai_enqueue's own lock key so a
  --     live chat and a scheduled run cannot both slip past it
  PERFORM pg_advisory_xact_lock(hashtext('ai_jobs:' || s.owner_id::text || ':' || t.job_type));
  SELECT count(*) INTO v_inflight FROM public.ai_jobs
   WHERE requested_by = s.owner_id AND job_type = t.job_type AND status IN ('pending','claimed','running');
  IF v_inflight >= t.max_inflight THEN
    -- cron: try again next tick; give the occurrence up once it is 2 hours late
    IF NOT p_run_now AND s.next_run_at < now() - interval '2 hours' THEN
      UPDATE public.ai_query_schedules
         SET next_run_at = v_next, last_status = 'skipped_busy', updated_at = now()
       WHERE id = s.id;
      RETURN jsonb_build_object('ok', false, 'status', 'skipped_busy', 'next_run_at', v_next);
    END IF;
    RETURN jsonb_build_object('ok', false, 'status', 'busy');
  END IF;

  -- priority 200: a person typing in the chat right now is answered first
  INSERT INTO public.ai_jobs (job_type, payload, requested_by, lane, priority)
  VALUES (t.job_type,
          jsonb_build_object('message', s.question, 'conversation_id', NULL,
                             'schedule_id', s.id, 'background', true),
          s.owner_id, t.lane, 200)
  RETURNING id INTO v_job;

  UPDATE public.ai_query_schedules
     SET last_run_at = now(), last_job_id = v_job, last_status = 'queued',
         delivery_attempts = 0, next_run_at = v_next, updated_at = now()
   WHERE id = s.id;

  RETURN jsonb_build_object('ok', true, 'status', 'queued', 'job_id', v_job, 'next_run_at', v_next);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_query_schedule_enqueue_run(uuid, boolean) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_ai_query_schedule_enqueue_run(uuid, boolean) FROM service_role;

-- ── 10. The cron's door: service_role only. ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_enqueue_scheduled(p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $fn$
BEGIN
  RETURN public.fn_ai_query_schedule_enqueue_run(p_schedule_id, false);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_enqueue_scheduled(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_enqueue_scheduled(uuid) TO service_role;

-- ── 11. "Run now": the owner's door, pinned to auth.uid(). ───────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_query_schedule_run_now(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'status', 'UNAUTHORIZED'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_query_schedules WHERE id = p_id AND owner_id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_found');
  END IF;
  RETURN public.fn_ai_query_schedule_enqueue_run(p_id, true);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_query_schedule_run_now(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_query_schedule_run_now(uuid) TO authenticated;

-- ── 12. CLAIM finished runs for delivery (service_role only).
--      Flips queued → delivering for runs whose job has ended, or has not
--      ended within p_timeout_minutes. A timed-out job still PENDING is
--      canceled so it cannot be answered later and never delivered; a job the
--      drain has already claimed is left alone. SKIP LOCKED + the status flip
--      stop two overlapping sweeps from claiming the same run.
--      RECOVERY — nothing is left in 'delivering' or 'queued' for ever:
--        • a run left in 'delivering' for 30+ minutes (the sweep died between
--          claim and record, or the record call failed) goes back to 'queued'
--          ONCE and is claimed again below. The sweep's idempotency keys stop a
--          second copy of anything the first attempt already sent.
--        • stuck in 'delivering' a SECOND time → handed to the sweep with no
--          answer (job_status 'undelivered'), so it counts as a failure.
--        • a 'queued' run whose job row is gone (last_job_id set NULL by the
--          foreign key) → handed over with no answer (job_status 'missing'), so
--          it counts as a failure instead of blocking the schedule.
CREATE OR REPLACE FUNCTION public.fn_ai_query_schedule_claim_deliveries(
  p_limit           int DEFAULT 50,
  p_timeout_minutes int DEFAULT 360
)
RETURNS TABLE(
  schedule_id          uuid,
  owner_id             uuid,
  owner_email          text,
  title                text,
  question             text,
  cadence              text,
  weekday              smallint,
  day_of_month         smallint,
  time_ist             time,
  channels             text[],
  job_id               uuid,
  job_status           text,
  answer               text,
  artifacts            jsonb,
  timed_out            boolean,
  consecutive_failures integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $fn$
#variable_conflict use_column
BEGIN
  -- one retry for a run stuck in 'delivering' (claims 1 and 2 of this run)
  UPDATE public.ai_query_schedules
     SET last_status = 'queued', updated_at = now()
   WHERE last_status = 'delivering'
     AND delivery_attempts < 2
     AND updated_at < now() - interval '30 minutes';

  RETURN QUERY
  WITH cand AS (
    SELECT s.id AS sid,
           j.id AS jid,
           (s.last_status = 'delivering') AS is_stuck,
           (s.last_status = 'queued' AND j.id IS NULL) AS is_missing,
           (s.last_status = 'queued' AND j.id IS NOT NULL
              AND j.status NOT IN ('done','error','canceled')) AS is_late
      FROM public.ai_query_schedules s
      LEFT JOIN public.ai_jobs j ON j.id = s.last_job_id
     WHERE (s.last_status = 'queued'
            AND (j.id IS NULL
                 OR j.status IN ('done','error','canceled')
                 OR j.requested_at < now() - make_interval(mins => GREATEST(p_timeout_minutes, 1))))
        OR (s.last_status = 'delivering' AND s.updated_at < now() - interval '30 minutes')
     ORDER BY s.last_run_at
     LIMIT LEAST(GREATEST(p_limit, 1), 200)
     FOR UPDATE OF s SKIP LOCKED
  ),
  cancel_late AS (
    UPDATE public.ai_jobs j
       SET status = 'canceled', error = 'scheduled run timed out', completed_at = now()
      FROM cand
     WHERE j.id = cand.jid AND cand.is_late AND j.status = 'pending'
    RETURNING j.id
  ),
  claimed AS (
    UPDATE public.ai_query_schedules s
       SET last_status = 'delivering', delivery_attempts = s.delivery_attempts + 1, updated_at = now()
      FROM cand
     WHERE s.id = cand.sid
    RETURNING s.id, s.owner_id, s.title, s.question, s.cadence, s.weekday, s.day_of_month,
              s.time_ist, s.channels, s.last_job_id, s.consecutive_failures,
              cand.is_late, cand.is_stuck, cand.is_missing
  )
  SELECT c.id, c.owner_id, p.email::text, c.title, c.question, c.cadence, c.weekday, c.day_of_month,
         c.time_ist, c.channels, c.last_job_id,
         CASE WHEN c.is_stuck   THEN 'undelivered'
              WHEN c.is_missing THEN 'missing'
              WHEN c.is_late    THEN 'timed_out'
              ELSE j.status END,
         CASE WHEN c.is_stuck OR c.is_missing OR c.is_late OR j.status IS DISTINCT FROM 'done' THEN NULL
              ELSE j.result->>'answer' END,
         CASE WHEN c.is_stuck OR c.is_missing OR c.is_late OR j.status IS DISTINCT FROM 'done' THEN NULL
              ELSE j.result->'artifacts' END,
         c.is_late,
         c.consecutive_failures
    FROM claimed c
    LEFT JOIN public.ai_jobs j ON j.id = c.last_job_id
    LEFT JOIN public.profiles p ON p.id = c.owner_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_query_schedule_claim_deliveries(int, int) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_query_schedule_claim_deliveries(int, int) TO service_role;

-- ── 13. RECORD a claimed run's outcome (service_role only).
--      delivered → failures reset to 0.
--      failed    → failures + 1; the THIRD failure in a row pauses the schedule.
--      Idempotent: only a row still 'delivering' this exact job is touched
--      (a NULL job id matches the 'missing' case from §12).
--      A delivered answer is also stamped delivered_at on its job, so the chat's
--      "while you were away" inbox does not show it a second time.
CREATE OR REPLACE FUNCTION public.fn_ai_query_schedule_record_outcome(
  p_schedule_id uuid,
  p_job_id      uuid,
  p_outcome     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $fn$
DECLARE
  v_failures int;
  v_paused   boolean := false;
BEGIN
  IF p_outcome NOT IN ('delivered','failed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'outcome must be delivered or failed');
  END IF;

  IF p_outcome = 'delivered' THEN
    UPDATE public.ai_query_schedules
       SET last_status = 'delivered', consecutive_failures = 0, updated_at = now()
     WHERE id = p_schedule_id AND last_job_id IS NOT DISTINCT FROM p_job_id AND last_status = 'delivering'
    RETURNING consecutive_failures INTO v_failures;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not claimed'); END IF;
    UPDATE public.ai_jobs SET delivered_at = now() WHERE id = p_job_id AND delivered_at IS NULL;
  ELSE
    UPDATE public.ai_query_schedules
       SET consecutive_failures = consecutive_failures + 1,
           active      = CASE WHEN consecutive_failures + 1 >= 3 THEN false ELSE active END,
           last_status = CASE WHEN consecutive_failures + 1 >= 3 THEN 'paused_failures' ELSE 'failed' END,
           updated_at  = now()
     WHERE id = p_schedule_id AND last_job_id IS NOT DISTINCT FROM p_job_id AND last_status = 'delivering'
    RETURNING consecutive_failures, (last_status = 'paused_failures') INTO v_failures, v_paused;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not claimed'); END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'consecutive_failures', v_failures, 'paused', v_paused);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_query_schedule_record_outcome(uuid, uuid, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_query_schedule_record_outcome(uuid, uuid, text) TO service_role;
