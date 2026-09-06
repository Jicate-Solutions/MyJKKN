-- ===========================================================================
-- AI Pulse — the safety-check health read must tell FOUR states apart, and must
-- stop counting builds that will never be checked as "waiting".
-- Created: 2026-08-13 (allocated slot 20260813070000).
-- Version 20260813030000 was NOT free: it is already claimed in the production
-- ledger by 'fix_people_search_return_type', despite no file carrying it on
-- main or in any open PR. Recording this migration under that version would
-- have collided and made it look applied when it was not. Replaces the reader shipped in
-- 20260805140000_ai_pulse_cron_heartbeat.sql.
-- ===========================================================================
--
-- WHAT WAS WRONG, MEASURED ON PRODUCTION 2026-08-06
--
-- DEFECT 1 — the card could not tell a switched-off checker from a crashed one,
-- and had no name at all for the state the system is ACTUALLY in.
-- The cron (app/api/cron/aipulse-prompt-safety) writes an unconditional
-- heartbeat into ai_pulse_cron_runs every ten minutes. Its latest rows read:
--     {"phase":"done","enabled":true,"skipped":44,"enqueued":0,"recorded":0}
-- That is a fourth state nobody had named: enabled, running on time, and
-- correctly finding nothing it is allowed to act on. The reader returned no
-- signal for the kill switch at all, so "switched off on purpose" and "crashed"
-- were indistinguishable, and "healthy with nothing to do" had no way to say so.
--
-- The heartbeat is written BEFORE the kill-switch return in that route, which
-- makes two facts genuinely independent and worth reporting separately:
--   checker_enabled      is it SUPPOSED to be working
--   checker_last_ran_at  is it BEING INVOKED at all
-- A checker that is off still heartbeats. A checker that is on and silent is
-- broken. Collapsing those two into one banner is what hid the real condition.
--
-- DEFECT 2 — oldest_waiting_at grew without bound on a healthy system.
-- It reported min(created_at) over every safety_status='pending' build. Measured
-- today: 46 pending, oldest created 2026-07-23, i.e. thirteen days and climbing,
-- on a system with nothing whatsoever wrong with it.
--
-- The reason it climbs forever is that the cron never looks at most of them. It
-- only ever picks up FEED CANDIDATES, and its filter is (route, verbatim):
--     safety_status = 'pending'
--     grade_status  = 'graded'
--     graduated_at IS NULL AND disqualified_at IS NULL
--     assembled_prompt IS NOT NULL
--     60 <= score <= 79            (score lives in grade->>'score')
-- Of the 46 pending builds, 44 clear the database half of that filter and every
-- single one is then rejected on the band — their scores run 5 to 58, the
-- highest being 58. They are not late; they are out of scope, permanently, and
-- no amount of waiting will ever change that. The route's own counter agrees:
-- skipped=44 on every run, with the comment "not a feed candidate".
--
-- So oldest_waiting_at is redefined below to consider ONLY builds the checker
-- would actually pick up. The name is kept because it is what the field always
-- claimed to mean; it simply did not mean it. On production today that turns
-- "thirteen days" into NULL, which is the truth.
--
-- WHAT THIS MIGRATION CHANGES
--   ADDS    checker_enabled         the live kill switch (DISABLED is now a state)
--   ADDS    eligible_waiting_count  builds the checker would really pick up
--   CHANGES oldest_waiting_at       eligible-only (was: every pending build)
--   KEEPS   waiting_count           still ALL pending, so the total stays visible
--   KEEPS   rejected_count, passed_count, checker_last_ran_at,
--           last_build_checked_at   byte-identical semantics
--
-- NOT APPLIED BY THIS PR. The Director applies it by hand.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- READ — is the automatic safety check healthy, and what is it doing?
-- ---------------------------------------------------------------------------
-- DROP first, deliberately: this adds two columns to the RETURNS TABLE list and
-- Postgres refuses that with "cannot change return type of existing function".
-- Verified on production 2026-08-06 that nothing else depends on the function —
-- pg_depend reports zero dependent views/rules — and the only callers are
-- lib/services/ai-pulse/champion-report-queue-service.ts and the single admin
-- card it feeds, both updated in this same commit.
DROP FUNCTION IF EXISTS public.fn_ai_pulse_prompt_safety_health();

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_prompt_safety_health()
RETURNS TABLE(
    -- Every pending build, eligible or not. Kept so the admin can still see the
    -- whole backlog; it is NO LONGER the number the alarm is derived from.
    waiting_count          bigint,
    -- The subset the cron would actually act on. This is the queue that matters:
    -- zero here with a fresh heartbeat means healthy-and-idle, not stuck.
    eligible_waiting_count bigint,
    rejected_count         bigint,
    passed_count           bigint,
    -- REDEFINED: oldest ELIGIBLE pending build. NULL when nothing is eligible,
    -- which is the correct reading of "nothing is waiting on the checker".
    oldest_waiting_at      timestamptz,
    -- Is the checker SUPPOSED to be working? The kill switch, read live rather
    -- than inferred from a heartbeat payload, so flipping it shows up at once.
    checker_enabled        boolean,
    -- LIVENESS: is it BEING INVOKED? Written unconditionally by the route, so it
    -- keeps ticking even while the checker is switched off — which is precisely
    -- what lets a reader tell "off on purpose" from "not running at all".
    checker_last_ran_at    timestamptz,
    -- THROUGHPUT: when a build was last stamped. NOT a heartbeat. It freezes
    -- whenever nothing is eligible, and reading it as liveness is the defect
    -- that 20260805140000 removed. Kept, still clearly labelled.
    last_build_checked_at  timestamptz
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
    -- Guard preserved byte-for-byte from 20260805140000. COALESCE is
    -- load-bearing: is_super_admin() and user_has_permission() can each return
    -- NULL, NULL OR NULL is NULL, NOT NULL is NULL, the IF would fall through
    -- and the guard would silently OPEN. This replacement must not relax it.
    IF NOT COALESCE(is_super_admin() OR user_has_permission('aiPulse:anomaly.review'), false) THEN
        RAISE EXCEPTION 'Not allowed: only a champion can review AI-rejected prompts.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH scoped AS (
        SELECT
            b.safety_status,
            b.created_at,
            b.safety_checked_at,
            -- Eligibility mirrors the cron's filter EXACTLY, in the same order,
            -- so this number can never drift from what the route really picks
            -- up. Note safety_status is compared strictly to 'pending' here (not
            -- COALESCE'd): the route uses .eq('safety_status','pending'), which
            -- does NOT match NULL, so a NULL-status build is genuinely one the
            -- checker would skip. It is still counted in waiting_count below,
            -- where noticing it is the whole point.
            COALESCE(
                b.safety_status = 'pending'
                AND b.grade_status = 'graded'
                AND b.graduated_at IS NULL
                AND b.disqualified_at IS NULL
                AND b.assembled_prompt IS NOT NULL
                -- The route computes Number(grade.score) and drops anything not
                -- finite. A bare ::numeric cast would RAISE on one malformed row
                -- and take the entire health card down with it, so the cast is
                -- reached only for shapes that are known to survive it. Today
                -- every row is a jsonb number; the string branch exists so a
                -- future writer storing "65" does not silently fall out of the
                -- count. Anything else yields NULL -> not eligible (fail-closed,
                -- matching the route, which skips a null score).
                AND CASE
                        WHEN jsonb_typeof(b.grade -> 'score') = 'number'
                            THEN (b.grade ->> 'score')::numeric
                        WHEN jsonb_typeof(b.grade -> 'score') = 'string'
                             AND (b.grade ->> 'score') ~ '^\s*-?\d+(\.\d+)?\s*$'
                            THEN (b.grade ->> 'score')::numeric
                        ELSE NULL
                    END BETWEEN 60 AND 79,
                false
            ) AS is_eligible
        FROM ai_pulse_prompt_builds b
        WHERE role_has_institution_access(b.institution_id)
    )
    SELECT
        -- A NULL safety_status is ALSO un-judged, so it is COALESCE'd rather
        -- than compared: a build the cron never stamped must not hide from the
        -- one count whose job is to notice it. Unchanged from 20260805140000.
        count(*) FILTER (WHERE COALESCE(s.safety_status, 'pending') = 'pending')::bigint,
        count(*) FILTER (WHERE s.is_eligible)::bigint,
        count(*) FILTER (WHERE s.safety_status = 'failed')::bigint,
        count(*) FILTER (WHERE s.safety_status = 'passed')::bigint,
        min(s.created_at) FILTER (WHERE s.is_eligible),
        -- The kill switch. bool_or, not a bare scalar subquery: a second active
        -- row for this key would make a scalar subquery RAISE and blank the
        -- whole card, and this read must never be the thing that breaks. The
        -- comparison to 'true'::jsonb mirrors the route's strict `=== true`, so
        -- a mis-typed value reads as OFF rather than accidentally ON. COALESCE
        -- because a missing key must not leave the guard NULL.
        COALESCE(
            (SELECT bool_or(p.value_jsonb = 'true'::jsonb)
               FROM public.ai_pulse_policies p
              WHERE p.config_key = 'prompt_safety_check_enabled'
                AND p.is_active IS TRUE),
            false
        ),
        -- Uncorrelated on purpose: the cron is ONE global process, not an
        -- institution's. It must still return a value when this caller can see
        -- zero builds, and an aggregate over an empty set still yields one row,
        -- so liveness survives a campus with no prompts at all.
        (SELECT max(r.ran_at)
           FROM public.ai_pulse_cron_runs r
          WHERE r.job_key = 'aipulse_prompt_safety'),
        max(s.safety_checked_at)
    FROM scoped s;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_prompt_safety_health() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_prompt_safety_health() TO authenticated;

COMMENT ON FUNCTION public.fn_ai_pulse_prompt_safety_health() IS
  'AI Pulse safety-check health. Returns the counts plus THREE independent signals the admin card needs to name a state: checker_enabled (the live kill switch — "switched off" is not "crashed"), checker_last_ran_at (liveness, from the unconditional ai_pulse_cron_runs heartbeat, which ticks even while the checker is off), and eligible_waiting_count (work the cron would really pick up). oldest_waiting_at is ELIGIBLE-ONLY as of this migration: it previously spanned every pending build, and because the cron only ever touches feed candidates (graded, 60-79, prompt present) it grew without bound — 13 days on a healthy system as measured 2026-08-06, where 44 of 46 pending builds scored 5-58 and would never be picked up at all.';
