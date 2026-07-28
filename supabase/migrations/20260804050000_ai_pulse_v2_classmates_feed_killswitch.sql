-- 20260804050000_ai_pulse_v2_classmates_feed_killswitch.sql
-- Created: 2026-07-27 — Safeguarding gate for the classmates' prompts feed (PR B, #2492).
--
-- The classmates feed (fn_ai_pulse_topic_peer_prompts) surfaces UNGRADED-quality peer
-- prompts campus-wide, and the AI grader scores prompt CRAFT, not content safety. At an
-- institution that includes minors, a well-structured but inappropriate prompt could
-- score >=60 and surface with only reactive (2-flag) moderation. This adds a master
-- kill switch: the feed is DARK by default and the Director flips
-- 'prompt_classmates_feed_enabled' to turn it on. Per-item guards (>=60 floor,
-- distinct-copier, champion-disqualify, auto-hide-at-N-flags) still apply once on.
--
-- Already APPLIED to prod 2026-07-27 as a safeguarding measure; this migration
-- reconciles the codebase with prod (dark feature's kill switch must gate the READ).

INSERT INTO ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type, is_active)
SELECT 'prompt_classmates_feed_enabled', 'Classmates prompt feed',
       'When on, learners see a campus-wide feed of decent (60-79) non-star peer prompts to copy. Dark by default (safeguarding: ungraded content, institution includes minors).',
       'false'::jsonb, 'bool', true
WHERE NOT EXISTS (SELECT 1 FROM ai_pulse_policies WHERE config_key = 'prompt_classmates_feed_enabled');

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_topic_peer_prompts(p_topic_type text, p_topic_id uuid, p_limit integer DEFAULT 6)
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

  -- Kill switch (safeguarding): campus-wide feed of UNGRADED-quality peer prompts;
  -- the AI grader scores craft, not content safety. Dark by default; the Director
  -- flips 'prompt_classmates_feed_enabled' to turn it on. Per-item guards still apply.
  IF NOT COALESCE((SELECT (value_jsonb)::boolean FROM ai_pulse_policies
                   WHERE config_key = 'prompt_classmates_feed_enabled' AND is_active LIMIT 1), false) THEN
    RETURN;
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
END; $function$
;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer) TO authenticated;
