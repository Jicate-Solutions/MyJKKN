-- 20260804030000_ai_pulse_v2_classmates_copy.sql
-- Created: 2026-07-26 — AI Pulse Star-Library v2, PR B: classmates' prompts + copy path.
-- Spec: specs/ai-pulse-star-library-v2-2026-07-26.md  (Director-locked decisions #5, #6)
-- Depends on PR A (20260804010000_ai_pulse_library_v2_read_by_name.sql) for the
-- programme/course NAME-matching pattern this migration mirrors.
--
-- Two changes, both about letting POPULARITY promote a not-yet-star prompt — a path
-- that is structurally dead today because the copy-counter only accepts already-star
-- (graduated) targets in the same college:
--
--   1. fn_ai_pulse_record_prompt_build_use — the copy/view recorder. Widen the target
--      guard so a copy accrues on a NON-graduated build (drop graduated_at) from ANY
--      college (drop institution_id scope, #6), as long as it is decent (AI score >= 60,
--      the same floor the classmates' feed shows) and NOT self-authored (keep the
--      confused-deputy / self-copy refusal). Return stays = distinct-copier count, which
--      is the "3 distinct learner copies" popularity signal.  [#5, #6]
--
--   2. fn_ai_pulse_topic_peer_prompts — NEW read: the "classmates' prompts" feed. Mirrors
--      PR A's fn_ai_pulse_topic_graduated_prompts NAME-matching (match a subject by NAME
--      across ALL colleges; 'global' shelf by type), but returns NON-graduated builds with
--      score 60..79 (decent-but-not-yet-star), excluding the caller's OWN builds, never a
--      disqualified one, and honouring the same auto-hide-at-N-distinct-flags guard. This
--      is the surface a copy can accrue against.  [#5]
--
-- MODERATION NOTE (spec §"Risk to accept consciously"): this feed shows non-star,
-- ungraded-quality peer prompts campus-wide. The guards are wired here from the start:
--   • score >= 60 floor (AI-graded decent) on BOTH the read and the copy recorder;
--   • existing report -> auto-hide-at-N-distinct-flags -> champion-clear chain applies;
--   • champion-disqualify never surfaces;
--   • popularity needs 3 DISTINCT copiers (not raw copies), cross-college farming harder.
--
-- Unchanged: the top-level prompt_graduation_enabled dark-gate on the copy recorder is
-- kept as-is (Director's kill switch) — copies accrue once the Director turns it on.

-- ============================================================================
-- 1) Copy/view recorder: accept non-graduated, cross-college, score>=60 targets.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_record_prompt_build_use(
  p_build_id uuid, p_action text DEFAULT 'copy'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner uuid;
  v_enabled boolean;
  v_action  text;
  v_used    integer;
BEGIN
  -- Dark-gate: usage only accrues once graduation (and the peer surface) is on.
  SELECT COALESCE((value_jsonb)::boolean, false) INTO v_enabled
  FROM ai_pulse_policies WHERE config_key = 'prompt_graduation_enabled' AND is_active LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN 0;  -- dark: no reuse recorded until graduation is switched on
  END IF;

  v_action := lower(COALESCE(NULLIF(trim(p_action), ''), 'copy'));
  IF v_action NOT IN ('view', 'copy') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  SELECT p.learner_id INTO v_learner
  FROM profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN
    RETURN 0;  -- learners only
  END IF;

  -- Insert only when the target is a build authored by SOMEONE ELSE that is at
  -- least "decent" (AI score >= 60). NO graduated_at requirement (a copy is what
  -- lets a not-yet-star prompt get promoted) and NO institution scope (a copy
  -- from any JKKN college counts toward the 3-distinct-copier bar, #6). If any
  -- guard fails the SELECT yields no row -> no insert.
  INSERT INTO ai_pulse_prompt_build_uses (build_id, profile_id, action)
  SELECT b.id, auth.uid(), v_action
  FROM ai_pulse_prompt_builds b
  WHERE b.id = p_build_id
    AND b.learner_id <> v_learner                       -- self-copy refusal (kept)
    AND (b.grade->>'score')::numeric >= 60              -- quality floor (new)
  ON CONFLICT (build_id, profile_id, action) DO NOTHING;

  SELECT count(DISTINCT u.profile_id)::int INTO v_used
  FROM ai_pulse_prompt_build_uses u
  WHERE u.build_id = p_build_id AND u.action = 'copy';
  RETURN COALESCE(v_used, 0);
END; $function$;

-- secdef-anon gate treats CREATE OR REPLACE as new -> re-assert the lock.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_record_prompt_build_use(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_record_prompt_build_use(uuid, text) TO authenticated;

-- ============================================================================
-- 2) Classmates' prompts feed: non-star peer prompts (score 60..79) by NAME.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_topic_peer_prompts(
  p_topic_type text, p_topic_id uuid, p_limit integer DEFAULT 6)
 RETURNS TABLE(id uuid, assembled_prompt text, score numeric, used_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner   uuid;
  v_threshold numeric;
  v_name      text;                              -- subject name to match (NULL for global)
BEGIN
  -- Identity from the session only (self-scoped; confused-deputy guard).
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
         COALESCE((
           SELECT count(DISTINCT u.profile_id)
           FROM ai_pulse_prompt_build_uses u
           WHERE u.build_id = b.id AND u.action = 'copy'
         ), 0) AS used_count
  FROM ai_pulse_prompt_builds b
  LEFT JOIN programs bpr ON b.topic_type = 'programme' AND bpr.id = b.topic_id
  LEFT JOIN courses  bco ON b.topic_type = 'course'    AND bco.id = b.topic_id
  WHERE b.graduated_at IS NULL                    -- NON-star: not yet graduated
    -- Decent-but-not-yet-star band. >=80 would auto-graduate on quality; this is
    -- the popularity lane where copies (>=3 distinct) can promote it.
    AND (b.grade->>'score')::numeric BETWEEN 60 AND 79
    AND b.learner_id <> v_learner                 -- never the caller's own builds
    -- Match the SAME subject by NAME across ALL colleges (no institution scope). [#2]
    AND (
         (p_topic_type = 'programme' AND b.topic_type = 'programme' AND bpr.program_name = v_name)
      OR (p_topic_type = 'course'    AND b.topic_type = 'course'    AND bco.course_name  = v_name)
      OR (p_topic_type = 'global'    AND b.topic_type = 'global')
    )
    -- Champion disqualify: a disqualified build NEVER surfaces.
    AND b.disqualified_at IS NULL
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
  ORDER BY (b.grade->>'score')::numeric DESC NULLS LAST, b.id
  LIMIT COALESCE(NULLIF(p_limit, 0), 6);
END; $function$;

-- secdef-anon gate treats CREATE OR REPLACE as new -> re-assert the lock.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer) TO authenticated;
