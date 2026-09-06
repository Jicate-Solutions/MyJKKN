-- =====================================================================
-- AI Pulse — AI-rejected prompts get a second look, and a stalled safety
-- check becomes visible  (Director moderation decisions #8 and #10)
-- Created: 2026-08-05
-- =====================================================================
-- ⚠️ NOT APPLIED TO ANY DATABASE. File only — the apply is Director-gated.
--    Rehearsed against production inside BEGIN..ROLLBACK; nothing persisted.
--
-- WHY THIS EXISTS — the very first verdict the checker ever produced was wrong
-- ---------------------------------------------------------------------------
-- Migration 20260804110000 shipped a ₹0 AI safety pre-gate: a learner's prompt
-- build must be judged APPROPRIATE before it can enter the classmates feed. The
-- gate went live 2026-07-30 and has judged exactly ONE build. It REJECTED it:
--
--   build a8d832e5-e8f8-49b6-8e68-ccdc805e847f — a learner practising how to
--   report a lost purse at a police station — safety_status='failed', with the
--   model's stored reasons "role-play as police officer providing
--   legal/procedural advice" and "instructive real-world legal process content
--   not suited for public minor audience".
--
-- That is a false positive BY DESIGN: the safety prompt deliberately instructs
-- the model to answer "not appropriate" whenever it is unsure, because a young
-- audience uses this platform. Over-blocking is the intended failure direction.
-- What was NOT intended is that a 'failed' verdict is a silent dead end — no
-- human can see it, no human can release it, and the author is never told. The
-- system quietly discards legitimate learner work.
--
-- DECISION #8 (verbatim): "AI-rejected prompts: route to a champion for a
-- second look. A safety_status='failed' prompt must appear somewhere a human
-- can release it."
--
-- DECISION #10 (verbatim): "Monitoring: add an admin page for stuck and
-- rejected prompts. Show the count waiting, the count rejected, and the age of
-- the oldest waiting prompt." Why it is not optional: the safety check runs on a
-- */10 cron. If it silently stops, every new build stays 'pending' and simply
-- never appears — and an empty feed is INDISTINGUISHABLE from "nobody is
-- writing prompts". There is no alert and no admin surface today.
--
-- WHAT THIS MIGRATION ADDS — three functions, no schema change
-- -----------------------------------------------------------
--   (1) fn_ai_pulse_champion_safety_queue(p_limit)      READ  — the rejected list
--   (2) fn_ai_pulse_release_prompt_build_safety(p_id)   WRITE — release one
--   (3) fn_ai_pulse_prompt_safety_health()              READ  — cron liveness
--
-- No column is added, no existing function is replaced, and no policy row is
-- touched. safety_status already exists (20260804110000) and 'passed' is already
-- the value the feed read gates on, so a release needs no new state.
--
-- DELIBERATELY NOT TOUCHED (rule #22 — stay in scope)
-- --------------------------------------------------
-- fn_ai_pulse_champion_report_queue keeps its current eligibility filter (any
-- build with >= 1 report, no safety/score/graduation condition). That the filter
-- is that wide is a KNOWN OPEN ITEM the Director has not decided; narrowing it
-- here would be deciding it by hand inside an unrelated migration.
--
-- Nothing here flips a flag. prompt_safety_check_enabled stays true and
-- prompt_classmates_feed_enabled stays false, exactly as decision #12 left them.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) READ — every AI-rejected build awaiting a champion's second look
-- ---------------------------------------------------------------------
-- Guard shape copied EXACTLY from the live fn_ai_pulse_champion_report_queue so
-- the two champion reads cannot drift apart.
--
-- The COALESCE is load-bearing, not decoration: is_super_admin() and
-- user_has_permission() can each return NULL, and NULL OR NULL is NULL, so
-- `NOT (a OR b)` would be NULL, the IF would fall through, and the guard would
-- silently OPEN to every authenticated caller.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_champion_safety_queue(p_limit integer DEFAULT 50)
RETURNS TABLE(
    build_id          uuid,
    assembled_prompt  text,
    score             numeric,
    author_name       text,
    institution_id    uuid,
    safety_reasons    text[],
    safety_checked_at timestamptz,
    created_at        timestamptz
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
    IF NOT COALESCE(is_super_admin() OR user_has_permission('aiPulse:anomaly.review'), false) THEN
        RAISE EXCEPTION 'Not allowed: only a champion can review AI-rejected prompts.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT b.id AS build_id,
           b.assembled_prompt,
           -- The TABLE column is `grade` (a JSONB verdict), not `score`; every
           -- sibling read aliases the number out of it the same way.
           (b.grade->>'score')::numeric AS score,
           NULLIF(btrim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS author_name,
           b.institution_id,
           -- The model's own stored reasons. JSONB columns in this repo may hold
           -- array OR object form, so the type is checked before unnesting —
           -- jsonb_array_elements_text() on an object RAISES, which would take
           -- the whole queue down over one malformed verdict.
           CASE
             WHEN jsonb_typeof(b.safety->'reasons') = 'array'
               THEN ARRAY(SELECT jsonb_array_elements_text(b.safety->'reasons'))
             ELSE ARRAY[]::text[]
           END AS safety_reasons,
           b.safety_checked_at,
           b.created_at
    FROM ai_pulse_prompt_builds b
    -- LEFT, never INNER: a build whose author profile row is missing must still
    -- be reviewable. An INNER join would make exactly the orphaned builds — the
    -- ones nobody can otherwise account for — invisible to the only person who
    -- can release them.
    LEFT JOIN learners_profiles lp ON lp.id = b.learner_id
    WHERE b.safety_status = 'failed'
      AND b.disqualified_at IS NULL      -- a champion already HID it; not a candidate
      AND role_has_institution_access(b.institution_id)
    ORDER BY b.safety_checked_at DESC NULLS LAST, b.id
    LIMIT COALESCE(NULLIF(p_limit, 0), 50);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_champion_safety_queue(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_champion_safety_queue(integer) TO authenticated;


-- ---------------------------------------------------------------------
-- (2) WRITE — a champion releases one AI-rejected build into the feed
-- ---------------------------------------------------------------------
-- WHY THE GATE IS NARROWER THAN THE TWO EXISTING DECISION RPCs
-- -----------------------------------------------------------
-- fn_ai_pulse_disqualify_prompt_build and fn_ai_pulse_clear_prompt_build_reports
-- accept EITHER 'aiPulse:lab.score' OR 'aiPulse:anomaly.review'. This one
-- accepts 'aiPulse:anomaly.review' only, on purpose.
--
-- Measured by value on prod 2026-07-30 (permissions #>> '{key}' = 'true', NOT
-- `permissions ? 'key'` — the `?` operator tests EXISTENCE, so a key stored
-- false reads as held): 'aiPulse:lab.score' is held by faculty (483 members) +
-- hod (102) + school_faculty (1) = 586 staff. 'aiPulse:anomaly.review' is held
-- by the purpose-built ai_pulse_champion role alone, which has 3 members. The
-- widening on those two RPCs exists purely for BACK-COMPATIBILITY: they shipped
-- gated on the scoring key, holders were already using them, and taking it away
-- would have broken live users. A brand-new action carries no such obligation,
-- so it starts where the Director put moderation — with the 3 champions. If it
-- should later be wider, that is a Role Management grant, not a code change.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_release_prompt_build_safety(p_build_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT COALESCE(is_super_admin() OR user_has_permission('aiPulse:anomaly.review'), false) THEN
        RAISE EXCEPTION 'Not allowed: only a champion can release an AI-rejected prompt.' USING ERRCODE = '42501';
    END IF;

    UPDATE ai_pulse_prompt_builds
    SET safety_status = 'passed',
        -- APPEND to the verdict, never overwrite it. The model's `reasons` and
        -- `appropriate:false` must survive so the release is auditable and so a
        -- pattern of over-blocking stays measurable — that record is the only
        -- evidence that the checker is too strict.
        safety        = COALESCE(safety, '{}'::jsonb)
                        || jsonb_build_object('released_by', auth.uid(),
                                              'released_at', now()),
        updated_at    = now()
    WHERE id = p_build_id
      -- Narrowing to 'failed' does two jobs: it makes the action idempotent, and
      -- it refuses to resurrect a build whose status was set by anything other
      -- than an AI rejection.
      AND safety_status = 'failed'
      -- TENANT BOUNDARY (added 2026-07-31, pre-apply review). This function is
      -- SECURITY DEFINER, so RLS is bypassed, and it is GRANTed to every
      -- authenticated caller — the permission check above proves the caller is
      -- SOME institution's champion, never that they are THIS build's champion.
      -- Without this predicate a champion could publish another college's prompt
      -- into that college's feed: a cross-tenant WRITE on a multi-tenant estate.
      -- The read queue and the health RPC in this same file already scope this
      -- way; the write must not be the one surface that does not.
      AND role_has_institution_access(institution_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'That prompt is no longer awaiting release.' USING ERRCODE = 'P0002';
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_release_prompt_build_safety(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_release_prompt_build_safety(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- (3) READ — is the automatic safety check still running?  (decision #10)
-- ---------------------------------------------------------------------
-- This is the ONLY detector for "the */10 cron silently stopped". Its whole
-- purpose is last_checked_at: a timestamp that stops advancing while builds keep
-- arriving is the signal, and there is no other place that signal is visible.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_prompt_safety_health()
RETURNS TABLE(
    waiting_count     bigint,
    rejected_count    bigint,
    passed_count      bigint,
    oldest_waiting_at timestamptz,
    last_checked_at   timestamptz
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
    IF NOT COALESCE(is_super_admin() OR user_has_permission('aiPulse:anomaly.review'), false) THEN
        RAISE EXCEPTION 'Not allowed: only a champion can review AI-rejected prompts.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        -- A NULL safety_status is ALSO un-judged. COALESCE'd rather than
        -- `= 'pending'` so a build the cron never stamped cannot hide from the
        -- one count whose job is to notice it.
        count(*) FILTER (WHERE COALESCE(b.safety_status, 'pending') = 'pending')::bigint AS waiting_count,
        count(*) FILTER (WHERE b.safety_status = 'failed')::bigint                        AS rejected_count,
        count(*) FILTER (WHERE b.safety_status = 'passed')::bigint                        AS passed_count,
        min(b.created_at) FILTER (WHERE COALESCE(b.safety_status, 'pending') = 'pending') AS oldest_waiting_at,
        -- Over ALL rows, not just waiting ones: this is the cron heartbeat.
        max(b.safety_checked_at)                                                         AS last_checked_at
    FROM ai_pulse_prompt_builds b
    WHERE role_has_institution_access(b.institution_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_prompt_safety_health() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_prompt_safety_health() TO authenticated;


COMMENT ON FUNCTION public.fn_ai_pulse_champion_safety_queue(integer) IS
  'Moderation #8: AI-rejected prompt builds (safety_status=failed) awaiting a champion''s second look. Champion-gated, institution-scoped, anon revoked.';
COMMENT ON FUNCTION public.fn_ai_pulse_release_prompt_build_safety(uuid) IS
  'Moderation #8: a champion overturns an AI rejection (failed -> passed). Appends released_by/released_at to safety, keeping the model''s reasons for audit. Narrower gate than the report-queue RPCs by design.';
COMMENT ON FUNCTION public.fn_ai_pulse_prompt_safety_health() IS
  'Moderation #10: waiting/rejected/passed counts plus the safety cron heartbeat (last_checked_at). The only detector for the */10 safety check silently stopping.';
