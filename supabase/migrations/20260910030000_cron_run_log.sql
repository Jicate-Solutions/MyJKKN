-- =====================================================================
-- cron_run_log — the static-Vercel-cron lane finally gets a run log,
-- and a repeated failure raises itself instead of waiting to be found.
-- Created: 2026-09-10
-- =====================================================================
-- ⚠️ FILE ONLY — NOT APPLIED TO ANY DATABASE. The apply is Director-gated.
--    Rehearsed against production inside BEGIN..ROLLBACK; nothing persisted.
--
-- THE RECEIPT — two weeks of silence, found by a human going looking
-- ------------------------------------------------------------------
-- /api/cron/aipulse-domain-starter-notify is a STATIC vercel.json cron
-- (schedule "0 14-23 * * 4" — ten fires, every Thursday). On 2026-08-20 it
-- returned HTTP 500 nine times in one window:
--     "targets failed: canceling statement due to statement timeout"
-- It had already failed the same way the Thursday before. Two cohorts of
-- learners — 588 and 635 attendees — got no starter prompt. Nothing anywhere
-- went red, because there is nowhere for a static cron to go red.
--
-- WHY NOTHING CAUGHT IT — the instrumented lanes are the OTHER lanes
-- -----------------------------------------------------------------
-- Three of MyJKKN's four scheduled-work lanes are already logged:
--     ai_jobs                  the typed async job queue        (PR #1998)
--     max_lane_requests        the Max night lane
--     ai_routine_run_log       the dispatcher lane              (20260713020000)
-- and loop-watchdog alarms on the third by reading ai_routine_schedules.
-- last_status. The fourth lane — the 57 cron entries in vercel.json that
-- Vercel fires DIRECTLY at a route, bypassing the dispatcher — has never been
-- instrumented at all. The Loop Tower says so in its own copy, verbatim:
--     "…and static vercel crons (still not instrumented)."
--     (app/(routes)/admin/loops/_components/loop-tower.tsx:1015)
-- That is the lane the failing AI Pulse cron lives in. This migration closes it.
--
-- WHY A NEW TABLE AND NOT ai_routine_run_log — measured, not stylistic
-- -------------------------------------------------------------------
-- Extending the existing log was the first thing tried, and it breaks a live
-- number. app/(routes)/admin/loops/page.tsx:1190-1191 counts ai_routine_run_log
-- rows in a 7-day and a same-IST-day window and renders them as "dispatcher-
-- logged runs". Static crons fire far harder than dispatcher routines — one
-- vercel.json entry alone (meeting-webhooks) fires 30x an hour, 720x a day —
-- so folding this lane in would inflate that count by more than an order of
-- magnitude while silently changing what it MEANS. The two logs also answer
-- different questions: ai_routine_run_log records "the dispatcher fired routine
-- X" (a string status), whereas this one records "the HTTP endpoint ran and
-- came back N" (ok, status_code, duration_ms) — columns that would be
-- permanently NULL for the other two lanes. Separate table, identical security
-- posture and retention shape, no shared reader disturbed.
--
-- RETENTION IS 14 DAYS, NOT THE USUAL 7 — the receipt forces it
-- -------------------------------------------------------------
-- ai_routine_run_log and ai_pulse_cron_runs both prune at 7 days. That is too
-- short HERE, and the reason is the failure this file exists for: the AI Pulse
-- cron runs WEEKLY, so a 7-day window can hold exactly one Thursday and can
-- never show that it failed two Thursdays running. 14 days is the smallest
-- window that can show a weekly job failing twice.
--
-- WHAT "FAILED" MEANS — ok IS NOT TRUE, deliberately, not ok = false
-- -----------------------------------------------------------------
-- A run is opened (INSERT, ok NULL) before the work starts and closed (UPDATE,
-- ok true/false) after it returns. A row still carrying ok IS NULL long after
-- started_at is a run that never came back — a lambda timeout, an OOM, a hard
-- 502. That is a WORSE failure than a clean 500, and it is exactly the shape a
-- statement-timeout can take. So the streak detector counts ok IS NOT TRUE,
-- which covers both, rather than ok = false, which would silently skip the
-- runs that died mid-flight.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) The run log — one row per cron invocation
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cron_run_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_key     text        NOT NULL,
    path        text,
    started_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    duration_ms integer,
    status_code integer,
    ok          boolean,
    error       text,
    meta        jsonb       NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.cron_run_log IS
  'Append-only run log for the static vercel.json cron lane — one row per invocation, opened before the work and closed after it, written best-effort by fn_cron_record_run. Service-role only. This is the fourth and last uninstrumented scheduled-work lane (ai_jobs, max_lane_requests and ai_routine_run_log cover the other three); until 2026-09-10 a static cron could fail every week and nothing anywhere went red.';

COMMENT ON COLUMN public.cron_run_log.job_key IS
  'Which cron wrote the row, e.g. aipulse-domain-starter-notify. Not a foreign key — cron routes are code, not data.';
COMMENT ON COLUMN public.cron_run_log.ok IS
  'NULL = opened and never closed, i.e. the run did not come back (lambda timeout / OOM / hard 502). false = it came back and reported failure. Both are failures: read this column as "ok IS NOT TRUE", never as "ok = false", or every run that died mid-flight is scored as healthy.';
COMMENT ON COLUMN public.cron_run_log.error IS
  'Trimmed error text from the run, capped at 500 characters by the writer. May contain third-party error strings, which is one reason this table is service-role-write and admin-read only.';

-- Deny anon and authenticated at BOTH axes. RLS with zero write policies stops
-- row access; the explicit REVOKE is the separate, easily-missed axis —
-- Supabase's ALTER DEFAULT PRIVILEGES hands anon AND authenticated a direct
-- table grant on every newly created table, independent of RLS.
ALTER TABLE public.cron_run_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cron_run_log FROM anon, authenticated, PUBLIC;
GRANT  ALL ON TABLE public.cron_run_log TO service_role;

-- Read path for a human: super admins / admins only, SELECT only. Writes are
-- exclusively via the SECURITY DEFINER writer below, which bypasses RLS, so
-- there is deliberately no INSERT/UPDATE policy. (Same shape as the admin
-- SELECT policy on ai_routine_run_log, 20260714003000.)
DROP POLICY IF EXISTS cron_run_log_admin_select ON public.cron_run_log;
CREATE POLICY cron_run_log_admin_select ON public.cron_run_log
  FOR SELECT TO authenticated
  USING (COALESCE(is_super_admin() OR is_admin(), false));
-- COALESCE is load-bearing: is_super_admin() and is_admin() can each return
-- NULL, and NULL OR NULL is NULL, which a USING clause treats as "no row" —
-- benign here, but the same expression copied into a write policy would be a
-- silent open. Keep the shape identical everywhere so it never has to be
-- re-reasoned about.

-- Read path 1: the streak scan — newest runs for one job.
CREATE INDEX IF NOT EXISTS idx_cron_run_log_job_started
  ON public.cron_run_log (job_key, started_at DESC);
-- Read path 2: "what is failing right now" across every job. Partial, so it
-- stays tiny on a healthy platform where almost every row is ok = true.
CREATE INDEX IF NOT EXISTS idx_cron_run_log_failures
  ON public.cron_run_log (started_at DESC)
  WHERE ok IS NOT TRUE;


-- ---------------------------------------------------------------------
-- (2) WRITE — a cron records that it ran, and how it ended
-- ---------------------------------------------------------------------
-- Two modes, one function, so one invocation is exactly ONE row:
--   p_run_id IS NULL  -> INSERT an open row (ok NULL), return its id. Called
--                        BEFORE the work, so a run that dies half-way still
--                        leaves proof it started.
--   p_run_id supplied -> CLOSE that row (finished_at, duration_ms, ok,
--                        status_code, error) and return its id.
--
-- GRANTS — service_role only, and NOT authenticated. A heartbeat that any of
-- the platform's ~7,317 logged-in accounts could write is a heartbeat that can
-- be FORGED, and one forged ok=true row ends a failure streak and silences the
-- alarm this whole file exists to raise. Matches fn_ai_routine_record_fire and
-- fn_ai_pulse_record_cron_run exactly.
CREATE OR REPLACE FUNCTION public.fn_cron_record_run(
    p_job_key     text,
    p_path        text    DEFAULT NULL,
    p_run_id      uuid    DEFAULT NULL,
    p_ok          boolean DEFAULT NULL,
    p_status_code integer DEFAULT NULL,
    p_error       text    DEFAULT NULL,
    p_meta        jsonb   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_id uuid;
BEGIN
    IF p_job_key IS NULL OR btrim(p_job_key) = '' THEN
        RETURN NULL;
    END IF;

    -- Best-effort, exactly like the two sibling run logs: a logging failure must
    -- never fail the cron tick it is only observing. It returns NULL instead, and
    -- the caller carries on.
    BEGIN
        IF p_run_id IS NULL THEN
            INSERT INTO public.cron_run_log (job_key, path, meta)
            VALUES (p_job_key, left(p_path, 300), COALESCE(p_meta, '{}'::jsonb))
            RETURNING id INTO v_id;

            -- Rolling 14-day retention, scoped to this job_key (indexed, cheap).
            -- Pruning only ever happens on a write, and the write INSERTs first,
            -- so at least one row always survives: a cron dead for a month still
            -- leaves its last run visible instead of decaying into "no runs yet".
            DELETE FROM public.cron_run_log
             WHERE job_key = p_job_key
               AND started_at < now() - interval '14 days';
        ELSE
            -- duration_ms is derived from the row's OWN started_at rather than
            -- taken from the caller: the caller's clock is a different machine,
            -- and a self-reported duration is the one number a broken run is
            -- least able to report honestly.
            UPDATE public.cron_run_log
               SET finished_at = now(),
                   duration_ms = GREATEST(
                                   0,
                                   (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::integer
                                 ),
                   ok          = p_ok,
                   status_code = p_status_code,
                   error       = left(p_error, 500),
                   meta        = COALESCE(meta, '{}'::jsonb) || COALESCE(p_meta, '{}'::jsonb)
             WHERE id = p_run_id
               AND job_key = p_job_key
            RETURNING id INTO v_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;

    RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cron_record_run(text, text, uuid, boolean, integer, text, jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cron_record_run(text, text, uuid, boolean, integer, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.fn_cron_record_run(text, text, uuid, boolean, integer, text, jsonb) IS
  'Records that a static vercel.json cron ran. INSERTs an OPEN row when p_run_id is NULL (returning the new id) and CLOSES that row otherwise, so one invocation is one row and a run that never comes back is still visible as ok IS NULL. Best-effort — returns NULL rather than raising, because logging must never fail the tick it observes. Service-role only: a forgeable ok=true would end a failure streak and silence the alarm it exists to raise.';


-- ---------------------------------------------------------------------
-- (3) READ — which jobs are failing, consecutively, right now
-- ---------------------------------------------------------------------
-- A "streak" is the run of CONSECUTIVE non-successes ending at a job's most
-- recent run. It resets the moment one run succeeds, which is what makes it
-- safe to alert on: a job that fails once an hour and recovers never pages,
-- while the AI Pulse cron's nine-in-a-row on 2026-08-20 would have crossed a
-- threshold of 3 on its third fire, hours before any learner was affected.
--
-- streak_started_at is returned because it is STABLE for the whole life of a
-- streak. The detector uses it as the notification idempotency key, so one
-- streak raises exactly ONE alert no matter how many times the detector runs —
-- and a job that recovers and breaks again starts a new streak, hence a new
-- key, hence a fresh alert. An alarm that repeats itself every hour trains
-- everyone to ignore it, and is then worth less than no alarm at all.
--
-- Service-role only, like the writer. There is no UI for this yet, so granting
-- it to `authenticated` would open a new surface to ~7,317 accounts for nobody's
-- benefit — and `error` can carry raw third-party error text. A human admin
-- already has a read path: the admin SELECT policy on the table itself.
CREATE OR REPLACE FUNCTION public.fn_cron_failure_streaks(
    p_min_streak      integer DEFAULT 3,
    p_lookback_hours  integer DEFAULT 336   -- 14 days = the retention window
)
RETURNS TABLE(
    job_key          text,
    path             text,
    streak_length    integer,
    streak_started_at timestamptz,
    last_failure_at  timestamptz,
    last_status_code integer,
    last_error       text,
    runs_in_window   integer,
    failures_in_window integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_min      integer := GREATEST(COALESCE(p_min_streak, 3), 1);
    v_lookback integer := GREATEST(COALESCE(p_lookback_hours, 336), 1);
BEGIN
    RETURN QUERY
    WITH win AS (
        SELECT l.job_key, l.path, l.started_at, l.ok, l.status_code, l.error
          FROM public.cron_run_log l
         WHERE l.started_at >= now() - make_interval(hours => v_lookback)
           -- An OPEN row from the run happening right now is not yet a failure;
           -- excluding it stops the detector scoring its own in-flight tick, and
           -- a genuinely-hung run is still caught once it ages past the grace.
           AND NOT (l.ok IS NULL AND l.started_at > now() - interval '15 minutes')
    ),
    ranked AS (
        SELECT w.*, row_number() OVER (PARTITION BY w.job_key ORDER BY w.started_at DESC) AS rn
          FROM win w
    ),
    agg AS (
        SELECT r.job_key,
               min(r.rn) FILTER (WHERE r.ok IS TRUE) AS first_ok_rn,
               count(*)::integer                     AS runs,
               count(*) FILTER (WHERE r.ok IS NOT TRUE)::integer AS failures
          FROM ranked r
         GROUP BY r.job_key
    ),
    streak AS (
        -- Leading non-successes = (position of newest success) - 1; if the whole
        -- window is failures there is no success to stop at, so the streak is the
        -- entire window.
        SELECT a.job_key,
               COALESCE(a.first_ok_rn - 1, a.runs)::integer AS len,
               a.runs,
               a.failures
          FROM agg a
    )
    SELECT s.job_key,
           newest.path,
           s.len,
           oldest.started_at,
           newest.started_at,
           newest.status_code,
           newest.error,
           s.runs,
           s.failures
      FROM streak s
      JOIN ranked newest ON newest.job_key = s.job_key AND newest.rn = 1
      JOIN ranked oldest ON oldest.job_key = s.job_key AND oldest.rn = s.len
     WHERE s.len >= v_min
     ORDER BY s.len DESC, newest.started_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cron_failure_streaks(integer, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cron_failure_streaks(integer, integer) TO service_role;

COMMENT ON FUNCTION public.fn_cron_failure_streaks(integer, integer) IS
  'Jobs in cron_run_log whose most recent runs are a streak of >= p_min_streak consecutive non-successes (ok IS NOT TRUE, so a run that never came back counts). streak_started_at is stable for the life of the streak and is the detector''s notification idempotency key, so one streak raises exactly one alert. Service-role only.';


-- ---------------------------------------------------------------------
-- (4) CONFIG — how many consecutive failures before it pages
-- ---------------------------------------------------------------------
-- Every policy decision is a config row (docs/architecture/config-table-pattern.md).
-- Two shape traps in this table, both hit before:
--   * the unique index is an EXPRESSION index, so a bare ON CONFLICT (policy_key)
--     raises 42P10 — the conflict target must be spelled out exactly as below;
--   * data_type has no 'integer' in its CHECK — the numeric type is 'number'.
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, classification, publication_state, is_active, description)
VALUES
  ('platform_ops.cron_failure_alert_streak', 'global', '3'::jsonb, 'number', 'major', 'published', true,
   'How many CONSECUTIVE non-successful runs a scheduled job must record in cron_run_log before /api/cron/cron-failure-alerts raises a bell notification to super admins. 3 is chosen against the receipt: /api/cron/aipulse-domain-starter-notify fires ten times each Thursday and returned HTTP 500 nine times in a row on 2026-08-20, so a threshold of 3 pages on the third fire — early enough to act within the same window — while still absorbing a single transient failure without noise.')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;


-- ---------------------------------------------------------------------
-- (5) SELF-ASSERTION — prove the grants, do not describe them
-- ---------------------------------------------------------------------
-- has_function_privilege / has_table_privilege report the EFFECTIVE privilege,
-- which is the only thing that matters: `anon` is a MEMBER of PUBLIC, so an ACL
-- string can read as revoked while anon still holds the grant through PUBLIC.
-- Reading the ACL text has produced exactly that false clean bill before. This
-- block RAISEs — never NOTICEs — so running the file against a database where a
-- grant leaked aborts the migration instead of reporting success.
DO $assert$
BEGIN
    IF has_function_privilege('anon', 'public.fn_cron_record_run(text, text, uuid, boolean, integer, text, jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_cron_record_run(text, text, uuid, boolean, integer, text, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_cron_record_run is still executable by anon or authenticated — a forgeable heartbeat silences the alarm';
    END IF;

    IF has_function_privilege('anon', 'public.fn_cron_failure_streaks(integer, integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_cron_failure_streaks(integer, integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_cron_failure_streaks is still executable by anon or authenticated';
    END IF;

    IF has_table_privilege('anon', 'public.cron_run_log', 'SELECT')
       OR has_table_privilege('anon', 'public.cron_run_log', 'INSERT') THEN
        RAISE EXCEPTION 'anon still holds a direct table grant on cron_run_log (Supabase default privileges)';
    END IF;

    IF has_table_privilege('authenticated', 'public.cron_run_log', 'INSERT')
       OR has_table_privilege('authenticated', 'public.cron_run_log', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.cron_run_log', 'DELETE') THEN
        RAISE EXCEPTION 'authenticated can still write cron_run_log directly';
    END IF;

    IF NOT has_function_privilege('service_role', 'public.fn_cron_record_run(text, text, uuid, boolean, integer, text, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role cannot execute fn_cron_record_run — nothing would ever be logged';
    END IF;
END
$assert$;
