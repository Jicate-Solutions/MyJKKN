-- Migration: AI Pulse shared library — hide AI-grouped duplicate prompts
-- Date: 2026-08-04
-- Why: PR #2493 added ai_pulse_prompt_builds.duplicate_of (written by the ₹0 AI-Max
--      dedup job when a newly-graduated prompt expresses the same idea as an existing
--      canonical star). The library READ fn was deliberately left unfiltered so that
--      change would not collide with the v2 all-colleges library wave. This is the
--      1-line follow-up: the shared library now shows only the canonical of a
--      duplicate set.
--
-- Base: the LIVE PROD body of fn_ai_pulse_topic_graduated_prompts (v2 — match the same
--       subject by NAME across ALL colleges + 1-year retire window, PR #2480 /
--       20260804010000_ai_pulse_library_v2_read_by_name.sql). Copied byte-for-byte and
--       changed ONLY by the added `AND b.duplicate_of IS NULL` filter, so this
--       CREATE OR REPLACE cannot silently revert the all-colleges library back to the
--       older institution-scoped form in 20260803040000.
--
-- Signature and return columns are UNCHANGED (text, uuid, integer) ->
-- (id, assembled_prompt, score, graduated_at, used_count), so no TS change is needed.
--
-- Note: the dedup WRITER is still dark (ai_pulse_policies.prompt_dedup_enabled = false),
-- so no build carries duplicate_of yet and the library output is unchanged on apply.

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_topic_graduated_prompts(p_topic_type text, p_topic_id uuid, p_limit integer DEFAULT 3)
 RETURNS TABLE(id uuid, assembled_prompt text, score numeric, graduated_at timestamp with time zone, used_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner   uuid;
  v_threshold numeric;
  v_name      text;                              -- subject name to match (NULL for global)
  v_retain    interval := interval '1 year';     -- retire window (#4)
BEGIN
  -- Identity from the session only (self-scoped; unchanged confused-deputy guard).
  SELECT p.learner_id INTO v_learner FROM profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN
    RETURN;  -- learners only
  END IF;

  SELECT COALESCE((value_jsonb)::numeric, 2) INTO v_threshold
  FROM ai_pulse_policies WHERE config_key = 'prompt_report_autohide_threshold' AND is_active LIMIT 1;
  v_threshold := COALESCE(v_threshold, 2);

  -- Resolve the caller's topic to a SUBJECT NAME. 'global' has no name (matched by type).
  IF p_topic_type = 'programme' THEN
    SELECT pr.program_name INTO v_name FROM programs pr WHERE pr.id = p_topic_id;
  ELSIF p_topic_type = 'course' THEN
    SELECT c.course_name INTO v_name FROM courses c WHERE c.id = p_topic_id;
  ELSIF p_topic_type = 'global' THEN
    v_name := NULL;
  ELSE
    RETURN;  -- unknown topic type
  END IF;

  IF p_topic_type <> 'global' AND v_name IS NULL THEN
    RETURN;  -- topic id didn't resolve to a name -> nothing to match
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
  LEFT JOIN programs bpr ON b.topic_type = 'programme' AND bpr.id = b.topic_id
  LEFT JOIN courses  bco ON b.topic_type = 'course'    AND bco.id = b.topic_id
  WHERE b.graduated_at IS NOT NULL
    -- Match the SAME subject by NAME across ALL colleges (no institution scope). [#2]
    AND (
         (p_topic_type = 'programme' AND b.topic_type = 'programme' AND bpr.program_name = v_name)
      OR (p_topic_type = 'course'    AND b.topic_type = 'course'    AND bco.course_name  = v_name)
      OR (p_topic_type = 'global'    AND b.topic_type = 'global')
    )
    -- Retire after 1 year: read-side hide only; author's graduated_at/credit untouched. [#4]
    AND b.graduated_at > (now() - v_retain)
    -- Champion disqualify: a disqualified build NEVER surfaces.
    AND b.disqualified_at IS NULL
    -- Canonical-only (#2493): duplicate_of IS NULL means THIS build is the
    -- canonical star of its duplicate set; a non-NULL value points at that
    -- canonical. Hiding non-NULL rows shows the best of a duplicate set
    -- instead of five copies of the same idea.
    AND b.duplicate_of IS NULL   -- canonical only: hide AI-grouped near-duplicates (#2493)
    -- Auto-hide: exclude a build with >= threshold DISTINCT learner flags a champion
    -- has NOT cleared (UNIQUE(build_id, reporter_profile_id) => distinct reporters).
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

-- The secdef-anon gate treats CREATE OR REPLACE as a NEW function, and Supabase's
-- default privileges re-grant anon on every new function -> re-assert the lock.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_topic_graduated_prompts(text, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_topic_graduated_prompts(text, uuid, integer) TO authenticated;
