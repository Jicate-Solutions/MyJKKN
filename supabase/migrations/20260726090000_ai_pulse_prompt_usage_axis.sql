-- =====================================================================
-- AI Pulse — Prompt-build USAGE AXIS (closes decision #20's open fork)
-- Created: 2026-07-26
-- =====================================================================
-- THE FORK THIS CLOSES
-- --------------------
-- #2297 (20260723090000_ai_pulse_prompt_graduation.sql) shipped graduation
-- DARK but could only grade on the CHECKLIST SCORE, because a learner build had
-- NO reuse signal. Its own header flagged the open decision, verbatim:
--   "decision #20's bar is 'high usage + passed checklist', but a learner build
--    has NO usage signal ... v1 grades on the CHECKLIST SCORE only ... The usage
--    axis activates once builds gain a reuse signal; the Director sets the
--    definition pre-go-live."
-- This migration gives a build that reuse signal — the compounding half of the
-- moat (staff seed the library, learners grow it, the best-USED prompts rise).
--
-- ONE SPINE, NOT TWO (reconciliation — mandatory pre-build survey done)
-- --------------------------------------------------------------------
-- We do NOT invent a parallel mechanism. This mirrors the proven per-learner
-- usage ledger already in production for library starters —
-- ai_pulse_domain_starter_events (starter_id, profile_id, action IN
-- ('view','copy'), UNIQUE per learner per action, RLS deny-all-direct, writes
-- only via a self-scoped SECURITY DEFINER fn). We add the same shape keyed to a
-- graduated BUILD instead of a starter. "action='copy'" is the same canonical
-- "actually used it" signal the leaderboard already counts for starters.
--
-- WHAT "USED" MEANS (defined here; the flip-runbook doc restates it)
-- -----------------------------------------------------------------
--   used_count = number of DISTINCT PEER learners who copied a graduated build.
-- A peer is a learner in the SAME institution who is NOT the author (a self-copy
-- is not reuse). 'view' is recorded for funnel completeness but is NOT counted
-- as "used". The graduate-by-usage bar is prompt_graduation_usage_min distinct
-- copiers (k, default 3 — the same >=3 relevance/privacy floor used throughout
-- the Domain Starter loop).
--
-- TWO-STAGE, TWO-FLAG ROLLOUT (both the Director's call — NOT flipped here)
-- ------------------------------------------------------------------------
--   Stage 1  prompt_graduation_enabled = true   (already exists, still FALSE)
--            -> checklist graduation runs, graduated prompts surface to peers,
--               and usage recording begins (peers can now copy them).
--   Stage 2  prompt_graduation_by_usage_enabled = true   (NEW, default FALSE)
--            -> builds ALSO graduate at >= prompt_graduation_usage_min copiers.
-- When Stage-2 is off, the graduate fn's result set is BYTE-IDENTICAL to today
-- (the usage OR-branch short-circuits on `false AND ...`). This is what makes
-- activation a genuine, reversible 1-UPDATE (see the flip-runbook doc).
--
-- LOCK DISCIPLINE (house rule, mirrors the whole AI Pulse loop)
-- ------------------------------------------------------------
--   Every RPC = SECURITY DEFINER + SET search_path=public + REVOKE EXECUTE FROM
--   anon, PUBLIC + explicit GRANT. The learner record/read RPCs are self-scoped
--   from auth.uid() and NEVER accept a caller-supplied profile (confused-deputy
--   guard). The cron graduate RPC stays service_role-only. The secdef-anon gate
--   treats CREATE OR REPLACE as new, so REVOKE anon is re-asserted on every fn.
-- =====================================================================

-- ---------------------------------------------------------------------------
-- 1. Config rows (house rule: every switch = a policy row). Both DARK/deferred.
-- ---------------------------------------------------------------------------
INSERT INTO ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type)
VALUES
  ('prompt_graduation_by_usage_enabled',
   'AI Pulse: graduate prompts by peer usage',
   'When on, a learner build ALSO graduates once at least prompt_graduation_usage_min distinct peers have copied it (not only by checklist score). Requires prompt_graduation_enabled. Dark by default — the usage axis is the Director''s pre-go-live call.',
   'false'::jsonb, 'bool'),
  ('prompt_graduation_usage_min',
   'AI Pulse: graduation usage bar (distinct copiers, k)',
   'How many distinct peer learners must copy a graduated build for it to graduate by usage. Mirrors the >=3 relevance/privacy floor used across the Domain Starter loop.',
   '3'::jsonb, 'int')
ON CONFLICT (config_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Reuse ledger (locked). One row per (build, peer, action). Dedup so
--    used_count counts DISTINCT peers. Mirrors ai_pulse_domain_starter_events.
--    profile_id = the PEER who reused it (never the author).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_pulse_prompt_build_uses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id     uuid NOT NULL REFERENCES public.ai_pulse_prompt_builds(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL,
  action       text NOT NULL CHECK (action IN ('view','copy')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (build_id, profile_id, action)          -- one per peer per action
);
ALTER TABLE public.ai_pulse_prompt_build_uses ENABLE ROW LEVEL SECURITY;
-- Deny-all direct (no policy): all writes flow through fn_ai_pulse_record_prompt_build_use
-- (DEFINER, self-scoped); the count is read via the DEFINER read fns below.

CREATE INDEX IF NOT EXISTS idx_ai_pulse_prompt_build_uses_build_action
  ON public.ai_pulse_prompt_build_uses (build_id, action);

-- ---------------------------------------------------------------------------
-- 3. Record RPC — learner-facing (authenticated), anon-locked, self-scoped.
--    Records a reuse ONLY for a graduated, same-institution build the caller did
--    NOT author. Dark-gated on prompt_graduation_enabled (nothing to reuse until
--    graduation is on). Idempotent (ON CONFLICT DO NOTHING). Returns the current
--    distinct-copier count for optimistic UI. profile_id derives from auth.uid()
--    — a caller-supplied id is never trusted (confused-deputy guard).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_record_prompt_build_use(
  p_build_id uuid,
  p_action   text DEFAULT 'copy'
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner uuid;
  v_inst    uuid;
  v_enabled boolean;
  v_action  text;
  v_used    integer;
BEGIN
  -- Dark-gate: usage only accrues once graduation (and the peer surface) is on.
  SELECT COALESCE((value_jsonb)::boolean, false) INTO v_enabled
  FROM ai_pulse_policies WHERE config_key = 'prompt_graduation_enabled' AND is_active LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN 0;  -- dark: no graduated prompts exist to reuse
  END IF;

  v_action := lower(COALESCE(NULLIF(trim(p_action), ''), 'copy'));
  IF v_action NOT IN ('view', 'copy') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  SELECT p.learner_id, p.institution_id INTO v_learner, v_inst
  FROM profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN
    RETURN 0;  -- learners only
  END IF;

  -- Insert only when the target is a graduated, same-institution build authored
  -- by SOMEONE ELSE. If any guard fails the SELECT yields no row -> no insert.
  INSERT INTO ai_pulse_prompt_build_uses (build_id, profile_id, action)
  SELECT b.id, auth.uid(), v_action
  FROM ai_pulse_prompt_builds b
  WHERE b.id = p_build_id
    AND b.graduated_at IS NOT NULL
    AND b.institution_id = v_inst
    AND b.learner_id <> v_learner
  ON CONFLICT (build_id, profile_id, action) DO NOTHING;

  SELECT count(DISTINCT u.profile_id)::int INTO v_used
  FROM ai_pulse_prompt_build_uses u
  WHERE u.build_id = p_build_id AND u.action = 'copy';
  RETURN COALESCE(v_used, 0);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_record_prompt_build_use(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_record_prompt_build_use(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Shared-library read — EXTENDED to feed the "used N times" signal.
--    Adds used_count (distinct peer copiers) to the graduated-prompts surface.
--    Signature change (new OUT column) -> DROP then recreate. Same locks, same
--    strict same-institution scope, still anonymized (prompt + score only).
--    Verified: zero TS callers today (dark surface), so the column add is safe.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_ai_pulse_topic_graduated_prompts(text, uuid, integer);
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_topic_graduated_prompts(
  p_topic_type text,
  p_topic_id   uuid,
  p_limit      integer DEFAULT 3
)
 RETURNS TABLE(id uuid, assembled_prompt text, score numeric, graduated_at timestamptz, used_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner uuid;
  v_inst    uuid;
BEGIN
  SELECT p.learner_id, p.institution_id INTO v_learner, v_inst
  FROM profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN
    RETURN;  -- learners only
  END IF;

  RETURN QUERY
  SELECT b.id,
         b.assembled_prompt,
         (b.grade->>'score')::numeric AS score,
         b.graduated_at,
         COALESCE((
           SELECT count(DISTINCT u.profile_id)
           FROM ai_pulse_prompt_build_uses u
           WHERE u.build_id = b.id AND u.action = 'copy'
         ), 0) AS used_count
  FROM ai_pulse_prompt_builds b
  WHERE b.graduated_at IS NOT NULL
    AND b.topic_type = p_topic_type
    AND b.topic_id = p_topic_id
    AND b.institution_id = v_inst          -- strict same-institution scope
  ORDER BY (b.grade->>'score')::numeric DESC NULLS LAST, b.graduated_at DESC
  LIMIT COALESCE(NULLIF(p_limit, 0), 3);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_topic_graduated_prompts(text, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_topic_graduated_prompts(text, uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Graduate RPC — EXTENDED with the DARK usage axis. CRON/system only.
--    New behaviour is gated on prompt_graduation_by_usage_enabled (default
--    false). When false, the usage OR-branch is `false AND ...` -> the graduated
--    set is BYTE-IDENTICAL to checklist-only v1. When true, a build ALSO
--    graduates at >= prompt_graduation_usage_min distinct copiers. Same
--    signature, so the existing cron (app/api/cron/aipulse-prompt-graduate)
--    exercises it unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_graduate_prompt_builds(p_cycle_id uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled   boolean;
  v_min       numeric;
  v_by_usage  boolean;
  v_usage_min numeric;
  v_count     integer;
BEGIN
  SELECT COALESCE((value_jsonb)::boolean, false) INTO v_enabled
  FROM ai_pulse_policies WHERE config_key = 'prompt_graduation_enabled' AND is_active LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN 0;  -- dark: defense-in-depth even if the cron calls us
  END IF;

  SELECT COALESCE((value_jsonb)::numeric, 80) INTO v_min
  FROM ai_pulse_policies WHERE config_key = 'prompt_graduation_min_score' AND is_active LIMIT 1;
  v_min := COALESCE(v_min, 80);

  -- Usage axis (deferred, dark by default). When off, the OR-branch below is
  -- `false AND ...` -> the WHERE reduces to score>=v_min, IDENTICAL to v1.
  SELECT COALESCE((value_jsonb)::boolean, false) INTO v_by_usage
  FROM ai_pulse_policies WHERE config_key = 'prompt_graduation_by_usage_enabled' AND is_active LIMIT 1;
  v_by_usage := COALESCE(v_by_usage, false);

  SELECT COALESCE((value_jsonb)::numeric, 3) INTO v_usage_min
  FROM ai_pulse_policies WHERE config_key = 'prompt_graduation_usage_min' AND is_active LIMIT 1;
  v_usage_min := COALESCE(v_usage_min, 3);

  WITH upd AS (
    UPDATE ai_pulse_prompt_builds b
    SET graduated_at = now(), updated_at = now()
    WHERE b.graduated_at IS NULL
      AND b.grade_status = 'graded'
      AND b.topic_type IS NOT NULL
      AND b.topic_id IS NOT NULL
      AND (
        COALESCE((b.grade->>'score')::numeric, 0) >= v_min
        OR (
          v_by_usage
          AND (
            SELECT count(DISTINCT u.profile_id)
            FROM ai_pulse_prompt_build_uses u
            WHERE u.build_id = b.id AND u.action = 'copy'
          ) >= v_usage_min
        )
      )
      AND (p_cycle_id IS NULL OR b.cycle_id = p_cycle_id)
    RETURNING 1
  )
  SELECT count(*)::int INTO v_count FROM upd;
  RETURN v_count;
END; $function$;

-- CRON/system only (re-assert: Supabase default-privileges re-grants authenticated
-- on CREATE OR REPLACE; the secdef-anon gate treats this as a new fn).
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_graduate_prompt_builds(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_graduate_prompt_builds(uuid) TO service_role;
