-- =====================================================================
-- AI Pulse — Auto-hide a reported graduated prompt, pending champion review
-- Created: 2026-07-26
-- =====================================================================
-- THE GAP THIS CLOSES
-- -------------------
-- #2426 (20260726034212_ai_pulse_prompt_build_reports.sql) shipped the LEARNER
-- half of build moderation — fn_ai_pulse_report_prompt_build lets a learner FLAG
-- a graduated peer build (one flag per learner per build, dedup'd by
-- UNIQUE(build_id, reporter_profile_id)). #2325's leaderboard shipped the
-- CHAMPION ENFORCEMENT half — fn_ai_pulse_disqualify_prompt_build (permission
-- gated to is_super_admin() OR aiPulse:lab.score).
--
-- What was still missing: a flag did NOTHING to the library until a champion
-- happened to act. Director decision: at N=2 DISTINCT learner flags, auto-hide
-- the prompt from the shared library immediately, pending champion review. The
-- champion keeps final say — CLEAR it back into the library (this migration's new
-- fn_ai_pulse_clear_prompt_build_reports), or DISQUALIFY it (existing fn).
--
-- ONE SPINE, NOT TWO (pre-build survey done)
-- ------------------------------------------
--   * threshold = a policy row (house rule: every switch = a config row), read
--     live by the library read fn — no hard-coded constant.
--   * "distinct flags" reuses the EXISTING ai_pulse_prompt_build_reports ledger;
--     no parallel counting mechanism is invented. UNIQUE(build_id,
--     reporter_profile_id) already means one flag per learner, so distinct
--     reporters == distinct flags.
--   * the champion CLEAR fn mirrors fn_ai_pulse_disqualify_prompt_build exactly
--     (same auth guard, same lock discipline) — a champion CLEARS instead of
--     DISQUALIFIES. "Cleared" is a sticky restore: a champion-vetted build stays
--     visible even if flags later climb again (disqualify is the tool for a
--     build that is actually bad).
--
-- DARK-CONSISTENT
-- ---------------
-- prompt_graduation_enabled is FALSE in prod, so the library read
-- (fn_ai_pulse_topic_graduated_prompts) returns zero rows today and no build can
-- be graduated to be reported. The shared-library card is therefore
-- BYTE-IDENTICAL to now. This migration only changes behaviour once graduation
-- is switched on and >= threshold distinct learners flag a prompt.
--
-- LOCK DISCIPLINE (house rule, mirrors the whole AI Pulse loop)
-- ------------------------------------------------------------
--   Every RPC = SECURITY DEFINER + SET search_path=public + REVOKE EXECUTE FROM
--   anon, PUBLIC + explicit GRANT. The champion CLEAR fn enforces the champion
--   guard at runtime (like disqualify), so it is granted to authenticated (the
--   guard, not the grant, is the gate). The secdef-anon gate treats CREATE OR
--   REPLACE as a new fn, so REVOKE anon is re-asserted on the replaced read fn.
-- =====================================================================

-- ---------------------------------------------------------------------------
-- 1. Config row: the auto-hide threshold (distinct learner flags). Default 2.
--    ai_pulse_policies has a real UNIQUE(config_key) constraint, so ON CONFLICT
--    (config_key) is safe here (verified against the live index).
-- ---------------------------------------------------------------------------
INSERT INTO ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type)
VALUES
  ('prompt_report_autohide_threshold',
   'AI Pulse: auto-hide a reported prompt at N distinct flags',
   'When at least this many DISTINCT learners have flagged a graduated peer prompt, it is auto-hidden from the shared library pending champion review. A champion can clear it back into the library or disqualify it. Default 2.',
   '2'::jsonb, 'int')
ON CONFLICT (config_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. "Champion cleared" state on the build (NULL = not cleared). Once set, the
--    build is restored to the library even at/above the flag threshold, so a
--    champion can vet a false-positive report cluster. Nullable, additive.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_pulse_prompt_builds
  ADD COLUMN IF NOT EXISTS report_cleared_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_cleared_by uuid;

COMMENT ON COLUMN public.ai_pulse_prompt_builds.report_cleared_at IS
  'AI Pulse: when a champion cleared the learner reports on this build, restoring it to the shared library despite >= prompt_report_autohide_threshold distinct flags. NULL = not cleared (auto-hide applies once the threshold is met).';
COMMENT ON COLUMN public.ai_pulse_prompt_builds.report_cleared_by IS
  'AI Pulse: the champion (auth.uid()) who cleared the reports on this build via fn_ai_pulse_clear_prompt_build_reports.';

-- ---------------------------------------------------------------------------
-- 3. Champion CLEAR RPC — restore an auto-hidden build. Same champion guard as
--    fn_ai_pulse_disqualify_prompt_build (super admin OR the lab-scoring/champion
--    permission). Stamps report_cleared_at/by. Locked from anon.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_clear_prompt_build_reports(
    p_build_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (is_super_admin() OR user_has_permission('aiPulse:lab.score')) THEN
        RAISE EXCEPTION 'Not allowed: only a champion can clear reports on a build.' USING ERRCODE = '42501';
    END IF;

    UPDATE ai_pulse_prompt_builds
    SET report_cleared_at = now(),
        report_cleared_by = auth.uid(),
        updated_at        = now()
    WHERE id = p_build_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_clear_prompt_build_reports(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_clear_prompt_build_reports(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Shared-library read — EXCLUDE hidden builds. A graduated build is hidden
--    when EITHER:
--      (a) a champion has DISQUALIFIED it (disqualified_at IS NOT NULL) — the
--          strong "actually bad" verdict; hides independently of flag count and
--          overrides a clear, OR
--      (b) >= prompt_report_autohide_threshold DISTINCT learners have flagged it
--          AND a champion has NOT cleared it (report_cleared_at IS NULL).
--    Signature is UNCHANGED (id, assembled_prompt, score, graduated_at,
--    used_count) — verified live via pg_get_function_result — so CREATE OR
--    REPLACE is sufficient and the sole TS caller (shared-library-service.ts) is
--    untouched. Same locks, same strict same-institution scope.
-- ---------------------------------------------------------------------------
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
  v_learner   uuid;
  v_inst      uuid;
  v_threshold numeric;
BEGIN
  SELECT p.learner_id, p.institution_id INTO v_learner, v_inst
  FROM profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN
    RETURN;  -- learners only
  END IF;

  -- Auto-hide threshold: distinct learner flags at/above which a graduated build
  -- is hidden pending champion review. Default 2 if the policy row is
  -- missing/inactive (defense-in-depth so a deleted row cannot un-hide bad builds).
  SELECT COALESCE((value_jsonb)::numeric, 2) INTO v_threshold
  FROM ai_pulse_policies WHERE config_key = 'prompt_report_autohide_threshold' AND is_active LIMIT 1;
  v_threshold := COALESCE(v_threshold, 2);

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
    -- Champion disqualify: a disqualified build NEVER surfaces, regardless of
    -- flag count or a prior clear (the strong "actually bad" verdict wins).
    AND b.disqualified_at IS NULL
    -- Auto-hide: exclude a build with >= threshold DISTINCT learner flags that a
    -- champion has NOT cleared. UNIQUE(build_id, reporter_profile_id) on the
    -- reports ledger means distinct reporters == distinct flags.
    AND NOT (
      b.report_cleared_at IS NULL
      AND (
        SELECT count(DISTINCT r.reporter_profile_id)
        FROM ai_pulse_prompt_build_reports r
        WHERE r.build_id = b.id
      ) >= v_threshold
    )
  ORDER BY (b.grade->>'score')::numeric DESC NULLS LAST, b.graduated_at DESC
  LIMIT COALESCE(NULLIF(p_limit, 0), 3);
END; $function$;

-- Re-assert the anon lock (Supabase default-privileges re-grants authenticated on
-- CREATE OR REPLACE; the secdef-anon gate treats this replace as a new fn).
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_topic_graduated_prompts(text, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_topic_graduated_prompts(text, uuid, integer) TO authenticated;
