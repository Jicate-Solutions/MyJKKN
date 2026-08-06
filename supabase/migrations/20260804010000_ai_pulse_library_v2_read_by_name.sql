-- 20260804010000_ai_pulse_library_v2_read_by_name.sql
-- Created: 2026-07-26 — AI Pulse Star-Library v2, foundation read (Director-locked).
-- Spec: specs/ai-pulse-star-library-v2-2026-07-26.md
--
-- Rewrites the shared-library read so a graduated ("star") prompt is matched by its
-- subject NAME across ALL colleges, not by the per-college programme UUID. Reasons:
--   • The same subject is a different programme row per college (and can even be
--     duplicated within one college — B.E. ECE is 2 rows, 193 + 63 learners — so the
--     193 never saw the 63's star). Matching by name unifies both.  [decision #2]
--   • JKKN is one campus: a great ECE prompt should reach ECE learners everywhere, so
--     the strict `institution_id = v_inst` scope is DROPPED.            [decision #2]
-- Adds:
--   • 'global' shelf support — the shared "All JKKN" shelf for learners with no
--     programme; every learner sees it (its builds carry topic_type='global').  [#3]
--   • 1-year retire: a star older than 365 days drops out of the library VIEW, but
--     this is a read-side hide only — graduated_at and the author's credit are
--     untouched, so the author keeps recognition.                          [#4]
-- Unchanged guards: champion-disqualify never surfaces; auto-hide at N distinct
-- learner flags unless a champion cleared it.
--
-- NOTE: this widens visibility of ALREADY-vetted (graded, graduated) stars only. The
-- non-star "classmates' prompts" surface + copy path is PR B, not this migration.

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_topic_graduated_prompts(
  p_topic_type text, p_topic_id uuid, p_limit integer DEFAULT 3)
 RETURNS TABLE(id uuid, assembled_prompt text, score numeric,
               graduated_at timestamp with time zone, used_count bigint)
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

-- secdef-anon gate treats CREATE OR REPLACE as new -> re-assert the lock.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_topic_graduated_prompts(text, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_topic_graduated_prompts(text, uuid, integer) TO authenticated;
