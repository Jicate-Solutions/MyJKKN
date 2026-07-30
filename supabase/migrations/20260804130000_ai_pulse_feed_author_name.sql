-- =============================================================================
-- AI Pulse — classmates feed moderation, PR3: SHOW THE AUTHOR'S NAME
-- Created: 2026-07-30
-- Director decision #4 (verbatim): "SHOW AUTHOR = show the author's name"
-- =============================================================================
-- This REVERSES today's behaviour. The classmates feed is anonymous right now:
-- fn_ai_pulse_topic_peer_prompts returns (id, assembled_prompt, score,
-- used_count) and nothing that identifies who wrote the prompt. After this
-- migration it also returns author_name, and the learner-facing card renders it.
--
-- ⚠️  PRIVACY — FLAGGED, NOT OVERRIDDEN  ⚠️
-- -----------------------------------------------------------------------------
-- This puts learners' REAL NAMES onto campus-wide content. The classmates feed
-- is deliberately cross-institution: it matches the same subject BY NAME across
-- ALL JKKN colleges (no institution scope), so a name shown here is visible to
-- learners at other colleges, not just the author's own classmates.
--
-- The platform serves SCHOOL learners (LKG upward, CBSE), so a meaningful share
-- of the names this exposes belong to MINORS.
--
-- The Director was shown this tradeoff and chose SHOW AUTHOR anyway. This
-- migration implements that decision exactly as given — it is neither softened
-- (no initials, no opt-out, no "same college only" narrowing) nor widened (no
-- roll number, no email, no photo, no profile link; the display name only).
--
-- Compensating controls that already exist and are UNCHANGED here:
--   * the feed is still DARK — prompt_classmates_feed_enabled = false — so
--     merging this changes NOTHING any learner can see today. Turning the feed
--     on is a separate, deliberate flip of that policy row;
--   * the ₹0 AI safety pre-gate (20260804110000): a prompt only reaches the feed
--     after being judged APPROPRIATE, so a name never rides along with content
--     that failed the safety check (`AND b.safety_status = 'passed'`, fail-closed);
--   * a champion's HIDE is immediate and permanent (`disqualified_at IS NULL`);
--   * self-exclusion — a learner never sees their own build in their own feed;
--   * the fn stays SECURITY DEFINER + learner-identity-gated + REVOKEd from anon,
--     so the name is never readable by an unauthenticated caller.
--
-- If the Director later wants this walked back, the rollback is this same
-- DROP+CREATE with the author_name column and the learners_profiles LEFT JOIN
-- removed — plus reverting the TS caller and the card. Nothing else stores a name.
--
-- WHY DROP + CREATE (and not CREATE OR REPLACE)
-- -----------------------------------------------------------------------------
-- Adding author_name CHANGES THE FUNCTION'S RETURN TYPE. Postgres refuses to
-- change a RETURNS TABLE shape via CREATE OR REPLACE ("cannot change return type
-- of existing function"), so the only path is DROP then CREATE. A DROP discards
-- every grant on the function, which is why the REVOKE/GRANT pair below is
-- MANDATORY, not decorative. No CASCADE: if some object unexpectedly depends on
-- this fn, the DROP must fail loudly rather than silently take that object with it.
--
-- BASE = the CUMULATIVE body after PR1 (20260804110000, safety gate) and PR2
-- (20260804120000, auto-hide removed). This migration is a STACKED change on top
-- of both and MUST be applied after them (filename sorts last). The ONLY changes
-- vs PR2's body are the new author_name output column and the LEFT JOIN that
-- feeds it. Every guard is carried over byte-for-byte: learner-identity,
-- prompt_classmates_feed_enabled kill switch, safety_status='passed',
-- 60–79 band, self-exclusion, match-by-NAME across colleges, disqualified_at IS NULL.
--
-- WHY A **LEFT** JOIN: an INNER join to learners_profiles would silently DROP any
-- build whose author row is missing — the classic !inner footgun in this repo.
-- The feed must still show such a prompt, with author_name NULL; the UI renders a
-- neutral "A classmate" fallback for that case.
-- =============================================================================

DROP FUNCTION IF EXISTS public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer);

CREATE FUNCTION public.fn_ai_pulse_topic_peer_prompts(p_topic_type text, p_topic_id uuid, p_limit integer DEFAULT 6)
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
         NULLIF(btrim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS author_name
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

-- MANDATORY after a DROP+CREATE: the DROP discarded every grant, and Supabase's
-- default privileges re-grant anon/authenticated EXECUTE on every newly created
-- function. Re-lock, then grant only the role that should call it.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer) IS
  'AI Pulse classmates feed: non-star peer prompt-builds (score 60-79, safety_status=passed, not disqualified) for the caller''s topics, matched by subject NAME across all colleges. Director decision #4 (2026-07-30) added author_name — the author''s real display name, shown campus-wide. PRIVACY: exposes learner names (including minors''); gated by the prompt_classmates_feed_enabled kill switch, which is OFF.';
