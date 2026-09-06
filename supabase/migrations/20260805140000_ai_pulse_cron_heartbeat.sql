-- =====================================================================
-- AI Pulse — the stalled-safety-check warning watches a RUNNER HEARTBEAT,
-- not a data timestamp  (Director decision #2, 2026-07-30)
-- Created: 2026-08-05
-- =====================================================================
-- NOT APPLIED TO ANY DATABASE. File only — the apply is Director-gated.
--    Rehearsed against production inside BEGIN..ROLLBACK; nothing persisted.
--
-- THE DEFECT THIS FIXES — a permanent red alarm on a healthy system
-- -----------------------------------------------------------------
-- Migration 20260805100000 (the migration immediately before this one, in the
-- same PR) shipped fn_ai_pulse_prompt_safety_health(), whose last_checked_at is
-- max(safety_checked_at) across ai_pulse_prompt_builds. The admin card warns
-- when that value is older than its threshold.
--
-- Measured on production 2026-07-30 16:46 UTC:
--     max(safety_checked_at) = 2026-07-30 10:49:16 UTC   -> 357 minutes stale
--     prompt_safety_check_enabled                        =  true
--     builds still awaiting a verdict                    =  10
--     of those, builds the cron is ELIGIBLE to pick up   =   0
--
-- Zero eligible builds is the whole story. The cron submits only builds that
-- are grade_status='graded', non-graduated, non-disqualified AND scored 60-79.
-- Nothing currently pending meets that, so there is nothing left for the cron to
-- stamp, so safety_checked_at CANNOT advance — ever. The warning therefore fires
-- forever while /api/cron/aipulse-prompt-safety runs correctly every ten minutes.
--
-- ROOT CAUSE IS THE SIGNAL, NOT THE THRESHOLD
-- -------------------------------------------
-- max(safety_checked_at) measures "when was a build last stamped" — throughput.
-- The warning needs "when did the checker last run" — liveness. A healthy cron
-- that correctly finds nothing to do stamps nothing, and therefore looks dead.
-- Raising the threshold from 30 minutes to 60, or to a day, only postpones the
-- identical false alarm; at 357 minutes and climbing it is already past any
-- threshold anyone would pick. This is the same failure shape as the Max-lane
-- restart alert that was built on heartbeats which had themselves frozen: an
-- alarm wired to a signal that stops moving for a benign reason trains everyone
-- to ignore it, and is then worth less than no alarm at all.
--
-- THE FIX — the checker leaves a note every time it runs; the warning reads it
-- ---------------------------------------------------------------------------
--   (1) ai_pulse_cron_runs                       append-only run log, one row
--                                                per cron invocation
--   (2) fn_ai_pulse_record_cron_run(...)         the writer the cron calls
--   (3) fn_ai_pulse_prompt_safety_health()       REPLACED: liveness now comes
--                                                from (1); build-stamping is
--                                                reported separately
--
-- Both timestamps are kept and both are shown, because they answer different
-- questions and a human needs both to tell a stalled cron from a quiet week:
--   checker_last_ran_at    the cron is alive          (liveness)
--   last_build_checked_at  work is flowing through it (throughput)
--
-- PATTERN COPIED, NOT INVENTED
-- ----------------------------
-- This is the shape of public.ai_routine_run_log and its writer
-- fn_ai_routine_record_fire (migrations 20260713020000 and 20260714003000),
-- verified against the LIVE catalog on 2026-07-30 rather than read from a repo
-- file: the live table carries relrowsecurity = true with table privileges
-- granted to postgres and service_role only, and the live writer is SECURITY
-- DEFINER with EXECUTE granted to postgres and service_role only. Its caller,
-- app/api/cron/ai-routine-dispatcher/route.ts, invokes it as
-- admin.rpc('fn_ai_routine_record_fire', ...) on a service-role client — exactly
-- how the safety cron will call the writer below. Same table shape, same
-- security posture, same best-effort INSERT-then-prune body, same call style.
--
-- SCOPE (rule #22). The release RPC, the champion safety queue, and the
-- permission gates shipped by 20260805100000 are NOT touched — they were
-- verified and are correct. The counts returned by the health function are
-- unchanged. Nothing here flips a flag: prompt_safety_check_enabled stays true
-- and prompt_classmates_feed_enabled stays false.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) The run log — one row per cron invocation
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_pulse_cron_runs (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_key  text        NOT NULL,
    ran_at   timestamptz NOT NULL DEFAULT now(),
    outcome  jsonb
);

COMMENT ON TABLE public.ai_pulse_cron_runs IS
  'Append-only run log for AI Pulse cron routes — one row per invocation, written best-effort by fn_ai_pulse_record_cron_run. Service-role only. This is the LIVENESS signal behind the stalled-safety-check warning: a healthy cron that correctly finds nothing to do stamps no build, so max(safety_checked_at) is not a heartbeat and must never be used as one.';

COMMENT ON COLUMN public.ai_pulse_cron_runs.job_key IS
  'Which cron wrote the row, e.g. aipulse_prompt_safety. Not a foreign key — cron routes are code, not data.';
COMMENT ON COLUMN public.ai_pulse_cron_runs.outcome IS
  'Small summary of the run: enabled, plus recorded/enqueued/skipped once the run finishes. A row whose outcome never reaches phase=done is a run that died part-way, which is itself worth seeing.';

-- Deny anon and authenticated at BOTH axes. RLS with zero policies stops row
-- access; the explicit REVOKE is the separate, and easily-missed, axis —
-- Supabase's ALTER DEFAULT PRIVILEGES hands anon AND authenticated a direct
-- table grant on every newly created table, independent of RLS.
ALTER TABLE public.ai_pulse_cron_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_pulse_cron_runs FROM anon, authenticated, PUBLIC;
GRANT  ALL ON TABLE public.ai_pulse_cron_runs TO service_role;

-- The only read path: newest run for one job_key.
CREATE INDEX IF NOT EXISTS idx_ai_pulse_cron_runs_job_ran
  ON public.ai_pulse_cron_runs (job_key, ran_at DESC);


-- ---------------------------------------------------------------------
-- (2) WRITE — the cron records that it ran
-- ---------------------------------------------------------------------
-- Two modes, one function, so a run is ONE row:
--   p_run_id IS NULL  -> INSERT a new row, return its id. Called EARLY, before
--                        the cron can take any early exit, so a run that dies
--                        half-way still proves the checker was alive.
--   p_run_id supplied -> MERGE p_outcome into that row's outcome and return its
--                        id. Called at the end with the counts.
--
-- GRANTS — deliberately NOT granted to authenticated, unlike every other
-- function in this PR. A heartbeat that any of the platform's ~7,000 logged-in
-- accounts could write is a heartbeat that can be FORGED, and one forged row
-- silences the stalled-cron alarm permanently — which is the precise failure
-- this migration exists to remove. The writer is therefore service-role only,
-- matching fn_ai_routine_record_fire's live grants exactly. The health READ
-- below is the authenticated-facing surface, and it is read-only.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_record_cron_run(
    p_job_key text,
    p_outcome jsonb DEFAULT '{}'::jsonb,
    p_run_id  uuid  DEFAULT NULL
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

    -- Best-effort, exactly like the dispatcher's run log: a logging failure must
    -- never fail the cron tick it is only observing. It returns NULL instead, and
    -- the caller logs it.
    BEGIN
        IF p_run_id IS NULL THEN
            INSERT INTO public.ai_pulse_cron_runs (job_key, outcome)
            VALUES (p_job_key, COALESCE(p_outcome, '{}'::jsonb))
            RETURNING id INTO v_id;

            -- Rolling 7-day retention, scoped to this job_key (indexed, cheap) —
            -- copied from fn_ai_routine_record_fire. Pruning only ever happens on
            -- a write, and the write INSERTs first, so at least one row always
            -- survives. A cron dead for a month therefore still leaves its last
            -- run visible, and the warning keeps firing instead of decaying into
            -- "no runs recorded yet".
            DELETE FROM public.ai_pulse_cron_runs
             WHERE job_key = p_job_key
               AND ran_at  < now() - interval '7 days';
        ELSE
            UPDATE public.ai_pulse_cron_runs
               SET outcome = COALESCE(outcome, '{}'::jsonb) || COALESCE(p_outcome, '{}'::jsonb)
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

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_record_cron_run(text, jsonb, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_record_cron_run(text, jsonb, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_ai_pulse_record_cron_run(text, jsonb, uuid) IS
  'Decision #2: records that an AI Pulse cron ran. INSERTs when p_run_id is NULL (returning the new id) and merges into that row otherwise, so one invocation is one row. Best-effort — returns NULL rather than raising, because logging must never fail the tick it observes. Service-role only: a forgeable heartbeat would silence the alarm it exists to raise.';


-- ---------------------------------------------------------------------
-- (3) READ — is the automatic safety check still running?  (REPLACED)
-- ---------------------------------------------------------------------
-- DROP first, deliberately, and NOT a bare CREATE OR REPLACE: this adds a column
-- to the RETURNS TABLE list, and Postgres rejects that with "cannot change
-- return type of existing function". On production today the function does not
-- exist at all (confirmed: to_regprocedure(...) IS NULL — 20260805100000 has not
-- been applied), but these two migrations apply in filename order, so by the time
-- this file runs the five-column version WILL exist and a plain replace would
-- abort the whole migration.
--
-- Nothing depends on this function outside the PR that introduced it: the only
-- callers are lib/services/ai-pulse/champion-report-queue-service.ts and the one
-- admin card it feeds, both updated in the same commit as this file.
DROP FUNCTION IF EXISTS public.fn_ai_pulse_prompt_safety_health();

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_prompt_safety_health()
RETURNS TABLE(
    waiting_count         bigint,
    rejected_count        bigint,
    passed_count          bigint,
    oldest_waiting_at     timestamptz,
    -- LIVENESS: when the checker itself last ran. NULL means no run has ever
    -- been recorded — on first deploy the log is legitimately empty, and the UI
    -- must read that as "not observed yet", never as an alarm.
    checker_last_ran_at   timestamptz,
    -- THROUGHPUT: when a build was last stamped. Useful, but NOT a heartbeat —
    -- reading it as one is the defect this migration removes.
    last_build_checked_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    -- COALESCE is load-bearing: is_super_admin() and user_has_permission() can
    -- each return NULL, NULL OR NULL is NULL, so NOT (a OR b) would be NULL, the
    -- IF would fall through, and the guard would silently OPEN. Byte-identical to
    -- the guard shipped in 20260805100000 — this replace must not relax it.
    IF NOT COALESCE(is_super_admin() OR user_has_permission('aiPulse:anomaly.review'), false) THEN
        RAISE EXCEPTION 'Not allowed: only a champion can review AI-rejected prompts.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        -- Counts unchanged from 20260805100000. A NULL safety_status is ALSO
        -- un-judged, so it is COALESCE'd rather than compared to 'pending' —
        -- a build the cron never stamped must not hide from the one count whose
        -- job is to notice it.
        count(*) FILTER (WHERE COALESCE(b.safety_status, 'pending') = 'pending')::bigint AS waiting_count,
        count(*) FILTER (WHERE b.safety_status = 'failed')::bigint                        AS rejected_count,
        count(*) FILTER (WHERE b.safety_status = 'passed')::bigint                        AS passed_count,
        min(b.created_at) FILTER (WHERE COALESCE(b.safety_status, 'pending') = 'pending') AS oldest_waiting_at,
        -- The heartbeat. Uncorrelated scalar subquery on purpose: it is NOT
        -- institution-scoped, because the cron is one global process, and it must
        -- still return a value when this caller can see zero builds. An aggregate
        -- query over an empty set still yields exactly one row, so the liveness
        -- signal survives a campus with no prompts at all.
        (SELECT max(r.ran_at)
           FROM public.ai_pulse_cron_runs r
          WHERE r.job_key = 'aipulse_prompt_safety')                                      AS checker_last_ran_at,
        max(b.safety_checked_at)                                                          AS last_build_checked_at
    FROM ai_pulse_prompt_builds b
    WHERE role_has_institution_access(b.institution_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_prompt_safety_health() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_prompt_safety_health() TO authenticated;

COMMENT ON FUNCTION public.fn_ai_pulse_prompt_safety_health() IS
  'Moderation #10 + decision #2: waiting/rejected/passed counts, the age of the oldest waiting prompt, and TWO distinct timestamps — checker_last_ran_at (liveness, from ai_pulse_cron_runs) and last_build_checked_at (throughput, max(safety_checked_at)). Only the first is a heartbeat; the second stops advancing whenever no build is eligible, which on 2026-07-30 produced a permanent false "the check has stopped" alarm on a cron that was running correctly.';
