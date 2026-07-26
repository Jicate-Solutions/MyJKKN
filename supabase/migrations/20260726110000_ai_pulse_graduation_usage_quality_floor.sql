-- =====================================================================
-- AI Pulse — Prompt-build USAGE AXIS gets a QUALITY FLOOR
-- Created: 2026-07-26
-- =====================================================================
-- THE HOLE THIS CLOSES (Director decision)
-- ----------------------------------------
-- 20260726090000_ai_pulse_prompt_usage_axis.sql added the second graduation
-- path: a build ALSO graduates once >= prompt_graduation_usage_min (k, default 3)
-- distinct PEER learners copy it. But that usage branch checked ONLY the copier
-- count — it IGNORED quality entirely. A friend-group could farm graduations by
-- each copying a low-quality prompt: 3 copies of junk => graduated, even though
-- the checklist score is far below the 80 bar. "A prompt must be GOOD AND copied
-- to graduate by popularity."
--
-- THE FIX (surgical, one branch)
-- ------------------------------
-- Add a DECENCY FLOOR to the usage branch only:
--   prompt_graduation_usage_min_score  (int, default 60)
-- The usage path now requires BOTH a passing-enough quality score AND enough
-- distinct copiers. The floor (60) sits strictly BELOW the checklist bar (80) on
-- purpose: the usage path exists so a decent-but-not-top prompt can prove itself
-- through real peer reuse — but a BAD prompt (below the floor) can never be
-- farmed to graduation no matter how many friends copy it.
--
--   checklist path (UNCHANGED):  score >= prompt_graduation_min_score (80)
--   usage path (this change):    by_usage_enabled
--                                AND score >= prompt_graduation_usage_min_score (60)
--                                AND distinct_copiers >= prompt_graduation_usage_min (3)
--
-- BYTE-IDENTICAL WHEN DARK (default)
-- ---------------------------------
-- prompt_graduation_by_usage_enabled is FALSE by default (still dark). When it
-- is false the entire usage branch short-circuits on `false AND ...`, so the
-- graduated set is BYTE-IDENTICAL to today — this migration changes NOTHING in
-- production until the Director flips the usage flag. The checklist branch is
-- untouched. Activation stays a genuine, reversible 1-UPDATE.
--
-- LOCK DISCIPLINE (house rule, unchanged)
-- ---------------------------------------
-- The cron graduate RPC stays service_role-only. The secdef-anon gate treats
-- CREATE OR REPLACE as a NEW function, so REVOKE EXECUTE FROM anon, authenticated,
-- PUBLIC + GRANT service_role is re-asserted below on every redefinition.
-- =====================================================================

-- ---------------------------------------------------------------------------
-- 1. Config row (house rule: every switch = a policy row). The quality FLOOR for
--    the usage path. Default 60 — a decency floor strictly BELOW the 80 checklist
--    bar. Not a flag; a threshold that always applies once the usage path is on.
-- ---------------------------------------------------------------------------
INSERT INTO ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type)
VALUES
  ('prompt_graduation_usage_min_score',
   'AI Pulse: graduation-by-usage quality floor (min score)',
   'Minimum checklist score a build must also reach to graduate via the peer-usage path (in addition to prompt_graduation_usage_min distinct copiers). Default 60 — a decency floor strictly BELOW the 80 checklist bar, so the usage path can graduate a decent-but-not-top prompt that proves itself through real reuse, while a BAD prompt can never be farmed to graduation by a friend-group copying it. Applies only when prompt_graduation_by_usage_enabled is on.',
   '60'::jsonb, 'int')
ON CONFLICT (config_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Graduate RPC — usage branch gains the quality FLOOR + disqualification guard.
--    CRON/system only. Two changes:
--      (a) the usage OR-branch now requires score >= v_usage_min_score IN ADDITION
--          TO the distinct-copier bar (the friend-group farming fix); and
--      (b) `AND b.disqualified_at IS NULL` is added to the UPDATE's WHERE clause so
--          a champion-DISQUALIFIED build never graduates by EITHER path — closing a
--          latent hole where a score>=80 build that had been disqualified could
--          still be re-graduated by the cron.
--    The checklist branch (score >= v_min) is otherwise UNCHANGED. When
--    prompt_graduation_by_usage_enabled is false the usage branch is `false AND ...`
--    -> the WHERE reduces to (score>=v_min AND disqualified_at IS NULL). Same
--    signature, so the existing cron exercises it unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_graduate_prompt_builds(p_cycle_id uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled         boolean;
  v_min             numeric;
  v_by_usage        boolean;
  v_usage_min       numeric;
  v_usage_min_score numeric;
  v_count           integer;
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

  -- Quality FLOOR for the usage path (decency bar, strictly below v_min). A build
  -- must ALSO clear this score to graduate by usage — stops a friend-group farming
  -- graduations by copying a low-quality prompt. Default 60.
  SELECT COALESCE((value_jsonb)::numeric, 60) INTO v_usage_min_score
  FROM ai_pulse_policies WHERE config_key = 'prompt_graduation_usage_min_score' AND is_active LIMIT 1;
  v_usage_min_score := COALESCE(v_usage_min_score, 60);

  WITH upd AS (
    UPDATE ai_pulse_prompt_builds b
    SET graduated_at = now(), updated_at = now()
    WHERE b.graduated_at IS NULL
      AND b.disqualified_at IS NULL          -- champion-disqualified builds never graduate (either path)
      AND b.grade_status = 'graded'
      AND b.topic_type IS NOT NULL
      AND b.topic_id IS NOT NULL
      AND (
        COALESCE((b.grade->>'score')::numeric, 0) >= v_min
        OR (
          v_by_usage
          AND COALESCE((b.grade->>'score')::numeric, 0) >= v_usage_min_score
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
