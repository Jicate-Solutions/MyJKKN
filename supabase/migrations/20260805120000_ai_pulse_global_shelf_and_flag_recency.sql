-- ============================================================================
-- AI Pulse — classmates feed moderation, Director decisions #6 and #9
-- Spec: specs/ai-pulse-feed-moderation-decisions-2026-07-30.md (sections 6, 9)
-- Created: 2026-07-30 — NOT APPLIED to any database. Director-gated apply.
--
-- Two independent one-predicate changes to two DIFFERENT read functions:
--
--   #6  fn_ai_pulse_topic_peer_prompts — hide the author's name on the shared
--       'All JKKN' (global) shelf ONLY. Programme and course shelves keep the
--       name. The global shelf has no name filter and no institution filter,
--       so a prompt there reaches the entire platform, and a real
--       school<->college bridge exists in prod (course name 'VALUE EDUCATION'
--       exists in 3 institutions, one of them JKKN Matric Higher Secondary
--       School). The concern is how far a name TRAVELS — decision #7 keeps
--       past learners named, so this is NOT about whose name it is.
--
--   #9  fn_ai_pulse_topic_graduated_prompts — a champion's 'cleared' verdict
--       becomes appealable. report_cleared_at is currently a PERMANENT shield
--       (verified live 2026-07-30): once cleared, the library read ignores
--       flag counts forever. A prompt can read as harmless to an adult and
--       still be an in-joke or a targeted insult learners recognise, so one
--       quick approval must not make learner concern unappealable.
--
-- BOTH bodies are authored from the LIVE definitions read out of prod with
-- pg_get_functiondef on 2026-07-30 (peer md5 dc0a4d9cec1b9ca264df4af87324cc45,
-- graduated md5 d931e57af2996f6be074837adc49dfd1), NOT from any repo file —
-- a CREATE OR REPLACE authored from a stale migration file has silently
-- REVERTED a live gate in this codebase before. Every other line of both
-- bodies is preserved byte-for-byte: the feed kill-switch, the fail-closed
-- safety_status='passed' gate, the 60-79 band, the disqualified_at guard, the
-- duplicate_of canonical-only filter, the 1-year retire window, and the LEFT
-- (never INNER) joins.
--
-- Each replace re-asserts REVOKE ... FROM anon, PUBLIC in this same file:
-- Supabase's ALTER DEFAULT PRIVILEGES re-grants anon EXECUTE on every
-- function it sees created, including a CREATE OR REPLACE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- #6 — peer feed: author_name only off the global shelf
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_topic_peer_prompts(p_topic_type text, p_topic_id uuid, p_limit integer DEFAULT 6)
 RETURNS TABLE(id uuid, assembled_prompt text, score numeric, used_count bigint, author_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner   uuid;
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
  -- Load-bearing for PRIVACY too: while this is false, no learner's name is exposed.
  IF NOT COALESCE((SELECT (value_jsonb)::boolean FROM ai_pulse_policies
                   WHERE config_key = 'prompt_classmates_feed_enabled' AND is_active LIMIT 1), false) THEN
    RETURN;
  END IF;

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
         ), 0) AS used_count,
         -- Director decision #4: the author's display name. NULLIF(btrim(...),'')
         -- so a blank/whitespace-only name arrives as NULL rather than an empty
         -- string the UI would render as a gap.
         -- Director decision #6: on the shared 'All JKKN' (global) shelf the name
         -- is withheld (NULL -> the UI's neutral label), because that shelf has
         -- neither a name filter nor an institution filter, so one prompt reaches
         -- the whole platform. Programme and course shelves are unchanged.
         CASE WHEN p_topic_type = 'global' THEN NULL ELSE NULLIF(btrim(concat_ws(' ', lp.first_name, lp.last_name)), '') END AS author_name
  FROM ai_pulse_prompt_builds b
  LEFT JOIN programs bpr ON b.topic_type = 'programme' AND bpr.id = b.topic_id
  LEFT JOIN courses  bco ON b.topic_type = 'course'    AND bco.id = b.topic_id
  -- LEFT, never INNER: a build whose author row is missing must still appear
  -- (author_name NULL). An INNER join would silently drop it from the feed.
  LEFT JOIN learners_profiles lp ON lp.id = b.learner_id
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
    -- SAFETY GATE (moderation #1, safeguarding minors): show ONLY after the ₹0 AI
    -- safety check judged the prompt APPROPRIATE. Fail-closed — pending/failed/
    -- error/NULL never surface. The grader scores craft; THIS gates content.
    AND b.safety_status = 'passed'
    -- Champion disqualify: a disqualified build NEVER surfaces. This is the
    -- champion's HIDE decision, and (since moderation #3) the ONLY thing that
    -- removes a reported build from the feed.
    AND b.disqualified_at IS NULL
  ORDER BY (b.grade->>'score')::numeric DESC NULLS LAST, b.id
  LIMIT COALESCE(NULLIF(p_limit, 0), 6);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- #9 — star library: flags filed AFTER a clear count again
-- ---------------------------------------------------------------------------
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
    -- Auto-hide: exclude a build with >= threshold DISTINCT learner flags
    -- (UNIQUE(build_id, reporter_profile_id) => distinct reporters).
    -- Director decision #9: report_cleared_at is no longer a PERMANENT shield.
    -- Recency now lives INSIDE the count, so only flags filed AFTER the clear
    -- are counted: a fresh wave returns the prompt to the champion queue, while
    -- flags the champion already dismissed stay dismissed and can never
    -- resurrect a build on their own. Never cleared => every flag counts, as
    -- before.
    AND NOT (
      (
        SELECT count(DISTINCT r.reporter_profile_id)
        FROM ai_pulse_prompt_build_reports r
        WHERE r.build_id = b.id
          AND (b.report_cleared_at IS NULL OR r.created_at > b.report_cleared_at)
      ) >= v_threshold
    )
  ORDER BY (b.grade->>'score')::numeric DESC NULLS LAST, b.graduated_at DESC
  LIMIT COALESCE(NULLIF(p_limit, 0), 3);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_topic_graduated_prompts(text, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_topic_graduated_prompts(text, uuid, integer) TO authenticated;
